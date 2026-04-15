function stripTrailingZeros(num: string): string {
  if (!num.includes('.')) return num;
  return num.replace(/\.?0+$/, '');
}

export function formatCurrency(value: number | string | null | undefined, options?: {
  compact?: boolean;
  autoCompact?: boolean;
  currency?: string;
  showCents?: boolean;
  decimals?: number;
}): string {
  if (value === null || value === undefined) return "$0";
  
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "$0";
  
  const { compact = false, autoCompact = false, currency = "USD", showCents = false, decimals } = options || {};
  
  const useCompact = compact || (autoCompact && Math.abs(numValue) >= 1_000);
  
  if (useCompact) {
    const absValue = Math.abs(numValue);
    const sign = numValue < 0 ? "-" : "";
    
    if (compact) {
      if (absValue >= 1_000_000_000) {
        return `${sign}$${stripTrailingZeros((absValue / 1_000_000_000).toFixed(1))}B`;
      } else if (absValue >= 1_000_000) {
        return `${sign}$${stripTrailingZeros((absValue / 1_000_000).toFixed(1))}M`;
      } else if (absValue >= 1_000) {
        return `${sign}$${(absValue / 1_000).toFixed(0)}K`;
      } else {
        return `${sign}$${absValue.toFixed(0)}`;
      }
    }
    
    if (absValue >= 1_000_000_000_000) {
      return `${sign}$${stripTrailingZeros((absValue / 1_000_000_000_000).toFixed(2))}T`;
    } else if (absValue >= 999_500_000_000) {
      return `${sign}$${stripTrailingZeros((absValue / 1_000_000_000_000).toFixed(2))}T`;
    } else if (absValue >= 1_000_000_000) {
      return `${sign}$${stripTrailingZeros((absValue / 1_000_000_000).toFixed(2))}B`;
    } else if (absValue >= 999_500_000) {
      return `${sign}$${stripTrailingZeros((absValue / 1_000_000_000).toFixed(2))}B`;
    } else if (absValue >= 1_000_000) {
      return `${sign}$${stripTrailingZeros((absValue / 1_000_000).toFixed(1))}M`;
    } else if (absValue >= 999_950) {
      return `${sign}$${stripTrailingZeros((absValue / 1_000_000).toFixed(1))}M`;
    } else if (absValue >= 1_000) {
      return `${sign}$${stripTrailingZeros((absValue / 1_000).toFixed(1))}K`;
    } else {
      return `${sign}$${absValue.toFixed(0)}`;
    }
  }
  
  const fractionDigits = decimals !== undefined ? decimals : (showCents ? 2 : 0);
  
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numValue);
}

export function formatCurrencyFull(value: number | string | null | undefined, options?: {
  currency?: string;
}): string {
  if (value === null || value === undefined) return "$0";
  
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "$0";
  
  const { currency = "USD" } = options || {};
  const hasCents = numValue % 1 !== 0;
  
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
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
