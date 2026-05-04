import { useState } from "react";
import { useLocation } from "wouter";
import {
  User,
  Mail,
  CreditCard,
  Building2,
  Crown,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { setAiMode } from "@/hooks/use-ai-mode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type AvatarDisplay =
  | { type: "image"; url: string }
  | { type: "emoji"; emoji: string }
  | { type: "fallback" };

function getAvatarDisplay(user: {
  avatarUrl?: string | null;
  profileImageUrl?: string | null;
  firstName?: string | null;
} | null | undefined): AvatarDisplay {
  const avatarUrl = user?.avatarUrl;
  if (!avatarUrl) {
    if (user?.profileImageUrl) return { type: "image", url: user.profileImageUrl };
    return { type: "fallback" };
  }
  if (avatarUrl.startsWith("emoji:")) {
    return { type: "emoji", emoji: avatarUrl.replace("emoji:", "") };
  }
  const imageUrl = avatarUrl.startsWith("/objects/") ? avatarUrl : user?.profileImageUrl;
  if (imageUrl) return { type: "image", url: imageUrl };
  return { type: "fallback" };
}

interface UserMenuItem {
  name: string;
  href: string;
  icon: typeof User;
  superAdminOnly?: boolean;
}

const baseMenuItems: UserMenuItem[] = [
  { name: "Profile", href: "/profile", icon: User },
  { name: "Scheduled Reports", href: "/scheduled-reports", icon: Mail },
  { name: "Billing", href: "/billing", icon: CreditCard },
  { name: "Org Settings", href: "/org-settings", icon: Building2 },
  { name: "Super Admin", href: "/super-admin", icon: Crown, superAdminOnly: true },
];

interface UserMenuProps {
  /**
   * When true, navigation items first exit AI Mode (so the destination route
   * is actually visible behind the AI Mode overlay) before routing.
   */
  exitAiModeOnNavigate?: boolean;
  /** Show the user's first name + chevron next to the avatar (default true). */
  showName?: boolean;
}

export function UserMenu({ exitAiModeOnNavigate = false, showName = true }: UserMenuProps) {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { currentOrganization } = useOrganization();
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const isTeamMember = (user as any)?.role === "team_member";
  const isSuperAdmin = (user as any)?.role === "super_admin" || (user as any)?.role === "marketing";

  const handleNavigate = (href: string) => {
    setOpen(false);
    if (exitAiModeOnNavigate) {
      setAiMode(false);
      setTimeout(() => setLocation(href), 100);
    } else {
      setLocation(href);
    }
  };

  const handleLogout = () => {
    setOpen(false);
    logout();
  };

  const visibleItems = baseMenuItems.filter(item => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.href === "/billing" && (currentOrganization as any)?.billingHidden && !isSuperAdmin) return false;
    if (isTeamMember && (item.href === "/org-settings" || item.href === "/billing" || item.href === "/scheduled-reports")) return false;
    return true;
  });

  const display = getAvatarDisplay(user as any);
  const initial = user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || "U";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 rounded-full p-1 pr-2 transition-colors",
            "hover:bg-accent dark:hover:bg-slate-800",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          )}
          aria-label="Open user menu"
          data-testid="button-user-menu-ai"
        >
          {display.type === "image" && !imageFailed ? (
            <img
              src={display.url}
              alt="Avatar"
              className="h-8 w-8 rounded-full object-cover border border-border dark:border-slate-600"
              onError={() => setImageFailed(true)}
            />
          ) : display.type === "emoji" ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted dark:bg-slate-700 border border-border dark:border-slate-600">
              <span className="text-base leading-none">{display.emoji}</span>
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/20 border border-border dark:border-slate-600">
              <span className="text-sm font-semibold text-primary">{initial}</span>
            </div>
          )}
          {showName && (
            <>
              <span className="hidden sm:inline text-sm font-medium text-foreground dark:text-slate-100 max-w-[120px] truncate">
                {user?.firstName || "Account"}
              </span>
              <ChevronDown
                className={cn(
                  "hidden sm:block h-3.5 w-3.5 text-muted-foreground transition-transform",
                  open && "rotate-180"
                )}
              />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        // AI Mode renders at z-[200], so the default z-50 on Radix portals
        // would put this menu behind the overlay. Bump above z-200.
        className="w-60 z-[300]"
        data-testid="menu-user-ai"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium truncate">
              {user?.firstName || user?.lastName
                ? `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()
                : user?.email}
            </p>
            {(user?.firstName || user?.lastName) && user?.email && (
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visibleItems.map(item => (
          <DropdownMenuItem
            key={item.name}
            onSelect={() => handleNavigate(item.href)}
            className="cursor-pointer gap-2"
            data-testid={`menu-item-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleLogout}
          className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
          data-testid="menu-item-logout"
        >
          <LogOut className="h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
