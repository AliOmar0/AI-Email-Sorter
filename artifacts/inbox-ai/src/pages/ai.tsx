import { useState } from "react";
import { 
  useSuggestEmailGroups, 
  useAutoLabelEmails,
  useCreateLabel,
  useBulkLabelEmails,
  useGetStats,
  getGetStatsQueryKey,
  getListEmailsQueryKey,
  getListLabelsQueryKey,
  listEmails
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, BrainCircuit, Wand2, Layers, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { LabelBadge } from "@/components/labels/label-badge";

export default function AIStudioPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: stats } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });

  const suggestGroups = useSuggestEmailGroups();
  const autoLabel = useAutoLabelEmails();
  const createLabel = useCreateLabel();
  const bulkLabel = useBulkLabelEmails();

  const [activeTab, setActiveTab] = useState<"overview" | "results">("overview");
  const [autoLabelResult, setAutoLabelResult] = useState<any>(null);
  const [isAutoLabeling, setIsAutoLabeling] = useState(false);

  const handleRunAutoLabel = async () => {
    setIsAutoLabeling(true);
    try {
      // Enumerate the unlabeled emails up front, then process them in small
      // batches. Each batch is its own request, so no single serverless
      // invocation runs long enough to hit the gateway timeout (504). DeepSeek
      // calls are slow, so a whole-mailbox pass in one request times out.
      const unlabeled = await listEmails({ view: "unlabeled" });
      const ids = unlabeled.map((e) => e.id);

      if (ids.length === 0) {
        toast({ title: "Nothing to label", description: "No unlabeled emails found." });
        return;
      }

      const BATCH_SIZE = 6;
      let processed = 0;
      let labeled = 0;
      const items: any[] = [];

      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const chunk = ids.slice(i, i + BATCH_SIZE);
        const result: any = await autoLabel.mutateAsync({ data: { emailIds: chunk } });
        processed += result?.processed ?? chunk.length;
        labeled += result?.labeled ?? 0;
        if (Array.isArray(result?.items)) items.push(...result.items);
      }

      setAutoLabelResult({ processed, labeled, items });
      setActiveTab("results");
      queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
      toast({
        title: "Auto-labeling complete",
        description: `Processed ${processed} emails, labeled ${labeled}.`
      });
    } catch (e: any) {
      // Surface the actual server reason (e.g. "AI provider not configured")
      // instead of a generic message so the failure is actionable.
      const description =
        e?.data?.error ??
        e?.data?.message ??
        e?.message ??
        "Auto-labeling failed.";
      toast({ title: "Auto-labeling failed", description, variant: "destructive" });
    } finally {
      setIsAutoLabeling(false);
    }
  };

  const handleSuggestGroups = () => {
    suggestGroups.mutate({ data: {} });
  };

  const handleApplyGroup = async (group: any) => {
    try {
      const newLabel = await createLabel.mutateAsync({
        data: {
          name: group.suggestedLabel,
          color: group.suggestedColor || "#6366f1",
          description: group.reason
        }
      });

      await bulkLabel.mutateAsync({
        data: {
          emailIds: group.emailIds,
          labelId: newLabel.id,
          action: "add"
        }
      });

      toast({
        title: "Group labeled",
        description: `Created label "${group.suggestedLabel}" and applied to ${group.emailIds.length} emails.`
      });
      
      queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
      
      // Re-run suggestion to remove applied items
      handleSuggestGroups();
    } catch (e) {
      toast({ title: "Error", description: "Failed to apply group label.", variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto p-4 sm:p-8 lg:p-12 space-y-8 sm:space-y-12">
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 sm:gap-6 border-b border-border/50 pb-6 sm:pb-8">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-foreground shrink-0" />
              AI Studio
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-lg">
              Let the AI analyze your inbox, recognize patterns, and automatically organize your emails.
            </p>
          </div>
          {stats && (
            <div className="bg-muted/40 rounded-2xl border border-border/50 px-5 py-3 sm:px-6 sm:py-4 flex flex-row md:flex-col items-center md:items-end justify-between gap-3 md:gap-0 w-full md:w-auto shadow-sm">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider md:mb-1">Unlabeled Emails</span>
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{stats.unlabeledCount}</span>
            </div>
          )}
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
            {/* Auto-Label Card */}
            <Card className="border-border/60 shadow-sm rounded-3xl relative overflow-hidden flex flex-col">
              <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none">
                <Wand2 className="w-48 h-48" />
              </div>
              <CardHeader className="relative z-10 p-6 sm:p-8 pb-4 sm:pb-4">
                <div className="w-12 h-12 bg-foreground rounded-xl flex items-center justify-center mb-4 sm:mb-6 shadow-sm">
                  <BrainCircuit className="w-6 h-6 text-background" />
                </div>
                <CardTitle className="text-xl sm:text-2xl">Magic Auto-Label</CardTitle>
                <CardDescription className="text-sm sm:text-base mt-2">
                  The AI reads all your unlabeled emails and automatically applies the best existing labels. Fast and effortless.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 relative z-10 px-6 sm:px-8">
                <ul className="space-y-3 text-sm text-muted-foreground/80 font-medium">
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-foreground/50" /> Matches against your existing labels</li>
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-foreground/50" /> Analyzes full email context</li>
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-foreground/50" /> Skips uncertain emails automatically</li>
                </ul>
              </CardContent>
              <CardFooter className="relative z-10 p-6 sm:p-8 pt-6">
                <Button 
                  className="w-full h-12 rounded-xl text-base font-medium shadow-sm" 
                  onClick={handleRunAutoLabel}
                  disabled={isAutoLabeling || autoLabel.isPending || (stats?.unlabeledCount === 0)}
                >
                  {(isAutoLabeling || autoLabel.isPending) ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing Inbox...</>
                  ) : (
                    <><Wand2 className="w-4 h-4 mr-2" /> Run Auto-Label Now</>
                  )}
                </Button>
              </CardFooter>
            </Card>

            {/* Smart Groups Card */}
            <Card className="border-border/60 shadow-sm rounded-3xl flex flex-col">
              <CardHeader className="p-6 sm:p-8 pb-4 sm:pb-4">
                <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mb-4 sm:mb-6 border border-border/50">
                  <Layers className="w-6 h-6 text-muted-foreground" />
                </div>
                <CardTitle className="text-xl sm:text-2xl">Discover Smart Groups</CardTitle>
                <CardDescription className="text-sm sm:text-base mt-2">
                  The AI finds patterns in your unlabeled emails and suggests new labels to group them.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 px-6 sm:px-8 pb-0">
                {!suggestGroups.isPending && !suggestGroups.isSuccess && (
                  <p className="text-sm text-muted-foreground">
                    Perfect for when your inbox has grown out of control and you need fresh ideas on how to categorize it.
                  </p>
                )}
                
                {suggestGroups.isPending && (
                  <div className="space-y-4 py-4 animate-in fade-in">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium flex items-center gap-2 text-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Discovering patterns...</span>
                    </div>
                    <Progress value={undefined} className="h-1.5" />
                  </div>
                )}

                {suggestGroups.isSuccess && suggestGroups.data && (
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 pb-8 scrollbar-thin">
                    {suggestGroups.data.length === 0 ? (
                      <div className="text-center p-8 bg-muted/30 rounded-2xl text-sm text-muted-foreground border border-border/50">
                        No clear patterns found in your unlabeled emails.
                      </div>
                    ) : (
                      suggestGroups.data.map((group, i) => (
                        <div key={i} className="bg-background border border-border/60 p-5 rounded-2xl shadow-sm hover:border-border transition-colors">
                          <div className="flex items-start justify-between mb-4">
                            <div className="space-y-2">
                              <LabelBadge label={{ name: group.suggestedLabel, color: group.suggestedColor || "#6366f1" }} size="md" />
                              <p className="text-xs text-muted-foreground leading-relaxed pr-4">{group.reason}</p>
                            </div>
                            <span className="text-[10px] uppercase tracking-wider font-bold bg-muted px-2 py-1 rounded-md shrink-0 text-muted-foreground">
                              {group.emailIds.length} emails
                            </span>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full h-9 rounded-lg gap-2 text-xs font-medium border-border/60 shadow-none hover:bg-muted/50"
                            onClick={() => handleApplyGroup(group)}
                          >
                            Create Label & Apply <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
              {!suggestGroups.isSuccess && (
                <CardFooter className="p-6 sm:p-8 pt-6 mt-auto">
                  <Button 
                    variant="outline"
                    className="w-full h-12 rounded-xl text-base font-medium shadow-sm border-border/60" 
                    onClick={handleSuggestGroups}
                    disabled={suggestGroups.isPending || (stats?.unlabeledCount === 0)}
                  >
                    <Layers className="w-4 h-4 mr-2" /> Find Patterns
                  </Button>
                </CardFooter>
              )}
            </Card>
          </div>
        )}

        {activeTab === "results" && autoLabelResult && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 max-w-2xl mx-auto">
            <Button variant="ghost" onClick={() => setActiveTab("overview")} className="gap-2 mb-4 -ml-4 rounded-xl text-muted-foreground hover:text-foreground">
              <ArrowRight className="w-4 h-4 rotate-180" /> Back to Studio
            </Button>
            
            <div className="bg-card border border-border/60 rounded-[2rem] p-6 sm:p-12 text-center relative overflow-hidden shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-transparent pointer-events-none" />
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-foreground rounded-2xl flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-sm relative z-10">
                <CheckCircle2 className="w-9 h-9 sm:w-10 sm:h-10 text-background" />
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold mb-3 tracking-tight relative z-10">Auto-Label Complete</h2>
              <p className="text-base sm:text-lg text-muted-foreground max-w-md mx-auto relative z-10">
                Analyzed <span className="font-medium text-foreground">{autoLabelResult.processed}</span> emails and successfully categorized <span className="font-medium text-foreground">{autoLabelResult.labeled}</span>.
              </p>
              
              <div className="grid grid-cols-2 gap-4 sm:gap-6 max-w-sm mx-auto mt-8 sm:mt-10 relative z-10">
                <div className="bg-muted/40 rounded-2xl p-4 sm:p-5 border border-border/50">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Processed</p>
                  <p className="text-3xl sm:text-4xl font-bold tracking-tight">{autoLabelResult.processed}</p>
                </div>
                <div className="bg-background rounded-2xl p-4 sm:p-5 border border-border/80 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-foreground mb-1">Labeled</p>
                  <p className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">{autoLabelResult.labeled}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
