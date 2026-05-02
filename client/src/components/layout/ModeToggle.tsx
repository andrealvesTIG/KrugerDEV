import { Sparkles, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiMode, setAiMode } from "@/hooks/use-ai-mode";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ModeToggleProps {
  className?: string;
}

export function ModeToggle({ className }: ModeToggleProps) {
  const { aiMode } = useAiMode();

  const baseHalf =
    "inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold tracking-wide transition-all";
  const appHalf = aiMode
    ? "text-muted-foreground hover:text-foreground hover:bg-accent"
    : "bg-background text-foreground shadow-sm";
  const aiHalf = aiMode
    ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(59,130,246,0.35)]"
    : "text-muted-foreground hover:text-foreground hover:bg-accent";

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-muted/40 p-0.5",
        className,
      )}
      role="group"
      aria-label="Switch between App Mode and AI Mode"
      data-testid="mode-toggle"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setAiMode(false)}
            className={cn(baseHalf, "rounded-full", appHalf)}
            aria-pressed={!aiMode}
            aria-label="Switch to App Mode"
            data-testid="button-mode-app"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span>App</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">App Mode — full PPM workspace</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setAiMode(true)}
            className={cn(baseHalf, "rounded-full", aiHalf)}
            aria-pressed={aiMode}
            aria-label="Switch to AI Mode"
            data-testid="button-mode-ai"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">AI Mode — full-page Friday chat (Esc to exit)</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
