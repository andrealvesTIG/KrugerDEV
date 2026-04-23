import { useMemo } from "react";
import type { PbiIntakeState } from "@shared/schema";
import type { PbiIntakeFieldMeta } from "@/hooks/use-powerbi-agent";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, Circle, Loader2, ClipboardList, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  fields: PbiIntakeFieldMeta[];
  sections: string[];
  state: PbiIntakeState | null;
  isExtracting: boolean;
  isSubmitted: boolean;
}

function isCaptured(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  return String(value);
}

export function RequestSummaryPanel({ fields, sections, state, isExtracting, isSubmitted }: Props) {
  const total = fields.length;

  const grouped = useMemo(() => {
    const map = new Map<string, PbiIntakeFieldMeta[]>();
    for (const s of sections) map.set(s, []);
    for (const f of fields) {
      if (!map.has(f.section)) map.set(f.section, []);
      map.get(f.section)!.push(f);
    }
    return map;
  }, [fields, sections]);

  const captured = useMemo(() => {
    if (!state) return 0;
    let n = 0;
    for (const f of fields) {
      if (isCaptured((state as any)[f.key])) n++;
    }
    return n;
  }, [fields, state]);

  const percent = total > 0 ? Math.round((captured / total) * 100) : 0;
  const requestNumber = state?.submittedRequestNumber || null;
  const intakeNumber = state?.submittedIntakeNumber || null;

  return (
    <div className="flex flex-col h-full" data-testid="request-summary-panel">
      <div className="px-4 py-4 border-b bg-background/95 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-start gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-sm flex-shrink-0">
            <ClipboardList className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold">Request Summary</h2>
              {isExtracting && (
                <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" data-testid="extracting-indicator" />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isSubmitted ? "Submitted request" : "Captured so far"}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium" data-testid="text-progress-counter">
            {captured} of {total} captured
          </span>
          <span className="text-xs text-muted-foreground">{percent}%</span>
        </div>
        <Progress value={percent} className="h-1.5" />
        {isSubmitted && (requestNumber || intakeNumber) && (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-2" data-testid="submitted-banner">
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Submitted
            </div>
            <div className="mt-1 space-y-0.5 text-[11px] text-emerald-700/90 dark:text-emerald-300/90">
              {requestNumber && <div data-testid="submitted-request-number">Request: <span className="font-mono">{requestNumber}</span></div>}
              {intakeNumber && <div data-testid="submitted-intake-number">Intake: <span className="font-mono">{intakeNumber}</span></div>}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {sections.map(section => {
          const sectionFields = grouped.get(section) || [];
          if (sectionFields.length === 0) return null;
          const sCaptured = sectionFields.filter(f => isCaptured((state as any)?.[f.key])).length;
          return (
            <div key={section} data-testid={`section-${section.toLowerCase()}`}>
              <div className="flex items-center justify-between mb-1.5 px-0.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {section}
                </h3>
                <Badge
                  variant="secondary"
                  className={cn(
                    "h-5 text-[10px] px-1.5",
                    sCaptured === sectionFields.length && sectionFields.length > 0
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-muted",
                  )}
                  data-testid={`section-count-${section.toLowerCase()}`}
                >
                  {sCaptured}/{sectionFields.length}
                </Badge>
              </div>
              <div className="space-y-1.5">
                {sectionFields.map(f => {
                  const v = (state as any)?.[f.key];
                  const captured = isCaptured(v);
                  return (
                    <Card
                      key={f.key}
                      className={cn(
                        "border-border/60 transition-colors",
                        captured ? "bg-card" : "bg-muted/30",
                      )}
                      data-testid={`field-${f.key}`}
                    >
                      <CardContent className="px-2.5 py-2">
                        <div className="flex items-start gap-2">
                          {captured ? (
                            <div className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-muted-foreground">
                              {f.label}
                            </p>
                            {captured ? (
                              <p
                                className="text-xs mt-0.5 break-words whitespace-pre-wrap"
                                data-testid={`field-value-${f.key}`}
                              >
                                {formatValue(v)}
                              </p>
                            ) : (
                              <p className="text-[11px] mt-0.5 italic text-muted-foreground/60">
                                Not yet captured
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
