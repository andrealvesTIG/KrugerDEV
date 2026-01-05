import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User, Mail, Shield, Calendar, Building2, Pencil, X, Check } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OrganizationMember, Organization, User as UserType } from "@shared/schema";
import { format } from "date-fns";

export default function Profile() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: ""
  });

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

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; email: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${user?.id}/profile`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      setIsEditing(false);
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleEdit = () => {
    setEditForm({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || ""
    });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = () => {
    updateProfileMutation.mutate(editForm);
  };

  if (authLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const userOrgs = memberships?.map(m => {
    const org = organizations?.find(o => o.id === m.organizationId);
    return { ...m, organization: org };
  }).filter(m => m.organization) || [];

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin': return 'default';
      case 'org_admin': return 'secondary';
      default: return 'outline';
    }
  };

  const formatRole = (role: string) => {
    return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <User className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900" data-testid="text-profile-title">Profile</h1>
            <p className="text-slate-500">View and manage your profile information</p>
          </div>
        </div>
        {!isEditing && (
          <Button onClick={handleEdit} variant="outline" data-testid="button-edit-profile">
            <Pencil className="h-4 w-4 mr-2" />
            Edit Profile
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center pt-6">
            <Avatar className="h-24 w-24 mb-4">
              <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || 'User'} />
              <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                {(isEditing ? editForm.firstName : user?.firstName)?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-semibold text-slate-900" data-testid="text-user-name">
              {isEditing ? `${editForm.firstName} ${editForm.lastName}` : `${user?.firstName} ${user?.lastName}`}
            </h2>
            <Badge variant={getRoleBadgeVariant(user?.role || 'member')} className="mt-2" data-testid="badge-user-role">
              {formatRole(user?.role || 'member')}
            </Badge>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Personal Information
                </CardTitle>
                <CardDescription>Your account details</CardDescription>
              </div>
              {isEditing && (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleCancel}
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-cancel-edit"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleSave}
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-save-profile"
                  >
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Save Changes
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="flex items-center gap-2 text-slate-500">
                    <User className="h-4 w-4" />
                    First Name
                  </Label>
                  <Input
                    id="firstName"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="Enter first name"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="flex items-center gap-2 text-slate-500">
                    <User className="h-4 w-4" />
                    Last Name
                  </Label>
                  <Input
                    id="lastName"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Enter last name"
                    data-testid="input-last-name"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="email" className="flex items-center gap-2 text-slate-500">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Enter email address"
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-500 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    System Role
                  </label>
                  <p className="text-slate-900 font-medium text-sm text-muted-foreground" data-testid="text-system-role">
                    {formatRole(user?.role || 'member')}
                    <span className="text-xs text-slate-400 ml-2">(Cannot be changed)</span>
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-500 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Member Since
                  </label>
                  <p className="text-slate-900 font-medium" data-testid="text-member-since">
                    {user?.createdAt ? format(new Date(user.createdAt), 'MMMM d, yyyy') : 'Unknown'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-500 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    First Name
                  </label>
                  <p className="text-slate-900 font-medium" data-testid="text-first-name">{user?.firstName || 'Not set'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-500 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Last Name
                  </label>
                  <p className="text-slate-900 font-medium" data-testid="text-last-name">{user?.lastName || 'Not set'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-500 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </label>
                  <p className="text-slate-900 font-medium" data-testid="text-email">{user?.email || 'Not set'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-500 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    System Role
                  </label>
                  <p className="text-slate-900 font-medium" data-testid="text-system-role">{formatRole(user?.role || 'member')}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-500 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Member Since
                  </label>
                  <p className="text-slate-900 font-medium" data-testid="text-member-since">
                    {user?.createdAt ? format(new Date(user.createdAt), 'MMMM d, yyyy') : 'Unknown'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization Memberships
          </CardTitle>
          <CardDescription>Organizations you belong to</CardDescription>
        </CardHeader>
        <CardContent>
          {userOrgs.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              You are not a member of any organizations yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {userOrgs.map((membership) => (
                <div
                  key={membership.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-4"
                  data-testid={`org-membership-${membership.id}`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                    <Building2 className="h-5 w-5 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{membership.organization?.name}</p>
                    <Badge variant="outline">{formatRole(membership.role)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
