import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  CALENDAR_MONTH_LONG_LABELS,
  DEFAULT_FISCAL_YEAR_START_MONTH,
  normalizeFiscalYearStartMonth,
} from "@shared/lib/fiscalCalendar";
import type { Organization } from "@shared/schema";

interface FiscalYearStartSectionProps {
  organization: Organization;
}

export function FiscalYearStartSection({ organization }: FiscalYearStartSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initial = normalizeFiscalYearStartMonth(
    organization.fiscalYearStartMonth ?? DEFAULT_FISCAL_YEAR_START_MONTH,
  );
  const [value, setValue] = useState<number>(initial);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setValue(
      normalizeFiscalYearStartMonth(
        organization.fiscalYearStartMonth ?? DEFAULT_FISCAL_YEAR_START_MONTH,
      ),
    );
  }, [organization]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiRequest("PUT", `/api/organizations/${organization.id}`, {
        fiscalYearStartMonth: value,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({
        title: "Saved",
        description: `Fiscal year now starts in ${CALENDAR_MONTH_LONG_LABELS[value - 1]}.`,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to update fiscal year start month",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const dirty = value !== initial;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          Fiscal year start month
        </CardTitle>
        <CardDescription>
          Choose which calendar month is M1 of your fiscal year. This re-labels the
          financial grid columns and Month / Quarter / Year groupings to match your
          organization's calendar (default is October). Existing entries are not
          changed — month numbers are simply re-interpreted against this setting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px]">
            <Label htmlFor="fiscal-year-start-month" className="text-xs text-muted-foreground">
              First month of fiscal year
            </Label>
            <Select
              value={String(value)}
              onValueChange={(v) => setValue(Number(v))}
            >
              <SelectTrigger
                id="fiscal-year-start-month"
                className="h-9 w-[220px]"
                data-testid="select-fiscal-year-start-month"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALENDAR_MONTH_LONG_LABELS.map((label, idx) => (
                  <SelectItem
                    key={label}
                    value={String(idx + 1)}
                    data-testid={`option-fy-start-${idx + 1}`}
                  >
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleSave}
            disabled={!dirty || isSaving}
            data-testid="button-save-fiscal-year-start"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
