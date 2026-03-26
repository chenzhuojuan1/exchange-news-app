// ─── RSS Feed Fetcher for FT and Economist ─────────────────
// Fetches and filters news from Financial Times and The Economist RSS feeds
// Topics: stock exchanges, capital market risks, green finance, AI in securities markets

export interface RssArticle {
  title: string;
  description: string;
  url: string;
  publishDate: string; // ISO date string
  source: "ft" | "economist";
  sourceLabel: string;
  matchedTopics: string[];
}

// ─── Topic keywords for filtering ──────────────────────────
// Four main topics as required:
// 1. Stock exchanges / securities exchanges
// 2. Capital market risks
// 3. Green finance / sustainable finance
// 4. AI in securities markets

export const RSS_TOPICS = {
  stock_exchange: {
    label: "证券交易所",
    labelEn: "Stock Exchange",
    keywords: [
      "stock exchange", "securities exchange", "stock market", "equity market",
      "NASDAQ", "NYSE", "LSEG", "London Stock Exchange", "JPX", "Japan Exchange",
      "Deutsche Boerse", "Deutsche Börse", "Euronext", "SGX", "HKEX", "Hong Kong Exchange",
      "KRX", "SIX Exchange", "ASX", "Australian Securities Exchange",
      "Bursa Malaysia", "Warsaw Stock Exchange", "exchange listing",
      "exchange regulation", "market infrastructure", "trading venue",
      "capital markets union", "exchange merger", "exchange acquisition",
      "clearing house", "central counterparty", "CCP", "settlement",
      "market microstructure", "order book", "market maker",
    ],
  },
  capital_market_risk: {
    label: "资本市场风险",
    labelEn: "Capital Market Risk",
    keywords: [
      "capital market risk", "market risk", "systemic risk", "financial risk",
      "market volatility", "market crash", "market correction", "market turmoil",
      "liquidity risk", "credit risk", "counterparty risk", "contagion",
      "financial stability", "financial crisis", "market stress",
      "risk management", "risk regulation", "prudential regulation",
      "Basel", "capital requirement", "stress test", "margin call",
      "short selling", "leverage", "derivatives risk", "options risk",
      "bond market", "yield curve", "interest rate risk", "currency risk",
      "sovereign risk", "emerging market risk", "geopolitical risk",
      "SEC", "FCA", "ESMA", "IOSCO", "FSB", "financial regulation",
      "market manipulation", "insider trading", "fraud",
    ],
  },
  green_finance: {
    label: "绿色金融",
    labelEn: "Green Finance",
    keywords: [
      "green finance", "sustainable finance", "ESG", "climate finance",
      "green bond", "sustainability bond", "social bond", "transition bond",
      "carbon market", "carbon credit", "carbon trading", "emissions trading",
      "net zero", "climate risk", "climate disclosure", "TCFD",
      "sustainable investment", "responsible investment", "impact investing",
      "green taxonomy", "EU taxonomy", "sustainable fund",
      "renewable energy finance", "clean energy investment",
      "biodiversity finance", "nature-based solutions",
      "SFDR", "sustainable reporting", "ISSB", "CSRD",
      "greenwashing", "transition finance", "Paris Agreement",
    ],
  },
  ai_securities: {
    label: "人工智能与证券市场",
    labelEn: "AI in Securities Markets",
    keywords: [
      "artificial intelligence", "machine learning", "AI trading",
      "algorithmic trading", "algo trading", "high-frequency trading", "HFT",
      "AI regulation", "AI in finance", "AI financial", "fintech",
      "robo-advisor", "automated trading", "quantitative trading",
      "AI risk", "AI oversight", "AI governance", "AI compliance",
      "natural language processing", "NLP finance", "large language model",
      "generative AI", "ChatGPT finance", "AI market surveillance",
      "predictive analytics", "data analytics finance",
      "blockchain", "DeFi", "digital asset", "cryptocurrency regulation",
      "tokenization", "digital securities", "crypto exchange",
    ],
  },
};

// ─── RSS Feed URLs ──────────────────────────────────────────
const RSS_FEEDS = [
  // Financial Times
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
  // The Economist
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
];

// ─── Helper: fetch RSS with timeout ────────────────────────
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

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

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

  // Extract all <item> blocks
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemXml = itemMatch[1];

    // Extract title (handle CDATA)
    const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Extract description (handle CDATA)
    const descMatch = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    // Extract link
    const linkMatch = itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const link = linkMatch ? linkMatch[1].trim() : "";

    // Extract pubDate
    const dateMatch = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const pubDate = dateMatch ? dateMatch[1].trim() : "";

    if (title && link) {
      items.push({ title, description, link, pubDate });
    }
  }

  return items;
}

// ─── Format date to YYYY-MM-DD ──────────────────────────────
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

// ─── Match topics ───────────────────────────────────────────
function matchTopics(title: string, description: string): string[] {
  const text = (title + " " + description).toLowerCase();
  const matched: string[] = [];

  for (const [topicKey, topic] of Object.entries(RSS_TOPICS)) {
    for (const keyword of topic.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matched.push(topicKey);
        break; // Only add each topic once
      }
    }
  }

  return matched;
}

// ─── Main: fetch and filter RSS articles ───────────────────
export async function fetchRssNews(
  selectedTopics?: string[],
  maxAgedays = 30
): Promise<{
  articles: RssArticle[];
  errors: string[];
  fetchedAt: string;
}> {
  const errors: string[] = [];
  const allArticles: RssArticle[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgedays);

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

      // Filter by age
      if (new Date(pubDate) < cutoffDate) continue;

      // Match topics
      const matchedTopics = matchTopics(item.title, item.description);

      // Filter by selected topics (if specified)
      if (selectedTopics && selectedTopics.length > 0) {
        const hasMatch = selectedTopics.some((t) => matchedTopics.includes(t));
        if (!hasMatch) continue;
      } else {
        // If no topics selected, only include articles that match at least one topic
        if (matchedTopics.length === 0) continue;
      }

      allArticles.push({
        title: item.title,
        description: item.description,
        url: item.link,
        publishDate: pubDate,
        source: feed.source,
        sourceLabel: feed.sourceLabel,
        matchedTopics,
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

  return {
    articles: deduplicated,
    errors,
    fetchedAt: new Date().toISOString(),
  };
}
