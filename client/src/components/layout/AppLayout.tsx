import { ReactNode } from "react";
import { Sidebar, SidebarProvider, useSidebarState, logoIcon } from "./Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";

export function AppLayout({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Loading application...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = "/api/login";
    return null;
  }

  return (
    <SidebarProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  );
}

function AppLayoutContent({ children }: { children: ReactNode }) {
  const { isCollapsed } = useSidebarState();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            {isCollapsed && (
              <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <img src={logoIcon} alt="Friday Report" className="h-8 w-8" />
                <span className="font-display font-bold text-lg text-foreground">Friday Report</span>
              </Link>
            )}
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-7xl px-8 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
