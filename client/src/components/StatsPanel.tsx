import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, Newspaper, Tag, CalendarDays } from "lucide-react";

export function StatsPanel() {
  const { data: stats, isLoading } = trpc.news.stats.useQuery();

  if (isLoading || !stats) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">统计</span>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>数据统计</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            加载中...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const sortedKeywords = Object.entries(stats.keywordCounts)
    .sort((a, b) => b[1] - a[1]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline">统计</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            数据统计
          </DialogTitle>
        </DialogHeader>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="bg-primary/5 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs mb-1">
              <Newspaper className="h-3.5 w-3.5" />
              新闻总数
            </div>
            <div className="text-2xl font-bold text-primary">
              {stats.totalCount}
            </div>
          </div>
          <div className="bg-primary/5 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs mb-1">
              <Tag className="h-3.5 w-3.5" />
              匹配关键词数
            </div>
            <div className="text-2xl font-bold text-primary">
              {sortedKeywords.length}
            </div>
          </div>
          <div className="bg-secondary rounded-lg p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs mb-1">
              <CalendarDays className="h-3.5 w-3.5" />
              最早日期
            </div>
            <div className="text-sm font-semibold">
              {stats.earliestDate || "—"}
            </div>
          </div>
          <div className="bg-secondary rounded-lg p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs mb-1">
              <CalendarDays className="h-3.5 w-3.5" />
              最新日期
            </div>
            <div className="text-sm font-semibold">
              {stats.latestDate || "—"}
            </div>
          </div>
        </div>

        {/* Keyword distribution */}
        {sortedKeywords.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold mb-2.5">关键词分布</h4>
            <div className="flex flex-wrap gap-2">
              {sortedKeywords.map(([kw, count]) => (
                <Badge
                  key={kw}
                  variant="outline"
                  className="gap-1.5 px-2.5 py-1"
                >
                  {kw}
                  <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0 text-[10px] font-bold min-w-[18px] text-center">
                    {count}
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Daily counts */}
        {stats.dailyCounts.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold mb-2.5">近期每日新闻数量</h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {stats.dailyCounts.map(({ date, count }) => (
                <div
                  key={date}
                  className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/50"
                >
                  <span className="text-muted-foreground">{date}</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 bg-primary/60 rounded-full"
                      style={{
                        width: `${Math.max(20, Math.min(120, count * 12))}px`,
                      }}
                    />
                    <span className="font-medium w-6 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
