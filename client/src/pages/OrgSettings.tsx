import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, UserPlus, Trash2, Settings, Users, ShieldAlert, RotateCcw, Folder, FileText, Target, Flag, AlertCircle, CheckSquare, LayoutDashboard, Briefcase, FolderKanban, FileInput, CircleDot, Calendar, Plug, EyeOff, Eye, GitBranch, Save, RotateCw, GripVertical, Pencil, X, Plus, Check, ChevronUp, ChevronDown, PanelLeftClose, PanelLeft, BookOpen, ExternalLink, Link as LinkIcon, Sparkles, Building2, Upload, Image, Mail, Clock, RefreshCw, Zap, ArrowUpCircle, LayoutGrid, Columns, Lightbulb, Mic, Receipt, Code2, PlayCircle, UserCheck, Home } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AVAILABLE_INTAKE_FIELDS } from "@/hooks/use-intake-workflow";
import type { Organization, OrganizationMember, User, RecycleBinItem, RecycleBinItemType, IntakeWorkflowStep, SidebarStructure, SidebarGroup, SidebarItem, RiskAssessmentConfig } from "@shared/schema";
import { DEFAULT_RISK_ASSESSMENT_CONFIG } from "@shared/schema";
import { Slider } from "@/components/ui/slider";
import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay, UniqueIdentifier } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import { ProjectOnlineImportWizard } from "@/components/ProjectOnlineImportWizard";
import { usePortfolios } from "@/hooks/use-portfolios";
import IntegrationsPage from "@/pages/Integrations";
import { BillingContent } from "@/pages/Billing";
import { useCustomFieldDefinitions, useCreateCustomFieldDefinition, useUpdateCustomFieldDefinition, useDeleteCustomFieldDefinition } from "@/hooks/use-custom-fields";
import { useCustomProjectTabs, useCreateCustomTab, useUpdateCustomTab, useDeleteCustomTab, useFullCustomTab, useCreateCustomTabSection, useUpdateCustomTabSection, useDeleteCustomTabSection, useCreateCustomTabField, useDeleteCustomTabField, useProjectFieldDefinitions } from "@/hooks/use-custom-tabs";
import type { CustomFieldDefinition, CustomProjectTab, CustomTabSection, CustomTabField } from "@shared/schema";

interface EnrichedMember extends OrganizationMember {
  user?: User;
}

export default function OrgSettings() {
  const { user, isLoading: authLoading } = useAuth();
  const { currentOrganization, memberships, organizations, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Check if user has admin access to the current organization
  const hasAdminAccess = user?.role === 'super_admin' || 
    memberships?.some(m => m.organizationId === currentOrganization?.id && m.role === 'org_admin');

  if (authLoading || orgLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentOrganization) {
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
            <h2 className="text-xl font-semibold text-foreground">No Organization Selected</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Please select an organization from the dropdown in the top bar to manage its settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return <NoAdminAccessView organization={currentOrganization} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Organization Settings</h1>
            <p className="text-muted-foreground">Managing: <strong>{currentOrganization.name}</strong></p>
          </div>
        </div>
      </div>

      <OrgSettingsTabs currentOrganization={currentOrganization} />
    </div>
  );
}

const settingsTabs = [
  { value: "general", label: "General", icon: Building2 },
  { value: "billing", label: "Billing", icon: Zap },
  { value: "modules", label: "Module Visibility", icon: Eye },
  { value: "system-views", label: "System Views", icon: Columns },
  { value: "custom-fields", label: "Custom Fields", icon: FileText },
  { value: "custom-tabs", label: "Custom Tabs", icon: LayoutGrid },
  { value: "intake", label: "Intake Workflow", icon: GitBranch },
  { value: "members", label: "Team Members", icon: Users },
  { value: "recycle", label: "Recycle Bin", icon: Trash2 },
  { value: "demo", label: "Demo Data", icon: Sparkles },
  { value: "integrations", label: "Integrations", icon: Plug },
  { value: "risk-assessment", label: "Risk Assessment", icon: ShieldAlert },
  { value: "developer", label: "Developer", icon: Code2 },
  { value: "act-as", label: "Act As User", icon: UserCheck },
];

function OrgSettingsTabs({ currentOrganization }: { currentOrganization: Organization }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("general");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  
  const memberships = useOrganization().memberships;
  const userOrgRole = memberships?.find(m => m.organizationId === currentOrganization?.id)?.role;
  const isAdminOrOwner = user?.role === 'super_admin' || userOrgRole === 'org_admin' || userOrgRole === 'owner';

  const filteredTabs = settingsTabs.filter(tab => {
    if (tab.value === 'billing' && currentOrganization.billingHidden && user?.role !== 'super_admin') {
      return false;
    }
    if (tab.value === 'act-as' && !isAdminOrOwner) {
      return false;
    }
    return true;
  });
  
  const activeTabInfo = filteredTabs.find(t => t.value === activeTab) || filteredTabs[0];
  const ActiveIcon = activeTabInfo.icon;

  return (
    <Tabs value={activeTab} onValueChange={(value) => {
      setActiveTab(value);
      setIsMobileMenuOpen(false);
    }} orientation="vertical" className="flex flex-col md:flex-row gap-4 md:gap-6">
      {/* Mobile: Collapsible menu header */}
      <div className="md:hidden">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex items-center justify-between w-full p-3 bg-card border rounded-lg"
          data-testid="button-mobile-settings-menu"
        >
          <div className="flex items-center gap-3">
            <ActiveIcon className="h-4 w-4" />
            <span className="font-medium">{activeTabInfo.label}</span>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isMobileMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {/* Mobile: Collapsible menu with actual TabsTriggers */}
        <div className={`overflow-hidden transition-all duration-200 ${isMobileMenuOpen ? 'max-h-96 mt-2' : 'max-h-0'}`}>
          <TabsList className="flex flex-col h-fit w-full bg-card border rounded-lg p-1">
            {filteredTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger 
                  key={tab.value}
                  value={tab.value} 
                  className="w-full justify-start gap-3" 
                  data-testid={`nav-mobile-${tab.value}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
      </div>

      {/* Desktop: Horizontally collapsible sidebar tabs */}
      <div className={`hidden md:flex flex-col transition-all duration-200 ${isDesktopSidebarCollapsed ? 'w-12' : 'w-56'}`}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsDesktopSidebarCollapsed(!isDesktopSidebarCollapsed)}
          className="h-7 w-7 mb-2 self-end"
          data-testid="button-toggle-settings-sidebar"
          title={isDesktopSidebarCollapsed ? "Expand menu" : "Collapse menu"}
        >
          {isDesktopSidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          <span className="sr-only">Toggle Settings Menu</span>
        </Button>
        
        <TabsList className={`flex flex-col h-fit bg-card border rounded-lg p-1 ${isDesktopSidebarCollapsed ? 'w-12' : 'w-56'}`}>
          {filteredTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger 
                key={tab.value}
                value={tab.value} 
                className={`w-full gap-3 ${isDesktopSidebarCollapsed ? 'justify-center px-2' : 'justify-start'}`}
                data-testid={`nav-${tab.value}`}
                title={isDesktopSidebarCollapsed ? tab.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!isDesktopSidebarCollapsed && <span>{tab.label}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      <div className="flex-1 min-w-0">
        <TabsContent value="general" className="mt-0">
          <GeneralSection organization={currentOrganization} />
        </TabsContent>
        {(!currentOrganization.billingHidden || user?.role === 'super_admin') && (
          <TabsContent value="billing" className="mt-0">
            <BillingContent />
          </TabsContent>
        )}
        <TabsContent value="modules" className="mt-0">
          <ModuleVisibilitySection organization={currentOrganization} />
        </TabsContent>
        <TabsContent value="system-views" className="mt-0">
          <SystemViewsSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="custom-fields" className="mt-0">
          <CustomFieldsSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="custom-tabs" className="mt-0">
          <CustomTabsSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="intake" className="mt-0">
          <IntakeWorkflowSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="members" className="mt-0">
          <MembersSection organizationId={currentOrganization.id} orgName={currentOrganization.name} />
        </TabsContent>
        <TabsContent value="recycle" className="mt-0">
          <RecycleBinSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="demo" className="mt-0">
          <DemoDataSection organizationId={currentOrganization.id} orgName={currentOrganization.name} />
        </TabsContent>
        <TabsContent value="integrations" className="mt-0">
          <IntegrationsSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="risk-assessment" className="mt-0">
          <RiskAssessmentConfigSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="developer" className="mt-0">
          <DeveloperSection />
        </TabsContent>
        <TabsContent value="act-as" className="mt-0">
          <ActAsSection organizationId={currentOrganization.id} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

// No Admin Access view with Request Access button
function NoAdminAccessView({ organization }: { organization: Organization }) {
  const { toast } = useToast();
  const [requestMessage, setRequestMessage] = useState("");
  const [showRequestDialog, setShowRequestDialog] = useState(false);

  // Check if user has a pending access request
  const { data: accessStatus, isLoading: statusLoading } = useQuery<{ hasPendingRequest: boolean; request: { id: number; status: string; createdAt: string } | null }>({
    queryKey: ['/api/organizations', organization.id, 'access-requests', 'my-status'],
  });

  // Mutation for submitting access request
  const submitRequestMutation = useMutation({
    mutationFn: async (message: string) => {
      return await apiRequest('POST', `/api/organizations/${organization.id}/access-requests`, { 
        message: message || undefined 
      });
    },
    onSuccess: () => {
      toast({
        title: "Request Submitted",
        description: "Your access request has been sent to the organization administrators.",
      });
      setShowRequestDialog(false);
      setRequestMessage("");
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organization.id, 'access-requests', 'my-status'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Request Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for resending access request notification
  const resendRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      return await apiRequest('POST', `/api/organizations/${organization.id}/access-requests/${requestId}/resend`);
    },
    onSuccess: () => {
      toast({
        title: "Notification Resent",
        description: "Your access request has been resent to the organization administrators.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to resend request notification",
        variant: "destructive",
      });
    },
  });

  const hasPendingRequest = accessStatus?.hasPendingRequest;
  const pendingRequest = accessStatus?.request;

  return (
    <div className="flex h-96 flex-col items-center justify-center gap-4">
      <ShieldAlert className="h-16 w-16 text-muted-foreground/50" />
      <h2 className="text-2xl font-bold text-foreground">No Admin Access</h2>
      <p className="text-muted-foreground text-center max-w-md">
        You don't have admin access to <strong>{organization.name}</strong>. 
        Please select a different organization from the top bar or request access from an administrator.
      </p>
      
      {statusLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : hasPendingRequest ? (
        <div className="flex flex-col items-center gap-3">
          <Badge variant="secondary" className="flex items-center gap-2">
            <Clock className="h-3 w-3" />
            Request Pending
          </Badge>
          {pendingRequest?.createdAt && (
            <p className="text-xs text-muted-foreground">
              Submitted {format(new Date(pendingRequest.createdAt), 'MMM d, yyyy')}
            </p>
          )}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => pendingRequest && resendRequestMutation.mutate(pendingRequest.id)}
            disabled={resendRequestMutation.isPending}
            data-testid="button-resend-request"
          >
            {resendRequestMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Resending...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Resend Request
              </>
            )}
          </Button>
        </div>
      ) : (
        <Button 
          onClick={() => setShowRequestDialog(true)}
          data-testid="button-request-access"
        >
          <Mail className="h-4 w-4 mr-2" />
          Request Access
        </Button>
      )}

      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Admin Access</DialogTitle>
            <DialogDescription>
              Send a request to the administrators of <strong>{organization.name}</strong> to grant you admin access.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="request-message">Message (optional)</Label>
              <Textarea
                id="request-message"
                placeholder="Explain why you need admin access..."
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                rows={3}
                data-testid="input-request-message"
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowRequestDialog(false)}
              data-testid="button-cancel-request"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => submitRequestMutation.mutate(requestMessage)}
              disabled={submitRequestMutation.isPending}
              data-testid="button-submit-request"
            >
              {submitRequestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// General settings section with logo upload and name editing
function GeneralSection({ organization }: { organization: Organization }) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [orgName, setOrgName] = useState(organization.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  // Sync orgName when organization changes
  useEffect(() => {
    setOrgName(organization.name);
  }, [organization.name]);
  
  // Reset logo load failure when logo URL changes
  useEffect(() => {
    setLogoLoadFailed(false);
  }, [organization.logoUrl]);

  const updateNameMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest('PUT', `/api/organizations/${organization.id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/organizations'] });
      setIsEditingName(false);
      toast({
        title: "Name updated",
        description: "Organization name has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update organization name. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const updateLogoMutation = useMutation({
    mutationFn: async (logoUrl: string | null) => {
      const res = await apiRequest('PUT', `/api/organizations/${organization.id}`, { logoUrl });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/organizations'] });
      toast({
        title: "Logo updated",
        description: "Your company logo has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update logo. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file",
        description: "Please select an image file (PNG, JPG, GIF, etc.)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      // Use direct upload endpoint (handles both object storage and local fallback)
      const formData = new FormData();
      formData.append('logo', file);
      
      const response = await fetch(`/api/organizations/${organization.id}/logo/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const { objectPath } = await response.json() as { objectPath: string; success: boolean };
      
      // Invalidate organization queries to refresh the logo
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      
      toast({
        title: "Success",
        description: "Your company logo has been updated successfully.",
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload logo. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleRemoveLogo = () => {
    updateLogoMutation.mutate(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          General Settings
        </CardTitle>
        <CardDescription>
          Customize your organization's branding and appearance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Organization Name Section */}
        <div className="space-y-4">
          <div>
            <Label className="text-base font-medium">Organization Name</Label>
            <p className="text-sm text-muted-foreground">
              The name of your organization as it appears throughout the application.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {isEditingName ? (
              <>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Enter organization name"
                  className="max-w-md"
                  data-testid="input-org-name"
                />
                <Button
                  onClick={() => {
                    if (orgName.trim()) {
                      updateNameMutation.mutate(orgName.trim());
                    }
                  }}
                  disabled={!orgName.trim() || orgName.trim() === organization.name || updateNameMutation.isPending}
                  data-testid="button-save-org-name"
                >
                  {updateNameMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setOrgName(organization.name);
                    setIsEditingName(false);
                  }}
                  disabled={updateNameMutation.isPending}
                  data-testid="button-cancel-org-name"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <span className="text-lg font-medium">{orgName}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingName(true)}
                  data-testid="button-edit-org-name"
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              </>
            )}
          </div>
        </div>

        <Separator />

        {/* Organization ID Section */}
        <div className="space-y-2">
          <div>
            <Label className="text-base font-medium">Organization ID</Label>
            <p className="text-sm text-muted-foreground">
              Unique identifier for your organization. Use this for API integrations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="px-3 py-2 bg-muted rounded-md text-sm font-mono" data-testid="text-org-id">
              {organization.id}
            </code>
          </div>
        </div>

        <Separator />

        {/* Company Logo Section */}
        <div className="space-y-4">
          <div>
            <Label className="text-base font-medium">Company Logo</Label>
            <p className="text-sm text-muted-foreground">
              Upload your company logo to display in the sidebar. Recommended size: 48x48px or larger (square format works best).
            </p>
          </div>
          
          <div className="flex items-start gap-6">
            {/* Logo Preview */}
            <div className="flex flex-col items-center gap-2">
              <div className="h-24 w-24 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/50">
                {organization.logoUrl && !logoLoadFailed ? (
                  <img 
                    src={organization.logoUrl} 
                    alt="Company Logo" 
                    className="h-full w-full object-contain"
                    onError={() => setLogoLoadFailed(true)}
                  />
                ) : (
                  <Image className="h-8 w-8 text-muted-foreground/50" />
                )}
              </div>
              <span className="text-xs text-muted-foreground">Preview</span>
            </div>

            {/* Upload Controls */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => document.getElementById('logo-upload')?.click()}
                  disabled={isUploading || updateLogoMutation.isPending}
                  data-testid="button-upload-logo"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Logo
                    </>
                  )}
                </Button>
                
                {organization.logoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveLogo}
                    disabled={isUploading || updateLogoMutation.isPending}
                    className="text-muted-foreground hover:text-destructive"
                    data-testid="button-remove-logo"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-logo-upload"
              />
              
              <p className="text-xs text-muted-foreground">
                Supported formats: PNG, JPG, GIF, SVG. Max size: 5MB
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const availableModules = [
  { key: "home", name: "Home", icon: Home, description: "My Work overview" },
  { key: "dashboard", name: "Dashboard", icon: LayoutDashboard, description: "Overview and analytics" },
  { key: "portfolios", name: "Portfolios", icon: Briefcase, description: "Group and manage portfolios" },
  { key: "projects", name: "Projects", icon: FolderKanban, description: "Project management" },
  { key: "intakes", name: "Intakes", icon: FileInput, description: "Project intake requests" },
  { key: "tasks", name: "Tasks", icon: CheckSquare, description: "Task tracking" },
  { key: "issues", name: "Issues", icon: CircleDot, description: "Issue tracking" },
  { key: "simulation", name: "Simulation", icon: PlayCircle, description: "What-if scenario forecasting" },
  { key: "invoices", name: "Invoices", icon: Receipt, description: "Invoice management and tracking" },
  { key: "timesheets", name: "Timesheets", icon: Clock, description: "Time tracking" },
  { key: "lessons-learned", name: "Lessons Learned", icon: Lightbulb, description: "Document lessons from projects" },
  { key: "resources", name: "Resources", icon: Users, description: "Resource management" },
  { key: "calendar", name: "Calendar", icon: Calendar, description: "Calendar view" },
  { key: "user-guide", name: "User Guide", icon: BookOpen, description: "Help documentation" },
];

const moduleIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  dashboard: LayoutDashboard,
  portfolios: Briefcase,
  projects: FolderKanban,
  intakes: FileInput,
  tasks: CheckSquare,
  issues: CircleDot,
  simulation: PlayCircle,
  invoices: Receipt,
  timesheets: Clock,
  "lessons-learned": Lightbulb,
  resources: Users,
  calendar: Calendar,
  "user-guide": BookOpen,
};

function getDefaultSidebarStructure(hiddenModules?: string[] | null, moduleOrder?: string[] | null, hiddenGroups?: string[] | null): SidebarStructure {
  return [
    { id: "home", name: "Home", isDefault: true, hidden: false, items: [
      { type: "module" as const, key: "home", hidden: false },
      { type: "module" as const, key: "dashboard", hidden: false },
    ]},
    { id: "portfolio", name: "Portfolio", hidden: false, collapsedByDefault: false, items: [
      { type: "module" as const, key: "portfolios", hidden: false },
      { type: "module" as const, key: "projects", hidden: false },
      { type: "module" as const, key: "intakes", hidden: false },
      { type: "module" as const, key: "issues", hidden: false },
      { type: "module" as const, key: "tasks", hidden: false },
      { type: "module" as const, key: "timesheets", hidden: false },
    ]},
    { id: "resource-management", name: "Resource Management", hidden: false, collapsedByDefault: true, items: [
      { type: "module" as const, key: "resources", hidden: false },
    ]},
    { id: "finance", name: "Finance", hidden: false, collapsedByDefault: true, items: [
      { type: "module" as const, key: "simulation", hidden: false },
      { type: "module" as const, key: "invoices", hidden: false },
    ]},
    { id: "help", name: "Help", isDefault: true, hidden: false, collapsedByDefault: true, items: [
      { type: "module" as const, key: "calendar", hidden: false },
      { type: "module" as const, key: "lessons-learned", hidden: false },
      { type: "module" as const, key: "user-guide", hidden: false },
    ]},
  ];
}

function migrateOldFlatStructure(structure: SidebarStructure): SidebarStructure {
  const menuGroup = structure.find(g => g.id === "menu");
  if (!menuGroup) return structure;
  
  const getItemHidden = (key: string): boolean => {
    const item = menuGroup.items.find(i => i.type === "module" && i.key === key);
    return item ? !!item.hidden : false;
  };

  const customLinks = menuGroup.items.filter(i => i.type === "customLink");
  const helpGroup = structure.find(g => g.id === "help");
  const otherGroups = structure.filter(g => g.id !== "menu" && g.id !== "help");

  return [
    { id: "home", name: "Home", isDefault: true, hidden: false, items: [
      { type: "module" as const, key: "home", hidden: getItemHidden("home") },
      { type: "module" as const, key: "dashboard", hidden: getItemHidden("dashboard") },
    ]},
    { id: "portfolio", name: "Portfolio", hidden: false, collapsedByDefault: false, items: [
      { type: "module" as const, key: "portfolios", hidden: getItemHidden("portfolios") },
      { type: "module" as const, key: "projects", hidden: getItemHidden("projects") },
      { type: "module" as const, key: "intakes", hidden: getItemHidden("intakes") },
      { type: "module" as const, key: "issues", hidden: getItemHidden("issues") },
      { type: "module" as const, key: "tasks", hidden: getItemHidden("tasks") },
      { type: "module" as const, key: "timesheets", hidden: getItemHidden("timesheets") },
    ]},
    { id: "resource-management", name: "Resource Management", hidden: false, collapsedByDefault: true, items: [
      { type: "module" as const, key: "resources", hidden: getItemHidden("resources") },
    ]},
    { id: "finance", name: "Finance", hidden: false, collapsedByDefault: true, items: [
      { type: "module" as const, key: "simulation", hidden: getItemHidden("simulation") },
      { type: "module" as const, key: "invoices", hidden: getItemHidden("invoices") },
    ]},
    ...otherGroups,
    { id: "help", name: "Help", isDefault: true, hidden: helpGroup?.hidden ?? false, collapsedByDefault: true, items: [
      { type: "module" as const, key: "calendar", hidden: getItemHidden("calendar") },
      { type: "module" as const, key: "lessons-learned", hidden: getItemHidden("lessons-learned") },
      { type: "module" as const, key: "user-guide", hidden: helpGroup?.items.find(i => i.type === "module" && i.key === "user-guide")?.hidden ?? false },
      ...customLinks,
    ]},
  ];
}

function ensureStructureHasDefaults(structure: SidebarStructure): SidebarStructure {
  const hasOldFlatMenu = structure.some(g => g.id === "menu") && !structure.some(g => g.id === "portfolio");
  if (hasOldFlatMenu) {
    structure = migrateOldFlatStructure(structure);
  }

  const validModuleKeys = new Set(availableModules.map(m => m.key));
  
  let cleanedStructure = structure.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (item.type === "module") {
        return validModuleKeys.has(item.key);
      }
      return true;
    })
  }));

  const ensureModule = (moduleKey: string, targetGroupId: string, afterKey?: string) => {
    const hasModule = cleanedStructure.some(g => 
      g.items.some(item => item.type === "module" && item.key === moduleKey)
    );
    if (!hasModule) {
      const targetGroup = cleanedStructure.find(g => g.id === targetGroupId);
      if (targetGroup) {
        cleanedStructure = cleanedStructure.map(g => {
          if (g.id === targetGroupId) {
            const newItems = [...g.items];
            if (afterKey) {
              const afterIndex = newItems.findIndex(item => item.type === "module" && item.key === afterKey);
              const insertIndex = afterIndex >= 0 ? afterIndex + 1 : newItems.length;
              newItems.splice(insertIndex, 0, { type: "module" as const, key: moduleKey, hidden: false });
            } else {
              newItems.push({ type: "module" as const, key: moduleKey, hidden: false });
            }
            return { ...g, items: newItems };
          }
          return g;
        });
      }
    }
  };

  ensureModule("home", "home");
  ensureModule("simulation", "finance");
  ensureModule("timesheets", "portfolio", "tasks");
  ensureModule("lessons-learned", "help");
  ensureModule("invoices", "finance", "simulation");
  ensureModule("user-guide", "help");
  
  const helpGroup = cleanedStructure.find(g => g.id === "help");
  if (!helpGroup) {
    cleanedStructure = [...cleanedStructure, { 
      id: "help", 
      name: "Help", 
      isDefault: true, 
      hidden: false, 
      collapsedByDefault: true,
      items: [
        { type: "module" as const, key: "calendar", hidden: false },
        { type: "module" as const, key: "lessons-learned", hidden: false },
        { type: "module" as const, key: "user-guide", hidden: false },
      ] 
    }];
  }
  
  return cleanedStructure;
}

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function ModuleVisibilitySection({ organization }: { organization: Organization }) {
  const { toast } = useToast();
  
  const initialStructure = useMemo(() => {
    if (organization.sidebarStructure && Array.isArray(organization.sidebarStructure) && organization.sidebarStructure.length > 0) {
      return ensureStructureHasDefaults(organization.sidebarStructure as SidebarStructure);
    }
    return getDefaultSidebarStructure(organization.hiddenModules, organization.moduleOrder, organization.hiddenGroups);
  }, [organization.id, organization.sidebarStructure, organization.hiddenModules, organization.moduleOrder, organization.hiddenGroups]);
  
  const [structure, setStructure] = useState<SidebarStructure>(initialStructure);
  const [previousStructure, setPreviousStructure] = useState<SidebarStructure | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SidebarGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<SidebarGroup | null>(null);
  
  const [showAddLink, setShowAddLink] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<{ groupId: string; link: SidebarItem & { type: "customLink" } } | null>(null);
  
  const [newGroupName, setNewGroupName] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkOpenMode, setNewLinkOpenMode] = useState<"newTab" | "iframe">("newTab");
  
  useEffect(() => {
    const newStructure = organization.sidebarStructure && Array.isArray(organization.sidebarStructure) && organization.sidebarStructure.length > 0
      ? ensureStructureHasDefaults(organization.sidebarStructure as SidebarStructure)
      : getDefaultSidebarStructure(organization.hiddenModules, organization.moduleOrder, organization.hiddenGroups);
    setStructure(newStructure);
  }, [organization.id, organization.sidebarStructure]);
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  
  const updateOrgMutation = useMutation({
    mutationFn: async (data: { sidebarStructure: SidebarStructure }) => {
      return apiRequest('PUT', `/api/organizations/${organization.id}`, data);
    },
    onSuccess: () => {
      setPreviousStructure(null);
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      toast({ title: "Saved", description: "Menu structure updated" });
    },
    onError: () => {
      if (previousStructure) {
        setStructure(previousStructure);
        setPreviousStructure(null);
      }
      toast({ title: "Error", description: "Failed to update menu structure", variant: "destructive" });
    }
  });

  const saveStructure = (newStructure: SidebarStructure) => {
    const normalizedStructure = ensureStructureHasDefaults(newStructure);
    setPreviousStructure([...structure]);
    setStructure(normalizedStructure);
    updateOrgMutation.mutate({ sidebarStructure: normalizedStructure });
  };

  const getItemId = (item: SidebarItem): string => {
    return item.type === "module" ? `module-${item.key}` : `link-${item.id}`;
  };

  const findItemAndGroup = (id: string): { groupIndex: number; itemIndex: number } | null => {
    for (let gi = 0; gi < structure.length; gi++) {
      const itemIndex = structure[gi].items.findIndex(item => getItemId(item) === id);
      if (itemIndex !== -1) return { groupIndex: gi, itemIndex };
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const activeLocation = findItemAndGroup(String(active.id));
    const overLocation = findItemAndGroup(String(over.id));
    
    if (!activeLocation) return;
    
    const newStructure = structure.map(g => ({ ...g, items: [...g.items] }));
    
    if (overLocation) {
      if (activeLocation.groupIndex === overLocation.groupIndex) {
        newStructure[activeLocation.groupIndex].items = arrayMove(
          newStructure[activeLocation.groupIndex].items,
          activeLocation.itemIndex,
          overLocation.itemIndex
        );
      } else {
        const [movedItem] = newStructure[activeLocation.groupIndex].items.splice(activeLocation.itemIndex, 1);
        newStructure[overLocation.groupIndex].items.splice(overLocation.itemIndex, 0, movedItem);
      }
    }
    
    saveStructure(newStructure);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    
    const activeId = String(active.id);
    const overId = String(over.id);
    
    if (overId.startsWith("group-")) {
      const targetGroupId = overId.replace("group-", "");
      const activeLocation = findItemAndGroup(activeId);
      if (!activeLocation) return;
      
      const sourceGroupIndex = activeLocation.groupIndex;
      const targetGroupIndex = structure.findIndex(g => g.id === targetGroupId);
      if (targetGroupIndex === -1 || sourceGroupIndex === targetGroupIndex) return;
      
      const newStructure = structure.map(g => ({ ...g, items: [...g.items] }));
      const [movedItem] = newStructure[sourceGroupIndex].items.splice(activeLocation.itemIndex, 1);
      newStructure[targetGroupIndex].items.push(movedItem);
      setStructure(newStructure);
    }
  };

  const toggleGroupVisibility = (groupId: string) => {
    const newStructure = structure.map(g => 
      g.id === groupId ? { ...g, hidden: !g.hidden } : g
    );
    saveStructure(newStructure);
  };

  const toggleGroupCollapsedByDefault = (groupId: string) => {
    const newStructure = structure.map(g => 
      g.id === groupId ? { ...g, collapsedByDefault: !g.collapsedByDefault } : g
    );
    saveStructure(newStructure);
  };

  const toggleItemVisibility = (groupId: string, itemId: string) => {
    const newStructure = structure.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        items: g.items.map(item => 
          getItemId(item) === itemId ? { ...item, hidden: !item.hidden } : item
        )
      };
    });
    saveStructure(newStructure);
  };

  const addGroup = () => {
    if (!newGroupName.trim()) return;
    const id = newGroupName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const newGroup: SidebarGroup = { id, name: newGroupName.trim(), items: [] };
    saveStructure([...structure, newGroup]);
    setNewGroupName("");
    setShowAddGroup(false);
  };

  const updateGroup = () => {
    if (!editingGroup || !newGroupName.trim()) return;
    const newStructure = structure.map(g => 
      g.id === editingGroup.id ? { ...g, name: newGroupName.trim() } : g
    );
    saveStructure(newStructure);
    setNewGroupName("");
    setEditingGroup(null);
  };

  const confirmDeleteGroup = () => {
    if (!deleteGroup) return;
    const groupToDelete = structure.find(g => g.id === deleteGroup.id);
    if (!groupToDelete) return;
    
    const menuGroupIndex = structure.findIndex(g => g.id === "menu");
    const newStructure = structure.filter(g => g.id !== deleteGroup.id);
    
    if (groupToDelete.items.length > 0 && menuGroupIndex !== -1) {
      const targetIndex = newStructure.findIndex(g => g.id === "menu");
      if (targetIndex !== -1) {
        newStructure[targetIndex] = {
          ...newStructure[targetIndex],
          items: [...newStructure[targetIndex].items, ...groupToDelete.items]
        };
      }
    }
    
    saveStructure(newStructure);
    setDeleteGroup(null);
  };

  const moveGroup = (groupId: string, direction: 'up' | 'down') => {
    const index = structure.findIndex(g => g.id === groupId);
    if (index === -1) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= structure.length) return;
    
    const newStructure = [...structure];
    [newStructure[index], newStructure[newIndex]] = [newStructure[newIndex], newStructure[index]];
    saveStructure(newStructure);
  };

  const addCustomLink = (groupId: string) => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    try {
      new URL(newLinkUrl);
    } catch {
      toast({ title: "Invalid URL", description: "Please enter a valid URL", variant: "destructive" });
      return;
    }
    
    const linkId = `link-${Date.now()}`;
    const newLink: SidebarItem = {
      type: "customLink",
      id: linkId,
      label: newLinkLabel.trim(),
      url: newLinkUrl.trim(),
      openInNewTab: newLinkOpenMode === "newTab",
      openMode: newLinkOpenMode,
    };
    
    const newStructure = structure.map(g => 
      g.id === groupId ? { ...g, items: [...g.items, newLink] } : g
    );
    saveStructure(newStructure);
    setNewLinkLabel("");
    setNewLinkUrl("");
    setNewLinkOpenMode("newTab");
    setShowAddLink(null);
  };

  const updateCustomLink = () => {
    if (!editingLink || !newLinkLabel.trim() || !newLinkUrl.trim()) return;
    try {
      new URL(newLinkUrl);
    } catch {
      toast({ title: "Invalid URL", description: "Please enter a valid URL", variant: "destructive" });
      return;
    }
    
    const newStructure = structure.map(g => {
      if (g.id !== editingLink.groupId) return g;
      return {
        ...g,
        items: g.items.map(item => {
          if (item.type === "customLink" && item.id === editingLink.link.id) {
            return { ...item, label: newLinkLabel.trim(), url: newLinkUrl.trim(), openInNewTab: newLinkOpenMode === "newTab", openMode: newLinkOpenMode };
          }
          return item;
        })
      };
    });
    saveStructure(newStructure);
    setNewLinkLabel("");
    setNewLinkUrl("");
    setNewLinkOpenMode("newTab");
    setEditingLink(null);
  };

  const deleteItem = (groupId: string, itemId: string) => {
    const newStructure = structure.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, items: g.items.filter(item => getItemId(item) !== itemId) };
    });
    saveStructure(newStructure);
  };

  const getModuleInfo = (key: string) => availableModules.find(m => m.key === key);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5" />
                Menu Structure
              </CardTitle>
              <CardDescription>
                Organize menu groups and items. Drag items between groups to reorganize.
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddGroup(true)} size="sm" data-testid="button-add-group">
              <Plus className="h-4 w-4 mr-1" />
              Add Group
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
          >
            <div className="space-y-4">
              {structure.map((group, groupIndex) => (
                <div 
                  key={group.id} 
                  className="border rounded-lg overflow-visible"
                  data-testid={`group-${group.id}`}
                >
                  <div className="flex items-center justify-between p-3 bg-muted/50 border-b">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => moveGroup(group.id, 'up')}
                          disabled={groupIndex === 0 || updateOrgMutation.isPending}
                          data-testid={`button-move-group-up-${group.id}`}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => moveGroup(group.id, 'down')}
                          disabled={groupIndex === structure.length - 1 || updateOrgMutation.isPending}
                          data-testid={`button-move-group-down-${group.id}`}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className={`p-2 rounded-md ${group.hidden ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                        <Folder className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {group.name}
                          {group.isDefault && <Badge variant="outline" className="text-xs">Default</Badge>}
                          {group.hidden && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground">{group.items.length} items</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowAddLink(group.id)}
                        data-testid={`button-add-link-${group.id}`}
                      >
                        <LinkIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditingGroup(group); setNewGroupName(group.name); }}
                        data-testid={`button-edit-group-${group.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!group.isDefault && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteGroup(group)}
                          data-testid={`button-delete-group-${group.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-muted-foreground text-xs whitespace-nowrap">Collapsed</span>
                        <Switch
                          checked={!!group.collapsedByDefault}
                          onCheckedChange={() => toggleGroupCollapsedByDefault(group.id)}
                          disabled={updateOrgMutation.isPending}
                          data-testid={`switch-group-collapsed-${group.id}`}
                        />
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-muted-foreground">
                          {group.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </span>
                        <Switch
                          checked={!group.hidden}
                          onCheckedChange={() => toggleGroupVisibility(group.id)}
                          disabled={updateOrgMutation.isPending}
                          data-testid={`switch-group-${group.id}`}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <SortableContext
                    items={group.items.map(item => getItemId(item))}
                    strategy={verticalListSortingStrategy}
                  >
                    <div 
                      className="p-2 min-h-[48px]"
                      id={`group-${group.id}`}
                      data-testid={`group-items-${group.id}`}
                    >
                      {group.items.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          Drag items here or add a custom link
                        </div>
                      ) : (
                        group.items.map((item) => {
                          const itemId = getItemId(item);
                          const isHidden = item.hidden;
                          
                          if (item.type === "module") {
                            const moduleInfo = getModuleInfo(item.key);
                            const Icon = moduleIconMap[item.key] || Folder;
                            return (
                              <SortableItem key={itemId} id={itemId}>
                                <div 
                                  className="flex items-center justify-between p-3 rounded-lg border mb-2 bg-background cursor-grab active:cursor-grabbing"
                                  data-testid={`item-${itemId}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    <div className={`p-2 rounded-md ${isHidden ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                                      <Icon className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <div className="font-medium flex items-center gap-2">
                                        {moduleInfo?.name || item.key}
                                        {isHidden && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                                      </div>
                                      <div className="text-sm text-muted-foreground">{moduleInfo?.description || 'Module'}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">
                                      {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </span>
                                    <Switch
                                      checked={!isHidden}
                                      onCheckedChange={() => toggleItemVisibility(group.id, itemId)}
                                      disabled={updateOrgMutation.isPending}
                                      data-testid={`switch-item-${itemId}`}
                                    />
                                  </div>
                                </div>
                              </SortableItem>
                            );
                          } else {
                            return (
                              <SortableItem key={itemId} id={itemId}>
                                <div 
                                  className="flex items-center justify-between p-3 rounded-lg border mb-2 bg-background cursor-grab active:cursor-grabbing"
                                  data-testid={`item-${itemId}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    <div className={`p-2 rounded-md ${isHidden ? 'bg-muted text-muted-foreground' : 'bg-accent text-accent-foreground'}`}>
                                      <ExternalLink className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <div className="font-medium flex items-center gap-2">
                                        {item.label}
                                        <Badge variant="outline" className="text-xs">Link</Badge>
                                        {isHidden && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                                      </div>
                                      <div className="text-sm text-muted-foreground truncate max-w-[200px]">{item.url}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => { 
                                        setEditingLink({ groupId: group.id, link: item }); 
                                        setNewLinkLabel(item.label); 
                                        setNewLinkUrl(item.url); 
                                        setNewLinkOpenMode(item.openMode || (item.openInNewTab === false ? "iframe" : "newTab"));
                                      }}
                                      data-testid={`button-edit-link-${item.id}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => deleteItem(group.id, itemId)}
                                      data-testid={`button-delete-link-${item.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <div className="flex items-center gap-2 ml-2">
                                      <span className="text-muted-foreground">
                                        {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                      </span>
                                      <Switch
                                        checked={!isHidden}
                                        onCheckedChange={() => toggleItemVisibility(group.id, itemId)}
                                        disabled={updateOrgMutation.isPending}
                                        data-testid={`switch-item-${itemId}`}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </SortableItem>
                            );
                          }
                        })
                      )}
                    </div>
                  </SortableContext>
                </div>
              ))}
            </div>
          </DndContext>
        </CardContent>
      </Card>

      <Dialog open={showAddGroup} onOpenChange={setShowAddGroup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Menu Group</DialogTitle>
            <DialogDescription>Create a new group to organize your sidebar items.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input 
                id="group-name" 
                value={newGroupName} 
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g., Reports"
                data-testid="input-group-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddGroup(false); setNewGroupName(""); }}>Cancel</Button>
            <Button onClick={addGroup} disabled={!newGroupName.trim()} data-testid="button-confirm-add-group">Add Group</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingGroup} onOpenChange={(open) => { if (!open) { setEditingGroup(null); setNewGroupName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
            <DialogDescription>Update the group name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-group-name">Group Name</Label>
              <Input 
                id="edit-group-name" 
                value={newGroupName} 
                onChange={(e) => setNewGroupName(e.target.value)}
                data-testid="input-edit-group-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingGroup(null); setNewGroupName(""); }}>Cancel</Button>
            <Button onClick={updateGroup} disabled={!newGroupName.trim()} data-testid="button-confirm-edit-group">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteGroup} onOpenChange={(open) => { if (!open) setDeleteGroup(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteGroup?.name}"? 
              {deleteGroup && deleteGroup.items.length > 0 && " Its items will be moved to the Menu group."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteGroup} data-testid="button-confirm-delete-group">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!showAddLink} onOpenChange={(open) => { if (!open) { setShowAddLink(null); setNewLinkLabel(""); setNewLinkUrl(""); setNewLinkOpenMode("newTab"); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Link</DialogTitle>
            <DialogDescription>Add an external link to your sidebar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="link-label">Label</Label>
              <Input 
                id="link-label" 
                value={newLinkLabel} 
                onChange={(e) => setNewLinkLabel(e.target.value)}
                placeholder="e.g., Documentation"
                data-testid="input-link-label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input 
                id="link-url" 
                value={newLinkUrl} 
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://example.com"
                data-testid="input-link-url"
              />
            </div>
            <div className="space-y-2">
              <Label>Open Mode</Label>
              <RadioGroup 
                value={newLinkOpenMode} 
                onValueChange={(value: "newTab" | "iframe") => setNewLinkOpenMode(value)}
                className="flex gap-4"
                data-testid="radio-link-open-mode"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="newTab" id="add-mode-newtab" data-testid="radio-newtab" />
                  <Label htmlFor="add-mode-newtab" className="font-normal cursor-pointer">New Tab</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="iframe" id="add-mode-iframe" data-testid="radio-iframe" />
                  <Label htmlFor="add-mode-iframe" className="font-normal cursor-pointer">Embedded (iframe)</Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">New Tab opens the link in a separate browser tab. Embedded displays the link within the app.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddLink(null); setNewLinkLabel(""); setNewLinkUrl(""); setNewLinkOpenMode("newTab"); }}>Cancel</Button>
            <Button onClick={() => showAddLink && addCustomLink(showAddLink)} disabled={!newLinkLabel.trim() || !newLinkUrl.trim()} data-testid="button-confirm-add-link">Add Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingLink} onOpenChange={(open) => { if (!open) { setEditingLink(null); setNewLinkLabel(""); setNewLinkUrl(""); setNewLinkOpenMode("newTab"); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Custom Link</DialogTitle>
            <DialogDescription>Update the link details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-link-label">Label</Label>
              <Input 
                id="edit-link-label" 
                value={newLinkLabel} 
                onChange={(e) => setNewLinkLabel(e.target.value)}
                data-testid="input-edit-link-label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-link-url">URL</Label>
              <Input 
                id="edit-link-url" 
                value={newLinkUrl} 
                onChange={(e) => setNewLinkUrl(e.target.value)}
                data-testid="input-edit-link-url"
              />
            </div>
            <div className="space-y-2">
              <Label>Open Mode</Label>
              <RadioGroup 
                value={newLinkOpenMode} 
                onValueChange={(value: "newTab" | "iframe") => setNewLinkOpenMode(value)}
                className="flex gap-4"
                data-testid="radio-edit-link-open-mode"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="newTab" id="edit-mode-newtab" data-testid="radio-edit-newtab" />
                  <Label htmlFor="edit-mode-newtab" className="font-normal cursor-pointer">New Tab</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="iframe" id="edit-mode-iframe" data-testid="radio-edit-iframe" />
                  <Label htmlFor="edit-mode-iframe" className="font-normal cursor-pointer">Embedded (iframe)</Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">New Tab opens the link in a separate browser tab. Embedded displays the link within the app.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingLink(null); setNewLinkLabel(""); setNewLinkUrl(""); setNewLinkOpenMode("newTab"); }}>Cancel</Button>
            <Button onClick={updateCustomLink} disabled={!newLinkLabel.trim() || !newLinkUrl.trim()} data-testid="button-confirm-edit-link">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ALL_GRID_COLUMNS = [
  { id: "name", label: "Name" },
  { id: "projectCode", label: "Project Code" },
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "health", label: "Health" },
  { id: "billableStatus", label: "Billable Status" },
  { id: "portfolio", label: "Portfolio" },
  { id: "startDate", label: "Start Date" },
  { id: "endDate", label: "End Date" },
  { id: "baselineStartDate", label: "Baseline Start" },
  { id: "baselineEndDate", label: "Baseline End" },
  { id: "actualStartDate", label: "Actual Start" },
  { id: "actualEndDate", label: "Actual End" },
  { id: "budget", label: "Budget" },
  { id: "actualCost", label: "Actual Cost" },
  { id: "forecastCost", label: "Forecast Cost" },
  { id: "costVariance", label: "Cost Variance" },
  { id: "scheduleVariance", label: "Schedule Variance" },
  { id: "completion", label: "Completion %" },
  { id: "projectType", label: "Project Type" },
  { id: "methodology", label: "Methodology" },
  { id: "department", label: "Department" },
  { id: "category", label: "Category" },
  { id: "businessValue", label: "Business Value" },
  { id: "riskLevel", label: "Risk Level" },
  { id: "source", label: "Source" },
  { id: "owner", label: "Manager" },
  { id: "createdAt", label: "Created Date" },
  { id: "description", label: "Description" },
];

interface SystemProjectView {
  id: number;
  organizationId: number;
  mode: string;
  name: string;
  description: string | null;
  visibleColumns: string[];
  columnOrder: string[] | null;
  columnWidths: Record<string, number> | null;
  filterCriteria: Record<string, unknown> | null;
  isActive: boolean;
  displayOrder: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function SystemViewsSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingView, setEditingView] = useState<SystemProjectView | null>(null);
  const [viewToDelete, setViewToDelete] = useState<SystemProjectView | null>(null);
  
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formMode, setFormMode] = useState<"grid" | "gantt">("grid");
  const [formVisibleColumns, setFormVisibleColumns] = useState<string[]>(["name", "status", "priority", "health", "portfolio", "startDate", "endDate", "completion"]);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formDisplayOrder, setFormDisplayOrder] = useState(0);

  const { data: systemViews = [], isLoading } = useQuery<SystemProjectView[]>({
    queryKey: ['/api/organizations', organizationId, 'system-project-views', 'all'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { mode: string; name: string; description: string | null; visibleColumns: string[]; isActive: boolean; displayOrder: number }) => {
      return await apiRequest('POST', `/api/organizations/${organizationId}/system-project-views`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'system-project-views'] });
      toast({ title: "System View Created", description: "The new system view has been created successfully." });
      resetForm();
      setShowCreateDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<SystemProjectView> }) => {
      return await apiRequest('PATCH', `/api/system-project-views/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'system-project-views'] });
      toast({ title: "System View Updated", description: "The system view has been updated successfully." });
      resetForm();
      setEditingView(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/system-project-views/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'system-project-views'] });
      toast({ title: "System View Deleted", description: "The system view has been deleted." });
      setViewToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormMode("grid");
    setFormVisibleColumns(["name", "status", "priority", "health", "portfolio", "startDate", "endDate", "completion"]);
    setFormIsActive(true);
    setFormDisplayOrder(0);
  };

  const openEditDialog = (view: SystemProjectView) => {
    setEditingView(view);
    setFormName(view.name);
    setFormDescription(view.description || "");
    setFormMode(view.mode as "grid" | "gantt");
    setFormVisibleColumns(view.visibleColumns);
    setFormIsActive(view.isActive);
    setFormDisplayOrder(view.displayOrder);
  };

  const handleCreate = () => {
    if (!formName.trim()) {
      toast({ title: "Error", description: "View name is required", variant: "destructive" });
      return;
    }
    if (formVisibleColumns.length === 0) {
      toast({ title: "Error", description: "At least one column must be selected", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      mode: formMode,
      name: formName.trim(),
      description: formDescription.trim() || null,
      visibleColumns: formVisibleColumns,
      isActive: formIsActive,
      displayOrder: formDisplayOrder,
    });
  };

  const handleUpdate = () => {
    if (!editingView) return;
    if (!formName.trim()) {
      toast({ title: "Error", description: "View name is required", variant: "destructive" });
      return;
    }
    if (formVisibleColumns.length === 0) {
      toast({ title: "Error", description: "At least one column must be selected", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editingView.id,
      data: {
        name: formName.trim(),
        description: formDescription.trim() || null,
        visibleColumns: formVisibleColumns,
        isActive: formIsActive,
        displayOrder: formDisplayOrder,
      }
    });
  };

  const toggleColumn = (columnId: string) => {
    setFormVisibleColumns(prev =>
      prev.includes(columnId)
        ? prev.filter(c => c !== columnId)
        : [...prev, columnId]
    );
  };

  const gridViews = systemViews.filter(v => v.mode === 'grid');
  const ganttViews = systemViews.filter(v => v.mode === 'gantt');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Columns className="h-5 w-5" />
              System Views
            </CardTitle>
            <CardDescription>
              Configure organization-wide views that are available to all members. System views appear in the view selector with a building icon to distinguish them from personal views.
            </CardDescription>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-system-view">
            <Plus className="h-4 w-4 mr-2" />
            Add View
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : systemViews.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Columns className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No system views configured yet.</p>
              <p className="text-sm">Create a system view to provide standardized project views for all organization members.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {gridViews.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4" />
                    Grid Views ({gridViews.length})
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Columns</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gridViews.map(view => (
                        <TableRow key={view.id}>
                          <TableCell className="font-medium">{view.name}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">{view.description || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{view.visibleColumns.length} columns</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={view.isActive ? "default" : "secondary"}>
                              {view.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(view)} data-testid={`button-edit-system-view-${view.id}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setViewToDelete(view)} data-testid={`button-delete-system-view-${view.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {ganttViews.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Gantt Views ({ganttViews.length})
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Columns</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ganttViews.map(view => (
                        <TableRow key={view.id}>
                          <TableCell className="font-medium">{view.name}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">{view.description || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{view.visibleColumns.length} columns</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={view.isActive ? "default" : "secondary"}>
                              {view.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(view)} data-testid={`button-edit-system-view-${view.id}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setViewToDelete(view)} data-testid={`button-delete-system-view-${view.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create System View</DialogTitle>
            <DialogDescription>
              Create a new organization-wide view that will be available to all members.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="view-name">View Name</Label>
                <Input
                  id="view-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Executive Summary"
                  data-testid="input-system-view-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="view-mode">View Mode</Label>
                <Select value={formMode} onValueChange={(val) => setFormMode(val as "grid" | "gantt")}>
                  <SelectTrigger data-testid="select-system-view-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grid">Grid View</SelectItem>
                    <SelectItem value="gantt">Gantt View</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="view-description">Description (optional)</Label>
              <Textarea
                id="view-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Describe what this view is for..."
                rows={2}
                data-testid="input-system-view-description"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="view-active"
                  checked={formIsActive}
                  onCheckedChange={setFormIsActive}
                  data-testid="switch-system-view-active"
                />
                <Label htmlFor="view-active">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="view-order">Display Order:</Label>
                <Input
                  id="view-order"
                  type="number"
                  value={formDisplayOrder}
                  onChange={(e) => setFormDisplayOrder(parseInt(e.target.value) || 0)}
                  className="w-20"
                  data-testid="input-system-view-order"
                />
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Visible Columns ({formVisibleColumns.length} selected)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto p-2 border rounded-md">
                {ALL_GRID_COLUMNS.map(col => (
                  <div key={col.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`col-${col.id}`}
                      checked={formVisibleColumns.includes(col.id)}
                      onCheckedChange={() => toggleColumn(col.id)}
                      data-testid={`checkbox-column-${col.id}`}
                    />
                    <Label htmlFor={`col-${col.id}`} className="text-sm cursor-pointer">{col.label}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-confirm-create-system-view">
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingView} onOpenChange={(open) => { if (!open) { setEditingView(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit System View</DialogTitle>
            <DialogDescription>
              Update this organization-wide view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-view-name">View Name</Label>
                <Input
                  id="edit-view-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Executive Summary"
                  data-testid="input-edit-system-view-name"
                />
              </div>
              <div className="space-y-2">
                <Label>View Mode</Label>
                <Input value={editingView?.mode === 'grid' ? 'Grid View' : 'Gantt View'} disabled />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-view-description">Description (optional)</Label>
              <Textarea
                id="edit-view-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Describe what this view is for..."
                rows={2}
                data-testid="input-edit-system-view-description"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-view-active"
                  checked={formIsActive}
                  onCheckedChange={setFormIsActive}
                  data-testid="switch-edit-system-view-active"
                />
                <Label htmlFor="edit-view-active">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="edit-view-order">Display Order:</Label>
                <Input
                  id="edit-view-order"
                  type="number"
                  value={formDisplayOrder}
                  onChange={(e) => setFormDisplayOrder(parseInt(e.target.value) || 0)}
                  className="w-20"
                  data-testid="input-edit-system-view-order"
                />
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Visible Columns ({formVisibleColumns.length} selected)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto p-2 border rounded-md">
                {ALL_GRID_COLUMNS.map(col => (
                  <div key={col.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`edit-col-${col.id}`}
                      checked={formVisibleColumns.includes(col.id)}
                      onCheckedChange={() => toggleColumn(col.id)}
                      data-testid={`checkbox-edit-column-${col.id}`}
                    />
                    <Label htmlFor={`edit-col-${col.id}`} className="text-sm cursor-pointer">{col.label}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingView(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} data-testid="button-confirm-edit-system-view">
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!viewToDelete} onOpenChange={(open) => { if (!open) setViewToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete System View</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the "{viewToDelete?.name}" view? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => viewToDelete && deleteMutation.mutate(viewToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-system-view"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IntakeWorkflowSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [editingStep, setEditingStep] = useState<IntakeWorkflowStep | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editHelpText, setEditHelpText] = useState("");
  const [editRequiredFields, setEditRequiredFields] = useState<string[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepKey, setNewStepKey] = useState("");
  const [newStepLabel, setNewStepLabel] = useState("");
  const [newStepDescription, setNewStepDescription] = useState("");
  const [stepToDelete, setStepToDelete] = useState<IntakeWorkflowStep | null>(null);

  const { data: workflowSteps, isLoading } = useQuery<IntakeWorkflowStep[]>({
    queryKey: ['/api/organizations', organizationId, 'intake-workflow'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/intake-workflow`);
      if (!res.ok) return [];
      return res.json();
    }
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: async (steps: Partial<IntakeWorkflowStep>[]) => {
      return apiRequest('PUT', `/api/organizations/${organizationId}/intake-workflow`, { steps });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'intake-workflow'] });
      toast({ title: "Saved", description: "Workflow configuration updated" });
      setEditingStep(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update workflow", variant: "destructive" });
    }
  });

  const resetWorkflowMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/organizations/${organizationId}/intake-workflow/reset`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'intake-workflow'] });
      toast({ title: "Reset", description: "Workflow restored to default configuration" });
      setShowResetConfirm(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset workflow", variant: "destructive" });
    }
  });

  const openEditDialog = (step: IntakeWorkflowStep) => {
    setEditingStep(step);
    setEditLabel(step.label);
    setEditDescription(step.description || "");
    setEditHelpText(step.helpText || "");
    setEditRequiredFields(step.requiredFields || []);
  };

  const handleSaveStep = () => {
    if (!editingStep || !workflowSteps) return;
    
    const updatedSteps = workflowSteps.map(s => {
      if (s.stepKey === editingStep.stepKey) {
        return {
          stepKey: s.stepKey,
          position: s.position,
          label: editLabel,
          description: editDescription,
          helpText: editHelpText,
          requiredFields: editRequiredFields,
          isActive: s.isActive,
        };
      }
      return {
        stepKey: s.stepKey,
        position: s.position,
        label: s.label,
        description: s.description,
        helpText: s.helpText,
        requiredFields: s.requiredFields,
        isActive: s.isActive,
      };
    });
    
    updateWorkflowMutation.mutate(updatedSteps);
  };

  const toggleRequiredField = (fieldKey: string) => {
    setEditRequiredFields(prev => 
      prev.includes(fieldKey) 
        ? prev.filter(f => f !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  const handleAddStep = () => {
    if (!newStepLabel.trim() || !workflowSteps) return;
    
    const stepKey = newStepKey.trim() || `custom_${Date.now()}`;
    const maxPosition = Math.max(...workflowSteps.map(s => s.position), -1);
    
    const newStep = {
      stepKey,
      position: maxPosition + 1,
      label: newStepLabel.trim(),
      description: newStepDescription.trim() || undefined,
      helpText: undefined,
      requiredFields: [],
      isActive: true,
    };
    
    const updatedSteps = [
      ...workflowSteps.map(s => ({
        stepKey: s.stepKey,
        position: s.position,
        label: s.label,
        description: s.description,
        helpText: s.helpText,
        requiredFields: s.requiredFields,
        isActive: s.isActive,
      })),
      newStep
    ];
    
    updateWorkflowMutation.mutate(updatedSteps);
    setShowAddStep(false);
    setNewStepKey("");
    setNewStepLabel("");
    setNewStepDescription("");
  };

  const handleDeleteStep = () => {
    if (!stepToDelete || !workflowSteps) return;
    
    const updatedSteps = workflowSteps
      .filter(s => s.stepKey !== stepToDelete.stepKey)
      .map((s, idx) => ({
        stepKey: s.stepKey,
        position: idx,
        label: s.label,
        description: s.description,
        helpText: s.helpText,
        requiredFields: s.requiredFields,
        isActive: s.isActive,
      }));
    
    updateWorkflowMutation.mutate(updatedSteps);
    setStepToDelete(null);
  };

  const handleToggleActive = (step: IntakeWorkflowStep) => {
    if (!workflowSteps) return;
    
    const updatedSteps = workflowSteps.map(s => ({
      stepKey: s.stepKey,
      position: s.position,
      label: s.label,
      description: s.description,
      helpText: s.helpText,
      requiredFields: s.requiredFields,
      isActive: s.stepKey === step.stepKey ? !s.isActive : s.isActive,
    }));
    
    updateWorkflowMutation.mutate(updatedSteps);
  };

  const handleMoveStep = (step: IntakeWorkflowStep, direction: 'up' | 'down') => {
    if (!workflowSteps) return;
    
    const sorted = [...workflowSteps].sort((a, b) => a.position - b.position);
    const currentIndex = sorted.findIndex(s => s.stepKey === step.stepKey);
    
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === sorted.length - 1) return;
    
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    [sorted[currentIndex], sorted[swapIndex]] = [sorted[swapIndex], sorted[currentIndex]];
    
    const updatedSteps = sorted.map((s, idx) => ({
      stepKey: s.stepKey,
      position: idx,
      label: s.label,
      description: s.description,
      helpText: s.helpText,
      requiredFields: s.requiredFields,
      isActive: s.isActive,
    }));
    
    updateWorkflowMutation.mutate(updatedSteps);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const sortedSteps = [...(workflowSteps || [])].sort((a, b) => a.position - b.position);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Intake Workflow Configuration
          </CardTitle>
          <CardDescription>
            Customize the intake workflow steps and required fields for your organization
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowAddStep(true)}
            data-testid="button-add-step"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Step
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetConfirm(true)}
            data-testid="button-reset-workflow"
          >
            <RotateCw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sortedSteps.map((step, index) => (
            <div
              key={step.stepKey}
              className={`flex items-center justify-between p-4 rounded-lg border hover-elevate ${step.isActive === false ? 'opacity-50' : ''}`}
              data-testid={`workflow-step-${step.stepKey}`}
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveStep(step, 'up')}
                    disabled={index === 0 || updateWorkflowMutation.isPending}
                    data-testid={`button-move-up-${step.stepKey}`}
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveStep(step, 'down')}
                    disabled={index === sortedSteps.length - 1 || updateWorkflowMutation.isPending}
                    data-testid={`button-move-down-${step.stepKey}`}
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Button>
                </div>
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-medium text-sm">
                  {index + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{step.label}</span>
                    {step.isActive === false && (
                      <Badge variant="outline" className="text-xs">Disabled</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {step.description || "No description"}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {step.requiredFields && step.requiredFields.length > 0 ? (
                      step.requiredFields.map(field => {
                        const fieldInfo = AVAILABLE_INTAKE_FIELDS.find(f => f.key === field);
                        return (
                          <Badge key={field} variant="secondary" className="text-xs">
                            {fieldInfo?.label || field}
                          </Badge>
                        );
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground">No required fields</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={step.isActive !== false}
                  onCheckedChange={() => handleToggleActive(step)}
                  disabled={updateWorkflowMutation.isPending}
                  data-testid={`switch-step-active-${step.stepKey}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEditDialog(step)}
                  data-testid={`button-edit-step-${step.stepKey}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStepToDelete(step)}
                  disabled={updateWorkflowMutation.isPending}
                  data-testid={`button-delete-step-${step.stepKey}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={editingStep !== null} onOpenChange={() => setEditingStep(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Workflow Step</DialogTitle>
            <DialogDescription>
              Customize the step name and required fields. Step key: {editingStep?.stepKey}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Step Name</Label>
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Enter step name"
                data-testid="input-step-label"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Brief description of this step"
                className="resize-none"
                data-testid="input-step-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Help Text</Label>
              <Textarea
                value={editHelpText}
                onChange={(e) => setEditHelpText(e.target.value)}
                placeholder="Additional guidance for users"
                className="resize-none"
                data-testid="input-step-helptext"
              />
            </div>
            <div className="space-y-2">
              <Label>Required Fields</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Select which fields must be completed before advancing past this step
              </p>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {AVAILABLE_INTAKE_FIELDS.map(field => (
                  <div 
                    key={field.key} 
                    className="flex items-center space-x-2"
                    data-testid={`checkbox-field-${field.key}`}
                  >
                    <Checkbox
                      id={`field-${field.key}`}
                      checked={editRequiredFields.includes(field.key)}
                      onCheckedChange={() => toggleRequiredField(field.key)}
                    />
                    <label
                      htmlFor={`field-${field.key}`}
                      className="text-sm cursor-pointer"
                    >
                      {field.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStep(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveStep} 
              disabled={updateWorkflowMutation.isPending}
              data-testid="button-save-step"
            >
              {updateWorkflowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Workflow to Defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore all workflow steps to their default names and required fields. 
              Your customizations will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetWorkflowMutation.mutate()}
              disabled={resetWorkflowMutation.isPending}
            >
              {resetWorkflowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reset to Defaults
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Step Dialog */}
      <Dialog open={showAddStep} onOpenChange={setShowAddStep}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Workflow Step</DialogTitle>
            <DialogDescription>
              Create a new step in your intake workflow
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Step Name *</Label>
              <Input
                value={newStepLabel}
                onChange={(e) => setNewStepLabel(e.target.value)}
                placeholder="e.g., Security Review"
                data-testid="input-new-step-label"
              />
            </div>
            <div className="space-y-2">
              <Label>Step Key (optional)</Label>
              <Input
                value={newStepKey}
                onChange={(e) => setNewStepKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                placeholder="e.g., security_review"
                data-testid="input-new-step-key"
              />
              <p className="text-xs text-muted-foreground">
                A unique identifier for this step. Leave blank to auto-generate.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newStepDescription}
                onChange={(e) => setNewStepDescription(e.target.value)}
                placeholder="Brief description of this step"
                className="resize-none"
                data-testid="input-new-step-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStep(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddStep} 
              disabled={!newStepLabel.trim() || updateWorkflowMutation.isPending}
              data-testid="button-confirm-add-step"
            >
              {updateWorkflowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Step Confirmation */}
      <AlertDialog open={stepToDelete !== null} onOpenChange={() => setStepToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow Step?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{stepToDelete?.label}" from the workflow? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStep}
              disabled={updateWorkflowMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {updateWorkflowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Step
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

// Common public email domains to exclude from corporate filtering
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

function MembersSection({ organizationId, orgName }: { organizationId: number; orgName: string }) {
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

  // Access requests query
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
      
      // Only close dialog and clear form if all invites succeeded with no errors
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
        // All were skipped (already exists)
        toast({ 
          title: "No New Invites", 
          description: "All emails already have pending invites or are members"
        });
        setIsInviteOpen(false);
        setInviteEmails("");
        setInviteRole("member");
        setInviteResult(null);
      }
      // If there are errors, keep dialog open so user can see the result
    },
    onError: async (error: Error & { limitExceeded?: boolean; resourceType?: string }) => {
      // Check for seat limit exceeded - apiRequest attaches these as error properties
      if (error.limitExceeded && error.resourceType === 'seats') {
        setIsInviteOpen(false);
        setUpgradeMessage(error.message || 'You have reached your seat limit. Please upgrade your plan to invite more team members.');
        setShowUpgradeDialog(true);
        return;
      }
      
      // For other errors, show as toast
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
  
  // Get current user's email domain for corporate filtering
  const currentUserDomain = currentUser?.email ? getEmailDomain(currentUser.email) : null;
  const isCurrentUserCorporate = currentUserDomain && !isPublicEmailDomain(currentUserDomain);
  
  // Filter available users:
  // 1. Current user must have a corporate email domain to see other users
  // 2. Only show users with matching corporate domain
  // 3. Exclude users who are already members
  // 4. Exclude users with public email domains
  const availableUsers = useMemo(() => {
    // If current user doesn't have a corporate email, show empty list
    if (!isCurrentUserCorporate || !currentUserDomain) {
      return [];
    }
    
    return allUsers?.filter(u => {
      // Must not be an existing member
      if (existingMemberIds.includes(u.id)) return false;
      
      // Must have an email
      if (!u.email) return false;
      
      const userDomain = getEmailDomain(u.email);
      if (!userDomain) return false;
      
      // Must match current user's corporate domain
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
              <TableHead className="w-[100px]">Actions</TableHead>
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
        {members.length === 0 && (
          <div className="text-center py-8 text-slate-500">No members in this organization yet.</div>
        )}

        {/* Pending Invites Section */}
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

        {/* Access Requests Section */}
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

      {/* Invite by Email Dialog */}
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
            {/* Show result details if there were any issues */}
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
                  setInviteResult(null); // Clear result when user edits
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

interface AICostsData {
  aiDemoDataGeneration: { creditCost: number; description: string; canAfford: boolean };
  credits: { used: number; remaining: number | null; limit: number | null };
  canAfford: boolean;
}

function DemoDataSection({ organizationId, orgName }: { organizationId: number; orgName: string }) {
  const { toast } = useToast();
  const [customIndustry, setCustomIndustry] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("");
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Not Supported",
        description: "Voice input is not supported in this browser. Try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      toast({
        title: "Voice Error",
        description: "Could not capture voice. Please try again.",
        variant: "destructive",
      });
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setCustomIndustry(transcript);
      setSelectedIndustry("");
    };

    recognition.start();
  };

  const { data: industries } = useQuery<Array<{ id: string; label: string; description: string }>>({
    queryKey: ['/api/demo-data/industries'],
  });
  
  // Fetch AI costs for credit warning when custom industry is used
  const { data: aiCosts } = useQuery<AICostsData>({
    queryKey: ['/api/billing/ai-costs'],
    enabled: !!customIndustry.trim(),
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { organizationId: number; industry?: string; customIndustry?: string }) => {
      return apiRequest('POST', '/api/demo-data/generate', data);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/intakes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
      const stats = response.stats || {};
      const parts = [];
      if (stats.portfolios) parts.push(`${stats.portfolios} portfolios`);
      if (stats.projects) parts.push(`${stats.projects} projects`);
      if (stats.intakes) parts.push(`${stats.intakes} intakes`);
      if (stats.resources) parts.push(`${stats.resources} resources`);
      toast({
        title: "Demo Data Generated",
        description: parts.length > 0 ? `Created ${parts.join(', ')} for ${orgName}` : `Demo data created for ${orgName}`,
      });
      setCustomIndustry("");
      setSelectedIndustry("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate demo data",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/demo-data/${organizationId}`);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/intakes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
      const stats = response.stats || {};
      const parts = [];
      if (stats.portfolios) parts.push(`${stats.portfolios} portfolios`);
      if (stats.projects) parts.push(`${stats.projects} projects`);
      if (stats.intakes) parts.push(`${stats.intakes} intakes`);
      if (stats.resources) parts.push(`${stats.resources} resources`);
      toast({
        title: "Demo Data Removed",
        description: parts.length > 0 ? `Removed ${parts.join(', ')} from ${orgName}` : `Demo data removed from ${orgName}`,
      });
      setShowRemoveConfirm(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove demo data",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (customIndustry.trim()) {
      generateMutation.mutate({ organizationId, customIndustry: customIndustry.trim() });
    } else if (selectedIndustry) {
      generateMutation.mutate({ organizationId, industry: selectedIndustry });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Generate Demo Data
        </CardTitle>
        <CardDescription>
          Create sample portfolios, projects, tasks, risks, milestones, and issues to explore the application.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customIndustry">Industry / Business Type</Label>
            <div className="flex gap-2">
              <Input
                id="customIndustry"
                placeholder="e.g., Real Estate, Construction, Legal Services, Education..."
                value={customIndustry}
                onChange={(e) => {
                  setCustomIndustry(e.target.value);
                  if (e.target.value) setSelectedIndustry("");
                }}
                className="flex-1"
                data-testid="input-custom-industry"
              />
              <Button
                type="button"
                variant={isListening ? "default" : "outline"}
                size="icon"
                onClick={handleVoiceInput}
                disabled={isListening}
                title="Voice input"
                data-testid="button-voice-industry"
              >
                <Mic className={`h-4 w-4 ${isListening ? 'animate-pulse text-red-500' : ''}`} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter any industry or business type and AI will generate relevant demo data
            </p>
            {customIndustry.trim() && aiCosts && (
              <div className="flex items-center gap-2 p-3 rounded-lg border mt-2 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <div className="flex-1 text-sm">
                  <span className="text-blue-700 dark:text-blue-300">
                    Custom industry uses AI and will consume <strong>{aiCosts.aiDemoDataGeneration.creditCost}</strong> credit{aiCosts.aiDemoDataGeneration.creditCost !== 1 ? 's' : ''}.
                  </span>
                  <span className="text-muted-foreground ml-1">
                    ({aiCosts.credits.remaining !== null ? `${aiCosts.credits.remaining} remaining` : 'unlimited'})
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 border-t" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="flex-1 border-t" />
          </div>

          <div className="space-y-2">
            <Label>Choose from Templates</Label>
            <Select 
              value={selectedIndustry} 
              onValueChange={(val) => {
                setSelectedIndustry(val);
                if (val) setCustomIndustry("");
              }}
            >
              <SelectTrigger data-testid="select-industry">
                <SelectValue placeholder="Select an industry template" />
              </SelectTrigger>
              <SelectContent>
                {industries?.map((ind) => (
                  <SelectItem key={ind.id} value={ind.id}>
                    {ind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <h4 className="font-medium text-sm">What will be created:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>2 Portfolios with descriptions</li>
            <li>4-6 Projects with budgets, statuses, and health indicators</li>
            <li>Tasks, Risks, Milestones, and Issues for each project</li>
            <li>Financial line items with budget vs actual tracking</li>
            <li>4 Intake pipeline items with various workflow statuses</li>
            <li>5 Resources with skills and departments</li>
          </ul>
        </div>

        <Button 
          onClick={handleGenerate}
          disabled={generateMutation.isPending || (!customIndustry.trim() && !selectedIndustry)}
          className="w-full"
          data-testid="button-generate-demo"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Demo Data
            </>
          )}
        </Button>

        <div className="border-t pt-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-sm">Remove Demo Data</h4>
              <p className="text-xs text-muted-foreground">
                Delete all demo portfolios, projects, and related items
              </p>
            </div>
            <Button 
              variant="destructive"
              onClick={() => setShowRemoveConfirm(true)}
              disabled={removeMutation.isPending}
              data-testid="button-remove-demo"
            >
              {removeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove Demo Data
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Demo Data</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove all demo data from {orgName}? This will delete all demo portfolios, projects, tasks, risks, milestones, issues, intakes, resources, and financial records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveConfirm(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              data-testid="button-confirm-remove-demo"
            >
              {removeMutation.isPending ? "Removing..." : "Remove All Demo Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Single Select" },
  { value: "multiselect", label: "Multi Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "URL" },
] as const;

function CustomFieldsSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const { data: fields = [], isLoading } = useCustomFieldDefinitions(organizationId);
  const createMutation = useCreateCustomFieldDefinition();
  const updateMutation = useUpdateCustomFieldDefinition();
  const deleteMutation = useDeleteCustomFieldDefinition();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  const [deleteField, setDeleteField] = useState<CustomFieldDefinition | null>(null);

  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<string>("text");
  const [description, setDescription] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [options, setOptions] = useState("");

  const resetForm = () => {
    setName("");
    setFieldType("text");
    setDescription("");
    setIsRequired(false);
    setOptions("");
    setEditingField(null);
  };

  const openEditDialog = (field: CustomFieldDefinition) => {
    setEditingField(field);
    setName(field.name);
    setFieldType(field.fieldType);
    setDescription(field.description || "");
    setIsRequired(field.isRequired ?? false);
    setOptions(field.options ? (field.options as string[]).join(", ") : "");
    setShowAddDialog(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Error", description: "Field name is required", variant: "destructive" });
      return;
    }

    const optionsArray = (fieldType === "select" || fieldType === "multiselect") && options.trim()
      ? options.split(",").map(o => o.trim()).filter(Boolean)
      : null;

    try {
      if (editingField) {
        await updateMutation.mutateAsync({
          id: editingField.id,
          organizationId,
          name: name.trim(),
          fieldType,
          description: description.trim() || null,
          isRequired,
          options: optionsArray,
        });
        toast({ title: "Success", description: "Custom field updated" });
      } else {
        await createMutation.mutateAsync({
          organizationId,
          name: name.trim(),
          fieldType,
          description: description.trim() || null,
          isRequired,
          options: optionsArray,
          displayOrder: fields.length,
        });
        toast({ title: "Success", description: "Custom field created" });
      }
      setShowAddDialog(false);
      resetForm();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save custom field", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteField) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteField.id, organizationId });
      toast({ title: "Deleted", description: "Custom field removed" });
      setDeleteField(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete custom field", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Custom Fields
          </CardTitle>
          <CardDescription>
            Define custom fields that can be added to projects in your organization
          </CardDescription>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowAddDialog(true);
          }}
          data-testid="button-add-custom-field"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Field
        </Button>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No custom fields defined yet</p>
            <p className="text-sm">Add custom fields to capture additional information on projects</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field) => (
                <TableRow key={field.id} data-testid={`row-custom-field-${field.id}`}>
                  <TableCell className="font-medium">{field.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {FIELD_TYPES.find(t => t.value === field.fieldType)?.label || field.fieldType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {field.isRequired ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                    {field.description || "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(field)}
                        data-testid={`button-edit-field-${field.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteField(field)}
                        data-testid={`button-delete-field-${field.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showAddDialog} onOpenChange={(open) => {
        if (!open) resetForm();
        setShowAddDialog(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingField ? "Edit Custom Field" : "Add Custom Field"}</DialogTitle>
            <DialogDescription>
              {editingField ? "Update the custom field settings" : "Create a new custom field for projects"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="field-name">Field Name *</Label>
              <Input
                id="field-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Business Unit"
                data-testid="input-field-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-type">Field Type</Label>
              <Select value={fieldType} onValueChange={setFieldType}>
                <SelectTrigger id="field-type" data-testid="select-field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(fieldType === "select" || fieldType === "multiselect") && (
              <div className="space-y-2">
                <Label htmlFor="field-options">Options (comma-separated)</Label>
                <Input
                  id="field-options"
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                  placeholder="Option 1, Option 2, Option 3"
                  data-testid="input-field-options"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="field-description">Description</Label>
              <Input
                id="field-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                data-testid="input-field-description"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="field-required"
                checked={isRequired}
                onCheckedChange={(checked) => setIsRequired(checked === true)}
                data-testid="checkbox-field-required"
              />
              <Label htmlFor="field-required" className="cursor-pointer">
                Required field
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddDialog(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-field"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingField ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteField} onOpenChange={(open) => !open && setDeleteField(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom Field</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteField?.name}"? This will remove this field from all projects and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-field"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CustomTabsSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const { data: tabs = [], isLoading } = useCustomProjectTabs(organizationId);
  const { data: projectFields = [] } = useProjectFieldDefinitions();
  const { data: customFields = [] } = useCustomFieldDefinitions(organizationId);
  const createTab = useCreateCustomTab();
  const updateTab = useUpdateCustomTab();
  const deleteTab = useDeleteCustomTab();
  const createSection = useCreateCustomTabSection();
  const updateSection = useUpdateCustomTabSection();
  const deleteSection = useDeleteCustomTabSection();
  const createField = useCreateCustomTabField();
  const deleteField = useDeleteCustomTabField();
  const [showNewTabDialog, setShowNewTabDialog] = useState(false);
  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [tabName, setTabName] = useState("");
  const [tabDescription, setTabDescription] = useState("");
  const [tabIcon, setTabIcon] = useState("FileText");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tabToDelete, setTabToDelete] = useState<number | null>(null);
  const [showSectionDialog, setShowSectionDialog] = useState(false);
  const [sectionTabId, setSectionTabId] = useState<number | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [sectionColumns, setSectionColumns] = useState(2);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [fieldPickerSectionId, setFieldPickerSectionId] = useState<number | null>(null);
  const [fieldPickerTabId, setFieldPickerTabId] = useState<number | null>(null);
  const { data: fullTabData } = useFullCustomTab(editingTabId ?? undefined);

  const handleCreateTab = async () => {
    if (!tabName.trim()) {
      toast({ title: "Error", description: "Tab name is required", variant: "destructive" });
      return;
    }
    try {
      await createTab.mutateAsync({ organizationId, name: tabName, description: tabDescription, icon: tabIcon });
      toast({ title: "Success", description: "Custom tab created" });
      setShowNewTabDialog(false);
      setTabName("");
      setTabDescription("");
      setTabIcon("FileText");
    } catch (error) {
      toast({ title: "Error", description: "Failed to create tab", variant: "destructive" });
    }
  };

  const handleEditTab = (tab: CustomProjectTab) => {
    setEditingTabId(tab.id);
    setTabName(tab.name);
    setTabDescription(tab.description || "");
    setTabIcon(tab.icon || "FileText");
  };

  const handleUpdateTab = async () => {
    if (!editingTabId) return;
    try {
      await updateTab.mutateAsync({ id: editingTabId, organizationId, name: tabName, description: tabDescription, icon: tabIcon });
      toast({ title: "Success", description: "Tab updated" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to update tab", variant: "destructive" });
    }
  };

  const handleDeleteTab = async () => {
    if (!tabToDelete) return;
    try {
      await deleteTab.mutateAsync({ id: tabToDelete, organizationId });
      toast({ title: "Success", description: "Tab deleted" });
      setShowDeleteConfirm(false);
      setTabToDelete(null);
      if (editingTabId === tabToDelete) setEditingTabId(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete tab", variant: "destructive" });
    }
  };

  const handleAddSection = async () => {
    if (!sectionTabId || !sectionName.trim()) return;
    try {
      await createSection.mutateAsync({ tabId: sectionTabId, name: sectionName, columns: sectionColumns });
      toast({ title: "Success", description: "Section added" });
      setShowSectionDialog(false);
      setSectionName("");
      setSectionColumns(2);
    } catch (error) {
      toast({ title: "Error", description: "Failed to add section", variant: "destructive" });
    }
  };

  const handleDeleteSection = async (sectionId: number, tabId: number) => {
    try {
      await deleteSection.mutateAsync({ id: sectionId, tabId });
      toast({ title: "Success", description: "Section deleted" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete section", variant: "destructive" });
    }
  };

  const handleAddField = async (fieldKey: string, fieldType: string) => {
    if (!fieldPickerSectionId || !fieldPickerTabId) return;
    try {
      await createField.mutateAsync({ sectionId: fieldPickerSectionId, tabId: fieldPickerTabId, fieldKey, fieldType });
      toast({ title: "Success", description: "Field added" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to add field", variant: "destructive" });
    }
  };

  const handleRemoveField = async (fieldId: number, sectionId: number, tabId: number) => {
    try {
      await deleteField.mutateAsync({ id: fieldId, sectionId, tabId });
      toast({ title: "Success", description: "Field removed" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to remove field", variant: "destructive" });
    }
  };

  const allFields = [
    ...projectFields.map(f => ({ key: f.key, label: f.label, type: 'project' as const })),
    ...customFields.map(f => ({ key: `customField:${f.id}`, label: f.name, type: 'custom' as const }))
  ];

  if (isLoading) {
    return <Card className="p-6"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></Card>;
  }

  return (
    <Card data-testid="card-custom-tabs">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Custom Tabs
          </CardTitle>
          <CardDescription>
            Create custom tabs for project details with your own sections and fields
          </CardDescription>
        </div>
        <Button onClick={() => setShowNewTabDialog(true)} data-testid="button-add-custom-tab">
          <Plus className="h-4 w-4 mr-2" /> Add Tab
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {tabs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-custom-tabs">
            No custom tabs yet. Create one to get started.
          </div>
        ) : (
          <div className="grid gap-3">
            {tabs.map((tab) => (
              <div key={tab.id} className="border rounded-lg p-4 hover-elevate cursor-pointer" onClick={() => handleEditTab(tab)} data-testid={`card-custom-tab-${tab.id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <LayoutGrid className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{tab.name}</div>
                      {tab.description && <div className="text-sm text-muted-foreground">{tab.description}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleEditTab(tab); }} data-testid={`button-edit-tab-${tab.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setTabToDelete(tab.id); setShowDeleteConfirm(true); }} data-testid={`button-delete-tab-${tab.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showNewTabDialog} onOpenChange={setShowNewTabDialog}>
        <DialogContent data-testid="dialog-new-custom-tab">
          <DialogHeader>
            <DialogTitle>Create Custom Tab</DialogTitle>
            <DialogDescription>Add a new customizable tab to project details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tab Name</Label>
              <Input value={tabName} onChange={(e) => setTabName(e.target.value)} placeholder="e.g., My Custom View" data-testid="input-tab-name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={tabDescription} onChange={(e) => setTabDescription(e.target.value)} placeholder="What is this tab for?" data-testid="input-tab-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTabDialog(false)} data-testid="button-cancel-tab">Cancel</Button>
            <Button onClick={handleCreateTab} disabled={createTab.isPending} data-testid="button-create-tab">
              {createTab.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Tab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingTabId !== null} onOpenChange={(open) => !open && setEditingTabId(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="dialog-edit-custom-tab">
          <DialogHeader>
            <DialogTitle>Edit Tab: {tabName}</DialogTitle>
            <DialogDescription>Design your custom tab with sections and fields</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tab Name</Label>
                  <Input value={tabName} onChange={(e) => setTabName(e.target.value)} data-testid="input-edit-tab-name" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={tabDescription} onChange={(e) => setTabDescription(e.target.value)} data-testid="input-edit-tab-description" />
                </div>
              </div>
              <Button variant="outline" onClick={handleUpdateTab} disabled={updateTab.isPending} data-testid="button-save-tab">
                <Save className="h-4 w-4 mr-2" /> Save Tab Settings
              </Button>
            </div>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-4">
                <Label className="text-lg font-medium">Sections</Label>
                <Button size="sm" onClick={() => { setSectionTabId(editingTabId); setShowSectionDialog(true); }} data-testid="button-add-section">
                  <Plus className="h-4 w-4 mr-2" /> Add Section
                </Button>
              </div>
              {fullTabData?.sections.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border rounded-lg" data-testid="text-no-sections">
                  No sections yet. Add a section to organize your fields.
                </div>
              ) : (
                <div className="space-y-4">
                  {fullTabData?.sections.map((section) => (
                    <Card key={section.id} className="p-4" data-testid={`card-section-${section.id}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Columns className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{section.name}</span>
                          <Badge variant="secondary">{section.columns} col</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setFieldPickerSectionId(section.id); setFieldPickerTabId(editingTabId); setShowFieldPicker(true); }} data-testid={`button-add-field-${section.id}`}>
                            <Plus className="h-4 w-4 mr-1" /> Add Field
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => editingTabId && handleDeleteSection(section.id, editingTabId)} data-testid={`button-delete-section-${section.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {section.fields.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-2" data-testid={`text-no-fields-${section.id}`}>No fields in this section</div>
                      ) : (
                        <div className={`grid gap-2 grid-cols-${section.columns || 2}`}>
                          {section.fields.map((field) => {
                            const fieldDef = allFields.find(f => f.key === field.fieldKey);
                            return (
                              <div key={field.id} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2" data-testid={`field-${field.id}`}>
                                <span className="text-sm">{field.label || fieldDef?.label || field.fieldKey}</span>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => editingTabId && handleRemoveField(field.id, section.id, editingTabId)} data-testid={`button-remove-field-${field.id}`}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSectionDialog} onOpenChange={setShowSectionDialog}>
        <DialogContent data-testid="dialog-add-section">
          <DialogHeader>
            <DialogTitle>Add Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Section Name</Label>
              <Input value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="e.g., Budget Details" data-testid="input-section-name" />
            </div>
            <div>
              <Label>Number of Columns</Label>
              <Select value={sectionColumns.toString()} onValueChange={(v) => setSectionColumns(parseInt(v))}>
                <SelectTrigger data-testid="select-section-columns">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Column</SelectItem>
                  <SelectItem value="2">2 Columns</SelectItem>
                  <SelectItem value="3">3 Columns</SelectItem>
                  <SelectItem value="4">4 Columns</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSectionDialog(false)} data-testid="button-cancel-section">Cancel</Button>
            <Button onClick={handleAddSection} disabled={createSection.isPending} data-testid="button-create-section">
              Add Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFieldPicker} onOpenChange={setShowFieldPicker}>
        <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto" data-testid="dialog-field-picker">
          <DialogHeader>
            <DialogTitle>Add Field</DialogTitle>
            <DialogDescription>Select a field to add to the section</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Project Fields</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {projectFields.map((field) => (
                  <Button key={field.key} variant="outline" size="sm" className="justify-start" onClick={() => { handleAddField(field.key, 'project'); }} data-testid={`button-field-${field.key}`}>
                    {field.label}
                  </Button>
                ))}
              </div>
            </div>
            {customFields.length > 0 && (
              <div>
                <Label className="text-sm text-muted-foreground">Custom Fields</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {customFields.map((field) => (
                    <Button key={field.id} variant="outline" size="sm" className="justify-start" onClick={() => { handleAddField(`customField:${field.id}`, 'custom'); }} data-testid={`button-custom-field-${field.id}`}>
                      {field.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFieldPicker(false)} data-testid="button-close-field-picker">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent data-testid="dialog-confirm-delete-tab">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom Tab?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this custom tab and all its sections and fields.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-tab">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTab} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete-tab">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function RiskAssessmentConfigSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<RiskAssessmentConfig>(DEFAULT_RISK_ASSESSMENT_CONFIG);
  const [newCategory, setNewCategory] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const { data: savedConfig, isLoading } = useQuery<RiskAssessmentConfig>({
    queryKey: ['/api/organizations', organizationId, 'risk-assessment-config'],
  });

  useEffect(() => {
    if (savedConfig) {
      setConfig({ ...DEFAULT_RISK_ASSESSMENT_CONFIG, ...savedConfig });
    }
  }, [savedConfig]);

  const handleSave = async () => {
    if (config.thresholds.lowMax >= config.thresholds.mediumMax || config.thresholds.mediumMax >= config.thresholds.highMax) {
      toast({ title: "Invalid Thresholds", description: "Thresholds must be in ascending order: Low < Medium < High.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      await apiRequest("PUT", `/api/organizations/${organizationId}/risk-assessment-config`, config);
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'risk-assessment-config'] });
      toast({ title: "Saved", description: "Risk assessment configuration updated successfully." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to save configuration.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_RISK_ASSESSMENT_CONFIG);
  };

  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (config.categories.includes(trimmed)) {
      toast({ title: "Duplicate", description: "This category already exists.", variant: "destructive" });
      return;
    }
    setConfig(prev => ({ ...prev, categories: [...prev.categories, trimmed] }));
    setNewCategory("");
  };

  const handleRemoveCategory = (cat: string) => {
    setConfig(prev => ({ ...prev, categories: prev.categories.filter(c => c !== cat) }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle data-testid="text-risk-config-title">Risk Assessment Configuration</CardTitle>
            <CardDescription>Configure how AI risk assessments are generated for portfolios and projects in your organization.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-reset-risk-config">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Defaults
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving} data-testid="button-save-risk-config">
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="ai-model" data-testid="label-ai-model">AI Model</Label>
              <Select value={config.model} onValueChange={(val) => setConfig(prev => ({ ...prev, model: val as RiskAssessmentConfig["model"] }))}>
                <SelectTrigger id="ai-model" data-testid="select-ai-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o">GPT-4o (Higher quality, more credits)</SelectItem>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster, fewer credits)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Choose the AI model used for risk analysis. GPT-4o provides more detailed analysis.</p>
            </div>

            <div className="space-y-2">
              <Label data-testid="label-temperature">Temperature: {config.temperature.toFixed(2)}</Label>
              <Slider
                value={[config.temperature]}
                onValueChange={([val]) => setConfig(prev => ({ ...prev, temperature: Math.round(val * 100) / 100 }))}
                min={0}
                max={1}
                step={0.05}
                className="mt-2"
                data-testid="slider-temperature"
              />
              <p className="text-xs text-muted-foreground">Lower values produce more consistent results. Higher values produce more creative analysis.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-tokens" data-testid="label-max-tokens">Max Response Length (tokens)</Label>
              <Input
                id="max-tokens"
                type="number"
                min={500}
                max={8000}
                value={config.maxTokens}
                onChange={(e) => setConfig(prev => ({ ...prev, maxTokens: Number(e.target.value) || 3000 }))}
                data-testid="input-max-tokens"
              />
              <p className="text-xs text-muted-foreground">Maximum length of the AI response. Higher values allow more detailed reports (500-8000).</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cache-days" data-testid="label-cache-days">Cache Duration (days)</Label>
              <Input
                id="cache-days"
                type="number"
                min={1}
                max={30}
                value={config.cacheDays}
                onChange={(e) => setConfig(prev => ({ ...prev, cacheDays: Number(e.target.value) || 5 }))}
                data-testid="input-cache-days"
              />
              <p className="text-xs text-muted-foreground">Reports generated within this period will be returned from cache without using AI credits (1-30 days).</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium" data-testid="label-thresholds">Risk Score Thresholds</Label>
              <p className="text-sm text-muted-foreground mt-1">Define the score ranges for each risk level (scores are 1-100).</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="threshold-low" className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  Low (1 to)
                </Label>
                <Input
                  id="threshold-low"
                  type="number"
                  min={1}
                  max={98}
                  value={config.thresholds.lowMax}
                  onChange={(e) => setConfig(prev => ({ ...prev, thresholds: { ...prev.thresholds, lowMax: Number(e.target.value) || 25 } }))}
                  data-testid="input-threshold-low"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="threshold-medium" className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  Medium ({config.thresholds.lowMax + 1} to)
                </Label>
                <Input
                  id="threshold-medium"
                  type="number"
                  min={2}
                  max={99}
                  value={config.thresholds.mediumMax}
                  onChange={(e) => setConfig(prev => ({ ...prev, thresholds: { ...prev.thresholds, mediumMax: Number(e.target.value) || 50 } }))}
                  data-testid="input-threshold-medium"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="threshold-high" className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-orange-500" />
                  High ({config.thresholds.mediumMax + 1} to)
                </Label>
                <Input
                  id="threshold-high"
                  type="number"
                  min={3}
                  max={99}
                  value={config.thresholds.highMax}
                  onChange={(e) => setConfig(prev => ({ ...prev, thresholds: { ...prev.thresholds, highMax: Number(e.target.value) || 75 } }))}
                  data-testid="input-threshold-high"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              Critical: {config.thresholds.highMax + 1} - 100
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium" data-testid="label-categories">Risk Categories</Label>
              <p className="text-sm text-muted-foreground mt-1">Define which risk categories the AI should evaluate.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.categories.map((cat) => (
                <Badge key={cat} variant="secondary" className="gap-1 pr-1" data-testid={`badge-category-${cat.replace(/\s+/g, '-').toLowerCase()}`}>
                  {cat}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 ml-1 hover:bg-destructive/20 rounded-full"
                    onClick={() => handleRemoveCategory(cat)}
                    data-testid={`button-remove-category-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add a category..."
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                className="max-w-xs"
                data-testid="input-new-category"
              />
              <Button variant="outline" size="sm" onClick={handleAddCategory} disabled={!newCategory.trim()} data-testid="button-add-category">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="custom-instructions" className="text-base font-medium" data-testid="label-custom-instructions">Custom Instructions</Label>
            <p className="text-sm text-muted-foreground">Provide additional instructions or context for the AI risk analyst. These will be appended to every assessment.</p>
            <Textarea
              id="custom-instructions"
              placeholder="e.g., Pay special attention to regulatory compliance risks. Our organization has a low risk tolerance for budget overruns exceeding 10%."
              value={config.customInstructions}
              onChange={(e) => setConfig(prev => ({ ...prev, customInstructions: e.target.value }))}
              className="min-h-[100px]"
              maxLength={2000}
              data-testid="textarea-custom-instructions"
            />
            <p className="text-xs text-muted-foreground text-right">{config.customInstructions.length}/2000</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DeveloperSection() {
  const { toast } = useToast();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);

  const { data: apiKeyData, isLoading: apiKeyLoading, refetch: refetchApiKey } = useQuery<{
    hasApiKey: boolean;
    apiKey: string | null;
  }>({
    queryKey: ['/api/user/api-key'],
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "API key copied to clipboard",
    });
  };

  const generateApiKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/user/api-key/generate');
      return response.json();
    },
    onSuccess: (data) => {
      setNewlyGeneratedKey(data.apiKey);
      refetchApiKey();
      toast({
        title: "API Key Generated",
        description: "Your new API key has been created. Copy it now - you won't be able to see the full key again.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate API key",
        variant: "destructive",
      });
    },
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', '/api/user/api-key');
    },
    onSuccess: () => {
      refetchApiKey();
      setShowRevokeDialog(false);
      toast({
        title: "API Key Revoked",
        description: "Your API key has been revoked and is no longer valid.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to revoke API key",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            API Key Management
          </CardTitle>
          <CardDescription>
            Generate and manage API keys for external integrations like Power BI, custom scripts, or third-party tools
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border rounded-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <ShieldAlert className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Your API Key</h3>
                  <p className="text-sm text-muted-foreground">
                    Use this key to authenticate with the Analytics API endpoints
                  </p>
                </div>
              </div>
            </div>

            {apiKeyLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-api-key-loading">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : newlyGeneratedKey ? (
              <div className="space-y-3">
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                    New API Key Generated - Copy it now!
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-background rounded font-mono text-sm break-all" data-testid="text-new-api-key">
                      {newlyGeneratedKey}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(newlyGeneratedKey)}
                      data-testid="button-copy-api-key"
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    This is the only time you will see the full key. Store it securely.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setNewlyGeneratedKey(null)}
                  data-testid="button-dismiss-new-key"
                >
                  Done
                </Button>
              </div>
            ) : apiKeyData?.hasApiKey ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm" data-testid="text-masked-api-key">
                    {showApiKey ? apiKeyData.apiKey : '••••••••••••••••••••••••••••••••'}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                    data-testid="button-toggle-api-key-visibility"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Only a partial key is shown for security. Generate a new key if you need the full value.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => generateApiKeyMutation.mutate()}
                    disabled={generateApiKeyMutation.isPending}
                    data-testid="button-regenerate-api-key"
                  >
                    {generateApiKeyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Regenerate Key
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowRevokeDialog(true)}
                    data-testid="button-revoke-api-key"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Revoke Key
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  You don't have an API key yet. Generate one to start using the Analytics API.
                </p>
                <Button
                  onClick={() => generateApiKeyMutation.mutate()}
                  disabled={generateApiKeyMutation.isPending}
                  data-testid="button-generate-api-key"
                >
                  {generateApiKeyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Generate API Key
                </Button>
              </div>
            )}
          </div>

          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <h4 className="font-medium text-sm">How to use your API key</h4>
            <p className="text-sm text-muted-foreground">
              Use Basic Authentication with your email as the username and API key as the password:
            </p>
            <pre className="p-2 bg-background rounded text-xs overflow-x-auto">
              Authorization: Basic base64(email:api_key)
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            API Documentation
          </CardTitle>
          <CardDescription>
            Access interactive documentation and developer resources
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">Swagger Documentation</h3>
                <p className="text-sm text-muted-foreground">
                  Interactive API documentation. Explore and test endpoints directly.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => window.open('/api-docs', '_blank')}
              className="shrink-0"
              data-testid="button-open-api-docs"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open API Docs
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">OpenAPI Specification</h3>
                <p className="text-sm text-muted-foreground">
                  Raw OpenAPI 3.0 spec in JSON format for client generation.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => window.open('/api-docs.json', '_blank')}
              className="shrink-0"
              data-testid="button-download-openapi-spec"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Spec
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-medium">Available API Endpoints</h3>
            <p className="text-sm text-muted-foreground">
              The API provides access to all major resources. Session-based auth for web, API key for external tools.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-4">
              {[
                'Organizations', 'Portfolios', 'Projects', 'Intakes',
                'Tasks', 'Milestones', 'Risks', 'Issues',
                'Resources', 'Timesheets', 'Invoices', 'Analytics'
              ].map((endpoint) => (
                <Badge key={endpoint} variant="secondary" className="justify-center py-1">
                  {endpoint}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke your API key. Any integrations using this key will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revoke">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeApiKeyMutation.mutate()}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-revoke"
            >
              {revokeApiKeyMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IntegrationsSection({ organizationId }: { organizationId: number }) {
  return <IntegrationsPage />;
}

function ActAsSection({ organizationId }: { organizationId: number }) {
  const { user, isActingAs, realUser } = useAuth();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const { data: members, isLoading: membersLoading } = useQuery<EnrichedMember[]>({
    queryKey: [`/api/organizations/${organizationId}/members`],
  });

  const startActingAsMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      return apiRequest("POST", `/api/organizations/${organizationId}/act-as`, { targetUserId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Delegate mode activated", description: "You are now viewing the app as the selected user." });
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to start delegate mode.", variant: "destructive" });
    },
  });

  const stopActingAsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/organizations/${organizationId}/act-as`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Delegate mode ended", description: "You are back to your own account." });
      window.location.reload();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to exit delegate mode.", variant: "destructive" });
    },
  });

  const currentUserId = isActingAs ? realUser?.id : user?.id;
  const selectableMembers = members?.filter(m => m.user && m.userId !== currentUserId) || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Act As User (Delegate Mode)
          </CardTitle>
          <CardDescription>
            Temporarily view the application as another user to troubleshoot permissions, verify access, or help resolve issues they are experiencing. 
            All pages, dashboards, and data will reflect the selected user's view.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isActingAs && realUser ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <UserCheck className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <div className="text-sm">
                  <span className="text-amber-700 dark:text-amber-400">
                    You are currently viewing as <strong>{user?.firstName || user?.username || user?.email}</strong>.
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => stopActingAsMutation.mutate()}
                disabled={stopActingAsMutation.isPending}
                data-testid="button-stop-acting-as"
              >
                {stopActingAsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Exit Delegate Mode
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="act-as-user">Select a user to act as</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="mt-1.5" data-testid="select-act-as-user">
                    <SelectValue placeholder={membersLoading ? "Loading members..." : "Choose a team member..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableMembers.map((member) => (
                      <SelectItem key={member.userId} value={member.userId} data-testid={`option-user-${member.userId}`}>
                        <div className="flex items-center gap-2">
                          <span>{member.user?.firstName || member.user?.username || member.user?.email}</span>
                          {member.user?.lastName && <span>{member.user.lastName}</span>}
                          <span className="text-muted-foreground text-xs">({member.role})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>While in delegate mode, you will see exactly what the selected user sees. A banner will be shown at the top of every page. Any changes you make will still be logged under your admin account for audit purposes.</span>
              </div>

              <Button
                onClick={() => {
                  if (selectedUserId) {
                    startActingAsMutation.mutate(selectedUserId);
                  }
                }}
                disabled={!selectedUserId || startActingAsMutation.isPending}
                data-testid="button-start-acting-as"
              >
                {startActingAsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Start Acting As User
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
