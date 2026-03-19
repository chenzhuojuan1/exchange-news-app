import * as cheerio from "cheerio";
import { invokeLLM } from "./_core/llm";

// ─── Keywords ──────────────────────────────────────────────
export const KEYWORDS = [
  "NASDAQ", "NYSE", "SEC", "LSEG", "FCA", "JPX", "Deutsche",
  "TMX", "SGX", "HKEX", "SFC", "KRX", "Saudi", "ADX", "RBI",
  "EURONEXT", "SIX", "DFM", "ESMA", "MAS",
];

// Patterns for irrelevant news to exclude
const EXCLUDE_PATTERNS = [
  /\bappoint/i, /\bnominat/i, /\bresign/i, /\bretir/i,
  /\bCEO\b/, /\bCFO\b/, /\bCOO\b/, /\bCTO\b/,
  /\bchairman\b/i, /\bchairwoman\b/i, /\bboard of directors\b/i,
  /\bfinancial results\b/i, /\bearnings report\b/i, /\bquarterly results\b/i,
  /\bannual report\b/i, /\brevenue\b/i, /\bprofit\b/i, /\bdividend\b/i,
  /\bshare buyback\b/i, /\bshare repurchase\b/i, /\bstock purchase\b/i,
  /\bacquisition of shares\b/i, /\bequity purchase\b/i,
  /\bkeynote speech\b/i, /\bkeynote address\b/i,
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
  for (const kw of kws) {
    // Use word boundary-like check
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(text) || upper.includes(kw.toUpperCase())) {
      matched.push(kw);
    }
  }
  return matched;
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
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ExchangeNewsBot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page ${page}: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const articles: ScrapedArticle[] = [];

  $("li.hentry").each((_i, el) => {
    const titleEl = $(el).find("h4 a, h3 a");
    const title = titleEl.text().trim();
    const href = titleEl.attr("href") || "";
    const articleUrl = href.startsWith("http")
      ? href
      : `https://mondovisione.com${href}`;

    // Extract date - the date element has format "Date DD/MM/YYYY"
    let publishDate = "";
    const dateEl = $(el).find(".date, .published, time");
    const dateText = dateEl.length > 0 ? dateEl.text().trim() : $(el).text();
    // Extract DD/MM/YYYY pattern from the text
    const dateMatch = dateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      publishDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
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

  for (let page = 1; page <= maxPages; page++) {
    try {
      const pageArticles = await scrapePage(page, keywordList);
      totalScanned += pageArticles.length;

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
        if (startDate && newestOnPage < startDate) break;
      }

      // Small delay between pages
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`Error scraping page ${page}:`, err);
      break;
    }
  }

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
      console.error("Translation error:", err);
      // Fallback: use original titles
      for (const t of batch) {
        result.set(t, t);
      }
    }

    // Small delay between batches
    if (i + batchSize < titles.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return result;
}

// ─── Fetch article full text from original URL ──────────
export async function fetchArticleContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ExchangeNewsBot/1.0)",
      },
    });
    if (!response.ok) return "";
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
    console.error(`Failed to fetch article content from ${url}:`, err);
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

  const systemPrompt = `你是一个专业的境外交易所新闻分析师。请根据提供的新闻原文内容，按照以下要求整理成一份中文报告。

核心要求：
1. 将新闻分为三大类，作为一级标题：
   一、监管动向（政府机构相关新闻，如SEC、FCA、ESMA、MAS、SFC、RBI等监管机构）
   二、市场动态（交易所等市场机构新闻，如NASDAQ、NYSE、LSEG、HKEX、SGX、EURONEXT、JPX等）
   三、金融科技（加密货币、人工智能、数字资产等相关新闻）
   如枟某一类别没有新闻，则不显示该类别。

2. 二级标题为新闻标题，采用（一）（二）（三）等标注。

3. 每条新闻约400字，结构为：标题 + 事件概要（详写）+ 市场评论（如有可添加，如没有可不写）

4. 格式要求：
   - 使用“一是、二是、三是...”表述方式
   - 段首句+论证结构
   - 使用容易理解的语言，符合中文习惯
   - 外国机构名称使用中文，人名使用中文，括号里写英语首字母简写
   - 保留专业术语

5. 新闻内容必须包含：主体、时间、事件、影响，使用原文实例和数据

6. 限制：
   - 仅使用提供的内容，不额外添加数据和评论
   - 不使用bullet points
   - 新闻中不含有“标题”、“正文”和“市场评论”字样

输出格式示例：
一、监管动向

（一）新加坡推行多项资本市场改革以吸引优质企业

新加坡交易所监管公司和金融管理局10月29日宣布多项资本市场改革。一是下调主板公司的盈利测试门槛...二是对未盈利生命科学公司提供贴合行业特点的上市标准...三是优化上市流程...

市场评论认为，改革旨在推动新加坡迈向...

二、市场动态

（一）...

三、金融科技

（一）...`;

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
    console.error("Report generation error:", err);
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
