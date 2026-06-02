import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { 
  useListEmails, 
  getListEmailsQueryKey, 
  useGetEmail,
  getGetEmailQueryKey,
  useUpdateEmail,
  useSetEmailLabels,
  useRemoveEmailLabel,
  useBulkLabelEmails,
  useSuggestEmailLabels,
  useCreateLabel,
  useListLabels,
  getListLabelsQueryKey,
  Label,
  Email,
  ListEmailsView
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Star, Inbox as InboxIcon, Tags, Filter, 
  CheckSquare, Sparkles, X, Loader2, Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { LabelBadge } from "@/components/labels/label-badge";
import { EmailBody } from "@/components/inbox/email-body";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const VIEWS: { value: ListEmailsView; label: string; icon: typeof InboxIcon }[] = [
  { value: "all", label: "All", icon: InboxIcon },
  { value: "unlabeled", label: "Unlabeled", icon: Filter },
  { value: "starred", label: "Starred", icon: Star },
  { value: "unread", label: "Unread", icon: CheckSquare },
];

export default function InboxPage() {
  // Filters live in the URL so the sidebar (labels + search) and the view tabs
  // below drive a single email list. Reading them reactively means clicking a
  // different label in the sidebar updates this page instead of being ignored.
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(searchString);
  const view = (params.get("view") as ListEmailsView) || "all";
  const labelIdFilter = params.get("labelId") || undefined;
  const search = params.get("search") || "";

  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [activeEmailId, setActiveEmailId] = useState<string | null>(null);

  // Whenever the active filter changes, close any open email and clear the
  // current selection so they never point at a row that's no longer listed.
  useEffect(() => {
    setActiveEmailId(null);
    setSelectedEmailIds(new Set());
  }, [view, labelIdFilter, search]);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: emails = [], isLoading: isLoadingEmails } = useListEmails(
    { view, labelId: labelIdFilter, search },
    { query: { queryKey: getListEmailsQueryKey({ view, labelId: labelIdFilter, search }) } }
  );

  const { data: labels = [] } = useListLabels({ query: { queryKey: getListLabelsQueryKey() } });

  const updateEmail = useUpdateEmail();
  const bulkLabel = useBulkLabelEmails();

  const activeLabel = labelIdFilter ? labels.find((l) => l.id === labelIdFilter) : undefined;

  // Change one filter while preserving the rest of the query string (e.g. an
  // active search), so filters compose instead of clobbering each other.
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
      setSelectedEmailIds(new Set(emails.map(e => e.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedEmailIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedEmailIds(newSet);
  };

  const handleToggleStar = async (email: Email) => {
    await updateEmail.mutateAsync({ id: email.id, data: { isStarred: !email.isStarred } });
    queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
  };

  const handleBulkAction = async (action: "add" | "remove", targetLabelId: string) => {
    if (selectedEmailIds.size === 0) return;
    
    try {
      await bulkLabel.mutateAsync({
        data: {
          emailIds: Array.from(selectedEmailIds),
          labelId: targetLabelId,
          action
        }
      });
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      toast({
        title: `Labels ${action === "add" ? "applied" : "removed"}`,
        description: `Successfully processed ${selectedEmailIds.size} emails.`
      });
      setSelectedEmailIds(new Set());
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to process bulk action.",
        variant: "destructive"
      });
    }
  };

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
            {selectedEmailIds.size > 0 ? (
              <span className="text-sm text-foreground font-medium whitespace-nowrap">
                {selectedEmailIds.size} selected
              </span>
            ) : activeLabel ? (
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: activeLabel.color || '#888' }}
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
          
          {selectedEmailIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-2 border-border/60 shadow-none">
                    <Tags className="w-3.5 h-3.5" />
                    Label
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-lg">
                  <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">Apply Label</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {labels.map(l => (
                    <DropdownMenuItem key={l.id} onClick={() => handleBulkAction("add", l.id)} className="rounded-lg">
                      <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: l.color || '#888' }} />
                      {l.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">Remove Label</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {labels.map(l => (
                    <DropdownMenuItem key={l.id} onClick={() => handleBulkAction("remove", l.id)} className="rounded-lg text-destructive focus:text-destructive">
                      <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: l.color || '#888' }} />
                      {l.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* View filter tabs (moved out of the old duplicate side panel) */}
        <div className="flex items-center gap-1 px-3 pb-2 overflow-x-auto">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const isActive = view === v.value && !labelIdFilter;
            return (
              <button
                key={v.value}
                onClick={() => selectView(v.value)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
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
              {emails.map(email => (
                <div 
                  key={email.id}
                  className={cn(
                    "group flex items-start gap-3 p-4 cursor-pointer transition-colors relative",
                    activeEmailId === email.id ? "bg-muted/40" : "hover:bg-muted/20",
                  )}
                  onClick={() => setActiveEmailId(email.id)}
                >
                  {/* Read status indicator */}
                  {!email.isRead && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
                  )}

                  <div className="pt-0.5 shrink-0" onClick={e => e.stopPropagation()}>
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
                        {format(new Date(email.receivedAt), 'MMM d')}
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
                        {email.labels.slice(0, 3).map(l => (
                          <LabelBadge key={l.id} label={l} />
                        ))}
                        {email.labels.length > 3 && (
                          <span className="text-[10px] text-muted-foreground px-1 py-0.5 bg-muted rounded-full">+{email.labels.length - 3}</span>
                        )}
                      </div>
                      <div className="shrink-0" onClick={(e) => { e.stopPropagation(); handleToggleStar(email); }}>
                        <Star className={cn("w-4 h-4 transition-colors", email.isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30 hover:text-muted-foreground")} strokeWidth={email.isStarred ? 2 : 1.5} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
    </div>
  );

  // Two panels: the email list (driven by the sidebar + view tabs) and, only
  // once an email is opened, a reading pane beside it.
  return (
    <div className="h-full w-full bg-background">
      {activeEmailId ? (
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId="inbox-reader"
          className="h-full w-full"
        >
          <ResizablePanel defaultSize={42} minSize={28}>
            {emailListPanel}
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={58} minSize={30}>
            <div className="h-full flex flex-col bg-background relative z-0 min-w-0">
              <EmailDetail 
                emailId={activeEmailId} 
                labels={labels}
                onClose={() => setActiveEmailId(null)}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        emailListPanel
      )}
    </div>
  );
}

function EmailDetail({ emailId, labels, onClose }: { emailId: string, labels: Label[], onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: email, isLoading } = useGetEmail(emailId, { 
    query: { 
      enabled: !!emailId, 
      queryKey: getGetEmailQueryKey(emailId) 
    } 
  });

  const suggestLabels = useSuggestEmailLabels();
  const removeLabel = useRemoveEmailLabel();
  const setLabels = useSetEmailLabels();
  const createLabel = useCreateLabel();
  const updateEmail = useUpdateEmail();

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
        <div className="space-y-4 pt-8">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[90%]" />
          <Skeleton className="h-4 w-[95%]" />
          <Skeleton className="h-4 w-[80%]" />
        </div>
      </div>
    );
  }

  const handleRemoveLabel = async (labelId: string) => {
    try {
      await removeLabel.mutateAsync({ id: email.id, labelId });
      queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(email.id) });
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
    } catch (e) {}
  };

  const handleApplySuggestion = async (suggestion: any) => {
    try {
      let targetLabelId = suggestion.labelId;
      
      if (suggestion.isNew) {
        const newLabel = await createLabel.mutateAsync({
          data: {
            name: suggestion.name,
            color: suggestion.color || "#6366f1",
            description: suggestion.reason
          }
        });
        targetLabelId = newLabel.id;
        queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
      }

      const newLabelIds = [...new Set([...email.labels.map(l => l.id), targetLabelId])];
      
      await setLabels.mutateAsync({
        id: email.id,
        data: { labelIds: newLabelIds }
      });
      
      queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(email.id) });
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      
      toast({
        title: "Label applied",
        description: `Applied "${suggestion.name}" to email.`
      });
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to apply label.",
        variant: "destructive"
      });
    }
  };

  const requestSuggestions = () => {
    suggestLabels.mutate({ id: email.id });
  };

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in duration-300">
      {/* Header Actions */}
      <div className="h-14 border-b border-border/50 flex items-center justify-between px-4 shrink-0 bg-background/95 backdrop-blur z-10">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden mr-2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            onClick={() => updateEmail.mutate({ id: email.id, data: { isStarred: !email.isStarred } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(email.id) }) })}
          >
            <Star className={cn("w-4 h-4", email.isStarred && "fill-yellow-400 text-yellow-400")} />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            onClick={() => updateEmail.mutate({ id: email.id, data: { isRead: !email.isRead } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(email.id) }) })}
            title={email.isRead ? "Mark as unread" : "Mark as read"}
          >
            <Mail className={cn("w-4 h-4", !email.isRead && "fill-foreground text-foreground")} />
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 h-8 rounded-lg border-border/60 shadow-none text-xs font-medium" onClick={requestSuggestions} disabled={suggestLabels.isPending}>
            {suggestLabels.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Suggest Labels
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-8 rounded-lg border-border/60 shadow-none text-xs font-medium">
                <Tags className="w-3.5 h-3.5" />
                Add Label
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-lg">
              <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">Available Labels</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {labels.filter(l => !email.labels.find(el => el.id === l.id)).map(l => (
                <DropdownMenuItem 
                  key={l.id} 
                  className="rounded-lg"
                  onClick={() => setLabels.mutate({ id: email.id, data: { labelIds: [...email.labels.map(el => el.id), l.id] } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(email.id) }); queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() }); }})}
                >
                  <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: l.color || '#888' }} />
                  {l.name}
                </DropdownMenuItem>
              ))}
              {labels.filter(l => !email.labels.find(el => el.id === l.id)).length === 0 && (
                <div className="py-2 px-2 text-xs text-muted-foreground text-center">No more labels</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-8 max-w-[800px] mx-auto space-y-8">
          {/* Title & Metadata */}
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
                    to me • {format(new Date(email.receivedAt), 'MMM d, yyyy, h:mm a')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Current Labels */}
          {email.labels.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {email.labels.map(label => (
                <LabelBadge 
                  key={label.id} 
                  label={label} 
                  size="md"
                  onRemove={() => handleRemoveLabel(label.id)} 
                />
              ))}
            </div>
          )}

          {/* AI Suggestions Box */}
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
                        <LabelBadge 
                          label={{ name: suggestion.name, color: suggestion.color || "#6366f1" }} 
                        />
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
            <EmailBody html={email.bodyHtml} text={email.body} />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
