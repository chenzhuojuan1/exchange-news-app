import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Settings,
  Plus,
  Trash2,
  Tag,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";

// ─── Topic config ───────────────────────────────────────────
const TOPIC_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; bgColor: string; borderColor: string; accentColor: string }
> = {
  stock_exchange: {
    icon: <Building2 className="h-4 w-4" />,
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    accentColor: "bg-blue-500",
  },
  capital_market_risk: {
    icon: <TrendingUp className="h-4 w-4" />,
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    accentColor: "bg-red-500",
  },
  green_finance: {
    icon: <Leaf className="h-4 w-4" />,
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    accentColor: "bg-green-500",
  },
  ai_securities: {
    icon: <Bot className="h-4 w-4" />,
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    accentColor: "bg-purple-500",
  },
};

const SOURCE_CONFIG: Record<string, { color: string; bg: string; accent: string }> = {
  ft:        { color: "text-pink-700",  bg: "bg-pink-50",  accent: "bg-pink-500" },
  economist: { color: "text-red-700",   bg: "bg-red-50",   accent: "bg-red-500" },
};

// ─── Keyword Management Panel ───────────────────────────────
function KeywordPanel({
  topicKey,
  topicLabel,
  topicLabelEn,
}: {
  topicKey: string;
  topicLabel: string;
  topicLabelEn: string;
}) {
  const cfg = TOPIC_CONFIG[topicKey];
  const utils = trpc.useUtils();
  const [newKw, setNewKw] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const keywordsQuery = trpc.rss.keywords.useQuery();
  const topicKeywords = useMemo(
    () => (keywordsQuery.data || []).filter((k) => k.topicKey === topicKey),
    [keywordsQuery.data, topicKey]
  );
  const activeCount = topicKeywords.filter((k) => k.isActive).length;

  const addMutation = trpc.rss.addKeyword.useMutation({
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message);
        setNewKw("");
        utils.rss.keywords.invalidate();
      } else {
        toast.error(res.message);
      }
    },
    onError: (err) => toast.error("添加失败", { description: err.message }),
  });

  const removeMutation = trpc.rss.removeKeyword.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.rss.keywords.invalidate();
    },
    onError: (err) => toast.error("删除失败", { description: err.message }),
  });

  const toggleMutation = trpc.rss.toggleKeyword.useMutation({
    onSuccess: () => utils.rss.keywords.invalidate(),
    onError: (err) => toast.error("操作失败", { description: err.message }),
  });

  const handleAdd = useCallback(() => {
    const kw = newKw.trim();
    if (!kw) return;
    addMutation.mutate({ topicKey, keyword: kw });
  }, [newKw, topicKey, addMutation]);

  return (
    <div className={`rounded-lg border ${cfg?.borderColor || "border-border"} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 ${cfg?.bgColor || "bg-muted/30"} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          <span className={cfg?.color}>{cfg?.icon}</span>
          <span className={`font-semibold text-sm ${cfg?.color}`}>{topicLabel}</span>
          <span className="text-xs text-muted-foreground">({topicLabelEn})</span>
          <Badge variant="secondary" className="text-xs ml-1">
            {activeCount} 个启用
          </Badge>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Keyword list */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          {/* Add new keyword */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newKw}
              onChange={(e) => setNewKw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="输入新关键词（英文），按 Enter 添加"
              className="flex-1 text-sm px-3 py-1.5 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newKw.trim() || addMutation.isPending}
              className="gap-1.5 shrink-0"
            >
              {addMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              添加
            </Button>
          </div>

          {/* Keyword list */}
          {keywordsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              加载中...
            </div>
          ) : topicKeywords.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">暂无关键词，请添加</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {topicKeywords.map((kw) => (
                <div
                  key={kw.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    kw.isActive ? "bg-background border border-border" : "bg-muted/40 border border-dashed border-border opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Switch
                      checked={kw.isActive === 1}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: kw.id, isActive: checked ? 1 : 0 })
                      }
                      className="scale-75 shrink-0"
                    />
                    <span className={`truncate ${kw.isActive ? "text-foreground" : "text-muted-foreground line-through"}`}>
                      {kw.keyword}
                    </span>
                    {kw.isBuiltin === 1 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 text-muted-foreground">
                        内置
                      </Badge>
                    )}
                  </div>
                  {kw.isBuiltin === 0 && (
                    <button
                      onClick={() => removeMutation.mutate({ id: kw.id })}
                      disabled={removeMutation.isPending}
                      className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            内置关键词可启用/禁用但不可删除；自定义关键词可删除。关键词不区分大小写。
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Article Card ───────────────────────────────────────────
function RssArticleCard({
  title,
  description,
  url,
  publishDate,
  source,
  sourceLabel,
  matchedTopics,
  matchedKeywords,
  topicLabels,
}: {
  title: string;
  description: string;
  url: string;
  publishDate: string;
  source: string;
  sourceLabel: string;
  matchedTopics: string[];
  matchedKeywords: string[];
  topicLabels: Record<string, string>;
}) {
  const srcConfig = SOURCE_CONFIG[source] || { color: "text-gray-700", bg: "bg-gray-50", accent: "bg-gray-400" };

  return (
    <Card className="hover:shadow-md transition-shadow duration-200 border-l-4 border-l-primary/20">
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
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Source badge */}
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${srcConfig.bg} ${srcConfig.color}`}>
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

              {/* Matched keywords */}
              {matchedKeywords.slice(0, 3).map((kw) => (
                <span key={kw} className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  <Tag className="h-2.5 w-2.5" />
                  {kw}
                </span>
              ))}
              {matchedKeywords.length > 3 && (
                <span className="text-xs text-muted-foreground">+{matchedKeywords.length - 3}</span>
              )}
            </div>
          </div>

          {/* External link */}
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
  const [showKeywordManager, setShowKeywordManager] = useState(false);

  // Fetch topics list
  const topicsQuery = trpc.rss.topics.useQuery();

  // Fetch RSS articles
  const rssQuery = trpc.rss.search.useQuery(
    { topics: selectedTopics, maxAgeDays },
    {
      enabled: searchEnabled,
      staleTime: 5 * 60 * 1000,
    }
  );

  // Topic labels map
  const topicLabels = useMemo(() => {
    const map: Record<string, string> = {};
    topicsQuery.data?.forEach((t) => { map[t.key] = t.label; });
    return map;
  }, [topicsQuery.data]);

  const toggleTopic = (key: string) => {
    setSelectedTopics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSearch = () => {
    setSearchEnabled(true);
    if (rssQuery.isFetched) rssQuery.refetch();
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

  const topics = topicsQuery.data || [
    { key: "stock_exchange",      label: "证券交易所",         labelEn: "Stock Exchange",           defaultKeywords: [] },
    { key: "capital_market_risk", label: "资本市场风险",       labelEn: "Capital Market Risk",      defaultKeywords: [] },
    { key: "green_finance",       label: "绿色金融",           labelEn: "Green Finance",            defaultKeywords: [] },
    { key: "ai_securities",       label: "人工智能与证券市场", labelEn: "AI in Securities Markets", defaultKeywords: [] },
  ];

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
              <h1 className="text-lg font-bold tracking-tight">FT & Economist 新闻搜索</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Financial Times · The Economist RSS</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showKeywordManager ? "default" : "outline"}
              size="sm"
              onClick={() => setShowKeywordManager((v) => !v)}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">关键词管理</span>
            </Button>
            {searchEnabled && rssQuery.isFetched && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => rssQuery.refetch()}
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
        </div>
      </header>

      <main className="container py-6 max-w-4xl">
        {/* ── Keyword Manager ─────────────────────────────── */}
        {showKeywordManager && (
          <Card className="mb-6 border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                RSS 搜索关键词管理
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                每个主题预设约 10 个内置关键词，您可以启用/禁用内置关键词，或添加自定义关键词。
                搜索时将使用所有已启用的关键词匹配 FT 和 Economist 的文章标题与摘要。
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {topics.map((topic) => (
                <KeywordPanel
                  key={topic.key}
                  topicKey={topic.key}
                  topicLabel={topic.label}
                  topicLabelEn={topic.labelEn}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Search Panel ─────────────────────────────────── */}
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
                {topics.map((topic) => {
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
                  { label: "近 7 天",  value: 7 },
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

        {/* ── Error display ─────────────────────────────────── */}
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

        {/* ── Results ───────────────────────────────────────── */}
        {searchEnabled && rssQuery.isFetched && !rssQuery.isFetching && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold">搜索结果</h2>
                <Badge variant="secondary" className="text-xs">共 {totalCount} 条</Badge>
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
                    请尝试调整主题、扩大时间范围，或在关键词管理中添加更多关键词
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
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
                        <RssArticleCard key={`ft-${i}`} {...article} topicLabels={topicLabels} />
                      ))}
                    </div>
                  </section>
                )}

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
                        <RssArticleCard key={`eco-${i}`} {...article} topicLabels={topicLabels} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Initial state ─────────────────────────────────── */}
        {!searchEnabled && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Rss className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="font-medium text-muted-foreground">
                从 Financial Times 和 The Economist 搜索相关新闻
              </p>
              <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm mx-auto">
                选择感兴趣的主题，点击"搜索新闻"获取最新资讯；点击右上角"关键词管理"可自定义搜索关键词
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {[
                  { label: "证券交易所",         cfg: TOPIC_CONFIG.stock_exchange },
                  { label: "资本市场风险",       cfg: TOPIC_CONFIG.capital_market_risk },
                  { label: "绿色金融",           cfg: TOPIC_CONFIG.green_finance },
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
