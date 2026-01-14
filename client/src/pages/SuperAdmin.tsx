import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, Building2, Users, Plus, Edit, ShieldAlert, Crown, Database, Sparkles, Eraser, CreditCard, DollarSign, UserPlus, RotateCcw, ChevronDown, ChevronRight, Archive, Wallet, ArrowUp, ArrowDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Organization, User } from "@shared/schema";

interface IndustryOption {
  id: string;
  label: string;
  description: string;
}

export default function SuperAdmin() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  if (authLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isSuperAdmin = user?.role === "super_admin";

  if (!isSuperAdmin) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-2xl font-bold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground">You need Super Admin privileges to access this page.</p>
        <Badge variant="outline" className="text-sm">
          Current role: {user?.role || "user"}
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Crown className="h-8 w-8 text-amber-500" />
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Super Admin Console</h1>
          <p className="text-muted-foreground">Manage all organizations and system users</p>
        </div>
      </div>

      <Tabs defaultValue="organizations" className="w-full">
        <TabsList className="bg-muted p-1 rounded-xl">
          <TabsTrigger value="organizations" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2">
            <Building2 className="h-4 w-4" />
            Organizations
          </TabsTrigger>
          <TabsTrigger value="users" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2">
            <Users className="h-4 w-4" />
            All Users
          </TabsTrigger>
          <TabsTrigger value="plans" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2">
            <CreditCard className="h-4 w-4" />
            Plans
          </TabsTrigger>
          <TabsTrigger value="credits" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2">
            <Wallet className="h-4 w-4" />
            Credit Pricing
          </TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="organizations">
            <OrganizationsTab />
          </TabsContent>
          <TabsContent value="users">
            <AllUsersTab />
          </TabsContent>
          <TabsContent value="plans">
            <PlansTab />
          </TabsContent>
          <TabsContent value="credits">
            <CreditCostsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function OrganizationsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [newOrg, setNewOrg] = useState({ name: "", slug: "", description: "" });
  const [demoDataOrg, setDemoDataOrg] = useState<Organization | null>(null);
  const [deleteDemoDataOrg, setDeleteDemoDataOrg] = useState<Organization | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<string>("");
  const [deactivatedOpen, setDeactivatedOpen] = useState(false);
  const [restoreOrgId, setRestoreOrgId] = useState<number | null>(null);

  const { data: organizations, isLoading } = useQuery<Organization[]>({
    queryKey: ['/api/organizations']
  });

  const { data: deactivatedOrgs, isLoading: deactivatedLoading } = useQuery<Organization[]>({
    queryKey: ['/api/admin/organizations/deactivated'],
    enabled: user?.role === 'super_admin',
  });

  const { data: industries } = useQuery<IndustryOption[]>({
    queryKey: ['/api/demo-data/industries'],
    enabled: user?.role === 'super_admin',
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users'],
    enabled: user?.role === 'super_admin',
  });

  const createOrg = useMutation({
    mutationFn: async (data: { name: string; slug: string; description: string }) => {
      return apiRequest('POST', '/api/organizations', { ...data, ownerId: user?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      toast({ title: "Success", description: "Organization created" });
      setIsCreateOpen(false);
      setNewOrg({ name: "", slug: "", description: "" });
    }
  });

  const updateOrg = useMutation({
    mutationFn: async (data: { id: number; name: string; description: string }) => {
      return apiRequest('PUT', `/api/organizations/${data.id}`, { name: data.name, description: data.description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      toast({ title: "Success", description: "Organization updated" });
      setEditingOrg(null);
    }
  });

  const deleteOrg = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/organizations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations/deactivated'] });
      toast({ title: "Success", description: "Organization deactivated" });
      setDeleteId(null);
    }
  });

  const reactivateOrg = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/admin/organizations/${id}/reactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations/deactivated'] });
      toast({ title: "Success", description: "Organization restored" });
      setRestoreOrgId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to restore organization", variant: "destructive" });
    }
  });

  const generateDemoData = useMutation({
    mutationFn: async ({ organizationId, industry }: { organizationId: number; industry: string }) => {
      const response = await apiRequest('POST', '/api/demo-data/generate', { organizationId, industry });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/risks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/milestones'] });
      queryClient.invalidateQueries({ queryKey: ['/api/issues'] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-financials'] });
      toast({ 
        title: "Demo Data Generated", 
        description: `Created ${data.stats.portfolios} portfolios, ${data.stats.projects} projects, ${data.stats.tasks} tasks, ${data.stats.risks} risks, ${data.stats.milestones} milestones, ${data.stats.issues} issues` 
      });
      setDemoDataOrg(null);
      setSelectedIndustry("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate demo data", variant: "destructive" });
    }
  });

  const deleteDemoData = useMutation({
    mutationFn: async (organizationId: number) => {
      const response = await apiRequest('DELETE', `/api/demo-data/${organizationId}`);
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/risks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/milestones'] });
      queryClient.invalidateQueries({ queryKey: ['/api/issues'] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-financials'] });
      toast({ 
        title: "Demo Data Removed", 
        description: `Deleted ${data.stats.portfolios} portfolios, ${data.stats.projects} projects, ${data.stats.tasks} tasks, ${data.stats.risks} risks, ${data.stats.milestones} milestones, ${data.stats.issues} issues, ${data.stats.financials} financial records` 
      });
      setDeleteDemoDataOrg(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove demo data", variant: "destructive" });
    }
  });

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>All Organizations</CardTitle>
          <CardDescription>Manage organization tenants in the system</CardDescription>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-org">
          <Plus className="h-4 w-4 mr-2" />
          Create Organization
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations?.map(org => (
              <TableRow key={org.id} data-testid={`org-row-${org.id}`}>
                <TableCell className="font-medium">{org.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{org.slug}</Badge>
                </TableCell>
                <TableCell className="max-w-[200px] truncate">{org.description || '-'}</TableCell>
                <TableCell>
                  {org.createdAt ? format(new Date(org.createdAt), 'MMM d, yyyy') : 'N/A'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setDemoDataOrg(org)}
                      data-testid={`button-demo-data-${org.id}`}
                      title="Generate demo data"
                    >
                      <Sparkles className="h-4 w-4 text-amber-500" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setDeleteDemoDataOrg(org)}
                      data-testid={`button-remove-demo-data-${org.id}`}
                      title="Remove all demo data"
                    >
                      <Eraser className="h-4 w-4 text-red-400" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setEditingOrg(org)}
                      data-testid={`button-edit-org-${org.id}`}
                    >
                      <Edit className="h-4 w-4 text-slate-400" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setDeleteId(org.id)}
                      data-testid={`button-delete-org-${org.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {organizations?.length === 0 && (
          <div className="text-center py-8 text-slate-500">No organizations yet. Create one to get started.</div>
        )}

        {deactivatedOrgs && deactivatedOrgs.length > 0 && (
          <Collapsible open={deactivatedOpen} onOpenChange={setDeactivatedOpen} className="mt-6">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="flex w-full justify-start gap-2 text-muted-foreground hover:text-foreground">
                {deactivatedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Archive className="h-4 w-4" />
                Deactivated Organizations ({deactivatedOrgs.length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Deactivated</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deactivatedOrgs.map(org => (
                      <TableRow key={org.id} data-testid={`deactivated-org-row-${org.id}`} className="opacity-75">
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{org.slug}</Badge>
                        </TableCell>
                        <TableCell>
                          {org.deactivatedAt ? format(new Date(org.deactivatedAt), 'MMM d, yyyy HH:mm') : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setRestoreOrgId(org.id)}
                            data-testid={`button-restore-org-${org.id}`}
                            title="Restore organization"
                          >
                            <RotateCcw className="h-4 w-4 text-green-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>Add a new organization to the system</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Organization Name</Label>
              <Input 
                value={newOrg.name} 
                onChange={e => setNewOrg({...newOrg, name: e.target.value})}
                placeholder="Acme Corporation"
                data-testid="input-org-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug (URL identifier)</Label>
              <Input 
                value={newOrg.slug} 
                onChange={e => setNewOrg({...newOrg, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                placeholder="acme-corp"
                data-testid="input-org-slug"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                value={newOrg.description} 
                onChange={e => setNewOrg({...newOrg, description: e.target.value})}
                placeholder="Brief description of the organization"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => createOrg.mutate(newOrg)} 
              disabled={!newOrg.name || !newOrg.slug}
              data-testid="button-save-org"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingOrg !== null} onOpenChange={() => setEditingOrg(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input 
                  value={editingOrg?.name || ''} 
                  onChange={e => setEditingOrg(prev => prev ? {...prev, name: e.target.value} : null)}
                  data-testid="input-edit-org-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                  value={editingOrg?.description || ''} 
                  onChange={e => setEditingOrg(prev => prev ? {...prev, description: e.target.value} : null)}
                  data-testid="input-edit-org-description"
                />
              </div>
            </div>
            
            {editingOrg && (
              <OrgMembersEditor orgId={editingOrg.id} allUsers={users || []} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOrg(null)}>Cancel</Button>
            <Button onClick={() => editingOrg && updateOrg.mutate({ 
              id: editingOrg.id, 
              name: editingOrg.name, 
              description: editingOrg.description || '' 
            })}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              Deactivate Organization
            </DialogTitle>
            <DialogDescription>
              This organization will be deactivated and hidden from normal use. All data will be preserved and the organization can be restored later by a Super Admin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteOrg.mutate(deleteId)}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restoreOrgId !== null} onOpenChange={() => setRestoreOrgId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-green-500" />
              Restore Organization
            </DialogTitle>
            <DialogDescription>
              This will restore the organization and make it active again. All members and data will become accessible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreOrgId(null)}>Cancel</Button>
            <Button onClick={() => restoreOrgId && reactivateOrg.mutate(restoreOrgId)}>
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={demoDataOrg !== null} onOpenChange={() => { setDemoDataOrg(null); setSelectedIndustry(""); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Generate Demo Data
            </DialogTitle>
            <DialogDescription>
              Generate sample portfolios, projects, tasks, risks, and more for <strong>{demoDataOrg?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Industry</Label>
              <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                <SelectTrigger data-testid="select-industry">
                  <SelectValue placeholder="Choose an industry..." />
                </SelectTrigger>
                <SelectContent>
                  {industries?.map(ind => (
                    <SelectItem key={ind.id} value={ind.id}>
                      <div className="flex flex-col">
                        <span>{ind.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedIndustry && industries && (
                <p className="text-sm text-muted-foreground mt-2">
                  {industries.find(i => i.id === selectedIndustry)?.description}
                </p>
              )}
            </div>
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                This will create:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                <li>2-3 Portfolios with strategic context</li>
                <li>3-5 Projects with realistic timelines</li>
                <li>Tasks, Risks, Milestones, and Issues</li>
                <li>Financial records with CapEx/OpEx breakdown</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDemoDataOrg(null); setSelectedIndustry(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={() => demoDataOrg && selectedIndustry && generateDemoData.mutate({ 
                organizationId: demoDataOrg.id, 
                industry: selectedIndustry 
              })}
              disabled={!selectedIndustry || generateDemoData.isPending}
              data-testid="button-generate-demo-data"
            >
              {generateDemoData.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Data
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDemoDataOrg !== null} onOpenChange={() => setDeleteDemoDataOrg(null)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eraser className="h-5 w-5 text-red-500" />
              Remove Demo Data
            </DialogTitle>
            <DialogDescription>
              This will permanently delete only <strong>demo-generated</strong> portfolios, projects, tasks, risks, milestones, issues, and financial records for <strong>{deleteDemoDataOrg?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted border p-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              User-created data will be preserved
            </p>
            <p className="text-sm text-muted-foreground">
              Only data that was created by the demo generator will be removed. Any data created manually by users will remain intact.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDemoDataOrg(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => deleteDemoDataOrg && deleteDemoData.mutate(deleteDemoDataOrg.id)}
              disabled={deleteDemoData.isPending}
              data-testid="button-confirm-remove-demo-data"
            >
              {deleteDemoData.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Eraser className="h-4 w-4 mr-2" />
                  Remove Demo Data
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface OrganizationMembership {
  id: number;
  organizationId: number;
  userId: string;
  role: string;
  createdAt: string;
}

function AllUsersTab() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [addingOrgId, setAddingOrgId] = useState<string>("");
  const [addingOrgRole, setAddingOrgRole] = useState<string>("member");
  
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['/api/users']
  });

  const { data: allOrganizations } = useQuery<Organization[]>({
    queryKey: ['/api/organizations']
  });

  const { data: userMemberships, refetch: refetchMemberships } = useQuery<OrganizationMembership[]>({
    queryKey: ['/api/users', editingUser?.id, 'organizations'],
    queryFn: async () => {
      if (!editingUser?.id) return [];
      const res = await fetch(`/api/users/${editingUser.id}/organizations`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch memberships');
      return res.json();
    },
    enabled: !!editingUser?.id,
  });

  const updateUserRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest('PUT', `/api/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({ title: "Success", description: "User role updated" });
    }
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest('DELETE', `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      toast({ title: "Success", description: "User deleted successfully" });
      setDeleteUserId(null);
      setUserToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete user", variant: "destructive" });
    }
  });

  const addMembership = useMutation({
    mutationFn: async ({ orgId, userId, role }: { orgId: number; userId: string; role: string }) => {
      return apiRequest('POST', `/api/organizations/${orgId}/members`, { userId, role });
    },
    onSuccess: () => {
      refetchMemberships();
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      toast({ title: "Success", description: "Organization membership added" });
      setAddingOrgId("");
      setAddingOrgRole("member");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to add membership", variant: "destructive" });
    }
  });

  const updateMembershipRole = useMutation({
    mutationFn: async ({ orgId, userId, role }: { orgId: number; userId: string; role: string }) => {
      return apiRequest('PUT', `/api/organizations/${orgId}/members/${userId}`, { role });
    },
    onSuccess: () => {
      refetchMemberships();
      toast({ title: "Success", description: "Membership role updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update role", variant: "destructive" });
    }
  });

  const removeMembership = useMutation({
    mutationFn: async ({ orgId, userId }: { orgId: number; userId: string }) => {
      return apiRequest('DELETE', `/api/organizations/${orgId}/members/${userId}`);
    },
    onSuccess: () => {
      refetchMemberships();
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      toast({ title: "Success", description: "Membership removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to remove membership", variant: "destructive" });
    }
  });

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setDeleteUserId(user.id);
  };

  const handleEditClick = (user: User) => {
    setEditingUser(user);
  };

  // Get organizations the user is NOT a member of (for adding)
  const availableOrgs = allOrganizations?.filter(
    org => !userMemberships?.some(m => m.organizationId === org.id)
  ) || [];

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>All System Users</CardTitle>
        <CardDescription>View and manage all users across organizations</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>System Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map(user => (
              <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                <TableCell className="font-medium">
                  {user.firstName} {user.lastName}
                </TableCell>
                <TableCell>{user.email || 'N/A'}</TableCell>
                <TableCell>
                  <Select 
                    value={user.role || 'user'} 
                    onValueChange={(role) => updateUserRole.mutate({ userId: user.id, role })}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {user.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy') : 'N/A'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(user)}
                      data-testid={`button-edit-user-${user.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(user)}
                      disabled={user.id === currentUser?.id}
                      data-testid={`button-delete-user-${user.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {(!users || users.length === 0) && (
          <div className="text-center py-8 text-slate-500">No users found.</div>
        )}
      </CardContent>

      <Dialog open={!!deleteUserId} onOpenChange={(open) => !open && setDeleteUserId(null)}>
        <DialogContent data-testid="dialog-delete-user">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {userToDelete?.firstName} {userToDelete?.lastName} ({userToDelete?.email})? 
              This will remove the user and all their organization memberships. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteUserId(null)} data-testid="button-cancel-delete-user">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteUserId && deleteUser.mutate(deleteUserId)}
              disabled={deleteUser.isPending}
              data-testid="button-confirm-delete-user"
            >
              {deleteUser.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete User
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-2xl" data-testid="dialog-edit-user-memberships">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Manage Organization Memberships
            </DialogTitle>
            <DialogDescription>
              Edit organization memberships for {editingUser?.firstName} {editingUser?.lastName} ({editingUser?.email})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Current Memberships</Label>
              {userMemberships && userMemberships.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userMemberships.map((membership) => {
                      const org = allOrganizations?.find(o => o.id === membership.organizationId);
                      return (
                        <TableRow key={membership.id} data-testid={`membership-row-${membership.organizationId}`}>
                          <TableCell className="font-medium">
                            {org?.name || `Org #${membership.organizationId}`}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={membership.role}
                              onValueChange={(role) => updateMembershipRole.mutate({
                                orgId: membership.organizationId,
                                userId: editingUser!.id,
                                role
                              })}
                            >
                              <SelectTrigger className="w-[120px]" data-testid={`select-membership-role-${membership.organizationId}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="owner">Owner</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeMembership.mutate({
                                orgId: membership.organizationId,
                                userId: editingUser!.id
                              })}
                              disabled={removeMembership.isPending}
                              data-testid={`button-remove-membership-${membership.organizationId}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-4 text-muted-foreground border rounded-md">
                  This user has no organization memberships.
                </div>
              )}
            </div>

            {availableOrgs.length > 0 && (
              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">Add to Organization</Label>
                <div className="flex items-center gap-2">
                  <Select value={addingOrgId} onValueChange={setAddingOrgId}>
                    <SelectTrigger className="flex-1" data-testid="select-add-org">
                      <SelectValue placeholder="Select an organization..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableOrgs.map((org) => (
                        <SelectItem key={org.id} value={org.id.toString()}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={addingOrgRole} onValueChange={setAddingOrgRole}>
                    <SelectTrigger className="w-[120px]" data-testid="select-add-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => addingOrgId && addMembership.mutate({
                      orgId: parseInt(addingOrgId),
                      userId: editingUser!.id,
                      role: addingOrgRole
                    })}
                    disabled={!addingOrgId || addMembership.isPending}
                    data-testid="button-add-membership"
                  >
                    {addMembership.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)} data-testid="button-close-edit-memberships">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface PlanData {
  id: number;
  code: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number | null;
  maxSeats: number | null;
  isActive: boolean | null;
  displayOrder: number | null;
  meterRules: Array<{
    meterCode: string;
    meterName: string;
    includedQuota: number | null;
    hardCap: number | null;
    overagePriceMicrocents: number | null;
    isSharedPool: boolean;
  }>;
}

interface PlanMeterRule {
  id: number;
  planId: number;
  meterId: number;
  ruleType: string;
  includedUnitsMonthly: number | null;
  hardCapUnits: number | null;
  overageUnitPriceMicrocents: number | null;
  isSharedPool: boolean | null;
  meter: {
    id: number;
    code: string;
    name: string;
    unitLabel: string | null;
  };
}

function PlansTab() {
  const { toast } = useToast();
  const [editingPlan, setEditingPlan] = useState<PlanData | null>(null);
  const [editingRules, setEditingRules] = useState<PlanMeterRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPlan, setNewPlan] = useState({ code: "", name: "", description: "", monthlyPriceCents: 0, maxSeats: "" });
  const [deletePlanId, setDeletePlanId] = useState<number | null>(null);
  const [isSyncingPayPal, setIsSyncingPayPal] = useState(false);

  const { data: plans, isLoading } = useQuery<PlanData[]>({
    queryKey: ['/api/billing/plans']
  });

  const syncPayPalPlans = async () => {
    setIsSyncingPayPal(true);
    try {
      const res = await fetch('/api/admin/paypal/sync-plans', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to sync PayPal plans');
      }
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plans'] });
      toast({ 
        title: "PayPal Plans Synced", 
        description: `Successfully synced ${result.plans?.length || 0} plans with PayPal.` 
      });
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to sync PayPal plans", 
        variant: "destructive" 
      });
    }
    setIsSyncingPayPal(false);
  };

  const sortedPlans = plans ? [...plans].sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999)) : [];

  const reorderPlans = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      return apiRequest('PUT', '/api/admin/plans/reorder', { orderedIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plans'] });
      toast({ title: "Success", description: "Plan order updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reorder plans", variant: "destructive" });
    }
  });

  const movePlan = (planId: number, direction: 'up' | 'down') => {
    const currentIndex = sortedPlans.findIndex(p => p.id === planId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= sortedPlans.length) return;
    
    const newOrder = [...sortedPlans];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];
    reorderPlans.mutate(newOrder.map(p => p.id));
  };

  const createPlan = useMutation({
    mutationFn: async (data: { code: string; name: string; description?: string; monthlyPriceCents?: number; maxSeats?: number }) => {
      return apiRequest('POST', '/api/admin/plans', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plans'] });
      toast({ title: "Success", description: "Plan created successfully" });
      setIsCreateOpen(false);
      setNewPlan({ code: "", name: "", description: "", monthlyPriceCents: 0, maxSeats: "" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create plan", variant: "destructive" });
    }
  });

  const deletePlan = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/plans/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plans'] });
      toast({ title: "Success", description: "Plan deleted successfully" });
      setDeletePlanId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete plan", variant: "destructive" });
    }
  });

  const updatePlan = useMutation({
    mutationFn: async (data: { id: number; name?: string; description?: string; monthlyPriceCents?: number | null; maxSeats?: number }) => {
      return apiRequest('PUT', `/api/admin/plans/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plans'] });
      toast({ title: "Success", description: "Plan updated successfully" });
      setEditingPlan(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update plan", variant: "destructive" });
    }
  });

  const updateRule = useMutation({
    mutationFn: async (data: { planId: number; ruleId: number; includedUnitsMonthly?: number; hardCapUnits?: number; overageUnitPriceMicrocents?: number }) => {
      const { planId, ruleId, ...updates } = data;
      return apiRequest('PUT', `/api/admin/plans/${planId}/rules/${ruleId}`, updates);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Rule updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update rule", variant: "destructive" });
    }
  });

  const fetchRules = async (planId: number) => {
    setLoadingRules(true);
    try {
      const res = await fetch(`/api/admin/plans/${planId}/rules`, {
        credentials: 'include'
      });
      if (!res.ok) {
        throw new Error('Failed to fetch');
      }
      const data = await res.json();
      setEditingRules(data);
    } catch (err) {
      toast({ title: "Error", description: "Failed to fetch rules", variant: "destructive" });
    }
    setLoadingRules(false);
  };

  const formatPrice = (cents: number | null) => {
    if (cents === null) return "Contact Us";
    if (cents === 0) return "Free";
    return `$${(cents / 100).toFixed(2)}/mo`;
  };

  const formatOveragePrice = (microcents: number | null) => {
    if (!microcents) return "N/A";
    return `$${(microcents / 1000000).toFixed(4)}`;
  };

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription Plans
            </CardTitle>
            <CardDescription>Configure pricing, quotas, and features for each plan</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={syncPayPalPlans} 
              disabled={isSyncingPayPal}
              data-testid="button-sync-paypal"
            >
              {isSyncingPayPal ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wallet className="h-4 w-4 mr-2" />
              )}
              Sync PayPal Plans
            </Button>
            <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-plan">
              <Plus className="h-4 w-4 mr-2" />
              Add Plan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Monthly Price</TableHead>
                <TableHead>Max Seats</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlans.map((plan, index) => (
                <TableRow key={plan.id} data-testid={`plan-row-${plan.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => movePlan(plan.id, 'up')}
                        disabled={index === 0 || reorderPlans.isPending}
                        data-testid={`button-move-plan-up-${plan.id}`}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => movePlan(plan.id, 'down')}
                        disabled={index === sortedPlans.length - 1 || reorderPlans.isPending}
                        data-testid={`button-move-plan-down-${plan.id}`}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{plan.name}</div>
                    <div className="text-sm text-muted-foreground">{plan.code}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={plan.monthlyPriceCents ? "default" : "secondary"}>
                      {formatPrice(plan.monthlyPriceCents)}
                    </Badge>
                  </TableCell>
                  <TableCell>{plan.maxSeats || "Unlimited"}</TableCell>
                  <TableCell>
                    <Badge variant={plan.isActive ? "default" : "outline"}>
                      {plan.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingPlan(plan);
                          fetchRules(plan.id);
                        }}
                        data-testid={`button-edit-plan-${plan.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletePlanId(plan.id)}
                        data-testid={`button-delete-plan-${plan.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Plan: {editingPlan?.name}</DialogTitle>
            <DialogDescription>Update plan details and usage quotas</DialogDescription>
          </DialogHeader>
          
          {editingPlan && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plan-name">Name</Label>
                  <Input
                    id="plan-name"
                    value={editingPlan.name}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                    data-testid="input-plan-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-price">Monthly Price ($)</Label>
                  <div className="space-y-2">
                    <Input
                      id="plan-price"
                      type="number"
                      step="0.01"
                      value={editingPlan.monthlyPriceCents === null ? "" : (editingPlan.monthlyPriceCents || 0) / 100}
                      onChange={(e) => setEditingPlan({ 
                        ...editingPlan, 
                        monthlyPriceCents: Math.round(parseFloat(e.target.value || "0") * 100) 
                      })}
                      disabled={editingPlan.monthlyPriceCents === null}
                      placeholder={editingPlan.monthlyPriceCents === null ? "Contact Us" : "0.00"}
                      data-testid="input-plan-price"
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="contact-us-pricing"
                        checked={editingPlan.monthlyPriceCents === null}
                        onCheckedChange={(checked) => setEditingPlan({
                          ...editingPlan,
                          monthlyPriceCents: checked ? null : 0
                        })}
                        data-testid="checkbox-contact-us-pricing"
                      />
                      <Label htmlFor="contact-us-pricing" className="text-xs text-muted-foreground cursor-pointer">
                        Contact Us pricing (custom/enterprise)
                      </Label>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="plan-description">Description</Label>
                  <Textarea
                    id="plan-description"
                    value={editingPlan.description || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                    data-testid="input-plan-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-seats">Max Seats</Label>
                  <Input
                    id="plan-seats"
                    type="number"
                    value={editingPlan.maxSeats || ""}
                    placeholder="Unlimited"
                    onChange={(e) => setEditingPlan({ 
                      ...editingPlan, 
                      maxSeats: e.target.value ? parseInt(e.target.value) : null 
                    })}
                    data-testid="input-plan-seats"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Credits Allocation
                </h4>
                
                {loadingRules ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Credits Rules - Primary Focus */}
                    {(() => {
                      const creditsRules = editingRules.filter(r => r.meter.code === 'credits');
                      const quotaRule = creditsRules.find(r => r.ruleType === 'INCLUDED_QUOTA');
                      const hardCapRule = creditsRules.find(r => r.ruleType === 'HARD_CAP');
                      const overageRule = creditsRules.find(r => r.ruleType === 'METERED_OVERAGE');
                      
                      return (
                        <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                          <div className="flex items-center gap-2">
                            <Wallet className="h-5 w-5 text-primary" />
                            <span className="font-medium">Monthly Credits</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            {quotaRule && (
                              <div className="space-y-2">
                                <Label className="text-sm">Included Credits</Label>
                                <Input
                                  type="number"
                                  value={quotaRule.includedUnitsMonthly || ""}
                                  onChange={(e) => {
                                    const newRules = editingRules.map(r => 
                                      r.id === quotaRule.id 
                                        ? { ...r, includedUnitsMonthly: parseInt(e.target.value) || null } 
                                        : r
                                    );
                                    setEditingRules(newRules);
                                  }}
                                  placeholder="0"
                                  data-testid="input-credits-quota"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Credits included each billing cycle
                                </p>
                              </div>
                            )}
                            
                            {hardCapRule && (
                              <div className="space-y-2">
                                <Label className="text-sm">Hard Cap</Label>
                                <Input
                                  type="number"
                                  value={hardCapRule.hardCapUnits || ""}
                                  onChange={(e) => {
                                    const newRules = editingRules.map(r => 
                                      r.id === hardCapRule.id 
                                        ? { ...r, hardCapUnits: parseInt(e.target.value) || null } 
                                        : r
                                    );
                                    setEditingRules(newRules);
                                  }}
                                  placeholder="No limit"
                                  data-testid="input-credits-cap"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Maximum credits allowed (blocks usage when reached)
                                </p>
                              </div>
                            )}
                          </div>
                          
                          {overageRule && (
                            <div className="pt-3 border-t space-y-2">
                              <Label className="text-sm">Overage Pricing</Label>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  step="0.0001"
                                  className="w-32"
                                  value={(overageRule.overageUnitPriceMicrocents || 0) / 1000000}
                                  onChange={(e) => {
                                    const newRules = editingRules.map(r => 
                                      r.id === overageRule.id 
                                        ? { ...r, overageUnitPriceMicrocents: Math.round(parseFloat(e.target.value || "0") * 1000000) } 
                                        : r
                                    );
                                    setEditingRules(newRules);
                                  }}
                                  data-testid="input-credits-overage"
                                />
                                <span className="text-sm text-muted-foreground">per credit</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Price per credit when usage exceeds included quota
                              </p>
                            </div>
                          )}
                          
                          {/* Capacity Estimates */}
                          {quotaRule?.includedUnitsMonthly && (
                            <div className="pt-3 border-t">
                              <p className="text-xs font-medium text-muted-foreground mb-2">Estimated Capacity (with {quotaRule.includedUnitsMonthly.toLocaleString()} credits)</p>
                              <div className="flex flex-wrap gap-3 text-xs">
                                <span className="px-2 py-1 rounded bg-muted">
                                  {Math.floor(quotaRule.includedUnitsMonthly / 5)} projects
                                </span>
                                <span className="px-2 py-1 rounded bg-muted">
                                  {Math.floor(quotaRule.includedUnitsMonthly / 1)} tasks
                                </span>
                                <span className="px-2 py-1 rounded bg-muted">
                                  {Math.floor(quotaRule.includedUnitsMonthly / 1)} issues
                                </span>
                                <span className="px-2 py-1 rounded bg-muted">
                                  {Math.floor(quotaRule.includedUnitsMonthly / 3)} AI runs
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    
                    {/* Other Meters (collapsed) */}
                    {editingRules.filter(r => r.meter.code !== 'credits').length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                          <ChevronRight className="h-4 w-4" />
                          <span>Other Meters ({editingRules.filter(r => r.meter.code !== 'credits').length} rules)</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-3">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Meter</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {editingRules.filter(r => r.meter.code !== 'credits').map(rule => (
                                <TableRow key={rule.id}>
                                  <TableCell className="font-medium text-sm">
                                    {rule.meter.name}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="secondary" className="text-xs">
                                      {rule.ruleType.replace(/_/g, " ")}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {rule.ruleType === "INCLUDED_QUOTA" && (
                                      <Input
                                        type="number"
                                        className="w-20"
                                        value={rule.includedUnitsMonthly || ""}
                                        onChange={(e) => {
                                          const newRules = editingRules.map(r => 
                                            r.id === rule.id 
                                              ? { ...r, includedUnitsMonthly: parseInt(e.target.value) || null } 
                                              : r
                                          );
                                          setEditingRules(newRules);
                                        }}
                                      />
                                    )}
                                    {rule.ruleType === "HARD_CAP" && (
                                      <Input
                                        type="number"
                                        className="w-20"
                                        value={rule.hardCapUnits || ""}
                                        onChange={(e) => {
                                          const newRules = editingRules.map(r => 
                                            r.id === rule.id 
                                              ? { ...r, hardCapUnits: parseInt(e.target.value) || null } 
                                              : r
                                          );
                                          setEditingRules(newRules);
                                        }}
                                      />
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingPlan(null)} data-testid="button-cancel-edit-plan">
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    // Save plan details
                    await updatePlan.mutateAsync({
                      id: editingPlan.id,
                      name: editingPlan.name,
                      description: editingPlan.description || undefined,
                      monthlyPriceCents: editingPlan.monthlyPriceCents,
                      maxSeats: editingPlan.maxSeats || undefined,
                    });
                    
                    // Save all meter rules
                    const promises = editingRules.map(rule => {
                      const updates: any = {};
                      if (rule.ruleType === 'INCLUDED_QUOTA') {
                        updates.includedUnitsMonthly = rule.includedUnitsMonthly ?? undefined;
                      } else if (rule.ruleType === 'HARD_CAP') {
                        updates.hardCapUnits = rule.hardCapUnits ?? undefined;
                      } else if (rule.ruleType === 'METERED_OVERAGE') {
                        updates.overageUnitPriceMicrocents = rule.overageUnitPriceMicrocents ?? undefined;
                      }
                      return updateRule.mutateAsync({ planId: editingPlan.id, ruleId: rule.id, ...updates });
                    });
                    await Promise.all(promises);
                  }}
                  disabled={updatePlan.isPending || updateRule.isPending}
                  data-testid="button-save-plan"
                >
                  {(updatePlan.isPending || updateRule.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Plan</DialogTitle>
            <DialogDescription>Add a new subscription plan with default meter rules</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan Code</Label>
                <Input
                  value={newPlan.code}
                  onChange={(e) => setNewPlan({ ...newPlan, code: e.target.value.toUpperCase() })}
                  placeholder="ENTERPRISE"
                  data-testid="input-new-plan-code"
                />
              </div>
              <div className="space-y-2">
                <Label>Plan Name</Label>
                <Input
                  value={newPlan.name}
                  onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                  placeholder="Enterprise"
                  data-testid="input-new-plan-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newPlan.description}
                onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })}
                placeholder="Plan description..."
                data-testid="input-new-plan-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monthly Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newPlan.monthlyPriceCents / 100}
                  onChange={(e) => setNewPlan({ ...newPlan, monthlyPriceCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                  placeholder="0.00"
                  data-testid="input-new-plan-price"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Seats</Label>
                <Input
                  type="number"
                  value={newPlan.maxSeats}
                  onChange={(e) => setNewPlan({ ...newPlan, maxSeats: e.target.value })}
                  placeholder="Unlimited"
                  data-testid="input-new-plan-seats"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createPlan.mutate({
                code: newPlan.code,
                name: newPlan.name,
                description: newPlan.description || undefined,
                monthlyPriceCents: newPlan.monthlyPriceCents,
                maxSeats: newPlan.maxSeats ? parseInt(newPlan.maxSeats) : undefined,
              })}
              disabled={!newPlan.code || !newPlan.name || createPlan.isPending}
              data-testid="button-save-new-plan"
            >
              {createPlan.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletePlanId !== null} onOpenChange={() => setDeletePlanId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this plan? This will remove all associated meter rules and features. Plans with active subscriptions cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePlanId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletePlanId && deletePlan.mutate(deletePlanId)}
              disabled={deletePlan.isPending}
              data-testid="button-confirm-delete-plan"
            >
              {deletePlan.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface OrgMember {
  id: number;
  organizationId: number;
  userId: string;
  role: string;
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

function OrgMembersEditor({ orgId, allUsers }: { orgId: number; allUsers: User[] }) {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("member");

  const { data: members, isLoading } = useQuery<OrgMember[]>({
    queryKey: ['/api/organizations', orgId, 'members'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/members`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const addMember = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest('POST', `/api/organizations/${orgId}/members`, { userId, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'members'] });
      toast({ title: "Success", description: "Member added to organization" });
      setSelectedUserId("");
      setSelectedRole("member");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add member", variant: "destructive" });
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest('PUT', `/api/organizations/${orgId}/members/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'members'] });
      toast({ title: "Success", description: "Role updated" });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest('DELETE', `/api/organizations/${orgId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'members'] });
      toast({ title: "Success", description: "Member removed" });
    },
  });

  const existingMemberIds = members?.map(m => m.userId) || [];
  const availableUsers = allUsers.filter(u => !existingMemberIds.includes(u.id));

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-base font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Organization Members
        </Label>
        <Badge variant="secondary">{members?.length || 0} members</Badge>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">Add User</Label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger data-testid="select-add-member-user">
              <SelectValue placeholder="Select a user..." />
            </SelectTrigger>
            <SelectContent>
              {availableUsers.length === 0 ? (
                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                  All users are already members
                </div>
              ) : (
                availableUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.email})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="w-32 space-y-1">
          <Label className="text-xs text-muted-foreground">Role</Label>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger data-testid="select-add-member-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="org_admin">Admin</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          size="default"
          onClick={() => selectedUserId && addMember.mutate({ userId: selectedUserId, role: selectedRole })}
          disabled={!selectedUserId || addMember.isPending}
          data-testid="button-add-org-member"
        >
          {addMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : members && members.length > 0 ? (
        <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
          {members.map(member => (
            <div key={member.id} className="flex items-center justify-between gap-2 p-2" data-testid={`org-member-row-${member.userId}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {member.user?.firstName} {member.user?.lastName}
                </div>
                <div className="text-xs text-muted-foreground truncate">{member.user?.email}</div>
              </div>
              <Select 
                value={member.role} 
                onValueChange={(role) => updateRole.mutate({ userId: member.userId, role })}
              >
                <SelectTrigger className="w-24 h-8" data-testid={`select-member-role-${member.userId}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => removeMember.mutate(member.userId)}
                disabled={removeMember.isPending}
                data-testid={`button-remove-member-${member.userId}`}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-sm text-muted-foreground border rounded-lg">
          No members yet. Add users above.
        </div>
      )}
    </div>
  );
}

interface CreditCost {
  resourceType: string;
  creditCost: number;
  displayName: string;
  description: string | null;
}

function CreditCostsTab() {
  const { toast } = useToast();
  const [editingCost, setEditingCost] = useState<CreditCost | null>(null);
  const [newCreditCost, setNewCreditCost] = useState<number>(0);

  const { data: creditCosts, isLoading } = useQuery<CreditCost[]>({
    queryKey: ['/api/admin/credit-costs']
  });

  const updateCost = useMutation({
    mutationFn: async ({ resourceType, creditCost }: { resourceType: string; creditCost: number }) => {
      return apiRequest('PUT', `/api/admin/credit-costs/${resourceType}`, { creditCost });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/credit-costs'] });
      toast({ title: "Success", description: "Credit cost updated" });
      setEditingCost(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update credit cost", variant: "destructive" });
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Credit Pricing
          </CardTitle>
          <CardDescription>
            Manage how many credits each resource type costs when created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource Type</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Credits Cost</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creditCosts?.map((cost) => (
                <TableRow key={cost.resourceType} data-testid={`credit-cost-row-${cost.resourceType}`}>
                  <TableCell className="font-mono text-sm">{cost.resourceType}</TableCell>
                  <TableCell>{cost.displayName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{cost.description || '-'}</TableCell>
                  <TableCell className="text-right font-mono">
                    <div className="flex items-center justify-end gap-2">
                      {editingCost?.resourceType === cost.resourceType ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newCreditCost / 100}
                          onChange={(e) => setNewCreditCost(Math.round(parseFloat(e.target.value) * 100) || 0)}
                          className="w-24 text-right"
                          data-testid={`input-credit-cost-${cost.resourceType}`}
                        />
                      ) : (
                        <span className="font-semibold">{(cost.creditCost / 100).toFixed(cost.creditCost % 100 === 0 ? 0 : 2)}</span>
                      )}
                      <span className="text-muted-foreground text-xs whitespace-nowrap">
                        credits
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {editingCost?.resourceType === cost.resourceType ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingCost(null)}
                          data-testid={`button-cancel-edit-${cost.resourceType}`}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => updateCost.mutate({ resourceType: cost.resourceType, creditCost: newCreditCost })}
                          disabled={updateCost.isPending}
                          data-testid={`button-save-${cost.resourceType}`}
                        >
                          {updateCost.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingCost(cost);
                          setNewCreditCost(cost.creditCost);
                        }}
                        data-testid={`button-edit-${cost.resourceType}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit Pricing Guide</CardTitle>
          <CardDescription>Reference for setting credit costs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-muted">
              <div className="font-medium">1 credit</div>
              <div className="text-muted-foreground">Task, issue, risk, document</div>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <div className="font-medium">5 credits</div>
              <div className="text-muted-foreground">Project (complex)</div>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <div className="font-medium">10 credits</div>
              <div className="text-muted-foreground">Portfolio (strategic)</div>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <div className="font-medium">3 credits</div>
              <div className="text-muted-foreground">AI Run, Reports</div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Adjust costs based on the complexity and resource intensity of each action. 
            Higher costs for resource-intensive operations, lower costs for simple data entries.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
