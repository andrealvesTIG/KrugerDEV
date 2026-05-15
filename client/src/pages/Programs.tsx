import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Search, Layers, ArrowRight, MoreVertical, Trash2, Pencil } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { usePrograms, useCreateProgram, useDeleteProgram, useUpdateProgram } from "@/hooks/use-programs";
import { useProjects } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { normalizeSearch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Program } from "@shared/schema";

const STATUSES = ["Active", "On Hold", "Closed", "Archived"] as const;

type OrgMember = {
  userId: string;
  // The /api/organizations/:id/members endpoint enriches each row with the
  // full user under `.user` (sanitized) — there are no flattened name/email
  // fields on the membership row itself.
  user?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
};

function memberDisplayName(m: OrgMember): string {
  const u = m.user;
  if (!u) return m.userId;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email || m.userId;
}

function useOrgMembers(organizationId?: number) {
  return useQuery<OrgMember[]>({
    queryKey: [`/api/organizations/${organizationId}/members`],
    enabled: !!organizationId,
  });
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  status: z.string().default("Active"),
  description: z.string().optional().nullable(),
  businessCase: z.string().optional().nullable(),
  ownerId: z.string().min(1, "Owner is required"),
  budget: z.string().optional().nullable(),
  benefit: z.string().optional().nullable(),
  roi: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

function ProgramForm({
  defaultValues,
  members,
  submitLabel,
  onSubmit,
  onCancel,
  isPending,
}: {
  defaultValues: Partial<FormValues>;
  members: OrgMember[];
  submitLabel: string;
  onSubmit: (v: FormValues) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      status: "Active",
      description: "",
      businessCase: "",
      ownerId: "",
      budget: "",
      benefit: "",
      roi: "",
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Name *</Label>
          <Input data-testid="input-program-name" {...form.register("name")} />
          {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>}
        </div>
        <div>
          <Label>Status *</Label>
          <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v)}>
            <SelectTrigger data-testid="select-program-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Owner *</Label>
          <Select value={form.watch("ownerId")} onValueChange={(v) => form.setValue("ownerId", v)}>
            <SelectTrigger data-testid="select-program-owner"><SelectValue placeholder="Select owner" /></SelectTrigger>
            <SelectContent>
              {members.map(m => (
                <SelectItem key={m.userId} value={m.userId}>
                  {memberDisplayName(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.ownerId && <p className="text-xs text-destructive mt-1">{form.formState.errors.ownerId.message}</p>}
        </div>
        <div className="col-span-2">
          <Label>Description</Label>
          <Textarea data-testid="input-program-description" rows={2} {...form.register("description")} />
        </div>
        <div className="col-span-2">
          <Label>Business case</Label>
          <Textarea data-testid="input-program-businessCase" rows={2} {...form.register("businessCase")} />
        </div>
        <div>
          <Label>Budget</Label>
          <Input data-testid="input-program-budget" type="number" step="0.01" {...form.register("budget")} />
        </div>
        <div>
          <Label>Benefit</Label>
          <Input data-testid="input-program-benefit" type="number" step="0.01" {...form.register("benefit")} />
        </div>
        <div>
          <Label>ROI</Label>
          <Input data-testid="input-program-roi" type="number" step="0.01" {...form.register("roi")} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isPending} data-testid="button-submit-program">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

export default function Programs() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { data: programs, isLoading } = usePrograms(orgId);
  const { data: projectsResp } = useProjects(orgId);
  const projects = Array.isArray(projectsResp) ? projectsResp : (projectsResp as any)?.projects ?? [];
  const { data: members = [] } = useOrgMembers(orgId);
  const createProgram = useCreateProgram();
  const updateProgram = useUpdateProgram();
  const deleteProgram = useDeleteProgram();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editProgram, setEditProgram] = useState<Program | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const filtered = (programs || []).filter(p =>
    normalizeSearch(p.name).includes(normalizeSearch(search)) ||
    normalizeSearch(p.description ?? "").includes(normalizeSearch(search))
  );

  const projectCount = (programId: number) => projects.filter((p: any) => p.programId === programId).length;

  const ownerName = (ownerId: string) => {
    const m = members.find(m => m.userId === ownerId);
    return m ? memberDisplayName(m) : ownerId;
  };

  function toNumOrNull(v: string | null | undefined) {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  function handleCreate(values: FormValues) {
    if (!orgId) return;
    createProgram.mutate({
      ...values,
      organizationId: orgId,
      budget: toNumOrNull(values.budget) as any,
      benefit: toNumOrNull(values.benefit) as any,
      roi: toNumOrNull(values.roi) as any,
    } as any, {
      onSuccess: () => { setCreateOpen(false); toast({ title: "Program created" }); },
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  }

  function handleUpdate(values: FormValues) {
    if (!editProgram) return;
    updateProgram.mutate({
      id: editProgram.id,
      ...values,
      budget: toNumOrNull(values.budget) as any,
      benefit: toNumOrNull(values.benefit) as any,
      roi: toNumOrNull(values.roi) as any,
    } as any, {
      onSuccess: () => { setEditProgram(null); toast({ title: "Program updated" }); },
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-programs">Programs</h1>
          <p className="text-muted-foreground">Group related projects under a strategic program.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-create-program">
          <Plus className="h-4 w-4 mr-2" /> New Program
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-search-programs"
              placeholder="Search programs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center text-muted-foreground py-12">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Layers className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>No programs found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Benefit</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id} data-testid={`row-program-${p.id}`}>
                    <TableCell>
                      <Link href={`/programs/${p.id}`} className="font-medium hover:underline flex items-center gap-1">
                        {p.name} <ArrowRight className="h-3 w-3 opacity-50" />
                      </Link>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{p.status}</Badge></TableCell>
                    <TableCell>{ownerName(p.ownerId)}</TableCell>
                    <TableCell className="text-right">{projectCount(p.id)}</TableCell>
                    <TableCell className="text-right">{p.budget != null ? formatCurrency(p.budget) : "—"}</TableCell>
                    <TableCell className="text-right">{p.benefit != null ? formatCurrency(p.benefit) : "—"}</TableCell>
                    <TableCell className="text-right">{p.roi != null ? `${p.roi}%` : "—"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-program-menu-${p.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditProgram(p)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(p.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Program</DialogTitle>
            <DialogDescription>Create a program to group related projects.</DialogDescription>
          </DialogHeader>
          <ProgramForm
            defaultValues={{}}
            members={members}
            submitLabel="Create"
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
            isPending={createProgram.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editProgram} onOpenChange={(o) => !o && setEditProgram(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Program</DialogTitle>
          </DialogHeader>
          {editProgram && (
            <ProgramForm
              defaultValues={{
                name: editProgram.name,
                status: editProgram.status ?? "Active",
                description: editProgram.description ?? "",
                businessCase: editProgram.businessCase ?? "",
                ownerId: editProgram.ownerId,
                budget: editProgram.budget?.toString() ?? "",
                benefit: editProgram.benefit?.toString() ?? "",
                roi: editProgram.roi?.toString() ?? "",
              }}
              members={members}
              submitLabel="Save"
              onSubmit={handleUpdate}
              onCancel={() => setEditProgram(null)}
              isPending={updateProgram.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete program?</AlertDialogTitle>
            <AlertDialogDescription>
              Associated projects will be detached but not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteProgram.mutate(deleteId, {
                  onSuccess: () => { setDeleteId(null); toast({ title: "Program deleted" }); },
                  onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
                });
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
