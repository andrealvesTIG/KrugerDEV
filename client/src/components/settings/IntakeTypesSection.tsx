import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useIntakeTypes, useCreateIntakeType, useUpdateIntakeType, useDeleteIntakeType,
} from "@/hooks/use-intake-types";
import type { IntakeType } from "@shared/schema";

export function IntakeTypesSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const { data: types = [], isLoading } = useIntakeTypes(organizationId);
  const createMut = useCreateIntakeType();
  const updateMut = useUpdateIntakeType();
  const deleteMut = useDeleteIntakeType();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IntakeType | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<IntakeType | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setDialogOpen(true);
  };

  const openEdit = (t: IntakeType) => {
    setEditing(t);
    setName(t.name);
    setDescription(t.description || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Validation Error", description: "Name is required", variant: "destructive" });
      return;
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, name: name.trim(), description: description.trim() || null as any });
      } else {
        await createMut.mutateAsync({ organizationId, name: name.trim(), description: description.trim() || undefined, behavior: "standard" });
      }
      toast({ title: "Saved", description: editing ? "Intake type updated" : "Intake type created" });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteMut.mutateAsync(confirmDelete.id);
      toast({ title: "Deleted", description: "Intake type removed" });
      setConfirmDelete(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Intake Types</CardTitle>
          <CardDescription>
            Categories users pick from when creating a new intake. The "Default" and "Power BI Request" types are built-in and cannot be deleted. Selecting Power BI Request takes the user to the Power BI agent.
          </CardDescription>
        </div>
        <Button onClick={openCreate} data-testid="button-add-intake-type">
          <Plus className="h-4 w-4 mr-2" />
          New Type
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-2">
            {types.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
                data-testid={`row-intake-type-${t.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{t.name}</span>
                    {t.isSystem && (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" />
                        Built-in
                      </Badge>
                    )}
                    {t.behavior === "powerbi_redirect" && (
                      <Badge variant="outline">Opens Power BI agent</Badge>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-sm text-muted-foreground mt-1 truncate">{t.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(t)}
                    data-testid={`button-edit-intake-type-${t.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={t.isSystem}
                    onClick={() => setConfirmDelete(t)}
                    data-testid={`button-delete-intake-type-${t.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Intake Type" : "New Intake Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="intake-type-name">Name</Label>
              <Input
                id="intake-type-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Infrastructure Request"
                data-testid="input-intake-type-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-type-description">Description</Label>
              <Textarea
                id="intake-type-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What kind of request fits this type?"
                data-testid="input-intake-type-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} data-testid="button-save-intake-type">
              {editing ? "Save Changes" : "Create Type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete intake type?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" will be removed. Existing intakes that used this type will keep working but will no longer reference it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
