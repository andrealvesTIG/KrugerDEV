import { Link, useLocation } from "wouter";
import { LayoutDashboard, Briefcase, FolderKanban, Settings, LogOut, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Portfolios", href: "/portfolios", icon: Briefcase },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Calendar", href: "/calendar", icon: Calendar },
];

export function Sidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();

  return (
    <div className="flex h-screen w-72 flex-col bg-slate-900 text-white">
      {/* Logo Area */}
      <div className="flex h-20 items-center px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/25">
            <Briefcase className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-display font-bold tracking-tight">PPM Suite</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-4 py-6">
        <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Menu
        </p>
        {navigation.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "group flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ease-in-out cursor-pointer",
                  isActive
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon
                  className={cn(
                    "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                    isActive ? "text-white" : "text-slate-400 group-hover:text-white"
                  )}
                />
                {item.name}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="border-t border-slate-800 p-4">
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
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
