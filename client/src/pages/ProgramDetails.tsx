import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Save, Plus, X, Layers, Loader2 } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { useProgram, useProgramProjects, useUpdateProgram, useSetProgramProjects } from "@/hooks/use-programs";
import { useProjects } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

export default function ProgramDetails() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { data: program, isLoading } = useProgram(id);
  const { data: programProjects = [] } = useProgramProjects(id);
  const { data: allProjectsResp } = useProjects(orgId);
  const allProjects = useMemo(
    () => Array.isArray(allProjectsResp) ? allProjectsResp : (allProjectsResp as any)?.projects ?? [],
    [allProjectsResp]
  );
  const { data: members = [] } = useOrgMembers(orgId);
  const updateProgram = useUpdateProgram();
  const setProgramProjects = useSetProgramProjects();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "", status: "Active", description: "", businessCase: "",
    ownerId: "", budget: "", benefit: "", roi: "",
  });
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);

  useEffect(() => {
    if (program) {
      setForm({
        name: program.name,
        status: program.status ?? "Active",
        description: program.description ?? "",
        businessCase: program.businessCase ?? "",
        ownerId: program.ownerId,
        budget: program.budget?.toString() ?? "",
        benefit: program.benefit?.toString() ?? "",
        roi: program.roi?.toString() ?? "",
      });
    }
  }, [program]);

  useEffect(() => {
    if (manageOpen) {
      setSelectedProjectIds(programProjects.map((p: any) => p.id));
    }
  }, [manageOpen, programProjects]);

  function toNumOrNull(v: string) {
    if (!v) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!form.ownerId) {
      toast({ title: "Owner is required", variant: "destructive" });
      return;
    }
    updateProgram.mutate({
      id,
      name: form.name,
      status: form.status,
      description: form.description || null,
      businessCase: form.businessCase || null,
      ownerId: form.ownerId,
      budget: toNumOrNull(form.budget) as any,
      benefit: toNumOrNull(form.benefit) as any,
      roi: toNumOrNull(form.roi) as any,
    } as any, {
      onSuccess: () => toast({ title: "Saved" }),
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  }

  function handleSaveProjects() {
    setProgramProjects.mutate({ id, projectIds: selectedProjectIds }, {
      onSuccess: () => { setManageOpen(false); toast({ title: "Projects updated" }); },
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  }

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!program) {
    return (
      <div className="container mx-auto p-6">
        <p>Program not found.</p>
        <Button variant="ghost" onClick={() => navigate("/programs")}>Back to Programs</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/programs")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Layers className="h-3 w-3" /> Program
            </div>
            <h1 className="text-2xl font-bold" data-testid="heading-program-name">{program.name}</h1>
          </div>
          <Badge variant="secondary">{program.status}</Badge>
        </div>
        <Button onClick={handleSave} disabled={updateProgram.isPending} data-testid="button-save-program">
          <Save className="h-4 w-4 mr-2" /> Save
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>General</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input data-testid="input-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Status *</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea data-testid="input-description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Business case</Label>
              <Textarea data-testid="input-businessCase" rows={2} value={form.businessCase} onChange={(e) => setForm({ ...form, businessCase: e.target.value })} />
            </div>
            <div>
              <Label>Owner *</Label>
              <Select value={form.ownerId} onValueChange={(v) => setForm({ ...form, ownerId: v })}>
                <SelectTrigger data-testid="select-owner"><SelectValue placeholder="Select owner" /></SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {memberDisplayName(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Financials</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Budget</Label>
              <Input data-testid="input-budget" type="number" step="0.01" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </div>
            <div>
              <Label>Benefit</Label>
              <Input data-testid="input-benefit" type="number" step="0.01" value={form.benefit} onChange={(e) => setForm({ ...form, benefit: e.target.value })} />
            </div>
            <div>
              <Label>ROI (%)</Label>
              <Input data-testid="input-roi" type="number" step="0.01" value={form.roi} onChange={(e) => setForm({ ...form, roi: e.target.value })} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Projects in this Program</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setManageOpen(true)} data-testid="button-manage-projects">
              <Plus className="h-4 w-4 mr-2" /> Manage Projects
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {programProjects.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No projects associated yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programProjects.map((p: any) => (
                  <TableRow key={p.id} data-testid={`row-project-${p.id}`}>
                    <TableCell>
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{p.status}</Badge></TableCell>
                    <TableCell>{p.health ?? "—"}</TableCell>
                    <TableCell className="text-right">{p.budget != null ? formatCurrency(p.budget) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Projects</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Current Program</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allProjects.map((p: any) => {
                  const checked = selectedProjectIds.includes(p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Checkbox
                          data-testid={`checkbox-project-${p.id}`}
                          checked={checked}
                          onCheckedChange={(c) => {
                            setSelectedProjectIds(prev =>
                              c ? [...prev, p.id] : prev.filter(x => x !== p.id)
                            );
                          }}
                        />
                      </TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.programId === id ? "This program" : (p.programId ? "Other program" : "—")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveProjects} disabled={setProgramProjects.isPending} data-testid="button-save-projects">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
