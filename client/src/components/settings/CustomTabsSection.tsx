import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Trash2, Pencil, Plus, Save, Columns, LayoutGrid, X, Sparkles, Library } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomProjectTabs, useCreateCustomTab, useUpdateCustomTab, useDeleteCustomTab, useFullCustomTab, useCreateCustomTabSection, useUpdateCustomTabSection, useDeleteCustomTabSection, useCreateCustomTabField, useDeleteCustomTabField, useProjectFieldDefinitions } from "@/hooks/use-custom-tabs";
import { useCustomFieldDefinitions } from "@/hooks/use-custom-fields";
import { useProjectTabTemplates, useApplyTemplate, useSaveOrgAsTemplate, useDeleteProjectTabTemplate, useFullProjectTabTemplate } from "@/hooks/use-project-tab-templates";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import type { CustomProjectTab, ProjectTabTemplate, User } from "@shared/schema";

const INDUSTRY_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'generic', label: 'Generic' },
  { value: 'construction', label: 'Construction' },
  { value: 'it', label: 'IT' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'rnd', label: 'R&D' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'services', label: 'Services' },
];

function TemplatePreviewBody({ templateId, organizationId }: { templateId: number; organizationId: number }) {
  const { data, isLoading, error } = useFullProjectTabTemplate(templateId, organizationId);
  if (isLoading) {
    return (
      <div className="mt-3 flex items-center justify-center py-4 border-t">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mt-3 pt-3 border-t text-sm text-destructive">
        Could not load template preview{error instanceof Error && error.message ? `: ${error.message}` : '.'}
      </div>
    );
  }
  const tabs = data.tabs ?? [];
  if (tabs.length === 0) {
    return <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">This template has no tabs yet.</div>;
  }
  return (
    <div className="mt-3 pt-3 border-t space-y-3" data-testid={`template-preview-${templateId}`}>
      {tabs.map(tab => (
        <div key={tab.id} className="space-y-2">
          <div className="text-sm font-semibold flex items-center gap-2">
            <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
            {tab.name}
          </div>
          <div className="ml-5 space-y-2">
            {(tab.sections ?? []).map(section => (
              <div key={section.id} className="rounded-md border bg-muted/30 p-2">
                <div className="text-xs font-medium flex items-center gap-2">
                  <Columns className="h-3 w-3 text-muted-foreground" />
                  {section.name}
                  <Badge variant="outline" className="text-[10px]">{section.columns ?? 2} cols</Badge>
                </div>
                {(section.fields ?? []).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {section.fields.map(f => (
                      <Badge key={f.id} variant="secondary" className="text-[10px]">
                        {f.label || f.fieldKey}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {(tab.sections ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground">No sections</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CustomTabsSection({ organizationId }: { organizationId: number }) {
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
  const { user } = useAuth() as { user: User | null | undefined };
  const { memberships = [] } = useOrganization();
  const currentMembership = memberships.find(m => m.organizationId === organizationId);
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'marketing';
  const isOrgAdminOrOwner = isSuperAdmin
    || currentMembership?.role === 'org_admin'
    || currentMembership?.role === 'owner';
  const [templateIndustry, setTemplateIndustry] = useState<string>('all');
  const [previewTemplateId, setPreviewTemplateId] = useState<number | null>(null);
  const { data: templates = [] } = useProjectTabTemplates(isOrgAdminOrOwner ? organizationId : undefined, templateIndustry);
  const applyTemplate = useApplyTemplate();
  const saveAsTemplate = useSaveOrgAsTemplate();
  const deleteTemplate = useDeleteProjectTabTemplate();
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [applyMode, setApplyMode] = useState<'append' | 'replace'>('append');
  const [pendingTemplateId, setPendingTemplateId] = useState<number | null>(null);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveIndustry, setSaveIndustry] = useState('');
  const [saveScope, setSaveScope] = useState<'system' | 'org'>('org');

  const handleApplyTemplate = async () => {
    if (!pendingTemplateId) return;
    try {
      const result = await applyTemplate.mutateAsync({ templateId: pendingTemplateId, organizationId, mode: applyMode });
      const skipNote = result.fieldsSkipped > 0 ? ` (${result.fieldsSkipped} unknown field${result.fieldsSkipped === 1 ? '' : 's'} skipped)` : '';
      toast({ title: 'Template applied', description: `${result.tabsCreated} tab${result.tabsCreated === 1 ? '' : 's'} added${skipNote}` });
      setShowApplyConfirm(false);
      setShowTemplatesDialog(false);
      setPendingTemplateId(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to apply template', variant: 'destructive' });
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!saveName.trim()) {
      toast({ title: 'Error', description: 'Template name is required', variant: 'destructive' });
      return;
    }
    try {
      await saveAsTemplate.mutateAsync({
        organizationId,
        name: saveName.trim(),
        description: saveDescription.trim() || undefined,
        industry: saveIndustry.trim() || undefined,
        scope: saveScope,
      });
      toast({ title: 'Template saved', description: `"${saveName}" is now available to apply.` });
      setShowSaveTemplateDialog(false);
      setSaveName(''); setSaveDescription(''); setSaveIndustry(''); setSaveScope('org');
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to save template', variant: 'destructive' });
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    try {
      await deleteTemplate.mutateAsync({ id, organizationId });
      toast({ title: 'Template deleted' });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to delete template', variant: 'destructive' });
    }
  };

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
    ...customFields.filter(f => (f.entityType || 'project') === 'project').map(f => ({ key: `customField:${f.id}`, label: f.name, type: 'custom' as const }))
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
        <div className="flex items-center gap-2">
          {isOrgAdminOrOwner && (
            <>
              <Button variant="outline" onClick={() => setShowTemplatesDialog(true)} data-testid="button-browse-templates">
                <Library className="h-4 w-4 mr-2" /> Templates
              </Button>
              <Button variant="outline" onClick={() => setShowSaveTemplateDialog(true)} disabled={tabs.length === 0} data-testid="button-save-as-template">
                <Sparkles className="h-4 w-4 mr-2" /> Save as Template
              </Button>
            </>
          )}
          <Button onClick={() => setShowNewTabDialog(true)} data-testid="button-add-custom-tab">
            <Plus className="h-4 w-4 mr-2" /> Add Tab
          </Button>
        </div>
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
                          <Badge variant="outline" className="text-xs">{section.columns || 2} cols</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setFieldPickerSectionId(section.id); setFieldPickerTabId(editingTabId); setShowFieldPicker(true); }} data-testid={`button-add-field-${section.id}`}>
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => editingTabId && handleDeleteSection(section.id, editingTabId)} data-testid={`button-delete-section-${section.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {section.fields && section.fields.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {section.fields.map((field) => (
                            <Badge key={field.id} variant="secondary" className="gap-1" data-testid={`badge-field-${field.id}`}>
                              {allFields.find(f => f.key === field.fieldKey)?.label || field.fieldKey}
                              <Button size="icon" variant="ghost" className="h-4 w-4 ml-1 p-0" onClick={() => editingTabId && handleRemoveField(field.id, section.id, editingTabId)} data-testid={`button-remove-field-${field.id}`}>
                                <X className="h-3 w-3" />
                              </Button>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No fields added yet</p>
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
            <DialogDescription>Create a section to group fields together</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Section Name</Label>
              <Input value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="e.g., General Info" data-testid="input-section-name" />
            </div>
            <div>
              <Label>Columns</Label>
              <Input type="number" min={1} max={4} value={sectionColumns} onChange={(e) => setSectionColumns(parseInt(e.target.value) || 2)} data-testid="input-section-columns" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSectionDialog(false)}>Cancel</Button>
            <Button onClick={handleAddSection} disabled={createSection.isPending} data-testid="button-confirm-add-section">
              {createSection.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFieldPicker} onOpenChange={setShowFieldPicker}>
        <DialogContent data-testid="dialog-field-picker">
          <DialogHeader>
            <DialogTitle>Add Field</DialogTitle>
            <DialogDescription>Select a field to add to this section</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {allFields.map((field) => (
              <Button
                key={field.key}
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  handleAddField(field.key, field.type);
                  setShowFieldPicker(false);
                }}
                data-testid={`button-pick-field-${field.key}`}
              >
                <Badge variant={field.type === 'custom' ? 'default' : 'secondary'} className="mr-2 text-xs">
                  {field.type === 'custom' ? 'Custom' : 'Project'}
                </Badge>
                {field.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTemplatesDialog} onOpenChange={(open) => { setShowTemplatesDialog(open); if (!open) setPreviewTemplateId(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="dialog-templates">
          <DialogHeader>
            <DialogTitle>Project Tab Templates</DialogTitle>
            <DialogDescription>Apply an industry-flavored layout, or pick one of your saved templates. Applying never changes existing project data.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 mb-3" data-testid="template-industry-chips">
            {INDUSTRY_CHIPS.map(opt => (
              <Button
                key={opt.value}
                size="sm"
                variant={templateIndustry === opt.value ? 'default' : 'outline'}
                onClick={() => setTemplateIndustry(opt.value)}
                data-testid={`chip-industry-${opt.value}`}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No templates available.</div>
          ) : (
            <div className="grid gap-3">
              {templates.map((tpl: ProjectTabTemplate) => (
                <div key={tpl.id} className="border rounded-lg p-4" data-testid={`card-template-${tpl.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{tpl.name}</span>
                        <Badge variant={tpl.scope === 'system' ? 'secondary' : 'default'} className="text-xs">
                          {tpl.scope === 'system' ? 'System' : 'Org'}
                        </Badge>
                        {tpl.industry && <Badge variant="outline" className="text-xs">{tpl.industry}</Badge>}
                      </div>
                      {tpl.description && <p className="text-sm text-muted-foreground mt-1">{tpl.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setPreviewTemplateId(previewTemplateId === tpl.id ? null : tpl.id)} data-testid={`button-preview-template-${tpl.id}`}>
                        {previewTemplateId === tpl.id ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                        Preview
                      </Button>
                      <Button size="sm" onClick={() => { setPendingTemplateId(tpl.id); setApplyMode('append'); setShowApplyConfirm(true); }} data-testid={`button-apply-template-${tpl.id}`}>
                        Apply
                      </Button>
                      {(tpl.scope === 'org' || isSuperAdmin) && (
                        <Button size="icon" variant="ghost" onClick={() => handleDeleteTemplate(tpl.id)} data-testid={`button-delete-template-${tpl.id}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {previewTemplateId === tpl.id && (
                    <TemplatePreviewBody templateId={tpl.id} organizationId={organizationId} />
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showApplyConfirm} onOpenChange={setShowApplyConfirm}>
        <DialogContent data-testid="dialog-apply-template">
          <DialogHeader>
            <DialogTitle>Apply Template</DialogTitle>
            <DialogDescription>
              Choose how to merge the template's tabs with your existing custom tabs. This affects layout only — your project data is never changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Mode</Label>
              <Select value={applyMode} onValueChange={(v) => setApplyMode(v as 'append' | 'replace')}>
                <SelectTrigger data-testid="select-apply-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="append">Append (add template tabs alongside existing tabs)</SelectItem>
                  <SelectItem value="replace">Replace (hide existing tabs, then add template tabs)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {applyMode === 'replace' && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <strong>Heads up:</strong> Replace will hide all of your current custom tabs and replace them with the template's tabs. Project data is never modified, but your existing custom-tab layout will no longer be visible.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyConfirm(false)}>Cancel</Button>
            <Button onClick={handleApplyTemplate} disabled={applyTemplate.isPending} data-testid="button-confirm-apply">
              {applyTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Apply Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
        <DialogContent data-testid="dialog-save-template">
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>Snapshot your current custom tabs into a reusable template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g., Our Construction Layout" data-testid="input-save-name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={saveDescription} onChange={(e) => setSaveDescription(e.target.value)} placeholder="What does this template cover?" data-testid="input-save-description" />
            </div>
            <div>
              <Label>Industry (optional)</Label>
              <Input value={saveIndustry} onChange={(e) => setSaveIndustry(e.target.value)} placeholder="e.g., Construction" data-testid="input-save-industry" />
            </div>
            {isSuperAdmin && (
              <div>
                <Label>Visibility</Label>
                <Select value={saveScope} onValueChange={(v) => setSaveScope(v as 'system' | 'org')}>
                  <SelectTrigger data-testid="select-save-scope"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org">My organization only</SelectItem>
                    <SelectItem value="system">System-wide (all organizations)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveTemplateDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveAsTemplate} disabled={saveAsTemplate.isPending} data-testid="button-confirm-save-template">
              {saveAsTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom Tab</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This will delete the tab and all its sections and fields. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTab} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete-tab">
              Delete Tab
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
