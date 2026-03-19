import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * News articles scraped from Mondo Visione.
 * Stores title, date, URL, Chinese translation, matched keywords, and relevance flag.
 */
export const newsArticles = mysqlTable("news_articles", {
  id: int("id").autoincrement().primaryKey(),
  /** Original English title from the source */
  title: text("title").notNull(),
  /** Display title truncated to 50 chars */
  titleDisplay: varchar("titleDisplay", { length: 200 }),
  /** Chinese translation of the full title */
  titleChinese: text("titleChinese"),
  /** Publication date from the source (YYYY-MM-DD stored as string for easy filtering) */
  publishDate: varchar("publishDate", { length: 10 }).notNull(),
  /** Direct URL to the original article */
  url: varchar("url", { length: 1024 }).notNull().unique(),
  /** Comma-separated matched keywords (e.g. "SEC,NASDAQ") */
  matchedKeywords: text("matchedKeywords").notNull(),
  /** Brief summary/snippet from the source */
  summary: text("summary"),
  /** Whether the article passed relevance filtering */
  isRelevant: int("isRelevant").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NewsArticle = typeof newsArticles.$inferSelect;
export type InsertNewsArticle = typeof newsArticles.$inferInsert;

/**
 * Scrape job log to track scraping history.
 */
/**
 * Keywords table for dynamic keyword management.
 * Stores the keywords used for filtering news articles.
 */
export const keywords = mysqlTable("keywords", {
  id: int("id").autoincrement().primaryKey(),
  /** The keyword string (e.g. "NASDAQ", "NYSE") */
  keyword: varchar("keyword", { length: 100 }).notNull().unique(),
  /** Whether this keyword is currently active */
  isActive: int("isActive").default(1).notNull(),
  /** Keyword type: 'include' = must match, 'exclude' = must not match */
  type: varchar("type", { length: 10 }).default("include").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Keyword = typeof keywords.$inferSelect;
export type InsertKeyword = typeof keywords.$inferInsert;

/**
 * Favorites table for bookmarking important news articles.
 */
export const favorites = mysqlTable("favorites", {
  id: int("id").autoincrement().primaryKey(),
  /** Reference to the news article */
  articleId: int("articleId").notNull(),
  /** Optional note from the user */
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Favorite = typeof favorites.$inferSelect;
export type InsertFavorite = typeof favorites.$inferInsert;

export const scrapeJobs = mysqlTable("scrape_jobs", {
  id: int("id").autoincrement().primaryKey(),
  /** Date range start (YYYY-MM-DD) */
  startDate: varchar("startDate", { length: 10 }).notNull(),
  /** Date range end (YYYY-MM-DD) */
  endDate: varchar("endDate", { length: 10 }).notNull(),
  /** Number of articles found */
  articlesFound: int("articlesFound").default(0).notNull(),
  /** Number of articles after keyword filtering */
  articlesFiltered: int("articlesFiltered").default(0).notNull(),
  /** Job status */
  status: varchar("status", { length: 20 }).default("completed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});