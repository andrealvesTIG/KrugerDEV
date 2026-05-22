export interface RoiInput {
  totalCosts: number | string | null | undefined;
  totalBenefits: number | string | null | undefined;
}

export interface RoiResult {
  totalCosts: number;
  totalBenefits: number;
  roiPercent: number | null;
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function computeRoi({ totalCosts, totalBenefits }: RoiInput): RoiResult {
  const costs = toNum(totalCosts);
  const benefits = toNum(totalBenefits);
  if (costs <= 0) {
    return { totalCosts: costs, totalBenefits: benefits, roiPercent: null };
  }
  return {
    totalCosts: costs,
    totalBenefits: benefits,
    roiPercent: ((benefits - costs) / costs) * 100,
  };
}

export function formatRoiPercent(roi: number | null, fractionDigits = 1): string {
  if (roi == null || !Number.isFinite(roi)) return "—";
  return `${roi.toFixed(fractionDigits)}%`;
}
