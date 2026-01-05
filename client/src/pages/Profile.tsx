import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, User, Mail, Shield, Calendar, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { OrganizationMember, Organization } from "@shared/schema";
import { format } from "date-fns";

export default function Profile() {
  const { user, isLoading: authLoading } = useAuth();

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
      <div className="flex items-center gap-3">
        <User className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900" data-testid="text-profile-title">Profile</h1>
          <p className="text-slate-500">View and manage your profile information</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center pt-6">
            <Avatar className="h-24 w-24 mb-4">
              <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || 'User'} />
              <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                {user?.firstName?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-semibold text-slate-900" data-testid="text-user-name">
              {user?.firstName} {user?.lastName}
            </h2>
            <Badge variant={getRoleBadgeVariant(user?.role || 'member')} className="mt-2" data-testid="badge-user-role">
              {formatRole(user?.role || 'member')}
            </Badge>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
            <CardDescription>Your account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                    <Badge variant="outline" size="sm">{formatRole(membership.role)}</Badge>
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
