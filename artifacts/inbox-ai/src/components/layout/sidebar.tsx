import { Link, useLocation } from "wouter";
import { LayoutDashboard, Inbox, Tags, Sparkles, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListLabels, getListLabelsQueryKey, User, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Sidebar({ user }: { user: User }) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: labels = [] } = useListLabels({ query: { queryKey: getListLabelsQueryKey() } });
  
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/");
      }
    });
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/inbox", label: "Inbox", icon: Inbox },
    { href: "/labels", label: "Labels", icon: Tags },
    { href: "/ai", label: "AI Studio", icon: Sparkles },
  ];

  return (
    <div className="w-64 border-r border-border bg-sidebar h-screen flex flex-col text-sidebar-foreground">
      <div className="h-14 flex items-center px-6 border-b border-sidebar-border/50 shrink-0">
        <div className="flex items-center gap-2 text-primary font-bold text-lg">
          <Sparkles className="w-5 h-5" />
          <span>Inbox AI</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors",
                    isActive
                      ? "bg-sidebar-primary/10 text-sidebar-primary"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/70"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-8 px-4">
          <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
            Labels
          </div>
          <div className="space-y-1">
            {labels.map((label) => (
              <Link key={label.id} href={`/inbox?labelId=${label.id}`}>
                <div
                  className="flex items-center justify-between px-3 py-1.5 rounded-md text-sm cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/70 group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: label.color || '#888' }} 
                    />
                    <span className="truncate">{label.name}</span>
                  </div>
                  {label.emailCount > 0 && (
                    <span className="text-xs bg-sidebar-accent/50 px-1.5 rounded-full text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70">
                      {label.emailCount}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-sidebar-border/50 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md">
          <Avatar className="h-9 w-9 border border-sidebar-border">
            {user.picture ? <AvatarImage src={user.picture} alt={user.name} /> : null}
            <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">{user.email}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
