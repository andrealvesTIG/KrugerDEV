import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  History as HistoryIcon,
  Pencil,
  Plus,
  Trash2,
  Eraser,
  Settings2,
  Search,
  Filter,
  X,
} from "lucide-react";
import { buildFiscalMonths } from "@shared/lib/fiscalCalendar";

// ----- Types -----

export interface RawChangeLog {
  id: number;
  projectId: number | null;
  changedBy: string | null;
  changedByName: string | null;
  changedAt: string | null;
  changeType: string;
  changeSummary: string | null;
  previousValues: string | null;
  newValues: string | null;
  undone: boolean;
}

interface ParsedCellPayload {
  itemKey?: string;
  type?: string;
  month?: number;
  fiscalYear?: number;
  amount?: number;
}

interface ParsedBulkCellPayload {
  fiscalYear?: number;
  cells?: Array<{
    itemKey: string;
    type: string;
    month: number;
    fiscalYear?: number;
    amount?: number;
  }>;
}

interface ParsedItemPayload {
  itemKey?: string;
  fiscalYear?: number;
  itemName?: string | null;
  financialView?: string | null;
  costCategory?: string | null;
  costSpecification?: string | null;
  category?: string | null;
  wbs?: string | null;
  comments?: string | null;
}

// ----- Helpers -----

function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function isLegacyUndoRow(h: RawChangeLog): boolean {
  const a = safeParse<{ __undo?: boolean }>(h.newValues);
  if (a && a.__undo) return true;
  const b = safeParse<{ __undo?: boolean }>(h.previousValues);
  if (b && b.__undo) return true;
  return false;
}

function fmtMoney(n: number): string {
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function monthLabel(month: number, fiscalYear: number, fyStartMonth: number): string {
  if (!month || month < 1 || month > 12) return "—";
  const months = buildFiscalMonths(fiscalYear, fyStartMonth);
  const slot = months.find((m) => m.monthNum === month);
  if (!slot) return `M${month}`;
  const date = new Date(slot.calendarYear, slot.calendarMonth - 1, 1);
  return `${format(date, "MMM")} FY${fiscalYear}`;
}

function changeTypeMeta(t: string): {
  label: string;
  Icon: typeof Pencil;
  pillClass: string;
} {
  switch (t) {
    case "cell":
      return {
        label: "Cell edit",
        Icon: Pencil,
        pillClass:
          "bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-500/30",
      };
    case "bulk_cell":
      return {
        label: "Bulk clear",
        Icon: Eraser,
        pillClass:
          "bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-1 ring-inset ring-amber-500/30",
      };
    case "item_created":
      return {
        label: "Item added",
        Icon: Plus,
        pillClass:
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
      };
    case "item_deleted":
      return {
        label: "Item deleted",
        Icon: Trash2,
        pillClass:
          "bg-red-500/10 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-500/30",
      };
    case "item_updated":
      return {
        label: "Item updated",
        Icon: Settings2,
        pillClass:
          "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-500/30",
      };
    default:
      return {
        label: t,
        Icon: Pencil,
        pillClass:
          "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
      };
  }
}

/**
 * Build a one-line, human-readable summary for a change log row. Falls back to
 * the server-supplied `changeSummary` if the JSON payload can't be parsed.
 */
export function formatChangeLogSummary(
  h: RawChangeLog,
  ctx: { fiscalYearStartMonth: number; typeLabelByKey: Record<string, string> },
): string {
  const typeUp = (k?: string) =>
    (k && ctx.typeLabelByKey[k]) || (k ? k.toUpperCase() : "");
  if (h.changeType === "cell") {
    const prev = safeParse<ParsedCellPayload>(h.previousValues);
    const next = safeParse<ParsedCellPayload>(h.newValues);
    const fy = next?.fiscalYear ?? prev?.fiscalYear;
    const month = next?.month ?? prev?.month;
    if (fy && month && next && prev) {
      // Try to recover the item name from the server summary which already
      // includes it in quotes.
      const m = h.changeSummary?.match(/^"([^"]+)"/);
      const itemName = m ? m[1] : "Item";
      const t = typeUp(next.type ?? prev.type);
      return `${t} · ${itemName} · ${monthLabel(month, fy, ctx.fiscalYearStartMonth)}: ${fmtMoney(prev.amount ?? 0)} → ${fmtMoney(next.amount ?? 0)}`;
    }
  }
  if (h.changeType === "bulk_cell") {
    const next = safeParse<ParsedBulkCellPayload>(h.newValues);
    const n = next?.cells?.length ?? 0;
    return n > 0 ? `Cleared ${n} cell${n === 1 ? "" : "s"}` : (h.changeSummary || "Bulk clear");
  }
  if (h.changeType === "item_created") {
    const next = safeParse<ParsedItemPayload>(h.newValues);
    const name = next?.itemName ?? "item";
    const view = next?.financialView ?? "—";
    const cat = next?.costCategory ?? "—";
    return `Added "${name}" (${view} › ${cat})`;
  }
  if (h.changeType === "item_deleted") {
    const prev = safeParse<ParsedItemPayload & { cells?: unknown[] }>(h.previousValues);
    const name = prev?.itemName ?? "item";
    const cellsN = Array.isArray(prev?.cells) ? prev!.cells!.length : 0;
    return cellsN > 0
      ? `Deleted "${name}" (${cellsN} cell${cellsN === 1 ? "" : "s"})`
      : `Deleted "${name}"`;
  }
  if (h.changeType === "item_updated") {
    const prev = safeParse<ParsedItemPayload>(h.previousValues);
    const next = safeParse<ParsedItemPayload>(h.newValues);
    if (prev && next) {
      const fields: string[] = [];
      const keys: Array<keyof ParsedItemPayload> = [
        "itemName",
        "financialView",
        "costCategory",
        "costSpecification",
        "wbs",
        "comments",
      ];
      for (const k of keys) {
        const a = (prev[k] ?? "") as string;
        const b = (next[k] ?? "") as string;
        if (a !== b) fields.push(k);
      }
      const name = prev.itemName ?? next.itemName ?? "item";
      if (fields.length === 0) return `Updated "${name}"`;
      return `Updated "${name}" (${fields.join(", ")})`;
    }
  }
  return h.changeSummary || h.changeType;
}

/**
 * Returns true if the change log entry directly affected the given cell. Used
 * by the per-cell history popover.
 */
export function entryTouchesCell(
  h: RawChangeLog,
  cell: { itemKey: string; type: string; month: number; fiscalYear: number },
): boolean {
  if (h.changeType === "cell") {
    const next = safeParse<ParsedCellPayload>(h.newValues);
    const prev = safeParse<ParsedCellPayload>(h.previousValues);
    const p = next ?? prev;
    if (!p) return false;
    return (
      p.itemKey === cell.itemKey &&
      p.type === cell.type &&
      Number(p.month) === cell.month &&
      Number(p.fiscalYear) === cell.fiscalYear
    );
  }
  if (h.changeType === "bulk_cell") {
    const next = safeParse<ParsedBulkCellPayload>(h.newValues);
    const fy = next?.fiscalYear;
    if (fy !== cell.fiscalYear) return false;
    return !!next?.cells?.some(
      (c) =>
        c.itemKey === cell.itemKey &&
        c.type === cell.type &&
        Number(c.month) === cell.month,
    );
  }
  if (h.changeType === "item_created" || h.changeType === "item_deleted") {
    const payload = safeParse<ParsedItemPayload>(
      h.changeType === "item_created" ? h.newValues : h.previousValues,
    );
    if (!payload) return false;
    if (payload.itemKey !== cell.itemKey) return false;
    if (payload.fiscalYear != null && Number(payload.fiscalYear) !== cell.fiscalYear) {
      return false;
    }
    return true;
  }
  return false;
}

function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

interface RowCtx {
  fiscalYearStartMonth: number;
  typeLabelByKey: Record<string, string>;
}

function HistoryRow({ h, ctx }: { h: RawChangeLog; ctx: RowCtx }) {
  const meta = changeTypeMeta(h.changeType);
  const summary = formatChangeLogSummary(h, ctx);
  const when = h.changedAt ? new Date(h.changedAt) : null;
  const Icon = meta.Icon;
  return (
    <div
      className={`group flex items-start gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors ${h.undone ? "opacity-60" : ""}`}
      data-testid={`history-row-${h.id}`}
    >
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
          {initialsOf(h.changedByName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground truncate">
            {h.changedByName || "Unknown user"}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.pillClass}`}
          >
            <Icon className="h-2.5 w-2.5" />
            {meta.label}
          </span>
          {h.undone && (
            <Badge
              variant="outline"
              className="h-4 text-[9px] uppercase tracking-wide font-semibold"
            >
              Reverted
            </Badge>
          )}
          {when && (
            <span
              className="ml-auto text-[10px] text-muted-foreground tabular-nums"
              title={when.toLocaleString()}
            >
              {format(when, "MMM d, yyyy · h:mm a")}
            </span>
          )}
        </div>
        <div
          className={`text-xs text-muted-foreground mt-0.5 break-words ${h.undone ? "line-through" : ""}`}
        >
          {summary}
        </div>
      </div>
    </div>
  );
}

// ----- Full history panel -----

interface HistoryListPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: RawChangeLog[];
  isLoading: boolean;
  fiscalYearStartMonth: number;
  typeLabelByKey: Record<string, string>;
}

export function HistoryListPanel({
  open,
  onOpenChange,
  history,
  isLoading,
  fiscalYearStartMonth,
  typeLabelByKey,
}: HistoryListPanelProps) {
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [changeTypeFilter, setChangeTypeFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const ctx: RowCtx = { fiscalYearStartMonth, typeLabelByKey };

  // Drop legacy undo rows so they don't clutter the panel.
  const cleaned = useMemo(
    () => history.filter((h) => !isLegacyUndoRow(h)),
    [history],
  );

  const userOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const h of cleaned) {
      const key = h.changedBy || h.changedByName || "unknown";
      const label = h.changedByName || "Unknown user";
      if (!seen.has(key)) seen.set(key, label);
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [cleaned]);

  const typeKeyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const h of cleaned) {
      const all = [
        safeParse<ParsedCellPayload>(h.previousValues)?.type,
        safeParse<ParsedCellPayload>(h.newValues)?.type,
      ].filter(Boolean) as string[];
      for (const k of all) set.add(k);
      const bulk = safeParse<ParsedBulkCellPayload>(h.newValues);
      if (bulk?.cells) for (const c of bulk.cells) set.add(c.type);
    }
    return Array.from(set);
  }, [cleaned]);

  const filtered = useMemo(() => {
    const fromTs = from ? parseISO(from).getTime() : -Infinity;
    const toTs = to ? parseISO(to).getTime() + 24 * 60 * 60 * 1000 : Infinity;
    const q = search.trim().toLowerCase();
    return cleaned.filter((h) => {
      if (changeTypeFilter !== "all" && h.changeType !== changeTypeFilter) return false;
      if (userFilter !== "all") {
        const key = h.changedBy || h.changedByName || "unknown";
        if (key !== userFilter) return false;
      }
      if (typeFilter !== "all") {
        const cell = safeParse<ParsedCellPayload>(h.newValues) ?? safeParse<ParsedCellPayload>(h.previousValues);
        const bulk = safeParse<ParsedBulkCellPayload>(h.newValues);
        const hits =
          cell?.type === typeFilter ||
          (bulk?.cells?.some((c) => c.type === typeFilter) ?? false);
        if (!hits) return false;
      }
      if (h.changedAt) {
        const ts = new Date(h.changedAt).getTime();
        if (ts < fromTs || ts > toTs) return false;
      }
      if (q) {
        const summary = formatChangeLogSummary(h, ctx).toLowerCase();
        const who = (h.changedByName || "").toLowerCase();
        if (!summary.includes(q) && !who.includes(q)) return false;
      }
      return true;
    });
  }, [cleaned, search, userFilter, typeFilter, changeTypeFilter, from, to, ctx]);

  const resetFilters = () => {
    setSearch("");
    setUserFilter("all");
    setTypeFilter("all");
    setChangeTypeFilter("all");
    setFrom("");
    setTo("");
  };

  const hasActiveFilters =
    !!search ||
    userFilter !== "all" ||
    typeFilter !== "all" ||
    changeTypeFilter !== "all" ||
    !!from ||
    !!to;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col p-0 gap-0"
        data-testid="sheet-financial-history"
      >
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-primary" />
            Change History
          </SheetTitle>
          <SheetDescription>
            Every edit to this project's financial grid, newest first.
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 py-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by item, user, or text…"
              className="pl-8 h-9"
              data-testid="input-history-search"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="select-history-user">
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {userOptions.map((u) => (
                  <SelectItem key={u.key} value={u.key}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-[120px] text-xs" data-testid="select-history-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {typeKeyOptions.map((k) => (
                  <SelectItem key={k} value={k}>
                    {(typeLabelByKey[k] || k).toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={changeTypeFilter} onValueChange={setChangeTypeFilter}>
              <SelectTrigger
                className="h-8 w-[140px] text-xs"
                data-testid="select-history-action"
              >
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="cell">Cell edit</SelectItem>
                <SelectItem value="bulk_cell">Bulk clear</SelectItem>
                <SelectItem value="item_created">Item added</SelectItem>
                <SelectItem value="item_updated">Item updated</SelectItem>
                <SelectItem value="item_deleted">Item deleted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-[140px] text-xs"
              data-testid="input-history-from"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-[140px] text-xs"
              data-testid="input-history-to"
            />
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs ml-auto"
                onClick={resetFilters}
                data-testid="button-history-reset-filters"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${filtered.length} of ${cleaned.length} change${cleaned.length === 1 ? "" : "s"}`}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {cleaned.length === 0
                  ? "No changes yet for this project."
                  : "No changes match these filters."}
              </div>
            ) : (
              <div className="flex flex-col">
                {filtered.map((h, i) => (
                  <div key={h.id}>
                    <HistoryRow h={h} ctx={ctx} />
                    {i < filtered.length - 1 && <Separator className="my-0.5" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ----- Per-cell popover -----

interface HistoryCellPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: React.ReactNode;
  cell: { itemKey: string; type: string; month: number; fiscalYear: number };
  history: RawChangeLog[];
  fiscalYearStartMonth: number;
  typeLabelByKey: Record<string, string>;
}

export function HistoryCellPopover({
  open,
  onOpenChange,
  anchor,
  cell,
  history,
  fiscalYearStartMonth,
  typeLabelByKey,
}: HistoryCellPopoverProps) {
  const ctx: RowCtx = { fiscalYearStartMonth, typeLabelByKey };
  const matches = useMemo(() => {
    return history
      .filter((h) => !isLegacyUndoRow(h))
      .filter((h) => entryTouchesCell(h, cell));
  }, [history, cell]);

  const label = `${(typeLabelByKey[cell.type] || cell.type).toUpperCase()} · ${monthLabel(cell.month, cell.fiscalYear, fiscalYearStartMonth)}`;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{anchor}</PopoverTrigger>
      <PopoverContent
        className="w-96 p-0"
        align="end"
        side="bottom"
        data-testid="popover-cell-history"
      >
        <div className="px-3 py-2.5 border-b">
          <div className="flex items-center gap-2">
            <HistoryIcon className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold">Cell history</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
        </div>
        <ScrollArea className="max-h-80">
          <div className="p-1">
            {matches.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No changes yet for this cell.
              </div>
            ) : (
              matches.map((h, i) => (
                <div key={h.id}>
                  <HistoryRow h={h} ctx={ctx} />
                  {i < matches.length - 1 && <Separator className="my-0.5" />}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
