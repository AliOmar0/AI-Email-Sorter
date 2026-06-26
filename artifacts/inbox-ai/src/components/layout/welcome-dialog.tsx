import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tags, Sparkles, Clock, Users } from "lucide-react";

const ONBOARDED_KEY = "inbox-ai-onboarded";

const STEPS = [
  { icon: Tags, title: "Create labels", body: "Make a few labels for the categories you care about — work, receipts, newsletters." },
  { icon: Sparkles, title: "Let AI sort", body: "Open AI Studio and run Magic Auto-Label to file your inbox automatically." },
  { icon: Clock, title: "Stay hands-off", body: "Turn on background labeling so new mail is organized for you on a schedule." },
  { icon: Users, title: "Add accounts", body: "Connect more Gmail accounts from the switcher and jump between them anytime." },
];

// First-run onboarding. Shown once per browser after the first successful
// login (flagged in localStorage), with a quick tour and a jump to AI Studio.
export function WelcomeDialog() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDED_KEY)) {
      // Defer slightly so it doesn't fight the initial app render.
      const t = setTimeout(() => setOpen(true), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  const dismiss = () => {
    localStorage.setItem(ONBOARDED_KEY, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Welcome to Inbox AI
          </DialogTitle>
          <DialogDescription>
            Your AI-powered inbox organizer. Here's how to get the most out of it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-muted/60 border border-border/50 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-foreground/70" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{s.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={dismiss}>
            Skip
          </Button>
          <Button
            onClick={() => {
              dismiss();
              navigate("/ai");
            }}
          >
            Go to AI Studio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
