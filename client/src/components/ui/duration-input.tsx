import { Input } from "@/components/ui/input";
import { parseDurationInput, formatDuration } from "@/lib/workingDays";

interface DurationInputProps {
  value: string;
  onChange: (value: string, parsedDays: number | null) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function DurationInput({ value, onChange, onBlur, disabled, className, "data-testid": testId }: DurationInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const parsed = parseDurationInput(raw);
    onChange(raw, parsed);
  };

  const handleBlur = () => {
    const parsed = parseDurationInput(value);
    if (parsed === null || parsed < 0) {
      onChange(formatDuration(1), 1);
    } else if (parsed > 365) {
      onChange(formatDuration(365), 365);
    } else {
      onChange(formatDuration(parsed), parsed);
    }
    onBlur?.();
  };

  return (
    <Input
      type="text"
      placeholder="e.g. 2d, 4h, 1d 4h"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      className={className}
      data-testid={testId}
    />
  );
}
