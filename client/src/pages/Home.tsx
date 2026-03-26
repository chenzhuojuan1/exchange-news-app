import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewsCard } from "@/components/NewsCard";
import { StatsPanel } from "@/components/StatsPanel";
import { EmailDialog } from "@/components/EmailDialog";
import { ReportDialog } from "@/components/ReportDialog";
import {
  Newspaper,
  RefreshCw,
  Search,
  Calendar,
  Loader2,
  Download,
  ChevronLeft,
  ChevronRight,
  Globe,
  AlertCircle,
  Tag,
  CheckSquare,
  XSquare,
  Star,
  History,
  Shield,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";

type ArticleItem = {
  id: number;
  title: string;
  titleDisplay: string | null;
  titleChinese: string | null;
  publishDate: string;
  url: string;
  matchedKeywords: string;
};

export default function Home() {
  const [activeTab, setActiveTab] = useState("yesterday");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const [searchStartDate, setSearchStartDate] = useState("");
  const [searchEndDate, setSearchEndDate] = useState("");
  const [allPage, setAllPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Helper: format date to YYYY-MM-DD
  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Quick date range presets for history backfill
  const setQuickRange = useCallback((days: number) => {
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date();
    start.setDate(start.getDate() - days);
    const sd = formatDate(start);
    const ed = formatDate(end);
    setStartDate(sd);
    setEndDate(ed);
    setSearchStartDate(sd);
    setSearchEndDate(ed);
    setActiveTab("range");
  }, []);

  // Queries
  const yesterday = trpc.news.yesterday.useQuery();
  const dateRange = trpc.news.byDateRange.useQuery(
    { startDate: searchStartDate, endDate: searchEndDate, autoScrape: true },
    { enabled: !!searchStartDate && !!searchEndDate }
  );
  const allNews = trpc.news.all.useQuery({ page: allPage, pageSize: 20 });
  const favoriteIds = trpc.favorite.ids.useQuery();
  const utils = trpc.useUtils();

  // Favorite mutations
  const addFavorite = trpc.favorite.add.useMutation({
    onSuccess: () => {
      utils.favorite.ids.invalidate();
      toast.success("已收藏");
    },
    onError: (err) => toast.error("收藏失败", { description: err.message }),
  });

  const removeFavorite = trpc.favorite.remove.useMutation({
    onSuccess: () => {
      utils.favorite.ids.invalidate();
      toast.success("已取消收藏");
    },
    onError: (err) => toast.error("取消收藏失败", { description: err.message }),
  });

  const handleToggleFavorite = useCallback(
    (articleId: number, favorited: boolean) => {
      if (favorited) {
        addFavorite.mutate({ articleId });
      } else {
        removeFavorite.mutate({ articleId });
      }
    },
    [addFavorite, removeFavorite]
  );

  const favoriteIdSet = useMemo(
    () => new Set(favoriteIds.data || []),
    [favoriteIds.data]
  );

  // Scrape mutation
  const scrape = trpc.news.scrape.useMutation({
    onSuccess: (result) => {
      toast.success(result.message, {
        description: `扫描 ${result.articlesFound} 条，筛选 ${result.articlesFiltered} 条，入库 ${result.articlesInserted} 条`,
      });
      yesterday.refetch();
      allNews.refetch();
      if (searchStartDate && searchEndDate) dateRange.refetch();
    },
    onError: (err) => {
      toast.error("抓取失败", { description: err.message });
    },
  });

  const scrapeRange = trpc.news.scrape.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      dateRange.refetch();
      allNews.refetch();
    },
    onError: (err) => {
      toast.error("抓取失败", { description: err.message });
    },
  });

  // Handle date search
  const handleSearch = useCallback(() => {
    const sd = startDateRef.current?.value || startDate;
    const ed = endDateRef.current?.value || endDate;
    if (sd) setStartDate(sd);
    if (ed) setEndDate(ed);
    if (!sd || !ed) {
      toast.error("请选择完整的日期范围");
      return;
    }
    if (sd > ed) {
      toast.error("开始日期不能晚于结束日期");
      return;
    }
    setSearchStartDate(sd);
    setSearchEndDate(ed);
  }, [startDate, endDate]);

  // Handle scrape by range
  const handleScrapeRange = useCallback(() => {
    const sd = startDateRef.current?.value || startDate;
    const ed = endDateRef.current?.value || endDate;
    if (sd) setStartDate(sd);
    if (ed) setEndDate(ed);
    if (!sd || !ed) {
      toast.error("请选择完整的日期范围");
      return;
    }
    scrapeRange.mutate({ startDate: sd, endDate: ed, maxPages: 30 });
  }, [startDate, endDate, scrapeRange]);

  // Selection handlers
  const handleSelectChange = useCallback((id: number, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (articles: ArticleItem[]) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        articles.forEach((a) => next.add(a.id));
        return next;
      });
    },
    []
  );

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  // Current articles for email dialog
  const currentDateRange = useMemo(() => {
    if (activeTab === "yesterday" && yesterday.data?.dateRange) {
      return yesterday.data.dateRange;
    }
    if (activeTab === "range" && searchStartDate && searchEndDate) {
      return { start: searchStartDate, end: searchEndDate };
    }
    return { start: "", end: "" };
  }, [activeTab, yesterday.data, searchStartDate, searchEndDate]);

  const totalPages = allNews.data ? Math.ceil(allNews.data.total / 20) : 0;
  const selectedArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Globe className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                境外交易所新闻汇总
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Exchange News Aggregator
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/favorites">
              <Button variant="outline" size="sm" className="gap-2">
                <Star className="h-4 w-4" />
                <span className="hidden sm:inline">收藏</span>
                {(favoriteIds.data?.length || 0) > 0 && (
                  <span className="bg-yellow-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none font-medium">
                    {favoriteIds.data?.length}
                  </span>
                )}
              </Button>
            </Link>
            <Link href="/keywords">
              <Button variant="outline" size="sm" className="gap-2">
                <Tag className="h-4 w-4" />
                <span className="hidden sm:inline">关键词</span>
              </Button>
            </Link>
            <Link href="/exclude-rules">
              <Button variant="outline" size="sm" className="gap-2">
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">排除规则</span>
              </Button>
            </Link>
            <StatsPanel />
            <Button
              size="sm"
              onClick={() => scrape.mutate({ maxPages: 10 })}
              disabled={scrape.isPending}
              className="gap-2"
            >
              {scrape.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">抓取新闻</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <TabsList className="h-10">
              <TabsTrigger value="yesterday" className="gap-1.5 px-4">
                <Calendar className="h-3.5 w-3.5" />
                前一日新闻
              </TabsTrigger>
              <TabsTrigger value="range" className="gap-1.5 px-4">
                <Search className="h-3.5 w-3.5" />
                日期筛选
              </TabsTrigger>
              <TabsTrigger value="all" className="gap-1.5 px-4">
                <Newspaper className="h-3.5 w-3.5" />
                全部新闻
              </TabsTrigger>
            </TabsList>

            {/* Selection mode toggle and report button */}
            <div className="flex items-center gap-2">
              <Button
                variant={selectMode ? "default" : "outline"}
                size="sm"
                onClick={toggleSelectMode}
                className="gap-1.5"
              >
                <CheckSquare className="h-4 w-4" />
                {selectMode ? "退出选择" : "选择新闻"}
              </Button>
              {selectMode && selectedIds.size > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeselectAll}
                    className="gap-1.5"
                  >
                    <XSquare className="h-4 w-4" />
                    清除 ({selectedIds.size})
                  </Button>
                  <ReportDialog
                    selectedIds={selectedArray}
                    onClearSelection={() => {
                      setSelectedIds(new Set());
                      setSelectMode(false);
                    }}
                  />
                </>
              )}
            </div>
          </div>

          {/* Yesterday's news */}
          <TabsContent value="yesterday" className="mt-0">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground">
                {yesterday.data?.dateRange && (
                  <span>
                    {yesterday.data.dateRange.start ===
                    yesterday.data.dateRange.end
                      ? yesterday.data.dateRange.start
                      : `${yesterday.data.dateRange.start} 至 ${yesterday.data.dateRange.end}`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectMode && (yesterday.data?.articles?.length || 0) > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      handleSelectAll(yesterday.data?.articles || [])
                    }
                    className="text-xs"
                  >
                    全选本页
                  </Button>
                )}
                <span className="text-sm text-muted-foreground">
                  {yesterday.data?.articles.length || 0} 条
                </span>
                {yesterday.data?.dateRange && (
                  <EmailDialog
                    startDate={yesterday.data.dateRange.start}
                    endDate={yesterday.data.dateRange.end}
                    articleCount={yesterday.data?.articles.length || 0}
                  />
                )}
              </div>
            </div>
            <NewsList
              articles={yesterday.data?.articles}
              isLoading={yesterday.isLoading}
              emptyMessage="前一日无交易所相关新闻"
              selectable={selectMode}
              selectedIds={selectedIds}
              onSelectChange={handleSelectChange}
              favoriteIdSet={favoriteIdSet}
              onToggleFavorite={handleToggleFavorite}
            />
          </TabsContent>

          {/* Date range filter */}
          <TabsContent value="range" className="mt-0">
            <Card className="mb-4">
              <CardContent className="p-4">
                {/* Quick date presets */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <History className="h-3.5 w-3.5" />
                    快捷回溯：
                  </span>
                  {[
                    { label: "过去3天", days: 3 },
                    { label: "过去一周", days: 7 },
                    { label: "过去两周", days: 14 },
                    { label: "过去一个月", days: 30 },
                    { label: "过去三个月", days: 90 },
                  ].map((preset) => (
                    <Button
                      key={preset.days}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setQuickRange(preset.days)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                  <div className="flex-1 w-full sm:w-auto">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      开始日期
                    </label>
                    <input
                      ref={startDateRef}
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  <div className="flex-1 w-full sm:w-auto">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      结束日期
                    </label>
                    <input
                      ref={endDateRef}
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      size="sm"
                      onClick={handleSearch}
                      className="gap-1.5 flex-1 sm:flex-none"
                    >
                      <Search className="h-3.5 w-3.5" />
                      查询
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleScrapeRange}
                      disabled={scrapeRange.isPending}
                      className="gap-1.5 flex-1 sm:flex-none"
                    >
                      {scrapeRange.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      抓取该范围
                    </Button>
                    {searchStartDate && searchEndDate && (
                      <EmailDialog
                        startDate={searchStartDate}
                        endDate={searchEndDate}
                        articleCount={dateRange.data?.articles.length || 0}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {searchStartDate && searchEndDate ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      {searchStartDate} 至 {searchEndDate}
                    </span>
                    {dateRange.data?.scraped && (
                      <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        已自动抓取
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectMode &&
                      (dateRange.data?.articles?.length || 0) > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleSelectAll(dateRange.data?.articles || [])
                          }
                          className="text-xs"
                        >
                          全选本页
                        </Button>
                      )}
                    <span className="text-sm text-muted-foreground">
                      {dateRange.data?.articles.length || 0} 条
                    </span>
                  </div>
                </div>
                <NewsList
                  articles={dateRange.data?.articles}
                  isLoading={dateRange.isLoading}
                  emptyMessage="该日期范围内无交易所相关新闻，请尝试点击「抓取该范围」按钮"
                  selectable={selectMode}
                  selectedIds={selectedIds}
                  onSelectChange={handleSelectChange}
                  favoriteIdSet={favoriteIdSet}
                  onToggleFavorite={handleToggleFavorite}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Calendar className="h-12 w-12 mb-3 opacity-30" />
                <p className="font-medium">选择日期范围</p>
                <p className="text-sm mt-1">
                  请在上方设置开始和结束日期，然后点击"查询"按钮
                </p>
                <p className="text-xs mt-2 text-muted-foreground/60">
                  如果数据库中没有该范围的新闻，系统将自动从网站抓取
                </p>
              </div>
            )}
          </TabsContent>

          {/* All news */}
          <TabsContent value="all" className="mt-0">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground">
                共 {allNews.data?.total || 0} 条新闻
              </div>
              <div className="flex items-center gap-2">
                {selectMode && (allNews.data?.items?.length || 0) > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(allNews.data?.items || [])}
                    className="text-xs"
                  >
                    全选本页
                  </Button>
                )}
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={allPage <= 1}
                      onClick={() => setAllPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground min-w-[60px] text-center">
                      {allPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={allPage >= totalPages}
                      onClick={() => setAllPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <NewsList
              articles={allNews.data?.items}
              isLoading={allNews.isLoading}
              emptyMessage="暂无新闻数据，请先点击抓取新闻按钮获取数据"
              selectable={selectMode}
              selectedIds={selectedIds}
              onSelectChange={handleSelectChange}
              favoriteIdSet={favoriteIdSet}
              onToggleFavorite={handleToggleFavorite}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Floating selection bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-lg rounded-full px-6 py-3 flex items-center gap-4">
          <span className="text-sm font-medium">
            已选择 {selectedIds.size} 条新闻
          </span>
          <ReportDialog
            selectedIds={selectedArray}
            onClearSelection={() => {
              setSelectedIds(new Set());
              setSelectMode(false);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeselectAll}
          >
            清除
          </Button>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t py-6 mt-8">
        <div className="container text-center text-xs text-muted-foreground">
          <p>
            数据来源：
            <a
              href="https://mondovisione.com/media-and-resources/news/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Mondo Visione News Centre
            </a>
          </p>
          <p className="mt-1">
            每工作日 08:30 自动更新 | 仅筛选交易所相关实质性新闻
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── News List Sub-component ──────────────────────────────
function NewsList({
  articles,
  isLoading,
  emptyMessage,
  selectable = false,
  selectedIds,
  onSelectChange,
  favoriteIdSet,
  onToggleFavorite,
}: {
  articles: ArticleItem[] | undefined;
  isLoading: boolean;
  emptyMessage: string;
  selectable?: boolean;
  selectedIds?: Set<number>;
  onSelectChange?: (id: number, selected: boolean) => void;
  favoriteIdSet?: Set<number>;
  onToggleFavorite?: (id: number, favorited: boolean) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!articles || articles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mb-3 opacity-30" />
        <p className="font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {articles.map((article) => (
        <NewsCard
          key={article.id}
          id={article.id}
          title={article.title}
          titleDisplay={article.titleDisplay}
          titleChinese={article.titleChinese}
          publishDate={article.publishDate}
          url={article.url}
          matchedKeywords={article.matchedKeywords}
          selectable={selectable}
          selected={selectedIds?.has(article.id) || false}
          onSelectChange={onSelectChange}
          isFavorited={favoriteIdSet?.has(article.id) || false}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
