import { Sparkles, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiMode, setAiMode } from "@/hooks/use-ai-mode";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ModeToggleProps {
  className?: string;
}

export function ModeToggle({ className }: ModeToggleProps) {
  const { aiMode } = useAiMode();

  if (!aiMode) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setAiMode(true)}
            className={cn(
              "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold tracking-wide",
              "bg-primary text-primary-foreground border border-primary",
              "shadow-[0_0_10px_rgba(59,130,246,0.35)] hover:shadow-[0_0_14px_rgba(59,130,246,0.55)]",
              "hover:brightness-110 transition-all",
              className,
            )}
            aria-pressed={false}
            aria-label="Turn on AI Mode"
            data-testid="button-mode-enter-ai"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Mode</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">Switch to AI Mode — full-page Friday chat</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setAiMode(false)}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold tracking-wide",
            "bg-background text-foreground border border-border",
            "hover:bg-accent hover:border-primary/40 transition-all",
            className,
          )}
          aria-pressed={true}
          aria-label="Exit AI Mode"
          data-testid="button-mode-exit-ai"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Exit AI Mode</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">Exit AI Mode — back to App (Esc)</p>
      </TooltipContent>
    </Tooltip>
  );
}
