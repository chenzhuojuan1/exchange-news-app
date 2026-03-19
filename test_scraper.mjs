import * as cheerio from "cheerio";

const BASE_URL = "https://mondovisione.com/media-and-resources/news/";
const KEYWORDS = [
  "NASDAQ", "NYSE", "SEC", "LSEG", "FCA", "JPX", "Deutsche",
  "TMX", "SGX", "HKEX", "SFC", "KRX", "Saudi", "ADX", "RBI",
  "EURONEXT", "SIX", "DFM", "ESMA", "MAS",
];

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

function matchKeywords(text, keywordList) {
  const kws = keywordList || KEYWORDS;
  const matched = [];
  const upper = text.toUpperCase();
  for (const kw of kws) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(text) || upper.includes(kw.toUpperCase())) {
      matched.push(kw);
    }
  }
  return matched;
}

function isRelevantArticle(title, summary) {
  const combined = `${title} ${summary}`;
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(combined)) return false;
  }
  return true;
}

async function scrapePage(page) {
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
  const articles = [];

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
    const matched = matchKeywords(`${title} ${summary}`);
    
    // Check relevance
    const relevant = isRelevantArticle(title, summary);

    console.log(`\nTitle: ${title.substring(0, 60)}`);
    console.log(`Date: ${publishDate}`);
    console.log(`Keywords matched: ${JSON.stringify(matched)}`);
    console.log(`Relevant: ${relevant}`);
    console.log(`Summary: ${summary.substring(0, 100)}`);
    
    if (matched.length === 0) {
      console.log(`  -> SKIPPED (no keyword match)`);
      return;
    }
    if (!relevant) {
      console.log(`  -> SKIPPED (not relevant)`);
      return;
    }
    
    console.log(`  -> INCLUDED`);
    articles.push({ title, publishDate, url: articleUrl, matched, summary });
  });

  return articles;
}

console.log("=== Testing scraper page 1 ===");
const articles = await scrapePage(1);
console.log(`\n\nTotal articles found: ${articles.length}`);
