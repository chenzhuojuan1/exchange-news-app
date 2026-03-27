// ─── RSS Feed Fetcher for FT and Economist ─────────────────
// Fetches and filters news from Financial Times and The Economist RSS feeds
// Four topics: stock exchanges, capital market risks, green finance, AI in securities

import { invokeLLM } from "./_core/llm";

export interface RssArticle {
  title: string;
  titleChinese?: string; // Chinese translation of the title
  description: string;
  url: string;
  publishDate: string; // YYYY-MM-DD
  source: "ft" | "economist" | "bloomberg";
  sourceLabel: string;
  matchedTopics: string[];
  matchedKeywords: string[];
}

// ─── Default keywords: updated based on actual FT/Economist/Bloomberg coverage ──
// These are the built-in defaults; users can add/remove via the UI.
export const DEFAULT_RSS_KEYWORDS: Record<string, string[]> = {
  stock_exchange: [
    "bond market",
    "stock market",
    "Wall Street",
    "asset class",
    "hedge fund",
    "IPO",
    "sovereign",
    "private credit",
    "Treasury",
    "financial market",
  ],
  capital_market_risk: [
    "energy shock",
    "inflation",
    "recession",
    "Fed",
    "ECB",
    "CRISIS",
    "sell-off",
    "volatility",
    "market crash",
    "OECD",
    "WFE",
    "IOSCO",
    "IMF",
  ],
  green_finance: [
    "green policy",
    "green investment",
    "ESG",
    "climate",
    "renewable energy",
    "carbon",
    "net zero",
    "clean energy",
    "fossil fuel",
    "energy transition",
  ],
  ai_securities: [
    "artificial intelligence",
    "AI",
    "stablecoin",
    "algorithmic trading",
    "high-frequency trading",
    "tokenisation",
    "fintech",
    "digital currency",
    "blockchain",
    "machine learning",
  ],
};

// ─── Topic metadata ─────────────────────────────────────────
export const RSS_TOPIC_META: Record<string, { label: string; labelEn: string }> = {
  stock_exchange:      { label: "证券交易所",         labelEn: "Stock Exchange" },
  capital_market_risk: { label: "资本市场风险",       labelEn: "Capital Market Risk" },
  green_finance:       { label: "绿色金融",           labelEn: "Green Finance" },
  ai_securities:       { label: "人工智能与证券市场", labelEn: "AI in Securities Markets" },
};

// ─── RSS Feed URLs ──────────────────────────────────────────
const RSS_FEEDS = [
  {
    url: "https://www.ft.com/rss/home/international",
    source: "ft" as const,
    sourceLabel: "Financial Times",
    requiresUserAgent: true,
  },
  {
    url: "https://www.ft.com/markets?format=rss",
    source: "ft" as const,
    sourceLabel: "Financial Times - Markets",
    requiresUserAgent: true,
  },
  {
    url: "https://www.economist.com/finance-and-economics/rss.xml",
    source: "economist" as const,
    sourceLabel: "The Economist - Finance",
    requiresUserAgent: false,
  },
  {
    url: "https://www.economist.com/business/rss.xml",
    source: "economist" as const,
    sourceLabel: "The Economist - Business",
    requiresUserAgent: false,
  },
  {
    url: "https://www.economist.com/science-and-technology/rss.xml",
    source: "economist" as const,
    sourceLabel: "The Economist - Science & Technology",
    requiresUserAgent: false,
  },
  {
    url: "https://feeds.bloomberg.com/markets/news.rss",
    source: "bloomberg" as const,
    sourceLabel: "Bloomberg - Markets",
    requiresUserAgent: false,
  },
];

// ─── Fetch RSS with timeout ─────────────────────────────────
async function fetchRss(url: string, requiresUserAgent = false): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const headers: Record<string, string> = {
      Accept: "application/rss+xml, application/xml, text/xml, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    };
    if (requiresUserAgent) {
      headers["User-Agent"] =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Parse RSS XML ──────────────────────────────────────────
function parseRssItems(xml: string): Array<{
  title: string;
  description: string;
  link: string;
  pubDate: string;
}> {
  const items: Array<{ title: string; description: string; link: string; pubDate: string }> = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemXml = itemMatch[1];
    const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";
    const descMatch = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    const linkMatch = itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const link = linkMatch ? linkMatch[1].trim() : "";
    const dateMatch = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const pubDate = dateMatch ? dateMatch[1].trim() : "";
    if (title && link) items.push({ title, description, link, pubDate });
  }
  return items;
}

// ─── Format date ────────────────────────────────────────────
function formatPubDate(pubDate: string): string {
  if (!pubDate) return new Date().toISOString().split("T")[0];
  try {
    const d = new Date(pubDate);
    if (isNaN(d.getTime())) return new Date().toISOString().split("T")[0];
    return d.toISOString().split("T")[0];
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

// ─── Match topics using per-topic keyword lists ─────────────
function matchTopics(
  title: string,
  description: string,
  topicKeywords: Record<string, string[]>
): { topics: string[]; keywords: string[] } {
  const text = (title + " " + description).toLowerCase();
  const matchedTopics: string[] = [];
  const matchedKeywords: string[] = [];

  for (const [topicKey, kwList] of Object.entries(topicKeywords)) {
    for (const kw of kwList) {
      if (text.includes(kw.toLowerCase())) {
        if (!matchedTopics.includes(topicKey)) matchedTopics.push(topicKey);
        if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
      }
    }
  }
  return { topics: matchedTopics, keywords: matchedKeywords };
}

// ─── Main: fetch and filter RSS articles ───────────────────
export async function fetchRssNews(
  selectedTopics?: string[],
  maxAgeDays = 30,
  customKeywords?: Record<string, string[]>,
  dateRange?: { start: string; end: string }
): Promise<{
  articles: RssArticle[];
  errors: string[];
  fetchedAt: string;
}> {
  const errors: string[] = [];
  const allArticles: RssArticle[] = [];
  // Use precise date range if provided, otherwise fall back to maxAgeDays
  let startDateStr: string | null = null;
  let endDateStr: string | null = null;
  const cutoffDate = new Date();
  if (dateRange) {
    startDateStr = dateRange.start;
    endDateStr = dateRange.end;
    // Set cutoff to start of the date range
    cutoffDate.setTime(new Date(dateRange.start + "T00:00:00Z").getTime());
  } else {
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
  }

  // Merge default + custom keywords per topic
  const topicKeywords: Record<string, string[]> = {};
  for (const topicKey of Object.keys(DEFAULT_RSS_KEYWORDS)) {
    const defaults = DEFAULT_RSS_KEYWORDS[topicKey] || [];
    const custom = customKeywords?.[topicKey] || [];
    // Combine and deduplicate
    const combined = [...new Set([...defaults, ...custom].map((k) => k.toLowerCase()))];
    topicKeywords[topicKey] = combined;
  }

  // If selectedTopics specified, only use those topics
  const activeTopics = selectedTopics && selectedTopics.length > 0
    ? selectedTopics
    : Object.keys(topicKeywords);

  const activeTopicKeywords: Record<string, string[]> = {};
  for (const t of activeTopics) {
    if (topicKeywords[t]) activeTopicKeywords[t] = topicKeywords[t];
  }

  // Fetch all feeds in parallel
  const feedResults = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const xml = await fetchRss(feed.url, feed.requiresUserAgent);
      const items = parseRssItems(xml);
      return { feed, items };
    })
  );

  for (const result of feedResults) {
    if (result.status === "rejected") {
      errors.push(`Feed fetch failed: ${result.reason?.message || "Unknown error"}`);
      continue;
    }
    const { feed, items } = result.value;
    for (const item of items) {
      const pubDate = formatPubDate(item.pubDate);
      if (new Date(pubDate) < cutoffDate) continue;
      // If precise date range is provided, also check upper bound
      if (endDateStr && pubDate > endDateStr) continue;
      if (startDateStr && pubDate < startDateStr) continue;
      const { topics, keywords } = matchTopics(item.title, item.description, activeTopicKeywords);
      if (topics.length === 0) continue;
      allArticles.push({
        title: item.title,
        description: item.description,
        url: item.link,
        publishDate: pubDate,
        source: feed.source,
        sourceLabel: feed.sourceLabel,
        matchedTopics: topics,
        matchedKeywords: keywords,
      });
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduplicated = allArticles.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  // Sort by date descending
  deduplicated.sort((a, b) => b.publishDate.localeCompare(a.publishDate));

  return { articles: deduplicated, errors, fetchedAt: new Date().toISOString() };
}

// ─── Translate RSS article titles to Chinese ──────────────
export async function translateRssArticles(
  articles: RssArticle[]
): Promise<RssArticle[]> {
  if (articles.length === 0) return articles;

  const batchSize = 10;
  const translated = [...articles];

  for (let i = 0; i < translated.length; i += batchSize) {
    const batch = translated.slice(i, i + batchSize);
    const numberedList = batch.map((a, idx) => `${idx + 1}. ${a.title}`).join("\n");

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
              translated[i + idx] = { ...translated[i + idx], titleChinese: match[2].trim() };
            }
          }
        }
      }
    } catch (err) {
      console.error("[RSS] Translation error:", err);
      // On failure, leave titleChinese undefined
    }

    // Small delay between batches
    if (i + batchSize < translated.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return translated;
}
