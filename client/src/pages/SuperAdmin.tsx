import { useState, useMemo } from "react";
import { normalizeSearch } from "@/lib/utils";
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
import { Loader2, Trash2, Building2, Users, Plus, Edit, ShieldAlert, Crown, Database, Sparkles, Eraser, CreditCard, DollarSign, UserPlus, RotateCcw, ChevronDown, ChevronRight, Archive, Wallet, ArrowUp, ArrowDown, Search, Settings2, FileCheck, Activity, BarChart3, AlertTriangle, Clock, Globe, Zap, HardDrive, TrendingUp, RefreshCw, HelpCircle, MessageSquare, CheckCircle, XCircle, Eye, Download, Mail, Copy, Send } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Organization, User } from "@shared/schema";

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const sanitize = (v: string) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return s;
  };
  const escape = (v: string) => `"${sanitize(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const isMarketing = user?.role === "marketing";
  const hasAdminAccess = isSuperAdmin || isMarketing;

  if (!hasAdminAccess) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-2xl font-bold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground">You need Super Admin or Marketing privileges to access this page.</p>
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
          <TabsTrigger value="consents" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2">
            <FileCheck className="h-4 w-4" />
            User Consents
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2" data-testid="tab-monitoring">
            <Activity className="h-4 w-4" />
            Monitoring
          </TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2" data-testid="tab-analytics">
            <TrendingUp className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="help-tickets" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2" data-testid="tab-help-tickets">
            <HelpCircle className="h-4 w-4" />
            Help Tickets
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
          <TabsContent value="consents">
            <ConsentsTab />
          </TabsContent>
          <TabsContent value="monitoring">
            <MonitoringTab />
          </TabsContent>
          <TabsContent value="analytics">
            <AnalyticsTab />
          </TabsContent>
          <TabsContent value="help-tickets">
            <HelpTicketsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

interface Plan {
  id: number;
  code: string;
  name: string;
  maxSeats: number | null;
  monthlyPriceCents: number;
}

interface OrgBillingInfo {
  subscription: {
    id: number;
    planId: number;
    status: string;
    bonusSeats: number;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  } | null;
  currentPlan: Plan | null;
  availablePlans: Plan[];
  billingHidden: boolean;
}

type OrgColumnKey = 'name' | 'slug' | 'description' | 'owner' | 'members' | 'plan' | 'created';

const defaultOrgColumns: OrgColumnKey[] = ['name', 'slug', 'description', 'plan', 'created'];

function OrganizationsTab() {
  const { user } = useAuth();
  const isMarketing = user?.role === 'marketing';
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
  const [billingOrg, setBillingOrg] = useState<Organization | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
  const [bonusSeats, setBonusSeats] = useState<string | null>(null);
  const [billingHidden, setBillingHidden] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<OrgColumnKey[]>(defaultOrgColumns);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>("newest");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const pageSize = 15;

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

  const { data: allOrgMembers } = useQuery<{ organizationId: number; userId: string }[]>({
    queryKey: ['/api/admin/organization-members'],
    queryFn: async () => {
      const res = await fetch('/api/admin/organization-members', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: user?.role === 'super_admin',
  });

  interface OrgSubscription {
    orgId: number;
    planName: string | null;
    planCode: string | null;
    status: string;
  }

  const { data: orgSubscriptions } = useQuery<OrgSubscription[]>({
    queryKey: ['/api/admin/organizations/subscriptions'],
  });

  const getOrgPlan = (orgId: number) => {
    return orgSubscriptions?.find(s => s.orgId === orgId) ?? null;
  };

  const getMemberCount = (orgId: number) => {
    return allOrgMembers?.filter(m => m.organizationId === orgId).length ?? 0;
  };

  const getOwnerName = (ownerId: string | null) => {
    if (!ownerId) return '-';
    const owner = users?.find(u => u.id === ownerId);
    return owner ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.email : ownerId;
  };

  const filteredOrganizations = useMemo(() => {
    let result = organizations ?? [];
    if (searchQuery) {
      const q = normalizeSearch(searchQuery);
      result = result.filter(org =>
        normalizeSearch(org.name).includes(q) ||
        normalizeSearch(org.slug).includes(q) ||
        normalizeSearch(org.description).includes(q) ||
        normalizeSearch(getOwnerName(org.ownerId)).includes(q)
      );
    }
    if (planFilter !== 'all') {
      if (planFilter === 'no_plan') {
        result = result.filter(org => !getOrgPlan(org.id));
      } else {
        result = result.filter(org => {
          const plan = getOrgPlan(org.id);
          return plan?.planCode === planFilter;
        });
      }
    }
    const sorted = [...result];
    switch (sortBy) {
      case "newest":
        sorted.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
        break;
      case "oldest":
        sorted.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
        break;
      case "name-asc":
        sorted.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        break;
      case "name-desc":
        sorted.sort((a, b) => (b.name ?? '').localeCompare(a.name ?? ''));
        break;
      case "members":
        sorted.sort((a, b) => getMemberCount(b.id) - getMemberCount(a.id));
        break;
    }
    return sorted;
  }, [organizations, searchQuery, sortBy, users, allOrgMembers, planFilter, orgSubscriptions]);

  const totalPages = Math.max(1, Math.ceil((filteredOrganizations?.length ?? 0) / pageSize));
  const effectiveCurrentPage = Math.min(currentPage, totalPages);
  const paginatedOrganizations = useMemo(() => {
    const start = (effectiveCurrentPage - 1) * pageSize;
    return filteredOrganizations.slice(start, start + pageSize);
  }, [filteredOrganizations, effectiveCurrentPage, pageSize]);

  const toggleColumn = (col: OrgColumnKey) => {
    setVisibleColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const columnLabels: Record<OrgColumnKey, string> = {
    name: 'Name',
    slug: 'Slug',
    description: 'Description',
    owner: 'Owner',
    members: 'Members',
    plan: 'Plan',
    created: 'Created',
  };

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

  const { data: billingInfo, isLoading: billingLoading, error: billingError } = useQuery<OrgBillingInfo>({
    queryKey: ['/api/admin/organizations', billingOrg?.id, 'billing'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/organizations/${billingOrg?.id}/billing`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch billing');
      return res.json();
    },
    enabled: !!billingOrg,
    staleTime: 30000,
    gcTime: 60000,
    retry: false,
  });

  const updateBilling = useMutation({
    mutationFn: async ({ planCode, bonusSeats, billingHidden }: { planCode?: string; bonusSeats?: number; billingHidden?: boolean }) => {
      return apiRequest('PUT', `/api/admin/organizations/${billingOrg?.id}/billing`, { planCode, bonusSeats, billingHidden });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', billingOrg?.id, 'billing'] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${billingOrg?.id}/seats`] });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      toast({ title: "Success", description: "Organization billing updated" });
      setBillingOrg(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update billing", variant: "destructive" });
    }
  });

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>All Organizations</CardTitle>
          <CardDescription>Manage organization tenants in the system</CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-8 w-[200px]"
              data-testid="input-org-search"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-[160px]" data-testid="select-sort-by">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="name-asc">Name A-Z</SelectItem>
              <SelectItem value="name-desc">Name Z-A</SelectItem>
              <SelectItem value="members">Most Members</SelectItem>
            </SelectContent>
          </Select>
          <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-[140px]" data-testid="select-plan-filter">
              <SelectValue placeholder="Plan..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              <SelectItem value="no_plan">No Plan</SelectItem>
              {Array.from(new Set(orgSubscriptions?.map(s => s.planCode).filter(Boolean) ?? [])).map(code => {
                const sub = orgSubscriptions?.find(s => s.planCode === code);
                return (
                  <SelectItem key={code!} value={code!}>{sub?.planName || code}</SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-xs">
            {filteredOrganizations.length} org{filteredOrganizations.length !== 1 ? 's' : ''}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-column-toggle">
                <Settings2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(columnLabels) as OrgColumnKey[]).map(col => (
                <DropdownMenuCheckboxItem
                  key={col}
                  checked={visibleColumns.includes(col)}
                  onCheckedChange={() => toggleColumn(col)}
                >
                  {columnLabels[col]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              const headers = ['Name', 'Slug', 'Description', 'Owner', 'Members', 'Plan', 'Status', 'Created'];
              const rows = filteredOrganizations.map(org => {
                const plan = getOrgPlan(org.id);
                return [
                  org.name,
                  org.slug,
                  org.description || '',
                  getOwnerName(org.ownerId),
                  String(getMemberCount(org.id)),
                  plan?.planName || plan?.planCode || 'No plan',
                  plan?.status || 'N/A',
                  org.createdAt ? format(new Date(org.createdAt), 'yyyy-MM-dd') : '',
                ];
              });
              downloadCsv('organizations.csv', headers, rows);
            }}
            data-testid="button-export-orgs"
            title="Export to CSV"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} disabled={isMarketing} data-testid="button-create-org">
            <Plus className="h-4 w-4 mr-2" />
            Create Organization
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.includes('name') && <TableHead>Name</TableHead>}
              {visibleColumns.includes('slug') && <TableHead>Slug</TableHead>}
              {visibleColumns.includes('description') && <TableHead>Description</TableHead>}
              {visibleColumns.includes('owner') && <TableHead>Owner</TableHead>}
              {visibleColumns.includes('members') && <TableHead>Members</TableHead>}
              {visibleColumns.includes('plan') && <TableHead>Plan</TableHead>}
              {visibleColumns.includes('created') && <TableHead>Created</TableHead>}
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedOrganizations?.map(org => (
              <TableRow key={org.id} data-testid={`org-row-${org.id}`}>
                {visibleColumns.includes('name') && <TableCell className="font-medium">{org.name}</TableCell>}
                {visibleColumns.includes('slug') && (
                  <TableCell>
                    <Badge variant="outline">{org.slug}</Badge>
                  </TableCell>
                )}
                {visibleColumns.includes('description') && <TableCell className="max-w-[200px] truncate">{org.description || '-'}</TableCell>}
                {visibleColumns.includes('owner') && <TableCell>{getOwnerName(org.ownerId)}</TableCell>}
                {visibleColumns.includes('members') && (
                  <TableCell>
                    <Badge variant="secondary">{getMemberCount(org.id)}</Badge>
                  </TableCell>
                )}
                {visibleColumns.includes('plan') && (
                  <TableCell>
                    {(() => {
                      const plan = getOrgPlan(org.id);
                      if (!plan) return <span className="text-xs text-muted-foreground">No plan</span>;
                      return (
                        <div className="flex items-center gap-1">
                          <Badge
                            variant={plan.status === 'ACTIVE' ? 'secondary' : 'outline'}
                            className="text-xs"
                            data-testid={`badge-plan-${org.id}`}
                          >
                            {plan.planName || plan.planCode}
                          </Badge>
                          {plan.status !== 'ACTIVE' && (
                            <Badge variant="outline" className="text-xs text-amber-500">
                              {plan.status}
                            </Badge>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                )}
                {visibleColumns.includes('created') && (
                  <TableCell>
                    {org.createdAt ? format(new Date(org.createdAt), 'MMM d, yyyy') : 'N/A'}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setDemoDataOrg(org)}
                      disabled={isMarketing}
                      data-testid={`button-demo-data-${org.id}`}
                      title="Generate demo data"
                    >
                      <Sparkles className="h-4 w-4 text-amber-500" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setDeleteDemoDataOrg(org)}
                      disabled={isMarketing}
                      data-testid={`button-remove-demo-data-${org.id}`}
                      title="Remove all demo data"
                    >
                      <Eraser className="h-4 w-4 text-red-400" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => {
                        setBillingOrg(org);
                        setSelectedPlanCode(null);
                        setBonusSeats(null);
                        setBillingHidden(null);
                      }}
                      disabled={isMarketing}
                      data-testid={`button-billing-${org.id}`}
                      title="Manage billing & seats"
                    >
                      <CreditCard className="h-4 w-4 text-emerald-500" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setEditingOrg(org)}
                      disabled={isMarketing}
                      data-testid={`button-edit-org-${org.id}`}
                    >
                      <Edit className="h-4 w-4 text-slate-400" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setDeleteId(org.id)}
                      disabled={isMarketing}
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
        {filteredOrganizations?.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            {searchQuery ? 'No organizations match your search.' : 'No organizations yet. Create one to get started.'}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 pt-4 border-t mt-4">
            <div className="text-sm text-muted-foreground">
              Showing {((effectiveCurrentPage - 1) * pageSize) + 1}–{Math.min(effectiveCurrentPage * pageSize, filteredOrganizations.length)} of {filteredOrganizations.length}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={effectiveCurrentPage <= 1}
                onClick={() => setCurrentPage(1)}
                data-testid="button-page-first"
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={effectiveCurrentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                data-testid="button-page-prev"
              >
                Previous
              </Button>
              <span className="px-3 text-sm text-muted-foreground">
                Page {effectiveCurrentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={effectiveCurrentPage >= totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                data-testid="button-page-next"
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={effectiveCurrentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                data-testid="button-page-last"
              >
                Last
              </Button>
            </div>
          </div>
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
                            disabled={isMarketing}
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

      <Dialog open={billingOrg !== null} onOpenChange={() => setBillingOrg(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-500" />
              Manage Billing - {billingOrg?.name}
            </DialogTitle>
            <DialogDescription>
              Override plan and set bonus seats for this organization. Changes bypass normal billing.
            </DialogDescription>
          </DialogHeader>
          {billingLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : billingError ? (
            <div className="text-center py-8 text-destructive">
              <p>Failed to load billing information.</p>
              <p className="text-sm text-muted-foreground mt-2">Please close and try again.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted border p-4 space-y-2">
                <p className="text-sm font-medium">Current Status</p>
                <div className="flex items-center gap-2">
                  <Badge variant={billingInfo?.subscription ? "default" : "secondary"}>
                    {billingInfo?.currentPlan?.name || "No Plan"}
                  </Badge>
                  {billingInfo?.subscription && (
                    <Badge variant="outline">
                      {billingInfo.subscription.status}
                    </Badge>
                  )}
                </div>
                {billingInfo?.currentPlan && (
                  <p className="text-sm text-muted-foreground">
                    Plan seats: {billingInfo.currentPlan.maxSeats === null ? 'Unlimited' : billingInfo.currentPlan.maxSeats}
                    {(billingInfo?.subscription?.bonusSeats ?? 0) > 0 && ` + ${billingInfo.subscription?.bonusSeats} bonus`}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Change Plan</Label>
                <Select 
                  value={selectedPlanCode ?? billingInfo?.currentPlan?.code ?? ""} 
                  onValueChange={setSelectedPlanCode}
                >
                  <SelectTrigger data-testid="select-plan">
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {billingInfo?.availablePlans?.map(plan => (
                      <SelectItem key={plan.code} value={plan.code}>
                        {plan.name} ({plan.maxSeats === null ? 'Unlimited' : `${plan.maxSeats} seats`})
                        {plan.monthlyPriceCents === null 
                          ? ' - Contact Us' 
                          : plan.monthlyPriceCents > 0 
                            ? ` - $${(plan.monthlyPriceCents / 100).toFixed(2)}/mo` 
                            : ' - Free'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Bonus Seats</Label>
                <Input
                  type="number"
                  min="0"
                  value={bonusSeats ?? billingInfo?.subscription?.bonusSeats?.toString() ?? "0"}
                  onChange={(e) => setBonusSeats(e.target.value)}
                  placeholder="0"
                  data-testid="input-bonus-seats"
                />
                <p className="text-xs text-muted-foreground">
                  Additional seats granted as a bonus. These are added to the plan's seat limit.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-4">
                <Checkbox
                  id="billing-hidden"
                  checked={billingHidden ?? billingInfo?.billingHidden ?? false}
                  onCheckedChange={(checked) => setBillingHidden(!!checked)}
                  data-testid="checkbox-billing-hidden"
                />
                <div className="space-y-0.5">
                  <Label htmlFor="billing-hidden" className="cursor-pointer">Hide Billing Menu</Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, the Billing page will be hidden from this organization's members.
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBillingOrg(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const finalPlanCode = selectedPlanCode ?? billingInfo?.currentPlan?.code;
                const finalBonusSeats = bonusSeats !== null 
                  ? parseInt(bonusSeats) 
                  : (billingInfo?.subscription?.bonusSeats ?? 0);
                const finalBillingHidden = billingHidden ?? billingInfo?.billingHidden ?? false;
                updateBilling.mutate({
                  planCode: finalPlanCode,
                  bonusSeats: isNaN(finalBonusSeats) ? 0 : finalBonusSeats,
                  billingHidden: finalBillingHidden
                });
              }}
              disabled={updateBilling.isPending || billingLoading}
              data-testid="button-save-billing"
            >
              {updateBilling.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
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

type UserSortField = 'name' | 'email' | 'role' | 'createdAt' | 'engagement';
type SortDirection = 'asc' | 'desc';

function AllUsersTab() {
  const { user: currentUser } = useAuth();
  const isMarketing = currentUser?.role === 'marketing';
  const { toast } = useToast();
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [addingOrgId, setAddingOrgId] = useState<string>("");
  const [addingOrgRole, setAddingOrgRole] = useState<string>("member");
  const [deactivateUserId, setDeactivateUserId] = useState<string | null>(null);
  const [deactivatedOpen, setDeactivatedOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<UserSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [verifiedFilter, setVerifiedFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [engagementFilter, setEngagementFilter] = useState<string>("all");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [activeCard, setActiveCard] = useState<string | null>(null);

  const resetAllFilters = () => {
    setSearchQuery('');
    setVerifiedFilter('all');
    setDateFrom('');
    setDateTo('');
    setEngagementFilter('all');
    setOrgFilter('all');
    setSortField('name');
    setSortDirection('asc');
    setCurrentPage(1);
    setActiveCard(null);
  };

  const handleCardClick = (card: string) => {
    if (activeCard === card) {
      resetAllFilters();
      return;
    }
    resetAllFilters();
    setActiveCard(card);
    setCurrentPage(1);
    switch (card) {
      case 'unverified':
        setVerifiedFilter('unverified');
        break;
      case 'no_org':
        setOrgFilter('no_org');
        break;
      case 'conversion_ready':
        setEngagementFilter('conversion_ready');
        setSortField('engagement');
        setSortDirection('desc');
        break;
    }
  };
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [upgradeTargetUsers, setUpgradeTargetUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [upgradeMessage, setUpgradeMessage] = useState("We've noticed you're getting great value from FridayReport.AI! We'd love to help you unlock even more powerful features with one of our paid plans.");
  const pageSize = 15;
  
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['/api/users']
  });

  const { data: allOrganizations } = useQuery<Organization[]>({
    queryKey: ['/api/organizations']
  });

  const { data: allOrgMembers } = useQuery<{ organizationId: number; userId: string }[]>({
    queryKey: ['/api/admin/organization-members'],
    queryFn: async () => {
      const res = await fetch('/api/admin/organization-members', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  interface OrgSub { orgId: number; planName: string | null; planCode: string | null; status: string; }
  const { data: orgSubscriptions } = useQuery<OrgSub[]>({
    queryKey: ['/api/admin/organizations/subscriptions'],
  });

  const getUserOrgs = (userId: string) => {
    const memberOrgIds = allOrgMembers?.filter(m => m.userId === userId).map(m => m.organizationId) ?? [];
    return allOrganizations?.filter(o => memberOrgIds.includes(o.id)) ?? [];
  };

  const getEngagementScore = (user: User) => {
    let score = 0;
    if (user.emailVerified) score += 25;
    if (user.onboardingCompleted) score += 25;
    if (user.termsAcceptedAt) score += 15;
    const orgCount = getUserOrgs(user.id).length;
    if (orgCount >= 1) score += 20;
    if (orgCount >= 2) score += 5;
    const daysSinceSignup = user.createdAt ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000) : 0;
    if (daysSinceSignup >= 7) score += 5;
    if (daysSinceSignup >= 30) score += 5;
    return Math.min(score, 100);
  };

  const getEngagementLabel = (score: number): { label: string; color: string } => {
    if (score >= 75) return { label: 'High', color: 'text-green-600 dark:text-green-400' };
    if (score >= 40) return { label: 'Medium', color: 'text-amber-600 dark:text-amber-400' };
    return { label: 'Low', color: 'text-muted-foreground' };
  };

  const isOnFreePlan = (userId: string) => {
    const userOrgIds = allOrgMembers?.filter(m => m.userId === userId).map(m => m.organizationId) ?? [];
    if (userOrgIds.length === 0) return true;
    return userOrgIds.every(orgId => {
      const sub = orgSubscriptions?.find(s => s.orgId === orgId);
      return !sub || sub.planCode === 'FREE';
    });
  };

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
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update user role", variant: "destructive" });
    }
  });

  const sendUpgradeOffer = useMutation({
    mutationFn: async ({ userIds, customMessage }: { userIds: string[]; customMessage: string }) => {
      const res = await apiRequest('POST', '/api/admin/send-upgrade-offer', { userIds, customMessage });
      return res.json();
    },
    onSuccess: (data: { sent: number; failed: number }) => {
      toast({ title: "Upgrade offers sent", description: `${data.sent} email${data.sent !== 1 ? 's' : ''} sent successfully${data.failed > 0 ? `, ${data.failed} failed` : ''}` });
      setUpgradeDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to send upgrade offers", variant: "destructive" });
    }
  });

  const openUpgradeDialog = (targetUsers: { id: string; name: string; email: string }[]) => {
    setUpgradeTargetUsers(targetUsers);
    setUpgradeDialogOpen(true);
  };

  const copyConversionEmails = () => {
    const conversionUsers = allActiveUsers.filter(u => getEngagementScore(u) >= 65 && isOnFreePlan(u.id));
    const emails = conversionUsers.map(u => u.email).filter(Boolean).join(', ');
    navigator.clipboard.writeText(emails).then(() => {
      toast({ title: "Copied", description: `${conversionUsers.length} email${conversionUsers.length !== 1 ? 's' : ''} copied to clipboard` });
    }).catch(() => {
      toast({ title: "Error", description: "Failed to copy to clipboard", variant: "destructive" });
    });
  };

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

  const deactivateUser = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest('PUT', `/api/users/${userId}/deactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({ title: "Success", description: "User deactivated" });
      setDeactivateUserId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to deactivate user", variant: "destructive" });
    }
  });

  const reactivateUser = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest('PUT', `/api/users/${userId}/reactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({ title: "Success", description: "User reactivated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to reactivate user", variant: "destructive" });
    }
  });

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setDeleteUserId(user.id);
  };

  const handleEditClick = (user: User) => {
    setEditingUser(user);
  };

  const handleSort = (field: UserSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Separate active and deactivated users
  const allActiveUsers = users?.filter(u => !u.deactivatedAt) || [];
  const deactivatedUsers = users?.filter(u => u.deactivatedAt) || [];

  const filteredUsers = allActiveUsers.filter(user => {
    if (searchQuery.trim()) {
      const query = normalizeSearch(searchQuery);
      const fullName = normalizeSearch(`${user.firstName || ''} ${user.lastName || ''}`);
      const email = normalizeSearch(user.email);
      const role = normalizeSearch(user.role || 'user');
      if (!fullName.includes(query) && !email.includes(query) && !role.includes(query)) return false;
    }
    if (verifiedFilter === 'verified' && !user.emailVerified) return false;
    if (verifiedFilter === 'unverified' && user.emailVerified) return false;
    if (dateFrom) {
      if (!user.createdAt) return false;
      if (new Date(user.createdAt) < new Date(dateFrom)) return false;
    }
    if (dateTo) {
      if (!user.createdAt) return false;
      if (new Date(user.createdAt) > new Date(dateTo + 'T23:59:59')) return false;
    }
    if (engagementFilter !== 'all') {
      const score = getEngagementScore(user);
      if (engagementFilter === 'high' && score < 75) return false;
      if (engagementFilter === 'medium' && (score < 40 || score >= 75)) return false;
      if (engagementFilter === 'low' && score >= 40) return false;
      if (engagementFilter === 'conversion_ready' && (score < 65 || !isOnFreePlan(user.id))) return false;
    }
    if (orgFilter === 'no_org' && getUserOrgs(user.id).length > 0) return false;
    if (orgFilter === 'has_org' && getUserOrgs(user.id).length === 0) return false;
    return true;
  });

  // Sort users
  const sortedActiveUsers = [...filteredUsers].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'name':
        const nameA = `${a.firstName || ''} ${a.lastName || ''}`.toLowerCase();
        const nameB = `${b.firstName || ''} ${b.lastName || ''}`.toLowerCase();
        comparison = nameA.localeCompare(nameB);
        break;
      case 'email':
        comparison = (a.email || '').localeCompare(b.email || '');
        break;
      case 'role':
        comparison = (a.role || 'user').localeCompare(b.role || 'user');
        break;
      case 'createdAt':
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        comparison = dateA - dateB;
        break;
      case 'engagement':
        comparison = getEngagementScore(a) - getEngagementScore(b);
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const totalUserPages = Math.max(1, Math.ceil(sortedActiveUsers.length / pageSize));
  const effectiveUserPage = Math.min(currentPage, totalUserPages);
  const activeUsers = useMemo(() => {
    const start = (effectiveUserPage - 1) * pageSize;
    return sortedActiveUsers.slice(start, start + pageSize);
  }, [sortedActiveUsers, effectiveUserPage, pageSize]);

  // Get organizations the user is NOT a member of (for adding)
  const availableOrgs = allOrganizations?.filter(
    org => !userMemberships?.some(m => m.organizationId === org.id)
  ) || [];

  if (isLoading) return <Loader2 className="animate-spin" />;

  const userToDeactivate = users?.find(u => u.id === deactivateUserId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>All System Users</CardTitle>
        <CardDescription>View and manage all users across organizations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div
            className={`border rounded-md p-4 cursor-pointer hover-elevate transition-colors ${activeCard === null ? 'border-primary/50 bg-primary/5' : ''}`}
            onClick={() => resetAllFilters()}
            data-testid="card-total-users"
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Users</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-users">{allActiveUsers.length}</p>
          </div>
          <div
            className={`border rounded-md p-4 cursor-pointer hover-elevate transition-colors ${activeCard === 'unverified' ? 'border-amber-500/50 bg-amber-500/5' : ''}`}
            onClick={() => handleCardClick('unverified')}
            data-testid="card-unverified-users"
          >
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Unverified</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-unverified-users">{allActiveUsers.filter(u => !u.emailVerified).length}</p>
          </div>
          <div
            className={`border rounded-md p-4 cursor-pointer hover-elevate transition-colors ${activeCard === 'no_org' ? 'border-primary/50 bg-primary/5' : ''}`}
            onClick={() => handleCardClick('no_org')}
            data-testid="card-no-org-users"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">No Organization</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-no-org-users">{allActiveUsers.filter(u => getUserOrgs(u.id).length === 0).length}</p>
          </div>
          <div className="border rounded-md p-4">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Deactivated</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-deactivated-users">{deactivatedUsers.length}</p>
          </div>
          <div
            className={`border rounded-md p-4 cursor-pointer hover-elevate transition-colors ${activeCard === 'conversion_ready' ? 'border-green-500/50 bg-green-500/5' : ''}`}
            onClick={() => handleCardClick('conversion_ready')}
            data-testid="card-conversion-ready"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-muted-foreground">Conversion Ready</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400" data-testid="text-conversion-ready">
              {allActiveUsers.filter(u => getEngagementScore(u) >= 65 && isOnFreePlan(u.id)).length}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <p className="text-xs text-muted-foreground">High engagement, free plan</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or role..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-9"
              data-testid="input-search-users"
            />
          </div>
          <Badge variant="secondary" className="text-xs">
            {sortedActiveUsers.length} user{sortedActiveUsers.length !== 1 ? 's' : ''}
          </Badge>
          {activeCard !== null && (
            <Button variant="outline" size="sm" onClick={resetAllFilters} data-testid="button-clear-filters">
              <XCircle className="h-3 w-3 mr-1" />
              Clear filters
            </Button>
          )}
          <Select value={verifiedFilter} onValueChange={(v) => { setVerifiedFilter(v); setActiveCard(null); setCurrentPage(1); }}>
            <SelectTrigger className="w-[140px]" data-testid="select-verified-filter">
              <SelectValue placeholder="Verification" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="unverified">Unverified</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
            className="w-[140px]"
            placeholder="From"
            data-testid="input-date-from"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
            className="w-[140px]"
            placeholder="To"
            data-testid="input-date-to"
          />
          <Select value={engagementFilter} onValueChange={(v) => { setEngagementFilter(v); setActiveCard(null); setCurrentPage(1); }}>
            <SelectTrigger className="w-[160px]" data-testid="select-engagement-filter">
              <SelectValue placeholder="Engagement" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Engagement</SelectItem>
              <SelectItem value="high">High Engagement</SelectItem>
              <SelectItem value="medium">Medium Engagement</SelectItem>
              <SelectItem value="low">Low Engagement</SelectItem>
              <SelectItem value="conversion_ready">Conversion Ready</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={copyConversionEmails}
            data-testid="button-copy-conversion-emails"
            title="Copy conversion-ready emails to clipboard"
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy Emails
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              const conversionUsers = allActiveUsers
                .filter(u => getEngagementScore(u) >= 65 && isOnFreePlan(u.id))
                .map(u => ({
                  id: u.id,
                  name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Unknown',
                  email: u.email || '',
                }));
              if (conversionUsers.length === 0) {
                toast({ title: "No users", description: "No conversion-ready users to send offers to" });
                return;
              }
              openUpgradeDialog(conversionUsers);
            }}
            data-testid="button-bulk-send-upgrade"
            title="Send upgrade offer to all conversion-ready users"
          >
            <Send className="h-3 w-3 mr-1" />
            Bulk Send Offer
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              const headers = ['Name', 'Email', 'System Role', 'Email Verified', 'Organizations', 'Engagement Score', 'Plan Status', 'Joined'];
              const rows = sortedActiveUsers.map(u => [
                `${u.firstName || ''} ${u.lastName || ''}`.trim(),
                u.email || '',
                u.role || 'user',
                u.emailVerified ? 'Yes' : 'No',
                getUserOrgs(u.id).map(o => o.name).join('; '),
                String(getEngagementScore(u)),
                isOnFreePlan(u.id) ? 'Free' : 'Paid',
                u.createdAt ? format(new Date(u.createdAt), 'yyyy-MM-dd') : '',
              ]);
              downloadCsv('users.csv', headers, rows);
            }}
            data-testid="button-export-users"
            title="Export to CSV"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('name')}
                data-testid="header-sort-name"
              >
                <div className="flex items-center gap-1">
                  Name
                  {sortField === 'name' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('email')}
                data-testid="header-sort-email"
              >
                <div className="flex items-center gap-1">
                  Email
                  {sortField === 'email' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('role')}
                data-testid="header-sort-role"
              >
                <div className="flex items-center gap-1">
                  System Role
                  {sortField === 'role' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </div>
              </TableHead>
              <TableHead>Organizations</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('engagement')}
                data-testid="header-sort-engagement"
              >
                <div className="flex items-center gap-1">
                  Engagement
                  {sortField === 'engagement' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('createdAt')}
                data-testid="header-sort-joined"
              >
                <div className="flex items-center gap-1">
                  Joined
                  {sortField === 'createdAt' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </div>
              </TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeUsers?.map(user => (
              <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                <TableCell className="font-medium">
                  {user.firstName} {user.lastName}
                </TableCell>
                <TableCell>{user.email || 'N/A'}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild disabled={isMarketing}>
                      <Button variant="outline" className="w-[140px] justify-between" data-testid={`select-role-trigger-${user.id}`}>
                        {user.role === 'super_admin' ? 'Super Admin' : user.role === 'marketing' ? 'Marketing' : 'User'}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuRadioGroup value={user.role || 'user'} onValueChange={(role) => {
                        updateUserRole.mutate({ userId: user.id, role });
                      }}>
                        <DropdownMenuRadioItem value="user">User</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="marketing">Marketing</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="super_admin">Super Admin</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {getUserOrgs(user.id).length > 0 ? (
                      getUserOrgs(user.id).slice(0, 3).map(org => (
                        <Badge key={org.id} variant="outline" className="text-xs" data-testid={`badge-user-org-${user.id}-${org.id}`}>
                          {org.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                    {getUserOrgs(user.id).length > 3 && (
                      <Badge variant="secondary" className="text-xs">+{getUserOrgs(user.id).length - 3}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {user.emailVerified ? (
                    <Badge variant="secondary" className="text-xs gap-1" data-testid={`badge-verified-${user.id}`}>
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      Yes
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs gap-1" data-testid={`badge-unverified-${user.id}`}>
                      <XCircle className="h-3 w-3 text-muted-foreground" />
                      No
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {(() => {
                    const score = getEngagementScore(user);
                    const { label, color } = getEngagementLabel(score);
                    const onFree = isOnFreePlan(user.id);
                    return (
                      <div className="flex items-center gap-2" data-testid={`engagement-${user.id}`}>
                        <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${score >= 75 ? 'bg-green-500' : score >= 40 ? 'bg-amber-500' : 'bg-muted-foreground/40'}`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium ${color}`}>{score}</span>
                        {score >= 65 && onFree && (
                          <Badge
                            variant="outline"
                            className="text-xs gap-1 border-green-500/50 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              openUpgradeDialog([{
                                id: user.id,
                                name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown',
                                email: user.email || '',
                              }]);
                            }}
                            data-testid={`button-upgrade-${user.id}`}
                          >
                            <Mail className="h-3 w-3 text-green-500" />
                          </Badge>
                        )}
                      </div>
                    );
                  })()}
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
                      disabled={isMarketing}
                      data-testid={`button-edit-user-${user.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeactivateUserId(user.id)}
                      disabled={isMarketing || user.id === currentUser?.id}
                      data-testid={`button-deactivate-user-${user.id}`}
                      title="Deactivate user"
                    >
                      <UserPlus className="h-4 w-4 rotate-45 text-amber-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(user)}
                      disabled={isMarketing || user.id === currentUser?.id}
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
        {activeUsers.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">No active users found.</div>
        )}

        {totalUserPages > 1 && (
          <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
            <span className="text-sm text-muted-foreground">
              Page {effectiveUserPage} of {totalUserPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={effectiveUserPage <= 1}
                data-testid="button-users-first-page"
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={effectiveUserPage <= 1}
                data-testid="button-users-prev-page"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalUserPages, p + 1))}
                disabled={effectiveUserPage >= totalUserPages}
                data-testid="button-users-next-page"
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalUserPages)}
                disabled={effectiveUserPage >= totalUserPages}
                data-testid="button-users-last-page"
              >
                Last
              </Button>
            </div>
          </div>
        )}

        {deactivatedUsers.length > 0 && (
          <Collapsible open={deactivatedOpen} onOpenChange={setDeactivatedOpen} className="mt-6">
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between" data-testid="button-toggle-deactivated-users">
                <span className="flex items-center gap-2">
                  <Archive className="h-4 w-4" />
                  Deactivated Users ({deactivatedUsers.length})
                </span>
                {deactivatedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Deactivated</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deactivatedUsers.map(user => (
                    <TableRow key={user.id} className="opacity-60" data-testid={`user-row-deactivated-${user.id}`}>
                      <TableCell className="font-medium">
                        {user.firstName} {user.lastName}
                      </TableCell>
                      <TableCell>{user.email || 'N/A'}</TableCell>
                      <TableCell>
                        {user.deactivatedAt ? format(new Date(user.deactivatedAt), 'MMM d, yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => reactivateUser.mutate(user.id)}
                            disabled={isMarketing || reactivateUser.isPending}
                            data-testid={`button-reactivate-user-${user.id}`}
                            title="Reactivate user"
                          >
                            <RotateCcw className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(user)}
                            disabled={isMarketing}
                            data-testid={`button-delete-deactivated-user-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>

      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent data-testid="dialog-upgrade-offer" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-green-500" />
              Send Upgrade Offer
            </DialogTitle>
            <DialogDescription>
              Send a personalized upgrade email to {upgradeTargetUsers.length === 1
                ? upgradeTargetUsers[0].name
                : `${upgradeTargetUsers.length} conversion-ready users`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Recipients</label>
              <div className="border rounded-md p-3 max-h-32 overflow-y-auto bg-muted/30">
                {upgradeTargetUsers.map(u => (
                  <div key={u.id} className="text-sm flex items-center gap-2 py-0.5">
                    <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-medium">{u.name}</span>
                    <span className="text-muted-foreground">{u.email}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Message</label>
              <Textarea
                value={upgradeMessage}
                onChange={(e) => setUpgradeMessage(e.target.value)}
                rows={4}
                className="resize-none"
                data-testid="textarea-upgrade-message"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This message will be included in the email along with plan benefits and a link to explore plans.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setUpgradeDialogOpen(false)} data-testid="button-cancel-upgrade">
              Cancel
            </Button>
            <Button
              onClick={() => sendUpgradeOffer.mutate({
                userIds: upgradeTargetUsers.map(u => u.id),
                customMessage: upgradeMessage,
              })}
              disabled={sendUpgradeOffer.isPending || !upgradeMessage.trim()}
              data-testid="button-confirm-upgrade"
            >
              {sendUpgradeOffer.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send to {upgradeTargetUsers.length} user{upgradeTargetUsers.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={!!deactivateUserId} onOpenChange={(open) => !open && setDeactivateUserId(null)}>
        <DialogContent data-testid="dialog-deactivate-user">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-amber-500" />
              Deactivate User
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate {userToDeactivate?.firstName} {userToDeactivate?.lastName} ({userToDeactivate?.email})? 
              The user will no longer be able to log in, but their data will be preserved. You can reactivate them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeactivateUserId(null)} data-testid="button-cancel-deactivate-user">
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-amber-500 hover:bg-amber-600"
              onClick={() => deactivateUserId && deactivateUser.mutate(deactivateUserId)}
              disabled={deactivateUser.isPending}
              data-testid="button-confirm-deactivate-user"
            >
              {deactivateUser.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deactivating...
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4 mr-2" />
                  Deactivate User
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
                      <TableHead className="w-[60px]">Org ID</TableHead>
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
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {membership.organizationId}
                          </TableCell>
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
                              disabled={isMarketing}
                            >
                              <SelectTrigger className="w-[120px]" data-testid={`select-membership-role-${membership.organizationId}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="org_admin">Org Admin</SelectItem>
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
                              disabled={isMarketing || removeMembership.isPending}
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
                      <SelectItem value="org_admin">Org Admin</SelectItem>
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
                    disabled={isMarketing || !addingOrgId || addMembership.isPending}
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
  extraSeatPriceCents: number | null;
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
  const [isInitializingSeats, setIsInitializingSeats] = useState(false);

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

  const initExtraSeatPrices = async () => {
    setIsInitializingSeats(true);
    try {
      const res = await fetch('/api/admin/plans/init-extra-seat-prices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to initialize extra seat prices');
      }
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plans'] });
      toast({ 
        title: "Extra Seat Prices Initialized", 
        description: `Professional: $5/seat, Business: $8/seat` 
      });
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to initialize extra seat prices", 
        variant: "destructive" 
      });
    }
    setIsInitializingSeats(false);
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
    mutationFn: async (data: { id: number; name?: string; description?: string; monthlyPriceCents?: number | null; maxSeats?: number; extraSeatPriceCents?: number | null }) => {
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

  const createRule = useMutation({
    mutationFn: async (data: { planId: number; meterId: number; ruleType: string; overageUnitPriceMicrocents?: number }) => {
      const { planId, ...ruleData } = data;
      return apiRequest('POST', `/api/admin/plans/${planId}/rules`, ruleData);
    },
    onSuccess: (_, variables) => {
      toast({ title: "Success", description: "Overage rule created" });
      fetchRules(variables.planId);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create rule", variant: "destructive" });
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
              onClick={initExtraSeatPrices} 
              disabled={isInitializingSeats}
              data-testid="button-init-seat-prices"
            >
              {isInitializingSeats ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <DollarSign className="h-4 w-4 mr-2" />
              )}
              Init Seat Prices
            </Button>
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
                <TableHead>Extra Seat Price</TableHead>
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
                    {plan.extraSeatPriceCents !== null 
                      ? `$${(plan.extraSeatPriceCents / 100).toFixed(2)}/mo`
                      : "N/A"}
                  </TableCell>
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
                <div className="space-y-2">
                  <Label htmlFor="plan-extra-seat-price">Extra Seat Price (cents/month)</Label>
                  <Input
                    id="plan-extra-seat-price"
                    type="number"
                    value={editingPlan.extraSeatPriceCents ?? ""}
                    placeholder="N/A (no extra seats allowed)"
                    onChange={(e) => setEditingPlan({ 
                      ...editingPlan, 
                      extraSeatPriceCents: e.target.value ? parseInt(e.target.value) : null 
                    })}
                    data-testid="input-plan-extra-seat-price"
                  />
                  <p className="text-xs text-muted-foreground">
                    Price per additional seat per month (e.g., 500 = $5.00/seat/month). Leave empty to disable extra seats.
                  </p>
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
                          
                          {overageRule ? (
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
                          ) : quotaRule && (
                            <div className="pt-3 border-t space-y-2">
                              <Label className="text-sm">Overage Pricing</Label>
                              <p className="text-xs text-muted-foreground mb-2">No overage rule configured for credits</p>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  if (editingPlan) {
                                    createRule.mutate({
                                      planId: editingPlan.id,
                                      meterId: quotaRule.meterId,
                                      ruleType: 'METERED_OVERAGE',
                                      overageUnitPriceMicrocents: 10000
                                    });
                                  }
                                }}
                                disabled={createRule.isPending}
                                data-testid="button-add-credits-overage"
                              >
                                {createRule.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                                Add Credits Overage Rule
                              </Button>
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
                      extraSeatPriceCents: editingPlan.extraSeatPriceCents,
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

interface ConsentRecord {
  id: number;
  userId: string;
  consentType: string;
  version: string;
  acceptedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  method: string;
  revoked: boolean;
  revokedAt: string | null;
  userName: string;
  userEmail: string;
}

interface ConsentStats {
  stats: { consentType: string; version: string; count: number }[];
  currentVersions: {
    terms_of_service: string;
    privacy_policy: string;
  };
}

function ConsentsTab() {
  const { toast } = useToast();

  const { data: consents, isLoading: consentsLoading } = useQuery<ConsentRecord[]>({
    queryKey: ["/api/admin/consents"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ConsentStats>({
    queryKey: ["/api/admin/consents/stats"],
  });

  if (consentsLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const formatConsentType = (type: string) => {
    switch (type) {
      case 'terms_of_service':
        return 'Terms of Service';
      case 'privacy_policy':
        return 'Privacy Policy';
      case 'marketing':
        return 'Marketing';
      default:
        return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Consent Statistics
          </CardTitle>
          <CardDescription>
            Overview of user consent acceptance by type and version
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats?.stats.map((stat, index) => (
              <div key={index} className="p-4 rounded-lg border bg-card">
                <div className="text-sm text-muted-foreground">{formatConsentType(stat.consentType)}</div>
                <div className="text-2xl font-bold">{stat.count}</div>
                <div className="text-xs text-muted-foreground">
                  Version: {stat.version}
                  {stats.currentVersions[stat.consentType as keyof typeof stats.currentVersions] === stat.version && (
                    <Badge variant="secondary" className="ml-2">Current</Badge>
                  )}
                </div>
              </div>
            ))}
            {(!stats?.stats || stats.stats.length === 0) && (
              <div className="col-span-full text-center text-muted-foreground py-8">
                No consent records yet
              </div>
            )}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-muted text-sm">
            <strong>Current Versions:</strong> Terms v{stats?.currentVersions.terms_of_service}, Privacy v{stats?.currentVersions.privacy_policy}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Consent Records</CardTitle>
          <CardDescription>
            Complete audit log of user consent acceptances
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Consent Type</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Accepted At</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consents?.map((consent) => (
                <TableRow key={consent.id} data-testid={`row-consent-${consent.id}`}>
                  <TableCell className="font-medium">{consent.userName || 'Unknown'}</TableCell>
                  <TableCell className="text-muted-foreground">{consent.userEmail || 'Unknown'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatConsentType(consent.consentType)}</Badge>
                  </TableCell>
                  <TableCell>{consent.version}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{consent.method}</TableCell>
                  <TableCell>{format(new Date(consent.acceptedAt), 'MMM d, yyyy h:mm a')}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {consent.ipAddress || '-'}
                  </TableCell>
                  <TableCell>
                    {consent.revoked ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!consents || consents.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No consent records found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

interface MonitoringOverview {
  summary: {
    activeUsers24h: number;
    requestsToday: number;
    avgResponseTime: string;
    errorRate: string;
    totalUsers: number;
    totalOrganizations: number;
    totalProjects: number;
  };
  charts: {
    requestsPerDay: Array<{ date: string; count: number }>;
    userRegistrations: Array<{ date: string; count: number }>;
  };
  topEndpoints: Array<{ path: string; method: string; count: number; avg_duration: number }>;
  recentErrors: Array<{ path: string; status_code: number; error_message: string | null; count: number }>;
}

interface UserActivity {
  hourlyActive: Array<{ hour: string; active_users: number }>;
  topUsers: Array<{ user_id: string; email: string; first_name: string; last_name: string; request_count: number; last_activity: string }>;
  dailyLogins: Array<{ date: string; unique_users: number }>;
}

interface FeatureUsage {
  featureUsage: Array<{ feature: string; total_requests: number; get_requests: number; post_requests: number; update_requests: number; delete_requests: number }>;
  trend: Array<{ date: string; feature: string; count: number }>;
}

interface PerformanceMetrics {
  percentiles: { p50: number; p90: number; p95: number; p99: number; avg: number; max: number; min: number };
  slowEndpoints: Array<{ path: string; method: string; avg_duration: number; max_duration: number; request_count: number }>;
  responseTrend: Array<{ hour: string; avg_duration: number; request_count: number }>;
  errorTrend: Array<{ hour: string; total_requests: number; error_count: number; error_rate: number }>;
}

interface DatabaseStats {
  tableCounts: Array<{ table_name: string; row_count: number }>;
  databaseSize: string;
  tableSizes: Array<{ table_name: string; total_size: string }>;
}

interface OrgUsage {
  organizations: Array<{ id: number; name: string; slug: string; member_count: number; project_count: number; task_count: number; api_requests_7d: number }>;
}

type MonitoringSubTab = 'overview' | 'api-logs' | 'users' | 'features' | 'performance' | 'database' | 'organizations';

function MonitoringTab() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<MonitoringSubTab>('overview');
  const [apiLogsPage, setApiLogsPage] = useState(1);
  const [methodFilter, setMethodFilter] = useState<string>('');
  const [pathFilter, setPathFilter] = useState<string>('');

  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useQuery<MonitoringOverview>({
    queryKey: ['/api/admin/monitoring/overview'],
  });

  const { data: userActivity, isLoading: activityLoading, refetch: refetchActivity } = useQuery<UserActivity>({
    queryKey: ['/api/admin/monitoring/user-activity'],
    enabled: subTab === 'users',
  });

  const { data: featureUsage, isLoading: featuresLoading, refetch: refetchFeatures } = useQuery<FeatureUsage>({
    queryKey: ['/api/admin/monitoring/feature-usage'],
    enabled: subTab === 'features',
  });

  const { data: performance, isLoading: perfLoading, refetch: refetchPerf } = useQuery<PerformanceMetrics>({
    queryKey: ['/api/admin/monitoring/performance'],
    enabled: subTab === 'performance',
  });

  const { data: databaseStats, isLoading: dbLoading, refetch: refetchDb } = useQuery<DatabaseStats>({
    queryKey: ['/api/admin/monitoring/database'],
    enabled: subTab === 'database',
  });

  const { data: orgUsage, isLoading: orgLoading, refetch: refetchOrg } = useQuery<OrgUsage>({
    queryKey: ['/api/admin/monitoring/organization-usage'],
    enabled: subTab === 'organizations',
  });

  const handleRefresh = () => {
    refetchOverview();
    if (subTab === 'users') refetchActivity();
    if (subTab === 'features') refetchFeatures();
    if (subTab === 'performance') refetchPerf();
    if (subTab === 'database') refetchDb();
    if (subTab === 'organizations') refetchOrg();
    toast({ title: "Data refreshed" });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatDuration = (ms: number | null | undefined) => {
    if (ms === null || ms === undefined) return '-';
    return `${Math.round(ms)}ms`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'MMM d, h:mm a');
    } catch {
      return dateStr;
    }
  };

  const renderOverview = () => {
    if (overviewLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!overview) {
      return (
        <div className="text-center text-muted-foreground py-8">
          No monitoring data available yet. API requests will be tracked automatically.
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card className="hover-elevate" data-testid="card-active-users">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="h-4 w-4" />
                Active Users (24h)
              </div>
              <div className="text-2xl font-bold mt-1">{formatNumber(overview.summary.activeUsers24h)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-requests-today">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Globe className="h-4 w-4" />
                Requests Today
              </div>
              <div className="text-2xl font-bold mt-1">{formatNumber(overview.summary.requestsToday)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-avg-response">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Zap className="h-4 w-4" />
                Avg Response
              </div>
              <div className="text-2xl font-bold mt-1">{overview.summary.avgResponseTime}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-error-rate">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <AlertTriangle className="h-4 w-4" />
                Error Rate
              </div>
              <div className="text-2xl font-bold mt-1">{overview.summary.errorRate}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-total-users">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="h-4 w-4" />
                Total Users
              </div>
              <div className="text-2xl font-bold mt-1">{formatNumber(overview.summary.totalUsers)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-total-orgs">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Building2 className="h-4 w-4" />
                Organizations
              </div>
              <div className="text-2xl font-bold mt-1">{formatNumber(overview.summary.totalOrganizations)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-total-projects">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <BarChart3 className="h-4 w-4" />
                Projects
              </div>
              <div className="text-2xl font-bold mt-1">{formatNumber(overview.summary.totalProjects)}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                Top Endpoints (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Avg Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.topEndpoints?.slice(0, 8).map((ep, i) => (
                    <TableRow key={i} data-testid={`row-endpoint-${i}`}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{ep.path}</TableCell>
                      <TableCell>
                        <Badge variant={ep.method === 'GET' ? 'secondary' : ep.method === 'POST' ? 'default' : 'outline'}>
                          {ep.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(Number(ep.count))}</TableCell>
                      <TableCell className="text-right">{formatDuration(ep.avg_duration)}</TableCell>
                    </TableRow>
                  ))}
                  {(!overview.topEndpoints || overview.topEndpoints.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">No data yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Recent Errors (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.recentErrors?.slice(0, 8).map((err, i) => (
                    <TableRow key={i} data-testid={`row-error-${i}`}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{err.path}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{err.status_code}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(Number(err.count))}</TableCell>
                    </TableRow>
                  ))}
                  {(!overview.recentErrors || overview.recentErrors.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">No errors</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5" />
                Requests Per Day (Last 7 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overview.charts.requestsPerDay?.map((day, i) => {
                  const maxCount = Math.max(...overview.charts.requestsPerDay.map(d => Number(d.count)));
                  const percentage = maxCount > 0 ? (Number(day.count) / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3" data-testid={`bar-requests-${i}`}>
                      <span className="text-xs text-muted-foreground w-24">{format(new Date(day.date), 'MMM d')}</span>
                      <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-300" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-16 text-right">{formatNumber(Number(day.count))}</span>
                    </div>
                  );
                })}
                {(!overview.charts.requestsPerDay || overview.charts.requestsPerDay.length === 0) && (
                  <div className="text-center text-muted-foreground py-4">No data yet</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="h-5 w-5" />
                User Registrations (Last 30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overview.charts.userRegistrations?.slice(0, 7).map((day, i) => {
                  const maxCount = Math.max(...overview.charts.userRegistrations.map(d => Number(d.count)));
                  const percentage = maxCount > 0 ? (Number(day.count) / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3" data-testid={`bar-registrations-${i}`}>
                      <span className="text-xs text-muted-foreground w-24">{format(new Date(day.date), 'MMM d')}</span>
                      <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-green-500 transition-all duration-300" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-16 text-right">{formatNumber(Number(day.count))}</span>
                    </div>
                  );
                })}
                {(!overview.charts.userRegistrations || overview.charts.userRegistrations.length === 0) && (
                  <div className="text-center text-muted-foreground py-4">No data yet</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderUserActivity = () => {
    if (activityLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!userActivity) {
      return <div className="text-center text-muted-foreground py-8">No user activity data yet</div>;
    }

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Most Active Users (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userActivity.topUsers?.map((user, i) => (
                  <TableRow key={i} data-testid={`row-active-user-${i}`}>
                    <TableCell className="font-medium">
                      {user.first_name || user.last_name 
                        ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                        : 'Unknown'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email || '-'}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(user.request_count))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatDate(user.last_activity)}</TableCell>
                  </TableRow>
                ))}
                {(!userActivity.topUsers || userActivity.topUsers.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">No data yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Active Users By Hour (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {userActivity.hourlyActive?.slice(0, 12).map((hour, i) => {
                const maxCount = Math.max(...userActivity.hourlyActive.map(h => Number(h.active_users)));
                const percentage = maxCount > 0 ? (Number(hour.active_users) / maxCount) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3" data-testid={`bar-hourly-${i}`}>
                    <span className="text-xs text-muted-foreground w-24">{format(new Date(hour.hour), 'h:mm a')}</span>
                    <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300" 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{Number(hour.active_users)}</span>
                  </div>
                );
              })}
              {(!userActivity.hourlyActive || userActivity.hourlyActive.length === 0) && (
                <div className="text-center text-muted-foreground py-4">No data yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderFeatureUsage = () => {
    if (featuresLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!featureUsage) {
      return <div className="text-center text-muted-foreground py-8">No feature usage data yet</div>;
    }

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Feature Usage (Last 7 Days)
            </CardTitle>
            <CardDescription>API requests grouped by feature area</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">GET</TableHead>
                  <TableHead className="text-right">POST</TableHead>
                  <TableHead className="text-right">UPDATE</TableHead>
                  <TableHead className="text-right">DELETE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {featureUsage.featureUsage?.map((feature, i) => (
                  <TableRow key={i} data-testid={`row-feature-${i}`}>
                    <TableCell className="font-medium">{feature.feature}</TableCell>
                    <TableCell className="text-right font-bold">{formatNumber(Number(feature.total_requests))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNumber(Number(feature.get_requests))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNumber(Number(feature.post_requests))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNumber(Number(feature.update_requests))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNumber(Number(feature.delete_requests))}</TableCell>
                  </TableRow>
                ))}
                {(!featureUsage.featureUsage || featureUsage.featureUsage.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">No data yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderPerformance = () => {
    if (perfLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!performance) {
      return <div className="text-center text-muted-foreground py-8">No performance data yet</div>;
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">P50</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.p50)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">P90</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.p90)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">P95</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.p95)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">P99</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.p99)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">Average</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.avg)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">Min</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.min)}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardContent className="pt-4 pb-3">
              <div className="text-muted-foreground text-sm">Max</div>
              <div className="text-xl font-bold">{formatDuration(performance.percentiles?.max)}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Slowest Endpoints (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Avg Time</TableHead>
                  <TableHead className="text-right">Max Time</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performance.slowEndpoints?.map((ep, i) => (
                  <TableRow key={i} data-testid={`row-slow-endpoint-${i}`}>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">{ep.path}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ep.method}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatDuration(ep.avg_duration)}</TableCell>
                    <TableCell className="text-right text-amber-600">{formatDuration(ep.max_duration)}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(ep.request_count))}</TableCell>
                  </TableRow>
                ))}
                {(!performance.slowEndpoints || performance.slowEndpoints.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">No data yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Error Rate By Hour (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {performance.errorTrend?.slice(0, 12).map((hour, i) => {
                const errorRate = Number(hour.error_rate) || 0;
                return (
                  <div key={i} className="flex items-center gap-3" data-testid={`bar-error-${i}`}>
                    <span className="text-xs text-muted-foreground w-24">{format(new Date(hour.hour), 'h:mm a')}</span>
                    <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${errorRate > 5 ? 'bg-destructive' : errorRate > 1 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(errorRate * 10, 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-16 text-right">{errorRate.toFixed(1)}%</span>
                  </div>
                );
              })}
              {(!performance.errorTrend || performance.errorTrend.length === 0) && (
                <div className="text-center text-muted-foreground py-4">No data yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderDatabase = () => {
    if (dbLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!databaseStats) {
      return <div className="text-center text-muted-foreground py-8">No database stats available</div>;
    }

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Database Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-muted text-center">
              <div className="text-muted-foreground">Total Database Size</div>
              <div className="text-3xl font-bold mt-1">{databaseStats.databaseSize}</div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5" />
                Table Row Counts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {databaseStats.tableCounts?.map((table, i) => (
                    <TableRow key={i} data-testid={`row-table-count-${i}`}>
                      <TableCell className="font-mono text-sm">{table.table_name}</TableCell>
                      <TableCell className="text-right">{formatNumber(Number(table.row_count))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <HardDrive className="h-5 w-5" />
                Table Sizes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {databaseStats.tableSizes?.map((table, i) => (
                    <TableRow key={i} data-testid={`row-table-size-${i}`}>
                      <TableCell className="font-mono text-sm">{table.table_name}</TableCell>
                      <TableCell className="text-right">{table.total_size}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderOrgUsage = () => {
    if (orgLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!orgUsage) {
      return <div className="text-center text-muted-foreground py-8">No organization usage data yet</div>;
    }

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organization Usage (Last 7 Days)
            </CardTitle>
            <CardDescription>Top organizations by API requests</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead className="text-right">Tasks</TableHead>
                  <TableHead className="text-right">API Requests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgUsage.organizations?.map((org, i) => (
                  <TableRow key={i} data-testid={`row-org-usage-${org.id}`}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(org.member_count))}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(org.project_count))}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(org.task_count))}</TableCell>
                    <TableCell className="text-right font-bold">{formatNumber(Number(org.api_requests_7d))}</TableCell>
                  </TableRow>
                ))}
                {(!orgUsage.organizations || orgUsage.organizations.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">No data yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={subTab === 'overview' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubTab('overview')}
            data-testid="btn-subtab-overview"
          >
            <Activity className="h-4 w-4 mr-1" />
            Overview
          </Button>
          <Button
            variant={subTab === 'users' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubTab('users')}
            data-testid="btn-subtab-users"
          >
            <Users className="h-4 w-4 mr-1" />
            User Activity
          </Button>
          <Button
            variant={subTab === 'features' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubTab('features')}
            data-testid="btn-subtab-features"
          >
            <BarChart3 className="h-4 w-4 mr-1" />
            Features
          </Button>
          <Button
            variant={subTab === 'performance' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubTab('performance')}
            data-testid="btn-subtab-performance"
          >
            <Zap className="h-4 w-4 mr-1" />
            Performance
          </Button>
          <Button
            variant={subTab === 'database' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubTab('database')}
            data-testid="btn-subtab-database"
          >
            <Database className="h-4 w-4 mr-1" />
            Database
          </Button>
          <Button
            variant={subTab === 'organizations' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubTab('organizations')}
            data-testid="btn-subtab-organizations"
          >
            <Building2 className="h-4 w-4 mr-1" />
            Organizations
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="btn-refresh-monitoring">
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {subTab === 'overview' && renderOverview()}
      {subTab === 'users' && renderUserActivity()}
      {subTab === 'features' && renderFeatureUsage()}
      {subTab === 'performance' && renderPerformance()}
      {subTab === 'database' && renderDatabase()}
      {subTab === 'organizations' && renderOrgUsage()}
    </div>
  );
}

interface HelpTicket {
  id: number;
  userId: string;
  userEmail: string;
  userName: string | null;
  organizationId: number | null;
  organizationName: string | null;
  subject: string;
  description: string;
  imageUrls: string[] | null;
  status: string;
  priority: string | null;
  assignedTo: string | null;
  resolution: string | null;
  emailSent: boolean;
  emailSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

function HelpTicketsTab() {
  const { user: currentUser } = useAuth();
  const isMarketing = currentUser?.role === 'marketing';
  const { toast } = useToast();
  const [selectedTicket, setSelectedTicket] = useState<HelpTicket | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: tickets = [], isLoading } = useQuery<HelpTicket[]>({
    queryKey: ["/api/admin/help-tickets"],
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<HelpTicket> }) => {
      const response = await apiRequest("PATCH", `/api/admin/help-tickets/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/help-tickets"] });
      toast({
        title: "Ticket updated",
        description: "The help ticket has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTicketMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/help-tickets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/help-tickets"] });
      setViewDialogOpen(false);
      setSelectedTicket(null);
      toast({
        title: "Ticket deleted",
        description: "The help ticket has been deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredTickets = tickets.filter(ticket => {
    if (statusFilter === "all") return true;
    return ticket.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge variant="default" className="bg-blue-500">New</Badge>;
      case "in_progress":
        return <Badge variant="default" className="bg-yellow-500">In Progress</Badge>;
      case "resolved":
        return <Badge variant="default" className="bg-green-500">Resolved</Badge>;
      case "closed":
        return <Badge variant="secondary">Closed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string | null) => {
    switch (priority) {
      case "urgent":
        return <Badge variant="destructive">Urgent</Badge>;
      case "high":
        return <Badge variant="default" className="bg-orange-500">High</Badge>;
      case "normal":
        return <Badge variant="outline">Normal</Badge>;
      case "low":
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="outline">Normal</Badge>;
    }
  };

  const handleStatusChange = (ticketId: number, newStatus: string) => {
    updateTicketMutation.mutate({ id: ticketId, updates: { status: newStatus } });
  };

  const handlePriorityChange = (ticketId: number, newPriority: string) => {
    updateTicketMutation.mutate({ id: ticketId, updates: { priority: newPriority } });
  };

  const viewTicket = (ticket: HelpTicket) => {
    setSelectedTicket(ticket);
    setViewDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const newCount = tickets.filter(t => t.status === "new").length;
  const inProgressCount = tickets.filter(t => t.status === "in_progress").length;
  const resolvedCount = tickets.filter(t => t.status === "resolved").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Help Tickets</h2>
          <p className="text-muted-foreground">Manage user feedback and support requests</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tickets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">New</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{newCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{inProgressCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{resolvedCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>All Tickets</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {filteredTickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No tickets found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="font-mono">#{ticket.id}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{ticket.subject}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{ticket.userName || "Unknown"}</div>
                        <div className="text-muted-foreground text-xs">{ticket.userEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell>{ticket.organizationName || "-"}</TableCell>
                    <TableCell>
                      <Select
                        value={ticket.status}
                        onValueChange={(value) => handleStatusChange(ticket.id, value)}
                        disabled={isMarketing}
                      >
                        <SelectTrigger className="w-32" data-testid={`select-status-${ticket.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={ticket.priority || "normal"}
                        onValueChange={(value) => handlePriorityChange(ticket.id, value)}
                        disabled={isMarketing}
                      >
                        <SelectTrigger className="w-28" data-testid={`select-priority-${ticket.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(ticket.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => viewTicket(ticket)}
                        data-testid={`button-view-ticket-${ticket.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Ticket #{selectedTicket?.id}
            </DialogTitle>
            <DialogDescription>
              Submitted on {selectedTicket ? format(new Date(selectedTicket.createdAt), "MMMM d, yyyy 'at' h:mm a") : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedTicket && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {getStatusBadge(selectedTicket.status)}
                {getPriorityBadge(selectedTicket.priority)}
                {selectedTicket.emailSent && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Email Sent
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">User</Label>
                  <p className="font-medium">{selectedTicket.userName || "Unknown"}</p>
                  <p className="text-muted-foreground">{selectedTicket.userEmail}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Organization</Label>
                  <p className="font-medium">{selectedTicket.organizationName || "No organization"}</p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Subject</Label>
                <p className="font-medium text-lg">{selectedTicket.subject}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Description</Label>
                <div className="mt-1 p-3 bg-muted rounded-md whitespace-pre-wrap">
                  {selectedTicket.description}
                </div>
              </div>

              {selectedTicket.imageUrls && selectedTicket.imageUrls.length > 0 && (
                <div>
                  <Label className="text-muted-foreground">Attachments</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedTicket.imageUrls.map((url, index) => (
                      <a
                        key={index}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <img
                          src={url}
                          alt={`Attachment ${index + 1}`}
                          className="h-24 w-24 object-cover rounded-md border hover:opacity-80 transition-opacity"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {selectedTicket.resolution && (
                <div>
                  <Label className="text-muted-foreground">Resolution</Label>
                  <div className="mt-1 p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
                    {selectedTicket.resolution}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-4 border-t">
                <Textarea
                  placeholder="Add resolution notes..."
                  id="resolution-notes"
                  className="flex-1"
                  defaultValue={selectedTicket.resolution || ""}
                  data-testid="input-resolution"
                />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="destructive"
                  onClick={() => deleteTicketMutation.mutate(selectedTicket.id)}
                  disabled={isMarketing || deleteTicketMutation.isPending}
                  data-testid="button-delete-ticket"
                >
                  {deleteTicketMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const resolution = (document.getElementById("resolution-notes") as HTMLTextAreaElement)?.value;
                    updateTicketMutation.mutate({
                      id: selectedTicket.id,
                      updates: { resolution, status: "resolved" }
                    });
                    setViewDialogOpen(false);
                  }}
                  disabled={isMarketing || updateTicketMutation.isPending}
                  data-testid="button-resolve-ticket"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark Resolved
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== ANALYTICS TAB =====

interface AnalyticsDashboard {
  userMetrics: {
    totalUsers: number;
    newUsersToday: number;
    newUsersThisWeek: number;
    newUsersThisMonth: number;
    activeUsers24h: number;
    activeUsers7d: number;
    activeUsers30d: number;
    avgSessionsPerUser: string;
    retentionRate: string;
  };
  organizationMetrics: {
    totalOrganizations: number;
    newOrgsThisMonth: number;
  };
  subscriptionMetrics: {
    byPlan: Array<{ plan_name: string; plan_code: string; subscription_count: number }>;
    churnedThisMonth: number;
  };
  charts: {
    dailySignups: Array<{ date: string; count: number }>;
    weeklySignups: Array<{ week_start: string; count: number }>;
    monthlySignups: Array<{ month_start: string; count: number }>;
    dailyPageViews: Array<{ date: string; views: number }>;
  };
  publicPageStats: Array<{ page_name: string; views: number; unique_visitors: number }>;
  featureUsage: Array<{ feature: string; usage_count: number }>;
  topUsers: Array<{ user_id: string; email: string; first_name: string; last_name: string; request_count: number; last_activity: string }>;
}

function AnalyticsTab() {
  const { toast } = useToast();
  const [chartView, setChartView] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const { data: analytics, isLoading, refetch } = useQuery<AnalyticsDashboard>({
    queryKey: ['/api/admin/analytics/dashboard'],
  });

  const handleRefresh = () => {
    refetch();
    toast({ title: "Analytics refreshed" });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  const formatWeek = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  const formatMonth = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No analytics data available yet.
      </div>
    );
  }

  const getSignupChartData = () => {
    if (chartView === 'weekly') {
      return analytics.charts.weeklySignups.map(item => ({
        label: formatWeek(item.week_start),
        value: Number(item.count)
      }));
    } else if (chartView === 'monthly') {
      return analytics.charts.monthlySignups.map(item => ({
        label: formatMonth(item.month_start),
        value: Number(item.count)
      }));
    }
    return analytics.charts.dailySignups.map(item => ({
      label: formatDate(item.date),
      value: Number(item.count)
    }));
  };

  const maxSignupValue = Math.max(...getSignupChartData().map(d => d.value), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-muted-foreground">Comprehensive user and application statistics</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} data-testid="button-refresh-analytics">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card className="hover-elevate" data-testid="card-total-users">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Total Users
            </div>
            <div className="text-2xl font-bold mt-1">{formatNumber(analytics.userMetrics.totalUsers)}</div>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-new-users-today">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <UserPlus className="h-4 w-4" />
              New Today
            </div>
            <div className="text-2xl font-bold mt-1 text-green-600">{analytics.userMetrics.newUsersToday}</div>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-new-users-week">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <TrendingUp className="h-4 w-4" />
              New This Week
            </div>
            <div className="text-2xl font-bold mt-1">{analytics.userMetrics.newUsersThisWeek}</div>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-new-users-month">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <BarChart3 className="h-4 w-4" />
              New This Month
            </div>
            <div className="text-2xl font-bold mt-1">{analytics.userMetrics.newUsersThisMonth}</div>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-retention">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Activity className="h-4 w-4" />
              7-Day Retention
            </div>
            <div className="text-2xl font-bold mt-1">{analytics.userMetrics.retentionRate}</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Users */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-active-24h">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Active Users (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatNumber(analytics.userMetrics.activeUsers24h)}</div>
            <p className="text-sm text-muted-foreground">Users with activity in last 24 hours</p>
          </CardContent>
        </Card>

        <Card data-testid="card-active-7d">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" />
              Active Users (7d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatNumber(analytics.userMetrics.activeUsers7d)}</div>
            <p className="text-sm text-muted-foreground">Users with activity in last 7 days</p>
          </CardContent>
        </Card>

        <Card data-testid="card-active-30d">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-500" />
              Active Users (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatNumber(analytics.userMetrics.activeUsers30d)}</div>
            <p className="text-sm text-muted-foreground">Users with activity in last 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* User Signups Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              User Signups
            </CardTitle>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={chartView === 'daily' ? 'default' : 'outline'}
                onClick={() => setChartView('daily')}
                data-testid="button-chart-daily"
              >
                Daily
              </Button>
              <Button
                size="sm"
                variant={chartView === 'weekly' ? 'default' : 'outline'}
                onClick={() => setChartView('weekly')}
                data-testid="button-chart-weekly"
              >
                Weekly
              </Button>
              <Button
                size="sm"
                variant={chartView === 'monthly' ? 'default' : 'outline'}
                onClick={() => setChartView('monthly')}
                data-testid="button-chart-monthly"
              >
                Monthly
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-end gap-1">
            {getSignupChartData().map((item, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-primary/80 rounded-t hover:bg-primary transition-colors"
                  style={{ height: `${(item.value / maxSignupValue) * 100}%`, minHeight: item.value > 0 ? '4px' : '0' }}
                  title={`${item.label}: ${item.value} signups`}
                />
                <span className="text-[10px] text-muted-foreground rotate-[-45deg] origin-top-left whitespace-nowrap">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Organization & Subscription Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organization Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Organizations</span>
              <span className="text-xl font-bold">{analytics.organizationMetrics.totalOrganizations}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">New This Month</span>
              <span className="text-xl font-bold text-green-600">+{analytics.organizationMetrics.newOrgsThisMonth}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.subscriptionMetrics.byPlan.map((plan, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <Badge variant="outline">{plan.plan_name}</Badge>
                  <span className="font-medium">{plan.subscription_count} active</span>
                </div>
              ))}
              {analytics.subscriptionMetrics.churnedThisMonth > 0 && (
                <div className="flex justify-between items-center pt-2 border-t mt-2">
                  <span className="text-muted-foreground">Churned This Month</span>
                  <span className="text-red-600 font-medium">{analytics.subscriptionMetrics.churnedThisMonth}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Public Page Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Public Page Statistics (Last 30 Days)
          </CardTitle>
          <CardDescription>Page views and unique visitors for public pages</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Unique Visitors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.publicPageStats.length > 0 ? (
                analytics.publicPageStats.map((page, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{page.page_name}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(page.views))}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(page.unique_visitors))}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                    No public page data available yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Feature Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Feature Usage (Last 30 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analytics.featureUsage.filter(f => f.feature !== 'Other').map((feature, idx) => {
              const maxUsage = Math.max(...analytics.featureUsage.map(f => Number(f.usage_count)), 1);
              const percentage = (Number(feature.usage_count) / maxUsage) * 100;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{feature.feature}</span>
                    <span className="text-muted-foreground">{formatNumber(Number(feature.usage_count))} requests</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Top Active Users (Last 7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead>Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.topUsers.map((user, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">
                    {user.first_name} {user.last_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell className="text-right">{formatNumber(Number(user.request_count))}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.last_activity ? format(new Date(user.last_activity), 'MMM d, h:mm a') : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {analytics.topUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                    No user activity data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
