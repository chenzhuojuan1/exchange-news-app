import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail, Send, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface EmailDialogProps {
  startDate: string;
  endDate: string;
  articleCount: number;
}

export function EmailDialog({ startDate, endDate, articleCount }: EmailDialogProps) {
  const [open, setOpen] = useState(false);

  const { data: preview, isLoading: previewLoading } = trpc.news.emailPreview.useQuery(
    { startDate, endDate },
    { enabled: open && !!startDate && !!endDate }
  );

  const sendEmail = trpc.news.sendEmail.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("邮件发送成功", {
          description: "新闻汇总已发送至 chenhzuojuan1@qq.com",
        });
      } else if (result.previewOnly) {
        toast.info("邮件预览已生成", {
          description: result.message,
        });
      } else {
        toast.error("发送失败", { description: result.message });
      }
    },
    onError: (err) => {
      toast.error("发送失败", { description: err.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={articleCount === 0}
        >
          <Mail className="h-4 w-4" />
          <span className="hidden sm:inline">发送邮件</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            邮件内容预览
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-2">
          目标邮箱：<span className="font-medium text-foreground">chenhzuojuan1@qq.com</span>
        </div>

        {previewLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : preview?.html ? (
          <div className="border rounded-lg overflow-hidden bg-white">
            <iframe
              srcDoc={preview.html}
              className="w-full min-h-[400px] border-0"
              title="邮件预览"
              sandbox="allow-same-origin"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p>该日期范围内无新闻数据</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            关闭
          </Button>
          <Button
            onClick={() => sendEmail.mutate({ startDate, endDate })}
            disabled={sendEmail.isPending || !preview?.html}
            className="gap-2"
          >
            {sendEmail.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : sendEmail.isSuccess && sendEmail.data?.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            发送邮件
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
