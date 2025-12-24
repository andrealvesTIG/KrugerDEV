import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Briefcase, FolderKanban, LogOut, Calendar, CircleDot, ChevronLeft, ChevronRight, CheckSquare, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Portfolios", href: "/portfolios", icon: Briefcase },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Tasks", href: "/tasks", icon: CheckSquare },
  { name: "Issues", href: "/issues", icon: CircleDot },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Admin", href: "/admin", icon: Shield, adminOnly: true },
];

export function Sidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={cn(
      "flex h-screen flex-col bg-slate-900 text-white transition-all duration-300 relative",
      isCollapsed ? "w-20" : "w-72"
    )}>
      {/* Collapse Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-24 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
        data-testid="button-toggle-sidebar"
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {/* Logo Area */}
      <div className={cn("flex h-20 items-center", isCollapsed ? "justify-center px-2" : "px-6")}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/25 flex-shrink-0">
            <Briefcase className="h-6 w-6 text-white" />
          </div>
          {!isCollapsed && <span className="text-xl font-display font-bold tracking-tight">PPM Suite</span>}
        </div>
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 space-y-1 py-6", isCollapsed ? "px-2" : "px-4")}>
        {!isCollapsed && (
          <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Menu
          </p>
        )}
        {navigation.map((item) => {
          if ((item as any).adminOnly && user?.role !== 'admin') {
            return null;
          }
          
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          
          const navItem = (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "group flex items-center rounded-xl py-3 text-sm font-medium transition-all duration-200 ease-in-out cursor-pointer",
                  isCollapsed ? "justify-center px-2" : "px-4",
                  isActive
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
                data-testid={`link-nav-${item.name.toLowerCase()}`}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 flex-shrink-0 transition-colors",
                    !isCollapsed && "mr-3",
                    isActive ? "text-white" : "text-slate-400 group-hover:text-white"
                  )}
                />
                {!isCollapsed && item.name}
              </div>
            </Link>
          );

          if (isCollapsed) {
            return (
              <Tooltip key={item.name} delayDuration={0}>
                <TooltipTrigger asChild>
                  {navItem}
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                  {item.name}
                </TooltipContent>
              </Tooltip>
            );
          }

          return navItem;
        })}
      </nav>

      {/* User Section */}
      <div className={cn("border-t border-slate-800", isCollapsed ? "p-2" : "p-4")}>
        {isCollapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => logout()}
                className="flex w-full items-center justify-center rounded-xl bg-slate-800/50 p-3 hover:bg-slate-700 transition-colors"
                data-testid="button-logout"
              >
                {user?.profileImageUrl ? (
                  <img src={user.profileImageUrl} alt="Avatar" className="h-8 w-8 rounded-full border border-slate-600" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 border border-slate-600">
                    <span className="font-bold text-slate-300 text-sm">{user?.firstName?.[0] || 'U'}</span>
                  </div>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
              {user?.firstName || 'User'} - Click to logout
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-slate-800/50 p-3">
            {user?.profileImageUrl ? (
               <img src={user.profileImageUrl} alt="Avatar" className="h-10 w-10 rounded-full border border-slate-600" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 border border-slate-600">
                <span className="font-bold text-slate-300">{user?.firstName?.[0] || 'U'}</span>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-white">{user?.firstName || 'User'}</p>
              <p className="truncate text-xs text-slate-400">View Profile</p>
            </div>
            <button
              onClick={() => logout()}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
