import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListEmails,
  getListEmailsQueryKey,
  listEmails,
  useGetEmail,
  getGetEmailQueryKey,
  useUpdateEmail,
  useSetEmailLabels,
  useRemoveEmailLabel,
  useBulkLabelEmails,
  useBulkEmailAction,
  useUnsubscribeEmail,
  useSuggestEmailLabels,
  useCreateLabel,
  useListLabels,
  getListLabelsQueryKey,
  getGetStatsQueryKey,
  Label,
  Email,
  EmailPage,
  ListEmailsView,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Star, Inbox as InboxIcon, Tags, Filter,
  CheckSquare, Sparkles, X, Loader2, Mail, ArrowLeft,
  Archive, Trash2, ShieldAlert, MailOpen, Reply, Forward,
  PenSquare, Ban, Sparkles as SparklesIcon,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { LabelBadge } from "@/components/labels/label-badge";
import { EmailBody } from "@/components/inbox/email-body";
import { ComposeDialog, ComposeMode } from "@/components/inbox/compose-dialog";
import { DigestDialog } from "@/components/inbox/digest-dialog";
import { useToast } from "@/hooks/use-toast";
import { LabelPicker } from "@/components/labels/label-picker";

const VIEWS: { value: ListEmailsView; label: string; icon: typeof InboxIcon }[] = [
  { value: "all", label: "All", icon: InboxIcon },
  { value: "unlabeled", label: "Unlabeled", icon: Filter },
  { value: "starred", label: "Starred", icon: Star },
  { value: "unread", label: "Unread", icon: CheckSquare },
];

// High-level mailbox actions backed by /emails/bulk-action.
type MailAction = "archive" | "trash" | "spam" | "markRead" | "markUnread";

const isTypingTarget = (el: EventTarget | null): boolean => {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable
  );
};

export default function InboxPage() {
  // Filters live in the URL so the sidebar (labels + search) and the view tabs
  // below drive a single email list. Reading them reactively means clicking a
  // different label in the sidebar updates this page instead of being ignored.
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const params = new URLSearchParams(searchString);
  const view = (params.get("view") as ListEmailsView) || "all";
  const labelIdFilter = params.get("labelId") || undefined;
  const search = params.get("search") || "";

  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [activeEmailId, setActiveEmailId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [composeOpen, setComposeOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);

  // Pagination: react-query owns the first page (so it stays cached + is
  // invalidated by label/action mutations); subsequent "load more" pages are
  // appended here and reset whenever the active filter changes.
  const [appended, setAppended] = useState<Email[]>([]);
  const [moreToken, setMoreToken] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const listParams = { view, labelId: labelIdFilter, search };
  const { data: page, isLoading: isLoadingEmails } = useListEmails(
    listParams,
    { query: { queryKey: getListEmailsQueryKey(listParams) } }
  );

  const { data: labels = [] } = useListLabels({ query: { queryKey: getListLabelsQueryKey() } });

  const updateEmail = useUpdateEmail();
  const bulkLabel = useBulkLabelEmails();
  const bulkActionMut = useBulkEmailAction();
  const createLabel = useCreateLabel();

  // Whenever the active filter changes, close any open email, clear the
  // selection, and reset pagination so nothing points at a stale row.
  useEffect(() => {
    setActiveEmailId(null);
    setSelectedEmailIds(new Set());
    setFocusedIndex(0);
    setAppended([]);
    setMoreToken(undefined);
  }, [view, labelIdFilter, search]);

  // Deduped, ordered list = first page (react-query) + appended pages.
  const emails = useMemo(() => {
    const seen = new Set<string>();
    const out: Email[] = [];
    for (const e of [...(page?.emails ?? []), ...appended]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
    return out;
  }, [page?.emails, appended]);

  const nextToken = appended.length === 0 ? page?.nextPageToken ?? null : moreToken ?? null;
  const hasMore = Boolean(nextToken);

  const activeLabel = labelIdFilter ? labels.find((l) => l.id === labelIdFilter) : undefined;

  // Optimistically patch an email everywhere it's displayed (list cache, the
  // appended pages, and the open-email cache) so read/star toggles feel instant
  // instead of waiting for the round-trip + refetch.
  const patchEmailEverywhere = useCallback(
    (id: string, patch: Partial<Email>) => {
      queryClient.setQueryData<EmailPage>(
        getListEmailsQueryKey(listParams),
        (old) =>
          old
            ? { ...old, emails: old.emails.map((e) => (e.id === id ? { ...e, ...patch } : e)) }
            : old,
      );
      setAppended((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      queryClient.setQueryData<Email>(getGetEmailQueryKey(id), (old) =>
        old ? { ...old, ...patch } : old,
      );
    },
    [queryClient, view, labelIdFilter, search], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const loadMore = async () => {
    const token = nextToken;
    if (!token || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listEmails({ ...listParams, pageToken: token });
      setAppended((prev) => [...prev, ...res.emails]);
      setMoreToken(res.nextPageToken);
    } catch {
      toast({ title: "Couldn't load more", variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  };

  const navigateWithParams = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchString);
    mutate(next);
    const qs = next.toString();
    navigate(qs ? `/inbox?${qs}` : "/inbox");
  };

  const selectView = (v: ListEmailsView) => {
    navigateWithParams((p) => {
      p.set("view", v);
      p.delete("labelId");
    });
  };

  const clearLabelFilter = () => {
    navigateWithParams((p) => p.delete("labelId"));
  };

  const toggleSelectAll = () => {
    if (selectedEmailIds.size === emails.length) {
      setSelectedEmailIds(new Set());
    } else {
      setSelectedEmailIds(new Set(emails.map((e) => e.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedEmailIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedEmailIds(newSet);
  };

  const handleToggleStar = (email: Email) => {
    const previous = email.isStarred;
    const next = !previous;
    patchEmailEverywhere(email.id, { isStarred: next });
    updateEmail.mutate(
      { id: email.id, data: { isStarred: next } },
      {
        onSuccess: (updated) => patchEmailEverywhere(email.id, updated),
        onError: () => {
          patchEmailEverywhere(email.id, { isStarred: previous });
          toast({ title: "Couldn't update star", variant: "destructive" });
        },
      },
    );
  };

  const handleToggleRead = (email: Email) => {
    const previous = email.isRead;
    const next = !previous;
    patchEmailEverywhere(email.id, { isRead: next });
    updateEmail.mutate(
      { id: email.id, data: { isRead: next } },
      {
        onSuccess: (updated) => patchEmailEverywhere(email.id, updated),
        onError: () => {
          patchEmailEverywhere(email.id, { isRead: previous });
          toast({ title: "Couldn't update read state", variant: "destructive" });
        },
      },
    );
  };

  // Apply a mailbox action (archive/trash/spam/read) to a set of emails.
  const applyMailAction = async (ids: string[], action: MailAction) => {
    if (ids.length === 0) return;

    // markRead/markUnread are reversible visual state — patch optimistically.
    if (action === "markRead" || action === "markUnread") {
      const read = action === "markRead";
      ids.forEach((id) => patchEmailEverywhere(id, { isRead: read }));
    }

    try {
      await bulkActionMut.mutateAsync({ data: { emailIds: ids, action } });
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      // archive/trash/spam remove rows from the view — drop appended pages so
      // the refetched first page is authoritative.
      if (action === "archive" || action === "trash" || action === "spam") {
        setAppended([]);
        setMoreToken(undefined);
        if (activeEmailId && ids.includes(activeEmailId)) setActiveEmailId(null);
      }
      setSelectedEmailIds(new Set());
      const verb =
        action === "archive" ? "Archived"
        : action === "trash" ? "Moved to trash"
        : action === "spam" ? "Marked as spam"
        : action === "markRead" ? "Marked as read"
        : "Marked as unread";
      toast({ title: verb, description: `${ids.length} email${ids.length > 1 ? "s" : ""}.` });
    } catch {
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      toast({ title: "Action failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleBulkAction = async (action: "add" | "remove", targetLabelId: string) => {
    if (selectedEmailIds.size === 0) return;
    try {
      await bulkLabel.mutateAsync({
        data: { emailIds: Array.from(selectedEmailIds), labelId: targetLabelId, action },
      });
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      toast({
        title: `Labels ${action === "add" ? "applied" : "removed"}`,
        description: `Successfully processed ${selectedEmailIds.size} emails.`,
      });
      setSelectedEmailIds(new Set());
    } catch (e) {
      toast({ title: "Error", description: "Failed to process bulk action.", variant: "destructive" });
    }
  };

  const handleBulkCreateAndApply = async (name: string, color: string) => {
    if (selectedEmailIds.size === 0) return;
    try {
      const newLabel = await createLabel.mutateAsync({ data: { name, color } });
      queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
      await handleBulkAction("add", newLabel.id);
    } catch (e) {
      toast({ title: "Error", description: "Failed to create label.", variant: "destructive" });
    }
  };

  // Keyboard shortcuts (Gmail-style). The "current" target is the open email,
  // or the highlighted row when browsing the list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || composeOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const current =
        (activeEmailId && emails.find((x) => x.id === activeEmailId)) ||
        emails[focusedIndex];

      switch (e.key) {
        case "j":
        case "ArrowDown":
          if (emails.length) {
            e.preventDefault();
            setFocusedIndex((i) => Math.min(i + 1, emails.length - 1));
          }
          break;
        case "k":
        case "ArrowUp":
          if (emails.length) {
            e.preventDefault();
            setFocusedIndex((i) => Math.max(i - 1, 0));
          }
          break;
        case "Enter":
        case "o":
          if (emails[focusedIndex]) {
            e.preventDefault();
            setActiveEmailId(emails[focusedIndex].id);
          }
          break;
        case "x":
          if (emails[focusedIndex]) {
            e.preventDefault();
            toggleSelect(emails[focusedIndex].id);
          }
          break;
        case "e":
          if (current) {
            e.preventDefault();
            applyMailAction(
              selectedEmailIds.size > 0 ? [...selectedEmailIds] : [current.id],
              "archive",
            );
          }
          break;
        case "#":
          if (current) {
            e.preventDefault();
            applyMailAction(
              selectedEmailIds.size > 0 ? [...selectedEmailIds] : [current.id],
              "trash",
            );
          }
          break;
        case "s":
          if (current) {
            e.preventDefault();
            handleToggleStar(current);
          }
          break;
        case "u":
          if (current) {
            e.preventDefault();
            handleToggleRead({ ...current, isRead: true }); // toggles to unread
          }
          break;
        case "Escape":
          if (activeEmailId) {
            e.preventDefault();
            setActiveEmailId(null);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [emails, focusedIndex, activeEmailId, selectedEmailIds, composeOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectionActive = selectedEmailIds.size > 0;

  const emailListPanel = (
    <div className="h-full flex flex-col min-w-0">
      <div className="border-b border-border/50 bg-background z-10 shrink-0">
        <div className="h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-3 min-w-0">
            <Checkbox
              checked={emails.length > 0 && selectedEmailIds.size === emails.length}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all"
              className="rounded-[4px]"
            />
            {selectionActive ? (
              <span className="text-sm text-foreground font-medium whitespace-nowrap">
                {selectedEmailIds.size} selected
              </span>
            ) : activeLabel ? (
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: activeLabel.color || "#888" }}
                />
                <span className="text-sm text-foreground font-semibold truncate">
                  {activeLabel.name}
                </span>
                <button
                  onClick={clearLabelFilter}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  aria-label="Clear label filter and show all mail"
                  title="Back to all mail"
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">All mail</span>
                </button>
              </div>
            ) : (
              <span className="text-sm text-foreground font-semibold whitespace-nowrap">
                {view === "all" ? "All mail" : VIEWS.find((v) => v.value === view)?.label ?? "Inbox"}
              </span>
            )}
          </div>

          {selectionActive ? (
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 animate-in fade-in zoom-in-95 duration-200">
              <Button variant="ghost" size="icon" title="Archive" aria-label="Archive selected"
                onClick={() => applyMailAction([...selectedEmailIds], "archive")}
                className="h-9 w-9 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full">
                <Archive className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Delete (trash)" aria-label="Move selected to trash"
                onClick={() => applyMailAction([...selectedEmailIds], "trash")}
                className="h-9 w-9 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full">
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Report spam" aria-label="Mark selected as spam"
                onClick={() => applyMailAction([...selectedEmailIds], "spam")}
                className="h-9 w-9 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full">
                <ShieldAlert className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Mark as read" aria-label="Mark selected as read"
                onClick={() => applyMailAction([...selectedEmailIds], "markRead")}
                className="h-9 w-9 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full">
                <MailOpen className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Mark as unread" aria-label="Mark selected as unread"
                onClick={() => applyMailAction([...selectedEmailIds], "markUnread")}
                className="h-9 w-9 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full">
                <Mail className="w-4 h-4" />
              </Button>
              <LabelPicker
                align="end"
                trigger={
                  <Button variant="outline" size="sm" className="h-9 sm:h-8 gap-2 px-3 border-border/60 shadow-none">
                    <Tags className="w-3.5 h-3.5" />
                    Label
                  </Button>
                }
                onCreate={handleBulkCreateAndApply}
                sections={[
                  { heading: "Apply Label", labels, onSelect: (id) => handleBulkAction("add", id) },
                  {
                    heading: "Remove Label",
                    labels,
                    onSelect: (id) => handleBulkAction("remove", id),
                    itemClassName: "text-destructive data-[selected=true]:text-destructive",
                  },
                ]}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedEmailIds(new Set())}
                aria-label="Clear selection"
                title="Clear selection"
                className="h-9 w-9 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 sm:h-8 gap-2 px-2.5 text-muted-foreground hover:text-foreground"
                onClick={() => setDigestOpen(true)}
                title="AI digest of this view"
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Digest</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 sm:h-8 gap-2 px-3 border-border/60 shadow-none"
                onClick={() => setComposeOpen(true)}
              >
                <PenSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Compose</span>
              </Button>
            </div>
          )}
        </div>

        {/* View filter tabs */}
        <div className="flex items-center gap-1 px-3 pb-2 overflow-x-auto">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const isActive = view === v.value && !labelIdFilter;
            return (
              <button
                key={v.value}
                onClick={() => selectView(v.value)}
                aria-pressed={isActive}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="flex-1 bg-background">
        {isLoadingEmails ? (
          <div className="divide-y divide-border/30">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="p-4 space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-muted/50 text-muted-foreground">
              <InboxIcon className="w-6 h-6 opacity-50" />
            </div>
            <p className="font-medium text-foreground text-sm">No emails found</p>
            <p className="text-xs mt-1">You're all caught up.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {emails.map((email, idx) => (
              <div
                key={email.id}
                role="button"
                tabIndex={0}
                aria-label={`Open email from ${email.sender}: ${email.subject}`}
                className={cn(
                  "group flex items-start gap-3 p-4 cursor-pointer transition-colors relative",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  activeEmailId === email.id ? "bg-muted/40" : "hover:bg-muted/20",
                  focusedIndex === idx && !activeEmailId ? "ring-1 ring-inset ring-primary/40" : "",
                )}
                onClick={() => { setActiveEmailId(email.id); setFocusedIndex(idx); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveEmailId(email.id);
                  }
                }}
              >
                {!email.isRead && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />}

                <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    className="rounded-[4px] data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
                    checked={selectedEmailIds.has(email.id)}
                    onCheckedChange={() => toggleSelect(email.id)}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn("truncate text-sm", !email.isRead ? "text-foreground font-semibold" : "text-foreground/70 font-medium")}>
                      {email.sender}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap ml-2 tabular-nums">
                      {format(new Date(email.receivedAt), "MMM d")}
                    </span>
                  </div>

                  <div className={cn("text-sm truncate mb-1", !email.isRead ? "text-foreground font-medium" : "text-muted-foreground")}>
                    {email.subject}
                  </div>

                  <div className="text-xs text-muted-foreground truncate mb-2 leading-relaxed">
                    {email.snippet}
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex flex-wrap gap-1.5">
                      {email.labels.slice(0, 3).map((l) => (
                        <LabelBadge key={l.id} label={l} />
                      ))}
                      {email.labels.length > 3 && (
                        <span className="text-[10px] text-muted-foreground px-1 py-0.5 bg-muted rounded-full">+{email.labels.length - 3}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={email.isStarred ? `Unstar email from ${email.sender}` : `Star email from ${email.sender}`}
                      aria-pressed={email.isStarred}
                      title={email.isStarred ? "Unstar" : "Star"}
                      className="shrink-0 rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(e) => { e.stopPropagation(); handleToggleStar(email); }}
                    >
                      <Star className={cn("w-4 h-4 transition-colors", email.isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30 hover:text-muted-foreground")} strokeWidth={email.isStarred ? 2 : 1.5} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {hasMore && (
              <div className="p-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="gap-2 border-border/60 shadow-none"
                >
                  {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <div className="h-full w-full bg-background">
      {activeEmailId ? (
        isMobile ? (
          <div className="h-full flex flex-col bg-background relative z-0 min-w-0">
            <EmailDetail emailId={activeEmailId} labels={labels} onClose={() => setActiveEmailId(null)} onArchived={() => setActiveEmailId(null)} />
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" autoSaveId="inbox-reader" className="h-full w-full">
            <ResizablePanel defaultSize={42} minSize={28}>
              {emailListPanel}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={58} minSize={30}>
              <div className="h-full flex flex-col bg-background relative z-0 min-w-0">
                <EmailDetail emailId={activeEmailId} labels={labels} onClose={() => setActiveEmailId(null)} onArchived={() => setActiveEmailId(null)} />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )
      ) : (
        emailListPanel
      )}

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        mode="compose"
        onSent={() => toast({ title: "Message sent" })}
      />

      <DigestDialog
        open={digestOpen}
        onOpenChange={setDigestOpen}
        view={view}
        labelId={labelIdFilter}
        scopeLabel={
          activeLabel?.name ??
          (view === "all" ? "All mail" : VIEWS.find((v) => v.value === view)?.label ?? "Inbox")
        }
      />
    </div>
  );
}

function EmailDetail({
  emailId,
  labels,
  onClose,
  onArchived,
}: {
  emailId: string;
  labels: Label[];
  onClose: () => void;
  onArchived: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [compose, setCompose] = useState<{ open: boolean; mode: ComposeMode }>({
    open: false,
    mode: "reply",
  });

  const { data: email, isLoading } = useGetEmail(emailId, {
    query: { enabled: !!emailId, queryKey: getGetEmailQueryKey(emailId) },
  });

  const suggestLabels = useSuggestEmailLabels();
  const removeLabel = useRemoveEmailLabel();
  const setLabels = useSetEmailLabels();
  const createLabel = useCreateLabel();
  const updateEmail = useUpdateEmail();
  const bulkActionMut = useBulkEmailAction();
  const unsubscribe = useUnsubscribeEmail();

  // Mark unread emails read once opened (optimistically + persisted).
  useEffect(() => {
    if (email && !email.isRead) {
      queryClient.setQueryData<Email>(getGetEmailQueryKey(email.id), (old) =>
        old ? { ...old, isRead: true } : old,
      );
      updateEmail.mutate(
        { id: email.id, data: { isRead: true } },
        {
          onSuccess: (updated) => {
            queryClient.setQueryData<Email>(getGetEmailQueryKey(email.id), updated);
            queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
          },
          onError: () => {
            queryClient.setQueryData<Email>(getGetEmailQueryKey(email.id), (old) =>
              old ? { ...old, isRead: false } : old,
            );
          },
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email?.id]);

  if (isLoading || !email) {
    return (
      <div className="p-8 space-y-8 max-w-4xl mx-auto w-full animate-in fade-in">
        <Skeleton className="h-8 w-3/4" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="space-y-4 pt-8 border-t border-border/40">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[92%]" />
          <Skeleton className="h-4 w-[97%]" />
          <Skeleton className="h-4 w-[85%]" />
          <Skeleton className="h-4 w-[90%]" />
          <Skeleton className="h-4 w-[70%]" />
        </div>
      </div>
    );
  }

  const setReadOptimistic = (next: boolean) => {
    const previous = email.isRead;
    queryClient.setQueryData<Email>(getGetEmailQueryKey(email.id), (old) =>
      old ? { ...old, isRead: next } : old,
    );
    updateEmail.mutate(
      { id: email.id, data: { isRead: next } },
      {
        onSuccess: (updated) =>
          queryClient.setQueryData<Email>(getGetEmailQueryKey(email.id), updated),
        onError: () => {
          queryClient.setQueryData<Email>(getGetEmailQueryKey(email.id), (old) =>
            old ? { ...old, isRead: previous } : old,
          );
          toast({ title: "Couldn't update read state", variant: "destructive" });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() }),
      },
    );
  };

  const setStarOptimistic = (next: boolean) => {
    const previous = email.isStarred;
    queryClient.setQueryData<Email>(getGetEmailQueryKey(email.id), (old) =>
      old ? { ...old, isStarred: next } : old,
    );
    updateEmail.mutate(
      { id: email.id, data: { isStarred: next } },
      {
        onSuccess: (updated) =>
          queryClient.setQueryData<Email>(getGetEmailQueryKey(email.id), updated),
        onError: () => {
          queryClient.setQueryData<Email>(getGetEmailQueryKey(email.id), (old) =>
            old ? { ...old, isStarred: previous } : old,
          );
          toast({ title: "Couldn't update star", variant: "destructive" });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() }),
      },
    );
  };

  const runDetailAction = async (action: MailAction) => {
    try {
      await bulkActionMut.mutateAsync({ data: { emailIds: [email.id], action } });
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      if (action === "archive" || action === "trash" || action === "spam") onArchived();
      const verb =
        action === "archive" ? "Archived" : action === "trash" ? "Moved to trash" : "Marked as spam";
      toast({ title: verb });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    }
  };

  const handleUnsubscribe = async () => {
    try {
      const res = await unsubscribe.mutateAsync({ id: email.id });
      if (res.status === "posted") {
        toast({ title: "Unsubscribed", description: "Your request was sent to the sender." });
      } else if (res.status === "open" && res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
        toast({ title: "Opened unsubscribe page", description: "Complete it in the new tab." });
      } else {
        toast({ title: "No unsubscribe link", description: "This sender didn't provide one.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Unsubscribe failed", variant: "destructive" });
    }
  };

  const handleRemoveLabel = async (labelId: string) => {
    try {
      await removeLabel.mutateAsync({ id: email.id, labelId });
      queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(email.id) });
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
    } catch (e) {}
  };

  const addLabelToEmail = (labelId: string) => {
    setLabels.mutate(
      { id: email.id, data: { labelIds: [...email.labels.map((el) => el.id), labelId] } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(email.id) });
          queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
        },
      },
    );
  };

  const handleCreateAndApply = async (name: string, color: string) => {
    try {
      const newLabel = await createLabel.mutateAsync({ data: { name, color } });
      queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
      await setLabels.mutateAsync({
        id: email.id,
        data: { labelIds: [...email.labels.map((el) => el.id), newLabel.id] },
      });
      queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(email.id) });
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      toast({ title: "Label created", description: `Created and applied "${name}".` });
    } catch (e) {
      toast({ title: "Error", description: "Failed to create label.", variant: "destructive" });
    }
  };

  const handleApplySuggestion = async (suggestion: any) => {
    try {
      let targetLabelId = suggestion.labelId;
      if (suggestion.isNew) {
        const newLabel = await createLabel.mutateAsync({
          data: { name: suggestion.name, color: suggestion.color || "#6366f1", description: suggestion.reason },
        });
        targetLabelId = newLabel.id;
        queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
      }
      const newLabelIds = [...new Set([...email.labels.map((l) => l.id), targetLabelId])];
      await setLabels.mutateAsync({ id: email.id, data: { labelIds: newLabelIds } });
      queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(email.id) });
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      toast({ title: "Label applied", description: `Applied "${suggestion.name}" to email.` });
    } catch (e) {
      toast({ title: "Error", description: "Failed to apply label.", variant: "destructive" });
    }
  };

  const requestSuggestions = () => suggestLabels.mutate({ id: email.id });

  const canUnsubscribe = Boolean(email.unsubscribeUrl || email.unsubscribeMailto);

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in duration-300">
      {/* Header Actions */}
      <div className="h-14 border-b border-border/50 flex items-center justify-between px-4 shrink-0 bg-background/95 backdrop-blur z-10">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Back to inbox" className="md:hidden mr-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Reply" aria-label="Reply"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            onClick={() => setCompose({ open: true, mode: "reply" })}>
            <Reply className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Forward" aria-label="Forward"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            onClick={() => setCompose({ open: true, mode: "forward" })}>
            <Forward className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Archive" aria-label="Archive"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            onClick={() => runDetailAction("archive")}>
            <Archive className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Delete (trash)" aria-label="Move to trash"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            onClick={() => runDetailAction("trash")}>
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Report spam" aria-label="Report spam"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            onClick={() => runDetailAction("spam")}>
            <ShieldAlert className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            onClick={() => setStarOptimistic(!email.isStarred)} title={email.isStarred ? "Unstar" : "Star"} aria-label={email.isStarred ? "Unstar" : "Star"}>
            <Star className={cn("w-4 h-4", email.isStarred && "fill-yellow-400 text-yellow-400")} />
          </Button>
          <Button variant="ghost" size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            onClick={() => setReadOptimistic(!email.isRead)} title={email.isRead ? "Mark as unread" : "Mark as read"} aria-label={email.isRead ? "Mark as unread" : "Mark as read"}>
            <Mail className={cn("w-4 h-4", !email.isRead && "fill-foreground text-foreground")} />
          </Button>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          {canUnsubscribe && (
            <Button variant="outline" size="sm" className="gap-2 h-8 rounded-lg border-border/60 shadow-none text-xs font-medium"
              onClick={handleUnsubscribe} disabled={unsubscribe.isPending}>
              {unsubscribe.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
              Unsubscribe
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2 h-8 rounded-lg border-border/60 shadow-none text-xs font-medium" onClick={requestSuggestions} disabled={suggestLabels.isPending}>
            {suggestLabels.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Suggest Labels
          </Button>
          <LabelPicker
            align="end"
            trigger={
              <Button variant="outline" size="sm" className="gap-2 h-8 rounded-lg border-border/60 shadow-none text-xs font-medium">
                <Tags className="w-3.5 h-3.5" />
                Add Label
              </Button>
            }
            onCreate={handleCreateAndApply}
            sections={[
              {
                heading: "Available Labels",
                labels: labels.filter((l) => !email.labels.find((el) => el.id === l.id)),
                onSelect: (id) => addLabelToEmail(id),
                emptyText: "No more labels",
              },
            ]}
          />
        </div>

        <div className="sm:hidden flex items-center gap-1">
          {canUnsubscribe && (
            <Button variant="ghost" size="icon" aria-label="Unsubscribe" title="Unsubscribe" onClick={handleUnsubscribe} disabled={unsubscribe.isPending}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full">
              {unsubscribe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Suggest labels" title="Suggest Labels" onClick={requestSuggestions} disabled={suggestLabels.isPending}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full">
            {suggestLabels.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          </Button>
          <LabelPicker
            align="end"
            trigger={
              <Button variant="ghost" size="icon" aria-label="Add label" title="Add Label" className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full">
                <Tags className="w-4 h-4" />
              </Button>
            }
            onCreate={handleCreateAndApply}
            sections={[
              {
                heading: "Add Label",
                labels: labels.filter((l) => !email.labels.find((el) => el.id === l.id)),
                onSelect: (id) => addLabelToEmail(id),
                emptyText: "No more labels",
              },
            ]}
          />
        </div>

        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close email" title="Close"
          className="hidden md:inline-flex text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-8 max-w-[800px] mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-6 leading-tight">{email.subject}</h1>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-muted/80 border border-border/50 flex items-center justify-center text-foreground font-medium text-lg shrink-0">
                  {email.sender.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">{email.sender}</span>
                    <span className="text-xs text-muted-foreground">&lt;{email.senderEmail}&gt;</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    to me • {format(new Date(email.receivedAt), "MMM d, yyyy, h:mm a")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {email.labels.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {email.labels.map((label) => (
                <LabelBadge key={label.id} label={label} size="md" onRemove={() => handleRemoveLabel(label.id)} />
              ))}
            </div>
          )}

          {suggestLabels.isSuccess && suggestLabels.data && suggestLabels.data.length > 0 && (
            <div className="bg-muted/30 border border-border/50 rounded-2xl p-5 animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-2 text-foreground font-medium mb-4 text-sm">
                <Sparkles className="w-4 h-4" />
                AI Suggestions
              </div>
              <div className="space-y-3">
                {suggestLabels.data.map((suggestion, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-background rounded-xl p-4 border border-border/40 shadow-sm">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <LabelBadge label={{ name: suggestion.name, color: suggestion.color || "#6366f1" }} />
                        {suggestion.isNew && (
                          <span className="text-[10px] uppercase font-bold text-foreground bg-muted px-1.5 py-0.5 rounded-sm">New</span>
                        )}
                        <span className="text-[11px] font-mono text-muted-foreground px-1.5 py-0.5 bg-muted/50 rounded-sm">
                          {Math.round(suggestion.confidence * 100)}% match
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{suggestion.reason}</p>
                    </div>
                    <Button size="sm" onClick={() => handleApplySuggestion(suggestion)} className="shrink-0 h-8 rounded-lg">
                      Apply
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body */}
          <div className="pt-8 border-t border-border/40">
            <EmailBody html={email.bodyHtml} text={email.body} hasRemoteImages={email.hasRemoteImages} />
          </div>
        </div>
      </ScrollArea>

      <ComposeDialog
        open={compose.open}
        onOpenChange={(open) => setCompose((c) => ({ ...c, open }))}
        mode={compose.mode}
        source={email}
        onSent={() => queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() })}
      />
    </div>
  );
}
