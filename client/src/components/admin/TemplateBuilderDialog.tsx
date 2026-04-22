import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import {
  useFullProjectTabTemplate,
  useCreateTemplateTab,
  useUpdateTemplateTab,
  useDeleteTemplateTab,
  useCreateTemplateSection,
  useUpdateTemplateSection,
  useDeleteTemplateSection,
  useCreateTemplateField,
  useUpdateTemplateField,
  useDeleteTemplateField,
  type FullTemplateTab,
  type FullTemplateSection,
  type FullTemplateField,
} from "@/hooks/use-project-tab-templates";

type FieldDefinition = { key: string; label: string; type: string; category?: string };

function useFieldDefinitions() {
  return useQuery<FieldDefinition[]>({
    queryKey: ['/api/project-field-definitions'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/project-field-definitions');
      return res.json();
    },
  });
}

export function TemplateBuilderDialog({ templateId, onClose }: { templateId: number; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useFullProjectTabTemplate(templateId);
  const { data: fieldDefs = [] } = useFieldDefinitions();

  const createTab = useCreateTemplateTab();
  const updateTab = useUpdateTemplateTab();
  const deleteTab = useDeleteTemplateTab();
  const createSection = useCreateTemplateSection();
  const updateSection = useUpdateTemplateSection();
  const deleteSection = useDeleteTemplateSection();
  const createField = useCreateTemplateField();
  const updateField = useUpdateTemplateField();
  const deleteField = useDeleteTemplateField();

  const [expandedTabs, setExpandedTabs] = useState<Record<number, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({});
  const [showAddTab, setShowAddTab] = useState(false);
  const [editingTab, setEditingTab] = useState<FullTemplateTab | null>(null);
  const [addSectionTabId, setAddSectionTabId] = useState<number | null>(null);
  const [editingSection, setEditingSection] = useState<FullTemplateSection | null>(null);
  const [addFieldSectionId, setAddFieldSectionId] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<FullTemplateField | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'tab' | 'section' | 'field'; id: number; name: string } | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.template?.name ?? 'Template builder'}</DialogTitle>
          <DialogDescription>
            Add tabs, sections and fields. Changes auto-propagate to every organization that has applied this template.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {(data.tabs ?? []).map((tab: FullTemplateTab) => {
              const tabOpen = expandedTabs[tab.id] ?? true;
              return (
                <div key={tab.id} className="border rounded-md p-3" data-testid={`builder-tab-${tab.id}`}>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setExpandedTabs(s => ({ ...s, [tab.id]: !tabOpen }))}>
                      {tabOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    <span className="font-semibold flex-1">{tab.name}</span>
                    <Button size="sm" variant="ghost" onClick={() => setEditingTab(tab)} data-testid={`button-edit-tab-${tab.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ kind: 'tab', id: tab.id, name: tab.name })} data-testid={`button-delete-tab-${tab.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {tab.description && <p className="text-xs text-muted-foreground mt-1 ml-8">{tab.description}</p>}

                  {tabOpen && (
                    <div className="ml-8 mt-3 space-y-2">
                      {(tab.sections ?? []).map((section: FullTemplateSection) => {
                        const sectionOpen = expandedSections[section.id] ?? true;
                        return (
                          <div key={section.id} className="border rounded-md p-2 bg-muted/30" data-testid={`builder-section-${section.id}`}>
                            <div className="flex items-center gap-2">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setExpandedSections(s => ({ ...s, [section.id]: !sectionOpen }))}>
                                {sectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                              <span className="font-medium text-sm flex-1">{section.name}</span>
                              <span className="text-xs text-muted-foreground">{section.columns ?? 2} cols</span>
                              <Button size="sm" variant="ghost" onClick={() => setEditingSection(section)} data-testid={`button-edit-section-${section.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ kind: 'section', id: section.id, name: section.name })} data-testid={`button-delete-section-${section.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {sectionOpen && (
                              <div className="ml-8 mt-2 space-y-1">
                                {(section.fields ?? []).map((field: FullTemplateField) => (
                                  <div key={field.id} className="flex items-center gap-2 text-sm" data-testid={`builder-field-${field.id}`}>
                                    <span className="flex-1 truncate">{field.label || field.fieldKey}</span>
                                    <span className="text-xs text-muted-foreground">{field.fieldType}</span>
                                    <Button size="sm" variant="ghost" onClick={() => setEditingField(field)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ kind: 'field', id: field.id, name: field.label || field.fieldKey })}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ))}
                                <Button size="sm" variant="outline" className="mt-1" onClick={() => setAddFieldSectionId(section.id)} data-testid={`button-add-field-${section.id}`}>
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add field
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <Button size="sm" variant="outline" onClick={() => setAddSectionTabId(tab.id)} data-testid={`button-add-section-${tab.id}`}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add section
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            <Button variant="outline" onClick={() => setShowAddTab(true)} data-testid="button-add-tab">
              <Plus className="h-4 w-4 mr-2" /> Add tab
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>

      {showAddTab && (
        <TabFormDialog
          title="Add tab"
          onClose={() => setShowAddTab(false)}
          onSubmit={async (v) => {
            await createTab.mutateAsync({ templateId, ...v });
            toast({ title: 'Tab added' });
            setShowAddTab(false);
          }}
        />
      )}
      {editingTab && (
        <TabFormDialog
          title="Edit tab"
          initial={{ name: editingTab.name, description: editingTab.description ?? '', icon: editingTab.icon ?? '' }}
          onClose={() => setEditingTab(null)}
          onSubmit={async (v) => {
            await updateTab.mutateAsync({ tabId: editingTab.id, templateId, ...v });
            toast({ title: 'Tab updated' });
            setEditingTab(null);
          }}
        />
      )}
      {addSectionTabId !== null && (
        <SectionFormDialog
          title="Add section"
          onClose={() => setAddSectionTabId(null)}
          onSubmit={async (v) => {
            await createSection.mutateAsync({ tabId: addSectionTabId, templateId, ...v });
            toast({ title: 'Section added' });
            setAddSectionTabId(null);
          }}
        />
      )}
      {editingSection && (
        <SectionFormDialog
          title="Edit section"
          initial={{ name: editingSection.name, description: editingSection.description ?? '', columns: editingSection.columns ?? 2 }}
          onClose={() => setEditingSection(null)}
          onSubmit={async (v) => {
            await updateSection.mutateAsync({ sectionId: editingSection.id, templateId, ...v });
            toast({ title: 'Section updated' });
            setEditingSection(null);
          }}
        />
      )}
      {addFieldSectionId !== null && (
        <FieldFormDialog
          title="Add field"
          fieldDefs={fieldDefs}
          onClose={() => setAddFieldSectionId(null)}
          onSubmit={async (v) => {
            await createField.mutateAsync({ sectionId: addFieldSectionId, templateId, ...v });
            toast({ title: 'Field added' });
            setAddFieldSectionId(null);
          }}
        />
      )}
      {editingField && (
        <FieldFormDialog
          title="Edit field"
          fieldDefs={fieldDefs}
          initial={{
            fieldKey: editingField.fieldKey,
            fieldType: editingField.fieldType,
            label: editingField.label ?? '',
            span: editingField.span ?? 1,
            isRequired: editingField.isRequired ?? false,
          }}
          onClose={() => setEditingField(null)}
          onSubmit={async (v) => {
            await updateField.mutateAsync({ fieldId: editingField.id, templateId, ...v });
            toast({ title: 'Field updated' });
            setEditingField(null);
          }}
        />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirm?.kind}?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirm?.name}" will be removed from the template and from every organization that has applied it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirm) return;
                if (confirm.kind === 'tab') await deleteTab.mutateAsync({ tabId: confirm.id, templateId });
                else if (confirm.kind === 'section') await deleteSection.mutateAsync({ sectionId: confirm.id, templateId });
                else await deleteField.mutateAsync({ fieldId: confirm.id, templateId });
                toast({ title: 'Deleted' });
                setConfirm(null);
              }}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function TabFormDialog({ title, initial, onClose, onSubmit }: {
  title: string;
  initial?: { name: string; description: string; icon: string };
  onClose: () => void;
  onSubmit: (v: { name: string; description?: string; icon?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '');
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-tab-name" /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div><Label>Icon (lucide name)</Label><Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="e.g. layers" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || !name.trim()} onClick={async () => {
            setSaving(true);
            try { await onSubmit({ name: name.trim(), description: description.trim() || undefined, icon: icon.trim() || undefined }); }
            finally { setSaving(false); }
          }}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionFormDialog({ title, initial, onClose, onSubmit }: {
  title: string;
  initial?: { name: string; description: string; columns: number };
  onClose: () => void;
  onSubmit: (v: { name: string; description?: string; columns?: number }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [columns, setColumns] = useState<number>(initial?.columns ?? 2);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-section-name" /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div>
            <Label>Columns</Label>
            <Select value={String(columns)} onValueChange={(v) => setColumns(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || !name.trim()} onClick={async () => {
            setSaving(true);
            try { await onSubmit({ name: name.trim(), description: description.trim() || undefined, columns }); }
            finally { setSaving(false); }
          }}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldFormDialog({ title, initial, fieldDefs, onClose, onSubmit }: {
  title: string;
  initial?: { fieldKey: string; fieldType: string; label: string; span: number; isRequired: boolean };
  fieldDefs: FieldDefinition[];
  onClose: () => void;
  onSubmit: (v: { fieldKey: string; fieldType?: string; label?: string; span?: number; isRequired?: boolean }) => Promise<void>;
}) {
  const [fieldKey, setFieldKey] = useState(initial?.fieldKey ?? '');
  const [fieldType, setFieldType] = useState(initial?.fieldType ?? 'text');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [span, setSpan] = useState<number>(initial?.span ?? 1);
  const [isRequired, setIsRequired] = useState<boolean>(initial?.isRequired ?? false);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Field</Label>
            <Select
              value={fieldKey}
              onValueChange={(v) => {
                setFieldKey(v);
                const def = fieldDefs.find(d => d.key === v);
                if (def) {
                  setFieldType(def.type);
                  if (!label) setLabel(def.label);
                }
              }}
            >
              <SelectTrigger data-testid="select-field-key"><SelectValue placeholder="Select a project field" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {fieldDefs.map(d => (
                  <SelectItem key={d.key} value={d.key}>{d.label} <span className="text-muted-foreground text-xs">({d.key})</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Or type a custom key (e.g. <code>customField:projectKpi</code>):</p>
            <Input className="mt-1" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} placeholder="customField:..." />
          </div>
          <div><Label>Label override</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label>Type</Label>
              <Select value={fieldType} onValueChange={setFieldType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['text', 'textarea', 'number', 'date', 'boolean', 'select', 'currency', 'percent', 'reference'].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label>Span</Label>
              <Select value={String(span)} onValueChange={(v) => setSpan(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div><p className="text-sm font-medium">Required</p></div>
            <Switch checked={isRequired} onCheckedChange={setIsRequired} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || !fieldKey.trim()} onClick={async () => {
            setSaving(true);
            try {
              await onSubmit({
                fieldKey: fieldKey.trim(),
                fieldType,
                label: label.trim() || undefined,
                span,
                isRequired,
              });
            } finally { setSaving(false); }
          }}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
