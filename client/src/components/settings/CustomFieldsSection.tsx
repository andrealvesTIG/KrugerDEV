import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Trash2, FileText, Pencil, Plus, Check, FolderKanban, ListTodo, Users, ClipboardList, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCustomFieldDefinitions, useCreateCustomFieldDefinition, useUpdateCustomFieldDefinition, useDeleteCustomFieldDefinition } from "@/hooks/use-custom-fields";
import type { CustomFieldDefinition } from "@shared/schema";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "percentage", label: "Percentage" },
  { value: "date", label: "Date" },
  { value: "select", label: "Single Select" },
  { value: "multiselect", label: "Multi Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "URL" },
  { value: "autonumber", label: "Auto Number" },
  { value: "resource", label: "Resource" },
  { value: "attachment", label: "Attachment" },
  { value: "rag", label: "RAG Status (Green / Yellow / Red)" },
  { value: "days_since_updated", label: "Days Since Last Update (computed)" },
  { value: "days_since_created", label: "Days Since Creation (computed)" },
  { value: "effort_completed_hours", label: "Effort Completed in Hours (computed)" },
  { value: "effort_remaining_hours", label: "Effort Remaining in Hours (computed)" },
  { value: "days_between_dates", label: "Days Between Two Dates (computed)" },
  { value: "roi", label: "ROI % (computed from benefits / costs)" },
  { value: "rag_rollup", label: "RAG Rollup — Worst of selected statuses (computed)" },
] as const;

const COMPUTED_FIELD_TYPES = new Set([
  "days_since_updated",
  "days_since_created",
  "effort_completed_hours",
  "effort_remaining_hours",
  "days_between_dates",
  "roi",
  "rag_rollup",
]);

const ENTITY_TYPES = [
  { value: "project", label: "Project", icon: FolderKanban },
  { value: "task", label: "Task", icon: ListTodo },
  { value: "resource", label: "Resource", icon: Users },
  { value: "intake", label: "Intake", icon: ClipboardList },
] as const;

export function CustomFieldsSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const { data: fields = [], isLoading } = useCustomFieldDefinitions(organizationId);
  const createMutation = useCreateCustomFieldDefinition();
  const updateMutation = useUpdateCustomFieldDefinition();
  const deleteMutation = useDeleteCustomFieldDefinition();

  const [activeEntityTab, setActiveEntityTab] = useState<string>("project");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  const [deleteField, setDeleteField] = useState<CustomFieldDefinition | null>(null);

  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<string>("text");
  const [entityType, setEntityType] = useState<string>("project");
  const [description, setDescription] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [options, setOptions] = useState("");
  const [mask, setMask] = useState("");
  const [startDateFieldId, setStartDateFieldId] = useState<string>("");
  const [endDateFieldId, setEndDateFieldId] = useState<string>("");
  const [ragSourceFieldIds, setRagSourceFieldIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Intake and project share their custom-field pool: a definition typed
  // 'intake' shows on both intake forms and projects (it's carried forward at
  // conversion), and a definition typed 'project' is also editable on the
  // intake form so the value is captured before conversion. Mirror that here
  // by listing both under the Project and Intake tabs.
  const matchesEntityTab = (f: CustomFieldDefinition, tab: string) => {
    const et = f.entityType || 'project';
    if (tab === 'project' || tab === 'intake') return et === 'project' || et === 'intake';
    return et === tab;
  };

  const filteredFields = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return fields.filter(f => {
      if (!matchesEntityTab(f, activeEntityTab)) return false;
      if (!q) return true;
      const typeLabel = FIELD_TYPES.find(t => t.value === f.fieldType)?.label.toLowerCase() || f.fieldType.toLowerCase();
      return (
        f.name.toLowerCase().includes(q)
        || (f.description || "").toLowerCase().includes(q)
        || typeLabel.includes(q)
      );
    });
  }, [fields, activeEntityTab, searchQuery]);

  const resetForm = () => {
    setName("");
    setFieldType("text");
    setEntityType(activeEntityTab);
    setDescription("");
    setIsRequired(false);
    setOptions("");
    setMask("");
    setStartDateFieldId("");
    setEndDateFieldId("");
    setRagSourceFieldIds([]);
    setEditingField(null);
  };

  const openEditDialog = (field: CustomFieldDefinition) => {
    setEditingField(field);
    setName(field.name);
    setFieldType(field.fieldType);
    setEntityType(field.entityType || 'project');
    setDescription(field.description || "");
    setIsRequired(field.isRequired ?? false);
    setOptions(field.options ? (field.options as string[]).join(", ") : "");
    setMask((field as any).mask || "");
    if (field.fieldType === "days_between_dates" && Array.isArray(field.options)) {
      const opts = field.options as string[];
      setStartDateFieldId(opts[0] || "");
      setEndDateFieldId(opts[1] || "");
    } else {
      setStartDateFieldId("");
      setEndDateFieldId("");
    }
    if (field.fieldType === "rag_rollup" && Array.isArray(field.options)) {
      setRagSourceFieldIds((field.options as string[]).filter(Boolean));
    } else {
      setRagSourceFieldIds([]);
    }
    setShowAddDialog(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Error", description: "Field name is required", variant: "destructive" });
      return;
    }

    let optionsArray: string[] | null = (fieldType === "select" || fieldType === "multiselect") && options.trim()
      ? options.split(",").map(o => o.trim()).filter(Boolean)
      : null;

    if (fieldType === "days_between_dates") {
      if (!startDateFieldId || !endDateFieldId) {
        toast({ title: "Error", description: "Pick both a start date field and an end date field", variant: "destructive" });
        return;
      }
      if (startDateFieldId === endDateFieldId) {
        toast({ title: "Error", description: "Start date field and end date field must be different", variant: "destructive" });
        return;
      }
      optionsArray = [startDateFieldId, endDateFieldId];
    }

    if (fieldType === "rag_rollup") {
      if (ragSourceFieldIds.length < 2) {
        toast({ title: "Error", description: "Pick at least two source RAG fields to roll up", variant: "destructive" });
        return;
      }
      optionsArray = ragSourceFieldIds.slice();
    }

    if (fieldType === "autonumber") {
      if (!mask.trim()) {
        toast({ title: "Error", description: "Mask is required for auto number fields", variant: "destructive" });
        return;
      }
      if ((mask.match(/#+/g) || []).length > 1) {
        toast({ title: "Error", description: "Mask may only contain one run of '#' digit placeholders", variant: "destructive" });
        return;
      }
    }

    const maskValue = fieldType === "autonumber" ? mask.trim() : null;

    try {
      if (editingField) {
        await updateMutation.mutateAsync({
          id: editingField.id,
          organizationId,
          name: name.trim(),
          fieldType,
          entityType,
          description: description.trim() || null,
          isRequired,
          options: optionsArray,
          mask: maskValue,
        } as any);
        toast({ title: "Success", description: "Custom field updated" });
      } else {
        await createMutation.mutateAsync({
          organizationId,
          name: name.trim(),
          fieldType,
          entityType,
          description: description.trim() || null,
          isRequired,
          options: optionsArray,
          mask: maskValue,
          displayOrder: filteredFields.length,
        } as any);
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

  const entityLabel = ENTITY_TYPES.find(e => e.value === activeEntityTab)?.label || "Project";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Custom Fields
          </CardTitle>
          <CardDescription>
            Define custom fields for projects, tasks, and resources in your organization
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
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search fields by name, description, or type..."
            className="pl-8 pr-8"
            data-testid="input-search-custom-fields"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
              data-testid="button-clear-custom-field-search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Tabs value={activeEntityTab} onValueChange={setActiveEntityTab} className="w-full">
          <TabsList className="mb-4">
            {ENTITY_TYPES.map((et) => {
              const Icon = et.icon;
              const count = fields.filter(f => matchesEntityTab(f, et.value)).length;
              return (
                <TabsTrigger key={et.value} value={et.value} className="gap-1.5">
                  <Icon className="h-4 w-4" />
                  {et.label}
                  {count > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-[10px]">
                      {count}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {ENTITY_TYPES.map((et) => (
            <TabsContent key={et.value} value={et.value} className="mt-0">
              {filteredFields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  {searchQuery.trim() ? (
                    <>
                      <p>No fields match "{searchQuery}"</p>
                      <p className="text-sm">Try a different search or clear the filter.</p>
                    </>
                  ) : (
                    <>
                      <p>No custom fields defined for {et.label.toLowerCase()}s yet</p>
                      <p className="text-sm">Add custom fields to capture additional information on {et.label.toLowerCase()}s</p>
                    </>
                  )}
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
                    {filteredFields.map((field) => (
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
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>

      <Dialog open={showAddDialog} onOpenChange={(open) => {
        if (!open) resetForm();
        setShowAddDialog(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingField ? "Edit Custom Field" : "Add Custom Field"}</DialogTitle>
            <DialogDescription>
              {editingField ? "Update the custom field settings" : "Create a new custom field"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="field-entity-type">Applies To</Label>
              <Select value={entityType} onValueChange={setEntityType} disabled={!!editingField}>
                <SelectTrigger id="field-entity-type" data-testid="select-entity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((et) => (
                    <SelectItem key={et.value} value={et.value}>
                      {et.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            {fieldType === "days_between_dates" && (() => {
              const dateFields = fields.filter(f =>
                f.fieldType === "date"
                && matchesEntityTab(f, entityType)
                && (!editingField || f.id !== editingField.id)
              );
              if (dateFields.length < 2) {
                return (
                  <p className="text-xs text-destructive">
                    Need at least two date custom fields on this entity before you can create a computed days-between field.
                  </p>
                );
              }
              return (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="field-start-date">Start Date Field *</Label>
                    <Select value={startDateFieldId} onValueChange={setStartDateFieldId}>
                      <SelectTrigger id="field-start-date" data-testid="select-start-date-field">
                        <SelectValue placeholder="Pick a date field..." />
                      </SelectTrigger>
                      <SelectContent>
                        {dateFields.map(f => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="field-end-date">End Date Field *</Label>
                    <Select value={endDateFieldId} onValueChange={setEndDateFieldId}>
                      <SelectTrigger id="field-end-date" data-testid="select-end-date-field">
                        <SelectValue placeholder="Pick a date field..." />
                      </SelectTrigger>
                      <SelectContent>
                        {dateFields.map(f => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Value is computed as <code className="px-1 rounded bg-muted">end − start</code> in whole days. Empty when either date is missing.
                    </p>
                  </div>
                </>
              );
            })()}
            {fieldType === "rag_rollup" && (() => {
              const ragFields = fields.filter(f =>
                f.fieldType === "rag"
                && matchesEntityTab(f, entityType)
                && (!editingField || f.id !== editingField.id)
              );
              if (ragFields.length < 2) {
                return (
                  <p className="text-xs text-destructive">
                    Need at least two RAG custom fields on this entity before you can create a RAG rollup field.
                  </p>
                );
              }
              const toggle = (id: string) => {
                setRagSourceFieldIds(prev =>
                  prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                );
              };
              return (
                <div className="space-y-2">
                  <Label>Source RAG fields *</Label>
                  <div className="space-y-1.5 rounded-md border p-3" data-testid="rag-rollup-source-picker">
                    {ragFields.map(f => {
                      const id = String(f.id);
                      const checked = ragSourceFieldIds.includes(id);
                      return (
                        <div key={f.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`rag-src-${f.id}`}
                            checked={checked}
                            onCheckedChange={() => toggle(id)}
                            data-testid={`checkbox-rag-source-${f.id}`}
                          />
                          <Label htmlFor={`rag-src-${f.id}`} className="cursor-pointer font-normal">
                            {f.name}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Value is the worst status across the selected fields
                    (<span className="font-medium">Red</span> &gt; <span className="font-medium">Yellow</span> &gt; <span className="font-medium">Green</span>).
                    Empty source values are ignored.
                  </p>
                </div>
              );
            })()}
            {fieldType === "autonumber" && (
              <div className="space-y-2">
                <Label htmlFor="field-mask">Mask *</Label>
                <Input
                  id="field-mask"
                  value={mask}
                  onChange={(e) => setMask(e.target.value)}
                  placeholder="e.g., N###  or  PRJ-####"
                  data-testid="input-field-mask"
                />
                <p className="text-xs text-muted-foreground">
                  Use <code className="px-1 rounded bg-muted">#</code> as a digit placeholder for the sequence number.
                  For example, <code className="px-1 rounded bg-muted">N###</code> produces N001, N002, N003.
                  A new value is assigned automatically when a record is created and never changes after that.
                </p>
                {mask.trim() && (
                  <p className="text-xs text-muted-foreground">
                    Preview: <span className="font-mono font-medium text-foreground">
                      {(() => {
                        const m = mask.trim();
                        const match = m.match(/#+/);
                        if (!match) return `${m}1`;
                        return m.replace(/#+/, "1".padStart(match[0].length, "0"));
                      })()}
                    </span>
                  </p>
                )}
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
              Are you sure you want to delete "{deleteField?.name}"? This will remove this field from all {ENTITY_TYPES.find(e => e.value === (deleteField?.entityType || 'project'))?.label.toLowerCase()}s and cannot be undone.
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
