import { useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
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
import { Loader2, User, Mail, Shield, Calendar, Building2, Pencil, X, Check, Camera, Upload, Smile, Sun, Moon, Monitor, Bell, AlertTriangle, Key, Copy, Trash2, Gift, Share2, UserPlus, Users, TrendingUp, DollarSign, Clock, CheckCircle2, BarChart3, Linkedin, Award } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OrganizationMember, Organization } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import ProfileAnalytics from "@/components/ProfileAnalytics";

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

interface ReferralCode {
  id: number;
  userId: string;
  code: string;
  commissionPercent: number;
  isActive: boolean;
  totalReferrals: number;
  totalEarningsCents: number;
  createdAt: string;
}

interface Referral {
  id: number;
  referralCodeId: number;
  referrerId: string;
  referredUserId: string | null;
  referredEmail: string | null;
  status: string;
  signedUpAt: string | null;
  convertedAt: string | null;
  conversionAmountCents: number | null;
  commissionAmountCents: number | null;
  createdAt: string;
}

interface ReferralPayout {
  id: number;
  userId: string;
  amountCents: number;
  status: string;
  paypalEmail: string | null;
  paypalTransactionId: string | null;
  processedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface ReferralStats {
  code: ReferralCode | null;
  totalReferrals: number;
  signedUp: number;
  converted: number;
  pendingEarningsCents: number;
  paidOutCents: number;
  referrals: Referral[];
  payouts: ReferralPayout[];
}

type Section = "profile" | "analytics" | "organizations" | "display" | "notifications" | "security" | "referrals";

const menuItems = [
  { id: "profile" as Section, label: "Profile", icon: User },
  { id: "analytics" as Section, label: "Analytics", icon: BarChart3 },
  { id: "organizations" as Section, label: "Organizations", icon: Building2 },
  { id: "display" as Section, label: "Display", icon: Monitor },
  { id: "notifications" as Section, label: "Notifications", icon: Bell },
  { id: "security" as Section, label: "Security", icon: Shield },
  { id: "referrals" as Section, label: "Referrals", icon: Gift },
];

export default function Profile() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [searchParams] = useSearchParams();
  const initialSection = (searchParams.get("section") as Section) || "profile";
  const [activeSection, setActiveSection] = useState<Section>(initialSection);
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
    email: "",
    jobTitle: "",
    pmiId: "",
    linkedinUrl: "",
  });

  const [newlyGeneratedApiKey, setNewlyGeneratedApiKey] = useState<string | null>(null);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [paypalEmail, setPaypalEmail] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data: referralStats, isLoading: referralLoading } = useQuery<ReferralStats>({
    queryKey: ['/api/referral/stats'],
    enabled: !!user,
  });

  const requestPayoutMutation = useMutation({
    mutationFn: async (email: string) => {
      return apiRequest('POST', '/api/referral/request-payout', { paypalEmail: email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/referral/stats'] });
      toast({ title: "Payout Requested", description: "Your payout request has been submitted." });
      setPayoutDialogOpen(false);
      setPaypalEmail("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const copyReferralLink = () => {
    if (referralStats?.code) {
      const link = `${window.location.origin}/auth?ref=${referralStats.code.code}`;
      navigator.clipboard.writeText(link);
      toast({ title: "Copied!", description: "Referral link copied to clipboard" });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case "SIGNED_UP":
        return <Badge variant="outline"><UserPlus className="h-3 w-3 mr-1" /> Signed Up</Badge>;
      case "CONVERTED":
        return <Badge variant="default"><TrendingUp className="h-3 w-3 mr-1" /> Converted</Badge>;
      case "PAID_OUT":
        return <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" /> Paid</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

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

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/user/account");
    },
    onSuccess: () => {
      window.location.href = "/auth";
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete account. Please try again.",
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

  const { data: memberships, isLoading: membershipsLoading } = useQuery<OrganizationMember[]>({
    queryKey: ['/api/users', user?.id, 'organizations'],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/users/${user.id}/organizations`);
      if (!res.ok) throw new Error('Failed to fetch organizations');
      return res.json();
    },
    enabled: !!user?.id
  });

  const { data: organizations, isLoading: organizationsLoading } = useQuery<Organization[]>({
    queryKey: ['/api/organizations']
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; email: string; jobTitle?: string; pmiId?: string; linkedinUrl?: string }) => {
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
      email: user?.email || "",
      jobTitle: user?.jobTitle || "",
      pmiId: user?.pmiId || "",
      linkedinUrl: user?.linkedinUrl || "",
    });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditForm({ firstName: "", lastName: "", email: "", jobTitle: "", pmiId: "", linkedinUrl: "" });
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
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="lg:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-full text-sm whitespace-nowrap transition-colors shrink-0",
                activeSection === item.id
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
              data-testid={`nav-mobile-${item.id}`}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden lg:block w-56 shrink-0">
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Profile</h2>
                <p className="text-sm text-muted-foreground">Manage your personal information</p>
              </div>
              {!isEditing && (
                <Button onClick={handleEdit} variant="outline" className="shrink-0" data-testid="button-edit-profile">
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
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="jobTitle">Job Title</Label>
                      <Input id="jobTitle" value={editForm.jobTitle} onChange={(e) => setEditForm(prev => ({ ...prev, jobTitle: e.target.value }))} placeholder="e.g. Senior Project Manager" data-testid="input-job-title" />
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
                      <Label className="text-muted-foreground text-xs">Job Title</Label>
                      <p className="font-medium" data-testid="text-job-title">{user?.jobTitle || '-'}</p>
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
                <div className="flex flex-col sm:flex-row items-center gap-4">
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

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Award className="h-5 w-5" />
                      Professional Credentials
                    </CardTitle>
                    <CardDescription>Your project management certifications and links</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pmiId">PMI ID</Label>
                      <Input id="pmiId" value={editForm.pmiId} onChange={(e) => setEditForm(prev => ({ ...prev, pmiId: e.target.value }))} placeholder="e.g. 1234567" data-testid="input-pmi-id" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="linkedinUrl">LinkedIn Profile</Label>
                      <Input id="linkedinUrl" value={editForm.linkedinUrl} onChange={(e) => setEditForm(prev => ({ ...prev, linkedinUrl: e.target.value }))} placeholder="https://linkedin.com/in/yourname" data-testid="input-linkedin-url" />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-muted-foreground text-xs">PMI ID</Label>
                      <p className="font-medium" data-testid="text-pmi-id">{user?.pmiId || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">LinkedIn Profile</Label>
                      {user?.linkedinUrl ? (
                        <a href={user.linkedinUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline flex items-center gap-1" data-testid="link-linkedin">
                          <Linkedin className="h-3.5 w-3.5" />
                          View Profile
                        </a>
                      ) : (
                        <p className="font-medium text-muted-foreground" data-testid="text-linkedin-url">-</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Share2 className="h-5 w-5" />
                      Public Profile
                    </CardTitle>
                    <CardDescription>Allow others to view your profile and badges via a public link</CardDescription>
                  </div>
                  <Switch
                    checked={!!user?.publicProfileEnabled}
                    onCheckedChange={async (checked) => {
                      try {
                        await apiRequest("PATCH", `/api/users/${user?.id}/profile`, { publicProfileEnabled: checked });
                        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
                        toast({
                          title: checked ? "Public profile enabled" : "Public profile disabled",
                          description: checked ? "Your profile is now visible via your public link." : "Your public profile link is no longer accessible.",
                        });
                      } catch {
                        toast({ title: "Failed to update", variant: "destructive" });
                      }
                    }}
                  />
                </div>
              </CardHeader>
              {user?.publicProfileEnabled && (
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={`https://fridayreport.ai/badges/${user?.id}`} className="font-mono text-xs sm:text-sm min-w-0" />
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => {
                      navigator.clipboard.writeText(`https://fridayreport.ai/badges/${user?.id}`);
                      toast({ title: "Link copied!" });
                    }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        )}

        {activeSection === "analytics" && <ProfileAnalytics />}

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
                  organizationsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : organizations && organizations.length > 0 ? (
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
                ) : membershipsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
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
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Delete Account</p>
                      <p className="text-sm text-muted-foreground">Permanently delete your account and all data</p>
                    </div>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => setDeleteDialogOpen(true)}
                      className="w-full sm:w-auto"
                      data-testid="button-delete-account"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === "referrals" && (
          <div className="space-y-6">
            <Card data-testid="card-referral-link">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Share2 className="h-4 w-4" />
                  Your Referral Link
                </CardTitle>
                <CardDescription className="text-xs">
                  Share your unique link and earn 10% commission on every paid subscription.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {referralLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input 
                        value={referralStats?.code ? `${window.location.origin}/auth?ref=${referralStats.code.code}` : ""} 
                        readOnly 
                        className="font-mono text-xs sm:text-sm min-w-0"
                        data-testid="input-referral-link"
                      />
                      <Button size="icon" variant="outline" className="shrink-0" onClick={copyReferralLink} data-testid="button-copy-referral-link">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    {referralStats?.code && (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          Code: {referralStats.code.code}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {referralStats.code.commissionPercent}% Commission
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <Card data-testid="card-stat-referrals">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-primary/10">
                      <UserPlus className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{referralStats?.totalReferrals || 0}</p>
                      <p className="text-xs text-muted-foreground">Total Referrals</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-signups">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-blue-500/10">
                      <Users className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{referralStats?.signedUp || 0}</p>
                      <p className="text-xs text-muted-foreground">Signed Up</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-conversions">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-green-500/10">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{referralStats?.converted || 0}</p>
                      <p className="text-xs text-muted-foreground">Converted</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-earnings">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-yellow-500/10">
                      <DollarSign className="h-4 w-4 text-yellow-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        ${((referralStats?.pendingEarningsCents || 0) / 100).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">Pending Earnings</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card data-testid="card-referral-history">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Referral History</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {referralStats?.referrals && referralStats.referrals.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {referralStats.referrals.map((ref) => (
                        <div key={ref.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm truncate">
                              {ref.referredEmail || `User ${ref.referredUserId?.substring(0, 8)}...`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {ref.commissionAmountCents && (
                              <span className="text-xs text-muted-foreground">
                                ${(ref.commissionAmountCents / 100).toFixed(2)}
                              </span>
                            )}
                            {getStatusBadge(ref.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <UserPlus className="h-8 w-8 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No referrals yet</p>
                      <p className="text-xs text-muted-foreground">Share your link to start earning</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-payout">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Request Payout</CardTitle>
                  <CardDescription className="text-xs">
                    Minimum payout: $10.00 | Total paid: ${((referralStats?.paidOutCents || 0) / 100).toFixed(2)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <div className="p-3 rounded-md bg-muted/30 text-center">
                      <p className="text-sm text-muted-foreground">Available for payout</p>
                      <p className="text-2xl font-bold text-primary">
                        ${((referralStats?.pendingEarningsCents || 0) / 100).toFixed(2)}
                      </p>
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={() => setPayoutDialogOpen(true)}
                      disabled={(referralStats?.pendingEarningsCents || 0) < 1000}
                      data-testid="button-request-payout"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Request Payout via PayPal
                    </Button>
                    {(referralStats?.pendingEarningsCents || 0) < 1000 && (
                      <p className="text-xs text-muted-foreground text-center">
                        You need ${(10 - (referralStats?.pendingEarningsCents || 0) / 100).toFixed(2)} more to request a payout
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
        <DialogContent data-testid="dialog-payout">
          <DialogHeader>
            <DialogTitle>Request Payout</DialogTitle>
            <DialogDescription>
              Enter your PayPal email to receive your earnings of ${((referralStats?.pendingEarningsCents || 0) / 100).toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="paypal-email">PayPal Email</Label>
            <Input 
              id="paypal-email"
              type="email" 
              value={paypalEmail} 
              onChange={(e) => setPaypalEmail(e.target.value)}
              placeholder="your@email.com"
              className="mt-2"
              data-testid="input-paypal-email"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutDialogOpen(false)} data-testid="button-cancel-payout">
              Cancel
            </Button>
            <Button 
              onClick={() => requestPayoutMutation.mutate(paypalEmail)}
              disabled={requestPayoutMutation.isPending || !paypalEmail}
              data-testid="button-confirm-payout"
            >
              {requestPayoutMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Request Payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setDeleteConfirmText(""); }}>
        <DialogContent data-testid="dialog-delete-account">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              To confirm, type <span className="font-mono font-semibold text-foreground">DELETE</span> below:
            </p>
            <Input 
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              data-testid="input-delete-confirm"
            />
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => { setDeleteDialogOpen(false); setDeleteConfirmText(""); }}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => deleteAccountMutation.mutate()}
              disabled={deleteConfirmText.trim().toUpperCase() !== "DELETE" || deleteAccountMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteAccountMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
