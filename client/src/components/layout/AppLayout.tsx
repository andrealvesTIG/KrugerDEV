import { ReactNode } from "react";
import { Sidebar, SidebarProvider, useSidebarState, logoIcon } from "./Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { Loader2, Building2, ChevronDown, Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";
import { SearchCommand } from "./SearchCommand";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  const { isCollapsed, setIsMobileOpen } = useSidebarState();
  const { currentOrganization, setCurrentOrganization, organizations } = useOrganization();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b border-slate-200 bg-white px-3 md:px-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Mobile hamburger menu */}
            <button
              onClick={() => setIsMobileOpen(true)}
              className="flex md:hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              data-testid="button-mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Logo - show on mobile always, on desktop only when collapsed */}
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity md:hidden">
              <img src={logoIcon} alt="Friday Report" className="h-8 w-8" />
              <span className="font-display font-bold text-lg text-foreground">Friday Report</span>
            </Link>
            {isCollapsed && (
              <Link href="/" className="hidden md:flex items-center gap-3 hover:opacity-80 transition-opacity">
                <img src={logoIcon} alt="Friday Report" className="h-8 w-8" />
                <span className="font-display font-bold text-lg text-foreground">Friday Report</span>
              </Link>
            )}
            {organizations.length > 0 && (
              <div className="hidden md:flex items-center gap-2">
                {isCollapsed && <div className="h-5 w-px bg-border" />}
                {organizations.length === 1 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-organization-name">
                    <Building2 className="h-4 w-4" />
                    <span>{currentOrganization?.name}</span>
                  </div>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger 
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                      data-testid="dropdown-organization"
                    >
                      <Building2 className="h-4 w-4" />
                      <span>{currentOrganization?.name || 'Select organization'}</span>
                      <ChevronDown className="h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {organizations.map(org => (
                        <DropdownMenuItem
                          key={org.id}
                          onClick={() => setCurrentOrganization(org)}
                          className={currentOrganization?.id === org.id ? 'bg-accent' : ''}
                          data-testid={`dropdown-item-org-${org.id}`}
                        >
                          {org.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 flex justify-center">
            <SearchCommand />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-7xl px-4 py-4 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
