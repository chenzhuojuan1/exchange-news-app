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
import { ArrowLeft, Plus, Trash2, Tag, Shield, Search, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "wouter";

type KeywordType = "include" | "exclude";

export default function Keywords() {
  const [newKeyword, setNewKeyword] = useState("");
  const [newExcludeKeyword, setNewExcludeKeyword] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [activeTab, setActiveTab] = useState<KeywordType>("include");

  const utils = trpc.useUtils();
  const { data: keywords, isLoading } = trpc.keyword.list.useQuery();

  const addMutation = trpc.keyword.add.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
        setNewKeyword("");
        setNewExcludeKeyword("");
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

  const handleAdd = (type: KeywordType) => {
    const kw = (type === "include" ? newKeyword : newExcludeKeyword).trim();
    if (!kw) {
      toast.error("请输入关键词");
      return;
    }
    addMutation.mutate({ keyword: kw, type });
  };

  // Split keywords by type (default to 'include' for legacy data without type field)
  const includeKeywords = keywords?.filter((k) => !k.type || k.type === "include") ?? [];
  const excludeKeywords = keywords?.filter((k) => k.type === "exclude") ?? [];

  const currentList = activeTab === "include" ? includeKeywords : excludeKeywords;
  const filtered = currentList.filter((k) =>
    searchFilter ? k.keyword.toLowerCase().includes(searchFilter.toLowerCase()) : true
  );

  const activeIncludeCount = includeKeywords.filter((k) => k.isActive === 1).length;
  const activeExcludeCount = excludeKeywords.filter((k) => k.isActive === 1).length;

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
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>包含 {activeIncludeCount} 个活跃</span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle className="h-4 w-4 text-red-500" />
              <span>排除 {activeExcludeCount} 个活跃</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("include")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "include"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            包含关键词
            <Badge variant="secondary" className="ml-1 text-xs">{includeKeywords.length}</Badge>
          </button>
          <button
            onClick={() => setActiveTab("exclude")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "exclude"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <XCircle className="h-4 w-4 text-red-500" />
            排除关键词
            <Badge variant="secondary" className="ml-1 text-xs">{excludeKeywords.length}</Badge>
          </button>
        </div>

        {/* Add keyword card */}
        {activeTab === "include" ? (
          <Card className="border-green-200 dark:border-green-900">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                添加包含关键词
              </CardTitle>
              <CardDescription>
                新闻标题或摘要中包含这些关键词时，才会被收录。例如：NASDAQ、NYSE、SEC。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  placeholder="输入关键词，如 NASDAQ、NYSE..."
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd("include")}
                  className="max-w-md"
                />
                <Button
                  onClick={() => handleAdd("include")}
                  disabled={addMutation.isPending || !newKeyword.trim()}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  添加
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-red-200 dark:border-red-900">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                添加排除关键词
              </CardTitle>
              <CardDescription>
                新闻标题或摘要中包含这些关键词时，将被自动过滤掉，不会被收录。例如：appointment、dividend。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  placeholder="输入要排除的关键词，如 appointment、dividend..."
                  value={newExcludeKeyword}
                  onChange={(e) => setNewExcludeKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd("exclude")}
                  className="max-w-md"
                />
                <Button
                  onClick={() => handleAdd("exclude")}
                  disabled={addMutation.isPending || !newExcludeKeyword.trim()}
                  variant="destructive"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  添加
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search filter */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`搜索${activeTab === "include" ? "包含" : "排除"}关键词...`}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Keywords list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {activeTab === "include" ? (
                <><CheckCircle2 className="h-4 w-4 text-green-500" />包含关键词列表</>
              ) : (
                <><XCircle className="h-4 w-4 text-red-500" />排除关键词列表</>
              )}
            </CardTitle>
            <CardDescription>
              {activeTab === "include"
                ? "启用/禁用关键词来控制新闻筛选范围。禁用的关键词不会参与新闻匹配。"
                : "启用/禁用排除关键词。启用时，包含该词的新闻将被过滤掉。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchFilter
                  ? "未找到匹配的关键词"
                  : activeTab === "include"
                  ? "暂无包含关键词，请添加"
                  : "暂无排除关键词，可按需添加"}
              </div>
            ) : (
              <div className="grid gap-2">
                {filtered.map((kw) => (
                  <div
                    key={kw.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
                      kw.isActive === 1
                        ? activeTab === "include"
                          ? "bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-900 hover:bg-green-50 dark:hover:bg-green-950/30"
                          : "bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/30"
                        : "bg-muted/30 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={kw.isActive === 1 ? (activeTab === "include" ? "default" : "destructive") : "secondary"}
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
                              确定要删除{activeTab === "include" ? "包含" : "排除"}关键词 <strong>{kw.keyword}</strong> 吗？
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
                <p className="font-medium text-foreground">关于关键词过滤规则</p>
                <p><strong>包含关键词</strong>：新闻标题或摘要中必须包含至少一个活跃的包含关键词，才会被收录。</p>
                <p><strong>排除关键词</strong>：新闻标题或摘要中包含任一活跃的排除关键词，将被自动过滤掉，不会被收录。</p>
                <p>系统还内置了自动排除规则，会过滤人事任命、财务报告、股权购买等不重要的新闻。</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
