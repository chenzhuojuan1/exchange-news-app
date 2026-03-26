import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { InsertUser, users, newsArticles, scrapeJobs, keywords, favorites, type InsertNewsArticle } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: MySql2Database | null = null;
let _connection: mysql.Connection | null = null;
let _ensuredTables = false;

// Ensure all required tables exist using CREATE TABLE IF NOT EXISTS
async function ensureTables(conn: mysql.Connection): Promise<void> {
  if (_ensuredTables) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS \`users\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`openId\` varchar(64) NOT NULL,
      \`name\` text,
      \`email\` varchar(320),
      \`loginMethod\` varchar(64),
      \`role\` enum('user','admin') NOT NULL DEFAULT 'user',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`lastSignedIn\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`users_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`users_openId_unique\` UNIQUE(\`openId\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`news_articles\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`title\` text NOT NULL,
      \`titleDisplay\` varchar(200),
      \`titleChinese\` text,
      \`publishDate\` varchar(10) NOT NULL,
      \`url\` varchar(1024) NOT NULL,
      \`matchedKeywords\` text NOT NULL,
      \`summary\` text,
      \`isRelevant\` int NOT NULL DEFAULT 1,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`news_articles_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`news_articles_url_unique\` UNIQUE(\`url\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`scrape_jobs\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`startDate\` varchar(10) NOT NULL,
      \`endDate\` varchar(10) NOT NULL,
      \`articlesFound\` int NOT NULL DEFAULT 0,
      \`articlesFiltered\` int NOT NULL DEFAULT 0,
      \`status\` varchar(20) NOT NULL DEFAULT 'completed',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`scrape_jobs_id\` PRIMARY KEY(\`id\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`keywords\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`keyword\` varchar(100) NOT NULL,
      \`isActive\` int NOT NULL DEFAULT 1,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`keywords_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`keywords_keyword_unique\` UNIQUE(\`keyword\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`favorites\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`articleId\` int NOT NULL,
      \`note\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`favorites_id\` PRIMARY KEY(\`id\`)
    )`,
    // Ensure columns added in later migrations exist
    `ALTER TABLE \`scrape_jobs\` ADD COLUMN IF NOT EXISTS \`articlesFiltered\` int NOT NULL DEFAULT 0`,
    `ALTER TABLE \`news_articles\` ADD COLUMN IF NOT EXISTS \`titleDisplay\` varchar(200)`,
    `ALTER TABLE \`news_articles\` ADD COLUMN IF NOT EXISTS \`titleChinese\` text`,
    `ALTER TABLE \`news_articles\` ADD COLUMN IF NOT EXISTS \`summary\` text`,
    `ALTER TABLE \`news_articles\` ADD COLUMN IF NOT EXISTS \`isRelevant\` int NOT NULL DEFAULT 1`,
    `ALTER TABLE \`keywords\` ADD COLUMN IF NOT EXISTS \`isActive\` int NOT NULL DEFAULT 1`,
    `ALTER TABLE \`keywords\` ADD COLUMN IF NOT EXISTS \`type\` varchar(10) NOT NULL DEFAULT 'include'`,
    `ALTER TABLE \`favorites\` ADD COLUMN IF NOT EXISTS \`note\` text`,
    // exclude_rules table: stores user-managed exclude patterns (plain text, not regex)
    `CREATE TABLE IF NOT EXISTS \`exclude_rules\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`pattern\` varchar(200) NOT NULL,
      \`description\` varchar(300),
      \`isBuiltin\` int NOT NULL DEFAULT 0,
      \`isActive\` int NOT NULL DEFAULT 1,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`exclude_rules_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`exclude_rules_pattern_unique\` UNIQUE(\`pattern\`)
    )`
  ];
  for (const stmt of statements) {
    try {
      await conn.execute(stmt);
    } catch (err) {
      console.warn("[Database] Table creation warning:", (err as Error).message);
    }
  }
  _ensuredTables = true;
  console.log("[Database] All tables ensured");
}

// Check if connection is still alive, reconnect if needed
async function ensureConnection(): Promise<mysql.Connection | null> {
  if (_connection) {
    try {
      await _connection.ping();
      return _connection;
    } catch {
      console.warn("[Database] Connection lost, reconnecting...");
      _db = null;
      _connection = null;
    }
  }
  return null;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!process.env.DATABASE_URL) return null;

  // Check existing connection health
  if (_db) {
    const conn = await ensureConnection();
    if (conn) return _db;
    // Connection lost, reset and reconnect below
  }

  try {
    const connection = await mysql.createConnection({
      uri: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
      connectTimeout: 15000,
    });
    _connection = connection;
    _db = drizzle(connection);
    console.log("[Database] Connected successfully");

    // Ensure all tables exist on first connect
    await ensureTables(connection);
  } catch (error) {
    console.warn("[Database] Failed to connect:", error);
    _db = null;
    _connection = null;
  }

  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── News Article Queries ──────────────────────────────────

export async function insertNewsArticle(article: InsertNewsArticle): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(newsArticles).values(article).onDuplicateKeyUpdate({
      set: {
        titleChinese: article.titleChinese,
        matchedKeywords: article.matchedKeywords,
        isRelevant: article.isRelevant,
      },
    });
  } catch (error) {
    console.error("[DB] Failed to insert news article:", error);
  }
}

export async function insertNewsArticles(articles: InsertNewsArticle[]): Promise<number> {
  const db = await getDb();
  if (!db) {
    console.error("[DB] insertNewsArticles: database not available");
    return 0;
  }
  if (articles.length === 0) return 0;

  let inserted = 0;
  for (const article of articles) {
    try {
      await db.insert(newsArticles).values(article).onDuplicateKeyUpdate({
        set: {
          titleChinese: article.titleChinese,
          matchedKeywords: article.matchedKeywords,
          isRelevant: article.isRelevant,
        },
      });
      inserted++;
    } catch (error: any) {
      console.error(`[DB] Insert error for ${article.url?.substring(0, 60)}:`, error.message);
    }
  }
  return inserted;
}

export async function getNewsByDateRange(
  startDate: string,
  endDate: string
): Promise<typeof newsArticles.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select()
      .from(newsArticles)
      .where(
        and(
          gte(newsArticles.publishDate, startDate),
          lte(newsArticles.publishDate, endDate),
          eq(newsArticles.isRelevant, 1)
        )
      )
      .orderBy(desc(newsArticles.publishDate));
  } catch (error) {
    console.warn("[DB] getNewsByDateRange failed:", (error as Error).message);
    return [];
  }
}

export async function getAllNews(
  page = 1,
  pageSize = 20
): Promise<{ items: typeof newsArticles.$inferSelect[]; total: number }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  try {
    const offset = (page - 1) * pageSize;
    const [items, totalResult] = await Promise.all([
      db
        .select()
        .from(newsArticles)
        .where(eq(newsArticles.isRelevant, 1))
        .orderBy(desc(newsArticles.publishDate))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: count() })
        .from(newsArticles)
        .where(eq(newsArticles.isRelevant, 1)),
    ]);
    return { items, total: totalResult[0]?.count || 0 };
  } catch (error) {
    console.warn("[DB] getAllNews failed:", (error as Error).message);
    return { items: [], total: 0 };
  }
}

export async function getNewsStats(): Promise<{
  totalCount: number;
  keywordCounts: Record<string, number>;
  dailyCounts: Array<{ date: string; count: number }>;
  earliestDate: string;
  latestDate: string;
}> {
  const db = await getDb();
  if (!db) return { totalCount: 0, keywordCounts: {}, dailyCounts: [], earliestDate: "", latestDate: "" };

  try {
    const allArticles = await db
      .select({
        publishDate: newsArticles.publishDate,
        matchedKeywords: newsArticles.matchedKeywords,
      })
      .from(newsArticles)
      .where(eq(newsArticles.isRelevant, 1));

    const keywordCounts: Record<string, number> = {};
    const dateCountMap: Record<string, number> = {};
    let earliest = "9999-99-99";
    let latest = "0000-00-00";

    for (const a of allArticles) {
      // Count keywords
      const kws = a.matchedKeywords.split(",").map((k) => k.trim()).filter(Boolean);
      for (const kw of kws) {
        keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
      }
      // Count by date
      dateCountMap[a.publishDate] = (dateCountMap[a.publishDate] || 0) + 1;
      if (a.publishDate < earliest) earliest = a.publishDate;
      if (a.publishDate > latest) latest = a.publishDate;
    }

    const dailyCounts = Object.entries(dateCountMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

    return {
      totalCount: allArticles.length,
      keywordCounts,
      dailyCounts,
      earliestDate: earliest === "9999-99-99" ? "" : earliest,
      latestDate: latest === "0000-00-00" ? "" : latest,
    };
  } catch (error) {
    console.warn("[DB] getNewsStats failed:", (error as Error).message);
    return { totalCount: 0, keywordCounts: {}, dailyCounts: [], earliestDate: "", latestDate: "" };
  }
}

// ─── Get news by IDs (for report generation) ─────────────

export async function getNewsByIds(
  ids: number[]
): Promise<typeof newsArticles.$inferSelect[]> {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  try {
    const { inArray } = await import("drizzle-orm");
    return await db
      .select()
      .from(newsArticles)
      .where(inArray(newsArticles.id, ids))
      .orderBy(desc(newsArticles.publishDate));
  } catch (error) {
    console.warn("[DB] getNewsByIds failed:", (error as Error).message);
    return [];
  }
}

// ─── Keyword Queries ──────────────────────────────────────

export async function getActiveKeywords() {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.execute(
      sql`SELECT keyword FROM \`keywords\` WHERE isActive = 1 AND (\`type\` = 'include' OR \`type\` IS NULL OR \`type\` = '') ORDER BY keyword`
    );
    return (rows[0] as unknown as any[]).map((r: any) => r.keyword as string);
  } catch (error) {
    console.warn("[DB] getActiveKeywords failed, using defaults:", (error as Error).message);
    return [];
  }
}

export async function getAllKeywords() {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(keywords).orderBy(keywords.keyword);
  } catch (error) {
    console.warn("[DB] getAllKeywords failed:", (error as Error).message);
    return [];
  }
}

export async function addKeyword(keyword: string, type: string = 'include'): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.execute(
      sql`INSERT INTO \`keywords\` (\`keyword\`, \`type\`, \`isActive\`) VALUES (${keyword}, ${type}, 1)`
    );
    return true;
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      // Already exists, try to reactivate and update type
      await db.execute(
        sql`UPDATE \`keywords\` SET \`isActive\` = 1, \`type\` = ${type} WHERE \`keyword\` = ${keyword}`
      );
      return true;
    }
    console.error("[DB] Failed to add keyword:", error.message);
    return false;
  }
}

export async function removeKeyword(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(keywords).where(eq(keywords.id, id));
  return true;
}

export async function toggleKeyword(id: number, isActive: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.update(keywords).set({ isActive }).where(eq(keywords.id, id));
  return true;
}

// ─── Exclude Rules Queries ──────────────────────────────

export interface ExcludeRule {
  id: number;
  pattern: string;
  description: string | null;
  isBuiltin: number;
  isActive: number;
  createdAt: Date;
}

// Built-in exclude rules seeded from scraper.ts EXCLUDE_PATTERNS
const BUILTIN_EXCLUDE_RULES: Array<{ pattern: string; description: string }> = [
  { pattern: "appoint",          description: "人事任命（appoint/appoints）" },
  { pattern: "nominat",          description: "提名（nominates/nominated）" },
  { pattern: "resigns",          description: "辞职（resigns/resign）" },
  { pattern: "retirement",       description: "退休（retirement/retiring）" },
  { pattern: "CEO",              description: "首席执行官变动" },
  { pattern: "CFO",              description: "首席财务官变动" },
  { pattern: "COO",              description: "首席运营官变动" },
  { pattern: "CTO",              description: "首席技术官变动" },
  { pattern: "board of directors", description: "董事会相关" },
  { pattern: "financial results",  description: "财务业绩" },
  { pattern: "earnings report",    description: "业绩报告" },
  { pattern: "quarterly results",  description: "季度业绩" },
  { pattern: "annual report",      description: "年报" },
  { pattern: "dividend",           description: "股息" },
  { pattern: "share buyback",      description: "股份回购" },
  { pattern: "share repurchase",   description: "股份回购" },
  { pattern: "stock purchase",     description: "股票购买" },
  { pattern: "acquisition of shares", description: "股权收购" },
  { pattern: "equity purchase",    description: "股权购买" },
  { pattern: "IPO",                description: "新股上市（IPO）" },
  { pattern: "lists on",           description: "个股上市（lists on）" },
  { pattern: "starts trading",     description: "开始交易（starts trading）" },
  { pattern: "admitted to trading", description: "获准交易" },
  { pattern: "new listing",        description: "新上市公司" },
  { pattern: "market debut",       description: "市场首秀" },
  { pattern: "bell ceremony",      description: "敲钟仪式" },
  { pattern: "opening bell",       description: "开市钟" },
  { pattern: "closing bell",       description: "收市钟" },
  { pattern: "weekly report",      description: "每周报告" },
  { pattern: "weekly summary",     description: "每周摘要" },
  { pattern: "scholarship",        description: "奖学金" },
  { pattern: "monthly report",     description: "月度报告" },
  { pattern: "monthly summary",    description: "月度摘要" },
  { pattern: "monthly review",     description: "月度回顾" },
  { pattern: "monthly bulletin",   description: "月度公告" },
  { pattern: "monthly volumes",    description: "月度成交量" },
  { pattern: "monthly headlines",  description: "月度头条" },
  { pattern: "Shanghai Futures Exchange",            description: "上海期货交易所（排除）" },
  { pattern: "Shanghai International Energy Exchange", description: "上海国际能源交易中心（排除）" },
  { pattern: "Shanghai Stock Exchange",              description: "上海证券交易所（排除）" },
  { pattern: "Shenzhen Stock Exchange",              description: "深圳证券交易所（排除）" },
  { pattern: "Beijing Stock Exchange",               description: "北京证券交易所（排除）" },
  { pattern: "Dalian Commodity Exchange",            description: "大连商品交易所（排除）" },
  { pattern: "Zhengzhou Commodity Exchange",         description: "郑州商品交易所（排除）" },
  { pattern: "China Financial Futures Exchange",     description: "中国金融期货交易所（排除）" },
];

// Seed built-in exclude rules into DB on first run
export async function seedBuiltinExcludeRules(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    for (const rule of BUILTIN_EXCLUDE_RULES) {
      await db.execute(
        sql`INSERT IGNORE INTO \`exclude_rules\` (\`pattern\`, \`description\`, \`isBuiltin\`, \`isActive\`)
            VALUES (${rule.pattern}, ${rule.description}, 1, 1)`
      );
    }
    console.log("[DB] Built-in exclude rules seeded");
  } catch (error) {
    console.warn("[DB] seedBuiltinExcludeRules failed:", (error as Error).message);
  }
}

export async function getAllExcludeRules(): Promise<ExcludeRule[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.execute(
      sql`SELECT id, pattern, description, isBuiltin, isActive, createdAt FROM \`exclude_rules\` ORDER BY isBuiltin DESC, pattern ASC`
    );
    return (rows[0] as unknown as any[]).map((r: any) => ({
      id: r.id,
      pattern: r.pattern,
      description: r.description,
      isBuiltin: r.isBuiltin,
      isActive: r.isActive,
      createdAt: r.createdAt,
    }));
  } catch (error) {
    console.warn("[DB] getAllExcludeRules failed:", (error as Error).message);
    return [];
  }
}

export async function getActiveExcludePatterns(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.execute(
      sql`SELECT pattern FROM \`exclude_rules\` WHERE isActive = 1`
    );
    return (rows[0] as unknown as any[]).map((r: any) => r.pattern as string);
  } catch (error) {
    console.warn("[DB] getActiveExcludePatterns failed:", (error as Error).message);
    return [];
  }
}

export async function addExcludeRule(pattern: string, description?: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.execute(
      sql`INSERT INTO \`exclude_rules\` (\`pattern\`, \`description\`, \`isBuiltin\`, \`isActive\`)
          VALUES (${pattern}, ${description || null}, 0, 1)`
    );
    return true;
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      await db.execute(
        sql`UPDATE \`exclude_rules\` SET \`isActive\` = 1 WHERE \`pattern\` = ${pattern}`
      );
      return true;
    }
    console.error("[DB] Failed to add exclude rule:", error.message);
    return false;
  }
}

export async function removeExcludeRule(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  // Only allow deleting non-builtin rules
  await db.execute(sql`DELETE FROM \`exclude_rules\` WHERE id = ${id} AND isBuiltin = 0`);
  return true;
}

export async function toggleExcludeRule(id: number, isActive: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.execute(sql`UPDATE \`exclude_rules\` SET isActive = ${isActive} WHERE id = ${id}`);
  return true;
}

// ─── Favorites Queries ──────────────────────────────────

export async function addFavorite(articleId: number, note?: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    // Check if already favorited
    const existing = await db.select().from(favorites)
      .where(eq(favorites.articleId, articleId)).limit(1);
    if (existing.length > 0) return true; // Already favorited
    await db.insert(favorites).values({ articleId, note: note || null });
    return true;
  } catch (error: any) {
    console.error("[DB] Failed to add favorite:", error.message);
    return false;
  }
}

export async function removeFavorite(articleId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(favorites).where(eq(favorites.articleId, articleId));
  return true;
}

export async function getFavorites(): Promise<Array<typeof newsArticles.$inferSelect & { favoriteId: number; note: string | null; favoritedAt: Date }>> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        id: newsArticles.id,
        title: newsArticles.title,
        titleDisplay: newsArticles.titleDisplay,
        titleChinese: newsArticles.titleChinese,
        publishDate: newsArticles.publishDate,
        url: newsArticles.url,
        matchedKeywords: newsArticles.matchedKeywords,
        summary: newsArticles.summary,
        isRelevant: newsArticles.isRelevant,
        createdAt: newsArticles.createdAt,
        favoriteId: favorites.id,
        note: favorites.note,
        favoritedAt: favorites.createdAt,
      })
      .from(favorites)
      .innerJoin(newsArticles, eq(favorites.articleId, newsArticles.id))
      .orderBy(desc(favorites.createdAt));
    return rows;
  } catch (error) {
    console.warn("[DB] getFavorites failed:", (error as Error).message);
    return [];
  }
}

export async function getFavoriteArticleIds(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.select({ articleId: favorites.articleId }).from(favorites);
    return rows.map(r => r.articleId);
  } catch (error) {
    console.warn("[DB] getFavoriteArticleIds failed:", (error as Error).message);
    return [];
  }
}

// ─── Mark old articles as irrelevant before re-scrape ────

export async function markDateRangeIrrelevant(
  startDate: string,
  endDate: string
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  try {
    const result = await db
      .update(newsArticles)
      .set({ isRelevant: 0 })
      .where(
        and(
          gte(newsArticles.publishDate, startDate),
          lte(newsArticles.publishDate, endDate)
        )
      );
    console.log(`[DB] Marked articles in ${startDate}~${endDate} as irrelevant for re-scrape`);
    return 0; // drizzle mysql doesn't return affected rows easily
  } catch (error) {
    console.warn("[DB] markDateRangeIrrelevant failed:", (error as Error).message);
    return 0;
  }
}

// ─── Scrape Job Queries ──────────────────────────────────

export async function insertScrapeJob(job: {
  startDate: string;
  endDate: string;
  articlesFound: number;
  articlesFiltered: number;
  status: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(scrapeJobs).values(job);
  } catch (error) {
    console.warn("[DB] insertScrapeJob failed:", (error as Error).message);
  }
}

// ─── RSS Keywords Queries ────────────────────────────────────
// Stores per-topic keywords for FT & Economist RSS search.
// Table: rss_keywords (id, topicKey, keyword, isActive, createdAt)

export interface RssKeyword {
  id: number;
  topicKey: string;
  keyword: string;
  isActive: number;
  isBuiltin: number;
  createdAt: Date;
}

// Built-in default RSS keywords (~10 per topic)
const BUILTIN_RSS_KEYWORDS: Array<{ topicKey: string; keyword: string }> = [
  // 证券交易所
  { topicKey: "stock_exchange",      keyword: "stock exchange" },
  { topicKey: "stock_exchange",      keyword: "securities exchange" },
  { topicKey: "stock_exchange",      keyword: "capital markets" },
  { topicKey: "stock_exchange",      keyword: "exchange regulation" },
  { topicKey: "stock_exchange",      keyword: "market infrastructure" },
  { topicKey: "stock_exchange",      keyword: "trading venue" },
  { topicKey: "stock_exchange",      keyword: "exchange listing" },
  { topicKey: "stock_exchange",      keyword: "clearing house" },
  { topicKey: "stock_exchange",      keyword: "market microstructure" },
  { topicKey: "stock_exchange",      keyword: "exchange merger" },
  // 资本市场风险
  { topicKey: "capital_market_risk", keyword: "market risk" },
  { topicKey: "capital_market_risk", keyword: "systemic risk" },
  { topicKey: "capital_market_risk", keyword: "financial stability" },
  { topicKey: "capital_market_risk", keyword: "market volatility" },
  { topicKey: "capital_market_risk", keyword: "liquidity risk" },
  { topicKey: "capital_market_risk", keyword: "credit risk" },
  { topicKey: "capital_market_risk", keyword: "financial regulation" },
  { topicKey: "capital_market_risk", keyword: "stress test" },
  { topicKey: "capital_market_risk", keyword: "capital requirement" },
  { topicKey: "capital_market_risk", keyword: "market surveillance" },
  // 绿色金融
  { topicKey: "green_finance",       keyword: "green finance" },
  { topicKey: "green_finance",       keyword: "sustainable finance" },
  { topicKey: "green_finance",       keyword: "ESG" },
  { topicKey: "green_finance",       keyword: "green bond" },
  { topicKey: "green_finance",       keyword: "carbon market" },
  { topicKey: "green_finance",       keyword: "climate risk" },
  { topicKey: "green_finance",       keyword: "net zero" },
  { topicKey: "green_finance",       keyword: "sustainable investment" },
  { topicKey: "green_finance",       keyword: "climate disclosure" },
  { topicKey: "green_finance",       keyword: "transition finance" },
  // 人工智能与证券市场
  { topicKey: "ai_securities",       keyword: "artificial intelligence" },
  { topicKey: "ai_securities",       keyword: "algorithmic trading" },
  { topicKey: "ai_securities",       keyword: "AI regulation" },
  { topicKey: "ai_securities",       keyword: "machine learning" },
  { topicKey: "ai_securities",       keyword: "fintech" },
  { topicKey: "ai_securities",       keyword: "robo-advisor" },
  { topicKey: "ai_securities",       keyword: "AI in finance" },
  { topicKey: "ai_securities",       keyword: "high-frequency trading" },
  { topicKey: "ai_securities",       keyword: "digital asset" },
  { topicKey: "ai_securities",       keyword: "AI governance" },
];

// Ensure rss_keywords table exists (called from ensureTables)
export async function ensureRssKeywordsTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`rss_keywords\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`topicKey\` varchar(50) NOT NULL,
        \`keyword\` varchar(200) NOT NULL,
        \`isActive\` int NOT NULL DEFAULT 1,
        \`isBuiltin\` int NOT NULL DEFAULT 0,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`rss_keywords_id\` PRIMARY KEY(\`id\`),
        UNIQUE KEY \`rss_keywords_topic_kw\` (\`topicKey\`, \`keyword\`)
      )
    `);
    console.log("[DB] rss_keywords table ensured");
  } catch (err) {
    console.warn("[DB] ensureRssKeywordsTable:", (err as Error).message);
  }
}

// Seed built-in RSS keywords (idempotent)
export async function seedBuiltinRssKeywords(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await ensureRssKeywordsTable();
    for (const row of BUILTIN_RSS_KEYWORDS) {
      await db.execute(
        sql`INSERT IGNORE INTO \`rss_keywords\` (\`topicKey\`, \`keyword\`, \`isBuiltin\`, \`isActive\`)
            VALUES (${row.topicKey}, ${row.keyword}, 1, 1)`
      );
    }
    console.log("[DB] Built-in RSS keywords seeded");
  } catch (err) {
    console.warn("[DB] seedBuiltinRssKeywords failed:", (err as Error).message);
  }
}

// Get all RSS keywords grouped by topic
export async function getAllRssKeywords(): Promise<RssKeyword[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    await ensureRssKeywordsTable();
    const rows = await db.execute(
      sql`SELECT id, topicKey, keyword, isActive, isBuiltin, createdAt
          FROM \`rss_keywords\`
          ORDER BY topicKey ASC, isBuiltin DESC, keyword ASC`
    );
    return (rows[0] as unknown as any[]).map((r: any) => ({
      id: r.id,
      topicKey: r.topicKey,
      keyword: r.keyword,
      isActive: r.isActive,
      isBuiltin: r.isBuiltin,
      createdAt: r.createdAt,
    }));
  } catch (err) {
    console.warn("[DB] getAllRssKeywords failed:", (err as Error).message);
    return [];
  }
}

// Get active keywords per topic as a map { topicKey -> keyword[] }
export async function getActiveRssKeywordMap(): Promise<Record<string, string[]>> {
  const db = await getDb();
  if (!db) return {};
  try {
    await ensureRssKeywordsTable();
    const rows = await db.execute(
      sql`SELECT topicKey, keyword FROM \`rss_keywords\` WHERE isActive = 1`
    );
    const map: Record<string, string[]> = {};
    for (const r of rows[0] as unknown as any[]) {
      if (!map[r.topicKey]) map[r.topicKey] = [];
      map[r.topicKey].push(r.keyword);
    }
    return map;
  } catch (err) {
    console.warn("[DB] getActiveRssKeywordMap failed:", (err as Error).message);
    return {};
  }
}

// Add a custom RSS keyword
export async function addRssKeyword(topicKey: string, keyword: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await ensureRssKeywordsTable();
    await db.execute(
      sql`INSERT INTO \`rss_keywords\` (\`topicKey\`, \`keyword\`, \`isBuiltin\`, \`isActive\`)
          VALUES (${topicKey}, ${keyword}, 0, 1)`
    );
    return true;
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      await db.execute(
        sql`UPDATE \`rss_keywords\` SET \`isActive\` = 1 WHERE \`topicKey\` = ${topicKey} AND \`keyword\` = ${keyword}`
      );
      return true;
    }
    console.error("[DB] addRssKeyword failed:", err.message);
    return false;
  }
}

// Remove a custom RSS keyword (builtin keywords cannot be deleted, only toggled)
export async function removeRssKeyword(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.execute(sql`DELETE FROM \`rss_keywords\` WHERE id = ${id} AND isBuiltin = 0`);
  return true;
}

// Toggle RSS keyword active/inactive
export async function toggleRssKeyword(id: number, isActive: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.execute(sql`UPDATE \`rss_keywords\` SET isActive = ${isActive} WHERE id = ${id}`);
  return true;
}
