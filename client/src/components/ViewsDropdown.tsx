import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDown, Plus, Save, Pencil, Trash2, Check, Star, Search, AlertCircle, FolderOpen, Users, User, Archive, FolderCheck, Building2, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProjectViews, useCreateProjectView, useUpdateProjectView, useDeleteProjectView, useSetDefaultView } from "@/hooks/use-project-views";
import { useQuery } from "@tanstack/react-query";
import type { ProjectView } from "@shared/schema";

interface SystemProjectView {
  id: number;
  organizationId: number;
  mode: string;
  name: string;
  description: string | null;
  visibleColumns: string[];
  columnOrder: string[] | null;
  columnWidths: Record<string, number> | null;
  filterCriteria: Record<string, unknown> | null;
  isActive: boolean;
  displayOrder: number;
}
import { cn, normalizeSearch } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export type ProjectFilterView = 
  | "all"
  | "my-active"
  | "active"
  | "closed"
  | "my-closed"
  | "internal";

interface FilterViewOption {
  id: ProjectFilterView;
  label: string;
  icon: typeof FolderOpen;
  tooltip: string;
}

const FILTER_VIEW_OPTIONS: FilterViewOption[] = [
  {
    id: "all",
    label: "All Projects",
    icon: FolderOpen,
    tooltip: "View all projects regardless of status",
  },
  {
    id: "active",
    label: "Active Projects",
    icon: Users,
    tooltip: "Projects not in 'Closed' status (locked/archived)",
  },
  {
    id: "my-active",
    label: "My Active Projects",
    icon: User,
    tooltip: "Your assigned projects not in 'Closed' status",
  },
  {
    id: "closed",
    label: "Closed Projects",
    icon: Archive,
    tooltip: "Locked/archived projects with 'Closed' status",
  },
  {
    id: "my-closed",
    label: "My Closed Projects",
    icon: FolderCheck,
    tooltip: "Your assigned projects with 'Closed' status",
  },
  {
    id: "internal",
    label: "Internal Projects",
    icon: Lock,
    tooltip: "Projects marked as internal",
  },
];

interface GridColumn {
  id: string;
  label: string;
}

interface ViewsDropdownProps {
  mode: 'grid' | 'gantt' | 'list';
  organizationId: number | null;
  portfolioId?: number | null;
  allColumns: GridColumn[];
  visibleColumns: string[];
  columnOrder: string[];
  onApplyView: (view: { visibleColumns: string[]; columnOrder: string[] }) => void;
  defaultColumns: string[];
  defaultColumnOrder: string[];
  filterView?: ProjectFilterView;
  onFilterViewChange?: (filterView: ProjectFilterView) => void;
}

export function ViewsDropdown({
  mode,
  organizationId,
  portfolioId = null,
  allColumns,
  visibleColumns,
  columnOrder,
  onApplyView,
  defaultColumns,
  defaultColumnOrder,
  filterView = "all",
  onFilterViewChange,
}: ViewsDropdownProps) {
  const { toast } = useToast();
  const { data: views = [], isLoading } = useProjectViews(organizationId, mode, portfolioId);
  const createViewMutation = useCreateProjectView(organizationId, portfolioId);
  const updateViewMutation = useUpdateProjectView();
  const deleteViewMutation = useDeleteProjectView();
  const setDefaultMutation = useSetDefaultView();
  
  const { data: systemViews = [] } = useQuery<SystemProjectView[]>({
    queryKey: ['/api/organizations', organizationId, 'system-project-views', mode, { portfolioId }],
    queryFn: async () => {
      const params = new URLSearchParams({ mode });
      if (portfolioId !== null) params.set('portfolioId', String(portfolioId));
      const res = await fetch(`/api/organizations/${organizationId}/system-project-views?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!organizationId,
  });

  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [activeSystemViewId, setActiveSystemViewId] = useState<number | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [columnChooserOpen, setColumnChooserOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [renameViewName, setRenameViewName] = useState("");
  const [viewToRename, setViewToRename] = useState<ProjectView | null>(null);
  const [viewToDelete, setViewToDelete] = useState<ProjectView | null>(null);
  const [columnSearch, setColumnSearch] = useState("");
  const [tempVisibleColumns, setTempVisibleColumns] = useState<string[]>([]);
  const [hasAppliedDefault, setHasAppliedDefault] = useState(false);

  const lastViewedKey = `views:last:${organizationId ?? 'na'}:${mode}:${portfolioId ?? 'global'}`;

  // Apply default view (or last-selected view) for the current scope on mount
  useEffect(() => {
    if (hasAppliedDefault || !organizationId || isLoading) return;
    if (activeViewId !== null || activeSystemViewId !== null) {
      setHasAppliedDefault(true);
      return;
    }
    let lastId: number | null = null;
    try {
      const raw = localStorage.getItem(lastViewedKey);
      if (raw) lastId = parseInt(raw, 10);
    } catch {}
    const lastView = lastId !== null ? views.find(v => v.id === lastId) : undefined;
    const defaultView = views.find(v => v.isDefault);
    const target = lastView || defaultView;
    if (target) {
      setActiveViewId(target.id);
      setActiveSystemViewId(null);
      onApplyView({
        visibleColumns: target.visibleColumns,
        columnOrder: target.columnOrder || target.visibleColumns,
      });
      setHasAppliedDefault(true);
    } else if (views.length > 0 || !isLoading) {
      setHasAppliedDefault(true);
    }
  }, [views, isLoading, organizationId, hasAppliedDefault, activeViewId, activeSystemViewId, lastViewedKey, onApplyView]);

  // Reset applied state when scope changes (org/mode/portfolio)
  useEffect(() => {
    setHasAppliedDefault(false);
    setActiveViewId(null);
    setActiveSystemViewId(null);
  }, [organizationId, mode, portfolioId]);

  // Persist last-selected view per scope
  useEffect(() => {
    if (!organizationId) return;
    try {
      if (activeViewId !== null) localStorage.setItem(lastViewedKey, String(activeViewId));
      else localStorage.removeItem(lastViewedKey);
    } catch {}
  }, [activeViewId, lastViewedKey, organizationId]);

  const activeView = useMemo(() => {
    if (activeViewId === null) return null;
    return views.find(v => v.id === activeViewId) || null;
  }, [activeViewId, views]);

  const activeSystemView = useMemo(() => {
    if (activeSystemViewId === null) return null;
    return systemViews.find(v => v.id === activeSystemViewId) || null;
  }, [activeSystemViewId, systemViews]);

  const hasUnsavedChanges = useMemo(() => {
    if (activeSystemView) {
      const savedColumns = [...(activeSystemView.visibleColumns || [])].sort();
      const currentColumns = [...visibleColumns].sort();
      const columnsMatch = JSON.stringify(savedColumns) === JSON.stringify(currentColumns);
      const savedOrder = activeSystemView.columnOrder || activeSystemView.visibleColumns || [];
      const orderMatch = JSON.stringify(savedOrder) === JSON.stringify(columnOrder);
      return !columnsMatch || !orderMatch;
    }
    if (!activeView) {
      const columnsMatch = JSON.stringify([...visibleColumns].sort()) === JSON.stringify([...defaultColumns].sort());
      const orderMatch = JSON.stringify(columnOrder) === JSON.stringify(defaultColumnOrder);
      return !columnsMatch || !orderMatch;
    }
    const savedColumns = [...(activeView.visibleColumns || [])].sort();
    const currentColumns = [...visibleColumns].sort();
    const columnsMatch = JSON.stringify(savedColumns) === JSON.stringify(currentColumns);
    const savedOrder = activeView.columnOrder || activeView.visibleColumns || [];
    const orderMatch = JSON.stringify(savedOrder) === JSON.stringify(columnOrder);
    return !columnsMatch || !orderMatch;
  }, [activeView, activeSystemView, visibleColumns, columnOrder, defaultColumns, defaultColumnOrder]);

  const filteredColumns = useMemo(() => {
    if (!columnSearch.trim()) return allColumns;
    return allColumns.filter(c => 
      normalizeSearch(c.label).includes(normalizeSearch(columnSearch))
    );
  }, [allColumns, columnSearch]);

  const handleSelectView = (view: ProjectView | null) => {
    setActiveSystemViewId(null);
    if (view === null) {
      setActiveViewId(null);
      onApplyView({ visibleColumns: defaultColumns, columnOrder: defaultColumnOrder });
    } else {
      setActiveViewId(view.id);
      onApplyView({
        visibleColumns: view.visibleColumns,
        columnOrder: view.columnOrder || view.visibleColumns,
      });
    }
  };

  const handleSelectSystemView = (view: SystemProjectView) => {
    setActiveViewId(null);
    setActiveSystemViewId(view.id);
    onApplyView({
      visibleColumns: view.visibleColumns,
      columnOrder: view.columnOrder || view.visibleColumns,
    });
  };

  const handleSaveNewView = async () => {
    if (!newViewName.trim()) {
      toast({ title: "Error", description: "Please enter a view name", variant: "destructive" });
      return;
    }

    try {
      const newView = await createViewMutation.mutateAsync({
        mode,
        name: newViewName.trim(),
        visibleColumns,
        columnOrder,
      });
      setActiveViewId(newView.id);
      setSaveDialogOpen(false);
      setSaveAsDialogOpen(false);
      setNewViewName("");
      toast({ title: "View saved", description: `"${newViewName}" has been created` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save view", variant: "destructive" });
    }
  };

  const handleUpdateCurrentView = async () => {
    if (!activeView || !organizationId) return;

    try {
      await updateViewMutation.mutateAsync({
        viewId: activeView.id,
        organizationId,
        mode,
        portfolioId,
        visibleColumns,
        columnOrder,
      });
      toast({ title: "View updated", description: `"${activeView.name}" has been updated` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update view", variant: "destructive" });
    }
  };

  const handleRenameView = async () => {
    if (!viewToRename || !renameViewName.trim() || !organizationId) return;

    try {
      await updateViewMutation.mutateAsync({
        viewId: viewToRename.id,
        organizationId,
        mode,
        portfolioId,
        name: renameViewName.trim(),
      });
      setRenameDialogOpen(false);
      setViewToRename(null);
      setRenameViewName("");
      toast({ title: "View renamed", description: `View has been renamed to "${renameViewName}"` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to rename view", variant: "destructive" });
    }
  };

  const handleDeleteView = async () => {
    if (!viewToDelete || !organizationId) return;

    try {
      await deleteViewMutation.mutateAsync({
        viewId: viewToDelete.id,
        organizationId,
        mode,
        portfolioId,
      });
      if (activeViewId === viewToDelete.id) {
        setActiveViewId(null);
        onApplyView({ visibleColumns: defaultColumns, columnOrder: defaultColumnOrder });
      }
      setDeleteDialogOpen(false);
      setViewToDelete(null);
      toast({ title: "View deleted", description: `"${viewToDelete.name}" has been deleted` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to delete view", variant: "destructive" });
    }
  };

  const handleSetDefault = async (view: ProjectView) => {
    if (!organizationId) return;

    try {
      await setDefaultMutation.mutateAsync({
        viewId: view.id,
        organizationId,
        mode,
        portfolioId,
      });
      toast({ title: "Default view set", description: `"${view.name}" is now your default view` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to set default view", variant: "destructive" });
    }
  };

  const openColumnChooser = () => {
    setTempVisibleColumns([...visibleColumns]);
    setColumnSearch("");
    setColumnChooserOpen(true);
  };

  const toggleTempColumn = (columnId: string) => {
    setTempVisibleColumns(prev => 
      prev.includes(columnId) 
        ? prev.filter(c => c !== columnId)
        : [...prev, columnId]
    );
  };

  const applyColumnSelection = () => {
    onApplyView({ visibleColumns: tempVisibleColumns, columnOrder });
    setColumnChooserOpen(false);
  };

  const displayName = activeSystemView?.name || activeView?.name || "Default View";
  const isSystemViewActive = activeSystemViewId !== null;

  return (
    <>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-views-dropdown">
              <span className="flex items-center gap-2">
                {isSystemViewActive && <Building2 className="h-3.5 w-3.5 text-primary/70" />}
                {displayName}
                {isSystemViewActive && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-primary/10 text-primary/80 border-0">
                    Org
                  </Badge>
                )}
                {hasUnsavedChanges && (
                  <Badge variant="outline" className="text-xs px-1 py-0 h-4 bg-amber-50 text-amber-600 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                    Modified
                  </Badge>
                )}
              </span>
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {onFilterViewChange && (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Quick Filters</DropdownMenuLabel>
                {FILTER_VIEW_OPTIONS.map(option => {
                  const OptionIcon = option.icon;
                  const isSelected = filterView === option.id;
                  return (
                    <DropdownMenuItem
                      key={option.id}
                      onClick={() => onFilterViewChange(option.id)}
                      data-testid={`filter-view-option-${option.id}`}
                      className="flex items-center justify-between"
                    >
                      <span className={cn("flex items-center gap-2", isSelected && "font-medium")}>
                        <OptionIcon className="h-4 w-4" />
                        {option.label}
                      </span>
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Column Views</DropdownMenuLabel>
              </>
            )}
            <DropdownMenuItem
              onClick={() => handleSelectView(null)}
              data-testid="view-option-default"
            >
              <span className={cn("flex-1", !activeViewId && !activeSystemViewId && "font-medium")}>
                Default View
              </span>
              {!activeViewId && !activeSystemViewId && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
            
            {systemViews.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" />
                  Organization Views
                </DropdownMenuLabel>
                {systemViews.map(view => (
                  <DropdownMenuItem
                    key={`system-${view.id}`}
                    onClick={() => handleSelectSystemView(view)}
                    data-testid={`system-view-option-${view.id}`}
                    className="flex items-center justify-between"
                    title={view.description || "Organization-wide view available to all members"}
                  >
                    <span className={cn("flex-1 flex items-center gap-2", activeSystemViewId === view.id && "font-medium")}>
                      <Building2 className="h-3.5 w-3.5 text-primary/70" />
                      {view.name}
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-primary/10 text-primary/80 border-0">
                        Org
                      </Badge>
                    </span>
                    {activeSystemViewId === view.id && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </>
            )}
            
            {views.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
                  <User className="h-3 w-3" />
                  My Views
                </DropdownMenuLabel>
              </>
            )}
            
            {views.map(view => (
              <DropdownMenuItem
                key={view.id}
                onClick={() => handleSelectView(view)}
                data-testid={`view-option-${view.id}`}
                className="flex items-center justify-between"
              >
                <span className={cn("flex-1 flex items-center gap-2", activeViewId === view.id && "font-medium")}>
                  {view.name}
                  {view.isDefault && <Star className="h-3 w-3 text-amber-500" />}
                </span>
                {activeViewId === view.id && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem onClick={() => { setNewViewName(""); setSaveDialogOpen(true); }} data-testid="button-new-view">
              <Plus className="h-4 w-4 mr-2" />
              New View
            </DropdownMenuItem>
            
            {activeView && !activeView.isSystem && (
              <>
                {hasUnsavedChanges && (
                  <DropdownMenuItem onClick={handleUpdateCurrentView} data-testid="button-save-view">
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => { setNewViewName(""); setSaveAsDialogOpen(true); }} data-testid="button-save-as-view">
                  <Save className="h-4 w-4 mr-2" />
                  Save As...
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => { setViewToRename(activeView); setRenameViewName(activeView.name); setRenameDialogOpen(true); }}
                  data-testid="button-rename-view"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleSetDefault(activeView)}
                  data-testid="button-set-default-view"
                  disabled={activeView.isDefault === true}
                >
                  <Star className="h-4 w-4 mr-2" />
                  Set as Default
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => { setViewToDelete(activeView); setDeleteDialogOpen(true); }}
                  className="text-destructive focus:text-destructive"
                  data-testid="button-delete-view"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
            
            {!activeView && !activeSystemView && hasUnsavedChanges && (
              <DropdownMenuItem onClick={() => { setNewViewName(""); setSaveDialogOpen(true); }} data-testid="button-save-current-as-view">
                <Save className="h-4 w-4 mr-2" />
                Save Current as View
              </DropdownMenuItem>
            )}
            
            {activeSystemView && hasUnsavedChanges && (
              <DropdownMenuItem onClick={() => { setNewViewName(""); setSaveDialogOpen(true); }} data-testid="button-save-system-view-as-personal">
                <Save className="h-4 w-4 mr-2" />
                Save as My View
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {hasUnsavedChanges && (
          <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400" title={activeSystemView ? "System views are read-only. Save as personal view to keep changes." : "View has unsaved changes"}>
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs">{activeSystemView ? "Modified" : "Unsaved"}</span>
          </div>
        )}
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save New View</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="viewName">View Name</Label>
              <Input
                id="viewName"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="Enter view name"
                data-testid="input-view-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveNewView} 
              disabled={!newViewName.trim() || createViewMutation.isPending}
              data-testid="button-confirm-save-view"
            >
              {createViewMutation.isPending ? "Saving..." : "Save View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saveAsDialogOpen} onOpenChange={setSaveAsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save As New View</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="saveAsName">View Name</Label>
              <Input
                id="saveAsName"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="Enter view name"
                data-testid="input-save-as-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveNewView} 
              disabled={!newViewName.trim() || createViewMutation.isPending}
              data-testid="button-confirm-save-as"
            >
              {createViewMutation.isPending ? "Saving..." : "Save View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename View</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="renameName">View Name</Label>
              <Input
                id="renameName"
                value={renameViewName}
                onChange={(e) => setRenameViewName(e.target.value)}
                placeholder="Enter new name"
                data-testid="input-rename-view"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleRenameView} 
              disabled={!renameViewName.trim() || updateViewMutation.isPending}
              data-testid="button-confirm-rename"
            >
              {updateViewMutation.isPending ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete View</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{viewToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteView}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteViewMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={columnChooserOpen} onOpenChange={setColumnChooserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose Columns</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search columns..."
                value={columnSearch}
                onChange={(e) => setColumnSearch(e.target.value)}
                className="pl-9"
                data-testid="input-column-search"
              />
            </div>
            <ScrollArea className="h-[300px]">
              <div className="space-y-1">
                {filteredColumns.map(column => (
                  <div
                    key={column.id}
                    className="flex items-center gap-2 py-2 px-2 rounded hover:bg-muted cursor-pointer"
                    onClick={() => toggleTempColumn(column.id)}
                    data-testid={`column-checkbox-${column.id}`}
                  >
                    <Checkbox 
                      checked={tempVisibleColumns.includes(column.id)}
                      onCheckedChange={() => toggleTempColumn(column.id)}
                    />
                    <span className="text-sm">{column.label}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setColumnChooserOpen(false)}>Cancel</Button>
            <Button onClick={applyColumnSelection} data-testid="button-apply-columns">
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
