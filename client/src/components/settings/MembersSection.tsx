import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Trash2, Users, ShieldAlert, X, Check, Building2, Mail, Clock, RefreshCw, ArrowUpCircle, KeyRound } from "lucide-react";
import { format } from "date-fns";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import type { OrganizationMember, User } from "@shared/schema";

export interface EnrichedMember extends OrganizationMember {
  user?: User;
}

interface OrganizationInvite {
  id: number;
  organizationId: number;
  email: string;
  role: string;
  status: string;
  invitedBy: string | null;
  createdAt: string | null;
  acceptedAt: string | null;
}

const PUBLIC_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me',
  'mail.com', 'zoho.com', 'yandex.com', 'gmx.com', 'gmx.net', 'fastmail.com',
  'tutanota.com', 'hey.com', 'pm.me', 'inbox.com', 'hushmail.com'
];

function getEmailDomain(email: string): string | null {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.includes(domain.toLowerCase());
}

export function MembersSection({ organizationId, orgName }: { organizationId: number; orgName: string }) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isDirectorySearchOpen, setIsDirectorySearchOpen] = useState(false);
  const [directorySearchQuery, setDirectorySearchQuery] = useState("");
  const [selectedDirectoryUser, setSelectedDirectoryUser] = useState<{ id: string; email: string | null; displayName: string } | null>(null);
  const [directoryInviteRole, setDirectoryInviteRole] = useState<string>("member");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("member");
  const [inviteEmails, setInviteEmails] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [inviteResult, setInviteResult] = useState<{ success: string[]; skipped: string[]; errors: string[] } | null>(null);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string>("");

  const { data: members = [], isLoading } = useQuery<EnrichedMember[]>({
    queryKey: [`/api/organizations/${organizationId}/members`],
  });

  const { data: invites = [] } = useQuery<OrganizationInvite[]>({
    queryKey: [`/api/organizations/${organizationId}/invites`],
  });

  interface SeatInfo {
    currentSeats: number;
    maxSeats: number | null;
    remaining: number | null;
    pendingInvites: number;
    planName: string;
    planCode: string;
    bonusSeats: number;
    extraSeatPriceCents: number | null;
  }
  
  const { data: seatInfo } = useQuery<SeatInfo>({
    queryKey: [`/api/organizations/${organizationId}/seats`],
  });

  const purchaseExtraSeat = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/organizations/${organizationId}/seats/purchase`, { quantity: 1 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/seats`] });
      setShowUpgradeDialog(false);
      toast({ title: "Success", description: "Extra seat added to your subscription" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  interface EnrichedAccessRequest {
    id: number;
    organizationId: number;
    userId: string;
    status: string;
    requestedRole: string;
    message: string | null;
    createdAt: string | null;
    user: { id: string; name: string | null; email: string | null; avatarUrl: string | null } | null;
  }
  
  const { data: accessRequests = [] } = useQuery<EnrichedAccessRequest[]>({
    queryKey: [`/api/organizations/${organizationId}/access-requests`],
  });

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ['/api/users']
  });

  interface DirectoryUser {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
    jobTitle?: string;
    department?: string;
    source: 'internal' | 'entra';
  }

  const { data: directoryResults, isLoading: isSearchingDirectory } = useQuery<{ users: DirectoryUser[]; source: 'microsoft_entra' | 'internal' }>({
    queryKey: [`/api/organizations/${organizationId}/directory/search`, directorySearchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/directory/search?q=${encodeURIComponent(directorySearchQuery)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to search directory');
      return res.json();
    },
    enabled: directorySearchQuery.length >= 2,
  });

  const inviteFromDirectory = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      return apiRequest('POST', `/api/organizations/${organizationId}/invites`, { emails: [email], role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/invites`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/seats`] });
      toast({ title: "Success", description: "Invitation sent successfully" });
      setIsDirectorySearchOpen(false);
      setDirectorySearchQuery("");
      setSelectedDirectoryUser(null);
    },
    onError: async (error: Error & { limitExceeded?: boolean; resourceType?: string }) => {
      if (error.limitExceeded && error.resourceType === 'seats') {
        setIsDirectorySearchOpen(false);
        setUpgradeMessage(error.message || 'You have reached your seat limit. Please upgrade your plan to invite more team members.');
        setShowUpgradeDialog(true);
        return;
      }
      toast({ title: "Error", description: error.message || "Failed to send invite", variant: "destructive" });
    }
  });

  const addMember = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest('POST', `/api/organizations/${organizationId}/members`, { userId, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/members`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/seats`] });
      toast({ title: "Success", description: "Member added to organization" });
      setIsAddMemberOpen(false);
      setSelectedUserId("");
      setSelectedRole("member");
    }
  });

  const inviteMembers = useMutation({
    mutationFn: async ({ emails, role }: { emails: string[]; role: string }) => {
      const res = await apiRequest('POST', `/api/organizations/${organizationId}/invites`, { emails, role });
      return res.json() as Promise<{ success: string[]; skipped: string[]; errors: string[] }>;
    },
    onSuccess: (result: { success: string[]; skipped: string[]; errors: string[] }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/invites`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/seats`] });
      setInviteResult(result);
      
      if (result.errors.length === 0 && result.success.length > 0) {
        toast({ 
          title: "Invites Sent", 
          description: `${result.success.length} invite(s) sent successfully`
        });
        setIsInviteOpen(false);
        setInviteEmails("");
        setInviteRole("member");
        setInviteResult(null);
      } else if (result.success.length === 0 && result.skipped.length > 0 && result.errors.length === 0) {
        toast({ 
          title: "No New Invites", 
          description: "All emails already have pending invites or are members"
        });
        setIsInviteOpen(false);
        setInviteEmails("");
        setInviteRole("member");
        setInviteResult(null);
      }
    },
    onError: async (error: Error & { limitExceeded?: boolean; resourceType?: string }) => {
      if (error.limitExceeded && error.resourceType === 'seats') {
        setIsInviteOpen(false);
        setUpgradeMessage(error.message || 'You have reached your seat limit. Please upgrade your plan to invite more team members.');
        setShowUpgradeDialog(true);
        return;
      }
      
      toast({ title: "Error", description: error.message || "Failed to send invites", variant: "destructive" });
    }
  });

  const cancelInvite = useMutation({
    mutationFn: async (inviteId: number) => {
      return apiRequest('DELETE', `/api/organizations/${organizationId}/invites/${inviteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/invites`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/seats`] });
      toast({ title: "Success", description: "Invite cancelled" });
    }
  });

  const resendInvite = useMutation({
    mutationFn: async (inviteId: number) => {
      return apiRequest('POST', `/api/organizations/${organizationId}/invites/${inviteId}/resend`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Invitation email resent" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resend invitation", variant: "destructive" });
    }
  });

  const updateMemberRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest('PUT', `/api/organizations/${organizationId}/members/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/members`] });
      toast({ title: "Success", description: "Member role updated" });
    }
  });

  const sendPasswordReset = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest('POST', `/api/organizations/${organizationId}/members/${userId}/send-password-reset`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password reset link sent", description: "The member has been emailed a temporary link to set a new password." });
    },
    onError: (error: Error) => {
      toast({ title: "Could not send reset link", description: error.message || "Please try again.", variant: "destructive" });
    }
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest('DELETE', `/api/organizations/${organizationId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/members`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/seats`] });
      toast({ title: "Success", description: "Member removed from organization" });
      setRemoveMemberId(null);
    }
  });

  const approveAccessRequest = useMutation({
    mutationFn: async (requestId: number) => {
      return apiRequest('POST', `/api/organizations/${organizationId}/access-requests/${requestId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/access-requests`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/members`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/seats`] });
      toast({ title: "Success", description: "Access request approved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const rejectAccessRequest = useMutation({
    mutationFn: async (requestId: number) => {
      return apiRequest('POST', `/api/organizations/${organizationId}/access-requests/${requestId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/access-requests`] });
      toast({ title: "Success", description: "Access request rejected" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const existingMemberIds = members.map(m => m.userId);
  
  const currentUserDomain = currentUser?.email ? getEmailDomain(currentUser.email) : null;
  const isCurrentUserCorporate = currentUserDomain && !isPublicEmailDomain(currentUserDomain);
  
  const availableUsers = useMemo(() => {
    if (!isCurrentUserCorporate || !currentUserDomain) {
      return [];
    }
    
    return allUsers?.filter(u => {
      if (existingMemberIds.includes(u.id)) return false;
      
      if (!u.email) return false;
      
      const userDomain = getEmailDomain(u.email);
      if (!userDomain) return false;
      
      return userDomain === currentUserDomain;
    }) || [];
  }, [allUsers, existingMemberIds, isCurrentUserCorporate, currentUserDomain]);
  
  const pendingInvites = invites.filter(i => i.status === 'pending');
  const pendingAccessRequests = accessRequests.filter(r => r.status === 'pending');

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members - {orgName}
          </CardTitle>
          <CardDescription className="flex items-center gap-3 flex-wrap">
            <span>Manage who has access to this organization</span>
            {seatInfo && (
              <Badge variant={seatInfo.remaining === 0 ? "destructive" : "secondary"} className="gap-1">
                <Users className="h-3 w-3" />
                {seatInfo.maxSeats === null ? (
                  <span>{seatInfo.currentSeats} members (Unlimited)</span>
                ) : (
                  <span>{seatInfo.currentSeats} / {seatInfo.maxSeats} seats used</span>
                )}
                {seatInfo.pendingInvites > 0 && (
                  <span className="text-muted-foreground">({seatInfo.pendingInvites} pending)</span>
                )}
              </Badge>
            )}
            {seatInfo && (
              <Badge variant="outline" className="gap-1">
                {seatInfo.planName} Plan
              </Badge>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.location.href = '/billing'}
              data-testid="button-upgrade-plan"
              className="gap-1"
            >
              <ArrowUpCircle className="h-3 w-3" />
              Upgrade
            </Button>
          </CardDescription>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setIsDirectorySearchOpen(true)} data-testid="button-search-directory">
            <Building2 className="h-4 w-4 mr-2" />
            Search Directory
          </Button>
          <Button variant="outline" onClick={() => setIsInviteOpen(true)} data-testid="button-invite-member">
            <Mail className="h-4 w-4 mr-2" />
            Invite by Email
          </Button>
          <Button onClick={() => setIsAddMemberOpen(true)} data-testid="button-add-member">
            <UserPlus className="h-4 w-4 mr-2" />
            Add Existing User
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map(member => (
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
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="org_admin">Org Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="team_member">Team Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {member.createdAt ? format(new Date(member.createdAt), 'MMM d, yyyy') : 'N/A'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => sendPasswordReset.mutate(member.userId)}
                      disabled={sendPasswordReset.isPending || !member.user?.email}
                      title="Email a temporary password reset link"
                      data-testid={`button-send-reset-${member.id}`}
                    >
                      {sendPasswordReset.isPending && sendPasswordReset.variables === member.userId ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      ) : (
                        <KeyRound className="h-4 w-4 text-slate-400 hover:text-orange-500" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRemoveMemberId(member.userId)}
                      title="Remove member"
                      data-testid={`button-remove-member-${member.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {members.length === 0 && (
          <div className="text-center py-8 text-slate-500">No members in this organization yet.</div>
        )}

        {pendingInvites.length > 0 && (
          <div className="mt-8 pt-6 border-t">
            <h4 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending Invites ({pendingInvites.length})
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map(invite => (
                  <TableRow key={invite.id} data-testid={`invite-row-${invite.id}`}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell className="capitalize">{invite.role}</TableCell>
                    <TableCell>
                      {invite.createdAt ? format(new Date(invite.createdAt), 'MMM d, yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{invite.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => resendInvite.mutate(invite.id)}
                          disabled={resendInvite.isPending}
                          title="Resend invitation email"
                          data-testid={`button-resend-invite-${invite.id}`}
                        >
                          <RefreshCw className={`h-4 w-4 text-slate-400 hover:text-blue-500 ${resendInvite.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => cancelInvite.mutate(invite.id)}
                          title="Cancel invite"
                          data-testid={`button-cancel-invite-${invite.id}`}
                        >
                          <X className="h-4 w-4 text-slate-400 hover:text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {pendingAccessRequests.length > 0 && (
          <div className="mt-8 pt-6 border-t">
            <h4 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Access Requests ({pendingAccessRequests.length})
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Requested Role</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingAccessRequests.map(request => (
                  <TableRow key={request.id} data-testid={`access-request-row-${request.id}`}>
                    <TableCell className="font-medium">{request.user?.name || 'Unknown'}</TableCell>
                    <TableCell>{request.user?.email || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{request.requestedRole.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={request.message || ''}>
                      {request.message || '-'}
                    </TableCell>
                    <TableCell>
                      {request.createdAt ? format(new Date(request.createdAt), 'MMM d, yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => approveAccessRequest.mutate(request.id)}
                          disabled={approveAccessRequest.isPending || rejectAccessRequest.isPending}
                          title="Approve request"
                          data-testid={`button-approve-request-${request.id}`}
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => rejectAccessRequest.mutate(request.id)}
                          disabled={approveAccessRequest.isPending || rejectAccessRequest.isPending}
                          title="Reject request"
                          data-testid={`button-reject-request-${request.id}`}
                        >
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={isInviteOpen} onOpenChange={(open) => {
        setIsInviteOpen(open);
        if (!open) {
          setInviteResult(null);
          setInviteEmails("");
          setInviteRole("member");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Members</DialogTitle>
            <DialogDescription>
              Enter email addresses to invite new team members. They will be added to the organization when they log in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {inviteResult && (inviteResult.errors.length > 0 || inviteResult.skipped.length > 0) && (
              <div className="space-y-2 p-3 rounded-md border bg-muted/50">
                {inviteResult.success.length > 0 && (
                  <div className="text-sm text-green-600 dark:text-green-400">
                    Sent: {inviteResult.success.join(', ')}
                  </div>
                )}
                {inviteResult.skipped.length > 0 && (
                  <div className="text-sm text-amber-600 dark:text-amber-400">
                    Skipped: {inviteResult.skipped.join(', ')}
                  </div>
                )}
                {inviteResult.errors.length > 0 && (
                  <div className="text-sm text-red-600 dark:text-red-400">
                    Failed: {inviteResult.errors.join(', ')}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Email Addresses</Label>
              <Textarea
                placeholder="Enter emails separated by commas, e.g.: john@example.com, jane@example.com"
                value={inviteEmails}
                onChange={(e) => {
                  setInviteEmails(e.target.value);
                  setInviteResult(null);
                }}
                className="min-h-[100px]"
                data-testid="input-invite-emails"
              />
              <p className="text-xs text-muted-foreground">
                Separate multiple emails with commas
              </p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_admin">Org Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="team_member">Team Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Team Members can only see projects and items they are assigned to.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsInviteOpen(false);
              setInviteResult(null);
              setInviteEmails("");
              setInviteRole("member");
            }}>Cancel</Button>
            <Button 
              onClick={() => {
                const emailList = inviteEmails.split(',').map(e => e.trim()).filter(e => e.length > 0);
                if (emailList.length > 0) {
                  setInviteResult(null);
                  inviteMembers.mutate({ emails: emailList, role: inviteRole });
                }
              }}
              disabled={!inviteEmails.trim() || inviteMembers.isPending}
              data-testid="button-confirm-invite"
            >
              {inviteMembers.isPending ? 'Sending...' : 'Send Invites'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <SelectItem value="team_member">Team Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Team Members can only see projects and items they are assigned to.
              </p>
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

      <Dialog open={isDirectorySearchOpen} onOpenChange={(open) => {
        setIsDirectorySearchOpen(open);
        if (!open) {
          setDirectorySearchQuery("");
          setSelectedDirectoryUser(null);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Search Directory</DialogTitle>
            <DialogDescription>
              Search for colleagues in your organization's directory to invite them as team members.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="directory-search">Search by name or email</Label>
              <Input
                id="directory-search"
                placeholder="Start typing to search..."
                value={directorySearchQuery}
                onChange={(e) => setDirectorySearchQuery(e.target.value)}
                data-testid="input-directory-search"
              />
            </div>
            
            {directorySearchQuery.length >= 2 && (
              <>
                {directoryResults?.source === 'internal' && !isSearchingDirectory && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-700 dark:text-amber-300">
                    <div className="font-medium">Microsoft Entra ID not connected</div>
                    <div className="text-xs mt-1">Go to <a href="/integrations" className="underline font-medium">Integrations &gt; Identity & Directory</a> to connect Microsoft Entra ID and search your organization's Active Directory.</div>
                  </div>
                )}
                {directoryResults?.source === 'microsoft_entra' && !isSearchingDirectory && (
                  <div className="p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Searching Microsoft Entra ID directory
                  </div>
                )}
                <div className="border rounded-md max-h-64 overflow-y-auto">
                  {isSearchingDirectory ? (
                    <div className="p-4 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : directoryResults?.users && directoryResults.users.length > 0 ? (
                    <div className="divide-y">
                      {directoryResults.users.map((user) => (
                        <div
                          key={user.id}
                          className={`p-3 cursor-pointer hover-elevate ${
                            selectedDirectoryUser?.id === user.id ? 'bg-primary/10' : ''
                          }`}
                          onClick={() => setSelectedDirectoryUser(user)}
                          data-testid={`directory-user-${user.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{user.displayName}</div>
                            {user.source === 'entra' && (
                              <Badge variant="outline" className="text-xs">Entra ID</Badge>
                            )}
                          </div>
                          {user.email && (
                            <div className="text-sm text-muted-foreground">{user.email}</div>
                          )}
                          {(user.jobTitle || user.department) && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {[user.jobTitle, user.department].filter(Boolean).join(' • ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      No users found matching your search
                    </div>
                  )}
                </div>
              </>
            )}

            {selectedDirectoryUser && (
              <div className="space-y-2 p-3 bg-muted/50 rounded-md">
                <div className="text-sm font-medium">Selected: {selectedDirectoryUser.displayName}</div>
                {selectedDirectoryUser.email && (
                  <div className="text-sm text-muted-foreground">{selectedDirectoryUser.email}</div>
                )}
                <div className="space-y-2 mt-3">
                  <Label htmlFor="directory-invite-role">Role</Label>
                  <Select value={directoryInviteRole} onValueChange={setDirectoryInviteRole}>
                    <SelectTrigger id="directory-invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="org_admin">Org Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="team_member">Team Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDirectorySearchOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedDirectoryUser?.email) {
                  inviteFromDirectory.mutate({ email: selectedDirectoryUser.email, role: directoryInviteRole });
                }
              }}
              disabled={!selectedDirectoryUser?.email || inviteFromDirectory.isPending}
              data-testid="button-send-directory-invite"
            >
              {inviteFromDirectory.isPending ? "Sending..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LimitExceededDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
        resourceType="seats"
        message={upgradeMessage}
        extraSeatPriceCents={seatInfo?.extraSeatPriceCents}
        onPurchaseExtraSeat={() => purchaseExtraSeat.mutate()}
        isPurchasing={purchaseExtraSeat.isPending}
      />
    </Card>
  );
}