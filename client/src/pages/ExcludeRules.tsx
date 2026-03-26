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
import { ArrowLeft, Plus, Trash2, Shield, Search, Lock, Unlock } from "lucide-react";
import { Link } from "wouter";

export default function ExcludeRules() {
  const [newPattern, setNewPattern] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [filterType, setFilterType] = useState<"all" | "builtin" | "custom">("all");

  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.excludeRule.list.useQuery();

  const addMutation = trpc.excludeRule.add.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
        setNewPattern("");
        setNewDescription("");
        utils.excludeRule.list.invalidate();
      } else {
        toast.error(result.message);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = trpc.excludeRule.remove.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
        utils.excludeRule.list.invalidate();
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleMutation = trpc.excludeRule.toggle.useMutation({
    onMutate: async ({ id, isActive }) => {
      await utils.excludeRule.list.cancel();
      const prev = utils.excludeRule.list.getData();
      utils.excludeRule.list.setData(undefined, (old) =>
        old?.map((r) => (r.id === id ? { ...r, isActive } : r))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.excludeRule.list.setData(undefined, ctx.prev);
      toast.error("操作失败");
    },
    onSettled: () => utils.excludeRule.list.invalidate(),
  });

  const handleAdd = () => {
    const pat = newPattern.trim();
    if (!pat) {
      toast.error("请输入排除规则");
      return;
    }
    addMutation.mutate({ pattern: pat, description: newDescription.trim() || undefined });
  };

  const allRules = rules ?? [];
  const builtinRules = allRules.filter((r) => r.isBuiltin === 1);
  const customRules = allRules.filter((r) => r.isBuiltin === 0);

  const displayRules =
    filterType === "builtin" ? builtinRules :
    filterType === "custom" ? customRules :
    allRules;

  const filtered = displayRules.filter((r) =>
    searchFilter
      ? r.pattern.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (r.description && r.description.toLowerCase().includes(searchFilter.toLowerCase()))
      : true
  );

  const activeCount = allRules.filter((r) => r.isActive === 1).length;
  const totalCount = allRules.length;

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
              <Shield className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">排除规则管理</h1>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>共 {totalCount} 条规则，{activeCount} 条启用</span>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Filter tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          {(["all", "builtin", "custom"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filterType === type
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {type === "all" && <>全部<Badge variant="secondary" className="ml-1 text-xs">{allRules.length}</Badge></>}
              {type === "builtin" && <><Lock className="h-3.5 w-3.5" />内置规则<Badge variant="secondary" className="ml-1 text-xs">{builtinRules.length}</Badge></>}
              {type === "custom" && <><Unlock className="h-3.5 w-3.5" />自定义<Badge variant="secondary" className="ml-1 text-xs">{customRules.length}</Badge></>}
            </button>
          ))}
        </div>

        {/* Add custom rule card */}
        <Card className="border-orange-200 dark:border-orange-900">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4 text-orange-500" />
              添加自定义排除规则
            </CardTitle>
            <CardDescription>
              新闻标题或摘要中包含该文本时，将被自动过滤掉。例如：appointment、dividend、quarterly。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                placeholder="排除文本，如 appointment"
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="max-w-xs"
              />
              <Input
                placeholder="说明（可选），如 人事任命"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="max-w-xs"
              />
              <Button
                onClick={handleAdd}
                disabled={addMutation.isPending || !newPattern.trim()}
                className="bg-orange-600 hover:bg-orange-700"
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
            placeholder="搜索排除规则..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Rules list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-orange-500" />
              排除规则列表
            </CardTitle>
            <CardDescription>
              启用/禁用排除规则来控制新闻过滤。内置规则不可删除但可禁用，自定义规则可删除。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchFilter ? "未找到匹配的规则" : "暂无排除规则"}
              </div>
            ) : (
              <div className="grid gap-2">
                {filtered.map((rule) => (
                  <div
                    key={rule.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
                      rule.isActive === 1
                        ? "bg-orange-50/50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                        : "bg-muted/30 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Badge
                        variant={rule.isActive === 1 ? "destructive" : "secondary"}
                        className="font-mono text-sm shrink-0"
                      >
                        {rule.pattern}
                      </Badge>
                      {rule.description && (
                        <span className="text-xs text-muted-foreground truncate">
                          {rule.description}
                        </span>
                      )}
                      {rule.isBuiltin === 1 && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          <Lock className="h-3 w-3 mr-1" />
                          内置
                        </Badge>
                      )}
                      {rule.isActive !== 1 && (
                        <span className="text-xs text-muted-foreground shrink-0">已禁用</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Switch
                        checked={rule.isActive === 1}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({
                            id: rule.id,
                            isActive: checked ? 1 : 0,
                          })
                        }
                      />
                      {rule.isBuiltin === 0 && (
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
                                确定要删除排除规则 <strong>{rule.pattern}</strong> 吗？
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeMutation.mutate({ id: rule.id })}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                删除
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
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
                <p className="font-medium text-foreground">关于排除规则</p>
                <p><strong>内置规则</strong>：系统预设的排除规则，覆盖人事任命、财务报告、个股上市等常见无关新闻。内置规则不可删除，但可以通过开关禁用。</p>
                <p><strong>自定义规则</strong>：您可以添加自己的排除规则。新闻标题或摘要中包含该文本（不区分大小写）时，将被自动过滤。</p>
                <p><strong>白名单优先</strong>：即使匹配排除规则，如果新闻标题包含合作/改革等重要关键词，或涉及两个以上交易所，仍会被保留。</p>
                <p><strong>生效时机</strong>：排除规则的修改将在下次抓取新闻时生效。如需立即生效，请在首页重新抓取对应日期的新闻。</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
