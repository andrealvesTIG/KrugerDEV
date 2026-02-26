import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { ChevronDown, Heart, Landmark, Factory, Cpu, HardHat, Zap, Building, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const industries = [
  {
    label: "Healthcare",
    description: "HIPAA-ready project oversight for hospitals, health systems, and clinical PMOs.",
    href: "/healthcare",
    icon: Heart,
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-50 dark:bg-teal-950/40",
  },
  {
    label: "Financial Services",
    description: "Compliance-first portfolio management for banks, insurance, and investment firms.",
    href: "/financial-services",
    icon: Landmark,
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-50 dark:bg-indigo-950/40",
  },
  {
    label: "Manufacturing",
    description: "End-to-end program tracking for NPI, plant expansions, and supply chain projects.",
    href: "/manufacturing",
    icon: Factory,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/40",
  },
  {
    label: "Industrial Automation",
    description: "Coordinate SCADA upgrades, PLC migrations, and control system modernization.",
    href: "/industrial-automation",
    icon: Cpu,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/40",
  },
  {
    label: "Construction & Engineering",
    description: "Multi-site capital program management with contractor and permit tracking.",
    href: "/construction",
    icon: HardHat,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/40",
  },
  {
    label: "Energy & Utilities",
    description: "Grid modernization, renewables, and NERC CIP compliance program oversight.",
    href: "/energy",
    icon: Zap,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  {
    label: "Government & Public Sector",
    description: "IT modernization, grant compliance, and inter-agency program coordination.",
    href: "/government",
    icon: Building,
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-100 dark:bg-slate-800/40",
  },
];

export function IndustrySolutionsMenu({ currentPath, variant = "default" }: { currentPath?: string; variant?: "default" | "dark" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownTop, setDropdownTop] = useState(0);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (open && buttonRef.current) {
      const updatePosition = () => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          setDropdownTop(rect.bottom + 8);
        }
      };
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        ref={buttonRef}
        variant="ghost"
        className={cn(
          "text-sm font-medium gap-1",
          variant === "dark" && "text-slate-200 hover:text-orange-400 hover:bg-transparent"
        )}
        onClick={() => setOpen(!open)}
      >
        Industry Solutions
        <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
      </Button>
      {open && (
        <div
          style={{ top: dropdownTop }}
          className="fixed left-1/2 -translate-x-1/2 w-[min(720px,calc(100vw-2rem))] bg-background border border-border rounded-xl shadow-2xl z-50 animate-in fade-in-0 zoom-in-95 duration-150 overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-border bg-muted/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Industry Solutions</p>
            <p className="text-xs text-muted-foreground mt-0.5">Purpose-built project portfolio management</p>
          </div>
          <div className="p-3 grid grid-cols-3 gap-1.5">
            {industries.map((item) => {
              const isActive = currentPath === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-start gap-3 px-3.5 py-3 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer group",
                    isActive && "bg-muted/60"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors",
                    item.bgColor,
                    isActive && "ring-2 ring-primary/20"
                  )}>
                    <item.icon className={cn("h-[18px] w-[18px]", item.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-sm font-semibold leading-tight",
                        isActive ? "text-foreground" : "text-foreground/80 group-hover:text-foreground"
                      )}>
                        {item.label}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Current</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="px-5 py-2.5 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground">
              Every industry solution includes AI-powered risk detection, real-time dashboards, and executive reporting.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function IndustrySolutionsMobileLinks({ onNavigate, variant = "default" }: { onNavigate?: () => void; variant?: "default" | "dark" }) {
  const isDark = variant === "dark";
  return (
    <div className="space-y-1">
      <p className={cn(
        "text-xs font-semibold uppercase tracking-wider px-3 py-1",
        isDark ? "text-slate-400" : "text-muted-foreground"
      )}>Industry Solutions</p>
      {industries.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            "flex items-start gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer",
            isDark ? "hover:bg-slate-700/60" : "hover:bg-muted/60"
          )}
        >
          <item.icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", item.color)} />
          <div className="min-w-0">
            <span className={cn(
              "text-sm font-medium block",
              isDark ? "text-slate-200" : "text-muted-foreground"
            )}>{item.label}</span>
            <span className={cn(
              "text-xs line-clamp-1",
              isDark ? "text-slate-400" : "text-muted-foreground/70"
            )}>{item.description}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
