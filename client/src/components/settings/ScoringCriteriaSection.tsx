import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Pencil, Trash2, GripVertical, Target, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useScoringCriteria,
  useCreateScoringCriteria,
  useUpdateScoringCriteria,
  useDeleteScoringCriteria,
} from "@/hooks/use-portfolio-features";

const CATEGORIES = [
  { value: "Strategic", label: "Strategic" },
  { value: "Financial", label: "Financial" },
  { value: "Risk", label: "Risk" },
  { value: "Resource", label: "Resource" },
  { value: "Technical", label: "Technical" },
  { value: "Customer", label: "Customer" },
  { value: "Operational", label: "Operational" },
  { value: "Other", label: "Other" },
];

const CATEGORY_COLORS: Record<string, string> = {
  Strategic: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Financial: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Risk: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Resource: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  Technical: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  Customer: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Operational: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  Other: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

interface CriteriaFormData {
  name: string;
  description: string;
  category: string;
  weight: string;
  minScore: number;
  maxScore: number;
  scoringGuidelines: string;
  isActive: boolean;
}

const emptyForm: CriteriaFormData = {
  name: "",
  description: "",
  category: "Strategic",
  weight: "1",
  minScore: 0,
  maxScore: 10,
  scoringGuidelines: "",
  isActive: true,
};

export function ScoringCriteriaSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const { data: criteria, isLoading } = useScoringCriteria(organizationId);
  const createMutation = useCreateScoringCriteria();
  const updateMutation = useUpdateScoringCriteria();
  const deleteMutation = useDeleteScoringCriteria();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CriteriaFormData>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({
      name: c.name || "",
      description: c.description || "",
      category: c.category || "Other",
      weight: String(c.weight ?? "1"),
      minScore: c.minScore ?? 0,
      maxScore: c.maxScore ?? 10,
      scoringGuidelines: c.scoringGuidelines || "",
      isActive: c.isActive ?? true,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", description: "Please enter a name for this criterion.", variant: "destructive" });
      return;
    }
    const weight = parseFloat(form.weight);
    if (isNaN(weight) || weight < 0) {
      toast({ title: "Invalid weight", description: "Weight must be a positive number.", variant: "destructive" });
      return;
    }
    if (form.minScore >= form.maxScore) {
      toast({ title: "Invalid score range", description: "Min score must be less than max score.", variant: "destructive" });
      return;
    }

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category,
        weight: parseFloat(form.weight) || 1,
        minScore: form.minScore,
        maxScore: form.maxScore,
        scoringGuidelines: form.scoringGuidelines.trim() || null,
        isActive: form.isActive,
      };

      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, organizationId, data: payload });
        toast({ title: "Updated", description: "Scoring criterion updated successfully." });
      } else {
        await createMutation.mutateAsync({ organizationId, data: payload });
        toast({ title: "Created", description: "Scoring criterion created successfully." });
      }
      setDialogOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to save scoring criterion.", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteId, organizationId });
      toast({ title: "Deleted", description: "Scoring criterion removed." });
      setDeleteId(null);
    } catch {
      toast({ title: "Error", description: "Failed to delete scoring criterion.", variant: "destructive" });
    }
  };

  const activeCriteria = (criteria || []).filter((c: any) => c.isActive);
  const inactiveCriteria = (criteria || []).filter((c: any) => !c.isActive);
  const totalWeight = activeCriteria.reduce((sum: number, c: any) => sum + parseFloat(c.weight ?? "1"), 0);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Portfolio Scoring Criteria
              </CardTitle>
              <CardDescription className="mt-1.5">
                Define the criteria used to evaluate and score projects across your portfolios. 
                These criteria apply organization-wide — individual projects are scored against them, 
                and portfolio scores roll up automatically.
              </CardDescription>
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Criterion
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activeCriteria.length === 0 && inactiveCriteria.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Target className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-medium mb-1">No Scoring Criteria Defined</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                Create scoring criteria to evaluate projects across your portfolios. 
                Common categories include Strategic Alignment, Financial Impact, Risk, and Resource requirements.
              </p>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                Create First Criterion
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {activeCriteria.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Info className="h-3.5 w-3.5" />
                  <span>{activeCriteria.length} active {activeCriteria.length === 1 ? 'criterion' : 'criteria'} &middot; Total weight: {totalWeight.toFixed(1)}</span>
                </div>
              )}

              <div className="space-y-2">
                {activeCriteria.map((c: any) => (
                  <CriteriaRow
                    key={c.id}
                    criteria={c}
                    totalWeight={totalWeight}
                    onEdit={() => openEdit(c)}
                    onDelete={() => setDeleteId(c.id)}
                  />
                ))}
              </div>

              {inactiveCriteria.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Inactive Criteria</p>
                    <div className="space-y-2 opacity-60">
                      {inactiveCriteria.map((c: any) => (
                        <CriteriaRow
                          key={c.id}
                          criteria={c}
                          totalWeight={totalWeight}
                          onEdit={() => openEdit(c)}
                          onDelete={() => setDeleteId(c.id)}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Criterion" : "Add Scoring Criterion"}</DialogTitle>
            <DialogDescription>
              {editingId 
                ? "Update the details of this scoring criterion." 
                : "Define a new criterion for evaluating projects across your portfolios."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="criteria-name">Name *</Label>
              <Input
                id="criteria-name"
                placeholder="e.g., Strategic Alignment"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="criteria-description">Description</Label>
              <Textarea
                id="criteria-description"
                placeholder="What does this criterion measure?"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="criteria-weight">Weight</Label>
                <Input
                  id="criteria-weight"
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.weight}
                  onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="criteria-min">Min Score</Label>
                <Input
                  id="criteria-min"
                  type="number"
                  value={form.minScore}
                  onChange={e => setForm(f => ({ ...f, minScore: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="criteria-max">Max Score</Label>
                <Input
                  id="criteria-max"
                  type="number"
                  value={form.maxScore}
                  onChange={e => setForm(f => ({ ...f, maxScore: parseInt(e.target.value) || 10 }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="criteria-guidelines">Scoring Guidelines</Label>
              <Textarea
                id="criteria-guidelines"
                placeholder="Instructions for how to score this criterion (e.g., 0-3 = Low alignment, 4-7 = Moderate, 8-10 = High)"
                value={form.scoringGuidelines}
                onChange={e => setForm(f => ({ ...f, scoringGuidelines: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="criteria-active">Active</Label>
              <Switch
                id="criteria-active"
                checked={form.isActive}
                onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scoring Criterion</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this criterion and all associated project scores. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CriteriaRow({ criteria, totalWeight, onEdit, onDelete }: {
  criteria: any;
  totalWeight: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const weight = parseFloat(criteria.weight ?? "1");
  const pct = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0;
  const categoryColor = CATEGORY_COLORS[criteria.category] || CATEGORY_COLORS.Other;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors group">
      <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm truncate">{criteria.name}</span>
          {criteria.category && (
            <Badge variant="secondary" className={`text-xs ${categoryColor}`}>
              {criteria.category}
            </Badge>
          )}
          {!criteria.isActive && (
            <Badge variant="outline" className="text-xs">Inactive</Badge>
          )}
        </div>
        {criteria.description && (
          <p className="text-xs text-muted-foreground truncate">{criteria.description}</p>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0 text-sm text-muted-foreground">
        <div className="text-right">
          <div className="font-medium text-foreground">{weight}</div>
          <div className="text-xs">{pct}%</div>
        </div>
        <div className="text-right">
          <div className="text-xs">{criteria.minScore}–{criteria.maxScore}</div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
