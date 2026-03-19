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
import { FileText, Loader2, Copy, Check, FileDown } from "lucide-react";
import { useState } from "react";
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

  const generateReport = trpc.report.generate.useMutation({
    onSuccess: (result) => {
      setReport(result.report);
      toast.success(result.message);
    },
    onError: (err) => {
      toast.error("报告生成失败", { description: err.message });
    },
  });

  const exportWord = trpc.export.word.useMutation({
    onSuccess: (result) => {
      // Convert base64 to blob and download
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

  const handleGenerate = () => {
    if (selectedIds.length === 0) {
      toast.error("请先勾选需要生成报告的新闻");
      return;
    }
    if (selectedIds.length > 20) {
      toast.error("最多选择20条新闻生成报告");
      return;
    }
    generateReport.mutate({ articleIds: selectedIds });
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

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen && selectedIds.length > 0) {
      handleGenerate();
    }
    if (!newOpen) {
      setReport("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="default"
          className="gap-1.5"
          disabled={selectedIds.length === 0}
        >
          <FileText className="h-4 w-4" />
          生成报告 ({selectedIds.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            新闻分析报告
          </DialogTitle>
          <DialogDescription>
            基于选中的 {selectedIds.length} 条新闻原文自动生成结构化中文报告
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0">
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
            <div className="flex flex-col gap-3 h-full">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  报告已生成
                </span>
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
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
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
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-30" />
              <p className="font-medium">准备生成报告</p>
              <p className="text-sm mt-1">
                已选择 {selectedIds.length} 条新闻
              </p>
            </div>
          )}
        </div>

        {report && onClearSelection && (
          <div className="flex justify-end pt-2 border-t">
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
