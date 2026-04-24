import { useMemo, useState, useEffect, useRef } from "react";
import type { PbiIntakeState } from "@shared/schema";
import type { PbiIntakeFieldMeta } from "@/hooks/use-powerbi-agent";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Check, Circle, Loader2, ClipboardList, CheckCircle2,
  Pencil, MessageSquare, FileText, PencilLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  fields: PbiIntakeFieldMeta[];
  sections: string[];
  state: PbiIntakeState | null;
  isExtracting: boolean;
  isSubmitted: boolean;
  onEditField?: (field: string, value: string | number | null) => Promise<boolean>;
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

type SourceKind = "edited" | "file" | "chat";
function describeSource(
  key: string,
  state: PbiIntakeState | null,
): { kind: SourceKind; label: string; fileName?: string } {
  const edited = (state?.editedFields ?? []).includes(key);
  if (edited) return { kind: "edited", label: "Edited" };
  const fileName = state?.attachmentSourcedFields?.[key];
  if (fileName) return { kind: "file", label: `From file: ${fileName}`, fileName };
  return { kind: "chat", label: "Typed" };
}

interface FieldEditorProps {
  field: PbiIntakeFieldMeta;
  initialValue: unknown;
  onSave: (value: string | number | null) => Promise<void>;
  onCancel: () => void;
}

function FieldEditor({ field, initialValue, onSave, onCancel }: FieldEditorProps) {
  const [value, setValue] = useState<string>(initialValue == null ? "" : String(initialValue));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSave = async () => {
    setSaving(true);
    const trimmed = value.trim();
    if (trimmed === "") {
      await onSave(null);
    } else if (field.type === "number") {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) { setSaving(false); return; }
      await onSave(Math.trunc(n));
    } else {
      await onSave(trimmed);
    }
    setSaving(false);
  };

  const isLong = field.type === "string" && (
    field.key === "description" || field.key === "additionalNotes" ||
    field.key === "dataSources" || field.key === "integrations" ||
    field.key === "filtersAndSlicers" || field.key === "visualRequirements" ||
    field.key === "securityRequirements"
  );

  useEffect(() => {
    if (isLong) {
      textareaRef.current?.focus();
      try { textareaRef.current?.select(); } catch {}
    } else {
      inputRef.current?.focus();
      try { inputRef.current?.select(); } catch {}
    }
  }, [isLong]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    if (e.key === "Enter" && !e.shiftKey && !isLong) { e.preventDefault(); handleSave(); }
  };

  return (
    <div className="mt-1" data-testid={`field-editor-${field.key}`}>
      {isLong ? (
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          className="text-xs min-h-[60px]"
          disabled={saving}
        />
      ) : (
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          inputMode={field.type === "number" ? "numeric" : "text"}
          className="h-7 text-xs"
          disabled={saving}
        />
      )}
      <div className="flex items-center gap-1 mt-1.5">
        <Button
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={handleSave}
          disabled={saving}
          data-testid={`button-save-${field.key}`}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={onCancel}
          disabled={saving}
          data-testid={`button-cancel-${field.key}`}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function RequestSummaryPanel({ fields, sections, state, isExtracting, isSubmitted, onEditField }: Props) {
  const total = fields.length;
  const [editingKey, setEditingKey] = useState<string | null>(null);

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
  const canEdit = !!onEditField && !isSubmitted;

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
              {isSubmitted ? "Submitted request" : "Captured so far — click any field to edit"}
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
                  const isEditing = editingKey === f.key;
                  const source = describeSource(f.key, state);
                  return (
                    <Card
                      key={f.key}
                      className={cn(
                        "border-border/60 transition-colors group",
                        captured ? "bg-card" : "bg-muted/30",
                        canEdit && !isEditing && "hover:border-orange-500/40 cursor-pointer",
                      )}
                      data-testid={`field-${f.key}`}
                      onClick={() => {
                        if (canEdit && !isEditing) setEditingKey(f.key);
                      }}
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
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-medium text-muted-foreground">
                                {f.label}
                              </p>
                              {canEdit && !isEditing && (
                                <button
                                  type="button"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                  onClick={(e) => { e.stopPropagation(); setEditingKey(f.key); }}
                                  aria-label={`Edit ${f.label}`}
                                  data-testid={`button-edit-${f.key}`}
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            {isEditing ? (
                              <FieldEditor
                                field={f}
                                initialValue={v}
                                onCancel={() => setEditingKey(null)}
                                onSave={async (val) => {
                                  if (!onEditField) return;
                                  const ok = await onEditField(f.key, val);
                                  if (ok) setEditingKey(null);
                                }}
                              />
                            ) : captured ? (
                              <>
                                <p
                                  className="text-xs mt-0.5 break-words whitespace-pre-wrap"
                                  data-testid={`field-value-${f.key}`}
                                >
                                  {formatValue(v)}
                                </p>
                                <div
                                  className={cn(
                                    "mt-1 flex items-center gap-1 text-[10px]",
                                    source.kind === "edited" && "text-amber-700 dark:text-amber-400",
                                    source.kind === "file" && "text-emerald-700 dark:text-emerald-400",
                                    source.kind === "chat" && "text-muted-foreground",
                                  )}
                                  data-testid={`field-source-${f.key}`}
                                  data-source={source.kind}
                                  title={source.label}
                                >
                                  {source.kind === "edited" && <PencilLine className="w-2.5 h-2.5" />}
                                  {source.kind === "file" && <FileText className="w-2.5 h-2.5" />}
                                  {source.kind === "chat" && <MessageSquare className="w-2.5 h-2.5" />}
                                  <span className="truncate">{source.label}</span>
                                </div>
                              </>
                            ) : (
                              <p className="text-[11px] mt-0.5 italic text-muted-foreground/60">
                                {canEdit ? "Click to add" : "Not yet captured"}
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
