import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Library, LayoutGrid } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProjectTabTemplates, useApplyTemplate } from "@/hooks/use-project-tab-templates";
import type { ProjectTabTemplate } from "@shared/schema";

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

export function ApplyTemplateButton({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [industry, setIndustry] = useState<string>('all');
  const [confirmFor, setConfirmFor] = useState<ProjectTabTemplate | null>(null);
  const [mode, setMode] = useState<'append' | 'replace'>('append');

  const { data: templates = [], isLoading } = useProjectTabTemplates(organizationId, industry);
  const applyMutation = useApplyTemplate();

  const handleApply = async () => {
    if (!confirmFor) return;
    try {
      await applyMutation.mutateAsync({ templateId: confirmFor.id, organizationId, mode });
      toast({
        title: 'Template applied',
        description: `"${confirmFor.name}" applied to this organization. Project Tabs and Custom Tabs have been updated.`,
      });
      setConfirmFor(null);
      setOpen(false);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to apply template',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="button-apply-template-top">
        <Library className="h-4 w-4 mr-2" /> Apply Template
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-apply-template-top">
          <DialogHeader>
            <DialogTitle>Apply a project tab template</DialogTitle>
            <DialogDescription>
              Pick a template to set the default project tabs (and any custom tabs) for this organization.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            {INDUSTRY_CHIPS.map(chip => (
              <Button
                key={chip.value}
                size="sm"
                variant={industry === chip.value ? 'default' : 'outline'}
                onClick={() => setIndustry(chip.value)}
                data-testid={`chip-industry-top-${chip.value}`}
              >
                {chip.label}
              </Button>
            ))}
          </div>

          <div className="space-y-2 mt-3">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No templates available for this industry.</p>
            ) : (
              templates.map(t => (
                <Card key={t.id} className="p-3 flex items-start gap-3" data-testid={`card-template-top-${t.id}`}>
                  <LayoutGrid className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      {t.industry && <Badge variant="outline" className="text-[10px] uppercase">{t.industry}</Badge>}
                      {t.scope === 'system' && <Badge variant="secondary" className="text-[10px]">System</Badge>}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => { setConfirmFor(t); setMode('append'); }}
                    data-testid={`button-apply-template-top-${t.id}`}
                  >
                    Apply
                  </Button>
                </Card>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmFor !== null} onOpenChange={(o) => !o && setConfirmFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply "{confirmFor?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose how this template should be applied to the organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 my-2">
            <Button size="sm" variant={mode === 'append' ? 'default' : 'outline'} onClick={() => setMode('append')}>
              Append (keep existing custom tabs)
            </Button>
            <Button size="sm" variant={mode === 'replace' ? 'default' : 'outline'} onClick={() => setMode('replace')}>
              Replace existing custom tabs
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApply} disabled={applyMutation.isPending} data-testid="button-confirm-apply-top">
              {applyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
