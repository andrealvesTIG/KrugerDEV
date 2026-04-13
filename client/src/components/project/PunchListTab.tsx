import { useState, useMemo, useRef } from "react";
import {
  usePunchItems,
  usePunchItemSummary,
  usePunchItem,
  useCreatePunchItem,
  useUpdatePunchItem,
  useDeletePunchItem,
  useAddPunchItemPhoto,
  useDeletePunchItemPhoto,
} from "@/hooks/use-punch-list";
import { useUpload } from "@/hooks/use-upload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import {
  Plus, Trash2, Pencil, Eye, Camera, X, Loader2,
  CheckCircle2, Circle, Clock, AlertTriangle,
  MapPin, Tag, User, Calendar, ChevronRight, Image,
  BarChart3, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PunchItem, PunchItemPhoto } from "@shared/schema";

const STATUSES = ["Open", "In Progress", "Ready for Review", "Closed"] as const;
const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
const CATEGORIES = [
  "Architectural", "Electrical", "Mechanical", "Plumbing",
  "Structural", "Fire Protection", "HVAC", "Landscaping",
  "Painting", "Flooring", "Roofing", "General",
];

const statusConfig: Record<string, { icon: typeof Circle; color: string; bg: string }> = {
  "Open": { icon: Circle, color: "text-red-600", bg: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  "In Progress": { icon: Clock, color: "text-blue-600", bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  "Ready for Review": { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  "Closed": { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
};

const priorityConfig: Record<string, string> = {
  "Low": "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
  "Medium": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "High": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "Critical": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

interface PunchItemFormData {
  title: string;
  description: string;
  location: string;
  category: string;
  priority: string;
  status: string;
  assignedTo: string;
  assignedToName: string;
  dueDate: string;
}

const emptyForm: PunchItemFormData = {
  title: "",
  description: "",
  location: "",
  category: "",
  priority: "Medium",
  status: "Open",
  assignedTo: "",
  assignedToName: "",
  dueDate: "",
};

export default function PunchListTab({ projectId }: { projectId: number }) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const { data: items = [], isLoading } = usePunchItems(projectId, filters);
  const { data: summary } = usePunchItemSummary(projectId);
  const createMutation = useCreatePunchItem(projectId);
  const updateMutation = useUpdatePunchItem(projectId);
  const deleteMutation = useDeletePunchItem(projectId);
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PunchItem | null>(null);
  const [viewingItemId, setViewingItemId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [formData, setFormData] = useState<PunchItemFormData>(emptyForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSummary, setShowSummary] = useState(true);

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.number.toLowerCase().includes(q) ||
        item.location?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q) ||
        item.assignedToName?.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const openCreate = () => {
    setFormData(emptyForm);
    setEditingItem(null);
    setIsCreateOpen(true);
  };

  const openEdit = (item: PunchItem) => {
    setFormData({
      title: item.title,
      description: item.description ?? "",
      location: item.location ?? "",
      category: item.category ?? "",
      priority: item.priority,
      status: item.status,
      assignedTo: item.assignedTo ?? "",
      assignedToName: item.assignedToName ?? "",
      dueDate: item.dueDate ?? "",
    });
    setEditingItem(item);
    setIsCreateOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    const payload: Record<string, unknown> = {
      title: formData.title.trim(),
      description: formData.description || null,
      location: formData.location || null,
      category: formData.category || null,
      priority: formData.priority,
      status: formData.status,
      assignedTo: formData.assignedTo || null,
      assignedToName: formData.assignedToName || null,
      dueDate: formData.dueDate || null,
    };

    if (editingItem) {
      updateMutation.mutate(
        { id: editingItem.id, ...payload },
        {
          onSuccess: () => {
            toast({ title: "Punch item updated" });
            setIsCreateOpen(false);
            setEditingItem(null);
          },
          onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast({ title: "Punch item created" });
          setIsCreateOpen(false);
        },
        onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Punch item deleted" });
        setDeleteConfirmId(null);
      },
      onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const updateFilter = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value === "all" || !value) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showSummary && summary && summary.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{summary.total}</div>
              <div className="text-xs text-muted-foreground">Total Items</div>
            </CardContent>
          </Card>
          {STATUSES.map((status) => {
            const config = statusConfig[status];
            const count = summary.statusCounts[status] ?? 0;
            return (
              <Card key={status}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <config.icon className={cn("h-4 w-4", config.color)} />
                    <span className="text-2xl font-bold">{count}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{status}</div>
                </CardContent>
              </Card>
            );
          })}
          <Card className="col-span-2 md:col-span-5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Completion Progress</span>
                <span className="text-sm text-muted-foreground">{summary.percentComplete}%</span>
              </div>
              <Progress value={summary.percentComplete} className="h-2" />
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Search punch items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-56"
          />
          <Select value={filters.status || "all"} onValueChange={(v) => updateFilter("status", v)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.priority || "all"} onValueChange={(v) => updateFilter("priority", v)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSummary(!showSummary)}
          >
            <BarChart3 className="h-4 w-4 mr-1" />
            {showSummary ? "Hide" : "Show"} Summary
          </Button>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> New Item
        </Button>
      </div>

      {filteredItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-lg font-medium text-muted-foreground">No punch items found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {Object.keys(filters).length > 0 || searchQuery
                ? "Try adjusting your filters or search query."
                : "Create your first punch list item to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => {
            const config = statusConfig[item.status] || statusConfig["Open"];
            const StatusIcon = config.icon;
            return (
              <Card
                key={item.id}
                className="hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => setViewingItemId(item.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <StatusIcon className={cn("h-5 w-5 mt-0.5 shrink-0", config.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">{item.number}</span>
                        <h4 className="font-medium truncate">{item.title}</h4>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {item.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {item.location}
                          </span>
                        )}
                        {item.category && (
                          <span className="flex items-center gap-1">
                            <Tag className="h-3 w-3" /> {item.category}
                          </span>
                        )}
                        {item.assignedToName && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {item.assignedToName}
                          </span>
                        )}
                        {item.dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {format(parseISO(item.dueDate), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={cn("text-xs", priorityConfig[item.priority] || "")} variant="secondary">
                        {item.priority}
                      </Badge>
                      <Badge className={cn("text-xs", config.bg)} variant="secondary">
                        {item.status}
                      </Badge>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Punch Item" : "New Punch Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the punch list item details." : "Add a new item to the punch list."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter item title"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the issue or deficiency"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Location</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Floor 3, Room 301"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={formData.category || "none"}
                  onValueChange={(v) => setFormData({ ...formData, category: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Assigned To (Name)</Label>
                <Input
                  value={formData.assignedToName}
                  onChange={(e) => setFormData({ ...formData, assignedToName: e.target.value })}
                  placeholder="Responsible party name"
                />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Punch Item</DialogTitle>
            <DialogDescription>Are you sure you want to delete this punch item? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewingItemId && (
        <PunchItemDetailDialog
          projectId={projectId}
          punchItemId={viewingItemId}
          onClose={() => setViewingItemId(null)}
          onEdit={(item) => {
            setViewingItemId(null);
            openEdit(item);
          }}
        />
      )}
    </div>
  );
}

function PunchItemDetailDialog({
  projectId,
  punchItemId,
  onClose,
  onEdit,
}: {
  projectId: number;
  punchItemId: number;
  onClose: () => void;
  onEdit: (item: PunchItem) => void;
}) {
  const { data: item, isLoading } = usePunchItem(projectId, punchItemId);
  const addPhotoMutation = useAddPunchItemPhoto(projectId, punchItemId);
  const deletePhotoMutation = useDeletePunchItemPhoto(projectId, punchItemId);
  const updateMutation = useUpdatePunchItem(projectId);
  const { uploadFile, isUploading } = useUpload();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoType, setPhotoType] = useState<string>("general");

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Only image files are allowed", variant: "destructive" });
      return;
    }

    const result = await uploadFile(file);
    if (result) {
      addPhotoMutation.mutate(
        {
          fileUrl: result.objectPath,
          fileName: file.name,
          fileSize: file.size,
          photoType,
          caption: "",
        },
        {
          onSuccess: () => toast({ title: "Photo added" }),
          onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
        }
      );
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeletePhoto = (photoId: number) => {
    deletePhotoMutation.mutate(photoId, {
      onSuccess: () => toast({ title: "Photo removed" }),
      onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleStatusChange = (newStatus: string) => {
    if (!item) return;
    updateMutation.mutate(
      { id: item.id, status: newStatus },
      {
        onSuccess: () => toast({ title: `Status updated to ${newStatus}` }),
        onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  if (isLoading || !item) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const config = statusConfig[item.status] || statusConfig["Open"];
  const StatusIcon = config.icon;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">{item.number}</span>
            <DialogTitle className="text-lg">{item.title}</DialogTitle>
          </div>
          <DialogDescription>Punch list item details and photos</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn("text-xs", config.bg)} variant="secondary">
              <StatusIcon className="h-3 w-3 mr-1" />
              {item.status}
            </Badge>
            <Badge className={cn("text-xs", priorityConfig[item.priority] || "")} variant="secondary">
              {item.priority}
            </Badge>
            {item.category && (
              <Badge variant="outline" className="text-xs">
                <Tag className="h-3 w-3 mr-1" /> {item.category}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <Button
                key={status}
                variant={item.status === status ? "default" : "outline"}
                size="sm"
                onClick={() => handleStatusChange(status)}
                disabled={item.status === status || updateMutation.isPending}
              >
                {status}
              </Button>
            ))}
          </div>

          {item.description && (
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <p className="text-sm mt-1">{item.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            {item.location && (
              <div>
                <Label className="text-xs text-muted-foreground">Location</Label>
                <p className="flex items-center gap-1 mt-1"><MapPin className="h-3.5 w-3.5" /> {item.location}</p>
              </div>
            )}
            {item.assignedToName && (
              <div>
                <Label className="text-xs text-muted-foreground">Assigned To</Label>
                <p className="flex items-center gap-1 mt-1"><User className="h-3.5 w-3.5" /> {item.assignedToName}</p>
              </div>
            )}
            {item.dueDate && (
              <div>
                <Label className="text-xs text-muted-foreground">Due Date</Label>
                <p className="flex items-center gap-1 mt-1"><Calendar className="h-3.5 w-3.5" /> {format(parseISO(item.dueDate), "MMM d, yyyy")}</p>
              </div>
            )}
            {item.createdByName && (
              <div>
                <Label className="text-xs text-muted-foreground">Created By</Label>
                <p className="mt-1">{item.createdByName}</p>
              </div>
            )}
            {item.createdAt && (
              <div>
                <Label className="text-xs text-muted-foreground">Created</Label>
                <p className="mt-1">{format(new Date(item.createdAt), "MMM d, yyyy h:mm a")}</p>
              </div>
            )}
            {item.closedAt && (
              <div>
                <Label className="text-xs text-muted-foreground">Closed</Label>
                <p className="mt-1">{format(new Date(item.closedAt), "MMM d, yyyy h:mm a")}</p>
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium flex items-center gap-1">
                <Image className="h-4 w-4" /> Photos ({item.photos?.length ?? 0})
              </h4>
              <div className="flex items-center gap-2">
                <Select value={photoType} onValueChange={setPhotoType}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="before">Before</SelectItem>
                    <SelectItem value="after">After</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || addPhotoMutation.isPending}
                >
                  {isUploading || addPhotoMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5 mr-1" />
                  )}
                  Add Photo
                </Button>
              </div>
            </div>

            {item.photos && item.photos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {item.photos.map((photo: PunchItemPhoto) => (
                  <div key={photo.id} className="relative group rounded-lg overflow-hidden border">
                    <img
                      src={`/api/object-storage/${photo.fileUrl}`}
                      alt={photo.fileName || "Punch item photo"}
                      className="w-full h-32 object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDeletePhoto(photo.id)}
                        disabled={deletePhotoMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {photo.photoType && photo.photoType !== "general" && (
                      <Badge className="absolute top-1 left-1 text-[10px]" variant="secondary">
                        {photo.photoType}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg bg-muted/30">
                No photos attached yet. Click "Add Photo" to upload.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onEdit(item)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
