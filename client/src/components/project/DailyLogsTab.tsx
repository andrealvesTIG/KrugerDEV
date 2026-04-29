import { useState, useMemo } from "react";
import { useDailyLogs, useDailyLogSummary, useDailyLog, useCreateDailyLog, useUpdateDailyLog, useDeleteDailyLog } from "@/hooks/use-daily-logs";
import type { DailyLogWithDetails, CreateDailyLogInput, UpdateDailyLogInput } from "@/hooks/use-daily-logs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, subDays } from "date-fns";
import { Plus, Trash2, Pencil, CloudSun, Users, Wrench, Calendar, FileText, ChevronRight, Eye, Download, X } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const WEATHER_CONDITIONS = ["Sunny", "Partly Cloudy", "Cloudy", "Overcast", "Light Rain", "Rain", "Heavy Rain", "Snow", "Fog", "Wind", "Storm"];

interface LaborEntry {
  company: string;
  trade: string;
  headcount: number;
  hoursWorked: number;
  notes: string;
}

interface EquipmentEntry {
  equipmentName: string;
  quantity: number;
  hoursUsed: number;
  status: string;
  notes: string;
}

interface DailyLogFormData {
  logDate: string;
  weatherCondition: string | null;
  temperature: string | null;
  windSpeed: string | null;
  precipitation: string | null;
  visitors: string | null;
  notes: string | null;
  labor: LaborEntry[];
  equipment: EquipmentEntry[];
}

export default function DailyLogsTab({ projectId }: { projectId: number }) {
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({});
  const { data: logs = [], isLoading } = useDailyLogs(projectId, dateRange.from, dateRange.to);
  const { data: summary } = useDailyLogSummary(projectId, dateRange.from, dateRange.to);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const createMutation = useCreateDailyLog(projectId);
  const updateMutation = useUpdateDailyLog(projectId);
  const deleteMutation = useDeleteDailyLog(projectId);
  const { toast } = useToast();

  const quickFilters = [
    { label: "Last 7 days", from: format(subDays(new Date(), 7), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") },
    { label: "Last 30 days", from: format(subDays(new Date(), 30), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") },
    { label: "All", from: undefined, to: undefined },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Daily Logs</h3>
          <p className="text-sm text-muted-foreground">Track daily site activity, weather, labor, and equipment</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Daily Log
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {quickFilters.map((f) => (
          <Button
            key={f.label}
            variant={dateRange.from === f.from && dateRange.to === f.to ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange({ from: f.from, to: f.to })}
          >
            {f.label}
          </Button>
        ))}
        <div className="flex items-center gap-2 ml-2">
          <Input
            type="date"
            value={dateRange.from || ""}
            onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value || undefined }))}
            className="w-36 h-8 text-xs"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="date"
            value={dateRange.to || ""}
            onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value || undefined }))}
            className="w-36 h-8 text-xs"
          />
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <SummaryCard icon={<Calendar className="h-4 w-4" />} label="Total Days" value={summary.totalDays} />
          <SummaryCard icon={<Users className="h-4 w-4" />} label="Labor Headcount" value={summary.totalLaborHeadcount} />
          <SummaryCard icon={<Users className="h-4 w-4" />} label="Labor Hours" value={summary.totalLaborHours.toFixed(1)} />
          <SummaryCard icon={<Wrench className="h-4 w-4" />} label="Equipment Units" value={summary.totalEquipmentCount} />
          <SummaryCard icon={<Wrench className="h-4 w-4" />} label="Equipment Hours" value={summary.totalEquipmentHours.toFixed(1)} />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No daily logs found</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first daily log to start tracking site activity</p>
            <Button onClick={() => setIsCreateOpen(true)} className="mt-4" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Create Daily Log
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <DailyLogRow
              key={log.id}
              log={log}
              onView={() => { setSelectedLogId(log.id); setIsViewOpen(true); }}
              onEdit={() => { setSelectedLogId(log.id); setIsEditOpen(true); }}
              onDelete={() => setDeleteConfirmId(log.id)}
            />
          ))}
        </div>
      )}

      <CreateDailyLogDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={async (data) => {
          try {
            await createMutation.mutateAsync(data as CreateDailyLogInput);
            toast({ title: "Daily log created" });
            setIsCreateOpen(false);
          } catch (err) {
            toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to create daily log", variant: "destructive" });
          }
        }}
        isLoading={createMutation.isPending}
      />

      {selectedLogId && isViewOpen && (
        <ViewDailyLogDialog
          open={isViewOpen}
          onClose={() => { setIsViewOpen(false); setSelectedLogId(null); }}
          projectId={projectId}
          logId={selectedLogId}
        />
      )}

      {selectedLogId && isEditOpen && (
        <EditDailyLogDialog
          open={isEditOpen}
          onClose={() => { setIsEditOpen(false); setSelectedLogId(null); }}
          projectId={projectId}
          logId={selectedLogId}
          onSubmit={async (data) => {
            try {
              await updateMutation.mutateAsync({ logId: selectedLogId, data: data as UpdateDailyLogInput });
              toast({ title: "Daily log updated" });
              setIsEditOpen(false);
              setSelectedLogId(null);
            } catch (err) {
              toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update", variant: "destructive" });
            }
          }}
          isLoading={updateMutation.isPending}
        />
      )}

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Daily Log</DialogTitle>
            <DialogDescription>Are you sure you want to delete this daily log? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={async () => {
                if (deleteConfirmId) {
                  try {
                    await deleteMutation.mutateAsync(deleteConfirmId);
                    toast({ title: "Daily log deleted" });
                    setDeleteConfirmId(null);
                  } catch (err) {
                    toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to delete", variant: "destructive" });
                  }
                }
              }}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function DailyLogRow({ log, onView, onEdit, onDelete }: { log: DailyLogWithDetails | import("@shared/schema").DailyLog; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  const weatherIcon = log.weatherCondition ? getWeatherEmoji(log.weatherCondition) : null;

  return (
    <Card className="hover:bg-muted/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="flex flex-col items-center w-16 shrink-0">
              <span className="text-xs text-muted-foreground">
                {format(parseISO(log.logDate), "EEE")}
              </span>
              <span className="text-xl font-bold">
                {format(parseISO(log.logDate), "dd")}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(parseISO(log.logDate), "MMM yyyy")}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {log.weatherCondition && (
                  <Badge variant="outline" className="text-xs">
                    {weatherIcon} {log.weatherCondition}
                    {log.temperature && ` · ${log.temperature}`}
                  </Badge>
                )}
              </div>
              {log.notes && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{log.notes}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onView}>
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getWeatherEmoji(condition: string): string {
  const map: Record<string, string> = {
    Sunny: "☀️", "Partly Cloudy": "⛅", Cloudy: "☁️", Overcast: "🌥️",
    "Light Rain": "🌦️", Rain: "🌧️", "Heavy Rain": "⛈️", Snow: "❄️",
    Fog: "🌫️", Wind: "💨", Storm: "⛈️",
  };
  return map[condition] || "🌤️";
}

function DailyLogForm({
  initialData,
  onSubmit,
  isLoading,
  submitLabel,
}: {
  initialData?: DailyLogWithDetails;
  onSubmit: (data: DailyLogFormData) => void;
  isLoading: boolean;
  submitLabel: string;
}) {
  const [logDate, setLogDate] = useState(initialData?.logDate || format(new Date(), "yyyy-MM-dd"));
  const [weatherCondition, setWeatherCondition] = useState(initialData?.weatherCondition || "");
  const [temperature, setTemperature] = useState(initialData?.temperature || "");
  const [windSpeed, setWindSpeed] = useState(initialData?.windSpeed || "");
  const [precipitation, setPrecipitation] = useState(initialData?.precipitation || "");
  const [visitors, setVisitors] = useState(initialData?.visitors || "");
  const [notes, setNotes] = useState(initialData?.notes || "");

  const [laborEntries, setLaborEntries] = useState<LaborEntry[]>(
    initialData?.labor?.map((l) => ({
      company: l.company || "",
      trade: l.trade || "",
      headcount: l.headcount || 0,
      hoursWorked: Number(l.hoursWorked) || 0,
      notes: l.notes || "",
    })) || []
  );

  const [equipmentEntries, setEquipmentEntries] = useState<EquipmentEntry[]>(
    initialData?.equipment?.map((e) => ({
      equipmentName: e.equipmentName,
      quantity: e.quantity || 1,
      hoursUsed: Number(e.hoursUsed) || 0,
      status: e.status || "Active",
      notes: e.notes || "",
    })) || []
  );

  const addLabor = () => setLaborEntries([...laborEntries, { company: "", trade: "", headcount: 0, hoursWorked: 0, notes: "" }]);
  const removeLabor = (idx: number) => setLaborEntries(laborEntries.filter((_, i) => i !== idx));
  const updateLabor = <K extends keyof LaborEntry>(idx: number, field: K, value: LaborEntry[K]) => {
    const updated = [...laborEntries];
    updated[idx] = { ...updated[idx], [field]: value };
    setLaborEntries(updated);
  };

  const addEquipment = () => setEquipmentEntries([...equipmentEntries, { equipmentName: "", quantity: 1, hoursUsed: 0, status: "Active", notes: "" }]);
  const removeEquipment = (idx: number) => setEquipmentEntries(equipmentEntries.filter((_, i) => i !== idx));
  const updateEquipment = <K extends keyof EquipmentEntry>(idx: number, field: K, value: EquipmentEntry[K]) => {
    const updated = [...equipmentEntries];
    updated[idx] = { ...updated[idx], [field]: value };
    setEquipmentEntries(updated);
  };

  const handleSubmit = () => {
    onSubmit({
      logDate,
      weatherCondition: weatherCondition || null,
      temperature: temperature || null,
      windSpeed: windSpeed || null,
      precipitation: precipitation || null,
      visitors: visitors || null,
      notes: notes || null,
      labor: laborEntries.filter((l) => l.company || l.trade || l.headcount > 0),
      equipment: equipmentEntries.filter((e) => e.equipmentName),
    });
  };

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
      <div>
        <Label>Date</Label>
        <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
      </div>

      <div className="space-y-3">
        <h4 className="font-medium flex items-center gap-2">
          <CloudSun className="h-4 w-4" /> Weather
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Condition</Label>
            <Select value={weatherCondition} onValueChange={setWeatherCondition}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {WEATHER_CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c}>{getWeatherEmoji(c)} {c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Temperature</Label>
            <Input placeholder="e.g. 72°F" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Wind Speed</Label>
            <Input placeholder="e.g. 10 mph" value={windSpeed} onChange={(e) => setWindSpeed(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Precipitation</Label>
            <Input placeholder="e.g. None" value={precipitation} onChange={(e) => setPrecipitation(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            <Users className="h-4 w-4" /> Labor
          </h4>
          <Button variant="outline" size="sm" onClick={addLabor}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {laborEntries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">No labor entries yet</p>
        )}
        {laborEntries.map((entry, idx) => (
          <div key={idx} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Entry {idx + 1}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLabor(idx)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Company</Label>
                <Input value={entry.company} onChange={(e) => updateLabor(idx, "company", e.target.value)} placeholder="Company name" />
              </div>
              <div>
                <Label className="text-xs">Trade</Label>
                <Input value={entry.trade} onChange={(e) => updateLabor(idx, "trade", e.target.value)} placeholder="e.g. Electrician" />
              </div>
              <div>
                <Label className="text-xs">Headcount</Label>
                <Input type="number" value={entry.headcount} onChange={(e) => updateLabor(idx, "headcount", Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Hours Worked</Label>
                <Input type="number" step="0.5" value={entry.hoursWorked} onChange={(e) => updateLabor(idx, "hoursWorked", Number(e.target.value))} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Equipment
          </h4>
          <Button variant="outline" size="sm" onClick={addEquipment}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {equipmentEntries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">No equipment entries yet</p>
        )}
        {equipmentEntries.map((entry, idx) => (
          <div key={idx} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Entry {idx + 1}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeEquipment(idx)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Equipment Name</Label>
                <Input value={entry.equipmentName} onChange={(e) => updateEquipment(idx, "equipmentName", e.target.value)} placeholder="e.g. Crane" />
              </div>
              <div>
                <Label className="text-xs">Quantity</Label>
                <Input type="number" value={entry.quantity} onChange={(e) => updateEquipment(idx, "quantity", Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Hours Used</Label>
                <Input type="number" step="0.5" value={entry.hoursUsed} onChange={(e) => updateEquipment(idx, "hoursUsed", Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={entry.status} onValueChange={(v) => updateEquipment(idx, "status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Idle">Idle</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                    <SelectItem value="Breakdown">Breakdown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <Label>Visitors</Label>
        <Textarea
          placeholder="List any site visitors (names, organizations, purpose)"
          value={visitors}
          onChange={(e) => setVisitors(e.target.value)}
          rows={2}
        />
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea
          placeholder="General notes about the day's activities"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      <Button onClick={handleSubmit} disabled={isLoading} className="w-full">
        {isLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  );
}

function CreateDailyLogDialog({
  open,
  onClose,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: DailyLogFormData) => void;
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Daily Log</DialogTitle>
          <DialogDescription>Record daily site activity including weather, labor, and equipment</DialogDescription>
        </DialogHeader>
        <DailyLogForm onSubmit={onSubmit} isLoading={isLoading} submitLabel="Create Daily Log" />
      </DialogContent>
    </Dialog>
  );
}

function EditDailyLogDialog({
  open,
  onClose,
  projectId,
  logId,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  logId: number;
  onSubmit: (data: DailyLogFormData) => void;
  isLoading: boolean;
}) {
  const { data: log, isLoading: isLoadingLog } = useDailyLog(projectId, logId);

  if (isLoadingLog) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Daily Log</DialogTitle>
          <DialogDescription>Update the daily log entry</DialogDescription>
        </DialogHeader>
        {log && <DailyLogForm initialData={log} onSubmit={onSubmit} isLoading={isLoading} submitLabel="Save Changes" />}
      </DialogContent>
    </Dialog>
  );
}

function ViewDailyLogDialog({
  open,
  onClose,
  projectId,
  logId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  logId: number;
}) {
  const { data: log, isLoading } = useDailyLog(projectId, logId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Daily Log — {log ? format(parseISO(log.logDate), "EEEE, MMMM d, yyyy") : "Loading..."}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : log ? (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
            {(log.weatherCondition || log.temperature || log.windSpeed || log.precipitation) && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <CloudSun className="h-4 w-4" /> Weather
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {log.weatherCondition && (
                    <div>
                      <span className="text-muted-foreground">Condition:</span>{" "}
                      {getWeatherEmoji(log.weatherCondition)} {log.weatherCondition}
                    </div>
                  )}
                  {log.temperature && (
                    <div><span className="text-muted-foreground">Temperature:</span> {log.temperature}</div>
                  )}
                  {log.windSpeed && (
                    <div><span className="text-muted-foreground">Wind:</span> {log.windSpeed}</div>
                  )}
                  {log.precipitation && (
                    <div><span className="text-muted-foreground">Precipitation:</span> {log.precipitation}</div>
                  )}
                </div>
              </div>
            )}

            {log.labor && log.labor.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4" /> Labor ({log.labor.length} {log.labor.length === 1 ? "entry" : "entries"})
                </h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2 font-medium">Company</th>
                        <th className="text-left p-2 font-medium">Trade</th>
                        <th className="text-right p-2 font-medium">Headcount</th>
                        <th className="text-right p-2 font-medium">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.labor.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{l.company || "—"}</td>
                          <td className="p-2">{l.trade || "—"}</td>
                          <td className="p-2 text-right">{l.headcount || 0}</td>
                          <td className="p-2 text-right">{Number(l.hoursWorked) || 0}</td>
                        </tr>
                      ))}
                      <tr className="border-t bg-muted font-medium">
                        <td className="p-2" colSpan={2}>Total</td>
                        <td className="p-2 text-right">{log.labor.reduce((s, l) => s + (l.headcount || 0), 0)}</td>
                        <td className="p-2 text-right">{log.labor.reduce((s, l) => s + (Number(l.hoursWorked) || 0), 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {log.equipment && log.equipment.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <Wrench className="h-4 w-4" /> Equipment ({log.equipment.length} {log.equipment.length === 1 ? "item" : "items"})
                </h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2 font-medium">Equipment</th>
                        <th className="text-right p-2 font-medium">Qty</th>
                        <th className="text-right p-2 font-medium">Hours</th>
                        <th className="text-left p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.equipment.map((e, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{e.equipmentName}</td>
                          <td className="p-2 text-right">{e.quantity || 1}</td>
                          <td className="p-2 text-right">{Number(e.hoursUsed) || 0}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-xs">{e.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {log.visitors && (
              <div>
                <h4 className="font-medium mb-1">Visitors</h4>
                <p className="text-sm whitespace-pre-wrap">{log.visitors}</p>
              </div>
            )}

            {log.notes && (
              <div>
                <h4 className="font-medium mb-1">Notes</h4>
                <p className="text-sm whitespace-pre-wrap">{log.notes}</p>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
