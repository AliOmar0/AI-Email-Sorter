import { useEffect, useState } from "react";
import { useSendEmail, Email } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type ComposeMode = "compose" | "reply" | "forward";

interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ComposeMode;
  // Source message for reply/forward prefill.
  source?: Email | null;
  onSent?: () => void;
}

function stripPrefix(subject: string, re: RegExp): string {
  return subject.replace(re, "").trim();
}

function quoteOriginal(source: Email): string {
  const when = new Date(source.receivedAt).toLocaleString();
  const header = `On ${when}, ${source.sender} <${source.senderEmail}> wrote:`;
  const quoted = (source.body || "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\n${header}\n${quoted}`;
}

function forwardBlock(source: Email): string {
  return [
    "\n\n---------- Forwarded message ----------",
    `From: ${source.sender} <${source.senderEmail}>`,
    `Date: ${new Date(source.receivedAt).toLocaleString()}`,
    `Subject: ${source.subject}`,
    "",
    source.body || "",
  ].join("\n");
}

export function ComposeDialog({
  open,
  onOpenChange,
  mode,
  source,
  onSent,
}: ComposeDialogProps) {
  const { toast } = useToast();
  const send = useSendEmail();

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Prefill the fields when the dialog opens for a given mode/source.
  useEffect(() => {
    if (!open) return;
    if (mode === "reply" && source) {
      setTo(source.senderEmail);
      setCc("");
      setSubject(`Re: ${stripPrefix(source.subject, /^re:\s*/i)}`);
      setBody(quoteOriginal(source));
    } else if (mode === "forward" && source) {
      setTo("");
      setCc("");
      setSubject(`Fwd: ${stripPrefix(source.subject, /^fwd:\s*/i)}`);
      setBody(forwardBlock(source));
    } else {
      setTo("");
      setCc("");
      setSubject("");
      setBody("");
    }
  }, [open, mode, source]);

  const title =
    mode === "reply" ? "Reply" : mode === "forward" ? "Forward" : "New message";

  const handleSend = async () => {
    if (!to.trim()) {
      toast({
        title: "Recipient required",
        description: "Add at least one recipient.",
        variant: "destructive",
      });
      return;
    }
    try {
      await send.mutateAsync({
        data: {
          to: to.trim(),
          cc: cc.trim() || undefined,
          subject: subject.trim(),
          body,
          inReplyToId: mode === "reply" ? source?.id : undefined,
        },
      });
      toast({ title: "Message sent" });
      onOpenChange(false);
      onSent?.();
    } catch {
      toast({
        title: "Failed to send",
        description: "Your message could not be sent. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="compose-to">To</Label>
            <Input
              id="compose-to"
              type="email"
              placeholder="recipient@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              autoFocus={mode !== "reply"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compose-cc">Cc (optional)</Label>
            <Input
              id="compose-cc"
              type="email"
              placeholder="cc@example.com"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compose-subject">Subject</Label>
            <Input
              id="compose-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compose-body">Message</Label>
            <Textarea
              id="compose-body"
              rows={10}
              className="resize-y font-sans"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={send.isPending} className="gap-2">
            {send.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
