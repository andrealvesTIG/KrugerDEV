import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiMode, setAiMode } from "@/hooks/use-ai-mode";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ModeToggleProps {
  className?: string;
}

const TRACK_WIDTH = 116;
const THUMB_SIZE = 24;
const THUMB_INSET = 4;

export function ModeToggle({ className }: ModeToggleProps) {
  const { aiMode } = useAiMode();

  const thumbLeft = aiMode
    ? `${TRACK_WIDTH - THUMB_SIZE - THUMB_INSET}px`
    : `${THUMB_INSET}px`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          role="switch"
          onClick={() => setAiMode(!aiMode)}
          className={cn(
            "group relative inline-flex items-center h-8 rounded-full transition-all overflow-hidden select-none",
            aiMode
              ? "bg-primary text-primary-foreground border border-primary shadow-[0_0_10px_rgba(59,130,246,0.45)] hover:shadow-[0_0_14px_rgba(59,130,246,0.65)]"
              : "bg-primary/95 text-primary-foreground border border-primary/80 shadow-[0_0_10px_rgba(59,130,246,0.35)] hover:bg-primary hover:shadow-[0_0_14px_rgba(59,130,246,0.55)]",
            className,
          )}
          style={{ width: TRACK_WIDTH }}
          aria-checked={aiMode}
          aria-label={aiMode ? "AI Mode is on. Click to exit AI Mode." : "AI Mode is off. Click to switch to AI Mode."}
          data-testid="button-ai-mode-toggle"
        >
          <span
            aria-hidden="true"
            className="absolute top-1 bg-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.25)] transition-all duration-300 ease-out group-hover:scale-105"
            style={{ width: THUMB_SIZE, height: THUMB_SIZE, left: thumbLeft }}
          />
          <span
            className={cn(
              "relative z-10 w-full flex items-center justify-center gap-1 text-xs font-semibold tracking-wide transition-all duration-300",
              aiMode ? "pr-7" : "pl-7",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{aiMode ? "Exit AI" : "AI Mode"}</span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">
          {aiMode
            ? "Click to exit AI Mode (Esc)"
            : "Click to switch to AI Mode — full-page Friday chat"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
