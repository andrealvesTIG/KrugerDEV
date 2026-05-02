import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { History, Plus, MessageSquare } from "lucide-react";
import type { FridayConversationSummary } from "@/hooks/use-jarvis";

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return d.toLocaleDateString();
}

interface RecentChatsMenuProps {
  conversations: FridayConversationSummary[];
  activeConversationId: number | null;
  onSwitch: (id: number) => void;
  onNew: () => void;
  size?: "sm" | "icon";
  align?: "start" | "end";
  /** When set, always render this as the visible trigger label (no responsive hiding). */
  alwaysVisibleLabel?: string;
  /** Optional override for the auto-derived label (active chat title) when size="sm". */
  triggerLabelOverride?: string;
  /** Optional className for the trigger button. */
  triggerClassName?: string;
}

export function RecentChatsMenu({
  conversations,
  activeConversationId,
  onSwitch,
  onNew,
  size = "sm",
  align = "end",
  alwaysVisibleLabel,
  triggerLabelOverride,
  triggerClassName,
}: RecentChatsMenuProps) {
  const recent = useMemo(() => conversations.slice(0, 25), [conversations]);

  const autoLabel = activeConversationId
    ? recent.find((c) => c.id === activeConversationId)?.title || "Chat"
    : "Recent";
  const triggerLabel = triggerLabelOverride ?? autoLabel;
  const count = conversations.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {size === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${triggerClassName ?? ""}`}
            aria-label="Recent chats"
            title="Recent chats"
            data-testid="button-friday-recent-chats"
          >
            <History className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 px-2 gap-1.5 ${triggerClassName ?? ""}`}
            aria-label={count > 0 ? `Recent chats (${count})` : "Recent chats"}
            title="Recent chats"
            data-testid="button-friday-recent-chats"
          >
            <History className="h-3.5 w-3.5" />
            {alwaysVisibleLabel ? (
              <span className="text-xs whitespace-nowrap">
                {alwaysVisibleLabel}
                {count > 0 && (
                  <span className="ml-1 tabular-nums opacity-70">({count > 99 ? "99+" : count})</span>
                )}
              </span>
            ) : (
              <span className="text-xs hidden sm:inline max-w-[140px] truncate">
                {triggerLabel}
                {count > 0 && (
                  <span className="ml-1 tabular-nums opacity-70">({count > 99 ? "99+" : count})</span>
                )}
              </span>
            )}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-72 max-h-[60vh] overflow-y-auto">
        <DropdownMenuItem
          onClick={onNew}
          className="gap-2 cursor-pointer"
          data-testid="menuitem-friday-new-chat"
        >
          <Plus className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">New chat</span>
        </DropdownMenuItem>
        {recent.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Recent
            </DropdownMenuLabel>
            {recent.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onClick={() => onSwitch(c.id)}
                className={`gap-2 cursor-pointer ${activeConversationId === c.id ? "bg-accent" : ""}`}
                data-testid={`menuitem-friday-chat-${c.id}`}
              >
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {c.title || "Untitled chat"}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{c.snippet || "—"}</span>
                    <span className="flex-shrink-0">{formatRelative(c.lastMessageAt)}</span>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
