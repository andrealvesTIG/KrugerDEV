import { useState } from "react";
import { Link } from "wouter";
import { Calendar as CalendarIcon, Plus, Star, Trash2 } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import {
  useCalendars,
  useCreateCalendar,
  useDeleteCalendar,
  useUpdateCalendar,
} from "@/hooks/use-calendars";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default function Calendars() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { toast } = useToast();
  const { data: calendars = [], isLoading } = useCalendars(orgId);
  const createCal = useCreateCalendar(orgId);
  const deleteCal = useDeleteCalendar(orgId);
  const updateCal = useUpdateCalendar(orgId);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  function reset() { setName(""); setDescription(""); setIsDefault(false); }

  async function onCreate() {
    if (!orgId || !name.trim()) return;
    try {
      await createCal.mutateAsync({ organizationId: orgId, name: name.trim(), description: description.trim() || undefined, isDefault, isActive: true } as any);
      toast({ title: "Calendar created" });
      setCreateOpen(false); reset();
    } catch (err: any) {
      toast({ title: "Failed to create", description: err?.message, variant: "destructive" });
    }
  }

  async function onMakeDefault(id: number) {
    try {
      await updateCal.mutateAsync({ id, updates: { isDefault: true } });
      toast({ title: "Default calendar updated" });
    } catch (err: any) {
      toast({ title: "Failed to update default", description: err?.message, variant: "destructive" });
    }
  }

  async function onDelete(id: number) {
    try {
      await deleteCal.mutateAsync(id);
      toast({ title: "Calendar deleted" });
    } catch (err: any) {
      toast({ title: "Cannot delete calendar", description: err?.message, variant: "destructive" });
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-calendars">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CalendarIcon className="h-6 w-6" /> Enterprise Calendars
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define base calendars, working hours, holidays, and recurring exceptions used by projects and resources.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-new-calendar">
          <Plus className="h-4 w-4 mr-2" /> New Calendar
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Calendars</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : calendars.length === 0 ? (
            <div className="text-sm text-muted-foreground">No calendars yet. Create one to set the org's working time.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calendars.map((c) => (
                  <TableRow key={c.id} data-testid={`row-calendar-${c.id}`}>
                    <TableCell>
                      <Link href={`/calendars/${c.id}`} className="font-medium text-primary hover:underline">
                        {c.name}
                      </Link>
                      {c.isDefault && <Badge variant="secondary" className="ml-2"><Star className="h-3 w-3 mr-1" />Default</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.description || "—"}</TableCell>
                    <TableCell>
                      {c.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {!c.isDefault && (
                        <Button size="sm" variant="ghost" onClick={() => onMakeDefault(c.id)} data-testid={`button-make-default-${c.id}`}>
                          <Star className="h-4 w-4 mr-1" /> Set default
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(c.id)} data-testid={`button-delete-${c.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Calendar</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cal-name">Name</Label>
              <Input id="cal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard" data-testid="input-calendar-name" />
            </div>
            <div>
              <Label htmlFor="cal-desc">Description</Label>
              <Textarea id="cal-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="cal-default" checked={isDefault} onCheckedChange={setIsDefault} />
              <Label htmlFor="cal-default">Make this the organization default</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={onCreate} disabled={!name.trim() || createCal.isPending} data-testid="button-create-calendar">
              {createCal.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete the calendar. It must not be the org default and must not be assigned to any project or resource.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && onDelete(confirmDelete)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
