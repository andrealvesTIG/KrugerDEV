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
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, Building2, Users, Plus, Edit, ShieldAlert, Crown, Database, Sparkles, Eraser, CreditCard, DollarSign, UserPlus, RotateCcw, ChevronDown, ChevronRight, Archive, Wallet, ArrowUp, ArrowDown, Search, Settings2, FileCheck, Activity, BarChart3, AlertTriangle, Clock, Globe, Zap, HardDrive, TrendingUp, RefreshCw, HelpCircle, MessageSquare, CheckCircle, XCircle, Eye, EyeOff, Download, Mail, Copy, Send, MoreHorizontal, Wrench, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FeatureComparisonTab } from "@/components/FeatureComparisonTab";
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
            Analytics
          </TabsTrigger>
          <TabsTrigger value="help-tickets" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2" data-testid="tab-help-tickets">
            <HelpCircle className="h-4 w-4" />
            Help Tickets
          </TabsTrigger>
          <TabsTrigger value="feature-comparison" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2" data-testid="tab-feature-comparison">
            <BarChart3 className="h-4 w-4" />
            Feature Comparison
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
          <TabsContent value="help-tickets">
            <HelpTicketsTab />
          </TabsContent>
          <TabsContent value="feature-comparison">
            <FeatureComparisonTab />
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

type OrgColumnKey = 'name' | 'slug' | 'description' | 'owner' | 'members' | 'plan' | 'credits' | 'created';

const defaultOrgColumns: OrgColumnKey[] = ['name', 'slug', 'description', 'plan', 'credits', 'created'];

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
  const allDemoDataTypes = ['portfolios', 'projects', 'tasks', 'issues', 'risks', 'assignments', 'timesheets', 'intakes'] as const;
  const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>([...allDemoDataTypes]);
  const [demoStats, setDemoStats] = useState<Record<string, number> | null>(null);
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
    queryKey: ['/api/organizations'],
    staleTime: 0,
  });

  const { data: deactivatedOrgs, isLoading: deactivatedLoading } = useQuery<Organization[]>({
    queryKey: ['/api/admin/organizations/deactivated'],
    enabled: user?.role === 'super_admin',
    staleTime: 0,
  });

  const { data: industries } = useQuery<IndustryOption[]>({
    queryKey: ['/api/demo-data/industries'],
    enabled: user?.role === 'super_admin',
    staleTime: 0,
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users'],
    enabled: user?.role === 'super_admin',
    staleTime: 0,
  });

  const { data: allOrgMembers } = useQuery<{ organizationId: number; userId: string }[]>({
    queryKey: ['/api/admin/organization-members'],
    queryFn: async () => {
      const res = await fetch('/api/admin/organization-members', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: user?.role === 'super_admin',
    staleTime: 0,
  });

  interface OrgSubscription {
    orgId: number;
    planName: string | null;
    planCode: string | null;
    status: string;
  }

  const { data: orgSubscriptions } = useQuery<OrgSubscription[]>({
    queryKey: ['/api/admin/organizations/subscriptions'],
    staleTime: 0,
  });

  interface OrgCreditUsage { included: number; used: number; remaining: number; overage: number; }
  const { data: orgCreditUsage } = useQuery<Record<number, OrgCreditUsage>>({
    queryKey: ['/api/admin/organizations/credit-usage'],
    queryFn: async () => {
      const res = await fetch('/api/admin/organizations/credit-usage', { credentials: 'include' });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 0,
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
    credits: 'Credits',
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
    mutationFn: async ({ organizationId, industry, dataTypes }: { organizationId: number; industry: string; dataTypes: string[] }) => {
      const response = await apiRequest('POST', '/api/demo-data/generate', { organizationId, industry, dataTypes });
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
      queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timesheets'] });
      setDemoStats(data.stats);
      toast({ 
        title: "Demo Data Generated", 
        description: `Successfully generated demo data for ${demoDataOrg?.name}` 
      });
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
      queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes'] });
      const s = data.stats;
      const parts = [];
      if (s.portfolios) parts.push(`${s.portfolios} portfolios`);
      if (s.projects) parts.push(`${s.projects} projects`);
      if (s.tasks) parts.push(`${s.tasks} tasks`);
      if (s.risks) parts.push(`${s.risks} risks`);
      if (s.issues) parts.push(`${s.issues} issues`);
      if (s.milestones) parts.push(`${s.milestones} milestones`);
      if (s.financials) parts.push(`${s.financials} financials`);
      if (s.changeRequests) parts.push(`${s.changeRequests} change requests`);
      if (s.documents) parts.push(`${s.documents} documents`);
      if (s.benefits) parts.push(`${s.benefits} benefits`);
      if (s.decisions) parts.push(`${s.decisions} decisions`);
      if (s.assignments) parts.push(`${s.assignments} assignments`);
      if (s.timesheets) parts.push(`${s.timesheets} timesheets`);
      if (s.resources) parts.push(`${s.resources} resources`);
      if (s.intakes) parts.push(`${s.intakes} intakes`);
      toast({ 
        title: "Demo Data Removed", 
        description: parts.length > 0 ? `Deleted ${parts.join(', ')}` : 'No demo data found to remove'
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
              {visibleColumns.includes('credits') && <TableHead>Credits (Used / Included)</TableHead>}
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
                {visibleColumns.includes('credits') && (
                  <TableCell>
                    {(() => {
                      const credit = orgCreditUsage?.[org.id];
                      if (!credit) return <span className="text-xs text-muted-foreground">-</span>;
                      const pct = credit.included > 0 ? Math.round((credit.used / credit.included) * 100) : 0;
                      const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500';
                      return (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2 cursor-help min-w-[120px]">
                                <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                                <span className="text-xs font-medium">{credit.used} / {credit.included}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">
                              <p>Used: {credit.used}</p>
                              <p>Included: {credit.included}</p>
                              <p>Remaining: {credit.remaining}</p>
                              {credit.overage > 0 && <p className="text-red-400">Overage: {credit.overage}</p>}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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

      <Dialog open={demoDataOrg !== null} onOpenChange={(open) => { if (!open) { setDemoDataOrg(null); setSelectedIndustry(""); setDemoStats(null); setSelectedDataTypes([...allDemoDataTypes]); } }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Generate Demo Data
            </DialogTitle>
            <DialogDescription>
              Generate sample data for <strong>{demoDataOrg?.name}</strong>. Select the data types you want to populate.
            </DialogDescription>
          </DialogHeader>
          {demoStats ? (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border bg-green-50 dark:bg-green-900/20 p-4 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  Demo data generated successfully
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(demoStats).filter(([, count]) => count > 0).map(([key, count]) => (
                    <div key={key} className="flex items-center justify-between text-sm px-2 py-1 rounded bg-white dark:bg-slate-800">
                      <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => { setDemoDataOrg(null); setSelectedIndustry(""); setDemoStats(null); setSelectedDataTypes([...allDemoDataTypes]); }}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Data Types to Generate</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (selectedDataTypes.length === allDemoDataTypes.length) {
                          setSelectedDataTypes([]);
                        } else {
                          setSelectedDataTypes([...allDemoDataTypes]);
                        }
                      }}
                    >
                      {selectedDataTypes.length === allDemoDataTypes.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: 'portfolios', label: 'Portfolios', desc: 'Strategic groupings' },
                      { key: 'projects', label: 'Projects', desc: 'With timelines & budgets' },
                      { key: 'tasks', label: 'Tasks', desc: 'Work items & milestones' },
                      { key: 'issues', label: 'Issues', desc: 'Bugs & enhancements' },
                      { key: 'risks', label: 'Risks', desc: 'Risk register entries' },
                      { key: 'assignments', label: 'Assignments', desc: 'Resource-to-task links' },
                      { key: 'timesheets', label: 'Timesheets', desc: 'Time entries (2 weeks)' },
                      { key: 'intakes', label: 'Intakes', desc: 'Pipeline requests' },
                    ] as const).map(item => {
                      const isSelected = selectedDataTypes.includes(item.key);
                      const isDependency = !isSelected && (
                        (item.key === 'portfolios' && selectedDataTypes.some(t => ['projects', 'tasks', 'issues', 'risks', 'assignments', 'timesheets'].includes(t))) ||
                        (item.key === 'projects' && selectedDataTypes.some(t => ['tasks', 'issues', 'risks', 'assignments', 'timesheets'].includes(t))) ||
                        (item.key === 'tasks' && selectedDataTypes.some(t => ['assignments', 'timesheets'].includes(t)))
                      );
                      return (
                        <div
                          key={item.key}
                          className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'bg-primary/5 border-primary' : isDependency ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' : 'hover:bg-muted/50'}`}
                          onClick={() => {
                            setSelectedDataTypes(prev =>
                              prev.includes(item.key)
                                ? prev.filter(t => t !== item.key)
                                : [...prev, item.key]
                            );
                          }}
                        >
                          <Checkbox
                            checked={isSelected || isDependency}
                            onCheckedChange={() => {
                              setSelectedDataTypes(prev =>
                                prev.includes(item.key)
                                  ? prev.filter(t => t !== item.key)
                                  : [...prev, item.key]
                              );
                            }}
                            className="mt-0.5"
                            disabled={isDependency}
                          />
                          <div>
                            <p className="text-sm font-medium leading-tight">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{item.desc}</p>
                            {isDependency && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Auto-included as dependency</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDemoDataOrg(null); setSelectedIndustry(""); setDemoStats(null); setSelectedDataTypes([...allDemoDataTypes]); }}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => demoDataOrg && selectedIndustry && generateDemoData.mutate({ 
                    organizationId: demoDataOrg.id, 
                    industry: selectedIndustry,
                    dataTypes: selectedDataTypes
                  })}
                  disabled={!selectedIndustry || selectedDataTypes.length === 0 || generateDemoData.isPending}
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
            </>
          )}
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
              This will permanently delete all <strong>demo-generated</strong> data for <strong>{deleteDemoDataOrg?.name}</strong>, including portfolios, projects, tasks, risks, issues, milestones, financials, change requests, documents, benefits, decisions, assignments, timesheets, resources, and intakes.
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

type UserColumnKey = 'name' | 'email' | 'role' | 'organizations' | 'verified' | 'engagement' | 'joined';
const defaultUserColumns: UserColumnKey[] = ['name', 'email', 'role'];
const userColumnLabels: Record<UserColumnKey, string> = {
  name: 'Name',
  email: 'Email',
  role: 'System Role',
  organizations: 'Organizations',
  verified: 'Verified',
  engagement: 'Engagement',
  joined: 'Joined',
};

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
  const [technicianFilter, setTechnicianFilter] = useState<string>("all");
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [visibleUserColumns, setVisibleUserColumns] = useState<UserColumnKey[]>(defaultUserColumns);
  const toggleUserColumn = (col: UserColumnKey) => {
    setVisibleUserColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setVerifiedFilter('all');
    setDateFrom('');
    setDateTo('');
    setEngagementFilter('all');
    setOrgFilter('all');
    setTechnicianFilter('all');
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
  const [upgradeMessage, setUpgradeMessage] = useState("<p>We've noticed you're getting great value from FridayReport.AI! We'd love to help you unlock even more powerful features with one of our paid plans.</p>");
  const pageSize = 15;
  
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['/api/users'],
    staleTime: 0,
  });

  const { data: allOrganizations } = useQuery<Organization[]>({
    queryKey: ['/api/organizations'],
    staleTime: 0,
  });

  const { data: allOrgMembers } = useQuery<{ organizationId: number; userId: string }[]>({
    queryKey: ['/api/admin/organization-members'],
    queryFn: async () => {
      const res = await fetch('/api/admin/organization-members', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 0,
  });

  interface OrgSub { orgId: number; planName: string | null; planCode: string | null; status: string; }
  const { data: orgSubscriptions } = useQuery<OrgSub[]>({
    queryKey: ['/api/admin/organizations/subscriptions'],
    staleTime: 0,
  });

  interface UserActivity { totalActions: number; activeDays: number; lastActiveAt: string | null; usageEvents: number; }
  const { data: userActivityCounts } = useQuery<Record<string, UserActivity>>({
    queryKey: ['/api/admin/users/activity-counts'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users/activity-counts', { credentials: 'include' });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 0,
  });

  const getUserOrgs = (userId: string) => {
    const memberOrgIds = allOrgMembers?.filter(m => m.userId === userId).map(m => m.organizationId) ?? [];
    return allOrganizations?.filter(o => memberOrgIds.includes(o.id)) ?? [];
  };

  const getEngagementScore = (user: User) => {
    let score = 0;
    if (user.emailVerified) score += 10;
    if (user.onboardingCompleted) score += 10;
    if (user.termsAcceptedAt) score += 5;
    const orgCount = getUserOrgs(user.id).length;
    if (orgCount >= 1) score += 10;
    if (orgCount >= 2) score += 5;

    const activity = userActivityCounts?.[user.id];
    if (activity) {
      if (activity.activeDays >= 1) score += 10;
      if (activity.activeDays >= 5) score += 10;
      if (activity.activeDays >= 15) score += 10;
      if (activity.totalActions >= 10) score += 5;
      if (activity.totalActions >= 50) score += 5;
      if (activity.totalActions >= 200) score += 10;
      if (activity.usageEvents >= 1) score += 5;
      if (activity.usageEvents >= 10) score += 5;
    }

    return Math.min(score, 100);
  };

  const getEngagementBreakdown = (user: User) => {
    const parts: string[] = [];
    if (user.emailVerified) parts.push("Email verified (+10)");
    if (user.onboardingCompleted) parts.push("Onboarding done (+10)");
    if (user.termsAcceptedAt) parts.push("Terms accepted (+5)");
    const orgCount = getUserOrgs(user.id).length;
    if (orgCount >= 1) parts.push(`In ${orgCount} org${orgCount > 1 ? 's' : ''} (+${orgCount >= 2 ? 15 : 10})`);

    const activity = userActivityCounts?.[user.id];
    if (activity) {
      if (activity.activeDays >= 1) {
        let pts = 10;
        if (activity.activeDays >= 15) pts = 30;
        else if (activity.activeDays >= 5) pts = 20;
        parts.push(`${activity.activeDays} active day${activity.activeDays !== 1 ? 's' : ''} (+${pts})`);
      }
      if (activity.totalActions >= 10) {
        let pts = 5;
        if (activity.totalActions >= 200) pts = 20;
        else if (activity.totalActions >= 50) pts = 10;
        parts.push(`${activity.totalActions} actions (+${pts})`);
      }
      if (activity.usageEvents >= 1) {
        const pts = activity.usageEvents >= 10 ? 10 : 5;
        parts.push(`${activity.usageEvents} credit events (+${pts})`);
      }
    }
    if (parts.length === 0) parts.push("No activity tracked yet");
    return parts;
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
    staleTime: 0,
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

  const toggleTechnician = useMutation({
    mutationFn: async ({ userId, isTechnician }: { userId: string; isTechnician: boolean }) => {
      return apiRequest('PUT', `/api/users/${userId}/technician`, { isTechnician });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({ title: "Success", description: "Technician status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update technician status", variant: "destructive" });
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
    if (technicianFilter === 'technician' && !user.isTechnician) return false;
    if (technicianFilter === 'non_technician' && user.isTechnician) return false;
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
          {!isMarketing && (
            <Select value={technicianFilter} onValueChange={(v) => { setTechnicianFilter(v); setActiveCard(null); setCurrentPage(1); }}>
              <SelectTrigger className="w-[160px]" data-testid="select-technician-filter">
                <SelectValue placeholder="User Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="non_technician">Users Only</SelectItem>
                <SelectItem value="technician">Technicians Only</SelectItem>
              </SelectContent>
            </Select>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-users-column-toggle">
                <Settings2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(userColumnLabels) as UserColumnKey[]).map(col => (
                <DropdownMenuCheckboxItem
                  key={col}
                  checked={visibleUserColumns.includes(col)}
                  onCheckedChange={() => toggleUserColumn(col)}
                >
                  {userColumnLabels[col]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-users-actions-menu">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={copyConversionEmails}
                data-testid="menuitem-copy-conversion-emails"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Conversion Emails
              </DropdownMenuItem>
              <DropdownMenuItem
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
                data-testid="menuitem-bulk-send-upgrade"
              >
                <Send className="h-4 w-4 mr-2" />
                Bulk Send Upgrade Offer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
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
                data-testid="menuitem-export-users"
              >
                <Download className="h-4 w-4 mr-2" />
                Export to CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              {visibleUserColumns.includes('name') && (
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
              )}
              {visibleUserColumns.includes('email') && (
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
              )}
              {visibleUserColumns.includes('role') && (
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
              )}
              {visibleUserColumns.includes('organizations') && <TableHead>Organizations</TableHead>}
              {visibleUserColumns.includes('verified') && <TableHead>Verified</TableHead>}
              {visibleUserColumns.includes('engagement') && (
                <TableHead 
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('engagement')}
                  data-testid="header-sort-engagement"
                >
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1">
                          Engagement
                          <HelpCircle className="h-3 w-3 text-muted-foreground" />
                          {sortField === 'engagement' && (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          )}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs p-3">
                        <p className="font-semibold mb-1">Engagement Score (0-100)</p>
                        <p className="mb-1">Measures how actively a user interacts with the platform based on:</p>
                        <ul className="list-disc pl-3 space-y-0.5">
                          <li>Account setup (email verified, onboarding, terms)</li>
                          <li>Organization membership</li>
                          <li>Active days in the last 90 days</li>
                          <li>Total platform actions (API interactions)</li>
                          <li>Credit/resource usage events</li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
              )}
              {visibleUserColumns.includes('joined') && (
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
              )}
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeUsers?.map(user => (
              <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                {visibleUserColumns.includes('name') && (
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{user.firstName} {user.lastName}</span>
                      {user.isTechnician && (
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-technician-${user.id}`}>
                          Tech
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                )}
                {visibleUserColumns.includes('email') && (
                  <TableCell>{user.email || 'N/A'}</TableCell>
                )}
                {visibleUserColumns.includes('role') && (
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
                )}
                {visibleUserColumns.includes('organizations') && (
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
                )}
                {visibleUserColumns.includes('verified') && (
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
                )}
                {visibleUserColumns.includes('engagement') && (
                  <TableCell>
                    {(() => {
                      const score = getEngagementScore(user);
                      const { label, color } = getEngagementLabel(score);
                      const onFree = isOnFreePlan(user.id);
                      const breakdown = getEngagementBreakdown(user);
                      return (
                        <div className="flex items-center gap-2" data-testid={`engagement-${user.id}`}>
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-help">
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs font-semibold ${score >= 75 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : score >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}
                                  >
                                    {score} - {label}
                                  </Badge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs text-xs p-3">
                                <p className="font-semibold mb-1">{label} Engagement ({score}/100)</p>
                                <ul className="space-y-0.5">
                                  {breakdown.map((item, i) => (
                                    <li key={i}>{item}</li>
                                  ))}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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
                )}
                {visibleUserColumns.includes('joined') && (
                  <TableCell>
                    {user.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy') : 'N/A'}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-1">
                    {!isMarketing && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleTechnician.mutate({ userId: user.id, isTechnician: !user.isTechnician })}
                        title={user.isTechnician ? 'Remove technician flag' : 'Mark as technician'}
                        data-testid={`button-toggle-technician-${user.id}`}
                        className={user.isTechnician ? 'text-blue-500' : ''}
                      >
                        <Wrench className="h-4 w-4" />
                      </Button>
                    )}
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
        <DialogContent data-testid="dialog-upgrade-offer" className="max-w-2xl">
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
              <div className="tiptap" data-testid="editor-upgrade-message">
                <RichTextEditor
                  content={upgradeMessage}
                  onChange={setUpgradeMessage}
                  placeholder="Write your personalized upgrade message..."
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Use the toolbar to format your message with bold, lists, links, and more. This content will appear in the HTML email.
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
              disabled={sendUpgradeOffer.isPending || !upgradeMessage || upgradeMessage === '<p></p>' || upgradeMessage.replace(/<[^>]*>/g, '').trim().length === 0}
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
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [editingPlan, setEditingPlan] = useState<PlanData | null>(null);
  const [editingRules, setEditingRules] = useState<PlanMeterRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPlan, setNewPlan] = useState({ code: "", name: "", description: "", monthlyPriceCents: 0, maxSeats: "" });
  const [deletePlanId, setDeletePlanId] = useState<number | null>(null);
  const [isSyncingPayPal, setIsSyncingPayPal] = useState(false);
  const [isInitializingSeats, setIsInitializingSeats] = useState(false);

  const plansUrl = isSuperAdmin ? '/api/billing/plans?includeInactive=true' : '/api/billing/plans';
  const { data: plansResponse, isLoading } = useQuery<{ plans: PlanData[]; creditCosts: any[] }>({
    queryKey: [plansUrl],
    staleTime: 0,
  });
  const plans = plansResponse?.plans;

  const togglePlanActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/admin/plans/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      });
      if (!res.ok) throw new Error('Failed to update plan');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [plansUrl] });
      toast({ title: "Plan updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
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
                      {isSuperAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => togglePlanActive.mutate({ id: plan.id, isActive: !plan.isActive })}
                          disabled={togglePlanActive.isPending}
                          title={plan.isActive ? "Deactivate plan" : "Activate plan"}
                        >
                          {plan.isActive ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-green-600" />
                          )}
                        </Button>
                      )}
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
    staleTime: 0,
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
    queryKey: ['/api/admin/credit-costs'],
    staleTime: 0,
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
    staleTime: 0,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ConsentStats>({
    queryKey: ["/api/admin/consents/stats"],
    staleTime: 0,
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
    totalErrors: number;
  };
  charts: {
    requestsPerDay: Array<{ date: string; count: number }>;
    userRegistrations: Array<{ date: string; count: number }>;
  };
  topEndpoints: Array<{ path: string; method: string; count: number; avg_duration: number }>;
  recentErrors: Array<{ path: string; status_code: number; error_message: string | null; count: number }>;
  methodBreakdown: Array<{ method: string; count: number }>;
  statusBreakdown: Array<{ status_group: string; count: number }>;
  topUsers: Array<{ user_id: string; email: string; first_name: string; last_name: string; count: number }>;
  topOrgs: Array<{ organization_id: number; org_name: string; count: number }>;
  slowestEndpoints: Array<{ path: string; method: string; avg_duration: number; count: number }>;
  filterOptions: {
    users: Array<{ user_id: string; email: string; first_name: string; last_name: string }>;
    organizations: Array<{ id: number; name: string }>;
  };
}

interface UserActivity {
  hourlyActive: Array<{ hour: string; active_users: number }>;
  topUsers: Array<{ user_id: string; email: string; first_name: string; last_name: string; request_count: number; last_activity: string }>;
  dailyLogins: Array<{ date: string; unique_users: number }>;
}

interface ActivityEntry {
  id: number;
  method: string;
  path: string;
  status_code: number;
  duration: number | null;
  user_id: string;
  organization_id: number | null;
  ip_address: string | null;
  user_agent: string | null;
  request_body: any;
  error_message: string | null;
  created_at: string;
  user_email: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  user_avatar: string | null;
  org_name: string | null;
  org_slug: string | null;
}

interface ActivityLedger {
  activities: ActivityEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  users: Array<{ user_id: string; email: string; first_name: string; last_name: string }>;
  summary: { creates: number; updates: number; deletes: number; errors: number; unique_users: number };
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

interface OrgAnalyticsOrg {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  plan_code: string | null;
  plan_name: string | null;
  sub_status: string | null;
  bonus_seats: number;
  current_period_start: string | null;
  current_period_end: string | null;
  member_count: number;
  project_count: number;
  task_count: number;
  portfolio_count: number;
  risk_count: number;
  milestone_count: number;
  issue_count: number;
  api_requests_7d: number;
}

interface OrgCreditUsage {
  org_id: number;
  meter_code: string;
  meter_name: string;
  included_units: number;
  used_units: number;
  remaining_units: number;
  overage_units: number;
  period_start: string;
  period_end: string;
  cycle_status: string;
}

interface OrgUsage {
  organizations: OrgAnalyticsOrg[];
  creditUsage: OrgCreditUsage[];
  totals: { total_orgs: number; total_users: number; total_projects: number; total_tasks: number; total_portfolios: number };
  planDistribution: Array<{ plan_name: string; plan_code: string; org_count: number }>;
}

type MonitoringSubTab = 'overview' | 'api-logs' | 'users' | 'features' | 'performance' | 'database' | 'organizations' | 'analytics';

function MonitoringTab() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<MonitoringSubTab>('overview');
  const [apiLogsPage, setApiLogsPage] = useState(1);
  const [methodFilter, setMethodFilter] = useState<string>('');
  const [pathFilter, setPathFilter] = useState<string>('');
  const [orgSortCol, setOrgSortCol] = useState<string>('name');
  const [orgSortDir, setOrgSortDir] = useState<'asc' | 'desc'>('asc');

  type OrgUsageColumnKey = 'name' | 'plan' | 'users' | 'projects' | 'tasks' | 'portfolios' | 'risks' | 'credits' | 'ai' | 'api';
  const defaultOrgUsageCols: OrgUsageColumnKey[] = ['name', 'plan', 'users', 'projects', 'tasks', 'portfolios', 'risks', 'credits', 'ai', 'api'];
  const [orgUsageCols, setOrgUsageCols] = useState<OrgUsageColumnKey[]>(defaultOrgUsageCols);
  const orgUsageColLabels: Record<OrgUsageColumnKey, string> = {
    name: 'Organization',
    plan: 'Plan',
    users: 'Users',
    projects: 'Projects',
    tasks: 'Tasks',
    portfolios: 'Portfolios',
    risks: 'Risks',
    credits: 'Credits Used',
    ai: 'AI Runs',
    api: 'API (7d)',
  };
  const toggleOrgUsageCol = (col: OrgUsageColumnKey) => {
    setOrgUsageCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };
  const hasOrgCol = (col: OrgUsageColumnKey) => orgUsageCols.includes(col);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerActionFilter, setLedgerActionFilter] = useState('');
  const [ledgerEntityFilter, setLedgerEntityFilter] = useState('');
  const [ledgerUserFilter, setLedgerUserFilter] = useState('');
  const [ledgerSortCol, setLedgerSortCol] = useState('created_at');
  const [ledgerSortDir, setLedgerSortDir] = useState<'asc' | 'desc'>('desc');
  const [ledgerDays, setLedgerDays] = useState(30);
  const [ledgerExpandedRow, setLedgerExpandedRow] = useState<number | null>(null);

  type LedgerColumnKey = 'timestamp' | 'user' | 'action' | 'details' | 'organization' | 'status' | 'duration' | 'ip' | 'userAgent' | 'method' | 'entity' | 'path';
  const defaultLedgerColumns: LedgerColumnKey[] = ['timestamp', 'user', 'action', 'details', 'organization', 'status', 'duration'];
  const [ledgerColumns, setLedgerColumns] = useState<LedgerColumnKey[]>(defaultLedgerColumns);
  const ledgerColumnLabels: Record<LedgerColumnKey, string> = {
    timestamp: 'Timestamp',
    user: 'User',
    action: 'Action',
    details: 'Details',
    organization: 'Organization',
    status: 'Status',
    duration: 'Duration',
    ip: 'IP Address',
    userAgent: 'User Agent',
    method: 'HTTP Method',
    entity: 'Entity',
    path: 'Path',
  };
  const toggleLedgerColumn = (col: LedgerColumnKey) => {
    setLedgerColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };
  const hasLedgerCol = (col: LedgerColumnKey) => ledgerColumns.includes(col);
  const visibleLedgerColCount = ledgerColumns.length + 1;

  const [ovDays, setOvDays] = useState(1);
  const [ovMethod, setOvMethod] = useState('');
  const [ovStatus, setOvStatus] = useState('');
  const [ovPath, setOvPath] = useState('');
  const [ovUserId, setOvUserId] = useState('');
  const [ovOrgId, setOvOrgId] = useState('');

  const ovQueryString = new URLSearchParams({
    days: String(ovDays),
    ...(ovMethod && { method: ovMethod }),
    ...(ovStatus && { status: ovStatus }),
    ...(ovPath && { path: ovPath }),
    ...(ovUserId && { userId: ovUserId }),
    ...(ovOrgId && { orgId: ovOrgId }),
  }).toString();

  const { data: overview, isLoading: overviewLoading, isFetching: overviewFetching, refetch: refetchOverview } = useQuery<MonitoringOverview>({
    queryKey: ['/api/admin/monitoring/overview', ovDays, ovMethod, ovStatus, ovPath, ovUserId, ovOrgId],
    queryFn: async () => {
      const r = await fetch(`/api/admin/monitoring/overview?${ovQueryString}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`Failed to fetch overview: ${r.status}`);
      return r.json();
    },
    staleTime: 0,
  });

  const { data: userActivity, isLoading: activityLoading, refetch: refetchActivity } = useQuery<UserActivity>({
    queryKey: ['/api/admin/monitoring/user-activity'],
    enabled: subTab === 'users',
    staleTime: 0,
  });

  const { data: featureUsage, isLoading: featuresLoading, refetch: refetchFeatures } = useQuery<FeatureUsage>({
    queryKey: ['/api/admin/monitoring/feature-usage'],
    enabled: subTab === 'features',
    staleTime: 0,
  });

  const { data: performance, isLoading: perfLoading, refetch: refetchPerf } = useQuery<PerformanceMetrics>({
    queryKey: ['/api/admin/monitoring/performance'],
    enabled: subTab === 'performance',
    staleTime: 0,
  });

  const { data: databaseStats, isLoading: dbLoading, refetch: refetchDb } = useQuery<DatabaseStats>({
    queryKey: ['/api/admin/monitoring/database'],
    enabled: subTab === 'database',
    staleTime: 0,
  });

  const { data: orgUsage, isLoading: orgLoading, refetch: refetchOrg } = useQuery<OrgUsage>({
    queryKey: ['/api/admin/monitoring/organization-usage'],
    enabled: subTab === 'organizations',
    staleTime: 0,
  });

  const ledgerQueryString = new URLSearchParams({
    page: String(ledgerPage),
    limit: '50',
    search: ledgerSearch,
    action: ledgerActionFilter,
    entity: ledgerEntityFilter,
    userId: ledgerUserFilter,
    sortCol: ledgerSortCol,
    sortDir: ledgerSortDir,
    days: String(ledgerDays),
  }).toString();

  const { data: activityLedger, isLoading: ledgerLoading, refetch: refetchLedger } = useQuery<ActivityLedger>({
    queryKey: ['/api/admin/monitoring/activity-ledger', ledgerQueryString],
    queryFn: async () => {
      const res = await fetch(`/api/admin/monitoring/activity-ledger?${ledgerQueryString}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch activity ledger');
      return res.json();
    },
    enabled: subTab === 'users',
    staleTime: 0,
  });

  const handleRefresh = () => {
    refetchOverview();
    if (subTab === 'users') { refetchActivity(); refetchLedger(); }
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

  const ovHasFilters = ovMethod || ovStatus || ovPath || ovUserId || ovOrgId || ovDays !== 1;
  const ovClearFilters = () => {
    setOvDays(1);
    setOvMethod('');
    setOvStatus('');
    setOvPath('');
    setOvUserId('');
    setOvOrgId('');
  };
  const ovTimeLabel = ovDays === 1 ? '24h' : ovDays === 7 ? '7d' : ovDays === 14 ? '14d' : ovDays === 30 ? '30d' : ovDays === 90 ? '90d' : `${ovDays}d`;

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

    const filterUsers = overview.filterOptions?.users ?? [];
    const filterOrgs = overview.filterOptions?.organizations ?? [];
    const methodBreakdown = overview.methodBreakdown ?? [];
    const statusBreakdown = overview.statusBreakdown ?? [];
    const ovTopUsers = overview.topUsers ?? [];
    const ovTopOrgs = overview.topOrgs ?? [];
    const slowEndpoints = overview.slowestEndpoints ?? [];

    return (
      <div className="space-y-6">
        <Card data-testid="card-overview-filters">
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(ovDays)} onValueChange={(v) => setOvDays(Number(v))}>
                <SelectTrigger className="w-[120px]" data-testid="select-ov-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24h</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ovMethod || 'all'} onValueChange={(v) => setOvMethod(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[120px]" data-testid="select-ov-method">
                  <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ovStatus || 'all'} onValueChange={(v) => setOvStatus(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[130px]" data-testid="select-ov-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="2xx">2xx Success</SelectItem>
                  <SelectItem value="3xx">3xx Redirect</SelectItem>
                  <SelectItem value="4xx">4xx Client Error</SelectItem>
                  <SelectItem value="5xx">5xx Server Error</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative min-w-[180px] flex-1 max-w-[280px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by path..."
                  value={ovPath}
                  onChange={(e) => setOvPath(e.target.value)}
                  className="pl-8"
                  data-testid="input-ov-path"
                />
              </div>
              <Select value={ovUserId || 'all'} onValueChange={(v) => setOvUserId(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[180px]" data-testid="select-ov-user">
                  <SelectValue placeholder="User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {filterUsers.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ovOrgId || 'all'} onValueChange={(v) => setOvOrgId(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[180px]" data-testid="select-ov-org">
                  <SelectValue placeholder="Organization" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Organizations</SelectItem>
                  {filterOrgs.map(o => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ovHasFilters && (
                <Button variant="ghost" size="sm" onClick={ovClearFilters} className="text-muted-foreground" data-testid="btn-ov-clear">
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
              {overviewFetching && !overviewLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card className="hover-elevate" data-testid="card-active-users">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="h-4 w-4" />
                Active Users
              </div>
              <div className="text-2xl font-bold mt-1">{formatNumber(overview.summary.activeUsers24h)}</div>
              <div className="text-xs text-muted-foreground">{ovTimeLabel}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-requests-today">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Globe className="h-4 w-4" />
                Requests
              </div>
              <div className="text-2xl font-bold mt-1">{formatNumber(overview.summary.requestsToday)}</div>
              <div className="text-xs text-muted-foreground">{ovTimeLabel}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-avg-response">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Zap className="h-4 w-4" />
                Avg Response
              </div>
              <div className="text-2xl font-bold mt-1">{overview.summary.avgResponseTime}</div>
              <div className="text-xs text-muted-foreground">{ovTimeLabel}</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-error-rate">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <AlertTriangle className="h-4 w-4" />
                Error Rate
              </div>
              <div className="text-2xl font-bold mt-1">{overview.summary.errorRate}</div>
              <div className="text-xs text-muted-foreground">{formatNumber(overview.summary.totalErrors)} errors</div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Method Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {methodBreakdown.length > 0 ? methodBreakdown.map((m, i) => {
                  const methodColors: Record<string, string> = { GET: 'bg-blue-500', POST: 'bg-green-500', PUT: 'bg-amber-500', PATCH: 'bg-orange-500', DELETE: 'bg-red-500' };
                  const maxCount = Math.max(...methodBreakdown.map(x => Number(x.count)));
                  const pct = maxCount > 0 ? (Number(m.count) / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-2" data-testid={`bar-method-${i}`}>
                      <span className="text-xs font-medium w-14">{m.method}</span>
                      <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                        <div className={`h-full ${methodColors[m.method] || 'bg-muted-foreground'} transition-all duration-300`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium w-12 text-right">{formatNumber(Number(m.count))}</span>
                    </div>
                  );
                }) : <div className="text-center text-muted-foreground text-xs py-2">No data</div>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {statusBreakdown.length > 0 ? statusBreakdown.map((s, i) => {
                  const statusColors: Record<string, string> = { '2xx': 'bg-green-500', '3xx': 'bg-blue-400', '4xx': 'bg-amber-500', '5xx': 'bg-red-500' };
                  const maxCount = Math.max(...statusBreakdown.map(x => Number(x.count)));
                  const pct = maxCount > 0 ? (Number(s.count) / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-2" data-testid={`bar-status-${i}`}>
                      <span className="text-xs font-medium w-14">{s.status_group}</span>
                      <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                        <div className={`h-full ${statusColors[s.status_group] || 'bg-muted-foreground'} transition-all duration-300`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium w-12 text-right">{formatNumber(Number(s.count))}</span>
                    </div>
                  );
                }) : <div className="text-center text-muted-foreground text-xs py-2">No data</div>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Top Users ({ovTimeLabel})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {ovTopUsers.length > 0 ? ovTopUsers.slice(0, 6).map((u, i) => (
                  <div key={i} className="flex items-center justify-between text-sm" data-testid={`row-ov-user-${i}`}>
                    <span className="truncate text-xs">
                      {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : (u.email || 'Unknown')}
                    </span>
                    <Badge variant="secondary" className="text-xs ml-1 shrink-0">{formatNumber(Number(u.count))}</Badge>
                  </div>
                )) : <div className="text-center text-muted-foreground text-xs py-2">No data</div>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Top Organizations ({ovTimeLabel})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {ovTopOrgs.length > 0 ? ovTopOrgs.slice(0, 6).map((o, i) => (
                  <div key={i} className="flex items-center justify-between text-sm" data-testid={`row-ov-org-${i}`}>
                    <span className="truncate text-xs">{o.org_name || 'Unknown'}</span>
                    <Badge variant="secondary" className="text-xs ml-1 shrink-0">{formatNumber(Number(o.count))}</Badge>
                  </div>
                )) : <div className="text-center text-muted-foreground text-xs py-2">No data</div>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                Top Endpoints ({ovTimeLabel})
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
                  {overview.topEndpoints?.slice(0, 10).map((ep, i) => (
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
                Errors ({ovTimeLabel})
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
                  {overview.recentErrors?.slice(0, 10).map((err, i) => (
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
                <Zap className="h-5 w-5 text-amber-500" />
                Slowest Endpoints ({ovTimeLabel})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Avg Time</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slowEndpoints.slice(0, 8).map((ep, i) => (
                    <TableRow key={i} data-testid={`row-slow-${i}`}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{ep.path}</TableCell>
                      <TableCell>
                        <Badge variant={ep.method === 'GET' ? 'secondary' : ep.method === 'POST' ? 'default' : 'outline'}>
                          {ep.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatDuration(ep.avg_duration)}</TableCell>
                      <TableCell className="text-right">{formatNumber(Number(ep.count))}</TableCell>
                    </TableRow>
                  ))}
                  {slowEndpoints.length === 0 && (
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
                <BarChart3 className="h-5 w-5" />
                Requests Per Day
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overview.charts.requestsPerDay?.slice(0, 14).map((day, i) => {
                  const maxCount = Math.max(...overview.charts.requestsPerDay.map(d => Number(d.count)));
                  const percentage = maxCount > 0 ? (Number(day.count) / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3" data-testid={`bar-requests-${i}`}>
                      <span className="text-xs text-muted-foreground w-24">{format(new Date(day.date), 'MMM d')}</span>
                      <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${percentage}%` }} />
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5" />
              User Registrations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overview.charts.userRegistrations?.slice(0, 14).map((day, i) => {
                const maxCount = Math.max(...overview.charts.userRegistrations.map(d => Number(d.count)));
                const percentage = maxCount > 0 ? (Number(day.count) / maxCount) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3" data-testid={`bar-registrations-${i}`}>
                    <span className="text-xs text-muted-foreground w-24">{format(new Date(day.date), 'MMM d')}</span>
                    <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                      <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${percentage}%` }} />
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
    );
  };

  const getActionLabel = (method: string) => {
    switch (method) {
      case 'POST': return 'Created';
      case 'PUT': return 'Updated';
      case 'PATCH': return 'Modified';
      case 'DELETE': return 'Deleted';
      default: return method;
    }
  };

  const getActionColor = (method: string) => {
    switch (method) {
      case 'POST': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'PUT': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'PATCH': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      case 'DELETE': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getEntityFromPath = (path: string): string => {
    const match = path.match(/^\/api\/(?:admin\/)?([^/]+)/);
    if (!match) return 'Unknown';
    const raw = match[1];
    const labels: Record<string, string> = {
      'projects': 'Project', 'portfolios': 'Portfolio', 'tasks': 'Task',
      'risks': 'Risk', 'issues': 'Issue', 'milestones': 'Milestone',
      'organizations': 'Organization', 'users': 'User', 'resources': 'Resource',
      'timesheets': 'Timesheet', 'invoices': 'Invoice', 'notifications': 'Notification',
      'billing': 'Billing', 'consents': 'Consent', 'help-tickets': 'Help Ticket',
      'demo-data': 'Demo Data', 'ai': 'AI', 'auth': 'Auth', 'planner': 'Planner',
      'mpp-imports': 'MPP Import', 'custom-dashboards': 'Dashboard',
      'project-intakes': 'Intake', 'change-requests': 'Change Request',
      'dynamics365': 'Dynamics 365', 'dataverse': 'Dataverse',
      'chat': 'AI Chat', 'plans': 'Plan', 'paypal': 'PayPal',
      'lessons-learned': 'Lesson', 'project-documents': 'Document',
    };
    return labels[raw] || raw.charAt(0).toUpperCase() + raw.slice(1).replace(/-/g, ' ');
  };

  const getEntityId = (path: string): string | null => {
    const match = path.match(/\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
  };

  const getActivityDescription = (entry: ActivityEntry): string => {
    const entity = getEntityFromPath(entry.path);
    const entityId = getEntityId(entry.path);
    const action = getActionLabel(entry.method);
    const subAction = entry.path.split('/').pop();
    const isSubAction = subAction && !subAction.match(/^\d+$/) && entry.path.split('/').length > 4;
    
    if (isSubAction && subAction) {
      const subLabel = subAction.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `${action} ${entity} ${subLabel}${entityId ? ` #${entityId}` : ''}`;
    }
    return `${action} ${entity}${entityId ? ` #${entityId}` : ''}`;
  };

  const getStatusBadgeVariant = (code: number): "default" | "secondary" | "destructive" | "outline" => {
    if (code >= 200 && code < 300) return 'secondary';
    if (code >= 300 && code < 400) return 'outline';
    if (code >= 400 && code < 500) return 'destructive';
    if (code >= 500) return 'destructive';
    return 'outline';
  };

  const toggleLedgerSort = (col: string) => {
    if (ledgerSortCol === col) {
      setLedgerSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setLedgerSortCol(col);
      setLedgerSortDir(col === 'created_at' ? 'desc' : 'asc');
    }
    setLedgerPage(1);
  };

  const renderUserActivity = () => {
    if (activityLoading || ledgerLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    const summary = activityLedger?.summary;
    const activities = activityLedger?.activities ?? [];
    const pagination = activityLedger?.pagination;
    const availableUsers = activityLedger?.users ?? [];

    const LedgerSortHead = ({ col, children, align }: { col: string; children: React.ReactNode; align?: string }) => (
      <TableHead
        className={`cursor-pointer select-none hover:text-foreground transition-colors ${align === 'right' ? 'text-right' : ''}`}
        onClick={() => toggleLedgerSort(col)}
        data-testid={`sort-ledger-${col}`}
      >
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
          {children}
          {ledgerSortCol === col ? (
            ledgerSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          ) : null}
        </div>
      </TableHead>
    );

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card data-testid="kpi-activity-creates">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-green-600">
                <Plus className="h-3.5 w-3.5" />
                Creates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(summary?.creates ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-activity-updates">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-blue-600">
                <Edit className="h-3.5 w-3.5" />
                Updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(summary?.updates ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-activity-deletes">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
                Deletes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(summary?.deletes ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-activity-errors">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                Errors
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(summary?.errors ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-activity-unique-users">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Active Users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(summary?.unique_users ?? 0))}</div>
            </CardContent>
          </Card>
        </div>

        {userActivity && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Most Active Users (24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {userActivity.topUsers?.slice(0, 8).map((user, i) => (
                    <div key={i} className="flex items-center justify-between text-sm" data-testid={`row-active-user-${i}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">
                          {user.first_name || user.last_name 
                            ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                            : 'Unknown'}
                        </span>
                        <span className="text-muted-foreground text-xs truncate">{user.email || '-'}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs ml-2 shrink-0">{formatNumber(Number(user.request_count))}</Badge>
                    </div>
                  ))}
                  {(!userActivity.topUsers || userActivity.topUsers.length === 0) && (
                    <div className="text-center text-muted-foreground text-sm py-2">No data yet</div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Active Users By Hour (24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {userActivity.hourlyActive?.slice(0, 8).map((hour, i) => {
                    const maxCount = Math.max(...userActivity.hourlyActive.map(h => Number(h.active_users)));
                    const percentage = maxCount > 0 ? (Number(hour.active_users) / maxCount) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-2" data-testid={`bar-hourly-${i}`}>
                        <span className="text-xs text-muted-foreground w-16">{format(new Date(hour.hour), 'h:mm a')}</span>
                        <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${percentage}%` }} />
                        </div>
                        <span className="text-xs font-medium w-8 text-right">{Number(hour.active_users)}</span>
                      </div>
                    );
                  })}
                  {(!userActivity.hourlyActive || userActivity.hourlyActive.length === 0) && (
                    <div className="text-center text-muted-foreground text-sm py-2">No data yet</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card data-testid="card-activity-ledger">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Activity Ledger
                </CardTitle>
                <CardDescription>
                  Complete log of all user actions ({formatNumber(pagination?.total ?? 0)} entries)
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="btn-ledger-columns">
                      <Settings2 className="h-4 w-4 mr-1" />
                      Fields
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Visible Fields</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {(Object.keys(ledgerColumnLabels) as LedgerColumnKey[]).map(col => (
                      <DropdownMenuCheckboxItem
                        key={col}
                        checked={hasLedgerCol(col)}
                        onCheckedChange={() => toggleLedgerColumn(col)}
                        data-testid={`toggle-ledger-col-${col}`}
                      >
                        {ledgerColumnLabels[col]}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setLedgerColumns(defaultLedgerColumns)}
                      data-testid="btn-ledger-reset-cols"
                    >
                      Reset to Default
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Badge variant="secondary" className="text-xs">
                  Last {ledgerDays} days
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users, paths, organizations..."
                  value={ledgerSearch}
                  onChange={(e) => { setLedgerSearch(e.target.value); setLedgerPage(1); }}
                  className="pl-8"
                  data-testid="input-ledger-search"
                />
              </div>
              <Select value={ledgerActionFilter} onValueChange={(v) => { setLedgerActionFilter(v === 'all' ? '' : v); setLedgerPage(1); }}>
                <SelectTrigger className="w-[130px]" data-testid="select-ledger-action">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="create">Creates</SelectItem>
                  <SelectItem value="update">Updates</SelectItem>
                  <SelectItem value="delete">Deletes</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ledgerEntityFilter} onValueChange={(v) => { setLedgerEntityFilter(v === 'all' ? '' : v); setLedgerPage(1); }}>
                <SelectTrigger className="w-[150px]" data-testid="select-ledger-entity">
                  <SelectValue placeholder="Entity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  <SelectItem value="projects">Projects</SelectItem>
                  <SelectItem value="portfolios">Portfolios</SelectItem>
                  <SelectItem value="tasks">Tasks</SelectItem>
                  <SelectItem value="risks">Risks</SelectItem>
                  <SelectItem value="issues">Issues</SelectItem>
                  <SelectItem value="milestones">Milestones</SelectItem>
                  <SelectItem value="organizations">Organizations</SelectItem>
                  <SelectItem value="resources">Resources</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="auth">Auth</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                  <SelectItem value="demo-data">Demo Data</SelectItem>
                  <SelectItem value="help-tickets">Help Tickets</SelectItem>
                  <SelectItem value="plans">Plans</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ledgerUserFilter} onValueChange={(v) => { setLedgerUserFilter(v === 'all' ? '' : v); setLedgerPage(1); }}>
                <SelectTrigger className="w-[180px]" data-testid="select-ledger-user">
                  <SelectValue placeholder="User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {availableUsers.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(ledgerDays)} onValueChange={(v) => { setLedgerDays(Number(v)); setLedgerPage(1); }}>
                <SelectTrigger className="w-[120px]" data-testid="select-ledger-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24h</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {ledgerLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No activities found for the current filters</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {hasLedgerCol('timestamp') && <LedgerSortHead col="created_at">Timestamp</LedgerSortHead>}
                        {hasLedgerCol('user') && <LedgerSortHead col="user">User</LedgerSortHead>}
                        {hasLedgerCol('action') && <TableHead>Action</TableHead>}
                        {hasLedgerCol('method') && <TableHead>HTTP Method</TableHead>}
                        {hasLedgerCol('details') && <LedgerSortHead col="path">Details</LedgerSortHead>}
                        {hasLedgerCol('entity') && <TableHead>Entity</TableHead>}
                        {hasLedgerCol('path') && <TableHead>Path</TableHead>}
                        {hasLedgerCol('organization') && <TableHead>Organization</TableHead>}
                        {hasLedgerCol('status') && <LedgerSortHead col="status" align="right">Status</LedgerSortHead>}
                        {hasLedgerCol('duration') && <LedgerSortHead col="duration" align="right">Duration</LedgerSortHead>}
                        {hasLedgerCol('ip') && <TableHead>IP Address</TableHead>}
                        {hasLedgerCol('userAgent') && <TableHead>User Agent</TableHead>}
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activities.map((entry) => (
                        <>
                          <TableRow
                            key={entry.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setLedgerExpandedRow(ledgerExpandedRow === entry.id ? null : entry.id)}
                            data-testid={`row-activity-${entry.id}`}
                          >
                            {hasLedgerCol('timestamp') && (
                              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                                {format(new Date(entry.created_at), 'MMM d, h:mm:ss a')}
                              </TableCell>
                            )}
                            {hasLedgerCol('user') && (
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                                    {(entry.user_first_name || entry.user_email || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">
                                      {entry.user_first_name || entry.user_last_name
                                        ? `${entry.user_first_name || ''} ${entry.user_last_name || ''}`.trim()
                                        : 'Unknown'}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">{entry.user_email}</div>
                                  </div>
                                </div>
                              </TableCell>
                            )}
                            {hasLedgerCol('action') && (
                              <TableCell>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getActionColor(entry.method)}`}>
                                  {getActionLabel(entry.method)}
                                </span>
                              </TableCell>
                            )}
                            {hasLedgerCol('method') && (
                              <TableCell>
                                <Badge variant="outline" className="text-xs font-mono">{entry.method}</Badge>
                              </TableCell>
                            )}
                            {hasLedgerCol('details') && (
                              <TableCell>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium">{getActivityDescription(entry)}</div>
                                  <div className="text-xs text-muted-foreground font-mono truncate max-w-[250px]">{entry.path}</div>
                                </div>
                              </TableCell>
                            )}
                            {hasLedgerCol('entity') && (
                              <TableCell className="text-sm">{getEntityFromPath(entry.path)}</TableCell>
                            )}
                            {hasLedgerCol('path') && (
                              <TableCell className="font-mono text-xs max-w-[250px] truncate">{entry.path}</TableCell>
                            )}
                            {hasLedgerCol('organization') && (
                              <TableCell className="text-sm text-muted-foreground">
                                {entry.org_name || '-'}
                              </TableCell>
                            )}
                            {hasLedgerCol('status') && (
                              <TableCell className="text-right">
                                <Badge variant={getStatusBadgeVariant(entry.status_code)} className="text-xs font-mono">
                                  {entry.status_code}
                                </Badge>
                              </TableCell>
                            )}
                            {hasLedgerCol('duration') && (
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {entry.duration !== null ? `${entry.duration}ms` : '-'}
                              </TableCell>
                            )}
                            {hasLedgerCol('ip') && (
                              <TableCell className="text-xs font-mono text-muted-foreground">{entry.ip_address || '-'}</TableCell>
                            )}
                            {hasLedgerCol('userAgent') && (
                              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{entry.user_agent || '-'}</TableCell>
                            )}
                            <TableCell>
                              {ledgerExpandedRow === entry.id ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                          </TableRow>
                          {ledgerExpandedRow === entry.id && (
                            <TableRow key={`${entry.id}-detail`}>
                              <TableCell colSpan={visibleLedgerColCount} className="bg-muted/30 p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                  <div className="space-y-2">
                                    <div>
                                      <span className="text-muted-foreground">User ID:</span>
                                      <span className="ml-2 font-mono text-xs">{entry.user_id}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">IP Address:</span>
                                      <span className="ml-2 font-mono text-xs">{entry.ip_address || 'N/A'}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Organization:</span>
                                      <span className="ml-2">{entry.org_name ? `${entry.org_name} (${entry.org_slug})` : 'N/A'}</span>
                                    </div>
                                    {entry.error_message && (
                                      <div>
                                        <span className="text-destructive font-medium">Error:</span>
                                        <span className="ml-2 text-destructive">{entry.error_message}</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <div>
                                      <span className="text-muted-foreground">Full Path:</span>
                                      <span className="ml-2 font-mono text-xs break-all">{entry.path}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">User Agent:</span>
                                      <span className="ml-2 text-xs truncate block max-w-full">{entry.user_agent || 'N/A'}</span>
                                    </div>
                                    {entry.request_body && Object.keys(entry.request_body).length > 0 && (
                                      <div>
                                        <span className="text-muted-foreground">Request Body:</span>
                                        <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-h-32">
                                          {JSON.stringify(entry.request_body, null, 2)}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      Page {pagination.page} of {pagination.totalPages} ({formatNumber(pagination.total)} entries)
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination.page <= 1}
                        onClick={() => setLedgerPage(p => Math.max(1, p - 1))}
                        data-testid="btn-ledger-prev"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => setLedgerPage(p => p + 1)}
                        data-testid="btn-ledger-next"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
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

    const totals = orgUsage.totals;
    const orgs = orgUsage.organizations ?? [];
    const creditsByOrg = new Map<number, OrgCreditUsage[]>();
    (orgUsage.creditUsage ?? []).forEach(cu => {
      const list = creditsByOrg.get(cu.org_id) ?? [];
      list.push(cu);
      creditsByOrg.set(cu.org_id, list);
    });

    const totalObjects = Number(totals?.total_projects ?? 0) + Number(totals?.total_tasks ?? 0) + Number(totals?.total_portfolios ?? 0);

    const getCreditsUsed = (orgId: number) => {
      const credits = creditsByOrg.get(orgId)?.find(c => c.meter_code === 'credits');
      return credits ? Number(credits.used_units) : 0;
    };
    const getCreditsIncluded = (orgId: number) => {
      const credits = creditsByOrg.get(orgId)?.find(c => c.meter_code === 'credits');
      return credits ? Number(credits.included_units) : 0;
    };
    const getAiRunsUsed = (orgId: number) => {
      const ai = creditsByOrg.get(orgId)?.find(c => c.meter_code === 'ai_runs');
      return ai ? Number(ai.used_units) : 0;
    };
    const getAiRunsIncluded = (orgId: number) => {
      const ai = creditsByOrg.get(orgId)?.find(c => c.meter_code === 'ai_runs');
      return ai ? Number(ai.included_units) : 0;
    };

    const getPlanVariant = (code: string | null): "default" | "secondary" | "outline" | "destructive" => {
      switch (code) {
        case 'ENTERPRISE': return 'default';
        case 'TEAM': return 'default';
        case 'BASIC': return 'secondary';
        case 'CUSTOM': return 'outline';
        case 'FREE': return 'secondary';
        default: return 'destructive';
      }
    };

    const toggleOrgSort = (col: string) => {
      if (orgSortCol === col) {
        setOrgSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setOrgSortCol(col);
        setOrgSortDir('asc');
      }
    };

    const sortedOrgs = [...orgs].sort((a, b) => {
      const dir = orgSortDir === 'asc' ? 1 : -1;
      switch (orgSortCol) {
        case 'name': return dir * (a.name ?? '').localeCompare(b.name ?? '');
        case 'plan': return dir * (a.plan_name ?? '').localeCompare(b.plan_name ?? '');
        case 'users': return dir * (Number(a.member_count) - Number(b.member_count));
        case 'projects': return dir * (Number(a.project_count) - Number(b.project_count));
        case 'tasks': return dir * (Number(a.task_count) - Number(b.task_count));
        case 'portfolios': return dir * (Number(a.portfolio_count) - Number(b.portfolio_count));
        case 'risks': return dir * (Number(a.risk_count) - Number(b.risk_count));
        case 'credits': return dir * (getCreditsUsed(a.id) - getCreditsUsed(b.id));
        case 'ai': return dir * (getAiRunsUsed(a.id) - getAiRunsUsed(b.id));
        case 'api': return dir * (Number(a.api_requests_7d) - Number(b.api_requests_7d));
        default: return 0;
      }
    });

    const SortHeader = ({ col, children, align }: { col: string; children: React.ReactNode; align?: string }) => (
      <TableHead
        className={`cursor-pointer select-none hover:text-foreground transition-colors ${align === 'right' ? 'text-right' : ''}`}
        onClick={() => toggleOrgSort(col)}
        data-testid={`sort-org-${col}`}
      >
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
          {children}
          {orgSortCol === col ? (
            orgSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3 opacity-0 group-hover:opacity-30" />
          )}
        </div>
      </TableHead>
    );

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card data-testid="kpi-total-orgs">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Organizations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(totals?.total_orgs ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-total-users">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Total Users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(totals?.total_users ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-total-projects">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                Projects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(totals?.total_projects ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-total-tasks">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" />
                Tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(Number(totals?.total_tasks ?? 0))}</div>
            </CardContent>
          </Card>
          <Card data-testid="kpi-total-objects">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Total Objects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(totalObjects)}</div>
              <p className="text-xs text-muted-foreground mt-1">Projects + Tasks + Portfolios</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2" data-testid="card-plan-distribution">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Plan Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {(orgUsage.planDistribution ?? []).map((pd) => (
                  <Badge
                    key={pd.plan_code}
                    variant={getPlanVariant(pd.plan_code)}
                    className="text-sm px-3 py-1.5 gap-1.5"
                    data-testid={`plan-dist-${pd.plan_code}`}
                  >
                    <span className="font-semibold text-base">{Number(pd.org_count)}</span>
                    {pd.plan_name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-credit-summary">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Credits This Period
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const totalCreditsUsed = orgs.reduce((sum, org) => sum + getCreditsUsed(org.id), 0);
                const totalCreditsIncluded = orgs.reduce((sum, org) => sum + getCreditsIncluded(org.id), 0);
                const totalAiUsed = orgs.reduce((sum, org) => sum + getAiRunsUsed(org.id), 0);
                const totalAiIncluded = orgs.reduce((sum, org) => sum + getAiRunsIncluded(org.id), 0);
                return (
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Credits</span>
                        <span className="font-medium">{formatNumber(totalCreditsUsed)} / {formatNumber(totalCreditsIncluded)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${totalCreditsIncluded > 0 ? Math.min((totalCreditsUsed / totalCreditsIncluded) * 100, 100) : 0}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">AI Runs</span>
                        <span className="font-medium">{formatNumber(totalAiUsed)} / {formatNumber(totalAiIncluded)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${totalAiIncluded > 0 ? Math.min((totalAiUsed / totalAiIncluded) * 100, 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-org-details-table">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Organization Details
                </CardTitle>
                <CardDescription>Comprehensive overview of all active organizations</CardDescription>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="btn-org-usage-columns">
                    <Settings2 className="h-4 w-4 mr-1" />
                    Fields
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Visible Fields</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(Object.keys(orgUsageColLabels) as OrgUsageColumnKey[]).map(col => (
                    <DropdownMenuCheckboxItem
                      key={col}
                      checked={hasOrgCol(col)}
                      onCheckedChange={() => toggleOrgUsageCol(col)}
                      data-testid={`toggle-org-col-${col}`}
                    >
                      {orgUsageColLabels[col]}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setOrgUsageCols(defaultOrgUsageCols)}
                    data-testid="btn-org-reset-cols"
                  >
                    Reset to Default
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {hasOrgCol('name') && <SortHeader col="name">Organization</SortHeader>}
                    {hasOrgCol('plan') && <SortHeader col="plan">Plan</SortHeader>}
                    {hasOrgCol('users') && <SortHeader col="users" align="right">Users</SortHeader>}
                    {hasOrgCol('projects') && <SortHeader col="projects" align="right">Projects</SortHeader>}
                    {hasOrgCol('tasks') && <SortHeader col="tasks" align="right">Tasks</SortHeader>}
                    {hasOrgCol('portfolios') && <SortHeader col="portfolios" align="right">Portfolios</SortHeader>}
                    {hasOrgCol('risks') && <SortHeader col="risks" align="right">Risks</SortHeader>}
                    {hasOrgCol('credits') && <SortHeader col="credits" align="right">Credits Used</SortHeader>}
                    {hasOrgCol('ai') && <SortHeader col="ai" align="right">AI Runs</SortHeader>}
                    {hasOrgCol('api') && <SortHeader col="api" align="right">API (7d)</SortHeader>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedOrgs.map((org) => {
                    const creditsUsed = getCreditsUsed(org.id);
                    const creditsIncluded = getCreditsIncluded(org.id);
                    const aiUsed = getAiRunsUsed(org.id);
                    const aiIncluded = getAiRunsIncluded(org.id);
                    const creditPct = creditsIncluded > 0 ? (creditsUsed / creditsIncluded) * 100 : 0;
                    return (
                      <TableRow key={org.id} data-testid={`row-org-usage-${org.id}`}>
                        {hasOrgCol('name') && (
                          <TableCell>
                            <a
                              href={`/organizations/${org.id}`}
                              className="block hover:underline"
                              data-testid={`link-org-${org.id}`}
                            >
                              <div className="font-medium text-primary">{org.name}</div>
                              <div className="text-xs text-muted-foreground">{org.slug}</div>
                            </a>
                          </TableCell>
                        )}
                        {hasOrgCol('plan') && (
                          <TableCell>
                            <Badge variant={getPlanVariant(org.plan_code)} className="text-xs">
                              {org.plan_name || 'No Plan'}
                            </Badge>
                          </TableCell>
                        )}
                        {hasOrgCol('users') && <TableCell className="text-right">{formatNumber(Number(org.member_count))}</TableCell>}
                        {hasOrgCol('projects') && <TableCell className="text-right">{formatNumber(Number(org.project_count))}</TableCell>}
                        {hasOrgCol('tasks') && <TableCell className="text-right">{formatNumber(Number(org.task_count))}</TableCell>}
                        {hasOrgCol('portfolios') && <TableCell className="text-right">{formatNumber(Number(org.portfolio_count))}</TableCell>}
                        {hasOrgCol('risks') && <TableCell className="text-right">{formatNumber(Number(org.risk_count))}</TableCell>}
                        {hasOrgCol('credits') && (
                          <TableCell className="text-right">
                            {creditsIncluded > 0 ? (
                              <div className="flex items-center justify-end gap-2">
                                <span className={creditPct > 80 ? 'text-destructive font-semibold' : ''}>
                                  {formatNumber(creditsUsed)}
                                </span>
                                <span className="text-xs text-muted-foreground">/ {formatNumber(creditsIncluded)}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {hasOrgCol('ai') && (
                          <TableCell className="text-right">
                            {aiIncluded > 0 ? (
                              <div className="flex items-center justify-end gap-2">
                                <span>{formatNumber(aiUsed)}</span>
                                <span className="text-xs text-muted-foreground">/ {formatNumber(aiIncluded)}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {hasOrgCol('api') && <TableCell className="text-right font-medium">{formatNumber(Number(org.api_requests_7d))}</TableCell>}
                      </TableRow>
                    );
                  })}
                  {orgs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={orgUsageCols.length || 1} className="text-center text-muted-foreground">No organization data available</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
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
          <Button
            variant={subTab === 'analytics' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSubTab('analytics')}
            data-testid="btn-subtab-analytics"
          >
            <TrendingUp className="h-4 w-4 mr-1" />
            Analytics
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
      {subTab === 'analytics' && <AnalyticsTab />}
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
    staleTime: 0,
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
    staleTime: 0,
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
