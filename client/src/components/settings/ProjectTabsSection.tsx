import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, GripVertical, LayoutGrid, RotateCcw, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CustomTabsSection } from "./CustomTabsSection";
import { useProjectTabSettings, useUpdateProjectTabSettings } from "@/hooks/use-project-tab-settings";
import {
  DEFAULT_PROJECT_TAB_SETTINGS,
  PROJECT_TAB_DEFINITIONS,
  PROJECT_TAB_IDS,
  PROJECT_TAB_ID_SET,
  resolveProjectTabOrder,
} from "@shared/projectTabs";

const LABEL_BY_ID = new Map(PROJECT_TAB_DEFINITIONS.map((t) => [t.id, t.label] as const));
const PLACEMENT_BY_ID = new Map(PROJECT_TAB_DEFINITIONS.map((t) => [t.id, t.placement] as const));

export function ProjectTabsSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const { data, isLoading } = useProjectTabSettings(organizationId);
  const updateMutation = useUpdateProjectTabSettings();

  const [order, setOrder] = useState<string[]>(DEFAULT_PROJECT_TAB_SETTINGS.order);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setOrder(resolveProjectTabOrder(data));
    setHidden(new Set((data.hidden ?? []).filter((id) => PROJECT_TAB_ID_SET.has(id))));
  }, [data]);

  const baselineKey = useMemo(() => {
    if (!data) return "";
    return JSON.stringify({ order: resolveProjectTabOrder(data), hidden: [...(data.hidden ?? [])].sort() });
  }, [data]);

  const currentKey = useMemo(
    () => JSON.stringify({ order, hidden: [...hidden].sort() }),
    [order, hidden],
  );
  const isDirty = baselineKey !== "" && baselineKey !== currentKey;

  const handleToggle = (id: string, visible: boolean) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id) setDragOverId(id);
  };
  const handleDragLeave = () => setDragOverId(null);
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    setOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(draggedId);
      const toIdx = next.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, draggedId);
      return next;
    });
    setDraggedId(null);
    setDragOverId(null);
  };
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleReset = () => {
    setOrder([...PROJECT_TAB_IDS]);
    setHidden(new Set());
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        organizationId,
        order,
        hidden: [...hidden],
      });
      toast({ title: "Project tabs updated", description: "Default order and visibility saved." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to save project tab settings", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card data-testid="card-project-tabs-builtin">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5" />
              Built-in Project Tabs
            </CardTitle>
            <CardDescription>
              Choose which tabs appear on every project and the order they show up by default. Users can still pin and
              reorder tabs for themselves on top of these defaults.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={updateMutation.isPending}
              data-testid="button-reset-project-tabs"
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || updateMutation.isPending}
              data-testid="button-save-project-tabs"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {order.map((id) => {
                const label = LABEL_BY_ID.get(id) ?? id;
                const placement = PLACEMENT_BY_ID.get(id) ?? "main";
                const isHidden = hidden.has(id);
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, id)}
                    onDragOver={(e) => handleDragOver(e, id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, id)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 p-3 transition-colors ${
                      draggedId === id ? "opacity-50" : ""
                    } ${dragOverId === id ? "bg-accent" : ""} ${isHidden ? "opacity-60" : ""}`}
                    data-testid={`row-project-tab-${id}`}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground">
                        {placement === "main" ? "Shown on the main tab strip" : "Shown in the More menu"}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {isHidden ? "Hidden" : "Visible"}
                    </span>
                    <Switch
                      checked={!isHidden}
                      onCheckedChange={(v) => handleToggle(id, v)}
                      data-testid={`toggle-project-tab-${id}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <CustomTabsSection organizationId={organizationId} />
    </div>
  );
}
