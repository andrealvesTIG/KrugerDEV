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
import { Loader2, UserPlus, Trash2, Settings, Users, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Organization, OrganizationMember, User } from "@shared/schema";

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

      {orgId && <MembersSection organizationId={orgId} orgName={currentOrg?.name || ''} />}
    </div>
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
