import { useState } from "react";
import { Menu, Sparkles } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { WelcomeDialog } from "./welcome-dialog";
import { User } from "@workspace/api-client-react";

export function AppLayout({ children, user }: { children: React.ReactNode; user: User }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Keyboard users can jump straight past the sidebar to the page content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>

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

      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col h-screen overflow-hidden relative min-w-0 outline-none">
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

      <WelcomeDialog />
    </div>
  );
}
