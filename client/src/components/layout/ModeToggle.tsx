import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiMode, setAiMode } from "@/hooks/use-ai-mode";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ModeToggleProps {
  className?: string;
}

export function ModeToggle({ className }: ModeToggleProps) {
  const { aiMode } = useAiMode();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          role="switch"
          onClick={() => setAiMode(!aiMode)}
          aria-checked={aiMode}
          aria-label={aiMode ? "AI Mode is on. Click to turn off." : "AI Mode is off. Click to turn on."}
          data-testid="button-ai-mode-toggle"
          className={cn(
            "group inline-flex items-center gap-2 h-8 px-2 rounded-md hover:bg-accent transition-colors select-none",
            className,
          )}
        >
          <Sparkles
            className={cn(
              "h-3.5 w-3.5 transition-colors",
              aiMode ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
            )}
          />
          <span
            className={cn(
              "text-xs font-semibold tracking-wide transition-colors",
              aiMode ? "text-foreground" : "text-foreground",
            )}
          >
            AI Mode
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border transition-colors",
              aiMode
                ? "bg-primary border-primary shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                : "bg-muted border-border group-hover:border-primary/50",
            )}
          >
            <span
              className={cn(
                "absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-all duration-200 ease-out",
                aiMode ? "left-[18px]" : "left-[2px]",
              )}
            />
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">
          {aiMode
            ? "AI Mode is on — click to exit (Esc)"
            : "Switch to AI Mode — full-page Friday chat"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
