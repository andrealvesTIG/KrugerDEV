import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, Copy, Mail, RefreshCw, Send, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type Tone = 'friendly' | 'formal' | 'brief';

export type Draft = {
  id: number;
  userId: string;
  authorId: string | null;
  authorName: string | null;
  tone: string;
  subject: string | null;
  content: string;
  status: string;
  createdAt: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  recipientName: string;
  recipientEmail: string;
  onOpenInComposer: (subject: string, body: string) => void;
}

export function FollowupDraftPanel({ open, onOpenChange, userId, recipientName, recipientEmail, onOpenInComposer }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tone, setTone] = useState<Tone>('friendly');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  const draftsQ = useQuery<{ drafts: Draft[] }>({
    queryKey: ['/api/admin/users', userId, 'followup-drafts'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/followup-drafts`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load drafts');
      return res.json();
    },
    enabled: open && !!userId,
  });

  const generateMut = useMutation({
    mutationFn: async (selectedTone: Tone) => {
      const res = await fetch(`/api/admin/users/${userId}/followup-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tone: selectedTone }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to generate draft');
      }
      return res.json() as Promise<{ draft: Draft }>;
    },
    onSuccess: (data) => {
      const d = data.draft;
      setSubject(d.subject || '');
      setBody(d.content || '');
      setActiveDraftId(d.id);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['/api/admin/users', userId, 'followup-drafts'] });
      toast({ title: 'Draft generated', description: 'Edit it before sending if needed.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Could not generate draft', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    },
  });

  const patchDraftMut = useMutation({
    mutationFn: async (payload: { id: number; status?: 'draft' | 'edited' | 'sent' | 'copied'; subject?: string | null; content?: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/followup-drafts/${payload.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: payload.status,
          subject: payload.subject,
          content: payload.content,
        }),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/admin/users', userId, 'followup-drafts'] }),
  });

  const persistEdits = async (status: 'edited' | 'sent' | 'copied') => {
    if (!activeDraftId) return;
    await patchDraftMut.mutateAsync({
      id: activeDraftId,
      status,
      subject: subject || null,
      content: body,
    });
    setDirty(false);
  };

  const handleSaveEdits = async () => {
    if (!activeDraftId) {
      toast({ title: 'No active draft', description: 'Generate a draft first.', variant: 'destructive' });
      return;
    }
    try {
      await persistEdits('edited');
      toast({ title: 'Saved', description: 'Your edits were saved.' });
    } catch {
      toast({ title: 'Could not save', variant: 'destructive' });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      if (activeDraftId) {
        try { await persistEdits('copied'); } catch { /* non-fatal */ }
      }
      toast({ title: 'Copied', description: 'Draft copied to clipboard.' });
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  const handleOpenComposer = async () => {
    if (!subject.trim() || !body.trim()) {
      toast({ title: 'Nothing to send', description: 'Generate a draft first.', variant: 'destructive' });
      return;
    }
    if (activeDraftId) {
      // Handoff to the composer is not the same as a confirmed send — record
      // it as an edit so "sent" remains a true positive in history.
      try { await persistEdits('edited'); } catch { /* non-fatal */ }
    }
    onOpenInComposer(subject, body);
    onOpenChange(false);
  };

  const loadDraft = (d: Draft) => {
    setSubject(d.subject || '');
    setBody(d.content || '');
    setActiveDraftId(d.id);
    setTone((['friendly', 'formal', 'brief'] as Tone[]).includes(d.tone as Tone) ? (d.tone as Tone) : 'friendly');
    setDirty(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Draft follow-up
          </SheetTitle>
          <SheetDescription>
            Goal: book a follow-up meeting with <strong>{recipientName}</strong> ({recipientEmail}).
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Tone</Label>
            <Tabs value={tone} onValueChange={(v) => setTone(v as Tone)}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="friendly" data-testid="tab-tone-friendly">Friendly</TabsTrigger>
                <TabsTrigger value="formal" data-testid="tab-tone-formal">Formal</TabsTrigger>
                <TabsTrigger value="brief" data-testid="tab-tone-brief">Brief</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => generateMut.mutate(tone)}
              disabled={generateMut.isPending}
              data-testid="button-generate-draft"
              className="flex-1"
            >
              {generateMut.isPending
                ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                : (subject || body) ? <RefreshCw className="h-4 w-4 mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {(subject || body) ? 'Regenerate' : 'Generate draft'}
            </Button>
          </div>

          {(subject || body || generateMut.isPending) && (
            <div className="space-y-2">
              <div>
                <Label htmlFor="draft-subject" className="text-xs">Subject</Label>
                <Input
                  id="draft-subject"
                  value={subject}
                  onChange={(e) => { setSubject(e.target.value); setDirty(true); }}
                  data-testid="input-draft-subject"
                />
              </div>
              <div>
                <Label htmlFor="draft-body" className="text-xs">Message</Label>
                <Textarea
                  id="draft-body"
                  value={body}
                  onChange={(e) => { setBody(e.target.value); setDirty(true); }}
                  rows={14}
                  className="font-mono text-xs"
                  data-testid="input-draft-body"
                />
                <div className="text-[10px] text-muted-foreground mt-1">
                  {body.length} characters · ~{Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length))} words
                </div>
              </div>
            </div>
          )}

          {/* Draft history */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Recent drafts
              </div>
              {draftsQ.data?.drafts && draftsQ.data.drafts.length > 0 && (
                <span className="text-[10px] text-muted-foreground">{draftsQ.data.drafts.length}</span>
              )}
            </div>
            {draftsQ.isLoading ? (
              <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : !draftsQ.data?.drafts?.length ? (
              <div className="text-xs text-muted-foreground py-2">No previous drafts. Generate one above.</div>
            ) : (
              <ScrollArea className="h-48 border rounded-md">
                <div className="p-2 space-y-2">
                  {draftsQ.data.drafts.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => loadDraft(d)}
                      className={`w-full text-left p-2 rounded hover:bg-muted/60 transition border ${activeDraftId === d.id ? 'border-primary bg-muted/40' : 'border-transparent'}`}
                      data-testid={`draft-history-${d.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate">{d.subject || '(no subject)'}</span>
                        <Badge variant={d.status === 'sent' ? 'default' : 'outline'} className="text-[10px] capitalize">{d.status}</Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {new Date(d.createdAt).toLocaleString()} · {d.tone} · by {d.authorName || 'admin'}
                      </div>
                      <div className="text-[11px] text-muted-foreground line-clamp-2 mt-1">{d.content.slice(0, 160)}</div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <div className="p-4 border-t flex flex-wrap gap-2 justify-end">
          {dirty && activeDraftId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveEdits}
              disabled={patchDraftMut.isPending}
              data-testid="button-save-draft-edits"
            >
              {patchDraftMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Save edits
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!body.trim()}
            data-testid="button-copy-draft"
          >
            <Copy className="h-4 w-4 mr-1" /> Copy
          </Button>
          <Button
            size="sm"
            onClick={handleOpenComposer}
            disabled={!body.trim()}
            data-testid="button-open-in-composer"
          >
            <Mail className="h-4 w-4 mr-1" /> Open in email composer
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
