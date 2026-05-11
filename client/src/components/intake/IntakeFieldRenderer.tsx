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
import { INTAKE_FIELD_BY_KEY, type IntakeFieldDefinition } from "@shared/intakeFormRegistry";
import type { ProjectIntake, Portfolio } from "@shared/schema";
import { useState } from "react";

export interface IntakeFieldRendererProps {
  fieldKey: string;
  intake: ProjectIntake;
  formData: Partial<ProjectIntake>;
  onChange: (field: string, value: any) => void;
  isLocked: boolean;
  portfolios?: Portfolio[];
  isRequired?: boolean;
  labelOverride?: string | null;
}

export function IntakeFieldRenderer({ fieldKey, intake, formData, onChange, isLocked, portfolios, isRequired, labelOverride }: IntakeFieldRendererProps) {
  const def = INTAKE_FIELD_BY_KEY[fieldKey];
  if (!def) {
    return (
      <div className="text-xs text-destructive" data-testid={`field-unknown-${fieldKey}`}>
        Unknown field: {fieldKey}
      </div>
    );
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
          onCheckedChange={(checked) => onChange(def.key, checked)}
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

  return (
    <div className="space-y-2">
      <Label>
        {effectiveLabel}
        {isRequired && <span className="text-destructive ml-1">*</span>}
      </Label>
      <FieldInput def={def} value={current} disabled={isLocked} onChange={(v) => onChange(def.key, v)} portfolios={portfolios} />
    </div>
  );
}

function FieldInput({ def, value, disabled, onChange, portfolios }: { def: IntakeFieldDefinition; value: any; disabled: boolean; onChange: (v: any) => void; portfolios?: Portfolio[]; }) {
  if (def.inputType === "textarea") {
    return (
      <Textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={def.rows ?? 3}
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
        disabled={disabled}
        placeholder={def.placeholder}
        data-testid={`input-${def.key}`}
      />
    );
  }
  if (def.inputType === "select") {
    return (
      <Select value={value ?? ""} onValueChange={onChange} disabled={disabled}>
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
    return <PortfolioPicker value={value} onChange={onChange} disabled={disabled} portfolios={portfolios ?? []} />;
  }
  return (
    <Input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={def.placeholder}
      data-testid={`input-${def.key}`}
    />
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
