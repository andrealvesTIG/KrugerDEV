import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, GripVertical, RotateCcw, Save } from "lucide-react";
import {
  PROJECT_TAB_DEFINITIONS,
  PROJECT_TAB_IDS,
  DEFAULT_PROJECT_TAB_SETTINGS,
} from "@shared/projectTabs";
import { useFullProjectTabTemplate, useTemplateLayout, useUpdateTemplateLayout } from "@/hooks/use-project-tab-templates";

const LABEL_BY_ID = new Map(PROJECT_TAB_DEFINITIONS.map((t) => [t.id, t.label] as const));
const PLACEMENT_BY_ID = new Map(PROJECT_TAB_DEFINITIONS.map((t) => [t.id, t.placement] as const));

export function TemplateBuilderDialog({ templateId, onClose }: { templateId: number; onClose: () => void }) {
  const { toast } = useToast();
  const { data: full } = useFullProjectTabTemplate(templateId);
  const { data: layout, isLoading } = useTemplateLayout(templateId);
  const updateLayout = useUpdateTemplateLayout();

  const [order, setOrder] = useState<string[]>(DEFAULT_PROJECT_TAB_SETTINGS.order);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (!layout) return;
    const visibleCount = layout.order.length - layout.hidden.length;
    if (visibleCount <= 0) {
      // Brand-new template (or one with no canonical-tab directives yet) —
      // start the editor from the platform default so the user sees a usable
      // baseline instead of an all-hidden list.
      setOrder([...DEFAULT_PROJECT_TAB_SETTINGS.order]);
      setHidden(new Set(DEFAULT_PROJECT_TAB_SETTINGS.hidden));
      return;
    }
    const seen = new Set(layout.order);
    const fullOrder = [...layout.order, ...PROJECT_TAB_IDS.filter((id) => !seen.has(id))];
    setOrder(fullOrder);
    setHidden(new Set(layout.hidden));
  }, [layout]);

  const baselineKey = useMemo(() => layout ? JSON.stringify({
    order: [...layout.order, ...PROJECT_TAB_IDS.filter((id) => !layout.order.includes(id))],
    hidden: [...layout.hidden].sort(),
  }) : '', [layout]);
  const currentKey = useMemo(() => JSON.stringify({ order, hidden: [...hidden].sort() }), [order, hidden]);
  const isDirty = baselineKey !== '' && baselineKey !== currentKey;

  const handleToggle = (id: string, visible: boolean) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(id); else next.add(id);
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
    setOrder([...DEFAULT_PROJECT_TAB_SETTINGS.order]);
    setHidden(new Set(DEFAULT_PROJECT_TAB_SETTINGS.hidden));
  };

  const handleSave = async () => {
    try {
      await updateLayout.mutateAsync({ id: templateId, order, hidden: [...hidden] });
      toast({ title: 'Template saved', description: 'Tabs and order updated. Changes propagate to every organization that has applied this template.' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to save template layout', variant: 'destructive' });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{full?.template?.name ?? 'Template builder'}</DialogTitle>
          <DialogDescription>
            Choose which standard project tabs (Summary, Tasks, Daily Logs, RFIs…) this template enables and the order they appear in. Changes auto-propagate to every organization that has applied this template.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !layout ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleReset} disabled={updateLayout.isPending} data-testid="button-reset-template-layout">
                <RotateCcw className="h-4 w-4 mr-2" /> Reset
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!isDirty || updateLayout.isPending} data-testid="button-save-template-layout">
                {updateLayout.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
            <div className="border rounded-lg divide-y">
              {order.map((id) => {
                const label = LABEL_BY_ID.get(id) ?? id;
                const placement = PLACEMENT_BY_ID.get(id) ?? 'main';
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
                    className={`flex items-center gap-3 p-3 transition-colors ${draggedId === id ? 'opacity-50' : ''} ${dragOverId === id ? 'bg-accent' : ''} ${isHidden ? 'opacity-60' : ''}`}
                    data-testid={`row-template-tab-${id}`}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground">
                        {placement === 'main' ? 'Shown on the main tab strip' : 'Shown in the More menu'}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground hidden sm:inline">{isHidden ? 'Hidden' : 'Visible'}</span>
                    <Switch
                      checked={!isHidden}
                      onCheckedChange={(v) => handleToggle(id, v)}
                      data-testid={`toggle-template-tab-${id}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
