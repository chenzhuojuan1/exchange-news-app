import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Rss,
  Search,
  ExternalLink,
  RefreshCw,
  Loader2,
  ChevronLeft,
  AlertCircle,
  Calendar,
  Globe,
  TrendingUp,
  Leaf,
  Bot,
  Building2,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";

// ─── Topic config ───────────────────────────────────────────
const TOPIC_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; bgColor: string; borderColor: string }
> = {
  stock_exchange: {
    icon: <Building2 className="h-4 w-4" />,
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  capital_market_risk: {
    icon: <TrendingUp className="h-4 w-4" />,
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
  green_finance: {
    icon: <Leaf className="h-4 w-4" />,
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
  ai_securities: {
    icon: <Bot className="h-4 w-4" />,
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
};

const SOURCE_CONFIG: Record<string, { color: string; bg: string }> = {
  ft: { color: "text-pink-700", bg: "bg-pink-50" },
  economist: { color: "text-red-700", bg: "bg-red-50" },
};

// ─── Article Card ───────────────────────────────────────────
function RssArticleCard({
  title,
  description,
  url,
  publishDate,
  source,
  sourceLabel,
  matchedTopics,
  topicLabels,
}: {
  title: string;
  description: string;
  url: string;
  publishDate: string;
  source: string;
  sourceLabel: string;
  matchedTopics: string[];
  topicLabels: Record<string, string>;
}) {
  const srcConfig = SOURCE_CONFIG[source] || { color: "text-gray-700", bg: "bg-gray-50" };

  return (
    <Card className="hover:shadow-md transition-shadow duration-200 border-l-4 border-l-primary/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Title */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-foreground hover:text-primary transition-colors line-clamp-2 text-sm leading-snug block mb-2"
            >
              {title}
            </a>

            {/* Description */}
            {description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                {description}
              </p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Source badge */}
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${srcConfig.bg} ${srcConfig.color}`}
              >
                <Globe className="h-3 w-3" />
                {sourceLabel}
              </span>

              {/* Date */}
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {publishDate}
              </span>

              {/* Topic badges */}
              {matchedTopics.map((topicKey) => {
                const cfg = TOPIC_CONFIG[topicKey];
                return (
                  <span
                    key={topicKey}
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg?.bgColor || "bg-gray-50"} ${cfg?.color || "text-gray-700"} ${cfg?.borderColor || "border-gray-200"}`}
                  >
                    {cfg?.icon}
                    {topicLabels[topicKey] || topicKey}
                  </span>
                );
              })}
            </div>
          </div>

          {/* External link button */}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="在新标签页打开"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────
export default function RssSearch() {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [maxAgeDays, setMaxAgeDays] = useState(30);
  const [searchEnabled, setSearchEnabled] = useState(false);

  // Fetch topics list
  const topicsQuery = trpc.rss.topics.useQuery();

  // Fetch RSS articles
  const rssQuery = trpc.rss.search.useQuery(
    { topics: selectedTopics, maxAgeDays },
    {
      enabled: searchEnabled,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    }
  );

  // Topic labels map
  const topicLabels = useMemo(() => {
    const map: Record<string, string> = {};
    topicsQuery.data?.forEach((t) => {
      map[t.key] = t.label;
    });
    return map;
  }, [topicsQuery.data]);

  const toggleTopic = (key: string) => {
    setSelectedTopics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSearch = () => {
    setSearchEnabled(true);
    if (rssQuery.isFetched) {
      rssQuery.refetch();
    }
  };

  const handleRefresh = () => {
    rssQuery.refetch();
  };

  // Group articles by source
  const ftArticles = useMemo(
    () => rssQuery.data?.articles.filter((a) => a.source === "ft") || [],
    [rssQuery.data]
  );
  const economistArticles = useMemo(
    () => rssQuery.data?.articles.filter((a) => a.source === "economist") || [],
    [rssQuery.data]
  );

  const totalCount = rssQuery.data?.articles.length || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">返回</span>
              </Button>
            </Link>
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Rss className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                FT & Economist 新闻搜索
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Financial Times · The Economist RSS
              </p>
            </div>
          </div>
          {searchEnabled && rssQuery.isFetched && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={rssQuery.isFetching}
              className="gap-2"
            >
              {rssQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">刷新</span>
            </Button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="container py-6 max-w-4xl">
        {/* Search Panel */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />
              搜索条件
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Topic selection */}
            <div>
              <p className="text-sm font-medium mb-3 text-muted-foreground">
                选择主题（可多选，不选则显示所有相关新闻）
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(topicsQuery.data || [
                  { key: "stock_exchange", label: "证券交易所", labelEn: "Stock Exchange" },
                  { key: "capital_market_risk", label: "资本市场风险", labelEn: "Capital Market Risk" },
                  { key: "green_finance", label: "绿色金融", labelEn: "Green Finance" },
                  { key: "ai_securities", label: "人工智能与证券市场", labelEn: "AI in Securities Markets" },
                ]).map((topic) => {
                  const cfg = TOPIC_CONFIG[topic.key];
                  const isSelected = selectedTopics.includes(topic.key);
                  return (
                    <button
                      key={topic.key}
                      onClick={() => toggleTopic(topic.key)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left ${
                        isSelected
                          ? `${cfg?.bgColor || "bg-primary/10"} ${cfg?.borderColor || "border-primary"} ${cfg?.color || "text-primary"} shadow-sm`
                          : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      <span className={isSelected ? cfg?.color : "text-muted-foreground"}>
                        {cfg?.icon}
                      </span>
                      <span>{topic.label}</span>
                      <span className="text-xs opacity-60 ml-auto">{topic.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time range */}
            <div>
              <p className="text-sm font-medium mb-2 text-muted-foreground">时间范围</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "近 7 天", value: 7 },
                  { label: "近 14 天", value: 14 },
                  { label: "近 30 天", value: 30 },
                  { label: "近 60 天", value: 60 },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setMaxAgeDays(opt.value)}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-all ${
                      maxAgeDays === opt.value
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search button */}
            <Button
              onClick={handleSearch}
              disabled={rssQuery.isFetching}
              className="w-full sm:w-auto gap-2"
            >
              {rssQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {rssQuery.isFetching ? "正在获取新闻..." : "搜索新闻"}
            </Button>
          </CardContent>
        </Card>

        {/* Error display */}
        {rssQuery.data?.errors && rssQuery.data.errors.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 flex items-start gap-2 text-sm text-yellow-800">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">部分 RSS 源获取失败</p>
              {rssQuery.data.errors.map((e, i) => (
                <p key={i} className="text-xs mt-0.5 opacity-80">{e}</p>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {searchEnabled && rssQuery.isFetched && !rssQuery.isFetching && (
          <>
            {/* Summary */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold">
                  搜索结果
                </h2>
                <Badge variant="secondary" className="text-xs">
                  共 {totalCount} 条
                </Badge>
              </div>
              {rssQuery.data?.fetchedAt && (
                <p className="text-xs text-muted-foreground">
                  更新于 {new Date(rssQuery.data.fetchedAt).toLocaleString("zh-CN")}
                </p>
              )}
            </div>

            {totalCount === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Rss className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">未找到相关新闻</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    请尝试调整主题或扩大时间范围
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* FT Articles */}
                {ftArticles.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-5 w-1 rounded-full bg-pink-500" />
                      <h3 className="font-semibold text-sm">
                        Financial Times
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({ftArticles.length} 条)
                        </span>
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {ftArticles.map((article, i) => (
                        <RssArticleCard
                          key={`ft-${i}`}
                          {...article}
                          topicLabels={topicLabels}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Economist Articles */}
                {economistArticles.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-5 w-1 rounded-full bg-red-500" />
                      <h3 className="font-semibold text-sm">
                        The Economist
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({economistArticles.length} 条)
                        </span>
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {economistArticles.map((article, i) => (
                        <RssArticleCard
                          key={`eco-${i}`}
                          {...article}
                          topicLabels={topicLabels}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        )}

        {/* Initial state */}
        {!searchEnabled && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Rss className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="font-medium text-muted-foreground">
                从 Financial Times 和 The Economist 搜索相关新闻
              </p>
              <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm mx-auto">
                选择感兴趣的主题，点击"搜索新闻"按钮获取最新资讯
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {[
                  { label: "证券交易所", cfg: TOPIC_CONFIG.stock_exchange },
                  { label: "资本市场风险", cfg: TOPIC_CONFIG.capital_market_risk },
                  { label: "绿色金融", cfg: TOPIC_CONFIG.green_finance },
                  { label: "人工智能与证券市场", cfg: TOPIC_CONFIG.ai_securities },
                ].map((item) => (
                  <span
                    key={item.label}
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${item.cfg.bgColor} ${item.cfg.color} ${item.cfg.borderColor}`}
                  >
                    {item.cfg.icon}
                    {item.label}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
