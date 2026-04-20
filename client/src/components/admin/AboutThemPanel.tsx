import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, RefreshCw, Linkedin, MapPin, Briefcase, Building2, AlertTriangle, Save, Pencil, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type EnrichmentRow = {
  userId: string;
  source: string | null;
  status: 'ok' | 'error' | 'not_configured' | 'pending' | string | null;
  errorMessage: string | null;
  linkedinUrl: string | null;
  headline: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  currentCompanyIndustry: string | null;
  location: string | null;
  photoUrl: string | null;
  recentPositions: Array<{ title?: string; company?: string; startDate?: string; endDate?: string }> | null;
  fetchedAt: string | null;
} | null;

interface Props {
  userId: string;
  enrichment: EnrichmentRow;
  detected: {
    company: string | null;
    industry: string | null;
    jobTitle: string | null;
    linkedinUrl: string | null;
  };
  onUpdated?: () => void;
}

export function AboutThemPanel({ userId, enrichment, detected, onUpdated }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(!enrichment?.linkedinUrl && !detected.linkedinUrl);
  const [urlValue, setUrlValue] = useState(enrichment?.linkedinUrl || detected.linkedinUrl || "");

  const parseJsonResponse = async <T,>(res: Response, fallbackMsg: string): Promise<T> => {
    const text = await res.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch {
      throw new Error(`${fallbackMsg} (HTTP ${res.status} ${res.statusText} — server returned a non-JSON response)`);
    }
    if (!res.ok) {
      const msg = (body && typeof body === 'object' && 'message' in body && typeof (body as { message?: unknown }).message === 'string')
        ? (body as { message: string }).message
        : `${fallbackMsg} (HTTP ${res.status} ${res.statusText})`;
      throw new Error(msg);
    }
    return body as T;
  };

  const saveUrlMut = useMutation({
    mutationFn: async (linkedinUrl: string) => {
      const res = await fetch(`/api/admin/users/${userId}/linkedin-url`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ linkedinUrl }),
      });
      return parseJsonResponse<unknown>(res, 'Failed to save LinkedIn URL');
    },
    onSuccess: () => {
      toast({ title: 'LinkedIn URL saved', description: 'You can now refresh enrichment.' });
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['/api/admin/users', userId, 'insights'] });
      onUpdated?.();
    },
    onError: (err: unknown) => {
      toast({ title: 'Could not save', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    },
  });

  const enrichMut = useMutation({
    mutationFn: async (force: boolean) => {
      const res = await fetch(`/api/admin/users/${userId}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ force }),
      });
      const data = await parseJsonResponse<{ enrichment?: EnrichmentRow }>(res, 'Enrichment failed');
      if (!data || typeof data !== 'object' || !('enrichment' in data)) {
        throw new Error('Enrichment failed: malformed response from server');
      }
      return data;
    },
    onSuccess: (data: { enrichment?: EnrichmentRow }) => {
      const status = data.enrichment?.status;
      if (status === 'ok') {
        toast({ title: 'Profile refreshed', description: `via ${data.enrichment?.source}` });
      } else if (status === 'not_configured') {
        toast({ title: 'Provider not configured', description: 'Set LINKEDIN_ENRICHMENT_API_KEY to enable LinkedIn lookups.', variant: 'destructive' });
      } else {
        toast({ title: 'Enrichment incomplete', description: data.enrichment?.errorMessage || 'Could not enrich profile.', variant: 'destructive' });
      }
      qc.invalidateQueries({ queryKey: ['/api/admin/users', userId, 'insights'] });
      onUpdated?.();
    },
    onError: (err: unknown) => {
      toast({ title: 'Could not enrich', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    },
  });

  const e = enrichment;
  const hasEnrichment = e && e.status === 'ok';
  const lookupUrl = e?.linkedinUrl || detected.linkedinUrl;

  return (
    <Card data-testid="card-about-them">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Linkedin className="h-4 w-4 text-[#0A66C2]" />
          About them
          {e?.source && (
            <Badge variant="outline" className="text-[10px] font-normal ml-1">
              {e.source === 'manual' ? 'manual entry' : e.source === 'openai_inference' ? 'inferred' : e.source}
            </Badge>
          )}
        </CardTitle>
        <div className="flex gap-2">
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              data-testid="button-edit-linkedin"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" /> {lookupUrl ? 'Edit URL' : 'Add LinkedIn'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => enrichMut.mutate(true)}
            disabled={enrichMut.isPending}
            data-testid="button-refresh-enrichment"
          >
            {enrichMut.isPending
              ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        {editing && (
          <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-md bg-muted/40 border">
            <Input
              placeholder="https://www.linkedin.com/in/username"
              value={urlValue}
              onChange={(ev) => setUrlValue(ev.target.value)}
              data-testid="input-linkedin-url"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => saveUrlMut.mutate(urlValue.trim())}
                disabled={saveUrlMut.isPending}
                data-testid="button-save-linkedin-url"
              >
                {saveUrlMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
              {lookupUrl && (
                <Button variant="ghost" size="sm" onClick={() => { setUrlValue(lookupUrl); setEditing(false); }}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}

        {e?.status === 'error' && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Couldn't enrich this profile</div>
              <div className="opacity-80">{e.errorMessage || 'The provider could not return a profile.'}</div>
            </div>
          </div>
        )}
        {e?.status === 'not_configured' && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Enrichment provider not configured</div>
              <div className="opacity-80">Set <code>LINKEDIN_ENRICHMENT_API_KEY</code> to enable LinkedIn lookups, or rely on inferred data.</div>
            </div>
          </div>
        )}

        {hasEnrichment ? (
          <div className="flex gap-4">
            <Avatar className="h-16 w-16">
              {e.photoUrl ? <AvatarImage src={e.photoUrl} alt={e.headline || 'profile'} /> : null}
              <AvatarFallback>{(e.currentRole || e.headline || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-1">
              {e.headline && <div className="font-medium" data-testid="text-headline">{e.headline}</div>}
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                {e.currentRole && (
                  <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" /> {e.currentRole}</span>
                )}
                {e.currentCompany && (
                  <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {e.currentCompany}</span>
                )}
                {e.currentCompanyIndustry && <span>· {e.currentCompanyIndustry}</span>}
                {e.location && (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {e.location}</span>
                )}
              </div>
              {e.linkedinUrl && (
                <a href={e.linkedinUrl} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                  <ExternalLink className="h-3 w-3" /> View LinkedIn profile
                </a>
              )}
              {e.recentPositions && e.recentPositions.length > 0 && (
                <div className="mt-2 pt-2 border-t">
                  <div className="text-xs font-medium mb-1">Recent roles</div>
                  <ul className="text-xs space-y-0.5">
                    {e.recentPositions.slice(0, 4).map((p, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">
                          <span className="font-medium">{p.title || '—'}</span>
                          {p.company ? <span className="text-muted-foreground"> · {p.company}</span> : null}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {p.startDate || ''}{p.endDate ? `–${p.endDate}` : p.startDate ? '–present' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {e.fetchedAt && (
                <div className="text-[10px] text-muted-foreground mt-2">
                  Enriched {new Date(e.fetchedAt).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {!lookupUrl ? 'No LinkedIn URL on file. Add one above and click Refresh to enrich.' : 'No enriched data yet. Click Refresh to fetch.'}
          </div>
        )}

        {/* Detected (signup-time) data is always shown for comparison */}
        <div className="pt-3 border-t">
          <div className="text-xs font-medium text-muted-foreground mb-1">Detected from signup</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            <DV k="Company" v={detected.company} />
            <DV k="Industry" v={detected.industry} />
            <DV k="Job title" v={detected.jobTitle} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DV({ k, v }: { k: string; v: string | null }) {
  return (
    <div>
      <div className="text-muted-foreground">{k}</div>
      <div className="truncate" title={v ?? ''}>{v || '—'}</div>
    </div>
  );
}
