import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, Mail, ArrowLeft, Globe, MapPin, Smartphone, Monitor, Calendar, ExternalLink, ChevronDown, ChevronRight, Eye, MousePointerClick, Activity, AlertCircle, Search, Send, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AboutThemPanel, type EnrichmentRow } from "@/components/admin/AboutThemPanel";
import { FollowupDraftPanel } from "@/components/admin/FollowupDraftPanel";

type InsightsUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName?: string | null;
  jobTitle: string | null;
  detectedCompany: string | null;
  detectedIndustry: string | null;
  signupSource: string | null;
  createdAt: string;
  emailVerified: boolean;
  role?: string | null;
  profileImageUrl?: string | null;
  linkedinUrl?: string | null;
  phoneNumber?: string | null;
};

type InsightsAcquisition = {
  referrer: string | null;
  referrerHost: string | null;
  landingPath: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  signupMethod: string | null;
  firstSeenAt: string | null;
  signedUpAt: string | null;
};

type InsightsOrganization = {
  id: string;
  name: string;
  role?: string | null;
  plan?: string | null;
};

type TimelineFilter = 'all' | 'page' | 'action' | 'error';

type Insights = {
  user: InsightsUser;
  acquisition: InsightsAcquisition | null;
  enrichment: EnrichmentRow;
  organizations: InsightsOrganization[];
  summary: {
    eventCount: number;
    actionCount: number;
    sessionCount: number;
    daysActive: number;
    daysActiveLast7: number;
    lastSeenAt: string | null;
    projectsCount: number;
    tasksCount: number;
    risksCount: number;
    issuesCount: number;
    salesTemperature: 'cold' | 'warm' | 'hot';
    aiEventCount?: number;
    lastAiEventAt?: string | null;
    integrationsCount?: number;
    helpTicketCount?: number;
    lastHelpTicketAt?: string | null;
    planName?: string | null;
    trialEndsAt?: string | null;
    aiCreditsRemaining?: number | null;
    onboardingCompleted?: boolean;
  };
  topActions: { action: string; count: number }[];
  topPages: { path: string; count: number }[];
};

type TimelineItem = {
  source: 'page' | 'action';
  id: string;
  kind: string;
  path: string | null;
  element: string | null;
  label: string | null;
  metadata: Record<string, unknown> | null;
  sessionId: string | null;
  occurredAt: string;
};

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function tempBadge(t: 'cold' | 'warm' | 'hot') {
  if (t === 'hot') return <Badge className="bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30 hover:bg-red-500/20">Hot</Badge>;
  if (t === 'warm') return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20">Warm</Badge>;
  return <Badge variant="outline">Cold</Badge>;
}

function humanizeAction(a: string): string {
  return a.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function eventIcon(item: TimelineItem) {
  if (item.source === 'page') return <Eye className="h-4 w-4 text-blue-500" />;
  const k = item.kind.toLowerCase();
  if (k.includes('login') || k.includes('signup')) return <Activity className="h-4 w-4 text-green-500" />;
  if (k.includes('error') || k.includes('fail')) return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (k.includes('click')) return <MousePointerClick className="h-4 w-4 text-purple-500" />;
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

function describeEvent(item: TimelineItem): string {
  if (item.source === 'page') {
    if (item.kind === 'click') {
      return `Clicked ${item.label || item.element || 'element'}${item.path ? ` on ${item.path}` : ''}`;
    }
    return `Viewed ${item.path || '(unknown)'}`;
  }
  const action = humanizeAction(item.kind);
  const ctx = item.element ? ` ${item.element}` : '';
  const id = item.label ? ` #${item.label}` : '';
  return `${action}${ctx}${id}`;
}

interface Session {
  id: string;
  startsAt: string;
  endsAt: string;
  events: TimelineItem[];
}

function groupBySession(items: TimelineItem[]): Session[] {
  const sessions: Session[] = [];
  const SESSION_GAP = 30 * 60 * 1000;
  // items are desc; reverse to chronological for grouping then reverse sessions back
  const sorted = [...items].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  let current: Session | null = null;
  for (const ev of sorted) {
    const t = new Date(ev.occurredAt).getTime();
    if (!current) {
      current = { id: ev.sessionId || `${ev.occurredAt}`, startsAt: ev.occurredAt, endsAt: ev.occurredAt, events: [ev] };
      continue;
    }
    const lastT = new Date(current.endsAt).getTime();
    const sameSessionId = ev.sessionId && current.events[0].sessionId === ev.sessionId;
    if (sameSessionId || t - lastT < SESSION_GAP) {
      current.events.push(ev);
      current.endsAt = ev.occurredAt;
    } else {
      sessions.push(current);
      current = { id: ev.sessionId || `${ev.occurredAt}`, startsAt: ev.occurredAt, endsAt: ev.occurredAt, events: [ev] };
    }
  }
  if (current) sessions.push(current);
  // newest first
  return sessions.reverse().map(s => ({ ...s, events: s.events.slice().reverse() }));
}

export default function UserInsights() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [extraItems, setExtraItems] = useState<TimelineItem[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [draftPanelOpen, setDraftPanelOpen] = useState(false);

  const insightsQ = useQuery<Insights>({
    queryKey: ['/api/admin/users', userId, 'insights'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/insights`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: !!userId,
  });

  const timelineQ = useQuery<{ items: TimelineItem[]; nextCursor: string | null; hasMore: boolean }>({
    queryKey: ['/api/admin/users', userId, 'timeline', filter],
    queryFn: async () => {
      const url = new URL(`/api/admin/users/${userId}/timeline`, window.location.origin);
      url.searchParams.set('limit', '200');
      if (filter !== 'all') url.searchParams.set('type', filter);
      const res = await fetch(url.pathname + url.search, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load timeline');
      const data = await res.json();
      // Reset paginated extras whenever the base query reloads (e.g., filter change)
      setExtraItems([]);
      setOlderCursor(data.nextCursor || null);
      setHasMoreOlder(Boolean(data.hasMore));
      return data;
    },
    enabled: !!userId,
  });

  const loadOlder = async () => {
    if (!olderCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const url = new URL(`/api/admin/users/${userId}/timeline`, window.location.origin);
      url.searchParams.set('limit', '200');
      url.searchParams.set('cursor', olderCursor);
      if (filter !== 'all') url.searchParams.set('type', filter);
      const res = await fetch(url.pathname + url.search, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load older events');
      const data = await res.json();
      setExtraItems(prev => [...prev, ...(data.items || [])]);
      setOlderCursor(data.nextCursor || null);
      setHasMoreOlder(Boolean(data.hasMore));
    } catch (err) {
      toast({ title: 'Could not load older events', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setLoadingMore(false);
    }
  };

  const sendEmailMut = useMutation({
    mutationFn: async (payload: { subject: string; message: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to send email' }));
        throw new Error(err.message || 'Failed to send email');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Email sent', description: 'Your message was delivered.' });
      setEmailOpen(false);
      setEmailSubject('');
      setEmailMessage('');
    },
    onError: (err: unknown) => {
      toast({ title: 'Could not send email', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    },
  });

  const filteredItems = useMemo(() => {
    const items = [...(timelineQ.data?.items || []), ...extraItems];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(it =>
      (it.path || '').toLowerCase().includes(q) ||
      (it.kind || '').toLowerCase().includes(q) ||
      (it.element || '').toLowerCase().includes(q) ||
      (it.label || '').toLowerCase().includes(q)
    );
  }, [timelineQ.data, extraItems, search]);

  const sessions = useMemo(() => groupBySession(filteredItems), [filteredItems]);

  if (insightsQ.isLoading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (insightsQ.isError || !insightsQ.data) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => setLocation('/super-admin')} data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div className="mt-4 text-destructive">Could not load user insights.</div>
      </div>
    );
  }

  const { user, acquisition, summary, topActions, topPages } = insightsQ.data;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;
  const initials = (fullName || 'U').split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();

  const copyEmail = async () => {
    if (!user.email) return;
    await navigator.clipboard.writeText(user.email);
    toast({ title: 'Copied', description: 'Email copied to clipboard' });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/super-admin')} data-testid="button-back-admin">
          <ArrowLeft className="h-4 w-4 mr-1" /> Super Admin
        </Button>
      </div>

      {/* Identity */}
      <Card data-testid="card-identity">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold truncate" data-testid="text-user-name">{fullName}</h1>
                {tempBadge(summary.salesTemperature)}
                {user.emailVerified ? (
                  <Badge variant="secondary" className="text-xs">Verified</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Unverified</Badge>
                )}
                {user.role && user.role !== 'user' && (
                  <Badge variant="outline" className="text-xs">{user.role}</Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <a href={`mailto:${user.email}`} className="hover:text-foreground inline-flex items-center gap-1" data-testid="link-email">
                  <Mail className="h-3.5 w-3.5" /> {user.email}
                </a>
                <button onClick={copyEmail} className="inline-flex items-center gap-1 hover:text-foreground" data-testid="button-copy-email">
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                {user.linkedinUrl && (
                  <a href={user.linkedinUrl} target="_blank" rel="noreferrer" className="hover:text-foreground inline-flex items-center gap-1">
                    <ExternalLink className="h-3.5 w-3.5" /> LinkedIn
                  </a>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {user.detectedCompany && (
                  <span><span className="text-muted-foreground">Company:</span> {user.detectedCompany}</span>
                )}
                {user.detectedIndustry && (
                  <span><span className="text-muted-foreground">Industry:</span> {user.detectedIndustry}</span>
                )}
                {user.jobTitle && (
                  <span><span className="text-muted-foreground">Title:</span> {user.jobTitle}</span>
                )}
                <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Joined {relativeTime(user.createdAt)}</span>
                <span><span className="text-muted-foreground">Last seen:</span> {relativeTime(summary.lastSeenAt)}</span>
              </div>
              {(acquisition?.country || acquisition?.deviceType || acquisition?.browser) && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {(acquisition?.country || acquisition?.city) && (
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {[acquisition.city, acquisition.region, acquisition.country].filter(Boolean).join(', ')}</span>
                  )}
                  {acquisition?.deviceType && (
                    <span className="inline-flex items-center gap-1">
                      {acquisition.deviceType === 'Mobile' ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
                      {acquisition.deviceType}{acquisition.browser ? ` · ${acquisition.browser}` : ''}{acquisition.os ? ` · ${acquisition.os}` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation(`/super-admin?tab=users&userId=${user.id}`)}
                data-testid="button-open-in-admin"
                title="Open this user in the main admin console"
              >
                <ExternalLink className="h-4 w-4 mr-1" /> Open in admin
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setDraftPanelOpen(true)}
                data-testid="button-draft-followup"
              >
                <Sparkles className="h-4 w-4 mr-1" /> Draft follow-up
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const fname = user.firstName || (user.email || '').split('@')[0] || 'there';
                  setEmailSubject(`Following up from FridayReport.AI`);
                  setEmailMessage(`Hi ${fname},\n\nI wanted to personally check in on your FridayReport.AI experience. I noticed you've been exploring the platform — let me know if there's anything I can help with, or if you'd like a quick walkthrough of features that match your team's workflow.\n\nHappy to find a time that works.`);
                  setEmailOpen(true);
                }}
                data-testid="button-send-email-cta"
              >
                <Mail className="h-4 w-4 mr-1" /> Send sales email
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About them — LinkedIn enrichment */}
      <AboutThemPanel
        userId={user.id}
        enrichment={insightsQ.data.enrichment ?? null}
        detected={{
          company: user.detectedCompany,
          industry: user.detectedIndustry,
          jobTitle: user.jobTitle,
          linkedinUrl: user.linkedinUrl ?? null,
        }}
      />

      {/* Acquisition */}
      <Card data-testid="card-acquisition">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> How they found us</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {acquisition ? (
            <>
              <div className="mb-3">
                {acquisition.utmSource || acquisition.referrerHost ? (
                  <span>
                    Came from <strong>{acquisition.referrerHost || acquisition.utmSource}</strong>
                    {acquisition.utmMedium ? ` / ${acquisition.utmMedium}` : ''}
                    {acquisition.utmCampaign ? ` — campaign ` : ''}
                    {acquisition.utmCampaign ? <code className="bg-muted px-1 py-0.5 rounded text-xs">{acquisition.utmCampaign}</code> : null}
                    {acquisition.landingPath ? <> on <code className="bg-muted px-1 py-0.5 rounded text-xs">{acquisition.landingPath}</code></> : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Direct visit (no referrer / UTM data captured)</span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <KV k="Referrer host" v={acquisition.referrerHost} />
                <KV k="Landing path" v={acquisition.landingPath} />
                <KV k="UTM source" v={acquisition.utmSource} />
                <KV k="UTM medium" v={acquisition.utmMedium} />
                <KV k="UTM campaign" v={acquisition.utmCampaign} />
                <KV k="UTM term" v={acquisition.utmTerm} />
                <KV k="UTM content" v={acquisition.utmContent} />
                <KV k="gclid" v={acquisition.gclid} />
                <KV k="Signup method" v={acquisition.signupMethod} />
                <KV k="Signup source" v={user.signupSource} />
                <KV k="First seen" v={acquisition.firstSeenAt ? new Date(acquisition.firstSeenAt).toLocaleString() : null} />
                <KV k="Signed up" v={acquisition.signedUpAt ? new Date(acquisition.signedUpAt).toLocaleString() : null} />
              </div>
            </>
          ) : (
            <span className="text-muted-foreground">No acquisition data captured (signed up before tracking was enabled).</span>
          )}
        </CardContent>
      </Card>

      {/* Engagement Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3" data-testid="grid-summary">
        <KpiCard label="Sessions" value={summary.sessionCount} />
        <KpiCard label="Total events" value={summary.eventCount + summary.actionCount} />
        <KpiCard label="Days active" value={summary.daysActive} />
        <KpiCard label="Active (7d)" value={summary.daysActiveLast7} />
        <KpiCard label="Projects" value={summary.projectsCount} />
        <KpiCard label="Tasks" value={summary.tasksCount} />
        <KpiCard label="Risks" value={summary.risksCount} />
        <KpiCard label="Issues" value={summary.issuesCount} />
        <KpiCard label="AI usage" value={summary.aiEventCount ?? 0} />
        <KpiCard label="Integrations" value={summary.integrationsCount ?? 0} />
        <KpiCard label="Help tickets" value={summary.helpTicketCount ?? 0} />
      </div>

      {/* Sales-actionable */}
      <Card data-testid="card-sales-signals">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Sales signals</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <KV k="Plan" v={summary.planName || 'Free / Trial'} />
            <KV k="Trial ends" v={summary.trialEndsAt ? new Date(summary.trialEndsAt).toLocaleDateString() : '—'} />
            <KV k="AI credits left" v={summary.aiCreditsRemaining != null ? String(summary.aiCreditsRemaining) : '—'} />
            <KV k="Onboarding" v={summary.onboardingCompleted ? 'Complete' : 'In progress'} />
            <KV k="Last AI use" v={summary.lastAiEventAt ? relativeTime(summary.lastAiEventAt) : 'Never'} />
            <KV k="Last help ticket" v={summary.lastHelpTicketAt ? relativeTime(summary.lastHelpTicketAt) : 'None'} />
            <KV k="Signup source" v={user.signupSource || acquisition?.signupMethod || '—'} />
            <KV k="Email verified" v={user.emailVerified ? 'Yes' : 'No'} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Top actions</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {topActions.length === 0 ? <span className="text-muted-foreground">No actions yet</span> :
              topActions.map(a => (
                <div key={a.action} className="flex justify-between"><span>{humanizeAction(a.action)}</span><span className="font-mono text-xs text-muted-foreground">{a.count}</span></div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Top pages</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {topPages.length === 0 ? <span className="text-muted-foreground">No page views yet</span> :
              topPages.map(p => (
                <div key={p.path} className="flex justify-between gap-2"><code className="truncate text-xs">{p.path}</code><span className="font-mono text-xs text-muted-foreground">{p.count}</span></div>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card data-testid="card-timeline">
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as TimelineFilter)}>
              <TabsList>
                <TabsTrigger value="all" data-testid="tab-filter-all">All</TabsTrigger>
                <TabsTrigger value="page" data-testid="tab-filter-page">Page views</TabsTrigger>
                <TabsTrigger value="action" data-testid="tab-filter-action">Actions</TabsTrigger>
                <TabsTrigger value="error" data-testid="tab-filter-error">Errors</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search action / path / element"
                className="pl-7 h-9"
                data-testid="input-timeline-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {timelineQ.isLoading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : sessions.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No events captured yet.</div>
          ) : (
            <div className="space-y-6" data-testid="timeline-sessions">
              {sessions.map((s, idx) => {
                const startD = new Date(s.startsAt);
                const endD = new Date(s.endsAt);
                const durMin = Math.max(0, Math.round((endD.getTime() - startD.getTime()) / 60000));
                const entry = s.events[s.events.length - 1]?.path || s.events[0]?.path || '—';
                return (
                  <div key={`${s.id}-${idx}`} className="border-l-2 border-border pl-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                      Session · {startD.toLocaleString()} · {durMin}m · entry {entry}
                    </div>
                    <div className="space-y-2">
                      {s.events.map((ev, i) => {
                        const key = `${s.id}-${ev.id}-${i}`;
                        const isOpen = !!expanded[key];
                        const prev = s.events[i + 1];
                        const delta = prev ? Math.round((new Date(ev.occurredAt).getTime() - new Date(prev.occurredAt).getTime()) / 1000) : 0;
                        return (
                          <div key={key} className="flex items-start gap-2 text-sm" data-testid={`timeline-event-${ev.source}-${ev.id}`}>
                            <div className="mt-0.5">{eventIcon(ev)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap gap-x-2 items-baseline">
                                <span className="font-medium">{describeEvent(ev)}</span>
                                <span className="text-xs text-muted-foreground">{new Date(ev.occurredAt).toLocaleTimeString()}</span>
                                {delta > 0 && <span className="text-[10px] text-muted-foreground">+{delta}s</span>}
                              </div>
                              {ev.metadata && (
                                <button
                                  onClick={() => setExpanded(p => ({ ...p, [key]: !isOpen }))}
                                  className="mt-1 text-xs text-muted-foreground inline-flex items-center hover:text-foreground"
                                >
                                  {isOpen ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
                                  details
                                </button>
                              )}
                              {isOpen && ev.metadata && (
                                <pre className="mt-1 text-[11px] bg-muted/50 rounded p-2 overflow-auto max-h-48">{JSON.stringify(ev.metadata, null, 2)}</pre>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {hasMoreOlder && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadOlder}
                    disabled={loadingMore}
                    data-testid="button-load-older"
                  >
                    {loadingMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ChevronDown className="h-4 w-4 mr-2" />}
                    Load older events
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI follow-up draft side panel */}
      <FollowupDraftPanel
        open={draftPanelOpen}
        onOpenChange={setDraftPanelOpen}
        userId={user.id}
        recipientName={fullName}
        recipientEmail={user.email}
        onOpenInComposer={(subj, msg) => {
          setEmailSubject(subj);
          setEmailMessage(msg);
          setEmailOpen(true);
        }}
      />

      {/* Sales email dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send sales email</DialogTitle>
            <DialogDescription>
              Sending to <strong>{user.email}</strong>. They will see it as coming from FridayReport.AI.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                maxLength={200}
                data-testid="input-email-subject"
              />
            </div>
            <div>
              <Label htmlFor="email-message">Message</Label>
              <Textarea
                id="email-message"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                rows={10}
                maxLength={8000}
                data-testid="input-email-message"
              />
              <div className="text-xs text-muted-foreground mt-1">
                {emailMessage.length}/8000 characters
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)} data-testid="button-email-cancel">
              Cancel
            </Button>
            <Button
              onClick={() => sendEmailMut.mutate({ subject: emailSubject, message: emailMessage })}
              disabled={sendEmailMut.isPending || !emailSubject.trim() || !emailMessage.trim()}
              data-testid="button-email-send"
            >
              {sendEmailMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function KV({ k, v }: { k: string; v: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-muted-foreground">{k}</div>
      <div className="truncate" title={v != null ? String(v) : ''}>{v ?? '—'}</div>
    </div>
  );
}
