import { useState } from "react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Briefcase, 
  FolderKanban, 
  CheckSquare, 
  CircleDot, 
  Calendar, 
  Users, 
  FileInput, 
  Clock,
  BookOpen,
  Settings,
  ArrowRight,
  Mail,
  Video,
  FileText,
  Grid3X3,
  Table2,
  Notebook,
  HardDrive,
  Share2,
  ListTodo
} from "lucide-react";

interface WaffleMenuProps {
  enabledModules?: string[];
  organizationId?: number;
  isMicrosoftConnected?: boolean;
  onNavigate?: () => void;
}

interface AppItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  href?: string;
  external?: boolean;
  color?: string;
}

const INTERNAL_APPS: AppItem[] = [
  { id: "dashboard", name: "Dashboard", icon: <LayoutDashboard className="h-6 w-6" />, href: "/", color: "bg-orange-500" },
  { id: "portfolios", name: "Portfolios", icon: <Briefcase className="h-6 w-6" />, href: "/portfolios", color: "bg-blue-600" },
  { id: "projects", name: "Projects", icon: <FolderKanban className="h-6 w-6" />, href: "/projects", color: "bg-green-600" },
  { id: "tasks", name: "Tasks", icon: <CheckSquare className="h-6 w-6" />, href: "/tasks", color: "bg-purple-600" },
  { id: "issues", name: "Issues", icon: <CircleDot className="h-6 w-6" />, href: "/issues", color: "bg-red-500" },
  { id: "timesheets", name: "Timesheets", icon: <Clock className="h-6 w-6" />, href: "/timesheets", color: "bg-teal-600" },
  { id: "resources", name: "Resources", icon: <Users className="h-6 w-6" />, href: "/resources", color: "bg-indigo-600" },
  { id: "intakes", name: "Intakes", icon: <FileInput className="h-6 w-6" />, href: "/intakes", color: "bg-amber-600" },
  { id: "calendar", name: "Calendar", icon: <Calendar className="h-6 w-6" />, href: "/calendar", color: "bg-cyan-600" },
  { id: "user-guide", name: "User Guide", icon: <BookOpen className="h-6 w-6" />, href: "/user-guide", color: "bg-slate-600" },
  { id: "integrations", name: "Integrations", icon: <Settings className="h-6 w-6" />, href: "/integrations", color: "bg-gray-600" },
];

const MICROSOFT_APPS: AppItem[] = [
  { id: "teams", name: "Teams", icon: <Video className="h-6 w-6" />, href: "https://teams.microsoft.com", external: true, color: "bg-[#464EB8]" },
  { id: "outlook", name: "Outlook", icon: <Mail className="h-6 w-6" />, href: "https://outlook.office.com", external: true, color: "bg-[#0078D4]" },
  { id: "onedrive", name: "OneDrive", icon: <HardDrive className="h-6 w-6" />, href: "https://onedrive.live.com", external: true, color: "bg-[#0078D4]" },
  { id: "sharepoint", name: "SharePoint", icon: <Share2 className="h-6 w-6" />, href: "https://www.office.com/launch/sharepoint", external: true, color: "bg-[#038387]" },
  { id: "word", name: "Word", icon: <FileText className="h-6 w-6" />, href: "https://www.office.com/launch/word", external: true, color: "bg-[#2B579A]" },
  { id: "excel", name: "Excel", icon: <Table2 className="h-6 w-6" />, href: "https://www.office.com/launch/excel", external: true, color: "bg-[#217346]" },
  { id: "powerpoint", name: "PowerPoint", icon: <Grid3X3 className="h-6 w-6" />, href: "https://www.office.com/launch/powerpoint", external: true, color: "bg-[#B7472A]" },
  { id: "onenote", name: "OneNote", icon: <Notebook className="h-6 w-6" />, href: "https://www.onenote.com", external: true, color: "bg-[#7719AA]" },
  { id: "planner", name: "Planner", icon: <ListTodo className="h-6 w-6" />, href: "https://tasks.office.com", external: true, color: "bg-[#31752F]" },
];

export function WaffleMenu({ 
  enabledModules, 
  isMicrosoftConnected = false,
  onNavigate 
}: WaffleMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();

  const handleNavigation = (href: string, external?: boolean) => {
    setIsOpen(false);
    if (external) {
      window.open(href, '_blank');
    } else {
      setLocation(href);
    }
    onNavigate?.();
  };

  const filteredInternalApps = enabledModules 
    ? INTERNAL_APPS.filter(app => enabledModules.includes(app.id) || app.id === "integrations")
    : INTERNAL_APPS;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-slate-800 transition-colors flex-shrink-0 group"
          data-testid="button-waffle-menu"
        >
          <div className="grid grid-cols-3 gap-1">
            {[...Array(9)].map((_, i) => (
              <div 
                key={i} 
                className="w-1.5 h-1.5 rounded-sm bg-slate-400 group-hover:bg-white transition-colors" 
              />
            ))}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent 
        side="right" 
        align="start" 
        sideOffset={8}
        className="w-[340px] p-0 bg-white dark:bg-[#1f1f1f] shadow-2xl border-0 rounded-lg overflow-hidden"
        data-testid="waffle-menu-content"
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Microsoft 365</h3>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            {MICROSOFT_APPS.map((app) => (
              <button
                key={app.id}
                onClick={() => handleNavigation(app.href!, app.external)}
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-muted/80 transition-colors group"
                data-testid={`waffle-ms-${app.id}`}
              >
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-md text-white",
                  app.color || "bg-gray-500"
                )}>
                  {app.icon}
                </div>
                <span className="text-xs text-center text-muted-foreground group-hover:text-foreground truncate w-full">
                  {app.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
