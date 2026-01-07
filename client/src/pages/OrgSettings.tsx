import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, UserPlus, Trash2, Settings, Users, ShieldAlert, RotateCcw, Folder, FileText, Target, Flag, AlertCircle, CheckSquare, LayoutDashboard, Briefcase, FolderKanban, FileInput, CircleDot, Calendar, Plug, EyeOff, Eye } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Organization, OrganizationMember, User, RecycleBinItem, RecycleBinItemType } from "@shared/schema";

interface EnrichedMember extends OrganizationMember {
  user?: User;
}

export default function OrgSettings() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);

  const { data: memberships } = useQuery<OrganizationMember[]>({
    queryKey: ['/api/users', user?.id, 'organizations'],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/users/${user.id}/organizations`);
      return res.json();
    },
    enabled: !!user?.id
  });

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ['/api/organizations']
  });

  const userOrgs = memberships?.filter(m => m.role === 'org_admin').map(m => {
    return organizations?.find(o => o.id === m.organizationId);
  }).filter(Boolean) as Organization[] || [];

  // Super admins can see all organizations
  const accessibleOrgs = user?.role === 'super_admin' ? (organizations || []) : userOrgs;

  if (authLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasOrgAdminAccess = userOrgs.length > 0 || user?.role === 'super_admin';

  if (!hasOrgAdminAccess) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-2xl font-bold text-foreground">No Organization Access</h2>
        <p className="text-muted-foreground">You are not an admin of any organization.</p>
      </div>
    );
  }

  // If no organizations exist yet, show a message
  if (accessibleOrgs.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Organization Settings</h1>
            <p className="text-muted-foreground">Manage your organization and team members</p>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Users className="h-16 w-16 text-muted-foreground/50" />
            <h2 className="text-xl font-semibold text-foreground">No Organizations Yet</h2>
            <p className="text-muted-foreground text-center max-w-md">
              {user?.role === 'super_admin' 
                ? "Go to Super Admin to create your first organization, then come back here to manage its members."
                : "You don't have access to any organizations yet. Contact your administrator."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentOrg = selectedOrgId ? organizations?.find(o => o.id === selectedOrgId) : accessibleOrgs[0];
  const orgId = currentOrg?.id || selectedOrgId;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Organization Settings</h1>
            <p className="text-muted-foreground">Manage your organization and team members</p>
          </div>
        </div>
        {accessibleOrgs.length > 1 && (
          <Select value={String(orgId)} onValueChange={(v) => setSelectedOrgId(Number(v))}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select organization" />
            </SelectTrigger>
            <SelectContent>
              {accessibleOrgs.map(org => (
                <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {orgId && currentOrg && <ModuleVisibilitySection organization={currentOrg} />}
      {orgId && <MembersSection organizationId={orgId} orgName={currentOrg?.name || ''} />}
      {orgId && <RecycleBinSection organizationId={orgId} />}
    </div>
  );
}

const availableModules = [
  { key: "dashboard", name: "Dashboard", icon: LayoutDashboard, description: "Overview and analytics" },
  { key: "portfolios", name: "Portfolios", icon: Briefcase, description: "Group and manage portfolios" },
  { key: "projects", name: "Projects", icon: FolderKanban, description: "Project management" },
  { key: "intakes", name: "Intakes", icon: FileInput, description: "Project intake requests" },
  { key: "tasks", name: "Tasks", icon: CheckSquare, description: "Task tracking" },
  { key: "issues", name: "Issues", icon: CircleDot, description: "Issue tracking" },
  { key: "resources", name: "Resources", icon: Users, description: "Resource management" },
  { key: "calendar", name: "Calendar", icon: Calendar, description: "Calendar view" },
  { key: "integrations", name: "Integrations", icon: Plug, description: "External integrations" },
];

function ModuleVisibilitySection({ organization }: { organization: Organization }) {
  const { toast } = useToast();
  const hiddenModules = organization.hiddenModules || [];
  
  const updateOrgMutation = useMutation({
    mutationFn: async (newHiddenModules: string[]) => {
      return apiRequest('PUT', `/api/organizations/${organization.id}`, { 
        hiddenModules: newHiddenModules 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      toast({ title: "Saved", description: "Module visibility settings updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update settings", variant: "destructive" });
    }
  });

  const toggleModule = (moduleKey: string) => {
    const isHidden = hiddenModules.includes(moduleKey);
    const newHiddenModules = isHidden 
      ? hiddenModules.filter(k => k !== moduleKey)
      : [...hiddenModules, moduleKey];
    updateOrgMutation.mutate(newHiddenModules);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <EyeOff className="h-5 w-5" />
          Module Visibility
        </CardTitle>
        <CardDescription>
          Control which modules are visible in the sidebar for this organization. Hidden modules will not appear in navigation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {availableModules.map((module) => {
            const isHidden = hiddenModules.includes(module.key);
            const Icon = module.icon;
            return (
              <div 
                key={module.key} 
                className="flex items-center justify-between p-3 rounded-lg border hover-elevate"
                data-testid={`module-toggle-${module.key}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md ${isHidden ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {module.name}
                      {isHidden && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">{module.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </span>
                  <Switch
                    checked={!isHidden}
                    onCheckedChange={() => toggleModule(module.key)}
                    disabled={updateOrgMutation.isPending}
                    data-testid={`switch-module-${module.key}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RecycleBinSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [itemToDelete, setItemToDelete] = useState<RecycleBinItem | null>(null);

  const { data: deletedItems, isLoading } = useQuery<RecycleBinItem[]>({
    queryKey: ['/api/organizations', organizationId, 'recycle-bin'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/recycle-bin`);
      if (!res.ok) return [];
      return res.json();
    }
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ type, itemId }: { type: RecycleBinItemType; itemId: number }) => {
      return apiRequest('POST', `/api/organizations/${organizationId}/recycle-bin/restore`, { type, itemId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'recycle-bin'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({ title: "Restored", description: "Item has been restored successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to restore item", variant: "destructive" });
    }
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async ({ type, itemId }: { type: RecycleBinItemType; itemId: number }) => {
      return apiRequest('DELETE', `/api/organizations/${organizationId}/recycle-bin/${type}/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'recycle-bin'] });
      toast({ title: "Deleted", description: "Item has been permanently deleted" });
      setItemToDelete(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete item", variant: "destructive" });
    }
  });

  const getTypeIcon = (type: RecycleBinItemType) => {
    switch (type) {
      case 'portfolio': return <Folder className="h-4 w-4" />;
      case 'project': return <FileText className="h-4 w-4" />;
      case 'task': return <CheckSquare className="h-4 w-4" />;
      case 'risk': return <AlertCircle className="h-4 w-4" />;
      case 'milestone': return <Target className="h-4 w-4" />;
      case 'issue': return <Flag className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeBadgeVariant = (type: RecycleBinItemType) => {
    switch (type) {
      case 'portfolio': return 'default';
      case 'project': return 'secondary';
      case 'task': return 'outline';
      case 'risk': return 'destructive';
      case 'milestone': return 'default';
      case 'issue': return 'secondary';
      default: return 'outline';
    }
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Recycle Bin
        </CardTitle>
        <CardDescription>
          Recently deleted items can be restored or permanently removed
        </CardDescription>
      </CardHeader>
      <CardContent>
        {deletedItems && deletedItems.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Deleted By</TableHead>
                <TableHead>Deleted At</TableHead>
                <TableHead className="w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deletedItems.map((item) => (
                <TableRow key={`${item.type}-${item.id}`} data-testid={`recycle-bin-row-${item.type}-${item.id}`}>
                  <TableCell>
                    <Badge variant={getTypeBadgeVariant(item.type) as any} className="flex items-center gap-1 w-fit">
                      {getTypeIcon(item.type)}
                      {item.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.projectName || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{item.deletedByName || 'Unknown'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(item.deletedAt), 'MMM d, yyyy h:mm a')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => restoreMutation.mutate({ type: item.type, itemId: item.id })}
                        disabled={restoreMutation.isPending}
                        title="Restore"
                        data-testid={`button-restore-${item.type}-${item.id}`}
                      >
                        <RotateCcw className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setItemToDelete(item)}
                        disabled={permanentDeleteMutation.isPending}
                        title="Delete permanently"
                        data-testid={`button-delete-permanent-${item.type}-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No deleted items in the recycle bin.
          </div>
        )}
      </CardContent>

      <AlertDialog open={itemToDelete !== null} onOpenChange={() => setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{itemToDelete?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => itemToDelete && permanentDeleteMutation.mutate({ type: itemToDelete.type, itemId: itemToDelete.id })}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function MembersSection({ organizationId, orgName }: { organizationId: number; orgName: string }) {
  const { toast } = useToast();
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("member");
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);

  const { data: members, isLoading } = useQuery<EnrichedMember[]>({
    queryKey: ['/api/organizations', organizationId, 'members'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/members`);
      if (!res.ok) return []; // Return empty array on error (e.g., 403 access denied)
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  });

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ['/api/users']
  });

  const addMember = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest('POST', `/api/organizations/${organizationId}/members`, { userId, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'members'] });
      toast({ title: "Success", description: "Member added to organization" });
      setIsAddMemberOpen(false);
      setSelectedUserId("");
      setSelectedRole("member");
    }
  });

  const updateMemberRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest('PUT', `/api/organizations/${organizationId}/members/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'members'] });
      toast({ title: "Success", description: "Member role updated" });
    }
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest('DELETE', `/api/organizations/${organizationId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'members'] });
      toast({ title: "Success", description: "Member removed from organization" });
      setRemoveMemberId(null);
    }
  });

  const existingMemberIds = members?.map(m => m.userId) || [];
  const availableUsers = allUsers?.filter(u => !existingMemberIds.includes(u.id)) || [];

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members - {orgName}
          </CardTitle>
          <CardDescription>Manage who has access to this organization</CardDescription>
        </div>
        <Button onClick={() => setIsAddMemberOpen(true)} data-testid="button-add-member">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Member
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map(member => (
              <TableRow key={member.id} data-testid={`member-row-${member.id}`}>
                <TableCell className="font-medium">
                  {member.user?.firstName} {member.user?.lastName}
                </TableCell>
                <TableCell>{member.user?.email || 'N/A'}</TableCell>
                <TableCell>
                  <Select 
                    value={member.role} 
                    onValueChange={(role) => updateMemberRole.mutate({ userId: member.userId, role })}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="org_admin">Org Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {member.createdAt ? format(new Date(member.createdAt), 'MMM d, yyyy') : 'N/A'}
                </TableCell>
                <TableCell>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setRemoveMemberId(member.userId)}
                    data-testid={`button-remove-member-${member.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {members?.length === 0 && (
          <div className="text-center py-8 text-slate-500">No members in this organization yet.</div>
        )}
      </CardContent>

      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Add an existing user to this organization</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a user" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_admin">Org Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddMemberOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => addMember.mutate({ userId: selectedUserId, role: selectedRole })}
              disabled={!selectedUserId}
              data-testid="button-confirm-add-member"
            >
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeMemberId !== null} onOpenChange={() => setRemoveMemberId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this member from the organization?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveMemberId(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => removeMemberId && removeMember.mutate(removeMemberId)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
