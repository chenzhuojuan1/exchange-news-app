import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { NewsCard } from "@/components/NewsCard";
import { ReportDialog } from "@/components/ReportDialog";
import {
  Star,
  Loader2,
  ArrowLeft,
  CheckSquare,
  XSquare,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";

export default function Favorites() {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const favorites = trpc.favorite.list.useQuery();
  const utils = trpc.useUtils();

  const removeFavorite = trpc.favorite.remove.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      utils.favorite.list.invalidate();
      utils.favorite.ids.invalidate();
    },
    onError: (err) => {
      toast.error("操作失败", { description: err.message });
    },
  });

  const handleToggleFavorite = useCallback(
    (articleId: number, _favorited: boolean) => {
      // In favorites page, toggle always means remove
      removeFavorite.mutate({ articleId });
    },
    [removeFavorite]
  );

  const handleSelectChange = useCallback((id: number, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!favorites.data) return;
    setSelectedIds(new Set(favorites.data.map((f) => f.id)));
  }, [favorites.data]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const selectedArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="h-9 w-9 rounded-lg bg-yellow-500 flex items-center justify-center">
              <Star className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">我的收藏</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {favorites.data?.length || 0} 条收藏新闻
              </p>
            </div>
          </div>
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
      </header>

      {/* Main content */}
      <main className="container py-6">
        {favorites.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !favorites.data || favorites.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Star className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">暂无收藏新闻</p>
            <p className="text-sm mt-1">
              在新闻列表中点击星标按钮收藏重要新闻
            </p>
            <Link href="/">
              <Button variant="outline" size="sm" className="mt-4 gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                返回新闻列表
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">
                共 {favorites.data.length} 条收藏
              </span>
              {selectMode && favorites.data.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  className="text-xs"
                >
                  全选
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {favorites.data.map((article) => (
                <NewsCard
                  key={article.id}
                  id={article.id}
                  title={article.title}
                  titleDisplay={article.titleDisplay}
                  titleChinese={article.titleChinese}
                  publishDate={article.publishDate}
                  url={article.url}
                  matchedKeywords={article.matchedKeywords}
                  selectable={selectMode}
                  selected={selectedIds.has(article.id)}
                  onSelectChange={handleSelectChange}
                  isFavorited={true}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          </>
        )}
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
          <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
            清除
          </Button>
        </div>
      )}
    </div>
  );
}
