import { Sidebar } from "./sidebar";
import { User } from "@workspace/api-client-react";

export function AppLayout({ children, user }: { children: React.ReactNode; user: User }) {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}
