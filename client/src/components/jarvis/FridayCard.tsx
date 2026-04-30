import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import {
  Briefcase,
  FolderKanban,
  AlertTriangle,
  Bug,
  CheckSquare,
  Users,
  Flag,
  TrendingUp,
  Bolt,
  Info,
  ChevronRight,
  Loader2,
} from "lucide-react";

export type FridayCardType =
  | "project"
  | "portfolio"
  | "risk"
  | "issue"
  | "task"
  | "resource"
  | "milestone"
  | "metric"
  | "action"
  | "info";

export interface FridayCardField {
  label: string;
  value: string | number;
  accent?: "default" | "muted" | "good" | "warn" | "danger";
}

export interface FridayCardAction {
  label: string;
  type: "create_task" | "create_mitigation" | "assign_owner" | "add_note" | "flag_for_review";
  projectId: number;
  data: Record<string, unknown>;
}

export interface FridayCardData {
  type: FridayCardType;
  title: string;
  subtitle?: string;
  fields?: FridayCardField[];
  actions?: FridayCardAction[];
  href?: string;
  accent?: "default" | "good" | "warn" | "danger";
}

const ICON_BY_TYPE: Record<FridayCardType, typeof Briefcase> = {
  project: Briefcase,
  portfolio: FolderKanban,
  risk: AlertTriangle,
  issue: Bug,
  task: CheckSquare,
  resource: Users,
  milestone: Flag,
  metric: TrendingUp,
  action: Bolt,
  info: Info,
};

const ACCENT_CLASSES: Record<NonNullable<FridayCardData["accent"]>, { bar: string; icon: string; chip: string }> = {
  default: { bar: "bg-primary/30", icon: "text-primary", chip: "bg-primary/10 text-primary border-primary/20" },
  good: { bar: "bg-emerald-500/40", icon: "text-emerald-600 dark:text-emerald-400", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  warn: { bar: "bg-amber-500/40", icon: "text-amber-600 dark:text-amber-400", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  danger: { bar: "bg-rose-500/40", icon: "text-rose-600 dark:text-rose-400", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20" },
};

function fieldAccentClass(accent?: FridayCardField["accent"]): string {
  switch (accent) {
    case "good":
      return "text-emerald-600 dark:text-emerald-400 font-medium";
    case "warn":
      return "text-amber-600 dark:text-amber-400 font-medium";
    case "danger":
      return "text-rose-600 dark:text-rose-400 font-medium";
    case "muted":
      return "text-muted-foreground";
    default:
      return "text-foreground font-medium";
  }
}

interface FridayCardProps {
  card: FridayCardData;
  onNavigate?: (path: string) => void;
}

export function FridayCard({ card, onNavigate }: FridayCardProps) {
  const Icon = ICON_BY_TYPE[card.type] || Info;
  const accent = ACCENT_CLASSES[card.accent ?? "default"];
  const [busyAction, setBusyAction] = useState<number | null>(null);
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();

  const isClickable = !!card.href;

  const handleAction = async (idx: number, action: FridayCardAction) => {
    if (!currentOrganization?.id || busyAction !== null) return;
    try {
      setBusyAction(idx);
      const res = await fetch("/api/jarvis/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          organizationId: currentOrganization.id,
          action: {
            type: action.type,
            projectId: action.projectId,
            data: action.data,
          },
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || "Action failed");
      }
      toast({ title: "Done", description: result.message || `${action.label} completed.` });
    } catch (err: any) {
      toast({
        title: "Action failed",
        description: err.message || "Could not complete action.",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className={
        "relative my-2 rounded-lg border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
      }
      data-testid={`friday-card-${card.type}`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${accent.bar}`} aria-hidden />
      <div className="p-3 pl-4">
        <div
          className={
            "flex items-start gap-3 " + (isClickable ? "cursor-pointer group" : "")
          }
          role={isClickable ? "button" : undefined}
          tabIndex={isClickable ? 0 : undefined}
          onClick={() => {
            if (isClickable && card.href) onNavigate?.(card.href);
          }}
          onKeyDown={(e) => {
            if (isClickable && card.href && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onNavigate?.(card.href);
            }
          }}
        >
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${accent.chip} border`}
          >
            <Icon className={`h-4 w-4 ${accent.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {card.title}
                </div>
                {card.subtitle && (
                  <div className="text-xs text-muted-foreground truncate">{card.subtitle}</div>
                )}
              </div>
              {isClickable && (
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5" />
              )}
            </div>

            {card.fields && card.fields.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {card.fields.map((f, i) => (
                  <div key={i} className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-muted-foreground truncate">{f.label}:</span>
                    <span className={`truncate ${fieldAccentClass(f.accent)}`}>{f.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {card.actions && card.actions.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {card.actions.map((a, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={busyAction !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction(i, a);
                }}
                data-testid={`friday-card-action-${a.type}`}
              >
                {busyAction === i ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Bolt className="h-3 w-3 mr-1" />
                )}
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function tryParseFridayCard(json: string): FridayCardData | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.type !== "string" || typeof parsed.title !== "string") return null;
    const allowedTypes: FridayCardType[] = [
      "project", "portfolio", "risk", "issue", "task", "resource",
      "milestone", "metric", "action", "info",
    ];
    if (!allowedTypes.includes(parsed.type as FridayCardType)) return null;
    return parsed as FridayCardData;
  } catch {
    return null;
  }
}
