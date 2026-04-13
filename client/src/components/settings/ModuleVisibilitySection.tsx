import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Folder, LayoutDashboard, Briefcase, FolderKanban, FileInput, CircleDot, Calendar, CheckSquare, Eye, EyeOff, GripVertical, Pencil, X, Plus, ChevronUp, ChevronDown, Trash2, ExternalLink, Link as LinkIcon, BookOpen, Home, Radar, Clock, Lightbulb, Receipt, PlayCircle, Users, GraduationCap, LayoutTemplate, ClipboardList, MessageSquare, FileCheck, PenSquare, ClipboardCheck } from "lucide-react";
import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, UniqueIdentifier } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Organization, SidebarStructure, SidebarGroup, SidebarItem } from "@shared/schema";

export const availableModules = [
  { key: "home", name: "Home", icon: Home, description: "My Work overview" },
  { key: "dashboard", name: "Dashboard", icon: LayoutDashboard, description: "Overview and analytics" },
  { key: "portfolios", name: "Portfolios", icon: Briefcase, description: "Group and manage portfolios" },
  { key: "projects", name: "Projects", icon: FolderKanban, description: "Project management" },
  { key: "intakes", name: "Intakes", icon: FileInput, description: "Project intake requests" },
  { key: "tasks", name: "Tasks", icon: CheckSquare, description: "Task tracking" },
  { key: "issues", name: "Issues", icon: CircleDot, description: "Issue tracking" },
  { key: "simulation", name: "Simulation", icon: PlayCircle, description: "What-if scenario forecasting" },
  { key: "pmo-radar", name: "PMO Radar", icon: Radar, description: "Risk and issue radar visualization" },
  { key: "invoices", name: "Invoices", icon: Receipt, description: "Invoice management and tracking" },
  { key: "timesheets", name: "Timesheets", icon: Clock, description: "Time tracking" },
  { key: "lessons-learned", name: "Lessons Learned", icon: Lightbulb, description: "Document lessons from projects" },
  { key: "resources", name: "Resources", icon: Users, description: "Resource management" },
  { key: "calendar", name: "Calendar", icon: Calendar, description: "Calendar view" },
  { key: "user-guide", name: "User Guide", icon: BookOpen, description: "Help documentation" },
  { key: "training", name: "Training", icon: GraduationCap, description: "Training & certification courses" },
  { key: "templates", name: "Templates", icon: LayoutTemplate, description: "Reusable project templates" },
  { key: "daily-logs", name: "Daily Logs", icon: ClipboardList, description: "Daily site activity logs" },
  { key: "rfis", name: "RFIs", icon: MessageSquare, description: "Requests for Information tracking" },
  { key: "submittals", name: "Submittals", icon: FileCheck, description: "Submittal management and review" },
  { key: "drawings", name: "Drawings", icon: PenSquare, description: "Drawing management and markup" },
  { key: "punch-list", name: "Punch List", icon: ClipboardCheck, description: "Punch list items for project close-out" },
];

export const moduleIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  dashboard: LayoutDashboard,
  portfolios: Briefcase,
  projects: FolderKanban,
  intakes: FileInput,
  tasks: CheckSquare,
  issues: CircleDot,
  simulation: PlayCircle,
  "pmo-radar": Radar,
  invoices: Receipt,
  timesheets: Clock,
  "lessons-learned": Lightbulb,
  resources: Users,
  calendar: Calendar,
  "user-guide": BookOpen,
  training: GraduationCap,
  templates: LayoutTemplate,
  "daily-logs": ClipboardList,
  rfis: MessageSquare,
  submittals: FileCheck,
  drawings: PenSquare,
  "punch-list": ClipboardCheck,
};

function getDefaultSidebarStructure(hiddenModules?: string[] | null, moduleOrder?: string[] | null, hiddenGroups?: string[] | null): SidebarStructure {
  return [
    { id: "home", name: "Home", isDefault: true, hidden: false, items: [
      { type: "module" as const, key: "home", hidden: false },
      { type: "module" as const, key: "dashboard", hidden: false },
      { type: "module" as const, key: "templates", hidden: false },
    ]},
    { id: "portfolio", name: "Portfolio", hidden: false, collapsedByDefault: false, items: [
      { type: "module" as const, key: "portfolios", hidden: false },
      { type: "module" as const, key: "projects", hidden: false },
      { type: "module" as const, key: "intakes", hidden: false },
      { type: "module" as const, key: "issues", hidden: false },
      { type: "module" as const, key: "tasks", hidden: false },
      { type: "module" as const, key: "timesheets", hidden: false },
    ]},
    { id: "resource-management", name: "Resource Management", hidden: false, collapsedByDefault: true, items: [
      { type: "module" as const, key: "resources", hidden: false },
    ]},
    { id: "finance", name: "Finance", hidden: false, collapsedByDefault: true, items: [
      { type: "module" as const, key: "simulation", hidden: false },
      { type: "module" as const, key: "pmo-radar", hidden: false },
      { type: "module" as const, key: "invoices", hidden: false },
    ]},
    { id: "help", name: "Help", isDefault: true, hidden: false, collapsedByDefault: true, items: [
      { type: "module" as const, key: "calendar", hidden: false },
      { type: "module" as const, key: "lessons-learned", hidden: false },
      { type: "module" as const, key: "user-guide", hidden: false },
      { type: "module" as const, key: "training", hidden: false },
    ]},
  ];
}

function migrateOldFlatStructure(structure: SidebarStructure): SidebarStructure {
  const menuGroup = structure.find(g => g.id === "menu");
  if (!menuGroup) return structure;
  
  const getItemHidden = (key: string): boolean => {
    const item = menuGroup.items.find(i => i.type === "module" && i.key === key);
    return item ? !!item.hidden : false;
  };

  const customLinks = menuGroup.items.filter(i => i.type === "customLink");
  const helpGroup = structure.find(g => g.id === "help");
  const otherGroups = structure.filter(g => g.id !== "menu" && g.id !== "help");

  return [
    { id: "home", name: "Home", isDefault: true, hidden: false, items: [
      { type: "module" as const, key: "home", hidden: getItemHidden("home") },
      { type: "module" as const, key: "dashboard", hidden: getItemHidden("dashboard") },
      { type: "module" as const, key: "templates", hidden: getItemHidden("templates") },
    ]},
    { id: "portfolio", name: "Portfolio", hidden: false, collapsedByDefault: false, items: [
      { type: "module" as const, key: "portfolios", hidden: getItemHidden("portfolios") },
      { type: "module" as const, key: "projects", hidden: getItemHidden("projects") },
      { type: "module" as const, key: "intakes", hidden: getItemHidden("intakes") },
      { type: "module" as const, key: "issues", hidden: getItemHidden("issues") },
      { type: "module" as const, key: "tasks", hidden: getItemHidden("tasks") },
      { type: "module" as const, key: "timesheets", hidden: getItemHidden("timesheets") },
    ]},
    { id: "resource-management", name: "Resource Management", hidden: false, collapsedByDefault: true, items: [
      { type: "module" as const, key: "resources", hidden: getItemHidden("resources") },
    ]},
    { id: "finance", name: "Finance", hidden: false, collapsedByDefault: true, items: [
      { type: "module" as const, key: "simulation", hidden: getItemHidden("simulation") },
      { type: "module" as const, key: "pmo-radar", hidden: getItemHidden("pmo-radar") },
      { type: "module" as const, key: "invoices", hidden: getItemHidden("invoices") },
    ]},
    ...otherGroups,
    { id: "help", name: "Help", isDefault: true, hidden: helpGroup?.hidden ?? false, collapsedByDefault: true, items: [
      { type: "module" as const, key: "calendar", hidden: getItemHidden("calendar") },
      { type: "module" as const, key: "lessons-learned", hidden: getItemHidden("lessons-learned") },
      { type: "module" as const, key: "user-guide", hidden: helpGroup?.items.find(i => i.type === "module" && i.key === "user-guide")?.hidden ?? false },
      { type: "module" as const, key: "training", hidden: helpGroup?.items.find(i => i.type === "module" && i.key === "training")?.hidden ?? false },
      ...customLinks,
    ]},
  ];
}

function ensureStructureHasDefaults(structure: SidebarStructure): SidebarStructure {
  const hasOldFlatMenu = structure.some(g => g.id === "menu") && !structure.some(g => g.id === "portfolio");
  if (hasOldFlatMenu) {
    structure = migrateOldFlatStructure(structure);
  }

  const validModuleKeys = new Set(availableModules.map(m => m.key));
  
  let cleanedStructure = structure.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (item.type === "module") {
        return validModuleKeys.has(item.key);
      }
      return true;
    })
  }));

  const ensureModule = (moduleKey: string, targetGroupId: string, afterKey?: string) => {
    const hasModule = cleanedStructure.some(g => 
      g.items.some(item => item.type === "module" && item.key === moduleKey)
    );
    if (!hasModule) {
      const targetGroup = cleanedStructure.find(g => g.id === targetGroupId);
      if (targetGroup) {
        cleanedStructure = cleanedStructure.map(g => {
          if (g.id === targetGroupId) {
            const newItems = [...g.items];
            if (afterKey) {
              const afterIndex = newItems.findIndex(item => item.type === "module" && item.key === afterKey);
              const insertIndex = afterIndex >= 0 ? afterIndex + 1 : newItems.length;
              newItems.splice(insertIndex, 0, { type: "module" as const, key: moduleKey, hidden: false });
            } else {
              newItems.push({ type: "module" as const, key: moduleKey, hidden: false });
            }
            return { ...g, items: newItems };
          }
          return g;
        });
      }
    }
  };

  ensureModule("home", "home");
  ensureModule("templates", "home", "dashboard");
  ensureModule("simulation", "finance");
  ensureModule("pmo-radar", "finance", "simulation");
  ensureModule("timesheets", "portfolio", "tasks");
  ensureModule("lessons-learned", "help");
  ensureModule("invoices", "finance", "pmo-radar");
  ensureModule("user-guide", "help");
  ensureModule("training", "help", "user-guide");
  ensureModule("daily-logs", "portfolio", "tasks");
  ensureModule("rfis", "portfolio", "daily-logs");
  ensureModule("submittals", "portfolio", "rfis");
  ensureModule("drawings", "portfolio", "submittals");
  ensureModule("punch-list", "portfolio", "drawings");
  
  const helpGroup = cleanedStructure.find(g => g.id === "help");
  if (!helpGroup) {
    cleanedStructure = [...cleanedStructure, { 
      id: "help", 
      name: "Help", 
      isDefault: true, 
      hidden: false, 
      collapsedByDefault: true,
      items: [
        { type: "module" as const, key: "calendar", hidden: false },
        { type: "module" as const, key: "lessons-learned", hidden: false },
        { type: "module" as const, key: "user-guide", hidden: false },
        { type: "module" as const, key: "training", hidden: false },
      ] 
    }];
  }
  
  return cleanedStructure;
}

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export function ModuleVisibilitySection({ organization }: { organization: Organization }) {
  const { toast } = useToast();
  
  const initialStructure = useMemo(() => {
    if (organization.sidebarStructure && Array.isArray(organization.sidebarStructure) && organization.sidebarStructure.length > 0) {
      return ensureStructureHasDefaults(organization.sidebarStructure as SidebarStructure);
    }
    return getDefaultSidebarStructure(organization.hiddenModules, organization.moduleOrder, organization.hiddenGroups);
  }, [organization.id, organization.sidebarStructure, organization.hiddenModules, organization.moduleOrder, organization.hiddenGroups]);
  
  const [structure, setStructure] = useState<SidebarStructure>(initialStructure);
  const [previousStructure, setPreviousStructure] = useState<SidebarStructure | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SidebarGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<SidebarGroup | null>(null);
  
  const [showAddLink, setShowAddLink] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<{ groupId: string; link: SidebarItem & { type: "customLink" } } | null>(null);
  
  const [newGroupName, setNewGroupName] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkOpenMode, setNewLinkOpenMode] = useState<"newTab" | "iframe">("newTab");
  
  useEffect(() => {
    const newStructure = organization.sidebarStructure && Array.isArray(organization.sidebarStructure) && organization.sidebarStructure.length > 0
      ? ensureStructureHasDefaults(organization.sidebarStructure as SidebarStructure)
      : getDefaultSidebarStructure(organization.hiddenModules, organization.moduleOrder, organization.hiddenGroups);
    setStructure(newStructure);
  }, [organization.id, organization.sidebarStructure]);
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  
  const updateOrgMutation = useMutation({
    mutationFn: async (data: { sidebarStructure: SidebarStructure }) => {
      return apiRequest('PUT', `/api/organizations/${organization.id}`, data);
    },
    onSuccess: () => {
      setPreviousStructure(null);
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      toast({ title: "Saved", description: "Menu structure updated" });
    },
    onError: () => {
      if (previousStructure) {
        setStructure(previousStructure);
        setPreviousStructure(null);
      }
      toast({ title: "Error", description: "Failed to update menu structure", variant: "destructive" });
    }
  });

  const saveStructure = (newStructure: SidebarStructure) => {
    const normalizedStructure = ensureStructureHasDefaults(newStructure);
    setPreviousStructure([...structure]);
    setStructure(normalizedStructure);
    updateOrgMutation.mutate({ sidebarStructure: normalizedStructure });
  };

  const getItemId = (item: SidebarItem): string => {
    return item.type === "module" ? `module-${item.key}` : `link-${item.id}`;
  };

  const findItemAndGroup = (id: string): { groupIndex: number; itemIndex: number } | null => {
    for (let gi = 0; gi < structure.length; gi++) {
      const itemIndex = structure[gi].items.findIndex(item => getItemId(item) === id);
      if (itemIndex !== -1) return { groupIndex: gi, itemIndex };
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const activeLocation = findItemAndGroup(String(active.id));
    const overLocation = findItemAndGroup(String(over.id));
    
    if (!activeLocation) return;
    
    const newStructure = structure.map(g => ({ ...g, items: [...g.items] }));
    
    if (overLocation) {
      if (activeLocation.groupIndex === overLocation.groupIndex) {
        newStructure[activeLocation.groupIndex].items = arrayMove(
          newStructure[activeLocation.groupIndex].items,
          activeLocation.itemIndex,
          overLocation.itemIndex
        );
      } else {
        const [movedItem] = newStructure[activeLocation.groupIndex].items.splice(activeLocation.itemIndex, 1);
        newStructure[overLocation.groupIndex].items.splice(overLocation.itemIndex, 0, movedItem);
      }
    }
    
    saveStructure(newStructure);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    
    const activeId = String(active.id);
    const overId = String(over.id);
    
    if (overId.startsWith("group-")) {
      const targetGroupId = overId.replace("group-", "");
      const activeLocation = findItemAndGroup(activeId);
      if (!activeLocation) return;
      
      const sourceGroupIndex = activeLocation.groupIndex;
      const targetGroupIndex = structure.findIndex(g => g.id === targetGroupId);
      if (targetGroupIndex === -1 || sourceGroupIndex === targetGroupIndex) return;
      
      const newStructure = structure.map(g => ({ ...g, items: [...g.items] }));
      const [movedItem] = newStructure[sourceGroupIndex].items.splice(activeLocation.itemIndex, 1);
      newStructure[targetGroupIndex].items.push(movedItem);
      setStructure(newStructure);
    }
  };

  const toggleGroupVisibility = (groupId: string) => {
    const newStructure = structure.map(g => 
      g.id === groupId ? { ...g, hidden: !g.hidden } : g
    );
    saveStructure(newStructure);
  };

  const toggleGroupCollapsedByDefault = (groupId: string) => {
    const newStructure = structure.map(g => 
      g.id === groupId ? { ...g, collapsedByDefault: !g.collapsedByDefault } : g
    );
    saveStructure(newStructure);
  };

  const toggleItemVisibility = (groupId: string, itemId: string) => {
    const newStructure = structure.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        items: g.items.map(item => 
          getItemId(item) === itemId ? { ...item, hidden: !item.hidden } : item
        )
      };
    });
    saveStructure(newStructure);
  };

  const addGroup = () => {
    if (!newGroupName.trim()) return;
    const id = newGroupName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const newGroup: SidebarGroup = { id, name: newGroupName.trim(), items: [] };
    saveStructure([...structure, newGroup]);
    setNewGroupName("");
    setShowAddGroup(false);
  };

  const updateGroup = () => {
    if (!editingGroup || !newGroupName.trim()) return;
    const newStructure = structure.map(g => 
      g.id === editingGroup.id ? { ...g, name: newGroupName.trim() } : g
    );
    saveStructure(newStructure);
    setNewGroupName("");
    setEditingGroup(null);
  };

  const confirmDeleteGroup = () => {
    if (!deleteGroup) return;
    const groupToDelete = structure.find(g => g.id === deleteGroup.id);
    if (!groupToDelete) return;
    
    const menuGroupIndex = structure.findIndex(g => g.id === "menu");
    const newStructure = structure.filter(g => g.id !== deleteGroup.id);
    
    if (groupToDelete.items.length > 0 && menuGroupIndex !== -1) {
      const targetIndex = newStructure.findIndex(g => g.id === "menu");
      if (targetIndex !== -1) {
        newStructure[targetIndex] = {
          ...newStructure[targetIndex],
          items: [...newStructure[targetIndex].items, ...groupToDelete.items]
        };
      }
    }
    
    saveStructure(newStructure);
    setDeleteGroup(null);
  };

  const moveGroup = (groupId: string, direction: 'up' | 'down') => {
    const index = structure.findIndex(g => g.id === groupId);
    if (index === -1) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= structure.length) return;
    
    const newStructure = [...structure];
    [newStructure[index], newStructure[newIndex]] = [newStructure[newIndex], newStructure[index]];
    saveStructure(newStructure);
  };

  const addCustomLink = (groupId: string) => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    try {
      new URL(newLinkUrl);
    } catch {
      toast({ title: "Invalid URL", description: "Please enter a valid URL", variant: "destructive" });
      return;
    }
    
    const linkId = `link-${Date.now()}`;
    const newLink: SidebarItem = {
      type: "customLink",
      id: linkId,
      label: newLinkLabel.trim(),
      url: newLinkUrl.trim(),
      openInNewTab: newLinkOpenMode === "newTab",
      openMode: newLinkOpenMode,
    };
    
    const newStructure = structure.map(g => 
      g.id === groupId ? { ...g, items: [...g.items, newLink] } : g
    );
    saveStructure(newStructure);
    setNewLinkLabel("");
    setNewLinkUrl("");
    setNewLinkOpenMode("newTab");
    setShowAddLink(null);
  };

  const updateCustomLink = () => {
    if (!editingLink || !newLinkLabel.trim() || !newLinkUrl.trim()) return;
    try {
      new URL(newLinkUrl);
    } catch {
      toast({ title: "Invalid URL", description: "Please enter a valid URL", variant: "destructive" });
      return;
    }
    
    const newStructure = structure.map(g => {
      if (g.id !== editingLink.groupId) return g;
      return {
        ...g,
        items: g.items.map(item => {
          if (item.type === "customLink" && item.id === editingLink.link.id) {
            return { ...item, label: newLinkLabel.trim(), url: newLinkUrl.trim(), openInNewTab: newLinkOpenMode === "newTab", openMode: newLinkOpenMode };
          }
          return item;
        })
      };
    });
    saveStructure(newStructure);
    setNewLinkLabel("");
    setNewLinkUrl("");
    setNewLinkOpenMode("newTab");
    setEditingLink(null);
  };

  const deleteItem = (groupId: string, itemId: string) => {
    const newStructure = structure.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, items: g.items.filter(item => getItemId(item) !== itemId) };
    });
    saveStructure(newStructure);
  };

  const getModuleInfo = (key: string) => availableModules.find(m => m.key === key);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5 shrink-0" />
                Menu Structure
              </CardTitle>
              <CardDescription>
                Organize menu groups and items. Drag items between groups to reorganize.
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddGroup(true)} size="sm" className="shrink-0" data-testid="button-add-group">
              <Plus className="h-4 w-4 mr-1" />
              Add Group
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
          >
            <div className="space-y-4">
              {structure.map((group, groupIndex) => (
                <div 
                  key={group.id} 
                  className="border rounded-lg overflow-x-hidden"
                  data-testid={`group-${group.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/50 border-b">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => moveGroup(group.id, 'up')}
                          disabled={groupIndex === 0 || updateOrgMutation.isPending}
                          data-testid={`button-move-group-up-${group.id}`}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => moveGroup(group.id, 'down')}
                          disabled={groupIndex === structure.length - 1 || updateOrgMutation.isPending}
                          data-testid={`button-move-group-down-${group.id}`}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className={`p-2 rounded-md shrink-0 ${group.hidden ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                        <Folder className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          <span className="truncate">{group.name}</span>
                          {group.isDefault && <Badge variant="outline" className="text-xs shrink-0">Default</Badge>}
                          {group.hidden && <Badge variant="secondary" className="text-xs shrink-0">Hidden</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground">{group.items.length} items</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <div className="flex items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowAddLink(group.id)}
                          data-testid={`button-add-link-${group.id}`}
                        >
                          <LinkIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setEditingGroup(group); setNewGroupName(group.name); }}
                          data-testid={`button-edit-group-${group.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!group.isDefault && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteGroup(group)}
                            data-testid={`button-delete-group-${group.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-1">
                        <span className="text-muted-foreground text-xs whitespace-nowrap">Collapsed</span>
                        <Switch
                          checked={!!group.collapsedByDefault}
                          onCheckedChange={() => toggleGroupCollapsedByDefault(group.id)}
                          disabled={updateOrgMutation.isPending}
                          data-testid={`switch-group-collapsed-${group.id}`}
                        />
                      </div>
                      <div className="flex items-center gap-2 ml-1">
                        <span className="text-muted-foreground">
                          {group.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </span>
                        <Switch
                          checked={!group.hidden}
                          onCheckedChange={() => toggleGroupVisibility(group.id)}
                          disabled={updateOrgMutation.isPending}
                          data-testid={`switch-group-${group.id}`}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <SortableContext
                    items={group.items.map(item => getItemId(item))}
                    strategy={verticalListSortingStrategy}
                  >
                    <div 
                      className="p-2 min-h-[48px]"
                      id={`group-${group.id}`}
                      data-testid={`group-items-${group.id}`}
                    >
                      {group.items.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          Drag items here or add a custom link
                        </div>
                      ) : (
                        group.items.map((item) => {
                          const itemId = getItemId(item);
                          const isHidden = item.hidden;
                          
                          if (item.type === "module") {
                            const moduleInfo = getModuleInfo(item.key);
                            const Icon = moduleIconMap[item.key] || Folder;
                            return (
                              <SortableItem key={itemId} id={itemId}>
                                <div 
                                  className="flex items-center justify-between gap-2 p-3 rounded-lg border mb-2 bg-background cursor-grab active:cursor-grabbing overflow-hidden"
                                  data-testid={`item-${itemId}`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div className={`p-2 rounded-md shrink-0 ${isHidden ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                                      <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-medium flex items-center gap-2">
                                        <span className="truncate">{moduleInfo?.name || item.key}</span>
                                        {isHidden && <Badge variant="secondary" className="text-xs shrink-0">Hidden</Badge>}
                                      </div>
                                      <div className="text-sm text-muted-foreground truncate">{moduleInfo?.description || 'Module'}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-muted-foreground">
                                      {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </span>
                                    <Switch
                                      checked={!isHidden}
                                      onCheckedChange={() => toggleItemVisibility(group.id, itemId)}
                                      disabled={updateOrgMutation.isPending}
                                      data-testid={`switch-item-${itemId}`}
                                    />
                                  </div>
                                </div>
                              </SortableItem>
                            );
                          } else {
                            return (
                              <SortableItem key={itemId} id={itemId}>
                                <div 
                                  className="flex items-center justify-between gap-2 p-3 rounded-lg border mb-2 bg-background cursor-grab active:cursor-grabbing overflow-hidden"
                                  data-testid={`item-${itemId}`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div className={`p-2 rounded-md shrink-0 ${isHidden ? 'bg-muted text-muted-foreground' : 'bg-accent text-accent-foreground'}`}>
                                      <ExternalLink className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-medium flex items-center gap-2">
                                        <span className="truncate">{item.label}</span>
                                        <Badge variant="outline" className="text-xs shrink-0">Link</Badge>
                                        {isHidden && <Badge variant="secondary" className="text-xs shrink-0">Hidden</Badge>}
                                      </div>
                                      <div className="text-sm text-muted-foreground truncate max-w-[200px]">{item.url}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => { 
                                        setEditingLink({ groupId: group.id, link: item }); 
                                        setNewLinkLabel(item.label); 
                                        setNewLinkUrl(item.url); 
                                        setNewLinkOpenMode(item.openMode || (item.openInNewTab === false ? "iframe" : "newTab"));
                                      }}
                                      data-testid={`button-edit-link-${item.id}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => deleteItem(group.id, itemId)}
                                      data-testid={`button-delete-link-${item.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <div className="flex items-center gap-2 ml-1">
                                      <span className="text-muted-foreground">
                                        {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                      </span>
                                      <Switch
                                        checked={!isHidden}
                                        onCheckedChange={() => toggleItemVisibility(group.id, itemId)}
                                        disabled={updateOrgMutation.isPending}
                                        data-testid={`switch-item-${itemId}`}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </SortableItem>
                            );
                          }
                        })
                      )}
                    </div>
                  </SortableContext>
                </div>
              ))}
            </div>
          </DndContext>
        </CardContent>
      </Card>

      <Dialog open={showAddGroup} onOpenChange={setShowAddGroup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Menu Group</DialogTitle>
            <DialogDescription>Create a new group to organize your sidebar items.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input 
                id="group-name" 
                value={newGroupName} 
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g., Reports"
                data-testid="input-group-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddGroup(false); setNewGroupName(""); }}>Cancel</Button>
            <Button onClick={addGroup} disabled={!newGroupName.trim()} data-testid="button-confirm-add-group">Add Group</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingGroup} onOpenChange={(open) => { if (!open) { setEditingGroup(null); setNewGroupName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
            <DialogDescription>Update the group name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-group-name">Group Name</Label>
              <Input 
                id="edit-group-name" 
                value={newGroupName} 
                onChange={(e) => setNewGroupName(e.target.value)}
                data-testid="input-edit-group-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingGroup(null); setNewGroupName(""); }}>Cancel</Button>
            <Button onClick={updateGroup} disabled={!newGroupName.trim()} data-testid="button-confirm-edit-group">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteGroup} onOpenChange={(open) => { if (!open) setDeleteGroup(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteGroup?.name}"? 
              {deleteGroup && deleteGroup.items.length > 0 && " Its items will be moved to the Menu group."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteGroup} data-testid="button-confirm-delete-group">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!showAddLink} onOpenChange={(open) => { if (!open) { setShowAddLink(null); setNewLinkLabel(""); setNewLinkUrl(""); setNewLinkOpenMode("newTab"); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Link</DialogTitle>
            <DialogDescription>Add an external link to your sidebar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="link-label">Label</Label>
              <Input 
                id="link-label" 
                value={newLinkLabel} 
                onChange={(e) => setNewLinkLabel(e.target.value)}
                placeholder="e.g., Documentation"
                data-testid="input-link-label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input 
                id="link-url" 
                value={newLinkUrl} 
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://example.com"
                data-testid="input-link-url"
              />
            </div>
            <div className="space-y-2">
              <Label>Open Mode</Label>
              <RadioGroup 
                value={newLinkOpenMode} 
                onValueChange={(value: "newTab" | "iframe") => setNewLinkOpenMode(value)}
                className="flex gap-4"
                data-testid="radio-link-open-mode"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="newTab" id="add-mode-newtab" data-testid="radio-newtab" />
                  <Label htmlFor="add-mode-newtab" className="font-normal cursor-pointer">New Tab</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="iframe" id="add-mode-iframe" data-testid="radio-iframe" />
                  <Label htmlFor="add-mode-iframe" className="font-normal cursor-pointer">Embedded (iframe)</Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">New Tab opens the link in a separate browser tab. Embedded displays the link within the app.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddLink(null); setNewLinkLabel(""); setNewLinkUrl(""); setNewLinkOpenMode("newTab"); }}>Cancel</Button>
            <Button onClick={() => showAddLink && addCustomLink(showAddLink)} disabled={!newLinkLabel.trim() || !newLinkUrl.trim()} data-testid="button-confirm-add-link">Add Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingLink} onOpenChange={(open) => { if (!open) { setEditingLink(null); setNewLinkLabel(""); setNewLinkUrl(""); setNewLinkOpenMode("newTab"); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Custom Link</DialogTitle>
            <DialogDescription>Update the link details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-link-label">Label</Label>
              <Input 
                id="edit-link-label" 
                value={newLinkLabel} 
                onChange={(e) => setNewLinkLabel(e.target.value)}
                data-testid="input-edit-link-label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-link-url">URL</Label>
              <Input 
                id="edit-link-url" 
                value={newLinkUrl} 
                onChange={(e) => setNewLinkUrl(e.target.value)}
                data-testid="input-edit-link-url"
              />
            </div>
            <div className="space-y-2">
              <Label>Open Mode</Label>
              <RadioGroup 
                value={newLinkOpenMode} 
                onValueChange={(value: "newTab" | "iframe") => setNewLinkOpenMode(value)}
                className="flex gap-4"
                data-testid="radio-edit-link-open-mode"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="newTab" id="edit-mode-newtab" data-testid="radio-edit-newtab" />
                  <Label htmlFor="edit-mode-newtab" className="font-normal cursor-pointer">New Tab</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="iframe" id="edit-mode-iframe" data-testid="radio-edit-iframe" />
                  <Label htmlFor="edit-mode-iframe" className="font-normal cursor-pointer">Embedded (iframe)</Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">New Tab opens the link in a separate browser tab. Embedded displays the link within the app.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingLink(null); setNewLinkLabel(""); setNewLinkUrl(""); setNewLinkOpenMode("newTab"); }}>Cancel</Button>
            <Button onClick={updateCustomLink} disabled={!newLinkLabel.trim() || !newLinkUrl.trim()} data-testid="button-confirm-edit-link">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}