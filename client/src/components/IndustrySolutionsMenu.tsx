import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { ChevronDown, Heart, Landmark, Factory, Cpu, HardHat, Zap, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const industries = [
  { label: "Healthcare", href: "/healthcare", icon: Heart, color: "text-teal-600 dark:text-teal-400" },
  { label: "Financial Services", href: "/financial-services", icon: Landmark, color: "text-indigo-600 dark:text-indigo-400" },
  { label: "Manufacturing", href: "/manufacturing", icon: Factory, color: "text-orange-600 dark:text-orange-400" },
  { label: "Industrial Automation", href: "/industrial-automation", icon: Cpu, color: "text-cyan-600 dark:text-cyan-400" },
  { label: "Construction & Engineering", href: "/construction", icon: HardHat, color: "text-amber-600 dark:text-amber-400" },
  { label: "Energy & Utilities", href: "/energy", icon: Zap, color: "text-emerald-600 dark:text-emerald-400" },
  { label: "Government & Public Sector", href: "/government", icon: Building, color: "text-slate-600 dark:text-slate-400" },
];

export function IndustrySolutionsMenu({ currentPath }: { currentPath?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        className="text-sm font-medium gap-1"
        onClick={() => setOpen(!open)}
      >
        Industry Solutions
        <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-background border border-border rounded-xl shadow-xl z-50 py-2 animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="px-4 py-2 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Industry Solutions</p>
          </div>
          {industries.map((item) => {
            const isActive = currentPath === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 transition-colors cursor-pointer",
                  isActive && "bg-muted/80"
                )}
              >
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center bg-muted/50", isActive && "bg-primary/10")}>
                  <item.icon className={cn("h-4 w-4", item.color)} />
                </div>
                <span className={cn("text-sm font-medium", isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {item.label}
                </span>
                {isActive && (
                  <span className="ml-auto text-xs text-primary font-medium">Current</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function IndustrySolutionsMobileLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1">Industry Solutions</p>
      {industries.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2 hover:bg-muted/60 rounded-md transition-colors cursor-pointer"
        >
          <item.icon className={cn("h-4 w-4", item.color)} />
          <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
        </Link>
      ))}
    </div>
  );
}
