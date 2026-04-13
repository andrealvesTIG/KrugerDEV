import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useInspections, useInspectionTemplates, useCreateInspection, useUpdateInspection, useDeleteInspection,
  useCreateInspectionTemplate, useDeleteInspectionTemplate, useInspectionTemplate,
  useInspection, useSaveInspectionResults,
  useIncidents, useCreateIncident, useUpdateIncident, useDeleteIncident,
  useIncident, useCreateIncidentAction, useUpdateIncidentAction,
  useObservations, useCreateObservation, useUpdateObservation, useDeleteObservation,
  useObservation, useCreateObservationAction, useUpdateObservationAction,
  useSafetyDashboard,
} from "@/hooks/use-quality-safety";
import type { TrendDataPoint } from "@/hooks/use-quality-safety";
import { useUpload } from "@/hooks/use-upload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Plus, Trash2, Pencil, Loader2, Eye, Camera,
  CheckCircle2, Circle, Clock, AlertTriangle, XCircle,
  MapPin, User, Calendar, Shield, AlertCircle,
  ClipboardCheck, FileText, BarChart3, Search, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { Inspection, Incident, Observation, User as UserType } from "@shared/schema";

interface OrgMember {
  userId: string;
  role: string;
  user?: UserType;
}

function getMemberDisplayName(member: OrgMember): string {
  if (member.user) {
    if (member.user.firstName && member.user.lastName) return `${member.user.firstName} ${member.user.lastName}`;
    return member.user.username || member.user.email || "Unknown";
  }
  return "Unknown";
}

function useOrgMembers(organizationId: number) {
  const { data = [] } = useQuery<OrgMember[]>({
    queryKey: [`/api/organizations/${organizationId}/members`],
    enabled: !!organizationId,
  });
  return data;
}

const INSPECTION_STATUSES = ["Scheduled", "In Progress", "Completed", "Failed", "Cancelled"] as const;
const INCIDENT_STATUSES = ["Reported", "Under Investigation", "Corrective Action", "Closed"] as const;
const INCIDENT_SEVERITIES = ["Minor", "Moderate", "Major", "Critical", "Fatal"] as const;
const OBSERVATION_STATUSES = ["Open", "In Progress", "Resolved", "Closed"] as const;
const OBSERVATION_CATEGORIES = ["Safety", "Quality", "Environmental"] as const;
const OBSERVATION_TYPES = ["Positive", "Negative"] as const;
const ACTION_STATUSES = ["Open", "In Progress", "Completed", "Overdue"] as const;

const inspectionStatusConfig: Record<string, { color: string; bg: string }> = {
  "Scheduled": { color: "text-blue-600", bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  "In Progress": { color: "text-yellow-600", bg: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  "Completed": { color: "text-green-600", bg: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  "Failed": { color: "text-red-600", bg: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  "Cancelled": { color: "text-gray-600", bg: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
};

const severityConfig: Record<string, { color: string; bg: string }> = {
  "Minor": { color: "text-green-600", bg: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  "Moderate": { color: "text-yellow-600", bg: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  "Major": { color: "text-orange-600", bg: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  "Critical": { color: "text-red-600", bg: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  "Fatal": { color: "text-red-800", bg: "bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300" },
};

const incidentStatusConfig: Record<string, { bg: string }> = {
  "Reported": { bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  "Under Investigation": { bg: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  "Corrective Action": { bg: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  "Closed": { bg: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

const observationStatusConfig: Record<string, { bg: string }> = {
  "Open": { bg: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  "In Progress": { bg: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  "Resolved": { bg: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  "Closed": { bg: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
};

interface QualitySafetyTabProps {
  projectId: number;
  organizationId: number;
}

export default function QualitySafetyTab({ projectId, organizationId }: QualitySafetyTabProps) {
  const [activeSubTab, setActiveSubTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="dashboard" className="flex items-center gap-1">
            <BarChart3 className="h-3.5 w-3.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="inspections" className="flex items-center gap-1">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Inspections
          </TabsTrigger>
          <TabsTrigger value="incidents" className="flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Incidents
          </TabsTrigger>
          <TabsTrigger value="observations" className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            Observations
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardPanel projectId={projectId} />
        </TabsContent>
        <TabsContent value="inspections">
          <InspectionsPanel projectId={projectId} organizationId={organizationId} />
        </TabsContent>
        <TabsContent value="incidents">
          <IncidentsPanel projectId={projectId} organizationId={organizationId} />
        </TabsContent>
        <TabsContent value="observations">
          <ObservationsPanel projectId={projectId} organizationId={organizationId} />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesPanel projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DashboardPanel({ projectId }: { projectId: number }) {
  const { data: dashboard, isLoading } = useSafetyDashboard(projectId);

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!dashboard) return <div className="text-center py-8 text-muted-foreground">No data available</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Inspections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.inspections.total}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">Completion Rate</span>
              <Progress value={dashboard.inspections.completionRate} className="h-2 flex-1" />
              <span className="text-xs font-medium">{dashboard.inspections.completionRate}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Incidents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.incidents.total}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-green-600">{dashboard.incidents.counts["Closed"] ?? 0} closed</span>
              <span className="text-xs text-red-600">{(dashboard.incidents.total) - (dashboard.incidents.counts["Closed"] ?? 0)} open</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Observations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.observations.total}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-green-600">{(dashboard.observations.counts["Resolved"] ?? 0) + (dashboard.observations.counts["Closed"] ?? 0)} resolved</span>
              <span className="text-xs text-red-600">{(dashboard.observations.counts["Open"] ?? 0)} open</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Corrective Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.openCorrectiveActions}</div>
            <div className="text-xs text-muted-foreground mt-1">Requiring attention</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Inspections by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(dashboard.inspections.counts).length === 0 ? (
              <p className="text-sm text-muted-foreground">No inspections yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(dashboard.inspections.counts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm">{status}</span>
                    <div className="flex items-center gap-2">
                      <Progress value={dashboard.inspections.total > 0 ? (count / dashboard.inspections.total) * 100 : 0} className="h-2 w-24" />
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Incidents by Severity</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(dashboard.incidentsBySeverity.counts).length === 0 ? (
              <p className="text-sm text-muted-foreground">No incidents yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(dashboard.incidentsBySeverity.counts).map(([severity, count]) => (
                  <div key={severity} className="flex items-center justify-between">
                    <Badge className={severityConfig[severity]?.bg ?? ""}>{severity}</Badge>
                    <span className="text-sm font-medium">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {dashboard.trends && dashboard.trends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Weekly Safety Trends (13 Weeks)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboard.trends.map((t: TrendDataPoint) => ({ ...t, week: format(new Date(t.week), "MMM d") }))}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="inspections" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Inspections" />
                  <Area type="monotone" dataKey="incidents" stackId="2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Incidents" />
                  <Area type="monotone" dataKey="observations" stackId="3" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} name="Observations" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InspectionsPanel({ projectId, organizationId }: { projectId: number; organizationId: number }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const { toast } = useToast();

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (statusFilter) f.status = statusFilter;
    return f;
  }, [statusFilter]);

  const { data: items = [], isLoading } = useInspections(projectId, filters);
  const { data: templates = [] } = useInspectionTemplates(projectId);
  const createMutation = useCreateInspection(projectId);
  const updateMutation = useUpdateInspection(projectId);
  const deleteMutation = useDeleteInspection(projectId);
  const members = useOrgMembers(organizationId);

  const filtered = useMemo(() => {
    if (!searchTerm) return items;
    const lower = searchTerm.toLowerCase();
    return items.filter(i => i.title.toLowerCase().includes(lower) || i.number.toLowerCase().includes(lower));
  }, [items, searchTerm]);

  const [form, setForm] = useState({
    title: "", description: "", inspectionType: "", location: "",
    status: "Scheduled" as string, scheduledDate: "", inspectorId: "", inspectorName: "",
    notes: "", templateId: null as number | null,
  });

  const resetForm = () => setForm({
    title: "", description: "", inspectionType: "", location: "",
    status: "Scheduled", scheduledDate: "", inspectorId: "", inspectorName: "",
    notes: "", templateId: null,
  });

  const openEdit = (item: Inspection) => {
    setForm({
      title: item.title || "",
      description: item.description || "",
      inspectionType: item.inspectionType || "",
      location: item.location || "",
      status: item.status,
      scheduledDate: item.scheduledDate || "",
      inspectorId: item.inspectorId || "",
      inspectorName: item.inspectorName || "",
      notes: item.notes || "",
      templateId: item.templateId,
    });
    setEditingId(item.id);
  };

  const handleSubmit = async () => {
    const data: Record<string, unknown> = {
      title: form.title,
      description: form.description || null,
      inspectionType: form.inspectionType || null,
      location: form.location || null,
      status: form.status,
      scheduledDate: form.scheduledDate || null,
      inspectorId: form.inspectorId || null,
      inspectorName: form.inspectorName || null,
      notes: form.notes || null,
      templateId: form.templateId,
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...data });
        toast({ title: "Inspection updated" });
        setEditingId(null);
      } else {
        await createMutation.mutateAsync(data);
        toast({ title: "Inspection created" });
        setShowCreate(false);
      }
      resetForm();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search inspections..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-[200px]" />
          </div>
          <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {INSPECTION_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Inspection
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No inspections found</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <Card key={item.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewingId(item.id)}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground shrink-0">{item.number}</span>
                    <span className="font-medium truncate">{item.title}</span>
                    <Badge className={inspectionStatusConfig[item.status]?.bg ?? ""}>{item.status}</Badge>
                    {item.overallResult && (
                      <Badge variant={item.overallResult === "Pass" ? "default" : "destructive"}>
                        {item.overallResult}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.scheduledDate && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {item.scheduledDate}
                      </span>
                    )}
                    {item.inspectorName && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> {item.inspectorName}
                      </span>
                    )}
                    <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); openEdit(item); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={e => {
                      e.stopPropagation();
                      if (confirm("Delete this inspection?")) deleteMutation.mutate(item.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate || editingId !== null} onOpenChange={open => { if (!open) { setShowCreate(false); setEditingId(null); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Inspection" : "New Inspection"}</DialogTitle>
            <DialogDescription>{editingId ? "Update inspection details" : "Create a new inspection"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Input value={form.inspectionType} onChange={e => setForm(f => ({ ...f, inspectionType: e.target.value }))} placeholder="e.g., Safety, Quality" />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INSPECTION_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Scheduled Date</Label>
                <Input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Inspector</Label>
              {members.length > 0 ? (
                <Select value={form.inspectorId || "unassigned"} onValueChange={v => {
                  if (v === "unassigned") {
                    setForm(f => ({ ...f, inspectorId: "", inspectorName: "" }));
                  } else {
                    const m = members.find(m => m.userId === v);
                    setForm(f => ({ ...f, inspectorId: v, inspectorName: m ? getMemberDisplayName(m) : "" }));
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Select inspector" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {members.map(m => <SelectItem key={m.userId} value={m.userId}>{getMemberDisplayName(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.inspectorName} onChange={e => setForm(f => ({ ...f, inspectorName: e.target.value }))} placeholder="Inspector name" />
              )}
            </div>
            {templates.length > 0 && !editingId && (
              <div>
                <Label>Template (optional)</Label>
                <Select value={form.templateId?.toString() || "none"} onValueChange={v => setForm(f => ({ ...f, templateId: v === "none" ? null : Number(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Template</SelectItem>
                    {templates.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditingId(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.title || createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewingId && (
        <InspectionDetailDialog
          projectId={projectId}
          inspectionId={viewingId}
          organizationId={organizationId}
          onClose={() => setViewingId(null)}
          onEdit={item => { setViewingId(null); openEdit(item); }}
        />
      )}
    </div>
  );
}

function InspectionDetailDialog({ projectId, inspectionId, organizationId, onClose, onEdit }: {
  projectId: number; inspectionId: number; organizationId: number;
  onClose: () => void; onEdit: (item: Inspection) => void;
}) {
  const { data: inspection, isLoading } = useInspection(projectId, inspectionId);
  const members = useOrgMembers(organizationId);
  const { data: templateData } = useInspectionTemplate(projectId, inspection?.templateId ?? 0);
  const saveResults = useSaveInspectionResults(projectId, inspectionId);
  const { uploadFile, isUploading } = useUpload();
  const { toast } = useToast();
  const [results, setResults] = useState<Array<{
    templateItemId: number | null; itemText: string; section: string;
    result: string; notes: string; deficiencyDescription: string;
    correctiveAction: string; assignedTo: string; assignedToName: string; dueDate: string;
    photoUrl: string;
  }>>([]);
  const [showResultsForm, setShowResultsForm] = useState(false);

  const initResults = () => {
    if (inspection?.results && inspection.results.length > 0) {
      setResults(inspection.results.map(r => ({
        templateItemId: r.templateItemId,
        itemText: r.itemText,
        section: r.section || "",
        result: r.result || "",
        notes: r.notes || "",
        deficiencyDescription: r.deficiencyDescription || "",
        correctiveAction: r.correctiveAction || "",
        assignedTo: r.assignedTo || "",
        assignedToName: r.assignedToName || "",
        dueDate: r.dueDate || "",
        photoUrl: r.photoUrl || "",
      })));
    } else if (templateData?.items) {
      setResults(templateData.items.map(i => ({
        templateItemId: i.id,
        itemText: i.itemText,
        section: i.section || "",
        result: "",
        notes: "",
        deficiencyDescription: "",
        correctiveAction: "",
        assignedTo: "",
        assignedToName: "",
        dueDate: "",
        photoUrl: "",
      })));
    }
    setShowResultsForm(true);
  };

  const handleSaveResults = async () => {
    try {
      await saveResults.mutateAsync(results.map(r => ({
        ...r,
        result: r.result || null,
        notes: r.notes || null,
        section: r.section || null,
        deficiencyDescription: r.deficiencyDescription || null,
        correctiveAction: r.correctiveAction || null,
        assignedTo: r.assignedTo || null,
        assignedToName: r.assignedToName || null,
        dueDate: r.dueDate || null,
        photoUrl: r.photoUrl || null,
      })));
      toast({ title: "Results saved" });
      setShowResultsForm(false);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  if (isLoading) return null;
  if (!inspection) return null;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">{inspection.number}</span>
            {inspection.title}
          </DialogTitle>
          <DialogDescription>
            <Badge className={inspectionStatusConfig[inspection.status]?.bg ?? ""}>{inspection.status}</Badge>
            {inspection.overallResult && (
              <Badge className="ml-2" variant={inspection.overallResult === "Pass" ? "default" : "destructive"}>
                Result: {inspection.overallResult}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {inspection.description && (
            <div><Label className="text-muted-foreground">Description</Label><p className="text-sm mt-1">{inspection.description}</p></div>
          )}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {inspection.inspectionType && <div><span className="text-muted-foreground">Type:</span> {inspection.inspectionType}</div>}
            {inspection.location && <div><span className="text-muted-foreground">Location:</span> {inspection.location}</div>}
            {inspection.scheduledDate && <div><span className="text-muted-foreground">Scheduled:</span> {inspection.scheduledDate}</div>}
            {inspection.completedDate && <div><span className="text-muted-foreground">Completed:</span> {inspection.completedDate}</div>}
            {inspection.inspectorName && <div><span className="text-muted-foreground">Inspector:</span> {inspection.inspectorName}</div>}
            {inspection.createdByName && <div><span className="text-muted-foreground">Created by:</span> {inspection.createdByName}</div>}
          </div>
          {inspection.notes && (
            <div><Label className="text-muted-foreground">Notes</Label><p className="text-sm mt-1">{inspection.notes}</p></div>
          )}

          {!showResultsForm && inspection.results && inspection.results.length > 0 && (
            <div>
              <Label className="text-muted-foreground">Results ({inspection.results.length} items)</Label>
              <div className="space-y-1 mt-2">
                {inspection.results.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                    <div className="flex items-center gap-2">
                      {r.section && <span className="text-xs text-muted-foreground">[{r.section}]</span>}
                      <span>{r.itemText}</span>
                    </div>
                    <Badge className={
                      r.result === "Pass" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      r.result === "Fail" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      "bg-gray-100 text-gray-700"
                    }>
                      {r.result || "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showResultsForm && (
            <div className="space-y-3 border rounded p-4">
              <Label className="font-medium">Record Results</Label>
              {results.map((r, i) => (
                <div key={i} className="space-y-2 border-b pb-3 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {r.section && <Badge variant="outline" className="text-xs">{r.section}</Badge>}
                      <span className="text-sm font-medium">{r.itemText}</span>
                    </div>
                    <Select value={r.result || "pending"} onValueChange={v => {
                      const updated = [...results];
                      updated[i] = { ...updated[i], result: v === "pending" ? "" : v };
                      setResults(updated);
                    }}>
                      <SelectTrigger className="w-[100px]"><SelectValue placeholder="Result" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="Pass">Pass</SelectItem>
                        <SelectItem value="Fail">Fail</SelectItem>
                        <SelectItem value="N/A">N/A</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {r.result === "Fail" && (
                    <div className="pl-4 space-y-2">
                      <Textarea placeholder="Deficiency description" value={r.deficiencyDescription}
                        onChange={e => { const u = [...results]; u[i] = { ...u[i], deficiencyDescription: e.target.value }; setResults(u); }}
                        rows={1} className="text-sm" />
                      <Textarea placeholder="Corrective action" value={r.correctiveAction}
                        onChange={e => { const u = [...results]; u[i] = { ...u[i], correctiveAction: e.target.value }; setResults(u); }}
                        rows={1} className="text-sm" />
                    </div>
                  )}
                  <Input placeholder="Notes" value={r.notes}
                    onChange={e => { const u = [...results]; u[i] = { ...u[i], notes: e.target.value }; setResults(u); }}
                    className="text-sm" />
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => {
                      const inp = document.createElement("input");
                      inp.type = "file"; inp.accept = "image/*";
                      inp.onchange = async () => {
                        const file = inp.files?.[0];
                        if (!file) return;
                        const res = await uploadFile(file);
                        if (res) {
                          const u = [...results]; u[i] = { ...u[i], photoUrl: res.objectPath }; setResults(u);
                          toast({ title: "Photo uploaded" });
                        }
                      };
                      inp.click();
                    }}>
                      <Camera className="h-3 w-3 mr-1" /> {r.photoUrl ? "Replace" : "Photo"}
                    </Button>
                    {r.photoUrl && (
                      <div className="flex items-center gap-1">
                        <img src={r.photoUrl} alt="Result" className="h-8 w-8 rounded object-cover border" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => { const u = [...results]; u[i] = { ...u[i], photoUrl: "" }; setResults(u); }}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveResults} disabled={saveResults.isPending}>
                  {saveResults.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save Results
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowResultsForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onEdit(inspection)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
          {!showResultsForm && (
            <Button size="sm" onClick={initResults}>
              <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> {inspection.results?.length ? "Edit Results" : "Record Results"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncidentsPanel({ projectId, organizationId }: { projectId: number; organizationId: number }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const { toast } = useToast();

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (statusFilter) f.status = statusFilter;
    if (severityFilter) f.severity = severityFilter;
    return f;
  }, [statusFilter, severityFilter]);

  const { data: items = [], isLoading } = useIncidents(projectId, filters);
  const createMutation = useCreateIncident(projectId);
  const updateMutation = useUpdateIncident(projectId);
  const deleteMutation = useDeleteIncident(projectId);
  const members = useOrgMembers(organizationId);

  const filtered = useMemo(() => {
    if (!searchTerm) return items;
    const lower = searchTerm.toLowerCase();
    return items.filter(i => i.title.toLowerCase().includes(lower) || i.number.toLowerCase().includes(lower));
  }, [items, searchTerm]);

  const [form, setForm] = useState({
    title: "", description: "", incidentDate: "", incidentTime: "", location: "",
    category: "", severity: "Minor" as string, status: "Reported" as string,
    injuredParties: "", witnesses: "", rootCause: "", immediateActions: "",
    assignedTo: "", assignedToName: "",
  });

  const resetForm = () => setForm({
    title: "", description: "", incidentDate: "", incidentTime: "", location: "",
    category: "", severity: "Minor", status: "Reported",
    injuredParties: "", witnesses: "", rootCause: "", immediateActions: "",
    assignedTo: "", assignedToName: "",
  });

  const openEdit = (item: Incident) => {
    setForm({
      title: item.title || "",
      description: item.description || "",
      incidentDate: item.incidentDate ? format(new Date(item.incidentDate), "yyyy-MM-dd") : "",
      incidentTime: item.incidentTime || "",
      location: item.location || "",
      category: item.category || "",
      severity: item.severity,
      status: item.status,
      injuredParties: item.injuredParties || "",
      witnesses: item.witnesses || "",
      rootCause: item.rootCause || "",
      immediateActions: item.immediateActions || "",
      assignedTo: item.assignedTo || "",
      assignedToName: item.assignedToName || "",
    });
    setEditingId(item.id);
  };

  const handleSubmit = async () => {
    const data: Record<string, unknown> = {
      title: form.title,
      description: form.description || null,
      incidentDate: form.incidentDate || null,
      incidentTime: form.incidentTime || null,
      location: form.location || null,
      category: form.category || null,
      severity: form.severity,
      status: form.status,
      injuredParties: form.injuredParties || null,
      witnesses: form.witnesses || null,
      rootCause: form.rootCause || null,
      immediateActions: form.immediateActions || null,
      assignedTo: form.assignedTo || null,
      assignedToName: form.assignedToName || null,
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...data });
        toast({ title: "Incident updated" });
        setEditingId(null);
      } else {
        await createMutation.mutateAsync(data);
        toast({ title: "Incident reported" });
        setShowCreate(false);
      }
      resetForm();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search incidents..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-[200px]" />
          </div>
          <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {INCIDENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={severityFilter || "all"} onValueChange={v => setSeverityFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Severities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              {INCIDENT_SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Report Incident
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No incidents found</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <Card key={item.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewingId(item.id)}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground shrink-0">{item.number}</span>
                    <span className="font-medium truncate">{item.title}</span>
                    <Badge className={incidentStatusConfig[item.status]?.bg ?? ""}>{item.status}</Badge>
                    <Badge className={severityConfig[item.severity]?.bg ?? ""}>{item.severity}</Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.incidentDate && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {format(new Date(item.incidentDate), "MMM d, yyyy")}
                      </span>
                    )}
                    <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); openEdit(item); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={e => {
                      e.stopPropagation();
                      if (confirm("Delete this incident?")) deleteMutation.mutate(item.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate || editingId !== null} onOpenChange={open => { if (!open) { setShowCreate(false); setEditingId(null); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Incident" : "Report Incident"}</DialogTitle>
            <DialogDescription>{editingId ? "Update incident details" : "Report a new incident"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Incident Date</Label>
                <Input type="date" value={form.incidentDate} onChange={e => setForm(f => ({ ...f, incidentDate: e.target.value }))} />
              </div>
              <div>
                <Label>Incident Time</Label>
                <Input type="time" value={form.incidentTime} onChange={e => setForm(f => ({ ...f, incidentTime: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div>
                <Label>Category</Label>
                <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g., Fall, Electrical" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INCIDENT_SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INCIDENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Assigned To</Label>
              {members.length > 0 ? (
                <Select value={form.assignedTo || "unassigned"} onValueChange={v => {
                  if (v === "unassigned") {
                    setForm(f => ({ ...f, assignedTo: "", assignedToName: "" }));
                  } else {
                    const m = members.find(m => m.userId === v);
                    setForm(f => ({ ...f, assignedTo: v, assignedToName: m ? getMemberDisplayName(m) : "" }));
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {members.map(m => <SelectItem key={m.userId} value={m.userId}>{getMemberDisplayName(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.assignedToName} onChange={e => setForm(f => ({ ...f, assignedToName: e.target.value }))} placeholder="Assignee name" />
              )}
            </div>
            <div>
              <Label>Injured Parties</Label>
              <Textarea value={form.injuredParties} onChange={e => setForm(f => ({ ...f, injuredParties: e.target.value }))} rows={1} />
            </div>
            <div>
              <Label>Witnesses</Label>
              <Textarea value={form.witnesses} onChange={e => setForm(f => ({ ...f, witnesses: e.target.value }))} rows={1} />
            </div>
            <div>
              <Label>Root Cause</Label>
              <Textarea value={form.rootCause} onChange={e => setForm(f => ({ ...f, rootCause: e.target.value }))} rows={1} />
            </div>
            <div>
              <Label>Immediate Actions Taken</Label>
              <Textarea value={form.immediateActions} onChange={e => setForm(f => ({ ...f, immediateActions: e.target.value }))} rows={1} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditingId(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.title || createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingId ? "Update" : "Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewingId && (
        <IncidentDetailDialog
          projectId={projectId}
          incidentId={viewingId}
          organizationId={organizationId}
          onClose={() => setViewingId(null)}
          onEdit={item => { setViewingId(null); openEdit(item); }}
        />
      )}
    </div>
  );
}

function IncidentDetailDialog({ projectId, incidentId, organizationId, onClose, onEdit }: {
  projectId: number; incidentId: number; organizationId: number;
  onClose: () => void; onEdit: (item: Incident) => void;
}) {
  const { data: incident, isLoading } = useIncident(projectId, incidentId);
  const members = useOrgMembers(organizationId);
  const createAction = useCreateIncidentAction(projectId, incidentId);
  const updateAction = useUpdateIncidentAction(projectId, incidentId);
  const { toast } = useToast();
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionForm, setActionForm] = useState({
    actionType: "Corrective", description: "", assignedTo: "", assignedToName: "",
    dueDate: "", status: "Open" as string, notes: "",
  });

  const handleAddAction = async () => {
    try {
      await createAction.mutateAsync({
        actionType: actionForm.actionType,
        description: actionForm.description,
        assignedTo: actionForm.assignedTo || null,
        assignedToName: actionForm.assignedToName || null,
        dueDate: actionForm.dueDate || null,
        status: actionForm.status,
        notes: actionForm.notes || null,
      });
      toast({ title: "Action added" });
      setShowActionForm(false);
      setActionForm({ actionType: "Corrective", description: "", assignedTo: "", assignedToName: "", dueDate: "", status: "Open", notes: "" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  if (isLoading || !incident) return null;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">{incident.number}</span>
            {incident.title}
          </DialogTitle>
          <DialogDescription>
            <Badge className={incidentStatusConfig[incident.status]?.bg ?? ""}>{incident.status}</Badge>
            <Badge className={cn("ml-2", severityConfig[incident.severity]?.bg ?? "")}>{incident.severity}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {incident.description && <div><Label className="text-muted-foreground">Description</Label><p className="text-sm mt-1">{incident.description}</p></div>}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {incident.incidentDate && <div><span className="text-muted-foreground">Date:</span> {format(new Date(incident.incidentDate), "MMM d, yyyy")}</div>}
            {incident.incidentTime && <div><span className="text-muted-foreground">Time:</span> {incident.incidentTime}</div>}
            {incident.location && <div><span className="text-muted-foreground">Location:</span> {incident.location}</div>}
            {incident.category && <div><span className="text-muted-foreground">Category:</span> {incident.category}</div>}
            {incident.assignedToName && <div><span className="text-muted-foreground">Assigned to:</span> {incident.assignedToName}</div>}
            {incident.reportedByName && <div><span className="text-muted-foreground">Reported by:</span> {incident.reportedByName}</div>}
          </div>
          {incident.injuredParties && <div><Label className="text-muted-foreground">Injured Parties</Label><p className="text-sm mt-1">{incident.injuredParties}</p></div>}
          {incident.witnesses && <div><Label className="text-muted-foreground">Witnesses</Label><p className="text-sm mt-1">{incident.witnesses}</p></div>}
          {incident.rootCause && <div><Label className="text-muted-foreground">Root Cause</Label><p className="text-sm mt-1">{incident.rootCause}</p></div>}
          {incident.immediateActions && <div><Label className="text-muted-foreground">Immediate Actions</Label><p className="text-sm mt-1">{incident.immediateActions}</p></div>}

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-medium">Corrective Actions ({incident.actions?.length ?? 0})</Label>
              <Button size="sm" variant="outline" onClick={() => setShowActionForm(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Action
              </Button>
            </div>
            {incident.actions && incident.actions.length > 0 && (
              <div className="space-y-2">
                {incident.actions.map(action => (
                  <div key={action.id} className="border rounded p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{action.description}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{action.status}</Badge>
                        {action.status !== "Completed" && (
                          <Button size="sm" variant="ghost" onClick={() => {
                            updateAction.mutate({ id: action.id, status: "Completed" });
                          }}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      {action.assignedToName && <span>Assigned: {action.assignedToName}</span>}
                      {action.dueDate && <span>Due: {action.dueDate}</span>}
                      <span>Type: {action.actionType}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showActionForm && (
              <div className="border rounded p-3 mt-2 space-y-2">
                <Textarea placeholder="Action description *" value={actionForm.description}
                  onChange={e => setActionForm(f => ({ ...f, description: e.target.value }))} rows={2} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Assigned To</Label>
                    {members.length > 0 ? (
                      <Select value={actionForm.assignedTo || "unassigned"} onValueChange={v => {
                        if (v === "unassigned") {
                          setActionForm(f => ({ ...f, assignedTo: "", assignedToName: "" }));
                        } else {
                          const m = members.find(m => m.userId === v);
                          setActionForm(f => ({ ...f, assignedTo: v, assignedToName: m ? getMemberDisplayName(m) : "" }));
                        }
                      }}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {members.map(m => <SelectItem key={m.userId} value={m.userId}>{getMemberDisplayName(m)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={actionForm.assignedToName} onChange={e => setActionForm(f => ({ ...f, assignedToName: e.target.value }))} />
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Due Date</Label>
                    <Input type="date" value={actionForm.dueDate} onChange={e => setActionForm(f => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddAction} disabled={!actionForm.description || createAction.isPending}>
                    {createAction.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Add
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowActionForm(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onEdit(incident)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ObservationsPanel({ projectId, organizationId }: { projectId: number; organizationId: number }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const { toast } = useToast();

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (statusFilter) f.status = statusFilter;
    if (categoryFilter) f.category = categoryFilter;
    return f;
  }, [statusFilter, categoryFilter]);

  const { data: items = [], isLoading } = useObservations(projectId, filters);
  const createMutation = useCreateObservation(projectId);
  const updateMutation = useUpdateObservation(projectId);
  const deleteMutation = useDeleteObservation(projectId);
  const members = useOrgMembers(organizationId);

  const filtered = useMemo(() => {
    if (!searchTerm) return items;
    const lower = searchTerm.toLowerCase();
    return items.filter(i => i.title.toLowerCase().includes(lower) || i.number.toLowerCase().includes(lower));
  }, [items, searchTerm]);

  const { uploadFile, isUploading } = useUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "", description: "", category: "Safety" as string, observationType: "Negative" as string,
    location: "", severity: "Low", status: "Open" as string,
    correctiveAction: "", assignedTo: "", assignedToName: "",
    dueDate: "", observedDate: "", photoUrl: "",
  });

  const resetForm = () => setForm({
    title: "", description: "", category: "Safety", observationType: "Negative",
    location: "", severity: "Low", status: "Open",
    correctiveAction: "", assignedTo: "", assignedToName: "",
    dueDate: "", observedDate: "", photoUrl: "",
  });

  const handlePhotoUpload = async (file: File) => {
    const result = await uploadFile(file);
    if (result) {
      setForm(f => ({ ...f, photoUrl: result.objectPath }));
      toast({ title: "Photo uploaded" });
    }
  };

  const openEdit = (item: Observation) => {
    setForm({
      title: item.title || "",
      description: item.description || "",
      category: item.category || "Safety",
      observationType: item.observationType || "Negative",
      location: item.location || "",
      severity: item.severity || "Low",
      status: item.status,
      correctiveAction: item.correctiveAction || "",
      assignedTo: item.assignedTo || "",
      assignedToName: item.assignedToName || "",
      dueDate: item.dueDate || "",
      observedDate: item.observedDate || "",
      photoUrl: item.photoUrl || "",
    });
    setEditingId(item.id);
  };

  const handleSubmit = async () => {
    const data: Record<string, unknown> = {
      title: form.title,
      description: form.description || null,
      category: form.category,
      observationType: form.observationType,
      location: form.location || null,
      severity: form.severity || null,
      status: form.status,
      correctiveAction: form.correctiveAction || null,
      assignedTo: form.assignedTo || null,
      assignedToName: form.assignedToName || null,
      dueDate: form.dueDate || null,
      observedDate: form.observedDate || null,
      photoUrl: form.photoUrl || null,
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...data });
        toast({ title: "Observation updated" });
        setEditingId(null);
      } else {
        await createMutation.mutateAsync(data);
        toast({ title: "Observation created" });
        setShowCreate(false);
      }
      resetForm();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search observations..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-[200px]" />
          </div>
          <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {OBSERVATION_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter || "all"} onValueChange={v => setCategoryFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {OBSERVATION_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Observation
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No observations found</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <Card key={item.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewingId(item.id)}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground shrink-0">{item.number}</span>
                    <span className="font-medium truncate">{item.title}</span>
                    <Badge className={observationStatusConfig[item.status]?.bg ?? ""}>{item.status}</Badge>
                    <Badge variant={item.observationType === "Positive" ? "default" : "destructive"}>
                      {item.observationType}
                    </Badge>
                    <Badge variant="outline">{item.category}</Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.assignedToName && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> {item.assignedToName}
                      </span>
                    )}
                    <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); openEdit(item); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={e => {
                      e.stopPropagation();
                      if (confirm("Delete this observation?")) deleteMutation.mutate(item.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate || editingId !== null} onOpenChange={open => { if (!open) { setShowCreate(false); setEditingId(null); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Observation" : "New Observation"}</DialogTitle>
            <DialogDescription>{editingId ? "Update observation details" : "Record a new observation"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OBSERVATION_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.observationType} onValueChange={v => setForm(f => ({ ...f, observationType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OBSERVATION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OBSERVATION_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Observed Date</Label>
                <Input type="date" value={form.observedDate} onChange={e => setForm(f => ({ ...f, observedDate: e.target.value }))} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Assigned To</Label>
              {members.length > 0 ? (
                <Select value={form.assignedTo || "unassigned"} onValueChange={v => {
                  if (v === "unassigned") {
                    setForm(f => ({ ...f, assignedTo: "", assignedToName: "" }));
                  } else {
                    const m = members.find(m => m.userId === v);
                    setForm(f => ({ ...f, assignedTo: v, assignedToName: m ? getMemberDisplayName(m) : "" }));
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {members.map(m => <SelectItem key={m.userId} value={m.userId}>{getMemberDisplayName(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.assignedToName} onChange={e => setForm(f => ({ ...f, assignedToName: e.target.value }))} placeholder="Assignee name" />
              )}
            </div>
            <div>
              <Label>Corrective Action</Label>
              <Textarea value={form.correctiveAction} onChange={e => setForm(f => ({ ...f, correctiveAction: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label>Photo</Label>
              <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }} />
              <div className="flex items-center gap-2 mt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                  {isUploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Camera className="h-4 w-4 mr-1" />}
                  {form.photoUrl ? "Replace Photo" : "Upload Photo"}
                </Button>
                {form.photoUrl && (
                  <div className="flex items-center gap-2">
                    <img src={form.photoUrl} alt="Observation" className="h-10 w-10 rounded object-cover border" />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, photoUrl: "" }))}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditingId(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.title || createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewingId && (
        <ObservationDetailDialog
          projectId={projectId}
          observationId={viewingId}
          organizationId={organizationId}
          onClose={() => setViewingId(null)}
          onEdit={item => { setViewingId(null); openEdit(item); }}
        />
      )}
    </div>
  );
}

function ObservationDetailDialog({ projectId, observationId, organizationId, onClose, onEdit }: {
  projectId: number; observationId: number; organizationId: number;
  onClose: () => void; onEdit: (item: Observation) => void;
}) {
  const { data: observation, isLoading } = useObservation(projectId, observationId);
  const members = useOrgMembers(organizationId);
  const createAction = useCreateObservationAction(projectId, observationId);
  const updateAction = useUpdateObservationAction(projectId, observationId);
  const { toast } = useToast();
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionForm, setActionForm] = useState({
    actionType: "Corrective", description: "", assignedTo: "", assignedToName: "",
    dueDate: "", status: "Open" as string, notes: "",
  });

  const handleAddAction = async () => {
    try {
      await createAction.mutateAsync({
        actionType: actionForm.actionType,
        description: actionForm.description,
        assignedTo: actionForm.assignedTo || null,
        assignedToName: actionForm.assignedToName || null,
        dueDate: actionForm.dueDate || null,
        status: actionForm.status,
        notes: actionForm.notes || null,
      });
      toast({ title: "Action added" });
      setShowActionForm(false);
      setActionForm({ actionType: "Corrective", description: "", assignedTo: "", assignedToName: "", dueDate: "", status: "Open", notes: "" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  if (isLoading || !observation) return null;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">{observation.number}</span>
            {observation.title}
          </DialogTitle>
          <DialogDescription>
            <Badge className={observationStatusConfig[observation.status]?.bg ?? ""}>{observation.status}</Badge>
            <Badge className="ml-2" variant={observation.observationType === "Positive" ? "default" : "destructive"}>
              {observation.observationType}
            </Badge>
            <Badge className="ml-2" variant="outline">{observation.category}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {observation.description && <div><Label className="text-muted-foreground">Description</Label><p className="text-sm mt-1">{observation.description}</p></div>}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {observation.location && <div><span className="text-muted-foreground">Location:</span> {observation.location}</div>}
            {observation.severity && <div><span className="text-muted-foreground">Severity:</span> {observation.severity}</div>}
            {observation.observedDate && <div><span className="text-muted-foreground">Observed:</span> {observation.observedDate}</div>}
            {observation.dueDate && <div><span className="text-muted-foreground">Due:</span> {observation.dueDate}</div>}
            {observation.assignedToName && <div><span className="text-muted-foreground">Assigned to:</span> {observation.assignedToName}</div>}
            {observation.observedByName && <div><span className="text-muted-foreground">Observed by:</span> {observation.observedByName}</div>}
          </div>
          {observation.correctiveAction && <div><Label className="text-muted-foreground">Corrective Action</Label><p className="text-sm mt-1">{observation.correctiveAction}</p></div>}

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-medium">Follow-up Actions ({observation.actions?.length ?? 0})</Label>
              <Button size="sm" variant="outline" onClick={() => setShowActionForm(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Action
              </Button>
            </div>
            {observation.actions && observation.actions.length > 0 && (
              <div className="space-y-2">
                {observation.actions.map(action => (
                  <div key={action.id} className="border rounded p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{action.description}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{action.status}</Badge>
                        {action.status !== "Completed" && (
                          <Button size="sm" variant="ghost" onClick={() => {
                            updateAction.mutate({ id: action.id, status: "Completed" });
                          }}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      {action.assignedToName && <span>Assigned: {action.assignedToName}</span>}
                      {action.dueDate && <span>Due: {action.dueDate}</span>}
                      <span>Type: {action.actionType}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showActionForm && (
              <div className="border rounded p-3 mt-2 space-y-2">
                <Textarea placeholder="Action description *" value={actionForm.description}
                  onChange={e => setActionForm(f => ({ ...f, description: e.target.value }))} rows={2} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Assigned To</Label>
                    {members.length > 0 ? (
                      <Select value={actionForm.assignedTo || "unassigned"} onValueChange={v => {
                        if (v === "unassigned") {
                          setActionForm(f => ({ ...f, assignedTo: "", assignedToName: "" }));
                        } else {
                          const m = members.find(m => m.userId === v);
                          setActionForm(f => ({ ...f, assignedTo: v, assignedToName: m ? getMemberDisplayName(m) : "" }));
                        }
                      }}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {members.map(m => <SelectItem key={m.userId} value={m.userId}>{getMemberDisplayName(m)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={actionForm.assignedToName} onChange={e => setActionForm(f => ({ ...f, assignedToName: e.target.value }))} />
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Due Date</Label>
                    <Input type="date" value={actionForm.dueDate} onChange={e => setActionForm(f => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddAction} disabled={!actionForm.description || createAction.isPending}>
                    {createAction.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Add
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowActionForm(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onEdit(observation)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesPanel({ projectId }: { projectId: number }) {
  const { data: templates = [], isLoading } = useInspectionTemplates(projectId);
  const createMutation = useCreateInspectionTemplate(projectId);
  const deleteMutation = useDeleteInspectionTemplate(projectId);
  const [showCreate, setShowCreate] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "", description: "", category: "",
    items: [{ section: "", itemText: "", itemType: "pass_fail", sortOrder: 0, isRequired: true }] as Array<{
      section: string; itemText: string; itemType: string; sortOrder: number; isRequired: boolean;
    }>,
  });

  const resetForm = () => setForm({
    name: "", description: "", category: "",
    items: [{ section: "", itemText: "", itemType: "pass_fail", sortOrder: 0, isRequired: true }],
  });

  const addItem = () => {
    setForm(f => ({
      ...f,
      items: [...f.items, { section: "", itemText: "", itemType: "pass_fail", sortOrder: f.items.length, isRequired: true }],
    }));
  };

  const removeItem = (idx: number) => {
    if (form.items.length <= 1) return;
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx).map((item, i) => ({ ...item, sortOrder: i })) }));
  };

  const handleSubmit = async () => {
    try {
      await createMutation.mutateAsync({
        name: form.name,
        description: form.description || null,
        category: form.category || null,
        items: form.items.map(item => ({
          section: item.section || null,
          itemText: item.itemText,
          itemType: item.itemType,
          sortOrder: item.sortOrder,
          isRequired: item.isRequired,
        })),
      });
      toast({ title: "Template created" });
      setShowCreate(false);
      resetForm();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Inspection Templates</h3>
        <Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : templates.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No templates yet. Create one to standardize your inspections.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <Card key={t.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewingId(t.id)}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{t.name}</span>
                    {t.category && <Badge variant="outline">{t.category}</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {t.createdByName && <span className="text-xs text-muted-foreground">{t.createdByName}</span>}
                    <Button size="sm" variant="ghost" onClick={e => {
                      e.stopPropagation();
                      if (confirm("Delete this template?")) deleteMutation.mutate(t.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                {t.description && <p className="text-sm text-muted-foreground mt-1 ml-7">{t.description}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {viewingId && <TemplateDetailDialog projectId={projectId} templateId={viewingId} onClose={() => setViewingId(null)} />}

      <Dialog open={showCreate} onOpenChange={open => { if (!open) { setShowCreate(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Inspection Template</DialogTitle>
            <DialogDescription>Define checklist items for standardized inspections</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Template Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              </div>
              <div>
                <Label>Category</Label>
                <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g., Safety, MEP, Fire" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-medium">Checklist Items *</Label>
                <Button size="sm" variant="outline" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {form.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 border rounded p-2">
                    <span className="text-xs text-muted-foreground mt-2 w-6">{i + 1}.</span>
                    <div className="flex-1 space-y-1">
                      <Input placeholder="Check item text *" value={item.itemText}
                        onChange={e => {
                          const updated = [...form.items];
                          updated[i] = { ...updated[i], itemText: e.target.value };
                          setForm(f => ({ ...f, items: updated }));
                        }} className="text-sm" />
                      <div className="flex gap-2">
                        <Input placeholder="Section (optional)" value={item.section}
                          onChange={e => {
                            const updated = [...form.items];
                            updated[i] = { ...updated[i], section: e.target.value };
                            setForm(f => ({ ...f, items: updated }));
                          }} className="text-sm w-1/2" />
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeItem(i)} disabled={form.items.length <= 1}>
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit}
              disabled={!form.name || form.items.some(i => !i.itemText) || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateDetailDialog({ projectId, templateId, onClose }: {
  projectId: number; templateId: number; onClose: () => void;
}) {
  const { data: template, isLoading } = useInspectionTemplate(projectId, templateId);

  if (isLoading || !template) return null;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>
            {template.category && <Badge variant="outline" className="mr-2">{template.category}</Badge>}
            {template.items?.length ?? 0} checklist items
          </DialogDescription>
        </DialogHeader>
        {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
        <div className="space-y-1">
          {template.items?.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2 text-sm border rounded px-3 py-2">
              <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
              {item.section && <Badge variant="outline" className="text-xs">{item.section}</Badge>}
              <span>{item.itemText}</span>
              {item.isRequired && <span className="text-xs text-red-500">*</span>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
