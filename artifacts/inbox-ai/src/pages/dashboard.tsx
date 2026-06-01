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
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  const statCards = [
    { title: "Total Emails", value: stats.totalEmails, icon: Mail, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Unlabeled", value: stats.unlabeledCount, icon: InboxIcon, color: "text-amber-500", bg: "bg-amber-500/10" },
    { title: "Unread", value: stats.unreadCount, icon: EyeOff, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { title: "Starred", value: stats.starredCount, icon: Star, color: "text-yellow-500", bg: "bg-yellow-500/10" },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30">
      <div className="max-w-6xl mx-auto p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Your inbox is {Math.round((stats.labeledCount / Math.max(stats.totalEmails, 1)) * 100)}% organized.
            </p>
          </div>
          <Link href="/ai">
            <Button className="gap-2 shadow-md">
              <Sparkles className="w-4 h-4" />
              Open AI Studio
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, i) => (
            <Card key={i} className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6 flex items-center gap-4">
                <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Tags className="w-5 h-5 text-primary" />
                Top Labels
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.labelBreakdown.slice(0, 8).map((l) => (
                  <Link key={l.id} href={`/inbox?labelId=${l.id}`}>
                    <div className="flex items-center justify-between group cursor-pointer p-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: l.color || '#888' }} />
                        <span className="font-medium text-sm group-hover:text-primary transition-colors">{l.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded-md">{l.count}</span>
                    </div>
                  </Link>
                ))}
                {stats.labelBreakdown.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No labels created yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="w-5 h-5 text-primary" />
                AI Assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Let AI analyze your unlabeled emails and suggest ways to organize them. 
                  It can automatically apply labels based on content, sender, and context.
                </p>
                <div className="bg-background rounded-lg border border-border p-4 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Unlabeled Emails</p>
                    <p className="text-2xl font-bold text-amber-500 mt-1">{stats.unlabeledCount}</p>
                  </div>
                  <Link href="/ai">
                    <Button variant="secondary" size="sm" className="gap-2">
                      <Sparkles className="w-4 h-4" />
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
