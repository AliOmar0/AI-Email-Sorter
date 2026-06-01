import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Inbox, Sparkles, Tags, Mail, InboxIcon, Star, EyeOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });

  if (isLoading || !stats) {
    return (
      <div className="p-8 space-y-8 animate-in fade-in duration-500">
        <Skeleton className="h-10 w-64 mb-8 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  const organizedPercent = Math.round((stats.labeledCount / Math.max(stats.totalEmails, 1)) * 100);

  const statCards = [
    { title: "Total Emails", value: stats.totalEmails, icon: Mail },
    { title: "Unlabeled", value: stats.unlabeledCount, icon: InboxIcon },
    { title: "Unread", value: stats.unreadCount, icon: EyeOff },
    { title: "Starred", value: stats.starredCount, icon: Star },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-background selection:bg-primary/10">
      <div className="max-w-6xl mx-auto p-8 lg:p-12 space-y-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">Overview</h1>
            <p className="text-muted-foreground text-base">
              Your inbox is <span className="font-medium text-foreground">{organizedPercent}%</span> organized.
            </p>
          </div>
          <Link href="/ai">
            <Button className="gap-2 rounded-xl px-6" size="lg">
              <Sparkles className="w-4 h-4" />
              Open AI Studio
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, i) => (
            <Card key={i} className="border-border/60 shadow-sm rounded-2xl overflow-hidden hover:border-border transition-colors">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-muted text-muted-foreground">
                    <stat.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">{stat.title}</p>
                    <p className="text-3xl font-semibold tracking-tight text-foreground">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="border-border/60 shadow-sm rounded-2xl flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Tags className="w-4 h-4 text-muted-foreground" />
                Top Labels
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-1">
                {stats.labelBreakdown.slice(0, 8).map((l) => (
                  <Link key={l.id} href={`/inbox?labelId=${l.id}`}>
                    <div className="flex items-center justify-between group cursor-pointer p-3 -mx-3 rounded-xl hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color || '#888' }} />
                        <span className="font-medium text-sm text-foreground/90 group-hover:text-foreground transition-colors">{l.name}</span>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">{l.count}</span>
                    </div>
                  </Link>
                ))}
                {stats.labelBreakdown.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground space-y-3">
                    <Tags className="w-8 h-8 opacity-20" />
                    <p className="text-sm">No labels created yet.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm rounded-2xl flex flex-col relative overflow-hidden bg-card">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
              <Sparkles className="w-32 h-32" />
            </div>
            <CardHeader className="pb-4 relative z-10">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                AI Assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col relative z-10">
              <div className="space-y-6 flex-1 flex flex-col">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Let AI analyze your unlabeled emails and suggest ways to organize them. 
                  It automatically applies labels based on content, sender, and context.
                </p>
                <div className="mt-auto bg-muted/30 rounded-xl border border-border/50 p-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Unlabeled Emails</p>
                    <p className="text-3xl font-semibold text-foreground tracking-tight">{stats.unlabeledCount}</p>
                  </div>
                  <Link href="/ai">
                    <Button variant="outline" size="sm" className="gap-2 rounded-lg bg-background shadow-sm hover:bg-muted">
                      <Sparkles className="w-3.5 h-3.5" />
                      Auto-Label
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
