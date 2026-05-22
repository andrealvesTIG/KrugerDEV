import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { INTAKE_FIELD_BY_KEY, type IntakeFieldDefinition } from "@shared/intakeFormRegistry";
import { MissingRefPlaceholder } from "@/components/forms/MissingRefPlaceholder";
import type { ProjectIntake, Portfolio, Program } from "@shared/schema";
import { useState } from "react";

export interface IntakeFieldRendererProps {
  fieldKey: string;
  intake: ProjectIntake;
  formData: Partial<ProjectIntake>;
  onChange: (field: string, value: any) => void;
  /**
   * Optional autosave hook. Fires on blur for text / textarea / number inputs
   * and immediately on change for discrete inputs (select / checkbox /
   * portfolio / program). Wired in IntakeDetails to persist the single
   * changed field to the server so other surfaces (e.g. the workflow step
   * requirements dialog) read the latest value.
   */
  onCommit?: (field: string, value: any) => void;
  isLocked: boolean;
  portfolios?: Portfolio[];
  programs?: Program[];
  isRequired?: boolean;
  labelOverride?: string | null;
}

export function IntakeFieldRenderer({ fieldKey, intake, formData, onChange, onCommit, isLocked, portfolios, programs, isRequired, labelOverride }: IntakeFieldRendererProps) {
  const def = INTAKE_FIELD_BY_KEY[fieldKey];
  if (!def) {
    return <MissingRefPlaceholder kind="field" itemKey={fieldKey} testIdPrefix="field-unknown" />;
  }
  const current = (formData as any)[def.key] ?? (intake as any)[def.key] ?? (def.inputType === "checkbox" ? false : "");
  const hasOverride = !!(labelOverride && labelOverride.trim());
  const effectiveLabel = hasOverride ? labelOverride!.trim() : def.label;

  if (def.inputType === "checkbox") {
    return (
      <div className="flex items-center gap-2 pt-4 pb-2">
        <Checkbox
          id={def.key}
          checked={!!current}
          onCheckedChange={(checked) => {
            onChange(def.key, checked);
            onCommit?.(def.key, checked);
          }}
          disabled={isLocked}
          data-testid={`checkbox-${def.key}`}
        />
        <Label htmlFor={def.key} className="text-sm cursor-pointer">
          {hasOverride ? effectiveLabel : (def.helpText || def.label)}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
      </div>
    );
  }

  if (def.inputType === "readonly") {
    const raw = current;
    let display: string;
    if (raw === null || raw === undefined || raw === "") {
      display = "—";
    } else if (def.readonlyFormat === "date" || def.readonlyFormat === "datetime") {
      const d = raw instanceof Date ? raw : new Date(raw);
      if (Number.isNaN(d.getTime())) {
        display = String(raw);
      } else if (def.readonlyFormat === "datetime") {
        display = d.toLocaleString();
      } else {
        display = d.toLocaleDateString();
      }
    } else {
      display = String(raw);
    }
    return (
      <div className="space-y-2">
        <Label>
          {effectiveLabel}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
        <div
          className="text-sm text-foreground bg-muted/40 border border-border rounded-md px-3 py-2 min-h-[36px]"
          data-testid={`readonly-${def.key}`}
        >
          {display}
        </div>
      </div>
    );
  }

  if (def.inputType === "program") {
    return (
      <div className="space-y-2">
        <Label>
          {effectiveLabel}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
        <ProgramPicker
          value={current}
          disabled={isLocked}
          programs={programs ?? []}
          onChange={(programId) => {
            onChange("programId", programId);
            const picked = (programs ?? []).find(p => p.id === programId);
            // Keep the legacy text column in sync so analytics / older
            // consumers that read programName keep working.
            onChange("programName", picked?.name ?? null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>
        {effectiveLabel}
        {isRequired && <span className="text-destructive ml-1">*</span>}
      </Label>
      <FieldInput
        def={def}
        value={current}
        disabled={isLocked}
        onChange={(v) => onChange(def.key, v)}
        onCommit={(v) => onCommit?.(def.key, v)}
        portfolios={portfolios}
      />
    </div>
  );
}

function FieldInput({ def, value, disabled, onChange, onCommit, portfolios }: { def: IntakeFieldDefinition; value: any; disabled: boolean; onChange: (v: any) => void; onCommit?: (v: any) => void; portfolios?: Portfolio[]; }) {
  if (def.inputType === "textarea") {
    return (
      <AutoResizeTextarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit?.(e.target.value)}
        disabled={disabled}
        minRows={def.rows ?? 3}
        placeholder={def.placeholder}
        data-testid={`input-${def.key}`}
      />
    );
  }
  if (def.inputType === "number") {
    return (
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit?.(e.target.value)}
        disabled={disabled}
        placeholder={def.placeholder}
        data-testid={`input-${def.key}`}
      />
    );
  }
  if (def.inputType === "select") {
    return (
      <Select
        value={value ?? ""}
        onValueChange={(v) => { onChange(v); onCommit?.(v); }}
        disabled={disabled}
      >
        <SelectTrigger data-testid={`select-${def.key}`}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {(def.options ?? []).map(opt => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (def.inputType === "portfolio") {
    return <PortfolioPicker value={value} onChange={(v) => { onChange(v); onCommit?.(v); }} disabled={disabled} portfolios={portfolios ?? []} />;
  }
  if (def.inputType === "program") {
    // Handled by the parent so it can write both programId and programName.
    return null;
  }
  return (
    <Input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onCommit?.(e.target.value)}
      disabled={disabled}
      placeholder={def.placeholder}
      data-testid={`input-${def.key}`}
    />
  );
}

function ProgramPicker({ value, onChange, disabled, programs }: { value: any; onChange: (v: number | null) => void; disabled: boolean; programs: Program[]; }) {
  const [open, setOpen] = useState(false);
  const numeric = typeof value === "number" ? value : (value ? Number(value) : null);
  const selected = programs.find(p => p.id === numeric);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full h-9 justify-between font-normal bg-background hover:bg-background active:bg-background [border-color:hsl(var(--input))] shadow-none no-default-hover-elevate no-default-active-elevate"
          disabled={disabled}
          data-testid="select-programId"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.name ?? (programs.length === 0 ? "No programs defined" : "Select a program")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Command shouldFilter={true}>
          <CommandInput placeholder="Search programs..." />
          <CommandList>
            <CommandEmpty>No program found.</CommandEmpty>
            <CommandGroup>
              {numeric != null && (
                <CommandItem
                  key="__clear__"
                  value="__clear__"
                  onSelect={() => { onChange(null); setOpen(false); }}
                  data-testid="program-clear"
                >
                  <span className="text-muted-foreground italic">Clear selection</span>
                </CommandItem>
              )}
              {programs.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name ?? String(p.id)}
                  onSelect={() => { onChange(p.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", numeric === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate" title={p.name ?? undefined}>{p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PortfolioPicker({ value, onChange, disabled, portfolios }: { value: any; onChange: (v: any) => void; disabled: boolean; portfolios: Portfolio[]; }) {
  const [open, setOpen] = useState(false);
  const selected = portfolios.find(p => p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full h-9 justify-between font-normal bg-background hover:bg-background active:bg-background [border-color:hsl(var(--input))] shadow-none no-default-hover-elevate no-default-active-elevate"
          disabled={disabled}
          data-testid="select-portfolioId"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {selected?.name ?? "Assign to portfolio"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Command shouldFilter={true}>
          <CommandInput placeholder="Search portfolios..." />
          <CommandList>
            <CommandEmpty>No portfolio found.</CommandEmpty>
            <CommandGroup>
              {portfolios.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name ?? String(p.id)}
                  onSelect={() => { onChange(p.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate" title={p.name}>{p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
