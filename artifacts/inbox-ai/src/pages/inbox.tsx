import { useState } from "react";
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
  Search, Star, Inbox as InboxIcon, Tags, Filter, 
  CheckSquare, Sparkles, X, Loader2, Mail
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { LabelBadge } from "@/components/labels/label-badge";
import { EmailBody } from "@/components/inbox/email-body";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function InboxPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const viewParam = searchParams.get("view") as ListEmailsView | null;
  const labelIdParam = searchParams.get("labelId");
  
  const [view, setView] = useState<ListEmailsView>(viewParam || "all");
  const [labelIdFilter, setLabelIdFilter] = useState<string | undefined>(labelIdParam || undefined);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [activeEmailId, setActiveEmailId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: emails = [], isLoading: isLoadingEmails } = useListEmails(
    { view, labelId: labelIdFilter, search: debouncedSearch },
    { query: { queryKey: getListEmailsQueryKey({ view, labelId: labelIdFilter, search: debouncedSearch }) } }
  );

  const { data: labels = [] } = useListLabels({ query: { queryKey: getListLabelsQueryKey() } });

  const updateEmail = useUpdateEmail();
  const bulkLabel = useBulkLabelEmails();

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setTimeout(() => setDebouncedSearch(e.target.value), 300);
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

  return (
    <div className="flex h-full w-full bg-background">
      {/* Left Sidebar - Views & Labels */}
      <div className="w-60 border-r border-border bg-muted/10 flex flex-col shrink-0">
        <div className="p-4 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search emails..." 
              value={search}
              onChange={handleSearch}
              className="w-full pl-9 bg-background/50 border-border/60 shadow-none focus-visible:ring-1"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1 text-sm">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2 mt-1">Views</div>
            {(["all", "unlabeled", "starred", "unread"] as ListEmailsView[]).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); setLabelIdFilter(undefined); setActiveEmailId(null); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                  view === v && !labelIdFilter ? "bg-muted font-medium text-foreground" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {v === "all" && <InboxIcon className="w-4 h-4" />}
                {v === "unlabeled" && <Filter className="w-4 h-4" />}
                {v === "starred" && <Star className="w-4 h-4" />}
                {v === "unread" && <CheckSquare className="w-4 h-4" />}
                <span className="capitalize">{v}</span>
              </button>
            ))}

            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-6 pb-2">Labels</div>
            {labels.map((label) => (
              <button
                key={label.id}
                onClick={() => { setLabelIdFilter(label.id); setView("all"); setActiveEmailId(null); }}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors group",
                  labelIdFilter === label.id ? "bg-muted font-medium text-foreground" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3 truncate">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: label.color || '#888' }} />
                  <span className="truncate">{label.name}</span>
                </div>
                {label.emailCount > 0 && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full tabular-nums",
                    labelIdFilter === label.id ? "bg-background shadow-sm" : "bg-muted group-hover:bg-background"
                  )}>
                    {label.emailCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Middle - Email List */}
      <div className="flex-1 flex flex-col border-r border-border min-w-[320px] max-w-[450px]">
        <div className="h-14 border-b border-border/50 flex items-center justify-between px-4 bg-background z-10 shrink-0">
          <div className="flex items-center gap-3">
            <Checkbox 
              checked={emails.length > 0 && selectedEmailIds.size === emails.length}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all"
              className="rounded-[4px]"
            />
            <span className="text-sm text-muted-foreground font-medium">
              {selectedEmailIds.size > 0 ? `${selectedEmailIds.size} selected` : 'Inbox'}
            </span>
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

      {/* Right - Reading Pane */}
      <div className="flex-[1.5] flex flex-col bg-background relative z-0">
        {activeEmailId ? (
          <EmailDetail 
            emailId={activeEmailId} 
            labels={labels}
            onClose={() => setActiveEmailId(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/5">
            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-muted/50 mb-4">
              <InboxIcon className="w-8 h-8 opacity-20" />
            </div>
            <p className="text-sm">Select an email to read</p>
          </div>
        )}
      </div>
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
