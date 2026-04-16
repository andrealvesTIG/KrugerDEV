import { formatCurrency, formatCurrencyFull } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CompactCurrencyProps {
  value: number | string | null | undefined;
  className?: string;
}

export function CompactCurrency({ value, className }: CompactCurrencyProps) {
  const numValue = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  const compact = formatCurrency(numValue, { autoCompact: true });
  const full = formatCurrencyFull(numValue);

  if (compact === full) {
    return <span className={className}>{compact}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className} style={{ cursor: "default" }}>{compact}</span>
      </TooltipTrigger>
      <TooltipContent>
        <span>{full}</span>
      </TooltipContent>
    </Tooltip>
  );
}
