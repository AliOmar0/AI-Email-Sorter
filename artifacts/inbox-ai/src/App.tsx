import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { Sparkles } from "lucide-react";

import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import InboxPage from "@/pages/inbox";
import LabelsPage from "@/pages/labels";
import AIStudioPage from "@/pages/ai";
import LoginPage from "@/pages/login";
import { AppLayout } from "@/components/layout/app-layout";

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, error } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: false, // Don't retry on 401
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <Sparkles className="w-8 h-8 text-primary animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Initializing Command Center...</p>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return <LoginPage />;
  }

  return (
    <AppLayout user={user}>
      {children}
    </AppLayout>
  );
}

function Router() {
  return (
    <AuthGuard>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/inbox" component={InboxPage} />
        <Route path="/labels" component={LabelsPage} />
        <Route path="/ai" component={AIStudioPage} />
        <Route component={NotFound} />
      </Switch>
    </AuthGuard>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
