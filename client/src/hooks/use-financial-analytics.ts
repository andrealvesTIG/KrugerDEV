import { useQuery } from "@tanstack/react-query";

export interface FinancialAnalyticsMonth {
  monthNum: number;
  label: string;
  year: number;
  month: number;
}

export interface FinancialAnalyticsSeriesPoint {
  monthNum: number;
  label: string;
  year: number;
  month: number;
  isFuture: boolean;
  pv: number;
  ac: number;
  fcst: number;
  eac: number;
  pvCum: number;
  acCum: number;
  evCum: number;
  eacCum: number;
}

export interface FinancialAnalyticsTotals {
  bac: number;
  ac: number;
  pv: number;
  ev: number;
  eacEntered: number;
  eacComputed: number;
  vac: number;
  etc: number;
  cpi: number;
  spi: number;
}

export interface FinancialAnalyticsPortfolio {
  portfolioId: number | null;
  name: string;
  projectCount: number;
  bac: number;
  ac: number;
  pv: number;
  ev: number;
  eacEntered: number;
  eacComputed: number;
  vac: number;
  etc: number;
  cpi: number;
  spi: number;
}

export interface FinancialAnalyticsProject {
  projectId: number;
  name: string;
  portfolioId: number | null;
  status: string | null;
  health: string | null;
  completionPercentage: number;
  startDate: string | null;
  endDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  bac: number;
  ac: number;
  pv: number;
  ev: number;
  eacEntered: number;
  eacComputed: number;
  vac: number;
  etc: number;
  cpi: number;
  spi: number;
  pvCum: number[];
  acCum: number[];
  evCum: number[];
  eacMonthly: number[];
  eacCum: number[];
  acMonthly: number[];
  pvMonthly: number[];
}

export interface FinancialAnalyticsResponse {
  fiscalYear: number;
  fiscalYearStartMonth: number;
  asOfMonth: number;
  months: FinancialAnalyticsMonth[];
  totals: FinancialAnalyticsTotals;
  series: FinancialAnalyticsSeriesPoint[];
  portfolios: FinancialAnalyticsPortfolio[];
  projects: FinancialAnalyticsProject[];
}

export function useFinancialAnalytics(
  organizationId?: number | null,
  fiscalYear?: number,
  portfolioId?: number,
) {
  return useQuery<FinancialAnalyticsResponse>({
    queryKey: ["/api/organizations", organizationId, "financial-analytics", fiscalYear, portfolioId],
    enabled: !!organizationId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fiscalYear) params.append("fiscalYear", String(fiscalYear));
      if (portfolioId) params.append("portfolioId", String(portfolioId));
      const qs = params.toString();
      const url = `/api/organizations/${organizationId}/financial-analytics${qs ? `?${qs}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to load financial analytics");
      }
      return res.json();
    },
  });
}
