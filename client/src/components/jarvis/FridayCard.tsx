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
  Trash2,
  XCircle,
  Check,
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

export type FridayActionType =
  | "create_task"
  | "create_mitigation"
  | "assign_owner"
  | "add_note"
  | "flag_for_review"
  | "configure_organization"
  | "create_portfolio"
  | "update_portfolio"
  | "delete_portfolio"
  | "add_project_to_portfolio"
  | "remove_project_from_portfolio"
  | "create_project"
  | "update_project"
  | "delete_project"
  | "create_issue"
  | "update_risk"
  | "delete_risk"
  | "update_issue"
  | "delete_issue"
  | "update_task"
  | "delete_task"
  | "bulk_delete_tasks"
  | "create_resource"
  | "update_resource"
  | "delete_resource"
  | "assign_resources_to_task"
  | "invite_member"
  | "remove_member"
  | "cancel";

const DESTRUCTIVE_ACTIONS: ReadonlySet<FridayActionType> = new Set([
  "delete_portfolio",
  "delete_project",
  "delete_risk",
  "delete_issue",
  "delete_task",
  "bulk_delete_tasks",
  "delete_resource",
  "remove_member",
]);

export interface FridayCardActionData {
  industry?: string;
  dismiss?: boolean;
  /** When true on configure_organization, bypass the empty-workspace guard and seed demo data anyway. */
  force?: boolean;
  [key: string]: unknown;
}

export interface FridayCardAction {
  label: string;
  type: FridayActionType;
  /** Optional — required for project-scoped actions but absent for org-scoped ones (delete_portfolio, invite_member, etc.). */
  projectId?: number;
  data?: FridayCardActionData;
}

function isDismissAction(action: FridayCardAction): boolean {
  return action.data?.dismiss === true;
}

interface ActionResultLink {
  label: string;
  href: string;
}

interface ActionRunState {
  status: "success" | "error";
  message: string;
  links?: ActionResultLink[];
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
  const [runState, setRunState] = useState<ActionRunState | null>(null);
  const [completedLabel, setCompletedLabel] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();

  const isClickable = !!card.href;
  const isLocked = completedLabel !== null;

  if (dismissed) return null;

  const handleAction = async (idx: number, action: FridayCardAction) => {
    if (busyAction !== null || isLocked) return;

    // Cancel / explicit dismiss data flag → pure local dismissal, no HTTP.
    if (action.type === "cancel" || isDismissAction(action)) {
      setDismissed(true);
      return;
    }

    if (!currentOrganization?.id) return;
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
            ...(typeof action.projectId === "number" ? { projectId: action.projectId } : {}),
            data: action.data ?? {},
          },
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || "Action failed");
      }

      if (action.type === "configure_organization") {
        setRunState({
          status: "success",
          message: result.message || "Workspace configured.",
          links: Array.isArray(result.links) ? result.links : undefined,
        });
      }
      toast({ title: "Done", description: result.message || `${action.label} completed.` });
      // Lock the card after a successful (non-cancel) action so the user
      // can't accidentally double-fire (especially for destructive ops).
      setCompletedLabel(action.label);
    } catch (err: any) {
      const message = err.message || "Could not complete action.";
      if (action.type === "configure_organization") {
        setRunState({ status: "error", message });
      }
      toast({
        title: "Action failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  };

  if (dismissed) {
    return (
      <div
        className="my-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        data-testid="friday-card-dismissed"
      >
        Maybe later — let me know if you change your mind.
      </div>
    );
  }

  if (runState?.status === "success") {
    return (
      <div
        className="relative my-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 overflow-hidden"
        data-testid="friday-card-configured"
      >
        <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500/50" aria-hidden />
        <div className="p-3 pl-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              <Bolt className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">Workspace configured</div>
              <div className="text-xs text-muted-foreground mt-0.5">{runState.message}</div>
              {runState.links && runState.links.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {runState.links.map((link, i) => (
                    <button
                      key={`${link.href}-${i}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate?.(link.href);
                      }}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 underline underline-offset-2 self-start"
                      data-testid={`friday-card-configured-link-${i}`}
                    >
                      <ChevronRight className="h-3 w-3" />
                      {link.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            {card.actions.map((a, i) => {
              const isDestructive = DESTRUCTIVE_ACTIONS.has(a.type);
              const isCancel = a.type === "cancel";
              const isDismiss = isDismissAction(a);
              const variant = isDestructive
                ? "destructive"
                : isCancel || isDismiss
                  ? "ghost"
                  : "outline";
              const ActionIcon = isDestructive
                ? Trash2
                : isCancel
                  ? XCircle
                  : Bolt;

              return (
                <Button
                  key={i}
                  variant={variant as any}
                  size="sm"
                  className={
                    isDismiss
                      ? "h-7 px-2 text-xs text-foreground hover:bg-accent"
                      : "h-7 px-2 text-xs"
                  }
                  disabled={(busyAction !== null && busyAction !== i) || isLocked}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAction(i, a);
                  }}
                  data-testid={`friday-card-action-${a.type}${isDismiss ? "-dismiss" : ""}`}
                >
                  {busyAction === i ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : isLocked && completedLabel === a.label ? (
                    <Check className="h-3 w-3 mr-1" />
                  ) : isDismiss ? null : (
                    <ActionIcon className="h-3 w-3 mr-1" />
                  )}
                  {a.label}
                </Button>
              );
            })}
          </div>
        )}

        {runState?.status === "error" && (
          <div
            className="mt-2 rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-xs text-rose-700 dark:text-rose-400"
            data-testid="friday-card-action-error"
          >
            {runState.message}
          </div>
        )}

        {isLocked && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            {completedLabel} completed.
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
