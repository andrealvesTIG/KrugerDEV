import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Microsoft 365 icon component using official CDN
function MsIcon({ app }: { app: string }) {
  return (
    <img 
      src={`https://res.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/brand-icons/product/svg/${app}_48x1.svg`}
      alt={app}
      className="h-6 w-6"
    />
  );
}

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

const MICROSOFT_APPS: AppItem[] = [
  { id: "teams", name: "Teams", icon: <MsIcon app="teams" />, href: "https://teams.microsoft.com", external: true, color: "bg-[#464EB8]" },
  { id: "outlook", name: "Outlook", icon: <MsIcon app="outlook" />, href: "https://outlook.office.com", external: true, color: "bg-[#0078D4]" },
  { id: "onedrive", name: "OneDrive", icon: <MsIcon app="onedrive" />, href: "https://onedrive.live.com", external: true, color: "bg-[#0078D4]" },
  { id: "sharepoint", name: "SharePoint", icon: <MsIcon app="sharepoint" />, href: "https://www.office.com/launch/sharepoint", external: true, color: "bg-[#038387]" },
  { id: "word", name: "Word", icon: <MsIcon app="word" />, href: "https://www.office.com/launch/word", external: true, color: "bg-[#2B579A]" },
  { id: "excel", name: "Excel", icon: <MsIcon app="excel" />, href: "https://www.office.com/launch/excel", external: true, color: "bg-[#217346]" },
  { id: "powerpoint", name: "PowerPoint", icon: <MsIcon app="powerpoint" />, href: "https://www.office.com/launch/powerpoint", external: true, color: "bg-[#B7472A]" },
  { id: "onenote", name: "OneNote", icon: <MsIcon app="onenote" />, href: "https://www.onenote.com", external: true, color: "bg-[#7719AA]" },
  { id: "planner", name: "Planner", icon: <img src="https://res.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/brand-icons/product/svg/planner_48x1.svg" alt="Planner" className="h-6 w-6" />, href: "https://tasks.office.com", external: true, color: "bg-[#31752F]" },
];

export function WaffleMenu({ 
  onNavigate 
}: WaffleMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleNavigation = (href: string) => {
    setIsOpen(false);
    window.open(href, '_blank');
    onNavigate?.();
  };

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
                onClick={() => handleNavigation(app.href!)}
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-muted/80 transition-colors group"
                data-testid={`waffle-ms-${app.id}`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white">
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
