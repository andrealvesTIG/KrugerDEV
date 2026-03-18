import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Columns, Plus, Pencil, LayoutGrid, Calendar } from "lucide-react";

const ALL_GRID_COLUMNS = [
  { id: "name", label: "Name" },
  { id: "projectCode", label: "Project Code" },
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "health", label: "Health" },
  { id: "billableStatus", label: "Billable Status" },
  { id: "portfolio", label: "Portfolio" },
  { id: "startDate", label: "Start Date" },
  { id: "endDate", label: "End Date" },
  { id: "baselineStartDate", label: "Baseline Start" },
  { id: "baselineEndDate", label: "Baseline End" },
  { id: "actualStartDate", label: "Actual Start" },
  { id: "actualEndDate", label: "Actual End" },
  { id: "budget", label: "Budget" },
  { id: "actualCost", label: "Actual Cost" },
  { id: "forecastCost", label: "Forecast Cost" },
  { id: "costVariance", label: "Cost Variance" },
  { id: "scheduleVariance", label: "Schedule Variance" },
  { id: "completion", label: "Completion %" },
  { id: "projectType", label: "Project Type" },
  { id: "methodology", label: "Methodology" },
  { id: "department", label: "Department" },
  { id: "category", label: "Category" },
  { id: "businessValue", label: "Business Value" },
  { id: "riskLevel", label: "Risk Level" },
  { id: "source", label: "Source" },
  { id: "owner", label: "Manager" },
  { id: "createdAt", label: "Created Date" },
  { id: "description", label: "Description" },
];

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
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export function SystemViewsSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingView, setEditingView] = useState<SystemProjectView | null>(null);
  const [viewToDelete, setViewToDelete] = useState<SystemProjectView | null>(null);
  
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formMode, setFormMode] = useState<"grid" | "gantt">("grid");
  const [formVisibleColumns, setFormVisibleColumns] = useState<string[]>(["name", "status", "priority", "health", "portfolio", "startDate", "endDate", "completion"]);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formDisplayOrder, setFormDisplayOrder] = useState(0);

  const { data: systemViews = [], isLoading } = useQuery<SystemProjectView[]>({
    queryKey: ['/api/organizations', organizationId, 'system-project-views', 'all'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { mode: string; name: string; description: string | null; visibleColumns: string[]; isActive: boolean; displayOrder: number }) => {
      return await apiRequest('POST', `/api/organizations/${organizationId}/system-project-views`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'system-project-views'] });
      toast({ title: "System View Created", description: "The new system view has been created successfully." });
      resetForm();
      setShowCreateDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<SystemProjectView> }) => {
      return await apiRequest('PATCH', `/api/system-project-views/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'system-project-views'] });
      toast({ title: "System View Updated", description: "The system view has been updated successfully." });
      resetForm();
      setEditingView(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/system-project-views/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'system-project-views'] });
      toast({ title: "System View Deleted", description: "The system view has been deleted." });
      setViewToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormMode("grid");
    setFormVisibleColumns(["name", "status", "priority", "health", "portfolio", "startDate", "endDate", "completion"]);
    setFormIsActive(true);
    setFormDisplayOrder(0);
  };

  const openEditDialog = (view: SystemProjectView) => {
    setEditingView(view);
    setFormName(view.name);
    setFormDescription(view.description || "");
    setFormMode(view.mode as "grid" | "gantt");
    setFormVisibleColumns(view.visibleColumns);
    setFormIsActive(view.isActive);
    setFormDisplayOrder(view.displayOrder);
  };

  const handleCreate = () => {
    if (!formName.trim()) {
      toast({ title: "Error", description: "View name is required", variant: "destructive" });
      return;
    }
    if (formVisibleColumns.length === 0) {
      toast({ title: "Error", description: "At least one column must be selected", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      mode: formMode,
      name: formName.trim(),
      description: formDescription.trim() || null,
      visibleColumns: formVisibleColumns,
      isActive: formIsActive,
      displayOrder: formDisplayOrder,
    });
  };

  const handleUpdate = () => {
    if (!editingView) return;
    if (!formName.trim()) {
      toast({ title: "Error", description: "View name is required", variant: "destructive" });
      return;
    }
    if (formVisibleColumns.length === 0) {
      toast({ title: "Error", description: "At least one column must be selected", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editingView.id,
      data: {
        name: formName.trim(),
        description: formDescription.trim() || null,
        visibleColumns: formVisibleColumns,
        isActive: formIsActive,
        displayOrder: formDisplayOrder,
      }
    });
  };

  const toggleColumn = (columnId: string) => {
    setFormVisibleColumns(prev =>
      prev.includes(columnId)
        ? prev.filter(c => c !== columnId)
        : [...prev, columnId]
    );
  };

  const gridViews = systemViews.filter(v => v.mode === 'grid');
  const ganttViews = systemViews.filter(v => v.mode === 'gantt');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Columns className="h-5 w-5" />
              System Views
            </CardTitle>
            <CardDescription>
              Configure organization-wide views that are available to all members. System views appear in the view selector with a building icon to distinguish them from personal views.
            </CardDescription>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-system-view">
            <Plus className="h-4 w-4 mr-2" />
            Add View
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : systemViews.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Columns className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No system views configured yet.</p>
              <p className="text-sm">Create a system view to provide standardized project views for all organization members.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {gridViews.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4" />
                    Grid Views ({gridViews.length})
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Columns</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gridViews.map(view => (
                        <TableRow key={view.id}>
                          <TableCell className="font-medium">{view.name}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">{view.description || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{view.visibleColumns.length} columns</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={view.isActive ? "default" : "secondary"}>
                              {view.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(view)} data-testid={`button-edit-system-view-${view.id}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setViewToDelete(view)} data-testid={`button-delete-system-view-${view.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {ganttViews.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Gantt Views ({ganttViews.length})
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Columns</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ganttViews.map(view => (
                        <TableRow key={view.id}>
                          <TableCell className="font-medium">{view.name}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">{view.description || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{view.visibleColumns.length} columns</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={view.isActive ? "default" : "secondary"}>
                              {view.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(view)} data-testid={`button-edit-system-view-${view.id}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setViewToDelete(view)} data-testid={`button-delete-system-view-${view.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create System View</DialogTitle>
            <DialogDescription>
              Create a new organization-wide view that will be available to all members.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="view-name">View Name</Label>
                <Input
                  id="view-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Executive Summary"
                  data-testid="input-system-view-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="view-mode">View Mode</Label>
                <Select value={formMode} onValueChange={(val) => setFormMode(val as "grid" | "gantt")}>
                  <SelectTrigger data-testid="select-system-view-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grid">Grid View</SelectItem>
                    <SelectItem value="gantt">Gantt View</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="view-description">Description (optional)</Label>
              <Textarea
                id="view-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Describe what this view is for..."
                rows={2}
                data-testid="input-system-view-description"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="view-active"
                  checked={formIsActive}
                  onCheckedChange={setFormIsActive}
                  data-testid="switch-system-view-active"
                />
                <Label htmlFor="view-active">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="view-order">Display Order:</Label>
                <Input
                  id="view-order"
                  type="number"
                  value={formDisplayOrder}
                  onChange={(e) => setFormDisplayOrder(parseInt(e.target.value) || 0)}
                  className="w-20"
                  data-testid="input-system-view-order"
                />
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Visible Columns ({formVisibleColumns.length} selected)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto p-2 border rounded-md">
                {ALL_GRID_COLUMNS.map(col => (
                  <div key={col.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`col-${col.id}`}
                      checked={formVisibleColumns.includes(col.id)}
                      onCheckedChange={() => toggleColumn(col.id)}
                      data-testid={`checkbox-column-${col.id}`}
                    />
                    <Label htmlFor={`col-${col.id}`} className="text-sm cursor-pointer">{col.label}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-confirm-create-system-view">
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingView} onOpenChange={(open) => { if (!open) { setEditingView(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit System View</DialogTitle>
            <DialogDescription>
              Update this organization-wide view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-view-name">View Name</Label>
                <Input
                  id="edit-view-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Executive Summary"
                  data-testid="input-edit-system-view-name"
                />
              </div>
              <div className="space-y-2">
                <Label>View Mode</Label>
                <Input value={editingView?.mode === 'grid' ? 'Grid View' : 'Gantt View'} disabled />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-view-description">Description (optional)</Label>
              <Textarea
                id="edit-view-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Describe what this view is for..."
                rows={2}
                data-testid="input-edit-system-view-description"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-view-active"
                  checked={formIsActive}
                  onCheckedChange={setFormIsActive}
                  data-testid="switch-edit-system-view-active"
                />
                <Label htmlFor="edit-view-active">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="edit-view-order">Display Order:</Label>
                <Input
                  id="edit-view-order"
                  type="number"
                  value={formDisplayOrder}
                  onChange={(e) => setFormDisplayOrder(parseInt(e.target.value) || 0)}
                  className="w-20"
                  data-testid="input-edit-system-view-order"
                />
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Visible Columns ({formVisibleColumns.length} selected)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto p-2 border rounded-md">
                {ALL_GRID_COLUMNS.map(col => (
                  <div key={col.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`edit-col-${col.id}`}
                      checked={formVisibleColumns.includes(col.id)}
                      onCheckedChange={() => toggleColumn(col.id)}
                      data-testid={`checkbox-edit-column-${col.id}`}
                    />
                    <Label htmlFor={`edit-col-${col.id}`} className="text-sm cursor-pointer">{col.label}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingView(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} data-testid="button-confirm-edit-system-view">
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!viewToDelete} onOpenChange={(open) => { if (!open) setViewToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete System View</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the "{viewToDelete?.name}" view? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => viewToDelete && deleteMutation.mutate(viewToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-system-view"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}