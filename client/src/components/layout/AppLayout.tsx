import { ReactNode, useState } from "react";
import { Sidebar, SidebarProvider, useSidebarState, logoIcon, logoBlack, logoWhite } from "./Sidebar";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { useNotifications, useUnreadNotificationCount, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/use-notifications";
import { Loader2, Building2, ChevronDown, Menu, Bell, Check, MessageSquare, AtSign, HelpCircle, AlertTriangle, Clock, UserPlus, Flag, Target, AlertCircle, CheckCircle2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link, useLocation } from "wouter";
import { SearchCommand } from "./SearchCommand";
import { QuickAddMenu } from "./QuickAddMenu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { HelpDialog } from "@/components/HelpDialog";
import { AICreateButton } from "./AICreateButton";
import { FridayCountdown } from "./FridayCountdown";

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
    window.location.href = "/auth";
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
  const [location] = useLocation();
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const { theme } = useTheme();
  
  // Determine the correct logo based on theme
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const fullLogo = isDark ? logoWhite : logoBlack;
  
  const isFullBleedPage = location.startsWith('/embed');

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <EmailVerificationBanner />
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
              <img src={fullLogo} alt="FridayReport.AI" className="h-6" />
            </Link>
            {isCollapsed && (
              <Link href="/" className="hidden md:flex items-center gap-3 hover:opacity-80 transition-opacity">
                <img src={fullLogo} alt="FridayReport.AI" className="h-6" />
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
          <div className="flex items-center gap-2 flex-shrink-0">
            <FridayCountdown />
            <AICreateButton />
            <QuickAddMenu />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHelpDialogOpen(true)}
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-help"
            >
              <HelpCircle className="h-4 w-4" />
              Help
            </Button>
            <NotificationBell />
            <ThemeToggle />
          </div>
          <HelpDialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen} />
        </header>
        <main className="flex-1 overflow-hidden flex flex-col">
          {isFullBleedPage ? (
            <div className="flex-1 overflow-hidden">
              {children}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <div className="mx-auto max-w-7xl px-4 py-4 md:px-8 md:py-8">
                  {children}
                </div>
              </div>
              <footer className="border-t border-slate-200 dark:border-slate-800 py-4 px-4 md:px-8 flex-shrink-0">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
                  <p className="text-xs text-muted-foreground">Copyright Friday Report LLC</p>
                  <div className="flex items-center gap-4">
                    <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-terms">
                      Terms of Service
                    </Link>
                    <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-privacy">
                      Privacy Statement
                    </Link>
                  </div>
                </div>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function getNotificationIcon(type: string, severity?: string | null) {
  const iconClass = "h-4 w-4";
  
  switch (type) {
    case 'mention':
      return { icon: <AtSign className={`${iconClass} text-blue-600 dark:text-blue-400`} />, bg: 'bg-blue-100 dark:bg-blue-900/30' };
    case 'comment_reply':
      return { icon: <MessageSquare className={`${iconClass} text-primary`} />, bg: 'bg-primary/10' };
    case 'task_overdue':
      return { icon: <AlertTriangle className={`${iconClass} text-destructive`} />, bg: 'bg-destructive/10' };
    case 'task_deadline_warning':
      return { icon: <Clock className={`${iconClass} text-amber-600 dark:text-amber-400`} />, bg: 'bg-amber-100 dark:bg-amber-900/30' };
    case 'project_health_alert':
      return { icon: <AlertCircle className={`${iconClass} text-destructive`} />, bg: 'bg-destructive/10' };
    case 'portfolio_health_alert':
      return { icon: <AlertCircle className={`${iconClass} text-destructive`} />, bg: 'bg-destructive/10' };
    case 'task_assignment':
      return { icon: <UserPlus className={`${iconClass} text-green-600 dark:text-green-400`} />, bg: 'bg-green-100 dark:bg-green-900/30' };
    case 'risk_assignment':
      return { icon: <Flag className={`${iconClass} text-orange-600 dark:text-orange-400`} />, bg: 'bg-orange-100 dark:bg-orange-900/30' };
    case 'issue_assignment':
      return { icon: <AlertCircle className={`${iconClass} text-yellow-600 dark:text-yellow-400`} />, bg: 'bg-yellow-100 dark:bg-yellow-900/30' };
    case 'project_assignment':
      return { icon: <UserPlus className={`${iconClass} text-blue-600 dark:text-blue-400`} />, bg: 'bg-blue-100 dark:bg-blue-900/30' };
    case 'milestone_approaching':
      return { icon: <Target className={`${iconClass} text-amber-600 dark:text-amber-400`} />, bg: 'bg-amber-100 dark:bg-amber-900/30' };
    case 'milestone_overdue':
      return { icon: <Target className={`${iconClass} text-destructive`} />, bg: 'bg-destructive/10' };
    case 'status_change':
      return { icon: <CheckCircle2 className={`${iconClass} text-primary`} />, bg: 'bg-primary/10' };
    default:
      return { icon: <Bell className={`${iconClass} text-primary`} />, bg: 'bg-primary/10' };
  }
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { data: notifications, isLoading } = useNotifications();
  const { data: countData } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = countData?.count || 0;

  const handleNotificationClick = (notification: NonNullable<typeof notifications>[0]) => {
    if (!notification.isRead) {
      markRead.mutate(notification.id);
    }
    if (notification.actionUrl) {
      setLocation(notification.actionUrl);
      setOpen(false);
    } else if (notification.projectId) {
      setLocation(`/projects/${notification.projectId}`);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-medium text-white flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
          <h4 className="font-medium text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllRead.mutate()}
              data-testid="button-mark-all-read"
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[350px]">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : notifications && notifications.length > 0 ? (
            <div className="divide-y">
              {notifications.map((notification) => {
                const { icon, bg } = getNotificationIcon(notification.type, notification.severity);
                const severity = notification.severity;
                return (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 cursor-pointer hover-elevate transition-colors ${!notification.isRead ? 'bg-primary/5' : ''}`}
                    onClick={() => handleNotificationClick(notification)}
                    data-testid={`notification-${notification.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${bg}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{notification.title}</p>
                          {severity === 'critical' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                              Critical
                            </span>
                          )}
                          {severity === 'warning' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">
                              Warning
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {notification.createdAt && formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      {!notification.isRead && (
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No notifications yet</p>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
