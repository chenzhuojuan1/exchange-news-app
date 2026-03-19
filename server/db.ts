import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, newsArticles, scrapeJobs, keywords, favorites, type InsertNewsArticle } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
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
  return db
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
}

export async function getAllNews(
  page = 1,
  pageSize = 20
): Promise<{ items: typeof newsArticles.$inferSelect[]; total: number }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
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
}

// ─── Get news by IDs (for report generation) ─────────────

export async function getNewsByIds(
  ids: number[]
): Promise<typeof newsArticles.$inferSelect[]> {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  const { inArray } = await import("drizzle-orm");
  return db
    .select()
    .from(newsArticles)
    .where(inArray(newsArticles.id, ids))
    .orderBy(desc(newsArticles.publishDate));
}

// ─── Keyword Queries ──────────────────────────────────────

export async function getActiveKeywords(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ keyword: keywords.keyword })
    .from(keywords)
    .where(eq(keywords.isActive, 1))
    .orderBy(keywords.keyword);
  return rows.map(r => r.keyword);
}

export async function getAllKeywords() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(keywords).orderBy(keywords.keyword);
}

export async function addKeyword(keyword: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.insert(keywords).values({ keyword });
    return true;
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      // Already exists, try to reactivate
      await db.update(keywords).set({ isActive: 1 }).where(eq(keywords.keyword, keyword));
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
}

export async function getFavoriteArticleIds(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ articleId: favorites.articleId }).from(favorites);
  return rows.map(r => r.articleId);
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
  await db.insert(scrapeJobs).values(job);
}
