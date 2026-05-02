import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useOrganization } from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Bot, ChevronDown, Sparkles, BarChart3, ClipboardList, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AgentRow = {
  id: number;
  name: string;
  type: "chat" | "scheduled";
  icon?: string | null;
  kind?: "builtin" | "custom";
};

interface Props {
  activeAgentId: number | null;
  onSelect: (agentId: number | null) => void;
  variant?: "panel" | "page";
}

export default function AgentPicker({ activeAgentId, onSelect, variant = "panel" }: Props) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const [, setLocation] = useLocation();

  const { data: agents = [] } = useQuery<AgentRow[]>({
    queryKey: ["/api/agents", orgId, "picker"],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await fetch(`/api/agents?organizationId=${orgId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const customOnly = agents.filter(a => a.kind !== "builtin");
  const chatAgents = customOnly.filter(a => a.type === "chat");
  const scheduled = customOnly.filter(a => a.type === "scheduled");

  const selected = chatAgents.find(a => a.id === activeAgentId);
  const label = selected?.name ?? "Friday";

  const triggerCls = variant === "panel"
    ? "h-7 px-2 gap-1 text-xs text-cyan-100 bg-cyan-900/20 hover:bg-cyan-900/40 border border-cyan-800/40"
    : "h-8 px-2 gap-1 text-xs";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn(triggerCls)} data-testid="button-agent-picker">
          <Bot className="h-3.5 w-3.5" />
          <span className="truncate max-w-[10rem]">{label}</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Built-in agents</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onSelect(null)} className="gap-2" data-testid="picker-friday">
          <Sparkles className="h-4 w-4" /> Friday {activeAgentId === null && <span className="ml-auto text-xs opacity-60">active</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLocation("/powerbi-agent")} className="gap-2">
          <BarChart3 className="h-4 w-4" /> Power BI Request
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLocation("/projects")} className="gap-2">
          <ClipboardList className="h-4 w-4" /> Project Agent
        </DropdownMenuItem>
        {chatAgents.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Custom chat agents</DropdownMenuLabel>
            {chatAgents.map(a => (
              <DropdownMenuItem key={a.id} onSelect={() => onSelect(a.id)} className="gap-2" data-testid={`picker-agent-${a.id}`}>
                <Bot className="h-4 w-4" />
                <span className="truncate">{a.name}</span>
                {activeAgentId === a.id && <span className="ml-auto text-xs opacity-60">active</span>}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {scheduled.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Scheduled agents</DropdownMenuLabel>
            {scheduled.map(a => (
              <DropdownMenuItem key={a.id} onSelect={() => setLocation("/agents")} className="gap-2 opacity-80">
                <Bot className="h-4 w-4" /> <span className="truncate">{a.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setLocation("/agents")} className="gap-2">
          <SettingsIcon className="h-4 w-4" /> Manage agents…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
