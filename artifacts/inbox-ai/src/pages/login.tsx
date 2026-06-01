import { Sparkles, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const handleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-background relative overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background"></div>
      
      <div className="flex flex-1 items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="h-16 w-16 bg-sidebar rounded-2xl flex items-center justify-center shadow-lg border border-border">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight text-foreground font-sans">
                Inbox AI
              </h1>
              <p className="text-lg text-muted-foreground max-w-[300px] mx-auto">
                The intelligent command center for your overflowing inbox.
              </p>
            </div>
          </div>

          <div className="bg-card p-8 rounded-2xl border border-border shadow-sm space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm font-medium text-foreground">
                <Mail className="h-5 w-5 text-primary" />
                Connect your real Gmail inbox
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground ml-8 list-disc">
                <li>DeepSeek AI-powered categorization</li>
                <li>Context-aware bulk labeling</li>
                <li>Instant, confident organization</li>
              </ul>
            </div>

            <Button 
              className="w-full h-12 text-base font-semibold" 
              onClick={handleLogin}
            >
              Continue with Google
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
