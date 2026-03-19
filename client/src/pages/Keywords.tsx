import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Tag, Shield, Search } from "lucide-react";
import { Link } from "wouter";

export default function Keywords() {
  const [newKeyword, setNewKeyword] = useState("");
  const [searchFilter, setSearchFilter] = useState("");

  const utils = trpc.useUtils();
  const { data: keywords, isLoading } = trpc.keyword.list.useQuery();

  const addMutation = trpc.keyword.add.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
        setNewKeyword("");
        utils.keyword.list.invalidate();
      } else {
        toast.error(result.message);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = trpc.keyword.remove.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
        utils.keyword.list.invalidate();
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleMutation = trpc.keyword.toggle.useMutation({
    onMutate: async ({ id, isActive }) => {
      await utils.keyword.list.cancel();
      const prev = utils.keyword.list.getData();
      utils.keyword.list.setData(undefined, (old) =>
        old?.map((k) => (k.id === id ? { ...k, isActive } : k))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.keyword.list.setData(undefined, ctx.prev);
      toast.error("操作失败");
    },
    onSettled: () => utils.keyword.list.invalidate(),
  });

  const handleAdd = () => {
    const kw = newKeyword.trim();
    if (!kw) {
      toast.error("请输入关键词");
      return;
    }
    addMutation.mutate({ keyword: kw });
  };

  const filtered = keywords?.filter((k) =>
    searchFilter ? k.keyword.toLowerCase().includes(searchFilter.toLowerCase()) : true
  );

  const activeCount = keywords?.filter((k) => k.isActive === 1).length ?? 0;
  const totalCount = keywords?.length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">关键词管理</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>活跃 {activeCount} / 总计 {totalCount}</span>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Add keyword card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">添加新关键词</CardTitle>
            <CardDescription>
              添加新的监控关键词，系统将在抓取新闻时自动匹配包含该关键词的文章。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder="输入关键词，如 NASDAQ、NYSE..."
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="max-w-md"
              />
              <Button
                onClick={handleAdd}
                disabled={addMutation.isPending || !newKeyword.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                添加
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search filter */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索关键词..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Keywords list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">当前关键词列表</CardTitle>
            <CardDescription>
              启用/禁用关键词来控制新闻筛选范围。禁用的关键词不会参与新闻匹配。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : !filtered || filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchFilter ? "未找到匹配的关键词" : "暂无关键词，请添加"}
              </div>
            ) : (
              <div className="grid gap-2">
                {filtered.map((kw) => (
                  <div
                    key={kw.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
                      kw.isActive === 1
                        ? "bg-card hover:bg-accent/50"
                        : "bg-muted/30 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={kw.isActive === 1 ? "default" : "secondary"}
                        className="font-mono text-sm"
                      >
                        {kw.keyword}
                      </Badge>
                      {kw.isActive !== 1 && (
                        <span className="text-xs text-muted-foreground">已禁用</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={kw.isActive === 1}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({
                            id: kw.id,
                            isActive: checked ? 1 : 0,
                          })
                        }
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除</AlertDialogTitle>
                            <AlertDialogDescription>
                              确定要删除关键词 <strong>{kw.keyword}</strong> 吗？删除后将不再匹配包含该关键词的新闻。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeMutation.mutate({ id: kw.id })}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info card */}
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">关于关键词匹配</p>
                <p>系统在抓取新闻时，会检查标题和摘要中是否包含任一活跃关键词。只有匹配到关键词的新闻才会被收录。</p>
                <p>同时，系统会自动排除人事任命、财务报告、股权购买等不重要的新闻。</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
