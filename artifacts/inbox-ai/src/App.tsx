import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { Sparkles } from "lucide-react";

import LoginPage from "@/pages/login";
import { AppLayout } from "@/components/layout/app-layout";

// Route-level code splitting: each page ships in its own chunk and is only
// downloaded when first visited, shrinking the initial bundle and speeding up
// first paint. Login stays eager since it is the auth fallback.
const Dashboard = lazy(() => import("@/pages/dashboard"));
const InboxPage = lazy(() => import("@/pages/inbox"));
const LabelsPage = lazy(() => import("@/pages/labels"));
const AIStudioPage = lazy(() => import("@/pages/ai"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Cache-first defaults: served data stays "fresh" for a minute and is kept in
// memory for five, so navigating between pages reuses cached results instantly
// instead of refetching on every mount.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-screen h-full w-full items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-4">
        <Sparkles className="w-8 h-8 text-primary animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">{label}</p>
      </div>
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, error } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: false, // Don't retry on 401
    }
  });

  if (isLoading) {
    return <PageLoader label="Initializing Command Center..." />;
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
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/inbox" component={InboxPage} />
          <Route path="/labels" component={LabelsPage} />
          <Route path="/ai" component={AIStudioPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AuthGuard>
  );
}

function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="inbox-ai-theme"
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
