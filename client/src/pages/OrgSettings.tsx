import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, UserPlus, Trash2, Settings, Users, ShieldAlert, RotateCcw, Folder, FileText, Target, Flag, AlertCircle, CheckSquare, LayoutDashboard, Briefcase, FolderKanban, FileInput, CircleDot, Calendar, Plug, EyeOff, Eye, GitBranch, Save, RotateCw, GripVertical, Pencil, X, Plus, Check, ChevronUp, ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AVAILABLE_INTAKE_FIELDS } from "@/hooks/use-intake-workflow";
import type { Organization, OrganizationMember, User, RecycleBinItem, RecycleBinItemType, IntakeWorkflowStep } from "@shared/schema";

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

      <Tabs defaultValue="modules" orientation="vertical" className="flex gap-6">
        <TabsList className="flex-col h-fit w-56 bg-card border rounded-lg p-1">
          <TabsTrigger value="modules" className="w-full justify-start gap-3" data-testid="nav-modules">
            <Eye className="h-4 w-4" />
            Module Visibility
          </TabsTrigger>
          <TabsTrigger value="intake" className="w-full justify-start gap-3" data-testid="nav-intake">
            <GitBranch className="h-4 w-4" />
            Intake Workflow
          </TabsTrigger>
          <TabsTrigger value="members" className="w-full justify-start gap-3" data-testid="nav-members">
            <Users className="h-4 w-4" />
            Team Members
          </TabsTrigger>
          <TabsTrigger value="recycle" className="w-full justify-start gap-3" data-testid="nav-recycle">
            <Trash2 className="h-4 w-4" />
            Recycle Bin
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-w-0">
          <TabsContent value="modules" className="mt-0">
            {orgId && currentOrg && <ModuleVisibilitySection organization={currentOrg} />}
          </TabsContent>
          <TabsContent value="intake" className="mt-0">
            {orgId && <IntakeWorkflowSection organizationId={orgId} />}
          </TabsContent>
          <TabsContent value="members" className="mt-0">
            {orgId && <MembersSection organizationId={orgId} orgName={currentOrg?.name || ''} />}
          </TabsContent>
          <TabsContent value="recycle" className="mt-0">
            {orgId && <RecycleBinSection organizationId={orgId} />}
          </TabsContent>
        </div>
      </Tabs>
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
  const moduleOrder = organization.moduleOrder || availableModules.map(m => m.key);
  
  const orderedModules = [...availableModules].sort((a, b) => {
    const aIndex = moduleOrder.indexOf(a.key);
    const bIndex = moduleOrder.indexOf(b.key);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
  
  const updateOrgMutation = useMutation({
    mutationFn: async (data: { hiddenModules?: string[]; moduleOrder?: string[] }) => {
      return apiRequest('PUT', `/api/organizations/${organization.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      toast({ title: "Saved", description: "Module settings updated" });
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
    updateOrgMutation.mutate({ hiddenModules: newHiddenModules });
  };

  const moveModule = (moduleKey: string, direction: 'up' | 'down') => {
    const currentOrder = orderedModules.map(m => m.key);
    const currentIndex = currentOrder.indexOf(moduleKey);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= currentOrder.length) return;
    
    const newOrder = [...currentOrder];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];
    updateOrgMutation.mutate({ moduleOrder: newOrder });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <EyeOff className="h-5 w-5" />
          Module Visibility & Order
        </CardTitle>
        <CardDescription>
          Control which modules are visible and their order in the sidebar. Use the arrows to reorder modules.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {orderedModules.map((module, index) => {
            const isHidden = hiddenModules.includes(module.key);
            const Icon = module.icon;
            const isFirst = index === 0;
            const isLast = index === orderedModules.length - 1;
            
            return (
              <div 
                key={module.key} 
                className="flex items-center justify-between p-3 rounded-lg border"
                data-testid={`module-toggle-${module.key}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => moveModule(module.key, 'up')}
                      disabled={isFirst || updateOrgMutation.isPending}
                      data-testid={`button-move-up-${module.key}`}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => moveModule(module.key, 'down')}
                      disabled={isLast || updateOrgMutation.isPending}
                      data-testid={`button-move-down-${module.key}`}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>
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
