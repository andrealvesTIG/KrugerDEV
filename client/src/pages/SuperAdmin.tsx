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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, Building2, Users, Plus, Edit, ShieldAlert, Crown, Database, Sparkles, Eraser, CreditCard, DollarSign } from "lucide-react";
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

  const { data: organizations, isLoading } = useQuery<Organization[]>({
    queryKey: ['/api/organizations']
  });

  const { data: industries } = useQuery<IndustryOption[]>({
    queryKey: ['/api/demo-data/industries'],
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
      toast({ title: "Success", description: "Organization deleted" });
      setDeleteId(null);
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Organization Name</Label>
              <Input 
                value={editingOrg?.name || ''} 
                onChange={e => setEditingOrg(prev => prev ? {...prev, name: e.target.value} : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                value={editingOrg?.description || ''} 
                onChange={e => setEditingOrg(prev => prev ? {...prev, description: e.target.value} : null)}
              />
            </div>
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
            <DialogTitle>Delete Organization</DialogTitle>
            <DialogDescription>
              Are you sure? This will remove the organization and all its data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteOrg.mutate(deleteId)}>
              Delete
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

function AllUsersTab() {
  const { toast } = useToast();
  
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['/api/users']
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {(!users || users.length === 0) && (
          <div className="text-center py-8 text-slate-500">No users found.</div>
        )}
      </CardContent>
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

  const { data: plans, isLoading } = useQuery<PlanData[]>({
    queryKey: ['/api/billing/plans']
  });

  const updatePlan = useMutation({
    mutationFn: async (data: { id: number; name?: string; description?: string; monthlyPriceCents?: number; maxSeats?: number }) => {
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
    if (cents === null || cents === 0) return "Free";
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription Plans
          </CardTitle>
          <CardDescription>Configure pricing, quotas, and features for each plan</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Monthly Price</TableHead>
                <TableHead>Max Seats</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans?.map(plan => (
                <TableRow key={plan.id} data-testid={`plan-row-${plan.id}`}>
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
                  <Input
                    id="plan-price"
                    type="number"
                    step="0.01"
                    value={(editingPlan.monthlyPriceCents || 0) / 100}
                    onChange={(e) => setEditingPlan({ 
                      ...editingPlan, 
                      monthlyPriceCents: Math.round(parseFloat(e.target.value || "0") * 100) 
                    })}
                    data-testid="input-plan-price"
                  />
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
                  <DollarSign className="h-4 w-4" />
                  Usage Quotas & Pricing
                </h4>
                
                {loadingRules ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Meter</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead className="text-right">Save</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editingRules.map(rule => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-medium">
                            {rule.meter.name}
                            {rule.isSharedPool && (
                              <Badge variant="outline" className="ml-2 text-xs">Shared</Badge>
                            )}
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
                                className="w-24"
                                value={rule.includedUnitsMonthly || ""}
                                onChange={(e) => {
                                  const newRules = editingRules.map(r => 
                                    r.id === rule.id 
                                      ? { ...r, includedUnitsMonthly: parseInt(e.target.value) || null } 
                                      : r
                                  );
                                  setEditingRules(newRules);
                                }}
                                data-testid={`input-quota-${rule.id}`}
                              />
                            )}
                            {rule.ruleType === "HARD_CAP" && (
                              <Input
                                type="number"
                                className="w-24"
                                value={rule.hardCapUnits || ""}
                                onChange={(e) => {
                                  const newRules = editingRules.map(r => 
                                    r.id === rule.id 
                                      ? { ...r, hardCapUnits: parseInt(e.target.value) || null } 
                                      : r
                                  );
                                  setEditingRules(newRules);
                                }}
                                data-testid={`input-cap-${rule.id}`}
                              />
                            )}
                            {rule.ruleType === "METERED_OVERAGE" && (
                              <div className="flex items-center gap-1">
                                <span className="text-sm text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  step="0.0001"
                                  className="w-24"
                                  value={(rule.overageUnitPriceMicrocents || 0) / 1000000}
                                  onChange={(e) => {
                                    const newRules = editingRules.map(r => 
                                      r.id === rule.id 
                                        ? { ...r, overageUnitPriceMicrocents: Math.round(parseFloat(e.target.value || "0") * 1000000) } 
                                        : r
                                    );
                                    setEditingRules(newRules);
                                  }}
                                  data-testid={`input-overage-${rule.id}`}
                                />
                                <span className="text-sm text-muted-foreground">/unit</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const updates: any = {};
                                if (rule.ruleType === "INCLUDED_QUOTA") {
                                  updates.includedUnitsMonthly = rule.includedUnitsMonthly;
                                } else if (rule.ruleType === "HARD_CAP") {
                                  updates.hardCapUnits = rule.hardCapUnits;
                                } else if (rule.ruleType === "METERED_OVERAGE") {
                                  updates.overageUnitPriceMicrocents = rule.overageUnitPriceMicrocents;
                                }
                                updateRule.mutate({ planId: editingPlan.id, ruleId: rule.id, ...updates });
                              }}
                              disabled={updateRule.isPending}
                              data-testid={`button-save-rule-${rule.id}`}
                            >
                              {updateRule.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingPlan(null)} data-testid="button-cancel-edit-plan">
                  Cancel
                </Button>
                <Button
                  onClick={() => updatePlan.mutate({
                    id: editingPlan.id,
                    name: editingPlan.name,
                    description: editingPlan.description || undefined,
                    monthlyPriceCents: editingPlan.monthlyPriceCents || 0,
                    maxSeats: editingPlan.maxSeats || undefined,
                  })}
                  disabled={updatePlan.isPending}
                  data-testid="button-save-plan"
                >
                  {updatePlan.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Plan
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
