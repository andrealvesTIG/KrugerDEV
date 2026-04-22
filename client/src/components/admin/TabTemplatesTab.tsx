import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Library, Eye, Pencil, Trash2 } from "lucide-react";
import {
  useSystemProjectTabTemplates,
  useFullProjectTabTemplate,
  useUpdateProjectTabTemplate,
  useDeleteProjectTabTemplate,
} from "@/hooks/use-project-tab-templates";
import type { ProjectTabTemplate } from "@shared/schema";

const INDUSTRY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "generic", label: "Generic" },
  { value: "construction", label: "Construction" },
  { value: "it", label: "IT" },
  { value: "marketing", label: "Marketing" },
  { value: "rnd", label: "R&D" },
  { value: "healthcare", label: "Healthcare" },
  { value: "services", label: "Services" },
];

export function TabTemplatesTab() {
  const { toast } = useToast();
  const { data: templates = [], isLoading } = useSystemProjectTabTemplates();
  const updateTemplate = useUpdateProjectTabTemplate();
  const deleteTemplate = useDeleteProjectTabTemplate();

  const [industry, setIndustry] = useState<string>("all");
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ProjectTabTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return templates.filter(t => industry === "all" || (t.industry ?? "generic") === industry);
  }, [templates, industry]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Library className="h-5 w-5 text-primary" />
          <CardTitle>Project Tab Templates</CardTitle>
        </div>
        <CardDescription>
          Manage industry templates that organization admins can apply to their projects.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" data-testid="industry-filter-chips">
          {INDUSTRY_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              variant={industry === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setIndustry(opt.value)}
              data-testid={`chip-industry-${opt.value}`}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-templates">
            No templates match this filter.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map(t => (
              <Card key={t.id} className="border" data-testid={`card-template-${t.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-foreground truncate">{t.name}</h4>
                        <Badge variant="secondary" className="text-xs">{t.industry ?? "generic"}</Badge>
                        {t.isPublished === false && <Badge variant="outline" className="text-xs">Draft</Badge>}
                        {t.isDefault && <Badge className="text-xs">Default</Badge>}
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 pt-2">
                    <Button size="sm" variant="ghost" onClick={() => setPreviewId(t.id)} data-testid={`button-preview-${t.id}`}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)} data-testid={`button-edit-${t.id}`}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setDeletingId(t.id)}
                      data-testid={`button-delete-${t.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>

      {previewId !== null && (
        <PreviewDialog id={previewId} onClose={() => setPreviewId(null)} />
      )}

      {editing && (
        <EditDialog
          template={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await updateTemplate.mutateAsync({ id: editing.id, ...patch });
            toast({ title: "Template updated" });
            setEditing(null);
          }}
        />
      )}

      <AlertDialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing organizations that already applied this template will not be affected. New organizations will no longer receive it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deletingId !== null) {
                  await deleteTemplate.mutateAsync({ id: deletingId });
                  toast({ title: "Template deleted" });
                  setDeletingId(null);
                }
              }}
              data-testid="button-confirm-delete-template"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function PreviewDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading } = useFullProjectTabTemplate(id);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.template?.name ?? "Template preview"}</DialogTitle>
          <DialogDescription>
            {data?.template?.description ?? "Tabs, sections and fields included in this template."}
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {(data.tabs ?? []).map((tab: any) => (
              <div key={tab.id ?? tab.name} className="border rounded-md p-3" data-testid={`preview-tab-${tab.id ?? tab.name}`}>
                <h4 className="font-semibold">{tab.name}</h4>
                {tab.description && <p className="text-xs text-muted-foreground">{tab.description}</p>}
                <div className="mt-2 space-y-2">
                  {(tab.sections ?? []).map((section: any) => (
                    <div key={section.id ?? section.name} className="pl-3 border-l-2 border-border">
                      <p className="text-sm font-medium">{section.name}</p>
                      {section.description && (
                        <p className="text-xs text-muted-foreground">{section.description}</p>
                      )}
                      {(section.fields ?? []).length > 0 && (
                        <ul className="mt-1 ml-2 text-xs text-muted-foreground list-disc list-inside">
                          {(section.fields ?? []).map((f: any) => (
                            <li key={f.id ?? f.fieldKey}>{f.label ?? f.fieldKey}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {(data.tabs ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">This template has no tabs.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  template,
  onClose,
  onSave,
}: {
  template: ProjectTabTemplate;
  onClose: () => void;
  onSave: (patch: { name?: string; description?: string; industry?: string; icon?: string; isPublished?: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [industry, setIndustry] = useState(template.industry ?? "generic");
  const [icon, setIcon] = useState(template.icon ?? "");
  const [isPublished, setIsPublished] = useState(template.isPublished !== false);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit template</DialogTitle>
          <DialogDescription>Update template metadata. Structure is unchanged.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="tmpl-name">Name</Label>
            <Input id="tmpl-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-template-name" />
          </div>
          <div>
            <Label htmlFor="tmpl-desc">Description</Label>
            <Textarea id="tmpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-template-description" />
          </div>
          <div>
            <Label htmlFor="tmpl-industry">Industry</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger id="tmpl-industry" data-testid="select-template-industry"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INDUSTRY_OPTIONS.filter(o => o.value !== "all").map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="tmpl-icon">Icon (lucide name)</Label>
            <Input id="tmpl-icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="e.g. layers" data-testid="input-template-icon" />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Published</p>
              <p className="text-xs text-muted-foreground">Org admins can only see and apply published templates.</p>
            </div>
            <Switch checked={isPublished} onCheckedChange={setIsPublished} data-testid="switch-template-published" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  name: name.trim(),
                  description: description.trim() || undefined,
                  industry,
                  icon: icon.trim() || undefined,
                  isPublished,
                });
              } finally {
                setSaving(false);
              }
            }}
            data-testid="button-save-template"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
