import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  getNewsByDateRange,
  getAllNews,
  getNewsStats,
  insertNewsArticles,
  insertScrapeJob,
  getActiveKeywords,
  getAllKeywords,
  addKeyword,
  removeKeyword,
  toggleKeyword,
  getNewsByIds,
  addFavorite,
  removeFavorite,
  getFavorites,
  getFavoriteArticleIds,
  markDateRangeIrrelevant,
} from "./db";
import {
  scrapeNews,
  translateTitles,
  generateEmailHtml,
  fetchArticleContent,
  generateReport,
  KEYWORDS,
} from "./scraper";
import nodemailer from "nodemailer";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { ENV } from "./_core/env";

// ─── Helper: get yesterday's date range ────────────────────
function getYesterdayRange(): { start: string; end: string } {
  const now = new Date();
  // Convert to UTC+8
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = new Date(utc8.getUTCFullYear(), utc8.getUTCMonth(), utc8.getUTCDate());
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...

  let startDate: Date;
  let endDate: Date;

  if (dayOfWeek === 1) {
    // Monday: include Sat + Sun
    startDate = new Date(today);
    startDate.setDate(today.getDate() - 2); // Saturday
    endDate = new Date(today);
    endDate.setDate(today.getDate() - 1); // Sunday
  } else if (dayOfWeek === 0) {
    // Sunday: show Friday + Saturday
    startDate = new Date(today);
    startDate.setDate(today.getDate() - 2); // Friday
    endDate = new Date(today);
    endDate.setDate(today.getDate() - 1); // Saturday
  } else {
    // Tue-Sat: show previous day
    startDate = new Date(today);
    startDate.setDate(today.getDate() - 1);
    endDate = new Date(startDate);
  }

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return { start: fmt(startDate), end: fmt(endDate) };
}

// ─── Helper: send email via SMTP ───────────────────────────
async function sendNewsEmail(
  articles: Array<{
    title: string;
    titleChinese: string | null;
    publishDate: string;
    url: string;
    matchedKeywords: string;
  }>,
  dateRange: { start: string; end: string }
): Promise<{ success: boolean; message: string; emailHtml: string; previewOnly?: boolean }> {
  const emailHtml = generateEmailHtml(articles, dateRange);

  if (articles.length === 0) {
    return { success: false, message: "该日期范围内无新闻数据", emailHtml };
  }

  // Read SMTP config from ENV (centralized)
  const smtpHost = ENV.smtpHost;
  const smtpPort = ENV.smtpPort;
  const smtpUser = ENV.smtpUser;
  const smtpPass = ENV.smtpPass;
  const emailTo = ENV.emailTo;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return {
      success: false,
      message: "SMTP邮件服务未配置。请在Render环境变量中配置SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASS。",
      emailHtml,
      previewOnly: true,
    };
  }

  if (!emailTo) {
    return {
      success: false,
      message: "收件人未配置。请在Render环境变量中配置EMAIL_TO（多个收件人用逗号分隔）。",
      emailHtml,
      previewOnly: true,
    };
  }

  try {
    const port = parseInt(smtpPort || "465");
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
      // Connection timeout settings
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    await transporter.sendMail({
      from: smtpUser,
      to: emailTo,
      subject: `境外交易所新闻汇总 (${dateRange.start} ~ ${dateRange.end})`,
      html: emailHtml,
    });

    return { success: true, message: `邮件发送成功，已发送至 ${emailTo}`, emailHtml };
  } catch (error: any) {
    console.error("[Email] Send failed:", error);
    return {
      success: false,
      message: `邮件发送失败: ${error.message}`,
      emailHtml,
      previewOnly: true,
    };
  }
}

// ─── Helper: perform scrape and store ──────────────────────
async function performScrape(
  startDate?: string,
  endDate?: string,
  maxPages = 10
): Promise<{
  message: string;
  articlesFound: number;
  articlesFiltered: number;
  articlesInserted: number;
}> {
  // Get active keywords from database
  let keywordList: string[];
  try {
    const activeKeywords = await getActiveKeywords();
    keywordList = activeKeywords.length > 0 ? activeKeywords : KEYWORDS;
  } catch {
    keywordList = KEYWORDS;
  }

  // Mark old articles in this date range as irrelevant before re-scraping
  // They will be re-activated (isRelevant=1) via upsert if they match new filters
  if (startDate && endDate) {
    await markDateRangeIrrelevant(startDate, endDate);
  }

  const { articles: scraped, totalScanned } = await scrapeNews(
    startDate,
    endDate,
    maxPages,
    keywordList
  );

  if (scraped.length === 0) {
    return {
      message: "当前无新增交易所新闻",
      articlesFound: totalScanned,
      articlesFiltered: 0,
      articlesInserted: 0,
    };
  }

  // Translate titles
  let translations = new Map<string, string>();
  try {
    const titles = scraped.map((a) => a.title);
    translations = await translateTitles(titles);
  } catch (err) {
    console.error("[Scrape] Translation failed, continuing without translations:", err);
  }

  // Insert into database
  const dbArticles = scraped.map((a) => ({
    title: a.title,
    titleDisplay: a.titleDisplay,
    titleChinese: translations.get(a.title) || null,
    publishDate: a.publishDate,
    url: a.url,
    matchedKeywords: a.matchedKeywords.join(","),
    summary: a.summary,
    isRelevant: 1,
  }));

  const inserted = await insertNewsArticles(dbArticles);

  // Log scrape job
  await insertScrapeJob({
    startDate: startDate || "auto",
    endDate: endDate || "auto",
    articlesFound: totalScanned,
    articlesFiltered: scraped.length,
    status: "completed",
  });

  return {
    message: `成功抓取 ${scraped.length} 条新闻，入库 ${inserted} 条`,
    articlesFound: totalScanned,
    articlesFiltered: scraped.length,
    articlesInserted: inserted,
  };
}

// ─── Startup auto-scrape: check and backfill yesterday's news ──
let _startupScrapeCompleted = false;

async function startupAutoScrape() {
  if (_startupScrapeCompleted) return;
  _startupScrapeCompleted = true;

  // Wait a few seconds for DB to be ready
  await new Promise((r) => setTimeout(r, 5000));

  try {
    const range = getYesterdayRange();
    console.log(`[Startup] Checking if yesterday's news exists (${range.start} ~ ${range.end})...`);

    const existing = await getNewsByDateRange(range.start, range.end);
    if (existing.length > 0) {
      console.log(`[Startup] Yesterday's news already exists (${existing.length} articles), skipping auto-scrape`);
      return;
    }

    console.log("[Startup] No yesterday's news found, triggering auto-scrape...");
    const result = await performScrape(range.start, range.end, 15);
    console.log(`[Startup] Auto-scrape completed: ${result.message}`);

    // Auto send email after startup scrape
    if (result.articlesInserted > 0) {
      try {
        const articles = await getNewsByDateRange(range.start, range.end);
        const emailResult = await sendNewsEmail(
          articles.map((a) => ({
            title: a.title,
            titleChinese: a.titleChinese,
            publishDate: a.publishDate,
            url: a.url,
            matchedKeywords: a.matchedKeywords,
          })),
          range
        );
        console.log(`[Startup] Email: ${emailResult.message}`);
      } catch (emailErr) {
        console.error("[Startup] Email send failed:", emailErr);
      }
    }
  } catch (err) {
    console.error("[Startup] Auto-scrape failed:", err);
  }
}

// Trigger startup scrape (non-blocking)
startupAutoScrape();

// ─── Cron job: daily auto scrape ──────────────────────────
// Improved: check every 5 minutes, trigger at 08:00-08:59 if not yet scraped today
let cronInterval: ReturnType<typeof setInterval> | null = null;
let _lastCronScrapeDate = ""; // Track last scrape date to avoid duplicates

function startDailyCron() {
  if (cronInterval) return; // Already running

  // Check every 5 minutes (more resilient than every 1 minute)
  cronInterval = setInterval(async () => {
    const now = new Date();
    // Convert to UTC+8 (China Standard Time)
    const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const hours = utc8.getUTCHours();
    const dayOfWeek = utc8.getUTCDay(); // 0=Sun, 6=Sat
    const todayStr = `${utc8.getUTCFullYear()}-${String(utc8.getUTCMonth() + 1).padStart(2, "0")}-${String(utc8.getUTCDate()).padStart(2, "0")}`;

    // Run between 08:00-09:59 on weekdays, but only once per day
    if (hours >= 8 && hours <= 9 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      if (_lastCronScrapeDate === todayStr) return; // Already scraped today
      _lastCronScrapeDate = todayStr;

      console.log(`[CRON] Triggering daily news scrape at ${hours}:${String(utc8.getUTCMinutes()).padStart(2, "0")} CST...`);
      try {
        const range = getYesterdayRange();

        // Check if already have data
        const existing = await getNewsByDateRange(range.start, range.end);
        if (existing.length > 0) {
          console.log(`[CRON] Yesterday's news already exists (${existing.length} articles), skipping`);
          return;
        }

        const result = await performScrape(range.start, range.end, 15);
        console.log(`[CRON] Scrape completed: ${result.message}`);

        // Auto send email after scrape
        if (result.articlesInserted > 0) {
          const articles = await getNewsByDateRange(range.start, range.end);
          const emailResult = await sendNewsEmail(
            articles.map((a) => ({
              title: a.title,
              titleChinese: a.titleChinese,
              publishDate: a.publishDate,
              url: a.url,
              matchedKeywords: a.matchedKeywords,
            })),
            range
          );
          console.log(`[CRON] Email: ${emailResult.message}`);
        }
      } catch (err) {
        console.error("[CRON] Daily scrape failed:", err);
        // Reset so it can retry next interval
        _lastCronScrapeDate = "";
      }
    }
  }, 5 * 60 * 1000); // Check every 5 minutes

  console.log("[CRON] Daily auto-scrape scheduled for 08:00-09:59 CST on weekdays");
}

// Start cron on server boot
startDailyCron();

// ─── Router ────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  news: router({
    // Get yesterday's news (with weekend logic) - AUTO SCRAPE IF EMPTY
    yesterday: publicProcedure.query(async () => {
      const range = getYesterdayRange();
      let articles = await getNewsByDateRange(range.start, range.end);

      // KEY FIX: If no articles found, auto-trigger scrape
      if (articles.length === 0) {
        console.log(`[Yesterday] No articles found for ${range.start}~${range.end}, auto-scraping...`);
        try {
          const result = await performScrape(range.start, range.end, 15);
          console.log(`[Yesterday] Auto-scrape: ${result.message}`);
          if (result.articlesInserted > 0) {
            articles = await getNewsByDateRange(range.start, range.end);
          }
        } catch (err) {
          console.error("[Yesterday] Auto-scrape failed:", err);
        }
      }

      return { articles, dateRange: range };
    }),

    // Get news by date range - auto scrape if empty
    byDateRange: publicProcedure
      .input(
        z.object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          autoScrape: z.boolean().optional().default(false),
        })
      )
      .query(async ({ input }) => {
        let articles = await getNewsByDateRange(input.startDate, input.endDate);
        let scraped = false;
        if (articles.length === 0 && input.autoScrape) {
          // Auto-trigger scrape for this date range
          const result = await performScrape(input.startDate, input.endDate, 30);
          if (result.articlesInserted > 0) {
            articles = await getNewsByDateRange(input.startDate, input.endDate);
            scraped = true;
          }
        }
        return { articles, dateRange: { start: input.startDate, end: input.endDate }, scraped };
      }),

    // Get all news with pagination
    all: publicProcedure
      .input(
        z.object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(20),
        }).optional()
      )
      .query(async ({ input }) => {
        const page = input?.page ?? 1;
        const pageSize = input?.pageSize ?? 20;
        return getAllNews(page, pageSize);
      }),

    // Get statistics
    stats: publicProcedure.query(async () => {
      return getNewsStats();
    }),

    // Trigger manual scrape
    scrape: publicProcedure
      .input(
        z.object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          maxPages: z.number().int().min(1).max(50).default(10),
        }).optional()
      )
      .mutation(async ({ input }) => {
        return performScrape(input?.startDate, input?.endDate, input?.maxPages ?? 10);
      }),

    // Send email with news
    sendEmail: publicProcedure
      .input(
        z.object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
      )
      .mutation(async ({ input }) => {
        const articles = await getNewsByDateRange(input.startDate, input.endDate);
        return sendNewsEmail(
          articles.map((a) => ({
            title: a.title,
            titleChinese: a.titleChinese,
            publishDate: a.publishDate,
            url: a.url,
            matchedKeywords: a.matchedKeywords,
          })),
          { start: input.startDate, end: input.endDate }
        );
      }),

    // Get email preview HTML
    emailPreview: publicProcedure
      .input(
        z.object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
      )
      .query(async ({ input }) => {
        const articles = await getNewsByDateRange(input.startDate, input.endDate);
        const emailHtml = generateEmailHtml(
          articles.map((a) => ({
            title: a.title,
            titleChinese: a.titleChinese,
            publishDate: a.publishDate,
            url: a.url,
            matchedKeywords: a.matchedKeywords,
          })),
          { start: input.startDate, end: input.endDate }
        );
        return { html: emailHtml, articleCount: articles.length };
      }),
  }),

  // ─── Report generation ────────────────────────────────────────
  report: router({
    // Export raw full-text content from original URLs (for review or use with other LLMs)
    exportRaw: publicProcedure
      .input(
        z.object({
          articleIds: z.array(z.number().int().positive()).min(1).max(50),
        })
      )
      .mutation(async ({ input }) => {
        // 1. Get selected articles from DB
        const articles = await getNewsByIds(input.articleIds);
        if (articles.length === 0) {
          return { rawContent: "", message: "未找到选中的新闻", articleCount: 0 };
        }

        // 2. Fetch full content from original URLs (parallel, max 5 concurrent)
        const articlesWithContent: Array<{
          title: string;
          publishDate: string;
          url: string;
          matchedKeywords: string;
          fullContent: string;
        }> = [];
        const batchSize = 5;
        for (let i = 0; i < articles.length; i += batchSize) {
          const batch = articles.slice(i, i + batchSize);
          const contents = await Promise.all(
            batch.map((a) => fetchArticleContent(a.url))
          );
          for (let j = 0; j < batch.length; j++) {
            articlesWithContent.push({
              title: batch[j].title,
              publishDate: batch[j].publishDate,
              url: batch[j].url,
              matchedKeywords: batch[j].matchedKeywords,
              fullContent: contents[j] || batch[j].summary || "",
            });
          }
        }

        // 3. Build plain text output
        const rawContent = articlesWithContent.map((a, i) => {
          return [
            `========== 新闻 ${i + 1} / ${articlesWithContent.length} ==========`,
            `标题: ${a.title}`,
            `日期: ${a.publishDate}`,
            `关键词: ${a.matchedKeywords}`,
            `原文链接: ${a.url}`,
            ``,
            a.fullContent,
            ``,
          ].join("\n");
        }).join("\n");

        return {
          rawContent,
          message: `成功导出 ${articles.length} 条新闻原始内容`,
          articleCount: articles.length,
        };
      }),

    generate: publicProcedure
      .input(
        z.object({
          articleIds: z.array(z.number().int().positive()).min(1).max(20),
          extraContent: z.string().max(50000).optional(),
        })
      )
      .mutation(async ({ input }) => {
        // 1. Get selected articles from DB
        const articles = await getNewsByIds(input.articleIds);
        if (articles.length === 0 && !input.extraContent) {
          return { report: "", message: "未找到选中的新闻" };
        }

        // 2. Fetch full content from original URLs (parallel, max 5 concurrent)
        const articlesWithContent = [];
        const batchSize = 5;
        for (let i = 0; i < articles.length; i += batchSize) {
          const batch = articles.slice(i, i + batchSize);
          const contents = await Promise.all(
            batch.map((a) => fetchArticleContent(a.url))
          );
          for (let j = 0; j < batch.length; j++) {
            articlesWithContent.push({
              title: batch[j].title,
              titleChinese: batch[j].titleChinese,
              publishDate: batch[j].publishDate,
              url: batch[j].url,
              matchedKeywords: batch[j].matchedKeywords,
              fullContent: contents[j] || batch[j].summary || "",
            });
          }
        }

        // 3. Generate report via LLM (include extra content if provided)
        const report = await generateReport(articlesWithContent, input.extraContent);

        return {
          report,
          message: `成功生成报告，包含 ${articles.length} 条新闻${input.extraContent ? " + 补充材料" : ""}`,
          articleCount: articles.length,
        };
      }),
  }),

  // ─── Favorites ─────────────────────────────────────────────────
  favorite: router({
    list: publicProcedure.query(async () => {
      return getFavorites();
    }),

    ids: publicProcedure.query(async () => {
      return getFavoriteArticleIds();
    }),

    add: publicProcedure
      .input(z.object({ articleId: z.number().int().positive(), note: z.string().optional() }))
      .mutation(async ({ input }) => {
        const success = await addFavorite(input.articleId, input.note);
        return { success, message: success ? "已收藏" : "收藏失败" };
      }),

    remove: publicProcedure
      .input(z.object({ articleId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const success = await removeFavorite(input.articleId);
        return { success, message: success ? "已取消收藏" : "取消失败" };
      }),
  }),

  // ─── Word export ───────────────────────────────────────────────
  export: router({
    word: publicProcedure
      .input(z.object({ reportMarkdown: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const lines = input.reportMarkdown.split("\n");
        const children: Paragraph[] = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
            continue;
          }

          // H1: # or 一、二、三、
          if (trimmed.startsWith("# ") || /^─/.test(trimmed)) {
            children.push(new Paragraph({
              text: trimmed.replace(/^#+\s*/, ""),
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 300, after: 200 },
            }));
            continue;
          }

          // H2: ## or （一）（二）
          if (trimmed.startsWith("## ")) {
            children.push(new Paragraph({
              text: trimmed.replace(/^#+\s*/, ""),
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 150 },
            }));
            continue;
          }

          // H3: ###
          if (trimmed.startsWith("### ")) {
            children.push(new Paragraph({
              text: trimmed.replace(/^#+\s*/, ""),
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 150, after: 100 },
            }));
            continue;
          }

          // Bold text handling: **text**
          const parts: TextRun[] = [];
          const boldRegex = /\*\*(.+?)\*\*/g;
          let lastIndex = 0;
          let match;
          while ((match = boldRegex.exec(trimmed)) !== null) {
            if (match.index > lastIndex) {
              parts.push(new TextRun({ text: trimmed.slice(lastIndex, match.index), size: 22 }));
            }
            parts.push(new TextRun({ text: match[1], bold: true, size: 22 }));
            lastIndex = match.index + match[0].length;
          }
          if (lastIndex < trimmed.length) {
            parts.push(new TextRun({ text: trimmed.slice(lastIndex), size: 22 }));
          }

          children.push(new Paragraph({
            children: parts.length > 0 ? parts : [new TextRun({ text: trimmed, size: 22 })],
            spacing: { after: 120 },
            alignment: AlignmentType.JUSTIFIED,
          }));
        }

        const doc = new Document({
          sections: [{
            properties: {},
            children,
          }],
        });

        const buffer = await Packer.toBuffer(doc);
        const base64 = Buffer.from(buffer).toString("base64");
        return { base64, filename: `境外交易所新闻报告_${new Date().toISOString().slice(0, 10)}.docx` };
      }),
  }),

  // ─── Keyword management ────────────────────────────────────────
  keyword: router({
    // List all keywords (including inactive)
    list: publicProcedure.query(async () => {
      return getAllKeywords();
    }),

    // Get only active keywords
    active: publicProcedure.query(async () => {
      const kws = await getActiveKeywords();
      return kws.length > 0 ? kws : KEYWORDS;
    }),

    // Add a new keyword
    add: publicProcedure
      .input(z.object({ keyword: z.string().min(1).max(100) }))
      .mutation(async ({ input }) => {
        const success = await addKeyword(input.keyword.trim());
        return { success, message: success ? "关键词添加成功" : "关键词添加失败" };
      }),

    // Remove a keyword
    remove: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const success = await removeKeyword(input.id);
        return { success, message: success ? "关键词已删除" : "删除失败" };
      }),

    // Toggle keyword active/inactive
    toggle: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        isActive: z.number().int().min(0).max(1),
      }))
      .mutation(async ({ input }) => {
        const success = await toggleKeyword(input.id, input.isActive);
        return { success };
      }),
  }),

  // ─── Debug / health check ──────────────────────────────────────
  debug: router({
    envCheck: publicProcedure.query(() => {
      return {
        hasDatabase: !!process.env.DATABASE_URL,
        hasSmtp: !!(ENV.smtpHost && ENV.smtpUser && ENV.smtpPass),
        hasEmailTo: !!ENV.emailTo,
        hasForgeApiKey: !!ENV.forgeApiKey,
        hasGeminiApiKey: !!ENV.geminiApiKey,
        smtpHost: ENV.smtpHost ? `${ENV.smtpHost.substring(0, 10)}...` : "未配置",
        emailTo: ENV.emailTo ? `${ENV.emailTo.substring(0, 15)}...` : "未配置",
        nodeEnv: process.env.NODE_ENV || "development",
        startupScrapeCompleted: _startupScrapeCompleted,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
