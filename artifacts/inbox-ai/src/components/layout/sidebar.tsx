import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { LayoutDashboard, Inbox, Tags, Sparkles, LogOut, Moon, Sun, Search } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useListLabels, getListLabelsQueryKey, User, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import { clearAuthToken, setActiveAccountId } from "@/lib/api-base";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
    >
      {mounted && isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function Sidebar({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  const queryClient = useQueryClient();
  const { data: labels = [] } = useListLabels({ query: { queryKey: getListLabelsQueryKey() } });

  // Search lives in the main sidebar and drives the inbox via the URL.
  const [query, setQuery] = useState(() => new URLSearchParams(searchString).get("search") || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setQuery(new URLSearchParams(searchString).get("search") || "");
  }, [searchString]);

  // Clear any pending debounce on unmount so a late timer can't navigate.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const goToSearch = (value: string) => {
    // Preserve any other active filters (e.g. a selected label) when searching.
    const next = new URLSearchParams(searchString);
    const trimmed = value.trim();
    if (trimmed) next.set("search", trimmed);
    else next.delete("search");
    const qs = next.toString();
    setLocation(qs ? `/inbox?${qs}` : "/inbox");
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => goToSearch(value), 300);
  };

  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        // Drop the cross-origin bearer token (no-op on Replit/cookie auth).
        clearAuthToken();
        setActiveAccountId(null);
        queryClient.clear();
        setLocation("/");
      }
    });
  };

  const activeLabelId = new URLSearchParams(searchString).get("labelId");

  const navItems = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/inbox", label: "Inbox", icon: Inbox },
    { href: "/labels", label: "Labels", icon: Tags },
    { href: "/ai", label: "AI Studio", icon: Sparkles },
  ];

  return (
    <div className="w-full md:w-64 border-r border-sidebar-border bg-sidebar h-full flex flex-col text-sidebar-foreground shrink-0">
      <div className="h-16 flex items-center justify-between px-6 shrink-0 mt-2">
        <div className="flex items-center gap-3 font-semibold text-lg tracking-tight text-sidebar-foreground">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <span>Inbox AI</span>
        </div>
        <ThemeToggle />
      </div>

      <div className="px-4 pt-1 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-sidebar-foreground/50" />
          <Input
            placeholder="Search emails..."
            value={query}
            onChange={handleSearchChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                goToSearch(query);
                onNavigate?.();
              }
            }}
            className="w-full pl-9 h-9 bg-sidebar-accent/40 border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50 shadow-none focus-visible:ring-1"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-8">
        <div className="px-4 space-y-1">
          {navItems.map((item) => {
            const matchesPath =
              location === item.href || (item.href !== "/" && location.startsWith(item.href));
            // When viewing a specific label, the Inbox item is "All mail" and shouldn't
            // claim the active state — the matching label below owns it instead.
            const isActive =
              item.href === "/inbox" ? matchesPath && !activeLabelId : matchesPath;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onNavigate?.()}
                aria-current={isActive ? "page" : undefined}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="px-4 flex-1">
          <div className="px-3 mb-3 text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-wider">
            Your Labels
          </div>
          <div className="space-y-0.5">
            {labels.map((label) => {
              const isActive = activeLabelId === label.id;
              return (
                <Link
                  key={label.id}
                  href={`/inbox?labelId=${label.id}`}
                  onClick={() => onNavigate?.()}
                  aria-current={isActive ? "page" : undefined}
                  className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-xl text-sm cursor-pointer transition-all group",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                        : "hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground"
                    )}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span 
                        className="w-2 h-2 rounded-full shrink-0" 
                        style={{ backgroundColor: label.color || '#888' }} 
                      />
                      <span className="truncate font-medium">{label.name}</span>
                    </div>
                    {label.emailCount > 0 && (
                      <span className={cn(
                        "text-[10px] bg-sidebar-accent px-1.5 py-0.5 rounded-[4px] text-sidebar-foreground/60 font-mono font-medium transition-opacity",
                        isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}>
                        {label.emailCount}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
            {labels.length === 0 && (
              <div className="px-3 py-2 text-xs text-sidebar-foreground/40">
                No labels created yet.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 shrink-0 space-y-3">
        <AccountSwitcher />
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-sidebar-border bg-sidebar-accent/30 shadow-sm">
          <Avatar className="h-9 w-9 rounded-lg border border-sidebar-border/50">
            {user.picture ? <AvatarImage src={user.picture} alt={user.name} className="rounded-lg" /> : null}
            <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground rounded-lg text-xs font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">{user.name}</p>
            <p className="text-[11px] text-sidebar-foreground/60 truncate font-medium">{user.email}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
