import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CompactCurrency } from "@/components/CompactCurrency";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrganization } from "@/hooks/use-organization";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useFinancialAnalytics, type FinancialAnalyticsResponse } from "@/hooks/use-financial-analytics";
import { useState, useMemo, type ReactNode } from "react";
import { AlertCircle, DollarSign } from "lucide-react";
import { buildFiscalMonths, currentFiscalYear } from "@shared/lib/fiscalCalendar";

export const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

export function KpiTile({
  label, value, hint, tone, icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "good" | "bad" | "warn";
  icon?: ReactNode;
}) {
  const toneClass = tone === "good" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "bad" ? "text-destructive"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : "";
  return (
    <Card className="p-4" data-testid={`kpi-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon && <div className="p-2 rounded-lg bg-primary/10">{icon}</div>}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </Card>
  );
}

export function Money({ value }: { value: number }) {
  return <CompactCurrency value={value} />;
}

export function PerfBadge({ value, kind }: { value: number; kind: "cpi" | "spi" }) {
  const good = value >= 1;
  const ok = value >= 0.95 && value < 1;
  const variant = good ? "default" : ok ? "secondary" : "destructive";
  return (
    <Badge variant={variant} className="font-mono text-xs">
      {kind.toUpperCase()} {value.toFixed(2)}
    </Badge>
  );
}

export interface FinancialsScopeProps {
  data: FinancialAnalyticsResponse;
  isLoading: boolean;
}

/**
 * Wraps a Financials submenu with the org/FY/portfolio scope picker so each
 * dashboard renders with the same controls without duplicating boilerplate.
 */
export function FinancialsScope({ render }: { render: (props: FinancialsScopeProps & { fiscalYear: number; setFiscalYear: (n: number) => void; portfolioId?: number; setPortfolioId: (n?: number) => void; }) => ReactNode }) {
  const { currentOrganization } = useOrganization();
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  // Default FY: today's fiscal year using org start month (best-effort
  // calendar-year fallback if start month not yet known).
  const today = new Date();
  const startMonth = currentOrganization?.fiscalYearStartMonth ?? 10;
  const defaultFY = currentFiscalYear(today, startMonth);
  const [fiscalYear, setFiscalYear] = useState<number>(defaultFY);
  const [portfolioId, setPortfolioId] = useState<number | undefined>(undefined);

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = defaultFY - 3; y <= defaultFY + 2; y++) years.push(y);
    return years;
  }, [defaultFY]);

  const { data, isLoading, error } = useFinancialAnalytics(currentOrganization?.id, fiscalYear, portfolioId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Financials Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            Project Controls reporting following <a className="hover:underline hover:text-primary" href="https://www.pmi.org/standards/earned-value-management" target="_blank" rel="noopener noreferrer">PMI EVM</a> best practices
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
            <SelectTrigger className="h-9 w-32" data-testid="select-fy"><SelectValue placeholder="Fiscal Year" /></SelectTrigger>
            <SelectContent>
              {yearOptions.map(y => <SelectItem key={y} value={String(y)}>FY {y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={portfolioId ? String(portfolioId) : "all"} onValueChange={(v) => setPortfolioId(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="h-9 w-48" data-testid="select-portfolio"><SelectValue placeholder="All portfolios" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All portfolios</SelectItem>
              {(portfolios || []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Card className="p-6 flex items-start gap-3 border-destructive/40">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium">Couldn't load financial analytics.</div>
            <div className="text-muted-foreground mt-1">{(error as Error).message}</div>
          </div>
        </Card>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      )}

      {data && render({ data, isLoading, fiscalYear, setFiscalYear, portfolioId, setPortfolioId })}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <Card className="p-10 text-center">
      <DollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground mt-2">Open a project's Financials tab to enter AOP / Forecast / Actual values.</p>
    </Card>
  );
}

export function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
export { buildFiscalMonths };
