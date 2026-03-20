import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Loader2, Copy, Check, FileDown, Upload, X, PlusCircle, Download } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

interface ReportDialogProps {
  selectedIds: number[];
  onClearSelection?: () => void;
}

export function ReportDialog({ selectedIds, onClearSelection }: ReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState("");
  const [copied, setCopied] = useState(false);
  const [extraContent, setExtraContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [showExtraInput, setShowExtraInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateReport = trpc.report.generate.useMutation({
    onSuccess: (result) => {
      setReport(result.report);
      toast.success(result.message);
    },
    onError: (err) => {
      toast.error("报告生成失败", { description: err.message });
    },
  });

  const exportRaw = trpc.report.exportRaw.useMutation({
    onSuccess: (result) => {
      if (!result.rawContent) {
        toast.error(result.message);
        return;
      }
      // Combine raw content with extra content if any
      let fullText = result.rawContent;
      if (extraContent.trim()) {
        fullText += "\n\n========== 补充材料 ==========\n";
        if (fileName) fullText += `文件名: ${fileName}\n\n`;
        fullText += extraContent.trim() + "\n";
      }
      // Download as text file
      const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `原始全文_${today}_${result.articleCount}条.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已下载 ${result.articleCount} 条新闻原始全文`);
    },
    onError: (err) => {
      toast.error("下载失败", { description: err.message });
    },
  });

  const exportWord = trpc.export.word.useMutation({
    onSuccess: (result) => {
      const byteCharacters = atob(result.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Word文档已下载");
    },
    onError: (err) => {
      toast.error("导出失败", { description: err.message });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 200KB)
    if (file.size > 200 * 1024) {
      toast.error("文件过大，请上传 200KB 以内的文件");
      return;
    }

    // Check file type
    const allowedTypes = [".txt", ".md"];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!allowedTypes.includes(ext)) {
      toast.error("仅支持 .txt 和 .md 格式文件");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setExtraContent(content);
      setFileName(file.name);
      toast.success(`已加载文件：${file.name}`);
    };
    reader.onerror = () => toast.error("文件读取失败");
    reader.readAsText(file, "utf-8");

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClearExtra = () => {
    setExtraContent("");
    setFileName("");
  };

  const handleGenerate = () => {
    const hasArticles = selectedIds.length > 0;
    const hasExtra = extraContent.trim().length > 0;

    if (!hasArticles && !hasExtra) {
      toast.error("请先勾选新闻或添加补充材料");
      return;
    }
    if (selectedIds.length > 20) {
      toast.error("最多选择20条新闻生成报告");
      return;
    }
    if (extraContent.trim().length > 50000) {
      toast.error("补充材料内容过长，请控制在50000字以内");
      return;
    }

    generateReport.mutate({
      articleIds: selectedIds,
      extraContent: extraContent.trim() || undefined,
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      toast.success("报告已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const handleExportWord = () => {
    if (!report) {
      toast.error("请先生成报告");
      return;
    }
    exportWord.mutate({ reportMarkdown: report });
  };

  const handleExportRaw = () => {
    if (selectedIds.length === 0) {
      toast.error("请先选择新闻");
      return;
    }
    exportRaw.mutate({ articleIds: selectedIds });
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setReport("");
    }
  };

  const hasExtra = extraContent.trim().length > 0;
  const canGenerate = selectedIds.length > 0 || hasExtra;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="default"
          className="gap-1.5"
        >
          <FileText className="h-4 w-4" />
          生成报告 {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            新闻分析报告
          </DialogTitle>
          <DialogDescription>
            {selectedIds.length > 0
              ? `已选择 ${selectedIds.length} 条新闻${hasExtra ? " + 1 份补充材料" : ""}`
              : hasExtra
              ? "仅使用补充材料生成报告"
              : "选择新闻或添加补充材料后生成报告"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {/* Extra content section */}
          {!report && !generateReport.isPending && (
            <div className="border rounded-lg p-3 bg-muted/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <PlusCircle className="h-4 w-4 text-primary" />
                  补充材料（可选）
                </span>
                <div className="flex items-center gap-2">
                  {/* File upload button */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3 w-3" />
                    上传文件
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => setShowExtraInput(!showExtraInput)}
                  >
                    {showExtraInput ? "收起" : "粘贴文本"}
                  </Button>
                  {hasExtra && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={handleClearExtra}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* File loaded indicator */}
              {fileName && (
                <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 mb-2">
                  <FileText className="h-3.5 w-3.5" />
                  <span>已加载：{fileName}（{extraContent.length} 字符）</span>
                </div>
              )}

              {/* Text paste area */}
              {showExtraInput && (
                <Textarea
                  placeholder="粘贴补充材料内容（支持中英文文本，最多50000字）..."
                  value={extraContent}
                  onChange={(e) => {
                    setExtraContent(e.target.value);
                    if (fileName && e.target.value !== extraContent) setFileName("");
                  }}
                  className="min-h-[100px] text-sm resize-none"
                />
              )}

              {!fileName && !showExtraInput && (
                <p className="text-xs text-muted-foreground">
                  支持上传 .txt / .md 文件（最大200KB），或直接粘贴文本内容，将与选中新闻一起纳入报告。
                </p>
              )}
            </div>
          )}

          {/* Report content area */}
          {generateReport.isPending ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium text-foreground">正在生成报告...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  正在抓取新闻原文并分析整理，预计需要30-60秒
                </p>
              </div>
            </div>
          ) : report ? (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">报告已生成</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExportWord}
                    disabled={exportWord.isPending}
                    className="gap-1.5"
                  >
                    {exportWord.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileDown className="h-3.5 w-3.5" />
                    )}
                    导出Word
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopy}
                    className="gap-1.5"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "已复制" : "复制"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerate}
                    disabled={generateReport.isPending}
                    className="gap-1.5"
                  >
                    重新生成
                  </Button>
                </div>
              </div>
              <ScrollArea className="flex-1 max-h-[55vh] border rounded-lg p-4 bg-muted/30">
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <Streamdown>{report}</Streamdown>
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-30" />
              <p className="font-medium">准备生成报告</p>
              <p className="text-sm mt-1">
                {selectedIds.length > 0
                  ? `已选择 ${selectedIds.length} 条新闻${hasExtra ? " + 补充材料" : ""}`
                  : hasExtra
                  ? "已添加补充材料，可直接生成"
                  : "请选择新闻或添加补充材料"}
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            {report && onClearSelection && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onClearSelection();
                  setOpen(false);
                  setReport("");
                }}
              >
                清除选择并关闭
              </Button>
            )}
          </div>
          {!report && !generateReport.isPending && (
            <div className="flex items-center gap-2">
              {selectedIds.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleExportRaw}
                  disabled={exportRaw.isPending}
                  className="gap-1.5"
                >
                  {exportRaw.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  下载原始全文
                </Button>
              )}
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate || generateReport.isPending}
                className="gap-1.5"
              >
                <FileText className="h-4 w-4" />
                {canGenerate ? "生成报告" : "请先选择内容"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
