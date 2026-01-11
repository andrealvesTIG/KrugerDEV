import { useState, createContext, useContext, ReactNode, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Briefcase, FolderKanban, LogOut, Calendar, CircleDot, ChevronLeft, ChevronRight, CheckSquare, Crown, Settings, Building2, ChevronDown, User, UserCog, BookOpen, HelpCircle, Users, Menu, X, FileInput, Plug, CreditCard, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import logoIcon from "@assets/icon_orange_bright@16x_1767637282986.png";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SidebarStructure, SidebarGroup, SidebarItem } from "@shared/schema";

// Context for sidebar collapsed state
interface SidebarContextType {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export function useSidebarState() {
  const context = useContext(SidebarContext);
  if (!context) {
    return { isCollapsed: false, setIsCollapsed: () => {}, isMobileOpen: false, setIsMobileOpen: () => {} };
  }
  return context;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close mobile menu on window resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export { logoIcon };

const moduleDefinitions: Record<string, { name: string; href: string; icon: React.ComponentType<{ className?: string }> }> = {
  dashboard: { name: "Dashboard", href: "/", icon: LayoutDashboard },
  portfolios: { name: "Portfolios", href: "/portfolios", icon: Briefcase },
  projects: { name: "Projects", href: "/projects", icon: FolderKanban },
  intakes: { name: "Intakes", href: "/intakes", icon: FileInput },
  tasks: { name: "Tasks", href: "/tasks", icon: CheckSquare },
  issues: { name: "Issues", href: "/issues", icon: CircleDot },
  resources: { name: "Resources", href: "/resources", icon: Users },
  calendar: { name: "Calendar", href: "/calendar", icon: Calendar },
  integrations: { name: "Integrations", href: "/integrations", icon: Plug },
  "user-guide": { name: "User Guide", href: "/user-guide", icon: BookOpen },
};

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, key: "dashboard" },
  { name: "Portfolios", href: "/portfolios", icon: Briefcase, key: "portfolios" },
  { name: "Projects", href: "/projects", icon: FolderKanban, key: "projects" },
  { name: "Intakes", href: "/intakes", icon: FileInput, key: "intakes" },
  { name: "Tasks", href: "/tasks", icon: CheckSquare, key: "tasks" },
  { name: "Issues", href: "/issues", icon: CircleDot, key: "issues" },
  { name: "Resources", href: "/resources", icon: Users, key: "resources" },
  { name: "Calendar", href: "/calendar", icon: Calendar, key: "calendar" },
  { name: "Integrations", href: "/integrations", icon: Plug, key: "integrations" },
];

const helpNavigation = [
  { name: "User Guide", href: "/user-guide", icon: BookOpen },
];

function getDefaultSidebarStructure(hiddenModules?: string[] | null, moduleOrder?: string[] | null, hiddenGroups?: string[] | null): SidebarStructure {
  const mainModules = ["dashboard", "portfolios", "projects", "intakes", "tasks", "issues", "resources", "calendar", "integrations"];
  const defaultOrder = mainModules;
  const order = moduleOrder && moduleOrder.length > 0 ? moduleOrder.filter(k => mainModules.includes(k)) : defaultOrder;
  const hidden = hiddenModules || [];
  const groupsHidden = hiddenGroups || [];
  
  const menuItems: SidebarItem[] = order.map(key => ({
    type: "module" as const,
    key,
    hidden: hidden.includes(key),
  }));
  
  const helpItems: SidebarItem[] = [{ type: "module" as const, key: "user-guide", hidden: false }];
  
  return [
    { id: "menu", name: "Menu", isDefault: true, hidden: groupsHidden.includes("menu"), items: menuItems },
    { id: "help", name: "Help", isDefault: true, hidden: groupsHidden.includes("help"), items: helpItems },
  ];
}

function ensureStructureHasDefaults(structure: SidebarStructure): SidebarStructure {
  const helpGroup = structure.find(g => g.id === "help");
  const hasUserGuide = structure.some(g => 
    g.items.some(item => item.type === "module" && item.key === "user-guide")
  );
  
  if (!hasUserGuide && helpGroup) {
    return structure.map(g => {
      if (g.id === "help") {
        return { ...g, items: [...g.items, { type: "module" as const, key: "user-guide", hidden: false }] };
      }
      return g;
    });
  }
  
  if (!helpGroup) {
    return [...structure, { 
      id: "help", 
      name: "Help", 
      isDefault: true, 
      hidden: false, 
      items: [{ type: "module" as const, key: "user-guide", hidden: false }] 
    }];
  }
  
  return structure;
}

const userMenuItems = [
  { name: "Profile", href: "/profile", icon: User },
  { name: "User Settings", href: "/user-settings", icon: UserCog },
  { name: "Billing", href: "/billing", icon: CreditCard },
  { name: "Org Settings", href: "/org-settings", icon: Building2 },
  { name: "Super Admin", href: "/super-admin", icon: Crown, superAdminOnly: true },
];

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { logout, user } = useAuth();
  const { currentOrganization, setCurrentOrganization, organizations } = useOrganization();
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebarState();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const handleMenuItemClick = (href: string) => {
    setLocation(href);
    setIsUserMenuOpen(false);
    setIsMobileOpen(false);
  };

  const handleLogout = () => {
    setIsUserMenuOpen(false);
    setIsMobileOpen(false);
    logout();
  };

  const handleNavClick = () => {
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
          data-testid="overlay-mobile-sidebar"
        />
      )}
      <div className={cn(
        "flex h-screen flex-col bg-slate-900 text-white transition-all duration-300 relative",
        "fixed md:relative z-50",
        "md:translate-x-0",
        isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        isCollapsed ? "md:w-20" : "md:w-72",
        "w-72"
      )}>
      {/* Mobile Close Button */}
      <button
        onClick={() => setIsMobileOpen(false)}
        className="absolute right-4 top-6 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors md:hidden"
        data-testid="button-close-mobile-sidebar"
      >
        <X className="h-5 w-5" />
      </button>
      {/* Collapse Toggle Button - Desktop only */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-24 z-10 hidden md:flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
        data-testid="button-toggle-sidebar"
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
      {/* Logo Area */}
      <div className={cn("flex h-20 items-center", isCollapsed ? "justify-center px-2" : "px-6")}>
        <div className="flex items-center gap-3">
          <img src={logoIcon} alt="FridayReport.AI" className="h-10 w-10 flex-shrink-0" />
          {!isCollapsed && <span className="text-xl font-display font-bold tracking-tight">FridayReport.AI</span>}
        </div>
      </div>
      {/* Navigation */}
      <nav className={cn("flex-1 space-y-1 py-6 overflow-y-auto", isCollapsed ? "px-2" : "px-4")}>
        {(() => {
          const sidebarStructure: SidebarStructure = currentOrganization?.sidebarStructure 
            && Array.isArray(currentOrganization.sidebarStructure) 
            && currentOrganization.sidebarStructure.length > 0
            ? ensureStructureHasDefaults(currentOrganization.sidebarStructure as SidebarStructure)
            : getDefaultSidebarStructure(
                currentOrganization?.hiddenModules,
                currentOrganization?.moduleOrder,
                currentOrganization?.hiddenGroups
              );
          
          return sidebarStructure.map((group, groupIndex) => {
            if (group.hidden) return null;
            
            const visibleItems = group.items.filter(item => !item.hidden);
            if (visibleItems.length === 0 && group.id !== "help") return null;
            
            return (
              <div key={group.id} className={groupIndex > 0 ? "mt-4" : ""}>
                {!isCollapsed && (
                  <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {group.name}
                  </p>
                )}
                {isCollapsed && groupIndex > 0 && <div className="mt-4 border-t border-slate-700 pt-4" />}
                
                {visibleItems.map((item) => {
                  if (item.type === "module") {
                    const moduleDef = moduleDefinitions[item.key];
                    if (!moduleDef) return null;
                    
                    const isActive = location === moduleDef.href || (moduleDef.href !== "/" && location.startsWith(moduleDef.href));
                    const Icon = moduleDef.icon;
                    
                    const navItem = (
                      <Link key={item.key} href={moduleDef.href} onClick={handleNavClick}>
                        <div
                          className={cn(
                            "group flex items-center rounded-xl py-3 text-sm font-medium transition-all duration-200 ease-in-out cursor-pointer",
                            isCollapsed ? "justify-center px-2" : "px-4",
                            isActive
                              ? "bg-primary text-white shadow-md shadow-primary/20"
                              : "text-slate-300 hover:bg-slate-800 hover:text-white"
                          )}
                          data-testid={`link-nav-${moduleDef.name.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <Icon
                            className={cn(
                              "h-5 w-5 flex-shrink-0 transition-colors",
                              !isCollapsed && "mr-3",
                              isActive ? "text-white" : "text-slate-400 group-hover:text-white"
                            )}
                          />
                          {!isCollapsed && moduleDef.name}
                        </div>
                      </Link>
                    );

                    if (isCollapsed) {
                      return (
                        <Tooltip key={item.key} delayDuration={0}>
                          <TooltipTrigger asChild>{navItem}</TooltipTrigger>
                          <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                            {moduleDef.name}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                    return navItem;
                  } else {
                    const customLink = (
                      <a
                        key={item.id}
                        href={item.url}
                        target={item.openInNewTab ? "_blank" : "_self"}
                        rel={item.openInNewTab ? "noopener noreferrer" : undefined}
                        onClick={handleNavClick}
                        className={cn(
                          "group flex items-center rounded-xl py-3 text-sm font-medium transition-all duration-200 ease-in-out cursor-pointer",
                          isCollapsed ? "justify-center px-2" : "px-4",
                          "text-slate-300 hover:bg-slate-800 hover:text-white"
                        )}
                        data-testid={`link-nav-custom-${item.id}`}
                      >
                        <ExternalLink
                          className={cn(
                            "h-5 w-5 flex-shrink-0 transition-colors",
                            !isCollapsed && "mr-3",
                            "text-slate-400 group-hover:text-white"
                          )}
                        />
                        {!isCollapsed && item.label}
                      </a>
                    );

                    if (isCollapsed) {
                      return (
                        <Tooltip key={item.id} delayDuration={0}>
                          <TooltipTrigger asChild>{customLink}</TooltipTrigger>
                          <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                    return customLink;
                  }
                })}
              </div>
            );
          });
        })()}
      </nav>
      {/* User Section with Dropdown */}
      <div className={cn("border-t border-slate-800", isCollapsed ? "p-2" : "p-4")}>
        <Popover open={isUserMenuOpen} onOpenChange={setIsUserMenuOpen}>
          {isCollapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className="flex w-full items-center justify-center rounded-xl bg-slate-800/50 p-3 hover:bg-slate-700 transition-colors"
                    data-testid="button-user-menu"
                  >
                    {user?.profileImageUrl ? (
                      <img src={user.profileImageUrl} alt="Avatar" className="h-8 w-8 rounded-full border border-slate-600" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 border border-slate-600">
                        <span className="font-bold text-slate-300 text-sm">{user?.firstName?.[0] || 'U'}</span>
                      </div>
                    )}
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                {user?.firstName || 'User'} - Click for menu
              </TooltipContent>
            </Tooltip>
          ) : (
            <PopoverTrigger asChild>
              <button
                className="flex w-full items-center gap-3 rounded-xl bg-slate-800/50 p-3 hover:bg-slate-700 transition-colors cursor-pointer"
                data-testid="button-user-menu"
              >
                {user?.profileImageUrl ? (
                  <img src={user.profileImageUrl} alt="Avatar" className="h-10 w-10 rounded-full border border-slate-600" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 border border-slate-600">
                    <span className="font-bold text-slate-300">{user?.firstName?.[0] || 'U'}</span>
                  </div>
                )}
                <div className="flex-1 overflow-hidden text-left">
                  <p className="truncate text-sm font-medium text-white">{user?.firstName || 'User'}</p>
                  <p className="truncate text-xs text-slate-400">Click for options</p>
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-slate-400 transition-transform",
                  isUserMenuOpen && "rotate-180"
                )} />
              </button>
            </PopoverTrigger>
          )}
          <PopoverContent
            side={isCollapsed ? "right" : "top"}
            align={isCollapsed ? "start" : "center"}
            className="w-56 bg-slate-800 border-slate-700 p-2"
            sideOffset={8}
          >
            <div className="space-y-1">
              {/* User Info Header */}
              <div className="px-2 py-2 border-b border-slate-700 mb-2">
                <p className="text-sm font-medium text-white truncate">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-slate-400 truncate">{user?.email}</p>
              </div>

              {/* Menu Items */}
              {userMenuItems.map((item) => {
                if ((item as any).superAdminOnly && user?.role !== 'super_admin') {
                  return null;
                }
                const isActive = location === item.href;
                return (
                  <button
                    key={item.name}
                    onClick={() => handleMenuItemClick(item.href)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-primary text-white"
                        : "text-slate-300 hover:bg-slate-700 hover:text-white"
                    )}
                    data-testid={`button-menu-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </button>
                );
              })}

              {/* Separator */}
              <div className="my-2 border-t border-slate-700" />

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
    </>
  );
}
