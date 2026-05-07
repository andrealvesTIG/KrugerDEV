import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROJECT_FORM_FIELD_BY_KEY, type ProjectFieldDefinition } from "@shared/projectFormRegistry";
import type { Portfolio, Program, Resource } from "@shared/schema";

export interface ProjectFieldRendererProps {
  fieldKey: string;
  project: any;
  onChange: (field: string, value: any) => void;
  isLocked: boolean;
  portfolios?: Portfolio[];
  programs?: Program[];
  resources?: Resource[];
}

function toDateInput(v: any): string {
  if (!v) return "";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch { return ""; }
}

export function ProjectFieldRenderer({ fieldKey, project, onChange, isLocked, portfolios, programs, resources }: ProjectFieldRendererProps) {
  const def = PROJECT_FORM_FIELD_BY_KEY[fieldKey];
  if (!def) {
    return (
      <div className="text-xs text-destructive" data-testid={`project-field-unknown-${fieldKey}`}>
        Unknown project field: {fieldKey}
      </div>
    );
  }
  const raw = (project as any)[def.key];
  const current = raw ?? (def.inputType === "checkbox" ? false : "");

  if (def.inputType === "checkbox") {
    return (
      <div className="flex items-center gap-2 pt-4 pb-2">
        <Checkbox
          id={`pf-${def.key}`}
          checked={!!current}
          onCheckedChange={(checked) => onChange(def.key, !!checked)}
          disabled={isLocked}
          data-testid={`checkbox-project-${def.key}`}
        />
        <Label htmlFor={`pf-${def.key}`} className="text-sm cursor-pointer">{def.helpText || def.label}</Label>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm">{def.label}</Label>
      <FieldInput def={def} value={current} disabled={isLocked} onChange={(v) => onChange(def.key, v)} portfolios={portfolios ?? []} programs={programs ?? []} resources={resources ?? []} />
    </div>
  );
}

function FieldInput({ def, value, disabled, onChange, portfolios, programs, resources }: { def: ProjectFieldDefinition; value: any; disabled: boolean; onChange: (v: any) => void; portfolios: Portfolio[]; programs: Program[]; resources: Resource[]; }) {
  // Local "draft" buffer so typing isn't laggy and we only persist on blur.
  const [draft, setDraft] = useState<string>("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      if (def.inputType === "date") setDraft(toDateInput(value));
      else setDraft(value == null ? "" : String(value));
    }
  }, [value, focused, def.inputType]);

  const commit = (v: string) => {
    if (def.inputType === "number" || def.inputType === "currency" || def.inputType === "percentage") {
      onChange(v === "" ? null : v);
    } else if (def.inputType === "date") {
      onChange(v === "" ? null : v);
    } else {
      onChange(v);
    }
  };

  if (def.inputType === "textarea") {
    return (
      <Textarea
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setFocused(false); commit(draft); }}
        disabled={disabled}
        rows={def.rows ?? 3}
        placeholder={def.placeholder}
        data-testid={`input-project-${def.key}`}
      />
    );
  }
  if (def.inputType === "select") {
    return (
      <Select value={value ? String(value) : ""} onValueChange={(v) => onChange(v)} disabled={disabled}>
        <SelectTrigger data-testid={`select-project-${def.key}`}><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          {(def.options ?? []).map(opt => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (def.inputType === "date") {
    return (
      <Input
        type="date"
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => { setDraft(e.target.value); }}
        onBlur={() => { setFocused(false); commit(draft); }}
        disabled={disabled}
        data-testid={`input-project-${def.key}`}
      />
    );
  }
  if (def.inputType === "number" || def.inputType === "currency" || def.inputType === "percentage") {
    return (
      <Input
        type="number"
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setFocused(false); commit(draft); }}
        disabled={disabled}
        placeholder={def.placeholder}
        min={def.inputType === "percentage" ? 0 : undefined}
        max={def.inputType === "percentage" ? 100 : undefined}
        data-testid={`input-project-${def.key}`}
      />
    );
  }
  if (def.inputType === "portfolio") {
    return <PickerCombo
      label="portfolio"
      value={value}
      disabled={disabled}
      options={portfolios.map(p => ({ id: p.id, label: p.name ?? `Portfolio #${p.id}` }))}
      placeholder="Assign to portfolio"
      onChange={(id) => onChange(id)}
      testId={`select-project-${def.key}`}
    />;
  }
  if (def.inputType === "program") {
    return <PickerCombo
      label="program"
      value={value}
      disabled={disabled}
      options={programs.map(p => ({ id: p.id, label: p.name ?? `Program #${p.id}` }))}
      placeholder="Assign to program"
      onChange={(id) => onChange(id)}
      testId={`select-project-${def.key}`}
    />;
  }
  if (def.inputType === "resource") {
    return <PickerCombo
      label="resource"
      value={value}
      disabled={disabled}
      options={resources.map(r => ({ id: r.id, label: r.displayName ?? `Resource #${r.id}` }))}
      placeholder="Assign a resource"
      onChange={(id) => onChange(id)}
      testId={`select-project-${def.key}`}
    />;
  }
  return (
    <Input
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setFocused(false); commit(draft); }}
      disabled={disabled}
      placeholder={def.placeholder}
      data-testid={`input-project-${def.key}`}
    />
  );
}

function PickerCombo({ value, disabled, options, placeholder, onChange, testId, label }: {
  value: any;
  disabled: boolean;
  options: { id: number; label: string }[];
  placeholder: string;
  onChange: (id: number | null) => void;
  testId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full h-9 justify-between font-normal bg-background hover:bg-background active:bg-background [border-color:hsl(var(--input))] shadow-none no-default-hover-elevate no-default-active-elevate"
          disabled={disabled}
          data-testid={testId}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Command shouldFilter={true}>
          <CommandInput placeholder={`Search ${label}…`} />
          <CommandList>
            <CommandEmpty>No {label} found.</CommandEmpty>
            <CommandGroup>
              {value != null && (
                <CommandItem value="__clear__" onSelect={() => { onChange(null); setOpen(false); }}>
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  <span className="text-muted-foreground italic">Clear selection</span>
                </CommandItem>
              )}
              {options.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.label ?? String(p.id)}
                  onSelect={() => { onChange(p.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate" title={p.label}>{p.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
