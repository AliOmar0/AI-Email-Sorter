import { useEffect } from "react";
import { useDigestEmails, ListEmailsView } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2 } from "lucide-react";

interface DigestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: ListEmailsView;
  labelId?: string;
  scopeLabel: string;
}

export function DigestDialog({
  open,
  onOpenChange,
  view,
  labelId,
  scopeLabel,
}: DigestDialogProps) {
  const digest = useDigestEmails();
  const { mutate, reset, data, isPending, isError } = digest;

  // Generate the digest each time the dialog opens for the current scope.
  useEffect(() => {
    if (open) {
      mutate({ data: { view, labelId, onlyUnread: false } });
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view, labelId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Digest — {scopeLabel}
          </DialogTitle>
          <DialogDescription>
            An AI summary of your most recent emails in this view.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Summarizing your inbox…
          </div>
        ) : isError ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Couldn't generate a digest right now. Please try again.
          </div>
        ) : data ? (
          data.count === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nothing to summarize here.
            </div>
          ) : (
            <ScrollArea className="flex-1 -mx-2 px-2">
              <div className="space-y-5">
                <div className="rounded-xl bg-muted/40 border border-border/50 p-4">
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {data.summary}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Based on {data.count} recent email{data.count > 1 ? "s" : ""}.
                  </p>
                </div>

                <div className="space-y-2">
                  {data.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border/40 p-3"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-foreground truncate">
                          {item.subject || "(no subject)"}
                        </span>
                        <span className="text-[11px] text-muted-foreground shrink-0 truncate max-w-[40%]">
                          {item.sender}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {item.summary}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
