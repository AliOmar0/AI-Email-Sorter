import { useEffect } from "react";
import {
  useListAccounts,
  getListAccountsQueryKey,
  useSwitchAccount,
  useUnlinkAccount,
  ConnectedAccount,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown, Plus, Check, Trash2, Mail } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { apiUrl, getActiveAccountId, setActiveAccountId } from "@/lib/api-base";
import { useToast } from "@/hooks/use-toast";

// Account switcher for multi-account users. Lives in the sidebar above the user
// card. Switching writes the active id locally (sent as X-Account-Id on every
// request) and refetches all data for the new mailbox. "Add account" runs the
// OAuth link flow as a top-level navigation to the backend.
export function AccountSwitcher() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: accounts = [] } = useListAccounts({
    query: { queryKey: getListAccountsQueryKey() },
  });
  const switchAccount = useSwitchAccount();
  const unlinkAccount = useUnlinkAccount();

  const active = accounts.find((a) => a.isActive) ?? accounts[0];

  // Keep the locally-stored active id (the X-Account-Id header source) in sync
  // with the backend's resolved active account — covers first load, just-linked
  // accounts, and unlinks.
  useEffect(() => {
    if (accounts.length === 0) return;
    const local = getActiveAccountId();
    const stillValid = local && accounts.some((a) => String(a.id) === local);
    if (!stillValid && active) setActiveAccountId(active.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  // Surface the result of the OAuth link redirect (?account=linked|conflict).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("account");
    if (!status) return;
    if (status === "linked") {
      // Let the backend session's newly-active account win until the list syncs.
      setActiveAccountId(null);
      queryClient.invalidateQueries();
      toast({ title: "Account connected" });
    } else if (status === "conflict") {
      toast({
        title: "Already connected elsewhere",
        description: "That Google account is linked to a different user.",
        variant: "destructive",
      });
    }
    params.delete("account");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSwitch = (account: ConnectedAccount) => {
    if (account.isActive) return;
    setActiveAccountId(account.id);
    switchAccount.mutate(
      { data: { accountId: account.id } },
      {
        onSuccess: () => {
          // Different mailbox — drop all cached data so everything refetches.
          queryClient.invalidateQueries();
          toast({ title: "Switched account", description: account.email });
        },
        onError: () => {
          toast({ title: "Couldn't switch account", variant: "destructive" });
        },
      },
    );
  };

  const handleAddAccount = () => {
    // Top-level navigation so the OAuth dance runs first-party on the backend.
    window.location.href = apiUrl("/api/auth/google?intent=link");
  };

  const handleUnlink = (account: ConnectedAccount, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    unlinkAccount.mutate(
      { id: account.id },
      {
        onSuccess: () => {
          if (String(account.id) === getActiveAccountId()) setActiveAccountId(null);
          queryClient.invalidateQueries();
          toast({ title: "Account removed", description: account.email });
        },
        onError: () => toast({ title: "Couldn't remove account", variant: "destructive" }),
      },
    );
  };

  if (!active) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-sidebar-border bg-sidebar-accent/30 hover:bg-sidebar-accent/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Switch account"
        >
          <Avatar className="h-7 w-7 rounded-md border border-sidebar-border/50 shrink-0">
            {active.picture ? <AvatarImage src={active.picture} alt={active.name} className="rounded-md" /> : null}
            <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground rounded-md text-[10px] font-semibold">
              {active.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="flex-1 min-w-0 text-xs font-medium text-sidebar-foreground truncate">
            {active.email}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-sidebar-foreground/50 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs">Accounts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map((account) => (
          <DropdownMenuItem
            key={account.id}
            onSelect={() => handleSwitch(account)}
            className="gap-2 cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1 min-w-0 truncate text-sm">{account.email}</span>
            {account.isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
            {!account.isPrimary && (
              <button
                onClick={(e) => handleUnlink(account, e)}
                className={cn(
                  "ml-1 p-1 rounded text-muted-foreground hover:text-destructive shrink-0",
                )}
                aria-label={`Unlink ${account.email}`}
                title="Unlink"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleAddAccount} className="gap-2 cursor-pointer">
          <Plus className="w-3.5 h-3.5" />
          Add another account
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
