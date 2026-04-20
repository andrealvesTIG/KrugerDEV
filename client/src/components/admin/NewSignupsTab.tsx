import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, ExternalLink, Download } from "lucide-react";

type Row = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  detectedCompany: string | null;
  detectedIndustry: string | null;
  jobTitle: string | null;
  signupSource: string | null;
  signupMethod: string | null;
  createdAt: string;
  emailVerified: boolean;
  country: string | null;
  plan: string | null;
  city: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrerHost: string | null;
  lastEventAt: string | null;
  eventCount: number;
  actionCount: number;
  projectsCreated: number;
  tasksCreated: number;
  daysActive7d: number;
  salesTemperature: 'cold' | 'warm' | 'hot';
};

function tempBadge(t: 'cold' | 'warm' | 'hot') {
  if (t === 'hot') return <Badge className="bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30 hover:bg-red-500/20">Hot</Badge>;
  if (t === 'warm') return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20">Warm</Badge>;
  return <Badge variant="outline">Cold</Badge>;
}

function rel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function NewSignupsTab() {
  const [days, setDays] = useState<string>('30');
  const [temp, setTemp] = useState<string>('all');
  const [country, setCountry] = useState<string>('all');
  const [plan, setPlan] = useState<string>('all');
  const [source, setSource] = useState<string>('all');
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery<{ users: Row[]; total: number; days: number }>({
    queryKey: ['/api/admin/users/recent-signups', days, temp, country, plan, source],
    queryFn: async () => {
      const url = new URL('/api/admin/users/recent-signups', window.location.origin);
      url.searchParams.set('days', days);
      if (temp !== 'all') url.searchParams.set('temp', temp);
      if (country !== 'all') url.searchParams.set('country', country);
      if (plan !== 'all') url.searchParams.set('plan', plan);
      if (source !== 'all') url.searchParams.set('source', source);
      const res = await fetch(url.pathname + url.search, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.users || []) if (r.country) set.add(r.country);
    return Array.from(set).sort();
  }, [data]);

  const planOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.users || []) if (r.plan) set.add(r.plan);
    return Array.from(set).sort();
  }, [data]);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.users || []) {
      const s = r.signupMethod || r.signupSource;
      if (s) set.add(s);
    }
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const rows = data?.users || [];
    if (!q.trim()) return rows;
    const lc = q.toLowerCase();
    return rows.filter(r => `${r.email || ''} ${r.fullName || ''} ${r.detectedCompany || ''} ${r.utmCampaign || ''} ${r.referrerHost || ''}`.toLowerCase().includes(lc));
  }, [data, q]);

  const exportCsv = () => {
    const rows = filtered;
    const headers = ['Email', 'Name', 'Company', 'Industry', 'Title', 'Signed up', 'Method', 'Source', 'Country', 'UTM source', 'UTM campaign', 'Referrer', 'Projects', 'Tasks', 'Days active 7d', 'Last seen', 'Temperature'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      const cells = [
        r.email, r.fullName || '', r.detectedCompany || '', r.detectedIndustry || '',
        r.jobTitle || '', new Date(r.createdAt).toISOString(), r.signupMethod || '',
        r.signupSource || '', r.country || '', r.utmSource || '', r.utmCampaign || '',
        r.referrerHost || '', String(r.projectsCreated), String(r.tasksCreated),
        String(r.daysActive7d), r.lastEventAt ? new Date(r.lastEventAt).toISOString() : '',
        r.salesTemperature,
      ];
      lines.push(cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recent-signups-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = useMemo(() => {
    const out = { hot: 0, warm: 0, cold: 0 };
    for (const r of filtered) out[r.salesTemperature]++;
    return out;
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Hot</div><div className="text-2xl font-bold text-red-600">{counts.hot}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Warm</div><div className="text-2xl font-bold text-amber-600">{counts.warm}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Cold</div><div className="text-2xl font-bold text-muted-foreground">{counts.cold}</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, company, campaign…" className="pl-7 h-9" data-testid="input-search-signups" />
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[140px]" data-testid="select-days"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
        <Select value={temp} onValueChange={setTemp}>
          <SelectTrigger className="w-[140px]" data-testid="select-temp"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All temperatures</SelectItem>
            <SelectItem value="hot">Hot</SelectItem>
            <SelectItem value="warm">Warm</SelectItem>
            <SelectItem value="cold">Cold</SelectItem>
          </SelectContent>
        </Select>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger className="w-[140px]" data-testid="select-country"><SelectValue placeholder="Country" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {countryOptions.map(c => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger className="w-[140px]" data-testid="select-plan"><SelectValue placeholder="Plan" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {planOptions.map(p => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-[160px]" data-testid="select-source"><SelectValue placeholder="Signup source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All signup sources</SelectItem>
            {sourceOptions.map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-csv">
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead className="text-right">Projects</TableHead>
                    <TableHead className="text-right">Tasks</TableHead>
                    <TableHead className="text-right">Active (7d)</TableHead>
                    <TableHead>Signed up</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>Temp</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">No signups in this window.</TableCell></TableRow>
                  ) : filtered.map(r => (
                    <TableRow key={r.id} data-testid={`row-signup-${r.id}`}>
                      <TableCell>
                        <div className="font-medium truncate max-w-[200px]">{r.fullName || '—'}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{r.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm truncate max-w-[160px]">{r.detectedCompany || '—'}</div>
                        {r.detectedIndustry && <div className="text-xs text-muted-foreground truncate max-w-[160px]">{r.detectedIndustry}</div>}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{r.signupMethod || r.signupSource || '—'}</div>
                        {(r.utmSource || r.referrerHost) && (
                          <div className="text-muted-foreground truncate max-w-[140px]">{r.utmCampaign ? `${r.utmSource || r.referrerHost} · ${r.utmCampaign}` : (r.utmSource || r.referrerHost)}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{[r.city, r.country].filter(Boolean).join(', ') || '—'}</TableCell>
                      <TableCell className="text-right">{r.projectsCreated}</TableCell>
                      <TableCell className="text-right">{r.tasksCreated}</TableCell>
                      <TableCell className="text-right">{r.daysActive7d}</TableCell>
                      <TableCell className="text-xs">{rel(r.createdAt)}</TableCell>
                      <TableCell className="text-xs">{rel(r.lastEventAt)}</TableCell>
                      <TableCell>{tempBadge(r.salesTemperature)}</TableCell>
                      <TableCell>
                        <Link href={`/admin/users/${r.id}/insights`}>
                          <Button variant="outline" size="sm" data-testid={`button-view-insights-${r.id}`}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" /> View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
