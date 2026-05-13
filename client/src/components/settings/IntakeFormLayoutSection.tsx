import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { GripVertical, Plus, Trash2, RotateCcw, Save, Loader2, ChevronUp, ChevronDown, Pencil, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { INTAKE_FIELDS, INTAKE_BLOCKS } from "@shared/intakeFormRegistry";
import {
  useIntakeTabLayout,
  useResetIntakeTabLayout,
  useSaveIntakeTabLayout,
  type IntakeTabLayoutTabFull,
} from "@/hooks/use-intake-tab-layout";
import { useCustomFieldDefinitions } from "@/hooks/use-custom-fields";
import type { CustomFieldDefinition } from "@shared/schema";
import { cn } from "@/lib/utils";

interface DraftItem { uid: string; itemType: "field" | "custom_field" | "block"; itemKey: string; width: "full" | "half" | "third"; displayName: string | null; isRequired: boolean; }
interface DraftSection { uid: string; title: string | null; description: string | null; items: DraftItem[]; }
interface DraftTab { uid: string; key: string; label: string; icon: string | null; isActive: boolean; sections: DraftSection[]; }

const ICON_OPTIONS = ["Lightbulb", "FileText", "Calculator", "Shield", "MessageSquare", "ListChecks", "ClipboardList", "DollarSign", "Settings", "Gavel"];

function uid(prefix: string) { return `${prefix}-${Math.random().toString(36).slice(2, 10)}`; }

function toDraft(layout: IntakeTabLayoutTabFull[]): DraftTab[] {
  return layout.map(t => ({
    uid: uid("tab"), key: t.key, label: t.label, icon: t.icon, isActive: t.isActive,
    sections: t.sections.map(s => ({
      uid: uid("sec"), title: s.title, description: s.description,
      items: s.items.map(i => ({ uid: uid("itm"), itemType: i.itemType as any, itemKey: i.itemKey, width: i.width as any, displayName: i.displayName ?? null, isRequired: !!i.isRequired })),
    })),
  }));
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `tab-${Math.random().toString(36).slice(2, 6)}`;
}

export function IntakeFormLayoutSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const { data: layout, isLoading } = useIntakeTabLayout(organizationId);
  const saveMut = useSaveIntakeTabLayout(organizationId);
  const resetMut = useResetIntakeTabLayout(organizationId);

  const [draft, setDraft] = useState<DraftTab[]>([]);
  const [activeTabUid, setActiveTabUid] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const { data: allCustomFieldDefs = [] } = useCustomFieldDefinitions(organizationId);
  const intakeCustomFieldDefs = useMemo(
    () => allCustomFieldDefs.filter(d => (d.entityType || 'project') === 'intake'),
    [allCustomFieldDefs],
  );

  useEffect(() => {
    if (layout) {
      const d = toDraft(layout);
      setDraft(d);
      setActiveTabUid(prev => (prev && d.find(t => t.uid === prev) ? prev : d[0]?.uid ?? null));
      setDirty(false);
    }
  }, [layout]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeTab = draft.find(t => t.uid === activeTabUid) ?? null;

  const update = (next: DraftTab[]) => { setDraft(next); setDirty(true); };

  // ---------- Tab ops ----------
  const handleTabDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = draft.findIndex(t => t.uid === active.id);
    const newIdx = draft.findIndex(t => t.uid === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    update(arrayMove(draft, oldIdx, newIdx));
  };
  const addTab = () => {
    const labels = draft.map(t => t.label);
    let label = "New Tab", n = 1;
    while (labels.includes(label)) { n++; label = `New Tab ${n}`; }
    const t: DraftTab = { uid: uid("tab"), key: slugify(label), label, icon: "Lightbulb", isActive: true, sections: [] };
    update([...draft, t]);
    setActiveTabUid(t.uid);
  };
  const updateTab = (tabUid: string, patch: Partial<DraftTab>) => {
    update(draft.map(t => t.uid === tabUid ? { ...t, ...patch } : t));
  };
  const deleteTab = (tabUid: string) => {
    if (draft.length <= 1) {
      toast({ title: "Cannot delete", description: "At least one tab is required.", variant: "destructive" });
      return;
    }
    const idx = draft.findIndex(t => t.uid === tabUid);
    const next = draft.filter(t => t.uid !== tabUid);
    update(next);
    if (activeTabUid === tabUid) setActiveTabUid(next[Math.min(idx, next.length - 1)].uid);
  };

  // ---------- Section ops ----------
  const handleSectionDragEnd = (tabUid: string, e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const tab = draft.find(t => t.uid === tabUid); if (!tab) return;
    const oldIdx = tab.sections.findIndex(s => s.uid === active.id);
    const newIdx = tab.sections.findIndex(s => s.uid === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    updateTab(tabUid, { sections: arrayMove(tab.sections, oldIdx, newIdx) });
  };
  const addSection = (tabUid: string) => {
    const tab = draft.find(t => t.uid === tabUid); if (!tab) return;
    const s: DraftSection = { uid: uid("sec"), title: null, description: null, items: [] };
    updateTab(tabUid, { sections: [...tab.sections, s] });
  };
  const updateSection = (tabUid: string, secUid: string, patch: Partial<DraftSection>) => {
    const tab = draft.find(t => t.uid === tabUid); if (!tab) return;
    updateTab(tabUid, { sections: tab.sections.map(s => s.uid === secUid ? { ...s, ...patch } : s) });
  };
  const deleteSection = (tabUid: string, secUid: string) => {
    const tab = draft.find(t => t.uid === tabUid); if (!tab) return;
    updateTab(tabUid, { sections: tab.sections.filter(s => s.uid !== secUid) });
  };

  // ---------- Item ops (multi-container DnD) ----------
  const findItemLocation = (uidStr: string): { tabIdx: number; secIdx: number; itemIdx: number } | null => {
    for (let ti = 0; ti < draft.length; ti++) {
      for (let si = 0; si < draft[ti].sections.length; si++) {
        const ii = draft[ti].sections[si].items.findIndex(i => i.uid === uidStr);
        if (ii !== -1) return { tabIdx: ti, secIdx: si, itemIdx: ii };
      }
    }
    return null;
  };
  const findSectionLocation = (uidStr: string): { tabIdx: number; secIdx: number } | null => {
    for (let ti = 0; ti < draft.length; ti++) {
      const si = draft[ti].sections.findIndex(s => s.uid === uidStr);
      if (si !== -1) return { tabIdx: ti, secIdx: si };
    }
    return null;
  };

  const handleItemDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const fromLoc = findItemLocation(activeId);
    if (!fromLoc) return;

    let toTabIdx = -1, toSecIdx = -1, toItemIdx = -1;
    if (overId.startsWith("dropzone:")) {
      const [, secUid] = overId.split(":");
      const sec = findSectionLocation(secUid); if (!sec) return;
      toTabIdx = sec.tabIdx; toSecIdx = sec.secIdx;
      toItemIdx = draft[toTabIdx].sections[toSecIdx].items.length;
    } else {
      const overLoc = findItemLocation(overId);
      if (!overLoc) return;
      toTabIdx = overLoc.tabIdx; toSecIdx = overLoc.secIdx; toItemIdx = overLoc.itemIdx;
    }
    if (fromLoc.tabIdx === toTabIdx && fromLoc.secIdx === toSecIdx) return;

    const next = draft.map(t => ({ ...t, sections: t.sections.map(s => ({ ...s, items: [...s.items] })) }));
    const [moved] = next[fromLoc.tabIdx].sections[fromLoc.secIdx].items.splice(fromLoc.itemIdx, 1);
    next[toTabIdx].sections[toSecIdx].items.splice(toItemIdx, 0, moved);
    update(next);
  };

  const handleItemDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const fromLoc = findItemLocation(String(active.id));
    const overId = String(over.id);
    if (overId.startsWith("dropzone:")) return; // handled in dragOver
    const toLoc = findItemLocation(overId);
    if (!fromLoc || !toLoc) return;
    if (fromLoc.tabIdx !== toLoc.tabIdx || fromLoc.secIdx !== toLoc.secIdx) return;
    const next = draft.map(t => ({ ...t, sections: t.sections.map(s => ({ ...s, items: [...s.items] })) }));
    const items = next[fromLoc.tabIdx].sections[fromLoc.secIdx].items;
    next[fromLoc.tabIdx].sections[fromLoc.secIdx].items = arrayMove(items, fromLoc.itemIdx, toLoc.itemIdx);
    update(next);
  };

  const addItem = (tabUid: string, secUid: string, itemType: DraftItem["itemType"], itemKey: string) => {
    const tab = draft.find(t => t.uid === tabUid); if (!tab) return;
    // Each built-in field, custom field, or block may only appear once across the form.
    const usedKeys = new Set<string>();
    draft.forEach(t => t.sections.forEach(s => s.items.forEach(i => { usedKeys.add(`${i.itemType}:${i.itemKey}`); })));
    if (usedKeys.has(`${itemType}:${itemKey}`)) {
      toast({ title: "Already placed", description: "This item is already on the form. Each item can only appear once.", variant: "destructive" });
      return;
    }
    updateSection(tabUid, secUid, {
      items: [...(tab.sections.find(s => s.uid === secUid)?.items ?? []), { uid: uid("itm"), itemType, itemKey, width: "full", displayName: null, isRequired: false }],
    });
  };
  const updateItem = (tabUid: string, secUid: string, itemUid: string, patch: Partial<DraftItem>) => {
    const tab = draft.find(t => t.uid === tabUid); if (!tab) return;
    const sec = tab.sections.find(s => s.uid === secUid); if (!sec) return;
    updateSection(tabUid, secUid, { items: sec.items.map(i => i.uid === itemUid ? { ...i, ...patch } : i) });
  };
  const deleteItem = (tabUid: string, secUid: string, itemUid: string) => {
    const tab = draft.find(t => t.uid === tabUid); if (!tab) return;
    const sec = tab.sections.find(s => s.uid === secUid); if (!sec) return;
    updateSection(tabUid, secUid, { items: sec.items.filter(i => i.uid !== itemUid) });
  };

  const handleSave = async () => {
    // Validate: no empty sections (a section must have at least one item)
    for (const t of draft) {
      for (const s of t.sections) {
        if (s.items.length === 0) {
          const tabName = t.label.trim() || "Untitled";
          const sectionName = s.title?.trim() ? `"${s.title.trim()}"` : "an unnamed section";
          toast({
            title: "Empty section",
            description: `Tab "${tabName}" has ${sectionName} with no items. Add at least one item or delete the section before saving.`,
            variant: "destructive",
          });
          return;
        }
      }
    }
    // Validate: each tab gets a unique key
    const seenKeys = new Set<string>();
    const tabsPayload = draft.map(t => {
      let key = slugify(t.key || t.label);
      let original = key, n = 2;
      while (seenKeys.has(key)) { key = `${original}-${n++}`; }
      seenKeys.add(key);
      return {
        key,
        label: t.label.trim() || "Untitled",
        icon: t.icon,
        isActive: t.isActive,
        sections: t.sections.map(s => ({
          title: s.title?.trim() ? s.title.trim() : null,
          description: s.description,
          items: s.items.map(i => ({ itemType: i.itemType, itemKey: i.itemKey, width: i.width, displayName: i.displayName?.trim() ? i.displayName.trim() : null, isRequired: !!i.isRequired })),
        })),
      };
    });
    try {
      await saveMut.mutateAsync(tabsPayload);
      setDirty(false);
      toast({ title: "Saved", description: "Intake form layout updated." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to save layout", variant: "destructive" });
    }
  };

  const handleReset = async () => {
    try {
      await resetMut.mutateAsync();
      toast({ title: "Reset", description: "Restored default intake form layout." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to reset", variant: "destructive" });
    }
  };

  if (isLoading || !layout) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="section-intake-form-layout">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Intake Form Layout</CardTitle>
            <CardDescription>
              Configure the tabs, sections, and fields shown on the intake form. The same layout is used at every gate.
              Drag to reorder; drag fields between sections (or use the menu to move across tabs).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={resetMut.isPending} data-testid="button-reset-intake-layout">
              <RotateCcw className="h-4 w-4 mr-1" /> Reset to defaults
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saveMut.isPending} data-testid="button-save-intake-layout">
              {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
          <SortableContext items={draft.map(t => t.uid)} strategy={horizontalListSortingStrategy}>
            <div className="flex flex-wrap gap-2 border-b pb-2">
              {draft.map(t => (
                <TabChip
                  key={t.uid}
                  tab={t}
                  isActive={t.uid === activeTabUid}
                  onSelect={() => setActiveTabUid(t.uid)}
                />
              ))}
              <Button variant="outline" size="sm" onClick={addTab} data-testid="button-add-intake-tab">
                <Plus className="h-4 w-4 mr-1" /> Add Tab
              </Button>
            </div>
          </SortableContext>
        </DndContext>

        {activeTab && (
          <TabEditor
            key={activeTab.uid}
            tab={activeTab}
            allTabs={draft}
            sensors={sensors}
            onUpdateTab={(patch) => updateTab(activeTab.uid, patch)}
            onDeleteTab={() => deleteTab(activeTab.uid)}
            onSectionDragEnd={(e) => handleSectionDragEnd(activeTab.uid, e)}
            onAddSection={() => addSection(activeTab.uid)}
            onUpdateSection={(su, p) => updateSection(activeTab.uid, su, p)}
            onDeleteSection={(su) => deleteSection(activeTab.uid, su)}
            onAddItem={(su, t, k) => addItem(activeTab.uid, su, t, k)}
            onUpdateItem={(su, iu, p) => updateItem(activeTab.uid, su, iu, p)}
            onDeleteItem={(su, iu) => deleteItem(activeTab.uid, su, iu)}
            customFieldDefs={intakeCustomFieldDefs}
            onMoveItemTo={(itemUid, toTabUid, toSecUid) => {
              const fromLoc = findItemLocation(itemUid); if (!fromLoc) return;
              const toTabIdx = draft.findIndex(t => t.uid === toTabUid); if (toTabIdx < 0) return;
              const toSecIdx = draft[toTabIdx].sections.findIndex(s => s.uid === toSecUid); if (toSecIdx < 0) return;
              const next = draft.map(t => ({ ...t, sections: t.sections.map(s => ({ ...s, items: [...s.items] })) }));
              const [moved] = next[fromLoc.tabIdx].sections[fromLoc.secIdx].items.splice(fromLoc.itemIdx, 1);
              next[toTabIdx].sections[toSecIdx].items.push(moved);
              update(next);
            }}
            onItemDragOver={handleItemDragOver}
            onItemDragEnd={handleItemDragEnd}
          />
        )}
      </CardContent>
    </Card>
  );
}

function TabChip({ tab, isActive, onSelect }: { tab: DraftTab; isActive: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.uid });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-sm bg-background", isActive && "border-primary bg-primary/5")}>
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground touch-none" aria-label="Drag tab" data-testid={`drag-tab-${tab.uid}`}>
        <GripVertical className="h-4 w-4" />
      </button>
      <button onClick={onSelect} className="font-medium" data-testid={`select-tab-${tab.uid}`}>{tab.label}</button>
      {!tab.isActive && <Badge variant="secondary" className="text-[10px]">Hidden</Badge>}
    </div>
  );
}

function TabEditor(props: {
  tab: DraftTab;
  allTabs: DraftTab[];
  sensors: ReturnType<typeof useSensors>;
  onUpdateTab: (p: Partial<DraftTab>) => void;
  onDeleteTab: () => void;
  onSectionDragEnd: (e: DragEndEvent) => void;
  onAddSection: () => void;
  onUpdateSection: (su: string, p: Partial<DraftSection>) => void;
  onDeleteSection: (su: string) => void;
  onAddItem: (su: string, t: DraftItem["itemType"], k: string) => void;
  onUpdateItem: (su: string, iu: string, p: Partial<DraftItem>) => void;
  onDeleteItem: (su: string, iu: string) => void;
  onMoveItemTo: (itemUid: string, toTabUid: string, toSecUid: string) => void;
  customFieldDefs: CustomFieldDefinition[];
  onItemDragOver: (e: DragOverEvent) => void;
  onItemDragEnd: (e: DragEndEvent) => void;
}) {
  const { tab, allTabs, customFieldDefs } = props;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 border rounded-md bg-muted/30">
        <div className="space-y-1">
          <Label className="text-xs">Tab Label</Label>
          <Input value={tab.label} onChange={(e) => props.onUpdateTab({ label: e.target.value })} data-testid="input-tab-label" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Icon</Label>
          <Select value={tab.icon ?? ""} onValueChange={(v) => props.onUpdateTab({ icon: v })}>
            <SelectTrigger data-testid="select-tab-icon"><SelectValue placeholder="Icon" /></SelectTrigger>
            <SelectContent>
              {ICON_OPTIONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex flex-col">
          <Label className="text-xs">Visibility</Label>
          <div className="flex gap-2">
            <Button size="sm" variant={tab.isActive ? "default" : "outline"} onClick={() => props.onUpdateTab({ isActive: !tab.isActive })}>
              {tab.isActive ? "Visible" : "Hidden"}
            </Button>
            <Button size="sm" variant="outline" onClick={props.onDeleteTab} className="text-destructive" data-testid="button-delete-tab">
              <Trash2 className="h-4 w-4 mr-1" /> Delete Tab
            </Button>
          </div>
        </div>
      </div>

      <DndContext sensors={props.sensors} collisionDetection={closestCenter} onDragOver={props.onItemDragOver} onDragEnd={(e) => {
        const overId = String(e.over?.id ?? "");
        // If the active id matches a section uid, defer to section drag end
        const isSectionDrag = tab.sections.some(s => s.uid === e.active.id);
        if (isSectionDrag) { props.onSectionDragEnd(e); return; }
        props.onItemDragEnd(e);
      }}>
        <SortableContext items={tab.sections.map(s => s.uid)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {tab.sections.map(section => (
              <SectionEditor
                key={section.uid}
                section={section}
                tab={tab}
                allTabs={allTabs}
                customFieldDefs={customFieldDefs}
                placedItemKeys={collectPlacedKeys(allTabs)}
                onUpdateSection={(p) => props.onUpdateSection(section.uid, p)}
                onDeleteSection={() => props.onDeleteSection(section.uid)}
                onAddItem={(t, k) => props.onAddItem(section.uid, t, k)}
                onUpdateItem={(iu, p) => props.onUpdateItem(section.uid, iu, p)}
                onDeleteItem={(iu) => props.onDeleteItem(section.uid, iu)}
                onMoveItemTo={(itemUid, toTabUid, toSecUid) => props.onMoveItemTo(itemUid, toTabUid, toSecUid)}
              />
            ))}
            <Button variant="outline" size="sm" onClick={props.onAddSection} data-testid="button-add-section">
              <Plus className="h-4 w-4 mr-1" /> Add Section
            </Button>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function collectPlacedKeys(allTabs: DraftTab[]): Set<string> {
  const s = new Set<string>();
  allTabs.forEach(t => t.sections.forEach(sec => sec.items.forEach(i => s.add(`${i.itemType}:${i.itemKey}`))));
  return s;
}

function SectionEditor(props: {
  section: DraftSection;
  tab: DraftTab;
  allTabs: DraftTab[];
  customFieldDefs: CustomFieldDefinition[];
  placedItemKeys: Set<string>;
  onUpdateSection: (p: Partial<DraftSection>) => void;
  onDeleteSection: () => void;
  onAddItem: (t: DraftItem["itemType"], k: string) => void;
  onUpdateItem: (iu: string, p: Partial<DraftItem>) => void;
  onDeleteItem: (iu: string) => void;
  onMoveItemTo: (itemUid: string, toTabUid: string, toSecUid: string) => void;
}) {
  const { section, tab, allTabs, customFieldDefs, placedItemKeys } = props;
  const { attributes, listeners, setNodeRef: setSectionNodeRef, transform, transition, isDragging } = useSortable({ id: section.uid });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setSectionNodeRef} style={style} className="border rounded-md p-3 bg-card" data-testid={`section-editor-${section.uid}`}>
      <div className="flex items-center gap-2 mb-3">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground touch-none" aria-label="Drag section">
          <GripVertical className="h-4 w-4" />
        </button>
        <Input
          value={section.title ?? ""}
          onChange={(e) => props.onUpdateSection({ title: e.target.value || null })}
          placeholder="Section title (optional)"
          className="font-medium flex-1"
          data-testid={`input-section-title-${section.uid}`}
        />
        <Input
          value={section.description ?? ""}
          onChange={(e) => props.onUpdateSection({ description: e.target.value || null })}
          placeholder="Description (optional)"
          className="flex-1 text-sm"
        />
        <Button size="icon" variant="ghost" onClick={props.onDeleteSection} className="text-destructive" data-testid={`button-delete-section-${section.uid}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <SortableContext items={section.items.map(i => i.uid)} strategy={verticalListSortingStrategy}>
        <SectionDropZone sectionUid={section.uid} isEmpty={section.items.length === 0}>
          {section.items.map(item => (
            <ItemEditor
              key={item.uid}
              item={item}
              currentSectionUid={section.uid}
              currentTabUid={tab.uid}
              allTabs={allTabs}
              customFieldDefs={customFieldDefs}
              onUpdate={(p) => props.onUpdateItem(item.uid, p)}
              onDelete={() => props.onDeleteItem(item.uid)}
              onMoveTo={(toTabUid, toSecUid) => props.onMoveItemTo(item.uid, toTabUid, toSecUid)}
            />
          ))}
        </SectionDropZone>
      </SortableContext>

      <AddItemPicker onAdd={props.onAddItem} customFieldDefs={customFieldDefs} placedItemKeys={placedItemKeys} />
    </div>
  );
}

function SectionDropZone({ sectionUid, isEmpty, children }: { sectionUid: string; isEmpty: boolean; children: React.ReactNode }) {
  // A droppable target with id `dropzone:<sectionUid>` so users can drag into empty/end of section.
  const { setNodeRef, isOver } = useSortable({ id: `dropzone:${sectionUid}` });
  return (
    <div ref={setNodeRef} className={cn("space-y-2 min-h-[40px] rounded border border-dashed border-transparent p-1", isOver && "border-primary bg-primary/5", isEmpty && "border-border")}>
      {isEmpty ? <div className="text-xs text-muted-foreground italic px-2 py-2">Drag items here, or use the picker below.</div> : children}
    </div>
  );
}

function ItemEditor({ item, currentSectionUid, currentTabUid, allTabs, customFieldDefs, onUpdate, onDelete, onMoveTo }: {
  item: DraftItem;
  currentSectionUid: string;
  currentTabUid: string;
  allTabs: DraftTab[];
  customFieldDefs: CustomFieldDefinition[];
  onUpdate: (p: Partial<DraftItem>) => void;
  onDelete: () => void;
  onMoveTo: (toTabUid: string, toSecUid: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.uid });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const fieldDef = item.itemType === "field" ? INTAKE_FIELDS.find(f => f.key === item.itemKey) : undefined;
  const blockDef = item.itemType === "block" ? INTAKE_BLOCKS.find(b => b.key === item.itemKey) : undefined;
  const cfDef = item.itemType === "custom_field" ? customFieldDefs.find(d => String(d.id) === item.itemKey) : undefined;
  const label = fieldDef?.label ?? blockDef?.label ?? cfDef?.name ?? (item.itemType === "custom_field" ? `Custom field #${item.itemKey} (missing)` : item.itemKey);
  const badgeText = item.itemType === "block" ? "block" : item.itemType === "custom_field" ? "custom" : "field";
  const supportsDisplayName = item.itemType !== "block";
  const supportsRequired = item.itemType !== "block";
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 p-2 border rounded bg-background" data-testid={`item-editor-${item.uid}`}>
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground touch-none" aria-label="Drag item">
        <GripVertical className="h-4 w-4" />
      </button>
      <Badge variant="outline" className="text-[10px] uppercase">{badgeText}</Badge>
      <span className="text-sm w-40 truncate shrink-0" title={label}>{label}</span>
      {supportsDisplayName && (
        <Input
          value={item.displayName ?? ""}
          onChange={(e) => onUpdate({ displayName: e.target.value })}
          placeholder={`Display: ${label}`}
          className="h-7 text-xs flex-1 min-w-[120px]"
          data-testid={`input-item-display-name-${item.uid}`}
        />
      )}
      {!supportsDisplayName && <div className="flex-1" />}
      {supportsRequired && (
        <Button
          size="sm"
          variant={item.isRequired ? "default" : "outline"}
          className="h-7 px-2 text-xs"
          onClick={() => onUpdate({ isRequired: !item.isRequired })}
          title={item.isRequired ? "Required — click to make optional" : "Optional — click to require"}
          data-testid={`button-toggle-required-${item.uid}`}
        >
          {item.isRequired ? "Required" : "Optional"}
        </Button>
      )}
      <Select value={item.width} onValueChange={(v) => onUpdate({ width: v as DraftItem["width"] })}>
        <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="full">Full width</SelectItem>
          <SelectItem value="half">Half</SelectItem>
          <SelectItem value="third">Third</SelectItem>
        </SelectContent>
      </Select>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-move-item-${item.uid}`}>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Move to…</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {allTabs.flatMap(t =>
            t.sections.map(s => (
              <DropdownMenuItem
                key={`${t.uid}:${s.uid}`}
                disabled={t.uid === currentTabUid && s.uid === currentSectionUid}
                onSelect={() => onMoveTo(t.uid, s.uid)}
              >
                <span className="truncate">{t.label} → {s.title}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete} data-testid={`button-delete-item-${item.uid}`}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function AddItemPicker({ onAdd, customFieldDefs, placedItemKeys }: {
  onAdd: (type: DraftItem["itemType"], key: string) => void;
  customFieldDefs: CustomFieldDefinition[];
  placedItemKeys: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"field" | "custom_field" | "block">("field");
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const matches = (...parts: Array<string | null | undefined>) =>
    !q || parts.some(p => (p ?? "").toLowerCase().includes(q));
  const filteredFields = INTAKE_FIELDS.filter(f => matches(f.label, f.key, f.group, f.inputType));
  const filteredCustomFields = customFieldDefs.filter(d => matches(d.name, d.fieldType));
  const filteredBlocks = INTAKE_BLOCKS.filter(b => matches(b.label, b.key, b.description));
  useEffect(() => { if (!open) setSearch(""); }, [open]);
  return (
    <div className="mt-2 flex justify-end">
      <Dialog open={open} onOpenChange={setOpen}>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="button-add-item">
          <Plus className="h-4 w-4 mr-1" /> Add Item
        </Button>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Item</DialogTitle>
            <DialogDescription>Pick a built-in field, an individual custom field, or a composite block to add to this section.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 border-b">
            <Button size="sm" variant={tab === "field" ? "default" : "ghost"} onClick={() => setTab("field")}>
              Fields {q && <span className="ml-1 text-xs text-muted-foreground">({filteredFields.length})</span>}
            </Button>
            <Button size="sm" variant={tab === "custom_field" ? "default" : "ghost"} onClick={() => setTab("custom_field")} data-testid="picker-tab-custom-fields">
              Custom Fields {q && <span className="ml-1 text-xs text-muted-foreground">({filteredCustomFields.length})</span>}
            </Button>
            <Button size="sm" variant={tab === "block" ? "default" : "ghost"} onClick={() => setTab("block")}>
              Blocks {q && <span className="ml-1 text-xs text-muted-foreground">({filteredBlocks.length})</span>}
            </Button>
          </div>
          <div className="relative pt-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 mt-1 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items by name…"
              className="pl-8 h-9"
              data-testid="input-add-item-search"
            />
          </div>
          <div className="max-h-[400px] overflow-y-auto space-y-1 pt-2">
            {tab === "field" && (filteredFields.length === 0 ? (
              <div className="text-sm text-muted-foreground italic p-4 text-center">No fields match "{search}".</div>
            ) : filteredFields.map(f => {
              const placed = placedItemKeys.has(`field:${f.key}`);
              return (
                <button key={f.key} disabled={placed} className={cn("w-full text-left p-2 rounded flex items-center gap-2", placed ? "opacity-50 cursor-not-allowed" : "hover-elevate")} onClick={() => { onAdd("field", f.key); setOpen(false); }} data-testid={`picker-field-${f.key}`}>
                  <Badge variant="secondary" className="text-[10px]">{f.group}</Badge>
                  <span className="text-sm font-medium">{f.label}</span>
                  <span className="text-xs text-muted-foreground">({f.inputType})</span>
                  {placed && <Badge variant="outline" className="ml-auto text-[10px]">Placed</Badge>}
                </button>
              );
            }))}
            {tab === "custom_field" && (
              customFieldDefs.length === 0 ? (
                <div className="text-sm text-muted-foreground italic p-4 text-center">
                  No intake custom fields defined yet. Create some in <strong>Settings → Custom Fields</strong> (entity type "Intake").
                </div>
              ) : filteredCustomFields.length === 0 ? (
                <div className="text-sm text-muted-foreground italic p-4 text-center">No custom fields match "{search}".</div>
              ) : (
                filteredCustomFields.map(d => {
                  const placed = placedItemKeys.has(`custom_field:${d.id}`);
                  return (
                    <button key={d.id} disabled={placed} className={cn("w-full text-left p-2 rounded flex items-center gap-2", placed ? "opacity-50 cursor-not-allowed" : "hover-elevate")} onClick={() => { onAdd("custom_field", String(d.id)); setOpen(false); }} data-testid={`picker-custom-field-${d.id}`}>
                      <Badge variant="secondary" className="text-[10px]">Custom</Badge>
                      <span className="text-sm font-medium">{d.name}</span>
                      <span className="text-xs text-muted-foreground">({d.fieldType})</span>
                      {d.isRequired && <span className="text-xs text-destructive">required</span>}
                      {placed && <Badge variant="outline" className="ml-auto text-[10px]">Placed</Badge>}
                    </button>
                  );
                })
              )
            )}
            {tab === "block" && (filteredBlocks.length === 0 ? (
              <div className="text-sm text-muted-foreground italic p-4 text-center">No blocks match "{search}".</div>
            ) : filteredBlocks.map(b => {
              const placed = placedItemKeys.has(`block:${b.key}`);
              return (
                <button key={b.key} disabled={placed} className={cn("w-full text-left p-2 rounded", placed ? "opacity-50 cursor-not-allowed" : "hover-elevate")} onClick={() => { onAdd("block", b.key); setOpen(false); }} data-testid={`picker-block-${b.key}`}>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {b.label}
                    {placed && <Badge variant="outline" className="text-[10px]">Placed</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{b.description}</div>
                </button>
              );
            }))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
