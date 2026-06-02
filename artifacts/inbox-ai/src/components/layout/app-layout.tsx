import { useState } from "react";
import { Menu, Sparkles } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { User } from "@workspace/api-client-react";

export function AppLayout({ children, user }: { children: React.ReactNode; user: User }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Desktop sidebar — always visible from md up */}
      <div className="hidden md:flex shrink-0">
        <Sidebar user={user} />
      </div>

      {/* Mobile sidebar — slides in as a drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="p-0 w-72 max-w-[85vw] [&>button]:hidden"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar user={user} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative min-w-0">
        {/* Mobile top bar with menu toggle */}
        <header className="md:hidden h-14 flex items-center gap-2 px-3 border-b border-border/50 shrink-0 bg-background">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
            <div className="w-7 h-7 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span>Inbox AI</span>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
