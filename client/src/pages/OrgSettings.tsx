import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, UserPlus, Trash2, Settings, Users, ShieldAlert, RotateCcw, Folder, FileText, Target, Flag, AlertCircle, CheckSquare, LayoutDashboard, Briefcase, FolderKanban, FileInput, CircleDot, Calendar, Plug, EyeOff, Eye, GitBranch, Save, RotateCw, GripVertical, Pencil, X, Plus, Check, ChevronUp, ChevronDown, BookOpen, ExternalLink, Link as LinkIcon, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AVAILABLE_INTAKE_FIELDS } from "@/hooks/use-intake-workflow";
import type { Organization, OrganizationMember, User, RecycleBinItem, RecycleBinItemType, IntakeWorkflowStep, SidebarStructure, SidebarGroup, SidebarItem } from "@shared/schema";
import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay, UniqueIdentifier } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface EnrichedMember extends OrganizationMember {
  user?: User;
}

export default function OrgSettings() {
  const { user, isLoading: authLoading } = useAuth();
  const { currentOrganization, memberships, organizations, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Check if user has admin access to the current organization
  const hasAdminAccess = user?.role === 'super_admin' || 
    memberships?.some(m => m.organizationId === currentOrganization?.id && m.role === 'org_admin');

  if (authLoading || orgLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentOrganization) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Organization Settings</h1>
            <p className="text-muted-foreground">Manage your organization and team members</p>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Users className="h-16 w-16 text-muted-foreground/50" />
            <h2 className="text-xl font-semibold text-foreground">No Organization Selected</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Please select an organization from the dropdown in the top bar to manage its settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-2xl font-bold text-foreground">No Admin Access</h2>
        <p className="text-muted-foreground text-center max-w-md">
          You don't have admin access to <strong>{currentOrganization.name}</strong>. 
          Please select a different organization from the top bar or contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Organization Settings</h1>
            <p className="text-muted-foreground">Managing: <strong>{currentOrganization.name}</strong></p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="modules" orientation="vertical" className="flex gap-6">
        <TabsList className="flex-col h-fit w-56 bg-card border rounded-lg p-1">
          <TabsTrigger value="modules" className="w-full justify-start gap-3" data-testid="nav-modules">
            <Eye className="h-4 w-4" />
            Module Visibility
          </TabsTrigger>
          <TabsTrigger value="intake" className="w-full justify-start gap-3" data-testid="nav-intake">
            <GitBranch className="h-4 w-4" />
            Intake Workflow
          </TabsTrigger>
          <TabsTrigger value="members" className="w-full justify-start gap-3" data-testid="nav-members">
            <Users className="h-4 w-4" />
            Team Members
          </TabsTrigger>
          <TabsTrigger value="recycle" className="w-full justify-start gap-3" data-testid="nav-recycle">
            <Trash2 className="h-4 w-4" />
            Recycle Bin
          </TabsTrigger>
          <TabsTrigger value="demo" className="w-full justify-start gap-3" data-testid="nav-demo">
            <Sparkles className="h-4 w-4" />
            Demo Data
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-w-0">
          <TabsContent value="modules" className="mt-0">
            <ModuleVisibilitySection organization={currentOrganization} />
          </TabsContent>
          <TabsContent value="intake" className="mt-0">
            <IntakeWorkflowSection organizationId={currentOrganization.id} />
          </TabsContent>
          <TabsContent value="members" className="mt-0">
            <MembersSection organizationId={currentOrganization.id} orgName={currentOrganization.name} />
          </TabsContent>
          <TabsContent value="recycle" className="mt-0">
            <RecycleBinSection organizationId={currentOrganization.id} />
          </TabsContent>
          <TabsContent value="demo" className="mt-0">
            <DemoDataSection organizationId={currentOrganization.id} orgName={currentOrganization.name} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

const availableModules = [
  { key: "dashboard", name: "Dashboard", icon: LayoutDashboard, description: "Overview and analytics" },
  { key: "portfolios", name: "Portfolios", icon: Briefcase, description: "Group and manage portfolios" },
  { key: "projects", name: "Projects", icon: FolderKanban, description: "Project management" },
  { key: "intakes", name: "Intakes", icon: FileInput, description: "Project intake requests" },
  { key: "tasks", name: "Tasks", icon: CheckSquare, description: "Task tracking" },
  { key: "issues", name: "Issues", icon: CircleDot, description: "Issue tracking" },
  { key: "resources", name: "Resources", icon: Users, description: "Resource management" },
  { key: "calendar", name: "Calendar", icon: Calendar, description: "Calendar view" },
  { key: "integrations", name: "Integrations", icon: Plug, description: "External integrations" },
  { key: "user-guide", name: "User Guide", icon: BookOpen, description: "Help documentation" },
];

const moduleIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  portfolios: Briefcase,
  projects: FolderKanban,
  intakes: FileInput,
  tasks: CheckSquare,
  issues: CircleDot,
  resources: Users,
  calendar: Calendar,
  integrations: Plug,
  "user-guide": BookOpen,
};

function getDefaultSidebarStructure(hiddenModules?: string[] | null, moduleOrder?: string[] | null, hiddenGroups?: string[] | null): SidebarStructure {
  const mainModuleKeys = availableModules.filter(m => m.key !== "user-guide").map(m => m.key);
  const order = moduleOrder && moduleOrder.length > 0 
    ? moduleOrder.filter(k => mainModuleKeys.includes(k)) 
    : mainModuleKeys;
  const hidden = hiddenModules || [];
  const groupsHidden = hiddenGroups || [];
  
  const menuItems: SidebarItem[] = order.map(key => ({
    type: "module" as const,
    key,
    hidden: hidden.includes(key),
  }));
  
  const helpItems: SidebarItem[] = [{ type: "module" as const, key: "user-guide", hidden: false }];
  
  return [
    { id: "menu", name: "Menu", isDefault: true, hidden: groupsHidden.includes("menu"), items: menuItems },
    { id: "help", name: "Help", isDefault: true, hidden: groupsHidden.includes("help"), items: helpItems },
  ];
}

function ensureStructureHasDefaults(structure: SidebarStructure): SidebarStructure {
  const helpGroup = structure.find(g => g.id === "help");
  const hasUserGuide = structure.some(g => 
    g.items.some(item => item.type === "module" && item.key === "user-guide")
  );
  
  if (!hasUserGuide && helpGroup) {
    return structure.map(g => {
      if (g.id === "help") {
        return { ...g, items: [...g.items, { type: "module" as const, key: "user-guide", hidden: false }] };
      }
      return g;
    });
  }
  
  if (!helpGroup) {
    return [...structure, { 
      id: "help", 
      name: "Help", 
      isDefault: true, 
      hidden: false, 
      items: [{ type: "module" as const, key: "user-guide", hidden: false }] 
    }];
  }
  
  return structure;
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

function ModuleVisibilitySection({ organization }: { organization: Organization }) {
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5" />
                Menu Structure
              </CardTitle>
              <CardDescription>
                Organize menu groups and items. Drag items between groups to reorganize.
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddGroup(true)} size="sm" data-testid="button-add-group">
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
                  className="border rounded-lg overflow-visible"
                  data-testid={`group-${group.id}`}
                >
                  <div className="flex items-center justify-between p-3 bg-muted/50 border-b">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
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
                      <div className={`p-2 rounded-md ${group.hidden ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                        <Folder className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {group.name}
                          {group.isDefault && <Badge variant="outline" className="text-xs">Default</Badge>}
                          {group.hidden && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground">{group.items.length} items</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
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
                      <div className="flex items-center gap-2 ml-2">
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
                                  className="flex items-center justify-between p-3 rounded-lg border mb-2 bg-background cursor-grab active:cursor-grabbing"
                                  data-testid={`item-${itemId}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    <div className={`p-2 rounded-md ${isHidden ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                                      <Icon className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <div className="font-medium flex items-center gap-2">
                                        {moduleInfo?.name || item.key}
                                        {isHidden && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                                      </div>
                                      <div className="text-sm text-muted-foreground">{moduleInfo?.description || 'Module'}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
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
                                  className="flex items-center justify-between p-3 rounded-lg border mb-2 bg-background cursor-grab active:cursor-grabbing"
                                  data-testid={`item-${itemId}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    <div className={`p-2 rounded-md ${isHidden ? 'bg-muted text-muted-foreground' : 'bg-accent text-accent-foreground'}`}>
                                      <ExternalLink className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <div className="font-medium flex items-center gap-2">
                                        {item.label}
                                        <Badge variant="outline" className="text-xs">Link</Badge>
                                        {isHidden && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                                      </div>
                                      <div className="text-sm text-muted-foreground truncate max-w-[200px]">{item.url}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
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
                                    <div className="flex items-center gap-2 ml-2">
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

function IntakeWorkflowSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [editingStep, setEditingStep] = useState<IntakeWorkflowStep | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editHelpText, setEditHelpText] = useState("");
  const [editRequiredFields, setEditRequiredFields] = useState<string[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepKey, setNewStepKey] = useState("");
  const [newStepLabel, setNewStepLabel] = useState("");
  const [newStepDescription, setNewStepDescription] = useState("");
  const [stepToDelete, setStepToDelete] = useState<IntakeWorkflowStep | null>(null);

  const { data: workflowSteps, isLoading } = useQuery<IntakeWorkflowStep[]>({
    queryKey: ['/api/organizations', organizationId, 'intake-workflow'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/intake-workflow`);
      if (!res.ok) return [];
      return res.json();
    }
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: async (steps: Partial<IntakeWorkflowStep>[]) => {
      return apiRequest('PUT', `/api/organizations/${organizationId}/intake-workflow`, { steps });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'intake-workflow'] });
      toast({ title: "Saved", description: "Workflow configuration updated" });
      setEditingStep(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update workflow", variant: "destructive" });
    }
  });

  const resetWorkflowMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/organizations/${organizationId}/intake-workflow/reset`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'intake-workflow'] });
      toast({ title: "Reset", description: "Workflow restored to default configuration" });
      setShowResetConfirm(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset workflow", variant: "destructive" });
    }
  });

  const openEditDialog = (step: IntakeWorkflowStep) => {
    setEditingStep(step);
    setEditLabel(step.label);
    setEditDescription(step.description || "");
    setEditHelpText(step.helpText || "");
    setEditRequiredFields(step.requiredFields || []);
  };

  const handleSaveStep = () => {
    if (!editingStep || !workflowSteps) return;
    
    const updatedSteps = workflowSteps.map(s => {
      if (s.stepKey === editingStep.stepKey) {
        return {
          stepKey: s.stepKey,
          position: s.position,
          label: editLabel,
          description: editDescription,
          helpText: editHelpText,
          requiredFields: editRequiredFields,
          isActive: s.isActive,
        };
      }
      return {
        stepKey: s.stepKey,
        position: s.position,
        label: s.label,
        description: s.description,
        helpText: s.helpText,
        requiredFields: s.requiredFields,
        isActive: s.isActive,
      };
    });
    
    updateWorkflowMutation.mutate(updatedSteps);
  };

  const toggleRequiredField = (fieldKey: string) => {
    setEditRequiredFields(prev => 
      prev.includes(fieldKey) 
        ? prev.filter(f => f !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  const handleAddStep = () => {
    if (!newStepLabel.trim() || !workflowSteps) return;
    
    const stepKey = newStepKey.trim() || `custom_${Date.now()}`;
    const maxPosition = Math.max(...workflowSteps.map(s => s.position), -1);
    
    const newStep = {
      stepKey,
      position: maxPosition + 1,
      label: newStepLabel.trim(),
      description: newStepDescription.trim() || undefined,
      helpText: undefined,
      requiredFields: [],
      isActive: true,
    };
    
    const updatedSteps = [
      ...workflowSteps.map(s => ({
        stepKey: s.stepKey,
        position: s.position,
        label: s.label,
        description: s.description,
        helpText: s.helpText,
        requiredFields: s.requiredFields,
        isActive: s.isActive,
      })),
      newStep
    ];
    
    updateWorkflowMutation.mutate(updatedSteps);
    setShowAddStep(false);
    setNewStepKey("");
    setNewStepLabel("");
    setNewStepDescription("");
  };

  const handleDeleteStep = () => {
    if (!stepToDelete || !workflowSteps) return;
    
    const updatedSteps = workflowSteps
      .filter(s => s.stepKey !== stepToDelete.stepKey)
      .map((s, idx) => ({
        stepKey: s.stepKey,
        position: idx,
        label: s.label,
        description: s.description,
        helpText: s.helpText,
        requiredFields: s.requiredFields,
        isActive: s.isActive,
      }));
    
    updateWorkflowMutation.mutate(updatedSteps);
    setStepToDelete(null);
  };

  const handleToggleActive = (step: IntakeWorkflowStep) => {
    if (!workflowSteps) return;
    
    const updatedSteps = workflowSteps.map(s => ({
      stepKey: s.stepKey,
      position: s.position,
      label: s.label,
      description: s.description,
      helpText: s.helpText,
      requiredFields: s.requiredFields,
      isActive: s.stepKey === step.stepKey ? !s.isActive : s.isActive,
    }));
    
    updateWorkflowMutation.mutate(updatedSteps);
  };

  const handleMoveStep = (step: IntakeWorkflowStep, direction: 'up' | 'down') => {
    if (!workflowSteps) return;
    
    const sorted = [...workflowSteps].sort((a, b) => a.position - b.position);
    const currentIndex = sorted.findIndex(s => s.stepKey === step.stepKey);
    
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === sorted.length - 1) return;
    
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    [sorted[currentIndex], sorted[swapIndex]] = [sorted[swapIndex], sorted[currentIndex]];
    
    const updatedSteps = sorted.map((s, idx) => ({
      stepKey: s.stepKey,
      position: idx,
      label: s.label,
      description: s.description,
      helpText: s.helpText,
      requiredFields: s.requiredFields,
      isActive: s.isActive,
    }));
    
    updateWorkflowMutation.mutate(updatedSteps);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const sortedSteps = [...(workflowSteps || [])].sort((a, b) => a.position - b.position);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Intake Workflow Configuration
          </CardTitle>
          <CardDescription>
            Customize the intake workflow steps and required fields for your organization
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowAddStep(true)}
            data-testid="button-add-step"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Step
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetConfirm(true)}
            data-testid="button-reset-workflow"
          >
            <RotateCw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sortedSteps.map((step, index) => (
            <div
              key={step.stepKey}
              className={`flex items-center justify-between p-4 rounded-lg border hover-elevate ${step.isActive === false ? 'opacity-50' : ''}`}
              data-testid={`workflow-step-${step.stepKey}`}
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveStep(step, 'up')}
                    disabled={index === 0 || updateWorkflowMutation.isPending}
                    data-testid={`button-move-up-${step.stepKey}`}
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveStep(step, 'down')}
                    disabled={index === sortedSteps.length - 1 || updateWorkflowMutation.isPending}
                    data-testid={`button-move-down-${step.stepKey}`}
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Button>
                </div>
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-medium text-sm">
                  {index + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{step.label}</span>
                    {step.isActive === false && (
                      <Badge variant="outline" className="text-xs">Disabled</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {step.description || "No description"}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {step.requiredFields && step.requiredFields.length > 0 ? (
                      step.requiredFields.map(field => {
                        const fieldInfo = AVAILABLE_INTAKE_FIELDS.find(f => f.key === field);
                        return (
                          <Badge key={field} variant="secondary" className="text-xs">
                            {fieldInfo?.label || field}
                          </Badge>
                        );
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground">No required fields</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={step.isActive !== false}
                  onCheckedChange={() => handleToggleActive(step)}
                  disabled={updateWorkflowMutation.isPending}
                  data-testid={`switch-step-active-${step.stepKey}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEditDialog(step)}
                  data-testid={`button-edit-step-${step.stepKey}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStepToDelete(step)}
                  disabled={updateWorkflowMutation.isPending}
                  data-testid={`button-delete-step-${step.stepKey}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={editingStep !== null} onOpenChange={() => setEditingStep(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Workflow Step</DialogTitle>
            <DialogDescription>
              Customize the step name and required fields. Step key: {editingStep?.stepKey}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Step Name</Label>
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Enter step name"
                data-testid="input-step-label"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Brief description of this step"
                className="resize-none"
                data-testid="input-step-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Help Text</Label>
              <Textarea
                value={editHelpText}
                onChange={(e) => setEditHelpText(e.target.value)}
                placeholder="Additional guidance for users"
                className="resize-none"
                data-testid="input-step-helptext"
              />
            </div>
            <div className="space-y-2">
              <Label>Required Fields</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Select which fields must be completed before advancing past this step
              </p>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {AVAILABLE_INTAKE_FIELDS.map(field => (
                  <div 
                    key={field.key} 
                    className="flex items-center space-x-2"
                    data-testid={`checkbox-field-${field.key}`}
                  >
                    <Checkbox
                      id={`field-${field.key}`}
                      checked={editRequiredFields.includes(field.key)}
                      onCheckedChange={() => toggleRequiredField(field.key)}
                    />
                    <label
                      htmlFor={`field-${field.key}`}
                      className="text-sm cursor-pointer"
                    >
                      {field.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStep(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveStep} 
              disabled={updateWorkflowMutation.isPending}
              data-testid="button-save-step"
            >
              {updateWorkflowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Workflow to Defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore all workflow steps to their default names and required fields. 
              Your customizations will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetWorkflowMutation.mutate()}
              disabled={resetWorkflowMutation.isPending}
            >
              {resetWorkflowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reset to Defaults
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Step Dialog */}
      <Dialog open={showAddStep} onOpenChange={setShowAddStep}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Workflow Step</DialogTitle>
            <DialogDescription>
              Create a new step in your intake workflow
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Step Name *</Label>
              <Input
                value={newStepLabel}
                onChange={(e) => setNewStepLabel(e.target.value)}
                placeholder="e.g., Security Review"
                data-testid="input-new-step-label"
              />
            </div>
            <div className="space-y-2">
              <Label>Step Key (optional)</Label>
              <Input
                value={newStepKey}
                onChange={(e) => setNewStepKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                placeholder="e.g., security_review"
                data-testid="input-new-step-key"
              />
              <p className="text-xs text-muted-foreground">
                A unique identifier for this step. Leave blank to auto-generate.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newStepDescription}
                onChange={(e) => setNewStepDescription(e.target.value)}
                placeholder="Brief description of this step"
                className="resize-none"
                data-testid="input-new-step-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStep(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddStep} 
              disabled={!newStepLabel.trim() || updateWorkflowMutation.isPending}
              data-testid="button-confirm-add-step"
            >
              {updateWorkflowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Step Confirmation */}
      <AlertDialog open={stepToDelete !== null} onOpenChange={() => setStepToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow Step?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{stepToDelete?.label}" from the workflow? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStep}
              disabled={updateWorkflowMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {updateWorkflowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Step
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function RecycleBinSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [itemToDelete, setItemToDelete] = useState<RecycleBinItem | null>(null);

  const { data: deletedItems, isLoading } = useQuery<RecycleBinItem[]>({
    queryKey: ['/api/organizations', organizationId, 'recycle-bin'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/recycle-bin`);
      if (!res.ok) return [];
      return res.json();
    }
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ type, itemId }: { type: RecycleBinItemType; itemId: number }) => {
      return apiRequest('POST', `/api/organizations/${organizationId}/recycle-bin/restore`, { type, itemId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'recycle-bin'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({ title: "Restored", description: "Item has been restored successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to restore item", variant: "destructive" });
    }
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async ({ type, itemId }: { type: RecycleBinItemType; itemId: number }) => {
      return apiRequest('DELETE', `/api/organizations/${organizationId}/recycle-bin/${type}/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'recycle-bin'] });
      toast({ title: "Deleted", description: "Item has been permanently deleted" });
      setItemToDelete(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete item", variant: "destructive" });
    }
  });

  const getTypeIcon = (type: RecycleBinItemType) => {
    switch (type) {
      case 'portfolio': return <Folder className="h-4 w-4" />;
      case 'project': return <FileText className="h-4 w-4" />;
      case 'task': return <CheckSquare className="h-4 w-4" />;
      case 'risk': return <AlertCircle className="h-4 w-4" />;
      case 'milestone': return <Target className="h-4 w-4" />;
      case 'issue': return <Flag className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeBadgeVariant = (type: RecycleBinItemType) => {
    switch (type) {
      case 'portfolio': return 'default';
      case 'project': return 'secondary';
      case 'task': return 'outline';
      case 'risk': return 'destructive';
      case 'milestone': return 'default';
      case 'issue': return 'secondary';
      default: return 'outline';
    }
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Recycle Bin
        </CardTitle>
        <CardDescription>
          Recently deleted items can be restored or permanently removed
        </CardDescription>
      </CardHeader>
      <CardContent>
        {deletedItems && deletedItems.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Deleted By</TableHead>
                <TableHead>Deleted At</TableHead>
                <TableHead className="w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deletedItems.map((item) => (
                <TableRow key={`${item.type}-${item.id}`} data-testid={`recycle-bin-row-${item.type}-${item.id}`}>
                  <TableCell>
                    <Badge variant={getTypeBadgeVariant(item.type) as any} className="flex items-center gap-1 w-fit">
                      {getTypeIcon(item.type)}
                      {item.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.projectName || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{item.deletedByName || 'Unknown'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(item.deletedAt), 'MMM d, yyyy h:mm a')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => restoreMutation.mutate({ type: item.type, itemId: item.id })}
                        disabled={restoreMutation.isPending}
                        title="Restore"
                        data-testid={`button-restore-${item.type}-${item.id}`}
                      >
                        <RotateCcw className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setItemToDelete(item)}
                        disabled={permanentDeleteMutation.isPending}
                        title="Delete permanently"
                        data-testid={`button-delete-permanent-${item.type}-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No deleted items in the recycle bin.
          </div>
        )}
      </CardContent>

      <AlertDialog open={itemToDelete !== null} onOpenChange={() => setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{itemToDelete?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => itemToDelete && permanentDeleteMutation.mutate({ type: itemToDelete.type, itemId: itemToDelete.id })}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function MembersSection({ organizationId, orgName }: { organizationId: number; orgName: string }) {
  const { toast } = useToast();
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("member");
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);

  const { data: members, isLoading } = useQuery<EnrichedMember[]>({
    queryKey: ['/api/organizations', organizationId, 'members'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/members`);
      if (!res.ok) return []; // Return empty array on error (e.g., 403 access denied)
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  });

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ['/api/users']
  });

  const addMember = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest('POST', `/api/organizations/${organizationId}/members`, { userId, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'members'] });
      toast({ title: "Success", description: "Member added to organization" });
      setIsAddMemberOpen(false);
      setSelectedUserId("");
      setSelectedRole("member");
    }
  });

  const updateMemberRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest('PUT', `/api/organizations/${organizationId}/members/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'members'] });
      toast({ title: "Success", description: "Member role updated" });
    }
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest('DELETE', `/api/organizations/${organizationId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'members'] });
      toast({ title: "Success", description: "Member removed from organization" });
      setRemoveMemberId(null);
    }
  });

  const existingMemberIds = members?.map(m => m.userId) || [];
  const availableUsers = allUsers?.filter(u => !existingMemberIds.includes(u.id)) || [];

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members - {orgName}
          </CardTitle>
          <CardDescription>Manage who has access to this organization</CardDescription>
        </div>
        <Button onClick={() => setIsAddMemberOpen(true)} data-testid="button-add-member">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Member
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map(member => (
              <TableRow key={member.id} data-testid={`member-row-${member.id}`}>
                <TableCell className="font-medium">
                  {member.user?.firstName} {member.user?.lastName}
                </TableCell>
                <TableCell>{member.user?.email || 'N/A'}</TableCell>
                <TableCell>
                  <Select 
                    value={member.role} 
                    onValueChange={(role) => updateMemberRole.mutate({ userId: member.userId, role })}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="org_admin">Org Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {member.createdAt ? format(new Date(member.createdAt), 'MMM d, yyyy') : 'N/A'}
                </TableCell>
                <TableCell>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setRemoveMemberId(member.userId)}
                    data-testid={`button-remove-member-${member.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {members?.length === 0 && (
          <div className="text-center py-8 text-slate-500">No members in this organization yet.</div>
        )}
      </CardContent>

      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Add an existing user to this organization</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a user" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_admin">Org Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddMemberOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => addMember.mutate({ userId: selectedUserId, role: selectedRole })}
              disabled={!selectedUserId}
              data-testid="button-confirm-add-member"
            >
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeMemberId !== null} onOpenChange={() => setRemoveMemberId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this member from the organization?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveMemberId(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => removeMemberId && removeMember.mutate(removeMemberId)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DemoDataSection({ organizationId, orgName }: { organizationId: number; orgName: string }) {
  const { toast } = useToast();
  const [customIndustry, setCustomIndustry] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("");
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const { data: industries } = useQuery<Array<{ id: string; label: string; description: string }>>({
    queryKey: ['/api/demo-data/industries'],
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { organizationId: number; industry?: string; customIndustry?: string }) => {
      return apiRequest('POST', '/api/demo-data/generate', data);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: "Demo Data Generated",
        description: `Created ${response.stats?.portfolios || 0} portfolios, ${response.stats?.projects || 0} projects for ${orgName}`,
      });
      setCustomIndustry("");
      setSelectedIndustry("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate demo data",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/demo-data/${organizationId}`);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: "Demo Data Removed",
        description: `Removed ${response.stats?.portfolios || 0} portfolios, ${response.stats?.projects || 0} projects from ${orgName}`,
      });
      setShowRemoveConfirm(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove demo data",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (customIndustry.trim()) {
      generateMutation.mutate({ organizationId, customIndustry: customIndustry.trim() });
    } else if (selectedIndustry) {
      generateMutation.mutate({ organizationId, industry: selectedIndustry });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Generate Demo Data
        </CardTitle>
        <CardDescription>
          Create sample portfolios, projects, tasks, risks, milestones, and issues to explore the application.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customIndustry">Industry / Business Type</Label>
            <Input
              id="customIndustry"
              placeholder="e.g., Real Estate, Construction, Legal Services, Education..."
              value={customIndustry}
              onChange={(e) => {
                setCustomIndustry(e.target.value);
                if (e.target.value) setSelectedIndustry("");
              }}
              data-testid="input-custom-industry"
            />
            <p className="text-xs text-muted-foreground">
              Enter any industry or business type and AI will generate relevant demo data
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 border-t" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="flex-1 border-t" />
          </div>

          <div className="space-y-2">
            <Label>Choose from Templates</Label>
            <Select 
              value={selectedIndustry} 
              onValueChange={(val) => {
                setSelectedIndustry(val);
                if (val) setCustomIndustry("");
              }}
            >
              <SelectTrigger data-testid="select-industry">
                <SelectValue placeholder="Select an industry template" />
              </SelectTrigger>
              <SelectContent>
                {industries?.map((ind) => (
                  <SelectItem key={ind.id} value={ind.id}>
                    {ind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <h4 className="font-medium text-sm">What will be created:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>2 Portfolios with descriptions</li>
            <li>4-6 Projects with budgets, statuses, and health indicators</li>
            <li>Tasks, Risks, Milestones, and Issues for each project</li>
            <li>Financial line items with budget vs actual tracking</li>
          </ul>
        </div>

        <Button 
          onClick={handleGenerate}
          disabled={generateMutation.isPending || (!customIndustry.trim() && !selectedIndustry)}
          className="w-full"
          data-testid="button-generate-demo"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Demo Data
            </>
          )}
        </Button>

        <div className="border-t pt-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-sm">Remove Demo Data</h4>
              <p className="text-xs text-muted-foreground">
                Delete all demo portfolios, projects, and related items
              </p>
            </div>
            <Button 
              variant="destructive"
              onClick={() => setShowRemoveConfirm(true)}
              disabled={removeMutation.isPending}
              data-testid="button-remove-demo"
            >
              {removeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove Demo Data
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Demo Data</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove all demo data from {orgName}? This will delete all demo portfolios, projects, tasks, risks, milestones, issues, and financial records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveConfirm(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              data-testid="button-confirm-remove-demo"
            >
              {removeMutation.isPending ? "Removing..." : "Remove All Demo Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
