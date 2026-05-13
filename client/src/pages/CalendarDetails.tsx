import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft, Plus, Trash2, PlayCircle } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import {
  useCalendar,
  useReplaceWorkingWeek,
  useCreateException,
  useDeleteException,
  useCreateRecurringException,
  useDeleteRecurringException,
  useSimulateCalendar,
} from "@/hooks/use-calendars";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type ShiftRow = { id: string; dayOfWeek: number; start: string; end: string };

function minToHHMM(m: number): string {
  const h = Math.floor(m / 60); const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}
function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export default function CalendarDetails() {
  const params = useParams();
  const id = Number(params.id);
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { toast } = useToast();
  const { data: cal, isLoading } = useCalendar(id);

  const replaceWeek = useReplaceWorkingWeek(id, orgId);
  const createExc = useCreateException(id, orgId);
  const deleteExc = useDeleteException(id, orgId);
  const createRec = useCreateRecurringException(id, orgId);
  const deleteRec = useDeleteRecurringException(id, orgId);
  const simulate = useSimulateCalendar(id);

  const [shifts, setShifts] = useState<ShiftRow[]>([]);

  useEffect(() => {
    if (!cal) return;
    setShifts(cal.shifts.map((s, i) => ({
      id: `${s.id ?? `n${i}`}`,
      dayOfWeek: s.dayOfWeek,
      start: minToHHMM(s.startMinute),
      end: minToHHMM(s.endMinute),
    })));
  }, [cal]);

  async function saveWeek() {
    try {
      const payload = shifts.map((s, i) => ({
        dayOfWeek: s.dayOfWeek,
        startMinute: hhmmToMin(s.start),
        endMinute: hhmmToMin(s.end),
        position: i,
      }));
      for (const p of payload) {
        if (p.endMinute <= p.startMinute) {
          toast({ title: "Invalid shift", description: `${DOW_LABELS[p.dayOfWeek]}: end must be after start.`, variant: "destructive" });
          return;
        }
      }
      await replaceWeek.mutateAsync(payload);
      toast({ title: "Working week saved" });
    } catch (err: any) {
      toast({ title: "Failed to save week", description: err?.message, variant: "destructive" });
    }
  }

  function addShift(dow: number) {
    setShifts([...shifts, { id: `new-${Date.now()}-${Math.random()}`, dayOfWeek: dow, start: "09:00", end: "17:00" }]);
  }
  function removeShift(rowId: string) {
    setShifts(shifts.filter(s => s.id !== rowId));
  }
  function updateShift(rowId: string, patch: Partial<ShiftRow>) {
    setShifts(shifts.map(s => s.id === rowId ? { ...s, ...patch } : s));
  }

  // ---- Exception form state ----
  const [exName, setExName] = useState("");
  const [exStart, setExStart] = useState("");
  const [exEnd, setExEnd] = useState("");
  const [exWorking, setExWorking] = useState(false);

  async function addException() {
    if (!exName.trim() || !exStart || !exEnd) return;
    try {
      await createExc.mutateAsync({
        name: exName.trim(),
        startDate: exStart,
        endDate: exEnd,
        isWorking: exWorking,
        intervals: null,
      } as any);
      setExName(""); setExStart(""); setExEnd(""); setExWorking(false);
      toast({ title: "Exception added" });
    } catch (err: any) {
      toast({ title: "Failed to add exception", description: err?.message, variant: "destructive" });
    }
  }

  // ---- Recurring form state ----
  const [recName, setRecName] = useState("");
  const [recType, setRecType] = useState<"annual_date" | "nth_weekday_of_month" | "annual_range">("annual_date");
  const [recMonth, setRecMonth] = useState(1);
  const [recDom, setRecDom] = useState(1);
  const [recWeek, setRecWeek] = useState(1);
  const [recDow, setRecDow] = useState(1);
  const [recEndMonth, setRecEndMonth] = useState(1);
  const [recEndDom, setRecEndDom] = useState(2);
  const [recIsWorking, setRecIsWorking] = useState(false);

  async function addRecurring() {
    if (!recName.trim()) return;
    const payload: any = { name: recName.trim(), recurrenceType: recType, isWorking: recIsWorking, intervals: null };
    if (recType === "annual_date") { payload.month = recMonth; payload.dayOfMonth = recDom; }
    else if (recType === "nth_weekday_of_month") { payload.month = recMonth; payload.weekOfMonth = recWeek; payload.dayOfWeek = recDow; }
    else { payload.month = recMonth; payload.dayOfMonth = recDom; payload.endMonth = recEndMonth; payload.endDayOfMonth = recEndDom; }
    try {
      await createRec.mutateAsync(payload);
      setRecName("");
      toast({ title: "Recurring rule added" });
    } catch (err: any) {
      toast({ title: "Failed to add rule", description: err?.message, variant: "destructive" });
    }
  }

  // ---- Simulator ----
  const [simStart, setSimStart] = useState("");
  const [simHours, setSimHours] = useState(8);
  const [simResult, setSimResult] = useState<string>("");

  async function runSim() {
    if (!simStart) return;
    try {
      const res = await simulate.mutateAsync({ mode: "finish_from_start", startDate: new Date(simStart).toISOString(), hours: simHours });
      setSimResult(`Finish: ${new Date(res.finish).toLocaleString()}`);
    } catch (err: any) {
      setSimResult(`Error: ${err?.message}`);
    }
  }

  const grouped = useMemo(() => {
    const out: Record<number, ShiftRow[]> = {};
    for (let d = 0; d < 7; d++) out[d] = [];
    for (const s of shifts) out[s.dayOfWeek].push(s);
    return out;
  }, [shifts]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!cal) return <div className="p-6 text-sm text-muted-foreground">Calendar not found.</div>;

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-calendar-details">
      <div className="flex items-center gap-3">
        <Link href="/calendars" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{cal.name}</h1>
        {cal.description && <p className="text-sm text-muted-foreground mt-1">{cal.description}</p>}
        <div className="mt-2 flex gap-2">
          {cal.isDefault && <Badge variant="secondary">Default</Badge>}
          {cal.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
        </div>
      </div>

      <Tabs defaultValue="week">
        <TabsList>
          <TabsTrigger value="week" data-testid="tab-week">Working Week</TabsTrigger>
          <TabsTrigger value="exceptions" data-testid="tab-exceptions">Exceptions</TabsTrigger>
          <TabsTrigger value="recurring" data-testid="tab-recurring">Recurring</TabsTrigger>
          <TabsTrigger value="simulate" data-testid="tab-simulate">Simulator</TabsTrigger>
        </TabsList>

        <TabsContent value="week">
          <Card>
            <CardHeader>
              <CardTitle>Default Working Week</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {DOW_LABELS.map((label, dow) => (
                <div key={dow} className="border rounded-md p-3" data-testid={`day-${dow}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{label}</div>
                    <Button size="sm" variant="ghost" onClick={() => addShift(dow)}>
                      <Plus className="h-4 w-4 mr-1" /> Add shift
                    </Button>
                  </div>
                  {grouped[dow].length === 0 ? (
                    <div className="text-sm text-muted-foreground">Non-working day.</div>
                  ) : (
                    <div className="space-y-2">
                      {grouped[dow].map((s) => (
                        <div key={s.id} className="flex items-center gap-2">
                          <Input type="time" className="w-32" value={s.start} onChange={(e) => updateShift(s.id, { start: e.target.value })} data-testid={`input-start-${s.id}`} />
                          <span className="text-muted-foreground">to</span>
                          <Input type="time" className="w-32" value={s.end} onChange={(e) => updateShift(s.id, { end: e.target.value })} data-testid={`input-end-${s.id}`} />
                          <Button size="sm" variant="ghost" onClick={() => removeShift(s.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex justify-end">
                <Button onClick={saveWeek} disabled={replaceWeek.isPending} data-testid="button-save-week">
                  {replaceWeek.isPending ? "Saving…" : "Save Working Week"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exceptions">
          <Card>
            <CardHeader><CardTitle>One-time Exceptions</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-12 gap-2 items-end p-3 border rounded-md">
                <div className="col-span-4">
                  <Label>Name</Label>
                  <Input value={exName} onChange={(e) => setExName(e.target.value)} placeholder="Christmas Day" data-testid="input-exception-name" />
                </div>
                <div className="col-span-3">
                  <Label>Start</Label>
                  <Input type="date" value={exStart} onChange={(e) => setExStart(e.target.value)} data-testid="input-exception-start" />
                </div>
                <div className="col-span-3">
                  <Label>End</Label>
                  <Input type="date" value={exEnd} onChange={(e) => setExEnd(e.target.value)} data-testid="input-exception-end" />
                </div>
                <div className="col-span-2 flex items-center gap-2 pb-2">
                  <Switch checked={exWorking} onCheckedChange={setExWorking} id="ex-working" />
                  <Label htmlFor="ex-working">Working</Label>
                </div>
                <div className="col-span-12 flex justify-end">
                  <Button onClick={addException} disabled={createExc.isPending} data-testid="button-add-exception">
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Range</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cal.exceptions.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">No exceptions yet.</TableCell></TableRow>
                  ) : cal.exceptions.map((e) => (
                    <TableRow key={e.id} data-testid={`row-exception-${e.id}`}>
                      <TableCell>{e.name}</TableCell>
                      <TableCell>{String(e.startDate)} → {String(e.endDate)}</TableCell>
                      <TableCell>{e.isWorking ? <Badge variant="outline">Working</Badge> : <Badge variant="secondary">Non-working</Badge>}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => deleteExc.mutate(e.id)} data-testid={`button-delete-exception-${e.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recurring">
          <Card>
            <CardHeader><CardTitle>Recurring Exceptions</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-12 gap-2 items-end p-3 border rounded-md">
                <div className="col-span-3">
                  <Label>Name</Label>
                  <Input value={recName} onChange={(e) => setRecName(e.target.value)} placeholder="New Year's Day" data-testid="input-recurring-name" />
                </div>
                <div className="col-span-3">
                  <Label>Type</Label>
                  <Select value={recType} onValueChange={(v) => setRecType(v as any)}>
                    <SelectTrigger data-testid="select-recurring-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual_date">Annual date</SelectItem>
                      <SelectItem value="nth_weekday_of_month">Nth weekday of month</SelectItem>
                      <SelectItem value="annual_range">Annual range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {recType === "annual_date" && (
                  <>
                    <div className="col-span-2"><Label>Month</Label><Input type="number" min={1} max={12} value={recMonth} onChange={(e) => setRecMonth(Number(e.target.value))} /></div>
                    <div className="col-span-2"><Label>Day</Label><Input type="number" min={1} max={31} value={recDom} onChange={(e) => setRecDom(Number(e.target.value))} /></div>
                  </>
                )}
                {recType === "nth_weekday_of_month" && (
                  <>
                    <div className="col-span-2"><Label>Month</Label><Input type="number" min={1} max={12} value={recMonth} onChange={(e) => setRecMonth(Number(e.target.value))} /></div>
                    <div className="col-span-2">
                      <Label>Week</Label>
                      <Select value={String(recWeek)} onValueChange={(v) => setRecWeek(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, -1].map(w => <SelectItem key={w} value={String(w)}>{w === -1 ? "Last" : `${w}`}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label>Weekday</Label>
                      <Select value={String(recDow)} onValueChange={(v) => setRecDow(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DOW_LABELS.map((l, i) => <SelectItem key={i} value={String(i)}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                {recType === "annual_range" && (
                  <>
                    <div className="col-span-1"><Label>From M</Label><Input type="number" min={1} max={12} value={recMonth} onChange={(e) => setRecMonth(Number(e.target.value))} /></div>
                    <div className="col-span-1"><Label>From D</Label><Input type="number" min={1} max={31} value={recDom} onChange={(e) => setRecDom(Number(e.target.value))} /></div>
                    <div className="col-span-1"><Label>To M</Label><Input type="number" min={1} max={12} value={recEndMonth} onChange={(e) => setRecEndMonth(Number(e.target.value))} /></div>
                    <div className="col-span-1"><Label>To D</Label><Input type="number" min={1} max={31} value={recEndDom} onChange={(e) => setRecEndDom(Number(e.target.value))} /></div>
                  </>
                )}
                <div className="col-span-12 flex items-center gap-2 pt-1">
                  <Switch id="rec-working" checked={recIsWorking} onCheckedChange={setRecIsWorking} />
                  <Label htmlFor="rec-working">Working override (otherwise non-working)</Label>
                </div>
                <div className="col-span-12 flex justify-end">
                  <Button onClick={addRecurring} disabled={createRec.isPending} data-testid="button-add-recurring">
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cal.recurring.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-sm text-muted-foreground">No recurring rules yet.</TableCell></TableRow>
                  ) : cal.recurring.map((r) => (
                    <TableRow key={r.id} data-testid={`row-recurring-${r.id}`}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.recurrenceType === "annual_date" && `${r.month}/${r.dayOfMonth} every year`}
                        {r.recurrenceType === "nth_weekday_of_month" && `${r.weekOfMonth === -1 ? "Last" : r.weekOfMonth} ${DOW_LABELS[r.dayOfWeek ?? 0]} of month ${r.month}`}
                        {r.recurrenceType === "annual_range" && `${r.month}/${r.dayOfMonth} → ${r.endMonth}/${r.endDayOfMonth}`}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => deleteRec.mutate(r.id)} data-testid={`button-delete-recurring-${r.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulate">
          <Card>
            <CardHeader><CardTitle>Calendar Simulator</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Try the engine: pick a start date/time and a number of working hours, then preview the finish moment.
              </p>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <Label>Start</Label>
                  <Input type="datetime-local" value={simStart} onChange={(e) => setSimStart(e.target.value)} data-testid="input-sim-start" />
                </div>
                <div className="col-span-3">
                  <Label>Working Hours</Label>
                  <Input type="number" min={0} step={0.5} value={simHours} onChange={(e) => setSimHours(Number(e.target.value))} data-testid="input-sim-hours" />
                </div>
                <div className="col-span-4">
                  <Button onClick={runSim} disabled={!simStart || simulate.isPending} data-testid="button-run-sim">
                    <PlayCircle className="h-4 w-4 mr-1" /> Run
                  </Button>
                </div>
              </div>
              {simResult && (
                <div className="p-3 border rounded-md bg-muted/40 text-sm" data-testid="text-sim-result">{simResult}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
