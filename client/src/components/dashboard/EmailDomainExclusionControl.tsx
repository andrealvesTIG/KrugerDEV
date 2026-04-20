import { useState, type KeyboardEvent } from "react";
import { Mail, X, RotateCcw, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useExcludedEmailDomains } from "@/hooks/use-excluded-email-domains";
import { DEFAULT_EXCLUDED_EMAIL_DOMAINS } from "@shared/lib/emailDomains";

interface EmailDomainExclusionControlProps {
  className?: string;
}

export function EmailDomainExclusionControl({
  className,
}: EmailDomainExclusionControlProps) {
  const { domains, enabled, addDomain, removeDomain, setEnabled, resetToDefaults } =
    useExcludedEmailDomains();
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);

  const isDefault =
    enabled &&
    domains.length === DEFAULT_EXCLUDED_EMAIL_DOMAINS.length &&
    DEFAULT_EXCLUDED_EMAIL_DOMAINS.every((d) => domains.includes(d));

  const submit = () => {
    const value = input.trim();
    if (!value) return;
    addDomain(value);
    setInput("");
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      submit();
    }
  };

  const activeCount = enabled ? domains.length : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={enabled && domains.length > 0 ? "secondary" : "outline"}
          size="sm"
          className={`h-8 gap-1.5 ${className || ""}`}
          data-testid="filter-excluded-email-domains"
        >
          <Mail className="h-3.5 w-3.5" />
          <span className="text-xs">
            Exclude domains
            {activeCount > 0 ? ` (${activeCount})` : ""}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium">Excluded email domains</h4>
              <p className="text-xs text-muted-foreground">
                Hide users matching these domains from analytics.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label
              htmlFor="excluded-domains-toggle"
              className="text-xs font-normal"
            >
              Apply exclusion
            </Label>
            <Switch
              id="excluded-domains-toggle"
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="toggle-excluded-email-domains"
            />
          </div>

          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {domains.length === 0 && (
              <span className="text-xs text-muted-foreground italic">
                No domains excluded.
              </span>
            )}
            {domains.map((d) => (
              <Badge
                key={d}
                variant={enabled ? "secondary" : "outline"}
                className="h-6 gap-1 pr-1 text-xs"
                data-testid={`chip-excluded-domain-${d}`}
              >
                <span>{d}</span>
                <button
                  type="button"
                  onClick={() => removeDomain(d)}
                  className="rounded-sm opacity-70 hover:opacity-100"
                  aria-label={`Remove ${d}`}
                  data-testid={`remove-excluded-domain-${d}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="example.com"
              className="h-8 text-xs"
              data-testid="input-excluded-domain"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              onClick={submit}
              data-testid="add-excluded-domain"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {!isDefault && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-1.5 text-muted-foreground"
              onClick={resetToDefaults}
              data-testid="reset-excluded-email-domains"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="text-xs">Reset to defaults</span>
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
