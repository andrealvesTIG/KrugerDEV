import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, User, Mail, Shield, Calendar, Building2, Pencil, X, Check, Camera, Upload, Smile, Sun, Moon, Monitor, Bell } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OrganizationMember, Organization, User as UserType } from "@shared/schema";
import { format } from "date-fns";

const AVATAR_EMOJIS = [
  "smile", "grin", "laugh", "wink", "cool", "heart-eyes", "star-struck", "thinking",
  "nerd", "zany", "shush", "money", "party", "cowboy", "disguise", "monocle",
  "robot", "alien", "ghost", "skull", "pumpkin", "cat", "dog", "fox",
  "lion", "tiger", "bear", "panda", "koala", "unicorn", "dragon", "octopus"
];

const EMOJI_MAP: Record<string, string> = {
  "smile": "\u{1F642}", "grin": "\u{1F601}", "laugh": "\u{1F602}", "wink": "\u{1F609}",
  "cool": "\u{1F60E}", "heart-eyes": "\u{1F60D}", "star-struck": "\u{1F929}", "thinking": "\u{1F914}",
  "nerd": "\u{1F913}", "zany": "\u{1F92A}", "shush": "\u{1F92B}", "money": "\u{1F911}",
  "party": "\u{1F973}", "cowboy": "\u{1F920}", "disguise": "\u{1F978}", "monocle": "\u{1F9D0}",
  "robot": "\u{1F916}", "alien": "\u{1F47D}", "ghost": "\u{1F47B}", "skull": "\u{1F480}",
  "pumpkin": "\u{1F383}", "cat": "\u{1F431}", "dog": "\u{1F436}", "fox": "\u{1F98A}",
  "lion": "\u{1F981}", "tiger": "\u{1F42F}", "bear": "\u{1F43B}", "panda": "\u{1F43C}",
  "koala": "\u{1F428}", "unicorn": "\u{1F984}", "dragon": "\u{1F409}", "octopus": "\u{1F419}"
};

export default function Profile() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [projectUpdates, setProjectUpdates] = useState(true);
  const [taskReminders, setTaskReminders] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  
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

  const updateAvatarMutation = useMutation({
    mutationFn: async (data: { avatarUrl?: string; avatarEmoji?: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${user?.id}/avatar`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      setAvatarDialogOpen(false);
      setSelectedEmoji(null);
      toast({
        title: "Avatar updated",
        description: "Your avatar has been updated successfully."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update avatar. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSavePreferences = () => {
    toast({
      title: "Preferences saved",
      description: "Your notification preferences have been updated.",
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: "Error", description: "Please select an image file", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Image must be less than 5MB", variant: "destructive" });
      return;
    }

    setUploadingAvatar(true);
    try {
      const urlRes = await apiRequest("POST", `/api/users/${user?.id}/avatar/upload-url`, {});
      const { uploadURL, objectPath } = await urlRes.json();

      await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      await updateAvatarMutation.mutateAsync({ avatarUrl: objectPath });
    } catch (err) {
      toast({ title: "Error", description: "Failed to upload avatar", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setSelectedEmoji(emoji);
  };

  const handleSaveEmoji = () => {
    if (selectedEmoji) {
      updateAvatarMutation.mutate({ avatarEmoji: selectedEmoji });
    }
  };

  const getAvatarDisplay = () => {
    const avatarUrl = user?.avatarUrl;
    if (avatarUrl?.startsWith('emoji:')) {
      const emojiKey = avatarUrl.replace('emoji:', '');
      return { type: 'emoji' as const, emoji: EMOJI_MAP[emojiKey] || emojiKey };
    }
    if (avatarUrl?.startsWith('/objects/')) {
      return { type: 'image' as const, url: avatarUrl };
    }
    if (user?.profileImageUrl) {
      return { type: 'image' as const, url: user.profileImageUrl };
    }
    return { type: 'fallback' as const };
  };

  const avatarDisplay = getAvatarDisplay();

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
            <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-profile-title">Profile</h1>
            <p className="text-muted-foreground">View and manage your profile information</p>
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
            <div className="relative group">
              <Avatar className="h-24 w-24 mb-4">
                {avatarDisplay.type === 'image' ? (
                  <AvatarImage src={avatarDisplay.url} alt={user?.firstName || 'User'} />
                ) : avatarDisplay.type === 'emoji' ? (
                  <AvatarFallback className="text-4xl bg-muted">
                    {avatarDisplay.emoji}
                  </AvatarFallback>
                ) : (
                  <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                    {(isEditing ? editForm.firstName : user?.firstName)?.[0] || 'U'}
                  </AvatarFallback>
                )}
              </Avatar>
              <Button
                size="icon"
                variant="secondary"
                className="absolute bottom-3 right-0 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setAvatarDialogOpen(true)}
                data-testid="button-edit-avatar"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
            <h2 className="text-xl font-semibold text-foreground" data-testid="text-user-name">
              {isEditing ? `${editForm.firstName} ${editForm.lastName}` : `${user?.firstName} ${user?.lastName}`}
            </h2>
            <Badge variant={getRoleBadgeVariant(user?.role || 'member')} className="mt-2" data-testid="badge-user-role">
              {formatRole(user?.role || 'member')}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => setAvatarDialogOpen(true)}
              data-testid="button-change-avatar"
            >
              <Camera className="h-4 w-4 mr-2" />
              Change Avatar
            </Button>
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
                  <Label htmlFor="firstName" className="flex items-center gap-2 text-muted-foreground">
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
                  <Label htmlFor="lastName" className="flex items-center gap-2 text-muted-foreground">
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
                  <Label htmlFor="email" className="flex items-center gap-2 text-muted-foreground">
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
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    System Role
                  </label>
                  <p className="text-foreground font-medium text-sm text-muted-foreground" data-testid="text-system-role">
                    {formatRole(user?.role || 'member')}
                    <span className="text-xs text-muted-foreground ml-2">(Cannot be changed)</span>
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Member Since
                  </label>
                  <p className="text-foreground font-medium" data-testid="text-member-since">
                    {user?.createdAt ? format(new Date(user.createdAt), 'MMMM d, yyyy') : 'Unknown'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <User className="h-4 w-4" />
                    First Name
                  </label>
                  <p className="text-foreground font-medium" data-testid="text-first-name">{user?.firstName || 'Not set'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Last Name
                  </label>
                  <p className="text-foreground font-medium" data-testid="text-last-name">{user?.lastName || 'Not set'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </label>
                  <p className="text-foreground font-medium" data-testid="text-email">{user?.email || 'Not set'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    System Role
                  </label>
                  <p className="text-foreground font-medium" data-testid="text-system-role">{formatRole(user?.role || 'member')}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Member Since
                  </label>
                  <p className="text-foreground font-medium" data-testid="text-member-since">
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
            <div className="text-center py-8 text-muted-foreground">
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
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{membership.organization?.name}</p>
                    <Badge variant="outline">{formatRole(membership.role)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Display Settings
          </CardTitle>
          <CardDescription>Customize your visual preferences</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Theme</Label>
              <RadioGroup 
                value={theme} 
                onValueChange={(value) => setTheme(value as "light" | "dark" | "system")}
                className="flex flex-col gap-3"
              >
                <div className="flex items-center space-x-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="light" id="theme-light" data-testid="radio-theme-light" />
                  <Label htmlFor="theme-light" className="flex items-center gap-3 cursor-pointer flex-1">
                    <Sun className="h-5 w-5 text-amber-500" />
                    <div>
                      <div className="font-medium">Light</div>
                      <div className="text-sm text-muted-foreground">Use light theme</div>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="dark" id="theme-dark" data-testid="radio-theme-dark" />
                  <Label htmlFor="theme-dark" className="flex items-center gap-3 cursor-pointer flex-1">
                    <Moon className="h-5 w-5 text-indigo-500" />
                    <div>
                      <div className="font-medium">Dark</div>
                      <div className="text-sm text-muted-foreground">Use dark theme</div>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="system" id="theme-system" data-testid="radio-theme-system" />
                  <Label htmlFor="theme-system" className="flex items-center gap-3 cursor-pointer flex-1">
                    <Monitor className="h-5 w-5 text-slate-500" />
                    <div>
                      <div className="font-medium">System</div>
                      <div className="text-sm text-muted-foreground">Follow your system preference</div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notification Preferences
            </CardTitle>
            <CardDescription>Control how you receive notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-foreground">Email Notifications</label>
                <p className="text-sm text-muted-foreground">Receive notifications via email</p>
              </div>
              <Switch
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
                data-testid="switch-email-notifications"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-foreground">Project Updates</label>
                <p className="text-sm text-muted-foreground">Get notified when projects are updated</p>
              </div>
              <Switch
                checked={projectUpdates}
                onCheckedChange={setProjectUpdates}
                data-testid="switch-project-updates"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-foreground">Task Reminders</label>
                <p className="text-sm text-muted-foreground">Receive reminders for upcoming tasks</p>
              </div>
              <Switch
                checked={taskReminders}
                onCheckedChange={setTaskReminders}
                data-testid="switch-task-reminders"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-foreground">Weekly Digest</label>
                <p className="text-sm text-muted-foreground">Get a weekly summary of activity</p>
              </div>
              <Switch
                checked={weeklyDigest}
                onCheckedChange={setWeeklyDigest}
                data-testid="switch-weekly-digest"
              />
            </div>
            <Button onClick={handleSavePreferences} className="w-full" data-testid="button-save-preferences">
              Save Preferences
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Connected Account</p>
                <p className="text-sm text-muted-foreground">Signed in via Replit</p>
              </div>
              <Badge variant="secondary">Active</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
                <p className="text-sm text-muted-foreground">Managed through Replit account</p>
              </div>
              <Badge variant="outline">Via Replit</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Shield className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible account actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Delete Account</p>
                <p className="text-sm text-muted-foreground">Permanently delete your account and all data</p>
              </div>
              <Button variant="destructive" size="sm" data-testid="button-delete-account">
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Avatar</DialogTitle>
            <DialogDescription>Upload a photo or choose an emoji</DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload" data-testid="tab-upload">
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </TabsTrigger>
              <TabsTrigger value="emoji" data-testid="tab-emoji">
                <Smile className="h-4 w-4 mr-2" />
                Emoji
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload" className="space-y-4 pt-4">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    {avatarDisplay.type === 'image' ? (
                      <AvatarImage src={avatarDisplay.url} alt="Current avatar" />
                    ) : avatarDisplay.type === 'emoji' ? (
                      <AvatarFallback className="text-4xl bg-muted">
                        {avatarDisplay.emoji}
                      </AvatarFallback>
                    ) : (
                      <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                        {user?.firstName?.[0] || 'U'}
                      </AvatarFallback>
                    )}
                  </Avatar>
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                  data-testid="input-avatar-file"
                />
                
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  data-testid="button-upload-avatar"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {uploadingAvatar ? 'Uploading...' : 'Choose Image'}
                </Button>
                
                <p className="text-xs text-muted-foreground">
                  JPG, PNG or GIF. Max 5MB.
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="emoji" className="space-y-4 pt-4">
              <div className="flex justify-center mb-4">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="text-4xl bg-muted">
                    {selectedEmoji ? EMOJI_MAP[selectedEmoji] : (avatarDisplay.type === 'emoji' ? avatarDisplay.emoji : user?.firstName?.[0] || 'U')}
                  </AvatarFallback>
                </Avatar>
              </div>
              
              <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto p-1">
                {AVATAR_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleEmojiSelect(emoji)}
                    className={`h-10 w-10 flex items-center justify-center rounded-lg text-2xl transition-colors ${
                      selectedEmoji === emoji ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-muted'
                    }`}
                    data-testid={`button-emoji-${emoji}`}
                  >
                    {EMOJI_MAP[emoji]}
                  </button>
                ))}
              </div>
              
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedEmoji(null);
                    setAvatarDialogOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveEmoji}
                  disabled={!selectedEmoji || updateAvatarMutation.isPending}
                  data-testid="button-save-emoji"
                >
                  {updateAvatarMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Emoji
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
