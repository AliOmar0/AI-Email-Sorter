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
  Search, Star, Inbox as InboxIcon, Tags, Filter, MoreVertical, 
  Trash2, Archive, CheckSquare, Sparkles, X, Loader2,
  Mail
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { LabelBadge } from "@/components/labels/label-badge";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";

export default function InboxPage() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const viewParam = searchParams.get("view") as ListEmailsView | null;
  const labelIdParam = searchParams.get("labelId");
  
  const [view, setView] = useState<ListEmailsView>(viewParam || "all");
  const [labelIdFilter, setLabelIdFilter] = useState<number | undefined>(labelIdParam ? parseInt(labelIdParam) : undefined);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<number>>(new Set());
  const [activeEmailId, setActiveEmailId] = useState<number | null>(null);

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
    // Debounce would normally go here, simplifying for now
    setTimeout(() => setDebouncedSearch(e.target.value), 300);
  };

  const toggleSelectAll = () => {
    if (selectedEmailIds.size === emails.length) {
      setSelectedEmailIds(new Set());
    } else {
      setSelectedEmailIds(new Set(emails.map(e => e.id)));
    }
  };

  const toggleSelect = (id: number) => {
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

  const handleBulkAction = async (action: "add" | "remove", targetLabelId: number) => {
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
      <div className="w-56 border-r border-border bg-muted/20 flex flex-col">
        <div className="p-4 border-b border-border">
          <Input 
            placeholder="Search emails..." 
            value={search}
            onChange={handleSearch}
            className="w-full bg-background"
            prefix={<Search className="w-4 h-4 text-muted-foreground" />}
          />
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">Views</div>
            {(["all", "unlabeled", "starred", "unread"] as ListEmailsView[]).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); setLabelIdFilter(undefined); setActiveEmailId(null); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
                  view === v && !labelIdFilter ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground/80"
                )}
              >
                {v === "all" && <InboxIcon className="w-4 h-4" />}
                {v === "unlabeled" && <Filter className="w-4 h-4" />}
                {v === "starred" && <Star className="w-4 h-4" />}
                {v === "unread" && <CheckSquare className="w-4 h-4" />}
                <span className="capitalize">{v}</span>
              </button>
            ))}

            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-4 pb-1">Labels</div>
            {labels.map((label) => (
              <button
                key={label.id}
                onClick={() => { setLabelIdFilter(label.id); setView("all"); setActiveEmailId(null); }}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors group",
                  labelIdFilter === label.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground/80"
                )}
              >
                <div className="flex items-center gap-3 truncate">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                  <span className="truncate">{label.name}</span>
                </div>
                {label.emailCount > 0 && (
                  <span className="text-xs text-muted-foreground bg-background px-1.5 rounded-full border border-border group-hover:border-primary/20">
                    {label.emailCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Middle - Email List */}
      <div className="flex-1 flex flex-col border-r border-border min-w-[350px]">
        <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-background z-10 shrink-0">
          <div className="flex items-center gap-3">
            <Checkbox 
              checked={emails.length > 0 && selectedEmailIds.size === emails.length}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all"
            />
            <span className="text-sm text-muted-foreground font-medium">
              {selectedEmailIds.size > 0 ? `${selectedEmailIds.size} selected` : 'Select all'}
            </span>
          </div>
          
          {selectedEmailIds.size > 0 && (
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Tags className="w-4 h-4" />
                    Label
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Apply Label</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {labels.map(l => (
                    <DropdownMenuItem key={l.id} onClick={() => handleBulkAction("add", l.id)}>
                      <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: l.color }} />
                      {l.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Remove Label</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {labels.map(l => (
                    <DropdownMenuItem key={l.id} onClick={() => handleBulkAction("remove", l.id)}>
                      <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: l.color }} />
                      {l.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          {isLoadingEmails ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <InboxIcon className="w-8 h-8 opacity-50" />
              </div>
              <p className="font-medium text-foreground">No emails found</p>
              <p className="text-sm mt-1">Try changing your filters or search query.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {emails.map(email => (
                <div 
                  key={email.id}
                  className={cn(
                    "group flex items-start gap-3 p-4 cursor-pointer transition-colors relative",
                    activeEmailId === email.id ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50 border-l-2 border-l-transparent",
                    !email.isRead && "bg-muted/10 font-medium"
                  )}
                  onClick={() => setActiveEmailId(email.id)}
                >
                  <div className="pt-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <Checkbox 
                      checked={selectedEmailIds.has(email.id)}
                      onCheckedChange={() => toggleSelect(email.id)}
                    />
                  </div>
                  
                  <div className="pt-0.5 shrink-0" onClick={(e) => { e.stopPropagation(); handleToggleStar(email); }}>
                    <Star className={cn("w-4 h-4 transition-colors", email.isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/50 group-hover:text-muted-foreground")} />
                  </div>

                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn("truncate text-sm", !email.isRead ? "text-foreground font-semibold" : "text-foreground/80")}>
                        {email.sender}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap ml-2">
                        {format(new Date(email.receivedAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    
                    <div className={cn("text-sm truncate mb-1.5", !email.isRead ? "text-foreground font-medium" : "text-foreground/80")}>
                      {email.subject}
                    </div>
                    
                    <div className="text-sm text-muted-foreground truncate mb-2">
                      {email.snippet}
                    </div>

                    {email.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {email.labels.map(l => (
                          <LabelBadge key={l.id} label={l} />
                        ))}
                      </div>
                    )}
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
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/10">
            <InboxIcon className="w-12 h-12 mb-4 opacity-20" />
            <p>Select an email to read</p>
          </div>
        )}
      </div>
    </div>
  );
}

function EmailDetail({ emailId, labels, onClose }: { emailId: number, labels: Label[], onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: email, isLoading } = useGetEmail(emailId, { 
    query: { 
      enabled: !!emailId, 
      queryKey: getGetEmailQueryKey(emailId) 
    } 
  });

  const { data: suggestions, isLoading: isSuggesting } = useSuggestEmailLabels(
    { mutation: { mutationKey: ["suggest", emailId] } }
  );

  const suggestLabels = useSuggestEmailLabels();
  const removeLabel = useRemoveEmailLabel();
  const setLabels = useSetEmailLabels();
  const createLabel = useCreateLabel();
  const updateEmail = useUpdateEmail();

  if (isLoading || !email) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-8 w-3/4" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const handleRemoveLabel = async (labelId: number) => {
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
    <div className="flex flex-col h-full">
      {/* Header Actions */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden mr-2">
            <X className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground hover:text-foreground"
            onClick={() => updateEmail.mutate({ id: email.id, data: { isStarred: !email.isStarred } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(email.id) }) })}
          >
            <Star className={cn("w-4 h-4", email.isStarred && "fill-yellow-400 text-yellow-400")} />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground hover:text-foreground"
            onClick={() => updateEmail.mutate({ id: email.id, data: { isRead: !email.isRead } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(email.id) }) })}
          >
            <Mail className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={requestSuggestions} disabled={suggestLabels.isPending}>
            {suggestLabels.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
            Suggest Labels
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Tags className="w-4 h-4" />
                Add Label
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Available Labels</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {labels.filter(l => !email.labels.find(el => el.id === l.id)).map(l => (
                <DropdownMenuItem 
                  key={l.id} 
                  onClick={() => setLabels.mutate({ id: email.id, data: { labelIds: [...email.labels.map(el => el.id), l.id] } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(email.id) }); queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() }); }})}
                >
                  <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: l.color }} />
                  {l.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 max-w-4xl mx-auto space-y-6">
          {/* Title & Metadata */}
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-4">{email.subject}</h1>
            
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                  {email.sender.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-foreground flex items-center gap-2">
                    {email.sender}
                    <span className="text-sm text-muted-foreground font-normal">&lt;{email.senderEmail}&gt;</span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    to me • {format(new Date(email.receivedAt), 'MMM d, yyyy, h:mm a')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Current Labels */}
          {email.labels.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
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
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mt-4 animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-2 text-primary font-medium mb-3">
                <Sparkles className="w-4 h-4" />
                AI Suggested Labels
              </div>
              <div className="space-y-3">
                {suggestLabels.data.map((suggestion, i) => (
                  <div key={i} className="flex items-start justify-between bg-background rounded-lg p-3 border border-primary/10 shadow-sm">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <LabelBadge 
                          label={{ name: suggestion.name, color: suggestion.color || "#6366f1" }} 
                        />
                        {suggestion.isNew && (
                          <span className="text-[10px] uppercase font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-sm">New</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {Math.round(suggestion.confidence * 100)}% match
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                    </div>
                    <Button size="sm" onClick={() => handleApplySuggestion(suggestion)}>
                      Apply
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body */}
          <div className="pt-6 border-t border-border/50 text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {email.body}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
