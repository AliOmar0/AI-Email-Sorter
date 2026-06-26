import { Sparkles, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-base";
import { ShaderBackground } from "@/components/shader-background";

export default function LoginPage() {
  const handleLogin = () => {
    // apiUrl prefixes the remote backend origin in cross-origin deploys; on
    // Replit it resolves to the same-origin "/api/auth/google".
    window.location.href = apiUrl("/api/auth/google");
  };

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background relative overflow-hidden items-center justify-center font-sans text-foreground">
      {/* Dynamic GPU shader background (degrades to the static blobs below if
          WebGPU/the library is unavailable). */}
      <ShaderBackground className="z-0 opacity-70" />
      {/* Scrim to keep the brand text and card readable over the shader. */}
      <div className="absolute inset-0 z-0 bg-background/50 pointer-events-none" />

      {/* Abstract Background Elements */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[30%] -right-[10%] w-[70%] h-[70%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-muted/50 blur-[100px]" />
      </div>
      
      <div className="flex flex-col items-center justify-center p-6 relative z-10 w-full max-w-sm">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-6 mb-10">
          <div className="h-16 w-16 bg-card rounded-2xl flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-border/50">
            <Sparkles className="h-7 w-7 text-primary" strokeWidth={1.5} />
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              Inbox AI
            </h1>
            <p className="text-base text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
              The intelligent command center for your overflowing inbox.
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="w-full bg-card/60 backdrop-blur-xl p-8 rounded-3xl border border-border/50 shadow-[0_8px_40px_rgb(0,0,0,0.04)] space-y-8 relative overflow-hidden">
          
          <div className="space-y-5 relative z-10">
            <div className="flex items-center gap-3 text-sm font-medium text-foreground border-b border-border/40 pb-4">
              <Mail className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              Connect your real Gmail inbox
            </div>
            <ul className="space-y-4 text-sm text-muted-foreground/80 font-medium">
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                DeepSeek AI categorization
              </li>
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                Context-aware bulk labeling
              </li>
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                Instant, confident organization
              </li>
            </ul>
          </div>

          <Button 
            className="w-full h-12 text-sm font-medium rounded-xl relative z-10 shadow-sm" 
            onClick={handleLogin}
          >
            Continue with Google
          </Button>
        </div>

      </div>
    </div>
  );
}
