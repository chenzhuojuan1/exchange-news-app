import * as cheerio from "cheerio";
import { invokeLLM } from "./_core/llm";

// ─── Keywords ──────────────────────────────────────────────
// ── Short-form keywords (matched with word-boundary) ──────
export const KEYWORDS = [
  "NASDAQ", "NYSE", "SEC", "LSEG", "FCA", "JPX", "Deutsche",
  "TMX", "SGX", "HKEX", "SFC", "KRX", "Saudi", "ADX", "RBI",
  "EURONEXT", "SIX", "DFM", "ESMA", "MAS",
  // ── newly added: only essential missing abbreviations ──
  "SEHK", "CIRO", "IOSCO", "ISDA",
];

// ── Long-form phrases: full names of existing keyword orgs ──
// These ensure articles using full names (not abbreviations) are also caught
const KEYWORD_PHRASES = [
  // Full names for orgs already in KEYWORDS
  "Monetary Authority of Singapore",       // → MAS
  "Securities and Futures Commission",      // → SFC
  "Financial Conduct Authority",            // → FCA
  "Securities and Exchange Commission",     // → SEC
  "Japan Exchange Group",                   // → JPX
  "Hong Kong Exchanges",                    // → HKEX
  "London Stock Exchange",                  // → LSEG
  "Deutsche Boerse",                        // → Deutsche
  "Deutsche Börse",                         // → Deutsche
  // Phrases for newly added orgs
  "Canadian Securities",                    // → CSA (covers CSA Regulators)
  "Canadian Investment Regulatory",         // → CIRO
  // Cross-border / major policy phrases
  "Financial Regulatory Forum",             // major bilateral regulatory events
];

// Patterns for irrelevant news to exclude
// NOTE: removed chairman/chairwoman/keynote — regulatory leaders' speeches are important
const EXCLUDE_PATTERNS = [
  /\bappoints?\b/i, /\bnominat/i, /\bresigns?\b/i, /\bretir(?:es?|ing|ement)\b/i,
  /\bCEO\b/, /\bCFO\b/, /\bCOO\b/, /\bCTO\b/,
  /\bboard of directors\b/i,
  /\bfinancial results\b/i, /\bearnings report\b/i, /\bquarterly results\b/i,
  /\bannual report\b/i, /\bdividend\b/i,
  /\bshare buyback\b/i, /\bshare repurchase\b/i, /\bstock purchase\b/i,
  /\bacquisition of shares\b/i, /\bequity purchase\b/i,
];

const BASE_URL = "https://mondovisione.com/media-and-resources/news/";

export interface ScrapedArticle {
  title: string;
  titleDisplay: string;
  url: string;
  publishDate: string; // YYYY-MM-DD
  summary: string;
  matchedKeywords: string[];
}

// ─── Helper: fetch with timeout and retry ─────────────────
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
  timeoutMs = 30000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...options.headers,
        },
      });
      clearTimeout(timeout);

      if (response.ok) return response;

      // Retry on 5xx server errors
      if (response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        console.warn(`[Scraper] Attempt ${attempt + 1}/${retries} failed for ${url}: ${response.status}`);
      } else {
        // 4xx errors: don't retry
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err: any) {
      lastError = err;
      if (err.name === "AbortError") {
        console.warn(`[Scraper] Attempt ${attempt + 1}/${retries} timed out for ${url}`);
      } else if (err.message?.includes("HTTP 4")) {
        throw err; // Don't retry 4xx
      } else {
        console.warn(`[Scraper] Attempt ${attempt + 1}/${retries} failed for ${url}: ${err.message}`);
      }
    }

    // Wait before retry with exponential backoff
    if (attempt < retries - 1) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

// ─── Parse date from DD/MM/YYYY to YYYY-MM-DD ─────────────
function parseDateDMY(dateStr: string): string {
  const parts = dateStr.trim().split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return dateStr;
}

// ─── Check keyword match ───────────────────────────────────
export function matchKeywords(text: string, keywordList?: string[]): string[] {
  const kws = keywordList || KEYWORDS;
  const matched: string[] = [];
  const upper = text.toUpperCase();

  // 1. Match short-form keywords with word boundary
  for (const kw of kws) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(text) || upper.includes(kw.toUpperCase())) {
      matched.push(kw);
    }
  }

  // 2. Match long-form phrases (case-insensitive substring)
  if (!keywordList) {
    const lower = text.toLowerCase();
    for (const phrase of KEYWORD_PHRASES) {
      if (lower.includes(phrase.toLowerCase())) {
        // Map phrase back to a short label for display
        const label = phraseToLabel(phrase);
        if (!matched.includes(label)) matched.push(label);
      }
    }
  }

  return matched;
}

// Map long phrase to a short display label
function phraseToLabel(phrase: string): string {
  const map: Record<string, string> = {
    "Monetary Authority of Singapore": "MAS",
    "Securities and Futures Commission": "SFC",
    "Financial Conduct Authority": "FCA",
    "Securities and Exchange Commission": "SEC",
    "Canadian Securities": "CSA",
    "Canadian Investment Regulatory": "CIRO",
    "Financial Regulatory Forum": "Regulatory",
    "Japan Exchange Group": "JPX",
    "Hong Kong Exchanges": "HKEX",
    "London Stock Exchange": "LSEG",
    "Deutsche Boerse": "Deutsche",
    "Deutsche Börse": "Deutsche",
  };
  return map[phrase] || phrase;
}

// ─── Check if article is relevant ──────────────────────────
export function isRelevantArticle(title: string, summary: string): boolean {
  const combined = `${title} ${summary}`;
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(combined)) return false;
  }
  return true;
}

// ─── Scrape a single page ──────────────────────────────────
async function scrapePage(page: number, keywordList?: string[]): Promise<ScrapedArticle[]> {
  const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;

  const response = await fetchWithRetry(url);
  const html = await response.text();
  const $ = cheerio.load(html);
  const articles: ScrapedArticle[] = [];

  $("li.hentry").each((_i, el) => {
    const titleEl = $(el).find("h4 a, h3 a, .entry-title a");
    const title = titleEl.text().trim();
    const href = titleEl.attr("href") || "";
    const articleUrl = href.startsWith("http")
      ? href
      : `https://mondovisione.com${href}`;

    // Extract date - look for abbr.published or date pattern in text
    let publishDate = "";
    const abbrEl = $(el).find("abbr.published");
    if (abbrEl.length > 0) {
      const titleAttr = abbrEl.attr("title") || abbrEl.text();
      const dateMatch = titleAttr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (dateMatch) {
        const [, day, month, year] = dateMatch;
        publishDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }

    // Fallback: search for date pattern in the full element text
    if (!publishDate) {
      const dateEl = $(el).find(".date, .published, time");
      const dateText = dateEl.length > 0 ? dateEl.text().trim() : $(el).text();
      const dateMatch = dateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (dateMatch) {
        const [, day, month, year] = dateMatch;
        publishDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }

    // Extract summary - skip the date paragraph, get the actual content paragraph
    let summary = "";
    $(el).find("p").each((_j, pEl) => {
      const pText = $(pEl).text().trim();
      // Skip date paragraphs
      if (pText.startsWith("Date ") && /\d{1,2}\/\d{1,2}\/\d{4}/.test(pText)) return;
      if (!summary && pText.length > 10) {
        summary = pText;
      }
    });

    // Also try entry-summary class
    if (!summary) {
      const summaryEl = $(el).find(".entry-summary");
      if (summaryEl.length > 0) {
        summary = summaryEl.text().trim();
      }
    }

    if (!title || !articleUrl) return;

    // Check keyword match
    const matched = matchKeywords(`${title} ${summary}`, keywordList);
    if (matched.length === 0) return;

    // Check relevance
    if (!isRelevantArticle(title, summary)) return;

    const titleDisplay = title.length > 50 ? title.substring(0, 47) + "..." : title;

    articles.push({
      title,
      titleDisplay,
      url: articleUrl,
      publishDate,
      summary: summary.substring(0, 500),
      matchedKeywords: matched,
    });
  });

  return articles;
}

// ─── Scrape multiple pages with date filtering ─────────────
export async function scrapeNews(
  startDate?: string,
  endDate?: string,
  maxPages = 10,
  keywordList?: string[]
): Promise<{ articles: ScrapedArticle[]; totalScanned: number }> {
  const articles: ScrapedArticle[] = [];
  let totalScanned = 0;
  const seenUrls = new Set<string>();
  let consecutiveErrors = 0;

  console.log(`[Scraper] Starting scrape: startDate=${startDate}, endDate=${endDate}, maxPages=${maxPages}`);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const pageArticles = await scrapePage(page, keywordList);
      totalScanned += pageArticles.length;
      consecutiveErrors = 0; // Reset on success

      let allTooOld = false;

      for (const article of pageArticles) {
        if (seenUrls.has(article.url)) continue;
        seenUrls.add(article.url);

        // Date filtering
        if (startDate && article.publishDate < startDate) {
          allTooOld = true;
          continue;
        }
        if (endDate && article.publishDate > endDate) {
          continue;
        }

        articles.push(article);
      }

      // If all articles on this page are older than startDate, stop
      if (allTooOld && pageArticles.length > 0) {
        const newestOnPage = pageArticles[0]?.publishDate || "";
        if (startDate && newestOnPage < startDate) {
          console.log(`[Scraper] Stopping at page ${page}: all articles older than ${startDate}`);
          break;
        }
      }

      // Small delay between pages to be polite
      await new Promise((r) => setTimeout(r, 800));
    } catch (err: any) {
      consecutiveErrors++;
      console.error(`[Scraper] Error scraping page ${page}:`, err.message);

      // Only stop after 3 consecutive errors (not on first failure)
      if (consecutiveErrors >= 3) {
        console.error(`[Scraper] Stopping after ${consecutiveErrors} consecutive errors`);
        break;
      }

      // Wait longer before retrying next page
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`[Scraper] Scrape complete: ${articles.length} articles found, ${totalScanned} total scanned`);
  return { articles, totalScanned };
}

// ─── Translate titles using LLM ────────────────────────────
export async function translateTitles(
  titles: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (titles.length === 0) return result;

  // Batch translate in groups of 10
  const batchSize = 10;
  for (let i = 0; i < titles.length; i += batchSize) {
    const batch = titles.slice(i, i + batchSize);
    const numberedList = batch.map((t, idx) => `${idx + 1}. ${t}`).join("\n");

    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "你是一个专业的金融新闻翻译助手。请将以下英文新闻标题翻译成简洁准确的中文。每行一个翻译，保持编号格式。只输出翻译结果，不要添加任何解释。",
          },
          {
            role: "user",
            content: numberedList,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (typeof content === "string") {
        const lines = content.trim().split("\n");
        for (const line of lines) {
          const match = line.match(/^(\d+)\.\s*(.+)/);
          if (match) {
            const idx = parseInt(match[1], 10) - 1;
            if (idx >= 0 && idx < batch.length) {
              result.set(batch[idx], match[2].trim());
            }
          }
        }
      }
    } catch (err) {
      console.error("[Scraper] Translation error:", err);
      // Fallback: use original titles
      for (const t of batch) {
        result.set(t, t);
      }
    }

    // Small delay between batches
    if (i + batchSize < titles.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return result;
}

// ─── Fetch article full text from original URL ──────────
export async function fetchArticleContent(url: string): Promise<string> {
  try {
    const response = await fetchWithRetry(url, {}, 2, 20000);
    const html = await response.text();
    const $ = cheerio.load(html);
    // Try common article content selectors
    let content = "";
    const selectors = [
      "article", ".entry-content", ".article-content", ".post-content",
      ".content", "#content", ".body", ".text", "main",
    ];
    for (const sel of selectors) {
      const el = $(sel);
      if (el.length > 0) {
        content = el.text().trim();
        if (content.length > 200) break;
      }
    }
    if (!content || content.length < 200) {
      // Fallback: get all paragraph text
      const paragraphs: string[] = [];
      $("p").each((_i, el) => {
        const t = $(el).text().trim();
        if (t.length > 30) paragraphs.push(t);
      });
      content = paragraphs.join("\n\n");
    }
    // Limit to ~5000 chars to avoid token overflow
    return content.substring(0, 5000);
  } catch (err) {
    console.error(`[Scraper] Failed to fetch article content from ${url}:`, err);
    return "";
  }
}

// ─── Generate structured report using LLM ───────────────
export async function generateReport(
  articles: Array<{
    title: string;
    titleChinese: string | null;
    publishDate: string;
    url: string;
    matchedKeywords: string;
    fullContent: string;
  }>
): Promise<string> {
  if (articles.length === 0) return "";

  // Build article summaries for LLM
  const articleTexts = articles.map((a, i) => {
    return `===新闻${i + 1}===\n标题: ${a.title}\n中文标题: ${a.titleChinese || ""}\n日期: ${a.publishDate}\n关键词: ${a.matchedKeywords}\n原文链接: ${a.url}\n原文内容:\n${a.fullContent}\n`;
  }).join("\n");

  const systemPrompt = `你是一个专业的境外交易所新闻分析师。请严格按照以下要求将提供的新闻原文内容整理成一份中文报告。

【分类规则】
将新闻划分为以下三大类，作为一级标题：
一、监管动向——政府机构、监管机构的新闻（如美国证券交易委员会（SEC）、英国金融行为监管局（FCA）、欧洲证券和市场管理局（ESMA）、新加坡金融管理局（MAS）、香港证券及期货事务监察委员会（SFC）、印度储备银行（RBI）等）
二、市场动态——交易所等市场机构的新闻（如纳斯达克（NASDAQ）、纽约证券交易所（NYSE）、伦敦证券交易所集团（LSEG）、香港交易所（HKEX）、新加坡交易所（SGX）、泛欧交易所（EURONEXT）、日本交易所集团（JPX）、德意志交易所（Deutsche Boerse）等）
三、金融科技——加密货币、人工智能、数字资产、区块链等相关新闻
如果某一类别没有对应新闻，则不显示该类别。

【标题格式】
一级标题用"一、""二、""三、"标注。
二级标题为每条新闻的中文标题，用（一）（二）（三）等标注。

【每条新闻写作要求】
1. 字数：每条新闻约400字。
2. 结构：新闻标题后直接写事件概要（详写），如原文中有市场评论则在最后自然衔接，如没有则不写。
3. 表述方式：使用"一是、二是、三是..."的递进表述方式，每个要点以段首句开头，后接论证内容。
4. 语言风格：使用容易理解的语言，符合中文阅读习惯。外国机构名称翻译为中文，括号内注明英文缩写；外国人名翻译为中文，括号内注明英文原名。保留必要的专业术语。
5. 内容要素：每条新闻必须包含主体（谁）、时间（何时）、事件（做了什么）、影响（有什么意义），必须使用原文中的实例和数据。
6. 严格限制：
   - 仅使用提供的新闻内容，不额外添加数据、评论或推测
   - 不使用bullet points（项目符号列表）
   - 正文中不出现"标题""正文""市场评论"等元描述字样
   - 市场评论如有，以"市场评论认为"等自然过渡句引出，不单独标注

【参考示例】
一、监管动向

（一）新加坡推行多项资本市场改革以吸引优质企业

新加坡交易所监管公司和金融管理局（MAS）10月29日宣布多项资本市场改革。一是下调主板公司的盈利测试门槛，将最近一年的合并税前利润从3000万元下调至1000万元。二是对未盈利生命科学公司提供贴合行业特点的上市标准，将上市申请人的经营记录从三年减至两年，并要求至少一款产品进入后期临床试验阶段。三是将主板公司的最低市值要求从1.5亿新元提高至3亿新元，以确保上市公司具备足够的市场影响力和流动性。四是将凯利板公司的最低市值要求从4000万新元提高至1亿新元。五是对季度报告实行差异化管理，仅要求市值低于3亿新元的主板公司和所有凯利板公司进行季度报告，以减轻大型公司的合规负担。六是允许双重股权结构（DCS）公司纳入海峡时报指数，以增强市场的多样性和吸引力。

市场评论认为，改革旨在推动新加坡迈向"与主要发达市场一致"的、更以信息披露为基础的监管制度。

请严格按照上述要求和格式输出报告。`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `请根据以下${articles.length}条新闻原文内容，整理成一份中文报告：\n\n${articleTexts}` },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (typeof content === "string") {
      return content.trim();
    }
    return "报告生成失败，请重试";
  } catch (err) {
    console.error("[Scraper] Report generation error:", err);
    return "报告生成失败，请重试";
  }
}

// ─── Generate email HTML ───────────────────────────────────
export function generateEmailHtml(
  articles: Array<{
    title: string;
    titleChinese: string | null;
    publishDate: string;
    url: string;
    matchedKeywords: string;
  }>,
  dateRange?: { start: string; end: string }
): string {
  const dateLabel = dateRange
    ? `${dateRange.start} 至 ${dateRange.end}`
    : "最新";

  const rows = articles
    .map(
      (a) => `
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:12px 8px;">
        <a href="${a.url}" style="color:#1a56db;text-decoration:none;font-weight:600;">${a.title}</a>
        <br/>
        <span style="color:#666;font-size:13px;">${a.titleChinese || ""}</span>
      </td>
      <td style="padding:12px 8px;white-space:nowrap;color:#666;font-size:13px;">${a.publishDate}</td>
      <td style="padding:12px 8px;">
        ${a.matchedKeywords
          .split(",")
          .map((k) => `<span style="background:#e8f0fe;color:#1a56db;padding:2px 8px;border-radius:12px;font-size:12px;margin-right:4px;">${k}</span>`)
          .join("")}
      </td>
    </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;">
  <h1 style="color:#1e3a5f;border-bottom:3px solid #1a56db;padding-bottom:12px;">境外交易所新闻汇总</h1>
  <p style="color:#666;">日期范围：${dateLabel} | 共 ${articles.length} 条新闻</p>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#f8fafc;">
        <th style="padding:10px 8px;text-align:left;">标题 / 翻译</th>
        <th style="padding:10px 8px;text-align:left;">日期</th>
        <th style="padding:10px 8px;text-align:left;">关键词</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="color:#999;font-size:12px;margin-top:20px;">
    数据来源：<a href="https://mondovisione.com/media-and-resources/news/">Mondo Visione News Centre</a>
  </p>
</body>
</html>`;
}
