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
  import { RichTextEditor } from "@/components/ui/rich-text-editor";
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { Loader2, Trash2, Building2, Users, Plus, Edit, UserPlus, RotateCcw, ChevronDown, ChevronRight, Archive, ArrowUp, ArrowDown, Search, Settings2, TrendingUp, HelpCircle, CheckCircle, XCircle, Download, Mail, Copy, Send, MoreHorizontal, Wrench, Activity } from "lucide-react";
  import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
  import { format } from "date-fns";
  import { useToast } from "@/hooks/use-toast";
  import { downloadCsv } from "@/lib/downloadCsv";
  import type { Organization, User } from "@shared/schema";

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

export function AllUsersTab() {
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
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
          <div className="relative w-full sm:flex-1 sm:max-w-sm">
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
            <SelectTrigger className="w-[120px] sm:w-[140px]" data-testid="select-verified-filter">
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
            className="w-[120px] sm:w-[140px]"
            placeholder="From"
            data-testid="input-date-from"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
            className="w-[120px] sm:w-[140px]"
            placeholder="To"
            data-testid="input-date-to"
          />
          {!isMarketing && (
            <Select value={technicianFilter} onValueChange={(v) => { setTechnicianFilter(v); setActiveCard(null); setCurrentPage(1); }}>
              <SelectTrigger className="w-[140px] sm:w-[160px]" data-testid="select-technician-filter">
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
        <div className="overflow-x-auto">
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
                      asChild
                      title="View insights"
                      data-testid={`button-view-insights-${user.id}`}
                    >
                      <a href={`/admin/users/${user.id}/insights`}>
                        <Activity className="h-4 w-4 text-blue-500" />
                      </a>
                    </Button>
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
        </div>
        {activeUsers.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">No active users found.</div>
        )}

        {totalUserPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 mt-4 flex-wrap">
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
            <CollapsibleContent className="mt-4 overflow-x-auto">
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-edit-user-memberships">
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
                <div className="overflow-x-auto">
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
                </div>
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

