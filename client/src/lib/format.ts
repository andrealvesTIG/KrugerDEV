export function formatCurrency(value: number | string | null | undefined, options?: {
  compact?: boolean;
  currency?: string;
  showCents?: boolean;
}): string {
  if (value === null || value === undefined) return "$0";
  
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "$0";
  
  const { compact = false, currency = "USD", showCents = false } = options || {};
  
  if (compact) {
    const absValue = Math.abs(numValue);
    const sign = numValue < 0 ? "-" : "";
    
    if (absValue >= 1_000_000_000) {
      return `${sign}$${(absValue / 1_000_000_000).toFixed(1)}B`;
    } else if (absValue >= 1_000_000) {
      return `${sign}$${(absValue / 1_000_000).toFixed(1)}M`;
    } else if (absValue >= 1_000) {
      return `${sign}$${(absValue / 1_000).toFixed(0)}K`;
    } else {
      return `${sign}$${absValue.toFixed(0)}`;
    }
  }
  
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(numValue);
}

export function formatNumber(value: number | string | null | undefined, options?: {
  compact?: boolean;
  decimals?: number;
}): string {
  if (value === null || value === undefined) return "0";
  
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "0";
  
  const { compact = false, decimals = 0 } = options || {};
  
  if (compact) {
    const absValue = Math.abs(numValue);
    const sign = numValue < 0 ? "-" : "";
    
    if (absValue >= 1_000_000_000) {
      return `${sign}${(absValue / 1_000_000_000).toFixed(1)}B`;
    } else if (absValue >= 1_000_000) {
      return `${sign}${(absValue / 1_000_000).toFixed(1)}M`;
    } else if (absValue >= 1_000) {
      return `${sign}${(absValue / 1_000).toFixed(0)}K`;
    }
  }
  
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue);
}

export function formatPercent(value: number | string | null | undefined, options?: {
  decimals?: number;
  showSign?: boolean;
}): string {
  if (value === null || value === undefined) return "0%";
  
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "0%";
  
  const { decimals = 1, showSign = false } = options || {};
  const sign = showSign && numValue > 0 ? "+" : "";
  
  return `${sign}${numValue.toFixed(decimals)}%`;
}
