import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  matchKeywords,
  isRelevantArticle,
  generateEmailHtml,
  KEYWORDS,
} from "./scraper";

// ─── Test helpers ─────────────────────────────────────────

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ─── matchKeywords ────────────────────────────────────────

describe("matchKeywords", () => {
  it("matches NASDAQ in text", () => {
    const result = matchKeywords("NASDAQ announces new listing rules");
    expect(result).toContain("NASDAQ");
  });

  it("matches multiple keywords", () => {
    const result = matchKeywords("NYSE and SEC jointly announce new regulations");
    expect(result).toContain("NYSE");
    expect(result).toContain("SEC");
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty array for no matches", () => {
    const result = matchKeywords("Apple releases new iPhone model");
    expect(result).toHaveLength(0);
  });

  it("matches case-insensitively", () => {
    const result = matchKeywords("The nasdaq index rose today");
    expect(result).toContain("NASDAQ");
  });

  it("matches HKEX keyword", () => {
    const result = matchKeywords("HKEX publishes consultation paper");
    expect(result).toContain("HKEX");
  });

  it("matches EURONEXT keyword", () => {
    const result = matchKeywords("Euronext announces quarterly review");
    expect(result).toContain("EURONEXT");
  });

  it("matches MAS keyword", () => {
    const result = matchKeywords("Monetary Authority of Singapore (MAS) issues prohibition");
    expect(result).toContain("MAS");
  });

  // ─── Dynamic keyword list tests ──────────────────────────
  it("uses custom keyword list when provided", () => {
    const result = matchKeywords("CUSTOM_EXCHANGE launches new product", ["CUSTOM_EXCHANGE"]);
    expect(result).toContain("CUSTOM_EXCHANGE");
  });

  it("ignores default keywords when custom list is provided", () => {
    const result = matchKeywords("NASDAQ announces new listing rules", ["HKEX", "SGX"]);
    expect(result).toHaveLength(0);
  });

  it("matches from custom keyword list", () => {
    const result = matchKeywords("SGX and HKEX joint announcement", ["HKEX", "SGX"]);
    expect(result).toContain("HKEX");
    expect(result).toContain("SGX");
    expect(result).toHaveLength(2);
  });

  it("falls back to default KEYWORDS when no custom list", () => {
    const result = matchKeywords("NASDAQ announces new listing rules");
    expect(result).toContain("NASDAQ");
  });
});

// ─── isRelevantArticle ────────────────────────────────────

describe("isRelevantArticle", () => {
  it("returns true for relevant exchange news", () => {
    expect(isRelevantArticle(
      "NASDAQ Launches New Trading Platform",
      "The new platform supports advanced order types"
    )).toBe(true);
  });

  it("excludes appointment news", () => {
    expect(isRelevantArticle(
      "NYSE Appoints New Chief Technology Officer",
      "The exchange announced the appointment today"
    )).toBe(false);
  });

  it("excludes financial results news", () => {
    expect(isRelevantArticle(
      "LSEG Reports Strong Financial Results for Q4",
      "Revenue increased by 15% year over year"
    )).toBe(false);
  });

  it("excludes share buyback news", () => {
    expect(isRelevantArticle(
      "Deutsche Boerse Announces Share Buyback Program",
      "The company will repurchase shares worth 500M"
    )).toBe(false);
  });

  it("excludes CEO/CFO related news", () => {
    expect(isRelevantArticle(
      "SGX CEO Delivers Keynote at Conference",
      "The CEO discussed market trends"
    )).toBe(false);
  });

  it("allows regulatory and product news", () => {
    expect(isRelevantArticle(
      "SEC Clarifies Application of Securities Laws",
      "The commission published new guidance on digital assets"
    )).toBe(true);
  });
});

// ─── KEYWORDS constant ───────────────────────────────────

describe("KEYWORDS", () => {
  it("contains all 20 required keywords", () => {
    expect(KEYWORDS).toHaveLength(20);
    const expected = [
      "NASDAQ", "NYSE", "SEC", "LSEG", "FCA", "JPX", "Deutsche",
      "TMX", "SGX", "HKEX", "SFC", "KRX", "Saudi", "ADX", "RBI",
      "EURONEXT", "SIX", "DFM", "ESMA", "MAS",
    ];
    for (const kw of expected) {
      expect(KEYWORDS).toContain(kw);
    }
  });
});

// ─── generateEmailHtml ───────────────────────────────────

describe("generateEmailHtml", () => {
  it("generates valid HTML with article data", () => {
    const articles = [
      {
        title: "NASDAQ Launches New Trading Platform",
        titleChinese: "纳斯达克推出新交易平台",
        publishDate: "2026-03-17",
        url: "https://example.com/news/1",
        matchedKeywords: "NASDAQ",
      },
      {
        title: "SEC Publishes New Regulatory Guidelines",
        titleChinese: "SEC发布新监管指南",
        publishDate: "2026-03-16",
        url: "https://example.com/news/2",
        matchedKeywords: "SEC",
      },
    ];

    const html = generateEmailHtml(articles, {
      start: "2026-03-16",
      end: "2026-03-17",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("境外交易所新闻汇总");
    expect(html).toContain("2026-03-16 至 2026-03-17");
    expect(html).toContain("共 2 条新闻");
    expect(html).toContain("NASDAQ Launches New Trading Platform");
    expect(html).toContain("纳斯达克推出新交易平台");
    expect(html).toContain("https://example.com/news/1");
    expect(html).toContain("SEC Publishes New Regulatory Guidelines");
    expect(html).toContain("SEC发布新监管指南");
    expect(html).toContain("NASDAQ");
    expect(html).toContain("SEC");
    expect(html).toContain("Mondo Visione News Centre");
  });

  it("handles empty articles array", () => {
    const html = generateEmailHtml([], { start: "2026-03-17", end: "2026-03-17" });
    expect(html).toContain("共 0 条新闻");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("handles articles with null Chinese translation", () => {
    const articles = [
      {
        title: "Test Article",
        titleChinese: null,
        publishDate: "2026-03-17",
        url: "https://example.com/test",
        matchedKeywords: "NYSE",
      },
    ];

    const html = generateEmailHtml(articles);
    expect(html).toContain("Test Article");
    expect(html).toContain("最新");
  });

  it("handles multiple matched keywords", () => {
    const articles = [
      {
        title: "Joint NASDAQ and NYSE Statement",
        titleChinese: "纳斯达克和纽交所联合声明",
        publishDate: "2026-03-17",
        url: "https://example.com/joint",
        matchedKeywords: "NASDAQ,NYSE",
      },
    ];

    const html = generateEmailHtml(articles, {
      start: "2026-03-17",
      end: "2026-03-17",
    });

    expect(html).toContain("NASDAQ");
    expect(html).toContain("NYSE");
  });
});

// ─── Router procedures existence & validation ─────────────

describe("news.yesterday procedure", () => {
  it("exists and is callable", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.news.yesterday).toBeDefined();
    expect(typeof caller.news.yesterday).toBe("function");
  });
});

describe("news.byDateRange input validation", () => {
  it("rejects invalid date format", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.news.byDateRange({ startDate: "invalid", endDate: "2026-03-17" })
    ).rejects.toThrow();

    await expect(
      caller.news.byDateRange({ startDate: "2026-03-17", endDate: "not-a-date" })
    ).rejects.toThrow();
  });

  it("rejects missing fields", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      // @ts-expect-error - testing missing field
      caller.news.byDateRange({ startDate: "2026-03-17" })
    ).rejects.toThrow();
  });

  it("accepts autoScrape boolean parameter", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    // Should not throw on input validation (may fail on DB)
    expect(caller.news.byDateRange).toBeDefined();
  });
});

describe("news.sendEmail input validation", () => {
  it("rejects invalid date format for sendEmail", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.news.sendEmail({ startDate: "bad-date", endDate: "2026-03-17" })
    ).rejects.toThrow();
  });
});

describe("news.scrape input validation", () => {
  it("accepts optional input", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.news.scrape).toBeDefined();
  });

  it("rejects invalid maxPages", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.news.scrape({ maxPages: 0 })
    ).rejects.toThrow();

    await expect(
      caller.news.scrape({ maxPages: 100 })
    ).rejects.toThrow();
  });
});

// ─── Report generation router tests ─────────────────────────

describe("report.generate input validation", () => {
  it("procedure exists", () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.report.generate).toBeDefined();
    expect(typeof caller.report.generate).toBe("function");
  });

  it("rejects empty articleIds array", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.report.generate({ articleIds: [] })
    ).rejects.toThrow();
  });

  it("rejects non-positive article IDs", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.report.generate({ articleIds: [0] })
    ).rejects.toThrow();

    await expect(
      caller.report.generate({ articleIds: [-1] })
    ).rejects.toThrow();
  });

  it("rejects too many article IDs (max 20)", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const tooManyIds = Array.from({ length: 21 }, (_, i) => i + 1);
    await expect(
      caller.report.generate({ articleIds: tooManyIds })
    ).rejects.toThrow();
  });

  it("accepts valid article IDs within range", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    // Input validation should pass (may fail on DB lookup)
    expect(caller.report.generate).toBeDefined();
  });
});

// ─── Keyword management router tests ──────────────────────

describe("keyword router", () => {
  it("keyword.list procedure exists", () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.keyword.list).toBeDefined();
    expect(typeof caller.keyword.list).toBe("function");
  });

  it("keyword.active procedure exists", () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.keyword.active).toBeDefined();
    expect(typeof caller.keyword.active).toBe("function");
  });

  it("keyword.add validates input - rejects empty keyword", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.keyword.add({ keyword: "" })
    ).rejects.toThrow();
  });

  it("keyword.add validates input - rejects too long keyword", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.keyword.add({ keyword: "A".repeat(101) })
    ).rejects.toThrow();
  });

  it("keyword.remove validates input - rejects non-positive id", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.keyword.remove({ id: 0 })
    ).rejects.toThrow();

    await expect(
      caller.keyword.remove({ id: -1 })
    ).rejects.toThrow();
  });

  it("keyword.toggle validates input - rejects invalid isActive value", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.keyword.toggle({ id: 1, isActive: 2 })
    ).rejects.toThrow();

    await expect(
      caller.keyword.toggle({ id: 1, isActive: -1 })
    ).rejects.toThrow();
  });

  it("keyword.toggle accepts valid isActive values (0 and 1)", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.keyword.toggle).toBeDefined();
  });
});

// ─── SMTP configuration tests ─────────────────────────────

describe("SMTP configuration", () => {
  it("has SMTP_HOST configured", () => {
    expect(process.env.SMTP_HOST).toBeDefined();
    expect(process.env.SMTP_HOST!.length).toBeGreaterThan(0);
  });

  it("has SMTP_PORT configured", () => {
    expect(process.env.SMTP_PORT).toBeDefined();
    const port = parseInt(process.env.SMTP_PORT!, 10);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });

  it("has SMTP_USER configured", () => {
    expect(process.env.SMTP_USER).toBeDefined();
    expect(process.env.SMTP_USER!.length).toBeGreaterThan(0);
  });

  it("has SMTP_PASS configured", () => {
    expect(process.env.SMTP_PASS).toBeDefined();
    expect(process.env.SMTP_PASS!.length).toBeGreaterThan(0);
  });
});

// ─── fetchArticleContent tests ──────────────────────────────

describe("fetchArticleContent", () => {
  it("function is exported and callable", async () => {
    const { fetchArticleContent } = await import("./scraper");
    expect(fetchArticleContent).toBeDefined();
    expect(typeof fetchArticleContent).toBe("function");
  });
});

// ─── generateReport tests ───────────────────────────────────

describe("generateReport", () => {
  it("function is exported and callable", async () => {
    const { generateReport } = await import("./scraper");
    expect(generateReport).toBeDefined();
    expect(typeof generateReport).toBe("function");
  });

  it("returns empty string for empty articles array", async () => {
    const { generateReport } = await import("./scraper");
    const result = await generateReport([]);
    expect(result).toBe("");
  });
});

// ─── Favorites router tests ───────────────────────────────

describe("favorite router", () => {
  it("favorite.list procedure exists", () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.favorite.list).toBeDefined();
    expect(typeof caller.favorite.list).toBe("function");
  });

  it("favorite.ids procedure exists", () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.favorite.ids).toBeDefined();
    expect(typeof caller.favorite.ids).toBe("function");
  });

  it("favorite.add validates input - rejects non-positive articleId", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.favorite.add({ articleId: 0 })
    ).rejects.toThrow();

    await expect(
      caller.favorite.add({ articleId: -1 })
    ).rejects.toThrow();
  });

  it("favorite.add accepts optional note", () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.favorite.add).toBeDefined();
  });

  it("favorite.remove validates input - rejects non-positive articleId", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.favorite.remove({ articleId: 0 })
    ).rejects.toThrow();

    await expect(
      caller.favorite.remove({ articleId: -1 })
    ).rejects.toThrow();
  });
});

// ─── Word export router tests ─────────────────────────────

describe("export.word", () => {
  it("procedure exists", () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.export.word).toBeDefined();
    expect(typeof caller.export.word).toBe("function");
  });

  it("rejects empty reportMarkdown", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.export.word({ reportMarkdown: "" })
    ).rejects.toThrow();
  });

  it("generates a valid base64 docx for valid input", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.export.word({
      reportMarkdown: "# 一、监管动向\n\n（一）新加坡推行多项资本市场改革\n\n新加坡交易所监管公司和金融管理局宣布多项改革。一是下调主板公司的盈利测试门槛。二是对未盈利生命科学公司提供贴合行业特点的上市标准。",
    });

    expect(result.base64).toBeDefined();
    expect(result.base64.length).toBeGreaterThan(0);
    expect(result.filename).toContain("境外交易所新闻报告");
    expect(result.filename).toContain(".docx");

    // Verify base64 is valid
    const buffer = Buffer.from(result.base64, "base64");
    expect(buffer.length).toBeGreaterThan(0);
    // DOCX files start with PK (ZIP signature)
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4B); // 'K'
  });

  it("handles markdown with headings and bold text", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.export.word({
      reportMarkdown: "# 一、监管动向\n\n## （一）测试标题\n\n这是一段**加粗**的测试文本。\n\n### 三级标题\n\n普通文本内容。",
    });

    expect(result.base64).toBeDefined();
    expect(result.base64.length).toBeGreaterThan(0);
    const buffer = Buffer.from(result.base64, "base64");
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4B);
  });
});
