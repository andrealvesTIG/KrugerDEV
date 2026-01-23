import { useState, createContext, useContext, ReactNode, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Briefcase, FolderKanban, LogOut, Calendar, CircleDot, ChevronLeft, ChevronRight, CheckSquare, Crown, Settings, Building2, ChevronDown, User, BookOpen, HelpCircle, Users, Menu, X, FileInput, CreditCard, ExternalLink, Clock, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import logoIcon from "@assets/icon_orange_bright@16x_1767637282986.png";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SidebarStructure, SidebarGroup, SidebarItem } from "@shared/schema";

const EMOJI_MAP: Record<string, string> = {
  "smile": "\u{1F642}", "grin": "\u{1F601}", "laugh": "\u{1F602}", "wink": "\u{1F609}",
  "cool": "\u{1F60E}", "heart-eyes": "\u{1F60D}", "star-struck": "\u{1F929}", "thinking": "\u{1F914}",
  "nerd": "\u{1F913}", "zany": "\u{1F92A}", "shush": "\u{1F92B}", "money": "\u{1F911}",
  "party": "\u{1F973}", "cowboy": "\u{1F920}", "disguise": "\u{1F978}", "monocle": "\u{1F9D0}",
  "robot": "\u{1F916}", "alien": "\u{1F47D}", "ghost": "\u{1F47B}", "skull": "\u{1F480}",
  "pumpkin": "\u{1F383}", "cat": "\u{1F431}", "dog": "\u{1F436}", "fox": "\u{1F98A}",
  "lion": "\u{1F981}", "tiger": "\u{1F42F}", "bear": "\u{1F43B}", "panda": "\u{1F43C}",
  "koala": "\u{1F428}", "unicorn": "\u{1F984}", "dragon": "\u{1F409}", "octopus": "\u{1F419}"
};

function getAvatarDisplay(user: { avatarUrl?: string | null; profileImageUrl?: string | null; firstName?: string | null } | null | undefined) {
  const avatarUrl = user?.avatarUrl;
  if (!avatarUrl) {
    const imageUrl = user?.profileImageUrl;
    return imageUrl ? { type: 'image' as const, url: imageUrl } : { type: 'fallback' as const };
  }
  if (avatarUrl.startsWith('emoji:')) {
    const emojiKey = avatarUrl.replace('emoji:', '');
    return { type: 'emoji' as const, emoji: EMOJI_MAP[emojiKey] || emojiKey };
  }
  const imageUrl = avatarUrl.startsWith('/objects/') ? avatarUrl : user?.profileImageUrl;
  return imageUrl ? { type: 'image' as const, url: imageUrl } : { type: 'fallback' as const };
}

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
  issues: { name: "Issues & Risks", href: "/issues", icon: CircleDot },
  timesheets: { name: "Timesheets", href: "/timesheets", icon: Clock },
  resources: { name: "Resources", href: "/resources", icon: Users },
  calendar: { name: "Calendar", href: "/calendar", icon: Calendar },
  "lessons-learned": { name: "Lessons Learned", href: "/lessons-learned", icon: Lightbulb },
  "user-guide": { name: "User Guide", href: "/user-guide", icon: BookOpen },
};

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, key: "dashboard" },
  { name: "Portfolios", href: "/portfolios", icon: Briefcase, key: "portfolios" },
  { name: "Projects", href: "/projects", icon: FolderKanban, key: "projects" },
  { name: "Intakes", href: "/intakes", icon: FileInput, key: "intakes" },
  { name: "Tasks", href: "/tasks", icon: CheckSquare, key: "tasks" },
  { name: "Issues & Risks", href: "/issues", icon: CircleDot, key: "issues" },
  { name: "Timesheets", href: "/timesheets", icon: Clock, key: "timesheets" },
  { name: "Resources", href: "/resources", icon: Users, key: "resources" },
  { name: "Calendar", href: "/calendar", icon: Calendar, key: "calendar" },
  { name: "Lessons Learned", href: "/lessons-learned", icon: Lightbulb, key: "lessons-learned" },
];

const helpNavigation = [
  { name: "User Guide", href: "/user-guide", icon: BookOpen },
];

function getDefaultSidebarStructure(hiddenModules?: string[] | null, moduleOrder?: string[] | null, hiddenGroups?: string[] | null): SidebarStructure {
  const mainModules = ["dashboard", "portfolios", "projects", "intakes", "tasks", "issues", "timesheets", "resources", "calendar", "lessons-learned"];
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
  const validModuleKeys = new Set(Object.keys(moduleDefinitions));
  
  let updatedStructure = structure.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (item.type === "module") {
        return validModuleKeys.has(item.key);
      }
      return true;
    })
  }));
  
  // Ensure timesheets module is in the menu group
  const hasTimesheets = updatedStructure.some(g => 
    g.items.some(item => item.type === "module" && item.key === "timesheets")
  );
  
  if (!hasTimesheets) {
    const menuGroup = updatedStructure.find(g => g.id === "menu");
    if (menuGroup) {
      updatedStructure = updatedStructure.map(g => {
        if (g.id === "menu") {
          // Add timesheets after issues if it exists, otherwise at the end
          const issuesIndex = g.items.findIndex(item => item.type === "module" && item.key === "issues");
          const insertIndex = issuesIndex >= 0 ? issuesIndex + 1 : g.items.length;
          const newItems = [...g.items];
          newItems.splice(insertIndex, 0, { type: "module" as const, key: "timesheets", hidden: false });
          return { ...g, items: newItems };
        }
        return g;
      });
    }
  }
  
  // Ensure user-guide is in help group
  const helpGroup = updatedStructure.find(g => g.id === "help");
  const hasUserGuide = updatedStructure.some(g => 
    g.items.some(item => item.type === "module" && item.key === "user-guide")
  );
  
  if (!hasUserGuide && helpGroup) {
    updatedStructure = updatedStructure.map(g => {
      if (g.id === "help") {
        return { ...g, items: [...g.items, { type: "module" as const, key: "user-guide", hidden: false }] };
      }
      return g;
    });
  }
  
  if (!helpGroup) {
    updatedStructure = [...updatedStructure, { 
      id: "help", 
      name: "Help", 
      isDefault: true, 
      hidden: false, 
      items: [{ type: "module" as const, key: "user-guide", hidden: false }] 
    }];
  }
  
  return updatedStructure;
}

const userMenuItems = [
  { name: "Profile", href: "/profile", icon: User },
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
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const stored = localStorage.getItem('sidebarCollapsedGroups');
    return stored ? JSON.parse(stored) : {};
  });
  
  // Reset load failure states when organization/user changes
  useEffect(() => {
    setLogoLoadFailed(false);
  }, [currentOrganization?.logoUrl]);
  
  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [user?.avatarUrl, user?.profileImageUrl]);

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups(prev => {
      const updated = { ...prev, [groupId]: !prev[groupId] };
      localStorage.setItem('sidebarCollapsedGroups', JSON.stringify(updated));
      return updated;
    });
  };

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
      {/* Logo Area with Waffle Menu */}
      <div className={cn("flex h-20 items-center", isCollapsed ? "justify-center px-2" : "px-4")}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-slate-800 transition-colors flex-shrink-0 group"
            data-testid="button-waffle-menu"
          >
            <div className="grid grid-cols-3 gap-1">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-sm bg-slate-400 group-hover:bg-white transition-colors" />
              ))}
            </div>
          </button>
          {!isCollapsed && (
            <>
              <img 
                src={logoLoadFailed || !currentOrganization?.logoUrl ? logoIcon : currentOrganization.logoUrl} 
                alt={currentOrganization?.name || "FridayReport.AI"} 
                className="h-8 w-8 flex-shrink-0 object-contain"
                onError={() => setLogoLoadFailed(true)}
              />
              <span className="text-lg font-display font-bold tracking-tight">
                {currentOrganization?.logoUrl && !logoLoadFailed ? currentOrganization.name : "FridayReport.AI"}
              </span>
            </>
          )}
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
            
            const isGroupCollapsed = collapsedGroups[group.id] ?? false;
            
            return (
              <div key={group.id} className={groupIndex > 0 ? "mt-4" : ""}>
                {!isCollapsed && (
                  <button
                    onClick={() => toggleGroupCollapse(group.id)}
                    className="flex w-full items-center justify-between mb-2 px-2 py-1 rounded-md hover:bg-slate-800/50 transition-colors group"
                    data-testid={`button-toggle-group-${group.id}`}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-slate-300">
                      {group.name}
                    </span>
                    <ChevronDown 
                      className={cn(
                        "h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300 transition-transform duration-200",
                        isGroupCollapsed && "-rotate-90"
                      )} 
                    />
                  </button>
                )}
                {isCollapsed && groupIndex > 0 && <div className="mt-4 border-t border-slate-700 pt-4" />}
                
                <div className={cn(
                  "transition-all duration-200 overflow-hidden",
                  !isCollapsed && isGroupCollapsed ? "max-h-0 opacity-0" : "max-h-[1000px] opacity-100"
                )}>
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
                    const openMode = item.openMode || (item.openInNewTab === false ? "iframe" : "newTab");
                    
                    if (openMode === "iframe") {
                      const embedUrl = `/embed?url=${encodeURIComponent(item.url)}&label=${encodeURIComponent(item.label)}`;
                      const iframeLink = (
                        <Link
                          key={item.id}
                          href={embedUrl}
                        >
                          <div
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
                          </div>
                        </Link>
                      );

                      if (isCollapsed) {
                        return (
                          <Tooltip key={item.id} delayDuration={0}>
                            <TooltipTrigger asChild>{iframeLink}</TooltipTrigger>
                            <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                              {item.label}
                            </TooltipContent>
                          </Tooltip>
                        );
                      }
                      return iframeLink;
                    }
                    
                    const customLink = (
                      <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
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
                    {(() => {
                      const display = getAvatarDisplay(user);
                      if (display.type === 'image' && !avatarLoadFailed) {
                        return (
                          <img 
                            src={display.url} 
                            alt="Avatar" 
                            className="h-8 w-8 rounded-full border border-slate-600"
                            onError={() => setAvatarLoadFailed(true)}
                          />
                        );
                      } else if (display.type === 'emoji') {
                        return (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 border border-slate-600">
                            <span className="text-lg">{display.emoji}</span>
                          </div>
                        );
                      } else {
                        return (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 border border-slate-600">
                            <span className="font-bold text-slate-300 text-sm">{user?.firstName?.[0] || 'U'}</span>
                          </div>
                        );
                      }
                    })()}
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
                {(() => {
                  const display = getAvatarDisplay(user);
                  if (display.type === 'image' && !avatarLoadFailed) {
                    return (
                      <img 
                        src={display.url} 
                        alt="Avatar" 
                        className="h-10 w-10 rounded-full border border-slate-600"
                        onError={() => setAvatarLoadFailed(true)}
                      />
                    );
                  } else if (display.type === 'emoji') {
                    return (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 border border-slate-600">
                        <span className="text-2xl">{display.emoji}</span>
                      </div>
                    );
                  } else {
                    return (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 border border-slate-600">
                        <span className="font-bold text-slate-300">{user?.firstName?.[0] || 'U'}</span>
                      </div>
                    );
                  }
                })()}
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
