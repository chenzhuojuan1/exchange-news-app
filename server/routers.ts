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

// ─── Helper: get yesterday's date range ────────────────────
function getYesterdayRange(): { start: string; end: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return {
      success: false,
      message: "SMTP邮件服务未配置。请在设置中配置SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASS环境变量。",
      emailHtml,
      previewOnly: true,
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort || "465"),
      secure: parseInt(smtpPort || "465") === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpUser,
      to: "chenhzuojuan1@qq.com",
      subject: `境外交易所新闻汇总 (${dateRange.start} ~ ${dateRange.end})`,
      html: emailHtml,
    });

    return { success: true, message: "邮件发送成功", emailHtml };
  } catch (error: any) {
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
  const activeKeywords = await getActiveKeywords();
  const keywordList = activeKeywords.length > 0 ? activeKeywords : KEYWORDS;

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
  const titles = scraped.map((a) => a.title);
  const translations = await translateTitles(titles);

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

// ─── Cron job: daily auto scrape at 08:30 on weekdays ──────
let cronInterval: ReturnType<typeof setInterval> | null = null;

function startDailyCron() {
  if (cronInterval) return; // Already running

  // Check every minute
  cronInterval = setInterval(async () => {
    const now = new Date();
    // Convert to UTC+8 (China Standard Time)
    const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const hours = utc8.getUTCHours();
    const minutes = utc8.getUTCMinutes();
    const dayOfWeek = utc8.getUTCDay(); // 0=Sun, 6=Sat

    // Only run at 08:30 on weekdays (Mon-Fri)
    if (hours === 8 && minutes === 30 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log("[CRON] Triggering daily news scrape at 08:30 CST...");
      try {
        const range = getYesterdayRange();
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
      }
    }
  }, 60 * 1000); // Check every 60 seconds

  console.log("[CRON] Daily auto-scrape scheduled for 08:30 CST on weekdays");
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
    // Get yesterday's news (with weekend logic)
    yesterday: publicProcedure.query(async () => {
      const range = getYesterdayRange();
      const articles = await getNewsByDateRange(range.start, range.end);
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
  // ─── Debug ───────────────────────────────────────────────────
  debug: router({
    envCheck: publicProcedure.query(() => {
      return {
        hasGeminiKey: !!(process.env.GEMINI_API_KEY),
        hasOpenAiKey: !!(process.env.OPENAI_API_KEY),
        hasForgeKey: !!(process.env.BUILT_IN_FORGE_API_KEY),
        geminiKeyPrefix: process.env.GEMINI_API_KEY?.slice(0, 8) ?? "(not set)",
      };
    }),
  }),
  // ─── Report generation ────────────────────────────────────────
  report: router({
    generate: publicProcedure
      .input(
        z.object({
          articleIds: z.array(z.number().int().positive()).min(1).max(20),
        })
      )
      .mutation(async ({ input }) => {
        // 1. Get selected articles from DB
        const articles = await getNewsByIds(input.articleIds);
        if (articles.length === 0) {
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

        // 3. Generate report via LLM
        const report = await generateReport(articlesWithContent);

        return {
          report,
          message: `成功生成报告，包含 ${articles.length} 条新闻`,
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
});

export type AppRouter = typeof appRouter;
