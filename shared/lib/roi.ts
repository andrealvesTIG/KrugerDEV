export interface RoiInput {
  totalCosts: number | string | null | undefined;
  totalBenefits: number | string | null | undefined;
}

export interface RoiResult {
  totalCosts: number;
  totalBenefits: number;
  roiPercent: number | null;
}

function toNumOrNull(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function computeRoi({ totalCosts, totalBenefits }: RoiInput): RoiResult {
  const costs = toNumOrNull(totalCosts);
  const benefits = toNumOrNull(totalBenefits);
  if (costs == null || benefits == null || costs <= 0) {
    return {
      totalCosts: costs ?? 0,
      totalBenefits: benefits ?? 0,
      roiPercent: null,
    };
  }
  return {
    totalCosts: costs,
    totalBenefits: benefits,
    roiPercent: ((benefits - costs) / costs) * 100,
  };
}

export function explainMissingRoi({ totalCosts, totalBenefits }: RoiInput): string | null {
  const c = toNumOrNull(totalCosts);
  const b = toNumOrNull(totalBenefits);
  if (c == null && b == null) return "Both Costs and Benefits are missing.";
  if (c == null) return "Costs are missing.";
  if (b == null) return "Benefits are missing.";
  if (c <= 0) return "Costs must be greater than zero.";
  return null;
}

export function formatRoiPercent(roi: number | null, fractionDigits = 1): string {
  if (roi == null || !Number.isFinite(roi)) return "—";
  return `${roi.toFixed(fractionDigits)}%`;
}
