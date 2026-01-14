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
import { Loader2, User, Mail, Shield, Calendar, Building2, Pencil, X, Check, Camera, Upload, Smile, Sun, Moon, Monitor, Bell, AlertTriangle, Key, Copy, Trash2 } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OrganizationMember, Organization } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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

type Section = "profile" | "organizations" | "display" | "notifications" | "security";

const menuItems = [
  { id: "profile" as Section, label: "Profile", icon: User },
  { id: "organizations" as Section, label: "Organizations", icon: Building2 },
  { id: "display" as Section, label: "Display", icon: Monitor },
  { id: "notifications" as Section, label: "Notifications", icon: Bell },
  { id: "security" as Section, label: "Security", icon: Shield },
];

export default function Profile() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<Section>("profile");
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

  const [newlyGeneratedApiKey, setNewlyGeneratedApiKey] = useState<string | null>(null);

  const { data: apiKeyStatus, isLoading: apiKeyLoading } = useQuery<{ hasApiKey: boolean }>({
    queryKey: ['/api/user/api-key'],
    queryFn: async () => {
      const res = await fetch('/api/user/api-key');
      if (!res.ok) return { hasApiKey: false };
      return res.json();
    },
    enabled: !!user?.id
  });

  const generateApiKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/user/api-key/generate");
      return res.json();
    },
    onSuccess: (data: { apiKey: string }) => {
      setNewlyGeneratedApiKey(data.apiKey);
      queryClient.invalidateQueries({ queryKey: ['/api/user/api-key'] });
      toast({
        title: "API Key Generated",
        description: "Your new API key has been created. Copy it now - it won't be shown again."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate API key. Please try again.",
        variant: "destructive"
      });
    }
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/user/api-key");
    },
    onSuccess: () => {
      setNewlyGeneratedApiKey(null);
      queryClient.invalidateQueries({ queryKey: ['/api/user/api-key'] });
      toast({
        title: "API Key Revoked",
        description: "Your API key has been deleted."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to revoke API key. Please try again.",
        variant: "destructive"
      });
    }
  });

  const copyApiKey = () => {
    if (newlyGeneratedApiKey) {
      navigator.clipboard.writeText(newlyGeneratedApiKey);
      toast({
        title: "Copied",
        description: "API key copied to clipboard."
      });
    }
  };

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
      // Use direct upload endpoint (bypasses signed URL issues)
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch(`/api/users/${user?.id}/avatar/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      // Invalidate auth query to refresh user data with new avatar
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      setAvatarDialogOpen(false);
      toast({
        title: "Avatar updated",
        description: "Your avatar has been updated successfully."
      });
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
    setEditForm({ firstName: "", lastName: "", email: "" });
  };

  const handleSave = () => {
    updateProfileMutation.mutate(editForm);
  };

  const avatarDisplay = (() => {
    const avatarUrl = user?.avatarUrl;
    if (!avatarUrl) return { type: 'fallback' as const };
    if (avatarUrl.startsWith('emoji:')) {
      const emojiKey = avatarUrl.replace('emoji:', '');
      return { type: 'emoji' as const, emoji: EMOJI_MAP[emojiKey] || emojiKey };
    }
    const imageUrl = avatarUrl.startsWith('/objects/') ? avatarUrl : user?.profileImageUrl;
    return imageUrl ? { type: 'image' as const, url: imageUrl } : { type: 'fallback' as const };
  })();

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
    <div className="flex gap-6">
      <div className="w-56 shrink-0">
        <Card className="sticky top-6">
          <CardContent className="p-4">
            <div className="flex flex-col items-center mb-4 pt-2">
              <Avatar className="h-16 w-16 mb-2">
                {avatarDisplay.type === 'image' ? (
                  <AvatarImage src={avatarDisplay.url} alt={user?.firstName || 'User'} />
                ) : avatarDisplay.type === 'emoji' ? (
                  <AvatarFallback className="text-3xl bg-muted">
                    {avatarDisplay.emoji}
                  </AvatarFallback>
                ) : (
                  <AvatarFallback className="text-xl bg-primary text-primary-foreground">
                    {user?.firstName?.[0] || 'U'}
                  </AvatarFallback>
                )}
              </Avatar>
              <p className="font-medium text-sm">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Separator className="mb-4" />
            <nav className="space-y-1">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors",
                    activeSection === item.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  data-testid={`nav-${item.id}`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </nav>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 min-w-0">
        {activeSection === "profile" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Profile</h2>
                <p className="text-muted-foreground">Manage your personal information</p>
              </div>
              {!isEditing && (
                <Button onClick={handleEdit} variant="outline" data-testid="button-edit-profile">
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Personal Information</CardTitle>
                  {isEditing && (
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={handleCancel} disabled={updateProfileMutation.isPending} data-testid="button-cancel-edit">
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={updateProfileMutation.isPending} data-testid="button-save-profile">
                        {updateProfileMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" value={editForm.firstName} onChange={(e) => setEditForm(prev => ({ ...prev, firstName: e.target.value }))} data-testid="input-first-name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" value={editForm.lastName} onChange={(e) => setEditForm(prev => ({ ...prev, lastName: e.target.value }))} data-testid="input-last-name" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" value={editForm.email} onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))} data-testid="input-email" />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-muted-foreground text-xs">First Name</Label>
                      <p className="font-medium" data-testid="text-first-name">{user?.firstName || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Last Name</Label>
                      <p className="font-medium" data-testid="text-last-name">{user?.lastName || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Email</Label>
                      <p className="font-medium" data-testid="text-email">{user?.email || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Role</Label>
                      <p className="font-medium" data-testid="text-role">{formatRole(user?.role || 'member')}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Member Since</Label>
                      <p className="font-medium" data-testid="text-member-since">{user?.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy') : '-'}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Avatar</CardTitle>
                <CardDescription>Customize your profile picture</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    {avatarDisplay.type === 'image' ? (
                      <AvatarImage src={avatarDisplay.url} alt={user?.firstName || 'User'} />
                    ) : avatarDisplay.type === 'emoji' ? (
                      <AvatarFallback className="text-4xl bg-muted">{avatarDisplay.emoji}</AvatarFallback>
                    ) : (
                      <AvatarFallback className="text-2xl bg-primary text-primary-foreground">{user?.firstName?.[0] || 'U'}</AvatarFallback>
                    )}
                  </Avatar>
                  <Button variant="outline" onClick={() => setAvatarDialogOpen(true)} data-testid="button-change-avatar">
                    <Camera className="h-4 w-4 mr-2" />
                    Change Avatar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === "organizations" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Organizations</h2>
              <p className="text-muted-foreground">
                {user?.role === 'super_admin' ? 'All organizations (Super Admin access)' : 'Organizations you belong to'}
              </p>
            </div>

            <Card>
              <CardContent className="pt-6">
                {user?.role === 'super_admin' ? (
                  organizations && organizations.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {organizations.map((org) => (
                        <div key={org.id} className="flex items-center gap-3 rounded-lg border p-4" data-testid={`org-${org.id}`}>
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{org.name}</p>
                            <Badge variant="default" className="text-xs">Super Admin</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No organizations found.
                    </div>
                  )
                ) : userOrgs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    You are not a member of any organizations yet.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {userOrgs.map((membership) => (
                      <div key={membership.id} className="flex items-center gap-3 rounded-lg border p-4" data-testid={`org-membership-${membership.id}`}>
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{membership.organization?.name}</p>
                          <Badge variant="outline" className="text-xs">{formatRole(membership.role)}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === "display" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Display Settings</h2>
              <p className="text-muted-foreground">Customize your visual preferences</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Theme</CardTitle>
                <CardDescription>Select your preferred color scheme</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup value={theme} onValueChange={(value) => setTheme(value as "light" | "dark" | "system")} className="flex flex-col gap-3">
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
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === "notifications" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Notifications</h2>
              <p className="text-muted-foreground">Control how you receive notifications</p>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                  </div>
                  <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} data-testid="switch-email-notifications" />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Project Updates</p>
                    <p className="text-sm text-muted-foreground">Get notified when projects are updated</p>
                  </div>
                  <Switch checked={projectUpdates} onCheckedChange={setProjectUpdates} data-testid="switch-project-updates" />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Task Reminders</p>
                    <p className="text-sm text-muted-foreground">Receive reminders for upcoming tasks</p>
                  </div>
                  <Switch checked={taskReminders} onCheckedChange={setTaskReminders} data-testid="switch-task-reminders" />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Weekly Digest</p>
                    <p className="text-sm text-muted-foreground">Get a weekly summary of activity</p>
                  </div>
                  <Switch checked={weeklyDigest} onCheckedChange={setWeeklyDigest} data-testid="switch-weekly-digest" />
                </div>
                <Button onClick={handleSavePreferences} className="w-full" data-testid="button-save-preferences">
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === "security" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Security</h2>
              <p className="text-muted-foreground">Manage your account security</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Connected Accounts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Connected Account</p>
                    <p className="text-sm text-muted-foreground">Signed in via Replit</p>
                  </div>
                  <Badge variant="secondary">Active</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Two-Factor Authentication</p>
                    <p className="text-sm text-muted-foreground">Managed through Replit account</p>
                  </div>
                  <Badge variant="outline">Via Replit</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Key
                </CardTitle>
                <CardDescription>
                  Generate an API key to authenticate external tools like Power BI.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {apiKeyLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : newlyGeneratedApiKey ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-muted/50 p-4">
                      <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">
                        Copy this key now - it won't be shown again!
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-background rounded px-3 py-2 text-sm font-mono break-all border">
                          {newlyGeneratedApiKey}
                        </code>
                        <Button size="icon" variant="outline" onClick={copyApiKey} data-testid="button-copy-api-key">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium mb-1">How to use with Power BI:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Use "Basic" authentication in Power BI</li>
                        <li>Username: <code className="bg-muted px-1 rounded">{user?.email}</code></li>
                        <li>Password: Your API key (copied above)</li>
                      </ol>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setNewlyGeneratedApiKey(null)}
                      data-testid="button-dismiss-api-key"
                    >
                      I've copied the key
                    </Button>
                  </div>
                ) : apiKeyStatus?.hasApiKey ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium">API Key Active</p>
                        <p className="text-sm text-muted-foreground">You have an active API key for external integrations</p>
                      </div>
                      <Badge variant="secondary">Active</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline"
                        onClick={() => generateApiKeyMutation.mutate()}
                        disabled={generateApiKeyMutation.isPending}
                        data-testid="button-regenerate-api-key"
                      >
                        {generateApiKeyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Generate New Key
                      </Button>
                      <Button 
                        variant="destructive"
                        size="icon"
                        onClick={() => revokeApiKeyMutation.mutate()}
                        disabled={revokeApiKeyMutation.isPending}
                        data-testid="button-revoke-api-key"
                      >
                        {revokeApiKeyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium">No API Key</p>
                        <p className="text-sm text-muted-foreground">Generate a key to connect Power BI or other tools</p>
                      </div>
                      <Badge variant="outline">Not Set</Badge>
                    </div>
                    <Button 
                      onClick={() => generateApiKeyMutation.mutate()}
                      disabled={generateApiKeyMutation.isPending}
                      data-testid="button-generate-api-key"
                    >
                      {generateApiKeyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <Key className="h-4 w-4 mr-2" />
                      Generate API Key
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">Delete Account</p>
                      <p className="text-sm text-muted-foreground">Permanently delete your account and all data</p>
                    </div>
                    <Button variant="destructive" size="sm" data-testid="button-delete-account">
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

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
                <Avatar className="h-24 w-24">
                  {avatarDisplay.type === 'image' ? (
                    <AvatarImage src={avatarDisplay.url} alt="Current avatar" />
                  ) : avatarDisplay.type === 'emoji' ? (
                    <AvatarFallback className="text-4xl bg-muted">{avatarDisplay.emoji}</AvatarFallback>
                  ) : (
                    <AvatarFallback className="text-2xl bg-primary text-primary-foreground">{user?.firstName?.[0] || 'U'}</AvatarFallback>
                  )}
                </Avatar>
                
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} data-testid="input-avatar-file" />
                
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar} data-testid="button-upload-avatar">
                  {uploadingAvatar ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  {uploadingAvatar ? 'Uploading...' : 'Choose Image'}
                </Button>
                
                <p className="text-xs text-muted-foreground">JPG, PNG or GIF. Max 5MB.</p>
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
                <Button variant="outline" onClick={() => { setSelectedEmoji(null); setAvatarDialogOpen(false); }}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEmoji} disabled={!selectedEmoji || updateAvatarMutation.isPending} data-testid="button-save-emoji">
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
