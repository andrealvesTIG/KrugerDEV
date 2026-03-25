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
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { Loader2, Trash2, Building2, Users, Plus, Edit, ShieldAlert, Sparkles, Eraser, CreditCard, UserPlus, RotateCcw, ChevronDown, ChevronRight, Archive, Wallet, ArrowUp, ArrowDown, Search, Settings2, CheckCircle, Download } from "lucide-react";
  import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
  import { downloadCsv } from "@/lib/downloadCsv";
  import { format } from "date-fns";
  import { useToast } from "@/hooks/use-toast";
  import type { Organization, User } from "@shared/schema";

  interface IndustryOption {
    id: string;
    label: string;
    description: string;
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

export function OrganizationsTab() {
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
  type OrgSortField = 'name' | 'slug' | 'description' | 'owner' | 'members' | 'plan' | 'credits' | 'created';
  type OrgSortDirection = 'asc' | 'desc';
  const [orgSortField, setOrgSortField] = useState<OrgSortField>('created');
  const [orgSortDirection, setOrgSortDirection] = useState<OrgSortDirection>('desc');
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
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (orgSortField) {
        case 'name':
          comparison = (a.name ?? '').localeCompare(b.name ?? '');
          break;
        case 'slug':
          comparison = (a.slug ?? '').localeCompare(b.slug ?? '');
          break;
        case 'description':
          comparison = (a.description ?? '').localeCompare(b.description ?? '');
          break;
        case 'owner':
          comparison = getOwnerName(a.ownerId).localeCompare(getOwnerName(b.ownerId));
          break;
        case 'members':
          comparison = getMemberCount(a.id) - getMemberCount(b.id);
          break;
        case 'plan': {
          const pA = getOrgPlan(a.id);
          const pB = getOrgPlan(b.id);
          const planA = pA?.planName || pA?.planCode || '';
          const planB = pB?.planName || pB?.planCode || '';
          comparison = planA.localeCompare(planB);
          break;
        }
        case 'credits': {
          const credA = orgCreditUsage?.[a.id]?.used ?? 0;
          const credB = orgCreditUsage?.[b.id]?.used ?? 0;
          comparison = credA - credB;
          break;
        }
        case 'created':
          comparison = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
          break;
      }
      return orgSortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [organizations, searchQuery, orgSortField, orgSortDirection, users, allOrgMembers, planFilter, orgSubscriptions, orgCreditUsage]);

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

  const handleOrgSort = (field: OrgSortField) => {
    if (orgSortField === field) {
      setOrgSortDirection(orgSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setOrgSortField(field);
      setOrgSortDirection('asc');
    }
    setCurrentPage(1);
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
      if (s.milestones) parts.push(`${s.milestones} key dates`);
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
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="text-base sm:text-lg">All Organizations</CardTitle>
          <CardDescription>Manage organization tenants in the system</CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-8 w-full sm:w-[200px]"
              data-testid="input-org-search"
            />
          </div>
          <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-[120px] sm:w-[140px]" data-testid="select-plan-filter">
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
          <Button onClick={() => setIsCreateOpen(true)} disabled={isMarketing} data-testid="button-create-org" className="whitespace-nowrap">
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Create Organization</span>
            <span className="sm:hidden">Create</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.includes('name') && (
                <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleOrgSort('name')}>
                  <div className="flex items-center gap-1">
                    Name
                    {orgSortField === 'name' && (orgSortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </TableHead>
              )}
              {visibleColumns.includes('slug') && (
                <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleOrgSort('slug')}>
                  <div className="flex items-center gap-1">
                    Slug
                    {orgSortField === 'slug' && (orgSortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </TableHead>
              )}
              {visibleColumns.includes('description') && (
                <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleOrgSort('description')}>
                  <div className="flex items-center gap-1">
                    Description
                    {orgSortField === 'description' && (orgSortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </TableHead>
              )}
              {visibleColumns.includes('owner') && (
                <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleOrgSort('owner')}>
                  <div className="flex items-center gap-1">
                    Owner
                    {orgSortField === 'owner' && (orgSortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </TableHead>
              )}
              {visibleColumns.includes('members') && (
                <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleOrgSort('members')}>
                  <div className="flex items-center gap-1">
                    Members
                    {orgSortField === 'members' && (orgSortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </TableHead>
              )}
              {visibleColumns.includes('plan') && (
                <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleOrgSort('plan')}>
                  <div className="flex items-center gap-1">
                    Plan
                    {orgSortField === 'plan' && (orgSortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </TableHead>
              )}
              {visibleColumns.includes('credits') && (
                <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleOrgSort('credits')}>
                  <div className="flex items-center gap-1">
                    Credits (Used / Included)
                    {orgSortField === 'credits' && (orgSortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </TableHead>
              )}
              {visibleColumns.includes('created') && (
                <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleOrgSort('created')}>
                  <div className="flex items-center gap-1">
                    Created
                    {orgSortField === 'created' && (orgSortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </TableHead>
              )}
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
        </div>
        {filteredOrganizations?.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            {searchQuery ? 'No organizations match your search.' : 'No organizations yet. Create one to get started.'}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 pt-4 border-t mt-4">
            <div className="text-xs sm:text-sm text-muted-foreground">
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
              <div className="rounded-lg border bg-muted/30 p-4 overflow-x-auto">
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
                      { key: 'tasks', label: 'Tasks', desc: 'Work items & key dates' },
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
              This will permanently delete all <strong>demo-generated</strong> data for <strong>{deleteDemoDataOrg?.name}</strong>, including portfolios, projects, tasks, risks, issues, key dates, financials, change requests, documents, benefits, decisions, assignments, timesheets, resources, and intakes.
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

      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
        <div className="flex-1 space-y-1 min-w-0">
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
        <div className="w-full sm:w-32 space-y-1">
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

