import { useState } from "react";
import { 
  useSuggestEmailGroups, 
  useAutoLabelEmails,
  useCreateLabel,
  useBulkLabelEmails,
  useGetStats,
  getGetStatsQueryKey,
  getListEmailsQueryKey,
  getListLabelsQueryKey
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

  const handleRunAutoLabel = async () => {
    try {
      const result = await autoLabel.mutateAsync({ data: {} });
      setAutoLabelResult(result);
      setActiveTab("results");
      queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
      toast({
        title: "Auto-labeling complete",
        description: `Processed ${result.processed} emails, labeled ${result.labeled}.`
      });
    } catch (e) {
      toast({ title: "Error", description: "Auto-labeling failed.", variant: "destructive" });
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
    <div className="flex-1 overflow-y-auto bg-muted/30">
      <div className="max-w-5xl mx-auto p-8 space-y-8">
        <div className="flex items-center justify-between border-b border-border/50 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-primary" />
              AI Studio
            </h1>
            <p className="text-muted-foreground mt-1">
              Let the AI analyze your inbox and automatically organize your emails.
            </p>
          </div>
          {stats && (
            <div className="bg-background rounded-lg border border-border p-3 flex flex-col items-end shadow-sm">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unlabeled Emails</span>
              <span className="text-2xl font-bold text-amber-500">{stats.unlabeledCount}</span>
            </div>
          )}
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Auto-Label Card */}
            <Card className="border-primary/20 shadow-md relative overflow-hidden flex flex-col">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Wand2 className="w-32 h-32 text-primary" />
              </div>
              <CardHeader className="relative z-10">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                  <BrainCircuit className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Magic Auto-Label</CardTitle>
                <CardDescription>
                  The AI will read all your unlabeled emails and automatically apply the best existing labels to them. Fast and effortless.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 relative z-10">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Matches against your existing labels</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Analyzes full email context</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Skips uncertain emails automatically</li>
                </ul>
              </CardContent>
              <CardFooter className="relative z-10 bg-muted/50 border-t border-border mt-auto pt-6">
                <Button 
                  className="w-full gap-2 shadow-sm" 
                  size="lg" 
                  onClick={handleRunAutoLabel}
                  disabled={autoLabel.isPending || (stats?.unlabeledCount === 0)}
                >
                  {autoLabel.isPending ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing Inbox...</>
                  ) : (
                    <><Wand2 className="w-5 h-5" /> Run Auto-Label Now</>
                  )}
                </Button>
              </CardFooter>
            </Card>

            {/* Smart Groups Card */}
            <Card className="border-border shadow-sm flex flex-col">
              <CardHeader>
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-4">
                  <Layers className="w-6 h-6 text-indigo-500" />
                </div>
                <CardTitle>Discover Smart Groups</CardTitle>
                <CardDescription>
                  The AI will find patterns in your unlabeled emails and suggest new labels to group them together.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground mb-6">
                  Perfect for when your inbox has grown out of control and you need fresh ideas on how to categorize it.
                </p>
                
                {suggestGroups.isPending && (
                  <div className="space-y-4 py-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-primary font-medium flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Discovering patterns...</span>
                    </div>
                    <Progress value={45} className="h-2" />
                  </div>
                )}

                {suggestGroups.isSuccess && suggestGroups.data && (
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                    {suggestGroups.data.length === 0 ? (
                      <div className="text-center p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                        No clear patterns found in your unlabeled emails.
                      </div>
                    ) : (
                      suggestGroups.data.map((group, i) => (
                        <div key={i} className="bg-background border border-border p-4 rounded-xl shadow-sm">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <LabelBadge label={{ name: group.suggestedLabel, color: group.suggestedColor }} size="md" />
                              <p className="text-xs text-muted-foreground mt-2">{group.reason}</p>
                            </div>
                            <span className="text-xs font-bold bg-muted px-2 py-1 rounded-md">
                              {group.emailIds.length} emails
                            </span>
                          </div>
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="w-full mt-3 gap-2"
                            onClick={() => handleApplyGroup(group)}
                          >
                            Create Label & Apply <ArrowRight className="w-4 h-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
              {!suggestGroups.isSuccess && (
                <CardFooter className="bg-muted/50 border-t border-border mt-auto pt-6">
                  <Button 
                    variant="outline"
                    className="w-full gap-2" 
                    size="lg"
                    onClick={handleSuggestGroups}
                    disabled={suggestGroups.isPending || (stats?.unlabeledCount === 0)}
                  >
                    <Layers className="w-5 h-5" /> Find Patterns
                  </Button>
                </CardFooter>
              )}
            </Card>
          </div>
        )}

        {activeTab === "results" && autoLabelResult && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <Button variant="ghost" onClick={() => setActiveTab("overview")} className="gap-2 mb-4 -ml-4">
              <ArrowRight className="w-4 h-4 rotate-180" /> Back to Studio
            </Button>
            
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-8 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent pointer-events-none" />
              <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border border-primary/20">
                <CheckCircle2 className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-3xl font-bold mb-2">Auto-Label Complete</h2>
              <p className="text-lg text-muted-foreground max-w-lg mx-auto">
                The AI analyzed <span className="font-bold text-foreground">{autoLabelResult.processed}</span> emails and successfully categorized <span className="font-bold text-foreground">{autoLabelResult.labeled}</span> of them.
              </p>
              
              <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto mt-8">
                <div className="bg-background rounded-xl p-4 shadow-sm border border-border">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Processed</p>
                  <p className="text-3xl font-bold">{autoLabelResult.processed}</p>
                </div>
                <div className="bg-background rounded-xl p-4 shadow-sm border border-primary/20">
                  <p className="text-sm font-medium text-primary mb-1">Labeled</p>
                  <p className="text-3xl font-bold text-primary">{autoLabelResult.labeled}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
