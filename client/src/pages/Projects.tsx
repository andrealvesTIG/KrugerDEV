import { useState, useMemo, useRef, useCallback, useEffect, Fragment } from "react";
import { useProjects, useCreateProject, useUpdateProject } from "@/hooks/use-projects";
import { useExternalProjects } from "@/hooks/use-external-shares";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { useAllTasks } from "@/hooks/use-tasks";
import { useSidebarState } from "@/components/layout/Sidebar";
import { ExternalBadge } from "@/components/ExternalBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { z } from "zod";
import { PROJECT_STATUSES, PROJECT_HEALTH_VALUES, PROJECT_PRIORITIES } from "@shared/schema";
import type { Project, Resource, Portfolio } from "@shared/schema";
import { DEFAULT_PROJECT_STATUS_LIST } from "@/lib/project-statuses";
import { Link, useLocation } from "wouter";
import { Plus, Search, Calendar, AlertCircle, List, LayoutGrid, GanttChart, MoreVertical, Trash2, Eye, Upload, PenTool, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, ExternalLink, Table2, Settings2, Check, Crown, GripVertical, X, Maximize2, Minimize2, ArrowUp, ArrowDown, ChevronsUpDown, FileSpreadsheet, Cloud, Rocket, Lock as LockIcon, Shield, Layers, FolderOpen, MapPin } from "lucide-react";
import { ProjectsMapView } from "@/components/ProjectsMapView";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import plannerLogoPath from "@/assets/planner-logo.png";
import msprojectLogoPath from "@/assets/msproject-logo.png";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, differenceInDays, parseISO, addDays, startOfMonth, eachDayOfInterval } from "date-fns";
import { CompactCurrency } from "@/components/CompactCurrency";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn, normalizeSearch } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, TouchSensor, useSensor, useSensors, closestCorners, useDroppable, useDraggable, closestCenter } from "@dnd-kit/core";
import { useSortable, SortableContext, horizontalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/hooks/use-auth";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import ExcelJS from "exceljs";
import { ViewsDropdown, type ProjectFilterView } from "@/components/ViewsDropdown";
import { useColumnState, sortData, type SortDirection } from "@/hooks/use-column-state";
import { MicrosoftContactCard } from "@/components/MicrosoftContactCard";
import { PageTransition, FadeIn } from "@/components/ui/page-transition";
import { useCustomFieldDefinitions, useOrganizationProjectCustomFieldValues, useBulkUpdateProjectCustomFieldValues, useUpdateProjectCustomFieldValue } from "@/hooks/use-custom-fields";
import { useProjectWorkflows } from "@/hooks/use-project-workflows";
import type { CustomFieldDefinition, ProjectCustomFieldValue, ProjectWorkflow } from "@shared/schema";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function ProjectsPagination({ currentPage, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange, selectedPageSize }: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  selectedPageSize?: number;
}) {
  const isAllSelected = (selectedPageSize ?? pageSize) === Infinity;
  const startItem = isAllSelected ? 1 : (currentPage - 1) * pageSize + 1;
  const endItem = isAllSelected ? totalItems : Math.min(currentPage * pageSize, totalItems);

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between px-2 py-4 text-sm">
      <span className="text-muted-foreground">
        Showing {startItem}–{endItem} of {totalItems} projects
      </span>
      <div className="flex items-center gap-4">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Items per page</span>
            <Select
              value={isAllSelected ? "all" : String(selectedPageSize ?? pageSize)}
              onValueChange={(val) => {
                if (val === "all") {
                  onPageSizeChange(Infinity);
                } else {
                  onPageSizeChange(Number(val));
                }
              }}
            >
              <SelectTrigger className="h-8 w-[70px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {getPageNumbers().map((page, idx) =>
              page === 'ellipsis' ? (
                <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground">…</span>
              ) : (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => onPageChange(page)}
                >
                  {page}
                </Button>
              )
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  Initiation: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Planning: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  Execution: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  Monitoring: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  Closing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Billing: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  Closed: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-rose-500 text-white",
  High: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  Medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const HEALTH_CONFIG: Record<string, { dot: string; bg: string; label: string }> = {
  Green: { dot: "bg-emerald-500", bg: "bg-emerald-500", label: "On Track" },
  Yellow: { dot: "bg-amber-500", bg: "bg-amber-500", label: "At Risk" },
  Red: { dot: "bg-rose-500", bg: "bg-rose-500", label: "Off Track" },
};

interface ListColumn {
  id: string;
  label: string;
  width: string;
  align?: "left" | "right";
  alwaysVisible?: boolean;
  defaultVisible?: boolean;
}

const LIST_COLUMNS: ListColumn[] = [
  { id: "name", label: "Project", width: "minmax(0,1fr)", alwaysVisible: true, defaultVisible: true },
  { id: "status", label: "Status", width: "110px", defaultVisible: true },
  { id: "priority", label: "Priority", width: "90px", defaultVisible: true },
  { id: "health", label: "Health", width: "80px", defaultVisible: true },
  { id: "progress", label: "Progress", width: "140px", defaultVisible: true },
  { id: "budget", label: "Budget", width: "100px", align: "right", defaultVisible: true },
  { id: "endDate", label: "Due Date", width: "100px", align: "right", defaultVisible: true },
  { id: "startDate", label: "Start Date", width: "100px", align: "right", defaultVisible: false },
  { id: "projectType", label: "Type", width: "100px", defaultVisible: false },
  { id: "methodology", label: "Methodology", width: "100px", defaultVisible: false },
  { id: "workflow", label: "Workflow", width: "120px", defaultVisible: true },
  { id: "createdAt", label: "Created", width: "100px", align: "right", defaultVisible: false },
  { id: "updatedAt", label: "Updated", width: "100px", align: "right", defaultVisible: false },
  { id: "actions", label: "", width: "40px", alwaysVisible: true, defaultVisible: true },
];

const LIST_COLUMNS_STORAGE_KEY = "project-list-visible-columns";
const LIST_COLUMN_ORDER_KEY = "project-list-column-order";
const LIST_SORT_STORAGE_KEY = "project-list-sort";

function scopedKey(base: string, scope?: string | null): string {
  return scope ? `${base}:${scope}` : base;
}

function loadVisibleColumns(scope?: string | null): string[] {
  try {
    const stored = localStorage.getItem(scopedKey(LIST_COLUMNS_STORAGE_KEY, scope));
    if (stored) return JSON.parse(stored);
  } catch {}
  return LIST_COLUMNS.filter(c => c.defaultVisible).map(c => c.id);
}

function saveVisibleColumns(cols: string[], scope?: string | null) {
  try { localStorage.setItem(scopedKey(LIST_COLUMNS_STORAGE_KEY, scope), JSON.stringify(cols)); } catch {}
}

function loadListColumnOrder(scope?: string | null): string[] {
  try {
    const stored = localStorage.getItem(scopedKey(LIST_COLUMN_ORDER_KEY, scope));
    if (stored) return JSON.parse(stored);
  } catch {}
  return LIST_COLUMNS.map(c => c.id);
}

function saveListColumnOrder(order: string[], scope?: string | null) {
  try { localStorage.setItem(scopedKey(LIST_COLUMN_ORDER_KEY, scope), JSON.stringify(order)); } catch {}
}

interface ListSortState {
  columnId: string;
  direction: "asc" | "desc";
}

function loadListSort(scope?: string | null): ListSortState | null {
  try {
    const stored = localStorage.getItem(scopedKey(LIST_SORT_STORAGE_KEY, scope));
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

function saveListSort(sort: ListSortState | null, scope?: string | null) {
  try { localStorage.setItem(scopedKey(LIST_SORT_STORAGE_KEY, scope), JSON.stringify(sort)); } catch {}
}

export type GroupByOption = "none" | "portfolio" | "status" | "priority" | "health" | "projectType" | "methodology" | "workflow" | `cf_${number}`;

const GROUP_BY_STANDARD: { value: GroupByOption; label: string }[] = [
  { value: "none", label: "None" },
  { value: "portfolio", label: "Portfolio" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "health", label: "Health" },
  { value: "projectType", label: "Project Type" },
  { value: "methodology", label: "Methodology" },
  { value: "workflow", label: "Workflow" },
];

interface ProjectsListViewProps {
  projects: Project[];
  filteredProjects: Project[];
  portfolios: Portfolio[];
  projectProgress: Record<number, number>;
  getRiskScoreForProject: (projectId: number) => { projectId: number; riskScore: number; summary: string; generatedAt: string } | undefined;
  getRiskScoreColor: (score: number) => string;
  handleStatusChange: (projectId: number, newStatus: string) => void;
  setDeleteProjectId: (id: number | null) => void;
  setRiskAssessProjectId: (id: number | null) => void;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  selectedPageSize?: number;
  isLoading?: boolean;
  groupBy: GroupByOption;
  onGroupByChange: (value: GroupByOption) => void;
  customFieldDefs?: CustomFieldDefinition[];
  customFieldValues?: ProjectCustomFieldValue[];
  filterView?: ProjectFilterView;
  onFilterViewChange?: (filterView: ProjectFilterView) => void;
  organizationId?: number | null;
  statusList?: string[];
  portfolioId?: number | null;
}

export function ProjectsListView({
  projects,
  filteredProjects,
  portfolios,
  projectProgress,
  getRiskScoreForProject,
  getRiskScoreColor,
  handleStatusChange,
  setDeleteProjectId,
  setRiskAssessProjectId,
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  selectedPageSize,
  isLoading,
  groupBy,
  onGroupByChange,
  customFieldDefs,
  customFieldValues,
  filterView = "all",
  onFilterViewChange,
  organizationId,
  statusList = DEFAULT_PROJECT_STATUS_LIST,
  portfolioId = null,
}: ProjectsListViewProps) {
  const PROJECT_STATUS_LIST = statusList;
  const { workflows: projectWorkflowsList } = useProjectWorkflows();
  const workflowsById = useMemo(() => {
    const map = new Map<number, ProjectWorkflow>();
    (projectWorkflowsList || []).forEach(w => map.set(w.id, w));
    return map;
  }, [projectWorkflowsList]);
  const defaultWorkflowName = useMemo(() => {
    const def = (projectWorkflowsList || []).find(w => w.isDefault);
    return def?.name || "Default";
  }, [projectWorkflowsList]);
  const getWorkflowName = useCallback((workflowId: number | null | undefined) => {
    if (workflowId == null) return defaultWorkflowName;
    return workflowsById.get(workflowId)?.name || defaultWorkflowName;
  }, [workflowsById, defaultWorkflowName]);
  const storageScope = portfolioId !== null ? `portfolio-${portfolioId}` : null;
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() => loadVisibleColumns(storageScope));
  const [listColumnOrder, setListColumnOrder] = useState<string[]>(() => loadListColumnOrder(storageScope));
  const [listSort, setListSort] = useState<ListSortState | null>(() => loadListSort(storageScope));
  const [manageColumnsOpen, setManageColumnsOpen] = useState(false);

  useEffect(() => {
    setVisibleColumnIds(loadVisibleColumns(storageScope));
    setListColumnOrder(loadListColumnOrder(storageScope));
    setListSort(loadListSort(storageScope));
  }, [storageScope]);

  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }, []);

  const toggleColumn = useCallback((colId: string) => {
    setVisibleColumnIds(prev => {
      const next = prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId];
      saveVisibleColumns(next, storageScope);
      return next;
    });
  }, [storageScope]);

  const resetColumns = useCallback(() => {
    const defaults = LIST_COLUMNS.filter(c => c.defaultVisible).map(c => c.id);
    setVisibleColumnIds(defaults);
    saveVisibleColumns(defaults, storageScope);
    const defaultOrder = LIST_COLUMNS.map(c => c.id);
    setListColumnOrder(defaultOrder);
    saveListColumnOrder(defaultOrder, storageScope);
  }, [storageScope]);

  const handleSort = useCallback((columnId: string) => {
    if (columnId === "actions" || columnId === "progress") return;
    setListSort(prev => {
      let next: ListSortState | null;
      if (!prev || prev.columnId !== columnId) {
        next = { columnId, direction: "asc" };
      } else if (prev.direction === "asc") {
        next = { columnId, direction: "desc" };
      } else {
        next = null;
      }
      saveListSort(next, storageScope);
      return next;
    });
  }, [storageScope]);

  const allListColumns = useMemo(() => LIST_COLUMNS.map(c => ({ id: c.id, label: c.label })), []);
  const defaultListColumns = useMemo(() => LIST_COLUMNS.filter(c => c.defaultVisible).map(c => c.id), []);
  const defaultListColumnOrder = useMemo(() => LIST_COLUMNS.map(c => c.id), []);

  const handleApplyView = useCallback((view: { visibleColumns: string[]; columnOrder: string[] }) => {
    setVisibleColumnIds(view.visibleColumns);
    saveVisibleColumns(view.visibleColumns, storageScope);
    setListColumnOrder(view.columnOrder);
    saveListColumnOrder(view.columnOrder, storageScope);
  }, [storageScope]);

  const visibleColumns = useMemo(() => {
    const cols = LIST_COLUMNS.filter(c => c.alwaysVisible || visibleColumnIds.includes(c.id));
    const orderMap = new Map(listColumnOrder.map((id, i) => [id, i]));
    return cols.sort((a, b) => {
      const ai = orderMap.get(a.id) ?? 999;
      const bi = orderMap.get(b.id) ?? 999;
      return ai - bi;
    });
  }, [visibleColumnIds, listColumnOrder]);

  const getProjectFieldValue = useCallback((project: Project, columnId: string): any => {
    switch (columnId) {
      case "name": return project.name;
      case "status": return project.status;
      case "priority": {
        const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
        return order[project.priority || "Medium"] ?? 4;
      }
      case "health": {
        const order: Record<string, number> = { Red: 0, Yellow: 1, Green: 2 };
        return order[project.health || "Green"] ?? 3;
      }
      case "budget": return Number(project.budget) || 0;
      case "endDate": return project.endDate ? new Date(project.endDate) : null;
      case "startDate": return project.startDate ? new Date(project.startDate) : null;
      case "projectType": return (project as any).projectType || "";
      case "methodology": return (project as any).methodology || "";
      case "workflow": return getWorkflowName(project.workflowId);
      case "createdAt": return project.createdAt ? new Date(project.createdAt) : null;
      case "updatedAt": return (project as any).updatedAt ? new Date((project as any).updatedAt) : null;
      default: return "";
    }
  }, [getWorkflowName]);

  const sortedProjects = useMemo(() => {
    if (!listSort) return projects;
    return sortData(projects, { columnId: listSort.columnId, direction: listSort.direction }, getProjectFieldValue);
  }, [projects, listSort, getProjectFieldValue]);

  const cfValuesMap = useMemo(() => {
    const map = new Map<string, string>();
    (customFieldValues || []).forEach(v => {
      if (v.value != null) map.set(`${v.projectId}_${v.fieldDefinitionId}`, v.value);
    });
    return map;
  }, [customFieldValues]);

  const groupByOptions = useMemo(() => {
    const base = portfolioId !== null
      ? GROUP_BY_STANDARD.filter(o => o.value !== "portfolio")
      : GROUP_BY_STANDARD;
    const options = [...base];
    (customFieldDefs || []).forEach(def => {
      if (def.entityType === "project" && def.isActive) {
        options.push({ value: `cf_${def.id}` as GroupByOption, label: def.name });
      }
    });
    return options;
  }, [customFieldDefs, portfolioId]);

  useEffect(() => {
    if (groupBy !== "none" && !groupByOptions.some(o => o.value === groupBy)) {
      onGroupByChange("none");
    }
  }, [groupBy, groupByOptions, onGroupByChange]);

  const groupedProjects = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "__all__", label: "", projects: sortedProjects, meta: null as any }];
    }

    const portfolioMap = new Map<number, Portfolio>();
    portfolios.forEach(p => portfolioMap.set(p.id, p));

    const getGroupKeyAndLabel = (project: Project): { key: string; label: string; sortOrder: number } => {
      switch (groupBy) {
        case "portfolio": {
          const pid = project.portfolioId ?? null;
          const resolvedPid = pid !== null && portfolioMap.has(pid) ? pid : null;
          if (resolvedPid === null) return { key: "unassigned", label: "Unassigned", sortOrder: 999 };
          const p = portfolioMap.get(resolvedPid)!;
          return { key: `portfolio-${resolvedPid}`, label: p.name, sortOrder: 0 };
        }
        case "status": {
          const s = project.status || "Unknown";
          const idx = PROJECT_STATUS_LIST.indexOf(s);
          return { key: `status-${s}`, label: s, sortOrder: idx >= 0 ? idx : 999 };
        }
        case "priority": {
          const p = project.priority || "Medium";
          const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
          return { key: `priority-${p}`, label: p, sortOrder: order[p] ?? 4 };
        }
        case "health": {
          const h = project.health || "Green";
          const order: Record<string, number> = { Red: 0, Yellow: 1, Green: 2 };
          const labels: Record<string, string> = { Green: "On Track", Yellow: "At Risk", Red: "Off Track" };
          return { key: `health-${h}`, label: labels[h] || h, sortOrder: order[h] ?? 3 };
        }
        case "projectType": {
          const t = (project as any).projectType || "";
          if (!t) return { key: "type-unset", label: "No Type", sortOrder: 999 };
          return { key: `type-${t}`, label: t, sortOrder: 0 };
        }
        case "methodology": {
          const m = (project as any).methodology || "";
          if (!m) return { key: "method-unset", label: "No Methodology", sortOrder: 999 };
          return { key: `method-${m}`, label: m, sortOrder: 0 };
        }
        case "workflow": {
          const wfName = getWorkflowName(project.workflowId);
          return { key: `workflow-${project.workflowId ?? "default"}`, label: wfName, sortOrder: 0 };
        }
        default: {
          if (groupBy.startsWith("cf_")) {
            const defId = parseInt(groupBy.slice(3));
            const raw = cfValuesMap.get(`${project.id}_${defId}`) || "";
            if (!raw) return { key: `cf-${defId}-unset`, label: "Not Set", sortOrder: 999 };
            const cfDef = (customFieldDefs || []).find(d => d.id === defId);
            let displayLabel = raw;
            if (cfDef?.fieldType === "checkbox") {
              displayLabel = raw === "true" ? "Yes" : "No";
            } else if (cfDef?.fieldType === "multiselect") {
              try { displayLabel = JSON.parse(raw).join(", "); } catch { /* use raw */ }
            }
            return { key: `cf-${defId}-${raw}`, label: displayLabel, sortOrder: 0 };
          }
          return { key: "__all__", label: "", sortOrder: 0 };
        }
      }
    };

    const groupMap = new Map<string, { label: string; projects: Project[]; sortOrder: number; portfolio: Portfolio | null }>();
    sortedProjects.forEach(project => {
      const { key, label, sortOrder } = getGroupKeyAndLabel(project);
      if (!groupMap.has(key)) {
        const portfolio = groupBy === "portfolio" && project.portfolioId ? portfolioMap.get(project.portfolioId) || null : null;
        groupMap.set(key, { label, projects: [], sortOrder, portfolio });
      }
      groupMap.get(key)!.projects.push(project);
    });

    return Array.from(groupMap.entries())
      .sort(([, a], [, b]) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.label.localeCompare(b.label);
      })
      .map(([key, val]) => ({ key, label: val.label, projects: val.projects, meta: val.portfolio }));
  }, [sortedProjects, portfolios, groupBy, cfValuesMap, customFieldDefs, getWorkflowName]);

  const allCollapsed = groupedProjects.length > 0 && groupedProjects.every(g => collapsedGroups[g.key] === true);

  const collapseAll = useCallback(() => {
    const collapsed: Record<string, boolean> = {};
    groupedProjects.forEach(g => { collapsed[g.key] = true; });
    setCollapsedGroups(collapsed);
  }, [groupedProjects]);

  const expandAll = useCallback(() => {
    setCollapsedGroups({});
  }, []);

  const renderCellContent = (project: Project, columnId: string) => {
    const progress = projectProgress[project.id] || 0;
    const health = HEALTH_CONFIG[project.health || 'Green'] || HEALTH_CONFIG.Green;
    const riskData = getRiskScoreForProject(project.id);
    const showRisk = riskData && ((Date.now() - new Date(riskData.generatedAt).getTime()) / (1000 * 60 * 60 * 24)) <= 5;

    switch (columnId) {
      case "name":
        return (
          <div className="flex items-center gap-3 min-w-0 pl-1">
            <div className={cn("w-1 h-8 rounded-full shrink-0", health.bg)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors" title={project.name}>
                  {project.name}
                </span>
                {(project as any).isInternal && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400 shrink-0">
                    Internal
                  </Badge>
                )}
                {project.timesheetBlocked && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <LockIcon className="h-3 w-3 text-amber-500 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>Timesheet entries blocked</TooltipContent>
                  </Tooltip>
                )}
                {project.source === "planner" && project.plannerPlanId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(`https://planner.cloud.microsoft/webui/plan/${project.plannerPlanId}/view/board`, '_blank'); }} className="shrink-0">
                        <img src={plannerLogoPath} alt="Planner" className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Synced from Microsoft Planner</TooltipContent>
                  </Tooltip>
                )}
                {(project.source === "planner-premium" || project.source === "planner_premium") && project.plannerPlanId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); const tenantId = project.dataverseTenantId || ''; const planId = project.plannerPlanId; const premiumUrl = tenantId ? `https://planner.cloud.microsoft/${tenantId}/en-US/Home/Planner/#/plantaskboard?planId=${planId}` : `https://planner.cloud.microsoft/webui/plan/${planId}/view/board`; window.open(premiumUrl, '_blank'); }} className="shrink-0 flex items-center gap-0.5">
                        <img src={plannerLogoPath} alt="Planner Premium" className="h-4 w-4" />
                        <Crown className="h-2.5 w-2.5 text-purple-500" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Synced from Planner Premium</TooltipContent>
                  </Tooltip>
                )}
                {project.source === "imported" && project.sourceFileUrl && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); const link = document.createElement('a'); link.href = project.sourceFileUrl!; link.download = project.sourceFileName || 'project.mpp'; link.click(); }} className="shrink-0">
                        <img src={msprojectLogoPath} alt="MS Project" className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Imported from MS Project</TooltipContent>
                  </Tooltip>
                )}
                {(project as any).isExternal && (
                  <ExternalBadge organizationName={(project as any).sourceOrganizationName} accessRole={(project as any).accessRole} />
                )}
                {showRisk && riskData && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 gap-0.5 shrink-0 ${getRiskScoreColor(riskData.riskScore)}`}>
                          <Shield className="h-2.5 w-2.5" />
                          {riskData.riskScore}
                        </Badge>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{riskData.summary}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        );
      case "status":
        return (
          <div className="flex items-center sm:justify-start" onClick={(e) => e.preventDefault()}>
            <Select value={project.status} onValueChange={(newStatus) => handleStatusChange(project.id, newStatus)}>
              <SelectTrigger className={cn("h-6 w-auto text-[11px] font-medium border-0 px-2 py-0 rounded-md shadow-none", STATUS_COLORS[project.status] || STATUS_COLORS.Initiation)} onClick={(e) => e.preventDefault()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent onClick={(e) => e.stopPropagation()}>
                {PROJECT_STATUS_LIST.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case "priority":
        return (
          <Badge className={cn("text-[11px] font-medium px-2 py-0.5 rounded-md border-0", PRIORITY_COLORS[project.priority || 'Medium'])}>
            {project.priority}
          </Badge>
        );
      case "health":
        return (
          <div className="flex items-center gap-1.5">
            <div className={cn("w-2 h-2 rounded-full shrink-0", health.dot)} />
            <span className="text-xs text-muted-foreground hidden lg:inline">{health.label}</span>
          </div>
        );
      case "progress":
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full rounded-full transition-all duration-500", health.bg)} style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-medium text-muted-foreground w-8">{progress}%</span>
          </div>
        );
      case "budget":
        return (
          <span className="text-sm font-medium text-foreground tabular-nums">
            {Number(project.budget) > 0 ? <CompactCurrency value={project.budget} /> : '\u2014'}
          </span>
        );
      case "endDate":
        return (
          <span className="text-xs text-muted-foreground tabular-nums">
            {project.endDate ? format(new Date(project.endDate), 'MMM d, yyyy') : '\u2014'}
          </span>
        );
      case "startDate":
        return (
          <span className="text-xs text-muted-foreground tabular-nums">
            {project.startDate ? format(new Date(project.startDate), 'MMM d, yyyy') : '\u2014'}
          </span>
        );
      case "projectType":
        return (
          <span className="text-xs text-muted-foreground truncate">
            {(project as any).projectType || '\u2014'}
          </span>
        );
      case "methodology":
        return (
          <span className="text-xs text-muted-foreground truncate">
            {(project as any).methodology || '\u2014'}
          </span>
        );
      case "workflow":
        return (
          <Badge variant="outline" className="text-[11px] font-medium px-2 py-0.5 rounded-md max-w-full" title={getWorkflowName(project.workflowId)}>
            <span className="truncate">{getWorkflowName(project.workflowId)}</span>
          </Badge>
        );
      case "createdAt":
        return (
          <span className="text-xs text-muted-foreground tabular-nums">
            {project.createdAt ? format(new Date(project.createdAt), 'MMM d, yyyy') : '\u2014'}
          </span>
        );
      case "updatedAt":
        return (
          <span className="text-xs text-muted-foreground tabular-nums">
            {(project as any).updatedAt ? format(new Date((project as any).updatedAt), 'MMM d, yyyy') : '\u2014'}
          </span>
        );
      case "actions":
        return (
          <div className="flex justify-end" onClick={(e) => e.preventDefault()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.preventDefault()}>
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/projects/${project.id}`}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Link>
                </DropdownMenuItem>
                {portfolioId === null && (
                  <DropdownMenuItem onClick={(e) => { e.preventDefault(); setRiskAssessProjectId(project.id); }}>
                    <Shield className="h-4 w-4 mr-2" />
                    AI Risk Assessment
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => { e.preventDefault(); setDeleteProjectId(project.id); }} className="text-red-600 focus:text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  {portfolioId !== null ? "Remove from Portfolio" : "Delete"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      default:
        return null;
    }
  };

  const renderProjectRow = (project: Project, index: number) => {
    return (
      <motion.div
        key={project.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
      >
        <Link href={`/projects/${project.id}`}>
          <div
            className="group grid grid-cols-1 gap-3 sm:gap-0 items-center px-4 py-3 hover:bg-muted/40 transition-colors duration-150 cursor-pointer"
            style={{ gridTemplateColumns: visibleColumns.map(c => c.width).join(" ") }}
          >
            {visibleColumns.map(col => (
              <div key={col.id} className={col.align === "right" ? "text-right" : ""}>
                {renderCellContent(project, col.id)}
              </div>
            ))}
          </div>
        </Link>
      </motion.div>
    );
  };

  const currentGroupLabel = groupByOptions.find(o => o.value === groupBy)?.label || "None";

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-muted/20 border-b border-border">
        <div className="flex items-center gap-4">
          <ViewsDropdown
            mode="list"
            organizationId={organizationId ?? null}
            portfolioId={portfolioId}
            allColumns={allListColumns}
            visibleColumns={visibleColumnIds}
            columnOrder={listColumnOrder}
            onApplyView={handleApplyView}
            defaultColumns={defaultListColumns}
            defaultColumnOrder={defaultListColumnOrder}
            filterView={filterView}
            onFilterViewChange={onFilterViewChange}
          />
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Group by:</span>
            <Select value={groupBy} onValueChange={(v) => onGroupByChange(v as GroupByOption)}>
              <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs border-border/60 bg-background shadow-none gap-1">
                <SelectValue>{currentGroupLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {groupByOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Popover open={manageColumnsOpen} onOpenChange={setManageColumnsOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                <Settings2 className="h-3.5 w-3.5" />
                Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="flex items-center justify-between px-2 pb-2 border-b border-border mb-1">
                <span className="text-xs font-semibold text-foreground">Manage Columns</span>
                <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5 text-muted-foreground" onClick={resetColumns}>
                  Reset
                </Button>
              </div>
              <div className="space-y-0.5 max-h-[300px] overflow-auto">
                {LIST_COLUMNS.filter(c => !c.alwaysVisible).map(col => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={visibleColumnIds.includes(col.id)}
                      onCheckedChange={() => toggleColumn(col.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs">{col.label}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {listSort && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground gap-1"
              onClick={() => { setListSort(null); saveListSort(null, storageScope); }}
            >
              <X className="h-3 w-3" />
              Clear sort
            </Button>
          )}
        </div>
        {groupBy !== "none" && groupedProjects.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
            onClick={allCollapsed ? expandAll : collapseAll}
          >
            {allCollapsed ? (
              <>
                <ChevronsUpDown className="h-3 w-3 mr-1" />
                Expand All
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Collapse All
              </>
            )}
          </Button>
        )}
      </div>
      <div
        className="hidden sm:grid gap-0 px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider"
        style={{ gridTemplateColumns: visibleColumns.map(c => c.width).join(" ") }}
      >
        {visibleColumns.map(col => {
          const isSortable = col.id !== "actions" && col.id !== "progress";
          const sortDir = listSort?.columnId === col.id ? listSort.direction : null;
          return (
            <span
              key={col.id}
              className={cn(
                col.align === "right" ? "text-right" : col.id === "name" ? "pl-3" : "",
                isSortable && "cursor-pointer select-none hover:text-foreground transition-colors group/sort"
              )}
              onClick={isSortable ? () => handleSort(col.id) : undefined}
            >
              <span className="inline-flex items-center gap-1">
                {col.label}
                {isSortable && sortDir === "asc" && <ArrowUp className="h-3 w-3 text-primary" />}
                {isSortable && sortDir === "desc" && <ArrowDown className="h-3 w-3 text-primary" />}
                {isSortable && !sortDir && <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover/sort:opacity-50 transition-opacity" />}
              </span>
            </span>
          );
        })}
      </div>

      <div className="divide-y divide-border">
        {groupBy === "none" ? (
          sortedProjects.map((project, index) => renderProjectRow(project, index))
        ) : (
          groupedProjects.map((group) => {
            const isCollapsed = collapsedGroups[group.key] === true;
            const portfolio = groupBy === "portfolio" ? group.meta as Portfolio | null : null;
            const portfolioHealth = portfolio ? (HEALTH_CONFIG[portfolio.healthScore || 'Green'] || HEALTH_CONFIG.Green) : null;

            const statusColor = groupBy === "status" ? (STATUS_COLORS[group.label] || "") : "";
            const priorityColor = groupBy === "priority" ? (PRIORITY_COLORS[group.label] || "") : "";
            const healthConfig = groupBy === "health" ? (Object.values(HEALTH_CONFIG).find(h => h.label === group.label) || null) : null;

            return (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-muted/60 to-muted/30 hover:from-muted/80 hover:to-muted/50 transition-all duration-150 border-b-2 border-border/60 cursor-pointer"
                >
                  <ChevronRight className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200", isCollapsed ? "" : "rotate-90")} />
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {groupBy === "portfolio" && (
                      <FolderOpen className="h-4 w-4 text-primary/70 shrink-0" />
                    )}
                    {groupBy === "status" && statusColor && (
                      <div className={cn("w-3 h-3 rounded-sm shrink-0", statusColor.split(" ")[0])} />
                    )}
                    {groupBy === "health" && healthConfig && (
                      <div className={cn("w-3 h-3 rounded-full shrink-0", healthConfig.dot)} />
                    )}
                    {groupBy === "priority" && priorityColor && (
                      <div className={cn("w-3 h-3 rounded-sm shrink-0", priorityColor.split(" ")[0])} />
                    )}
                    <span className="text-sm font-bold text-foreground truncate tracking-tight">
                      {group.label}
                    </span>
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5 shrink-0 font-semibold rounded-full bg-primary/10 text-primary border-0">
                      {group.projects.length}
                    </Badge>
                    {portfolio && portfolioHealth && (
                      <>
                        <div className="flex items-center gap-1 shrink-0">
                          <div className={cn("w-2 h-2 rounded-full", portfolioHealth.dot)} />
                          <span className="text-[11px] text-muted-foreground">{portfolioHealth.label}</span>
                        </div>
                        {portfolio.status && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                            {portfolio.status}
                          </Badge>
                        )}
                        {portfolio.budgetAllocated && Number(portfolio.budgetAllocated) > 0 && (
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            Budget: <CompactCurrency value={portfolio.budgetAllocated} />
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="divide-y divide-border">
                        {group.projects.map((project, index) => renderProjectRow(project, index))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {!isLoading && filteredProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground">No projects found</h3>
          <p className="text-muted-foreground mt-1 mb-4">Try adjusting your filters or create a new project.</p>
        </div>
      )}

      {filteredProjects.length > 0 && (
        <div className="border-t border-border">
          <ProjectsPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredProjects.length}
            pageSize={pageSize}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            selectedPageSize={selectedPageSize}
          />
        </div>
      )}
    </div>
  );
}

export default function Projects() {
  const { currentOrganization, memberships } = useOrganization();
  const { user } = useAuth();
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [workflowFilter, setWorkflowFilter] = useState<string>("all");
  const { workflows: outerProjectWorkflows } = useProjectWorkflows();
  const [filterView, setFilterView] = useState<ProjectFilterView>("active");
  const [sortBy, setSortBy] = useState<"createdAt" | "startDate" | "updatedAt">("updatedAt");
  const [listGroupBy, setListGroupBy] = useState<GroupByOption>("portfolio");
  const { data: projects, isLoading } = useProjects(currentOrganization?.id, selectedPortfolio !== "all" ? parseInt(selectedPortfolio) : undefined);
  const { data: externalProjects } = useExternalProjects();
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const { data: allTasks } = useAllTasks(currentOrganization?.id);
  
  // Fetch organization integrations for dynamic import menu
  const { data: orgIntegrations } = useQuery<{ integrationType: string; connectionStatus: string }[]>({
    queryKey: ['/api/organizations', currentOrganization?.id, 'integrations'],
    enabled: !!currentOrganization?.id,
  });
  
  const { data: projectRiskAssessments } = useQuery<{ projectId: number; riskScore: number; summary: string; generatedAt: string }[]>({
    queryKey: ['/api/project-risk-assessments/org', currentOrganization?.id],
    enabled: !!currentOrganization?.id,
  });

  const { data: orgWorkflowSteps } = useQuery<Array<{ id: number; stepKey: string; position: number; label: string; description: string | null; isTerminal: boolean | null; isActive: boolean | null }>>({
    queryKey: ['/api/organizations', currentOrganization?.id, 'project-workflow'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${currentOrganization!.id}/project-workflow`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const PROJECT_STATUS_LIST = useMemo(() => {
    if (!orgWorkflowSteps || orgWorkflowSteps.length === 0) return DEFAULT_PROJECT_STATUS_LIST;
    return orgWorkflowSteps.filter(s => s.isActive !== false).map(s => s.stepKey);
  }, [orgWorkflowSteps]);

  const { data: exportCustomFieldDefs } = useCustomFieldDefinitions(currentOrganization?.id);
  const { data: exportCfValues } = useOrganizationProjectCustomFieldValues(currentOrganization?.id);
  const bulkUpdateCfValues = useBulkUpdateProjectCustomFieldValues();

  const exportProjectCustomFields = useMemo(() => {
    return (exportCustomFieldDefs || []).filter(d => d.entityType === "project" && d.isActive);
  }, [exportCustomFieldDefs]);

  const exportCfValuesMap = useMemo(() => {
    const map = new Map<string, string>();
    (exportCfValues || []).forEach(v => {
      if (v.value != null) map.set(`${v.projectId}_${v.fieldDefinitionId}`, v.value);
    });
    return map;
  }, [exportCfValues]);

  const getRiskScoreForProject = (projectId: number) => {
    return projectRiskAssessments?.find(a => a.projectId === projectId);
  };

  const getRiskScoreColor = (score: number) => {
    if (score <= 25) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (score <= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    if (score <= 75) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
  };

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingWorkflowId, setPendingWorkflowId] = useState<number | null>(null);
  const openCreateProject = (workflowId: number | null) => {
    const wf = workflowId != null
      ? (outerProjectWorkflows || []).find(w => w.id === workflowId)
      : ((outerProjectWorkflows || []).find(w => w.isDefault) || (outerProjectWorkflows || [])[0]);
    if (wf && wf.creationMode === 'url' && wf.creationUrl) {
      window.open(wf.creationUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setPendingWorkflowId(workflowId);
    setIsDialogOpen(true);
  };
  const [search, setSearch] = useState("");
  
  // Check if user is admin for current organization
  const currentMembership = memberships.find(m => m.organizationId === currentOrganization?.id);
  const isOrgAdmin = user?.role === 'super_admin' || 
    currentMembership?.role === 'org_admin' || 
    currentOrganization?.ownerId === user?.id;
  const [view, setView] = useState<"list" | "grid" | "kanban" | "gantt" | "map">(() => {
    const saved = localStorage.getItem("projects-view-preference");
    if (saved && ["list", "grid", "kanban", "gantt", "map"].includes(saved)) {
      return saved as "list" | "grid" | "kanban" | "gantt" | "map";
    }
    return "grid";
  });

  const handleViewChange = (newView: "list" | "grid" | "kanban" | "gantt" | "map") => {
    setView(newView);
    localStorage.setItem("projects-view-preference", newView);
  };
  const updateProject = useUpdateProject();
  const updateCfValue = useUpdateProjectCustomFieldValue();
  const createProject = useCreateProject();
  const { toast } = useToast();
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);
  const [riskAssessProjectId, setRiskAssessProjectId] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; imported: number; skipped: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { isCollapsed: sidebarCollapsed, setIsCollapsed: setSidebarCollapsed } = useSidebarState();
  const sidebarWasCollapsed = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  const [listPageSize, setListPageSize] = useState<number>(() => {
    const saved = localStorage.getItem("projects-list-page-size");
    return saved ? (saved === "Infinity" ? Infinity : Number(saved)) : 10;
  });
  const [listCurrentPage, setListCurrentPage] = useState(1);

  const handleListPageSizeChange = useCallback((size: number) => {
    setListPageSize(size);
    setListCurrentPage(1);
    localStorage.setItem("projects-list-page-size", String(size));
  }, []);

  const generateProjectRiskAssessment = useMutation({
    mutationFn: async (projectId: number) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/risk-assessment`);
      return res.json();
    },
    onSuccess: (_data: any, projectId: number) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "risk-assessment", "latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "risk-assessment", "history"] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-risk-assessments/org', currentOrganization?.id] });
      // Project list shows the riskScore column; refresh it so the new score appears immediately.
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: "Success", description: "Risk assessment generated successfully." });
      setRiskAssessProjectId(null);
      navigate(`/projects/${projectId}`);
    },
    onError: (err: any) => {
      if (err?.limitExceeded) {
        toast({ title: "Credit Limit Reached", description: err.message || "Please upgrade your plan.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: err?.message || "Failed to generate risk assessment.", variant: "destructive" });
      }
      setRiskAssessProjectId(null);
    },
  });

  const handleExportToExcel = async () => {
    if (!projects || projects.length === 0) {
      toast({ title: "No data", description: "There are no projects to export", variant: "destructive" });
      return;
    }
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Projects");
    
    const baseColumns = [
      { header: "Name", key: "name", width: 30 },
      { header: "Description", key: "description", width: 40 },
      { header: "Portfolio", key: "portfolio", width: 25 },
      { header: "Status", key: "status", width: 15 },
      { header: "Priority", key: "priority", width: 12 },
      { header: "Health", key: "health", width: 10 },
      { header: "Start Date", key: "startDate", width: 15 },
      { header: "End Date", key: "endDate", width: 15 },
      { header: "Budget", key: "budget", width: 15 },
      { header: "Progress %", key: "completion", width: 12 }
    ];

    const cfColumns = exportProjectCustomFields.map(cf => ({
      header: `CF: ${cf.name}`,
      key: `cf_${cf.id}`,
      width: 20,
    }));

    worksheet.columns = [...baseColumns, ...cfColumns];
    
    projects.forEach(p => {
      const portfolio = portfolios?.find(pf => pf.id === p.portfolioId);
      const rowData: Record<string, any> = {
        name: p.name,
        description: p.description || "",
        portfolio: portfolio?.name || "",
        status: p.status,
        priority: p.priority,
        health: p.health,
        startDate: p.startDate || "",
        endDate: p.endDate || "",
        budget: p.budget || "",
        completion: p.completionPercentage || 0
      };

      exportProjectCustomFields.forEach(cf => {
        const val = exportCfValuesMap.get(`${p.id}_${cf.id}`) || "";
        if (cf.fieldType === "multiselect" && val) {
          try { rowData[`cf_${cf.id}`] = JSON.parse(val).join(", "); } catch { rowData[`cf_${cf.id}`] = val; }
        } else if (cf.fieldType === "checkbox") {
          rowData[`cf_${cf.id}`] = val === "true" ? "Yes" : val === "false" ? "No" : "";
        } else {
          rowData[`cf_${cf.id}`] = val;
        }
      });

      worksheet.addRow(rowData);
    });
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Projects_${new Date().toISOString().split("T")[0]}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast({ title: "Success", description: `Exported ${projects.length} projects to Excel` });
  };

  const handleImportFromExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentOrganization) return;
    setIsImporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error("No worksheet found");
      }
      
      const getCellText = (cellValue: any): string => {
        if (cellValue == null) return "";
        if (typeof cellValue === "string") return cellValue;
        if (typeof cellValue === "number" || typeof cellValue === "boolean") return String(cellValue);
        if (cellValue instanceof Date) return cellValue.toISOString().split("T")[0];
        if (typeof cellValue === "object") {
          if (cellValue.text) return String(cellValue.text);
          if (cellValue.richText && Array.isArray(cellValue.richText)) {
            return cellValue.richText.map((r: any) => r.text || "").join("");
          }
          if (cellValue.result !== undefined) return String(cellValue.result);
        }
        return String(cellValue);
      };

      const headers: string[] = [];
      worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber - 1] = getCellText(cell.value).trim();
      });

      const cfHeaderMap = new Map<string, CustomFieldDefinition>();
      exportProjectCustomFields.forEach(cf => {
        const headerName = `CF: ${cf.name}`;
        if (headers.includes(headerName)) {
          cfHeaderMap.set(headerName, cf);
        }
      });
      
      const jsonData: Record<string, string>[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rowData: Record<string, string> = {};
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = getCellText(cell.value);
          }
        });
        if (Object.keys(rowData).length > 0) {
          jsonData.push(rowData);
        }
      });
      
      let imported = 0;
      let skipped = 0;
      let limitReached = false;
      const totalRows = jsonData.length;
      setImportProgress({ current: 0, total: totalRows, imported: 0, skipped: 0 });
      
      for (let i = 0; i < jsonData.length; i++) {
        if (limitReached) break;
        const row = jsonData[i];
        const getVal = (keys: string[], fallback = ""): string => {
          for (const k of Object.keys(row)) {
            if (keys.some(target => k.trim().toLowerCase() === target.toLowerCase())) {
              return (row[k] || "").toString().trim();
            }
          }
          return fallback;
        };

        const name = getVal(["Name", "Project Name", "projectName", "Project", "Title"]);
        if (!name) {
          skipped++;
          setImportProgress({ current: i + 1, total: totalRows, imported, skipped });
          continue;
        }
        
        const portfolioName = getVal(["Portfolio"]);
        let matchedPortfolioId: number | null = null;
        if (portfolioName) {
          const matchedPortfolio = portfolios?.find(p => normalizeSearch(p.name) === normalizeSearch(portfolioName));
          if (matchedPortfolio) {
            matchedPortfolioId = matchedPortfolio.id;
          }
        }
        
        const statusValue = getVal(["Status"], "Initiation");
        const validStatus = PROJECT_STATUS_LIST.includes(statusValue) ? statusValue : "Initiation";
        
        const priorityValue = getVal(["Priority"], "Medium");
        const validPriorities = ["Critical", "High", "Medium", "Low"];
        const validPriority = validPriorities.includes(priorityValue) ? priorityValue : "Medium";
        
        const healthValue = getVal(["Health"], "Green");
        const validHealths = ["Green", "Yellow", "Red"];
        const validHealth = validHealths.includes(healthValue) ? healthValue : "Green";
        
        const startDateRaw = getVal(["Start Date", "startDate"]);
        const endDateRaw = getVal(["End Date", "endDate"]);
        const budgetRaw = getVal(["Budget"], "0").replace(/[^0-9.]/g, "") || "0";
        const completionRaw = parseInt(getVal(["Completion %", "completion"], "0").replace(/[^0-9]/g, "")) || 0;
        
        try {
          const createdProject = await createProject.mutateAsync({
            organizationId: currentOrganization.id,
            portfolioId: matchedPortfolioId,
            name: name.trim(),
            description: getVal(["Description"]) || null,
            status: validStatus,
            priority: validPriority as "Critical" | "High" | "Medium" | "Low",
            health: validHealth as "Green" | "Yellow" | "Red",
            startDate: startDateRaw || null,
            endDate: endDateRaw || null,
            budget: budgetRaw,
            completionPercentage: Math.min(100, Math.max(0, completionRaw))
          });
          imported++;
          setImportProgress({ current: i + 1, total: totalRows, imported, skipped });

          if (cfHeaderMap.size > 0 && createdProject?.id) {
            const cfValuesToSave: Array<{ fieldDefinitionId: number; value: string | null }> = [];
            cfHeaderMap.forEach((cfDef, headerName) => {
              const rawVal = (row[headerName] || "").toString().trim();
              if (!rawVal) return;
              let value: string = rawVal;
              if (cfDef.fieldType === "checkbox") {
                value = rawVal.toLowerCase() === "yes" || rawVal.toLowerCase() === "true" ? "true" : "false";
              } else if (cfDef.fieldType === "multiselect") {
                const parts = rawVal.split(",").map(s => s.trim()).filter(Boolean);
                value = JSON.stringify(parts);
              }
              cfValuesToSave.push({ fieldDefinitionId: cfDef.id, value });
            });
            if (cfValuesToSave.length > 0) {
              try {
                await bulkUpdateCfValues.mutateAsync({ projectId: createdProject.id, values: cfValuesToSave });
              } catch {}
            }
          }
        } catch (err: any) {
          if (err?.limitExceeded) {
            toast({ 
              title: "Credit Limit Reached", 
              description: `Imported ${imported} projects. ${err.message || "Please upgrade your plan to import more."}`, 
              variant: "destructive" 
            });
            limitReached = true;
            break;
          }
          skipped++;
          setImportProgress({ current: i + 1, total: totalRows, imported, skipped });
        }
      }
      
      if (!limitReached) {
        toast({ 
          title: "Import Complete", 
          description: `Imported ${imported} projects${skipped > 0 ? `, skipped ${skipped} rows` : ""}` 
        });
      }
    } catch (err) {
      toast({ title: "Import Failed", description: "Could not read the Excel file", variant: "destructive" });
    } finally {
      setIsImporting(false);
      setImportProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Calculate progress per project based on tasks
  const projectProgress = useMemo(() => {
    const progressMap: Record<number, number> = {};
    if (!allTasks || !projects) return progressMap;
    
    projects.forEach(project => {
      const projectTasks = allTasks.filter(t => t.projectId === project.id);
      if (projectTasks.length === 0) {
        progressMap[project.id] = project.completionPercentage || 0;
      } else {
        const totalProgress = projectTasks.reduce((sum, t) => sum + (t.progress || 0), 0);
        progressMap[project.id] = Math.round(totalProgress / projectTasks.length);
      }
    });
    return progressMap;
  }, [allTasks, projects]);

  const deleteProject = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: "Success", description: "Project moved to recycle bin" });
      setDeleteProjectId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const filteredProjects = useMemo(() => {
    // Combine org projects with external projects
    const allProjects = [
      ...(projects || []),
      ...(externalProjects || [])
    ];
    
    if (allProjects.length === 0) return [];
    
    // Filter first
    const filtered = allProjects.filter(p => {
      const matchesSearch = normalizeSearch(p.name).includes(normalizeSearch(search));
      const matchesSource = sourceFilter === "all" || 
        (sourceFilter === "manual" && (p.source === "manual" || !p.source)) ||
        (sourceFilter === "imported" && p.source === "imported") ||
        (sourceFilter === "external" && (p as any).isExternal);
      // If portfolio is selected, only show org projects from that portfolio
      const matchesPortfolio = selectedPortfolio === "all" || 
        (!(p as any).isExternal && p.portfolioId === parseInt(selectedPortfolio));
      const matchesWorkflow = workflowFilter === "all" ||
        (workflowFilter === "default" && (p as any).workflowId == null) ||
        ((p as any).workflowId != null && (p as any).workflowId === parseInt(workflowFilter));
      
      // Filter view logic - "Closed" is the terminal locked state (not "Closing" which is still active)
      const isClosed = p.status === "Closed";
      const isMyProject = p.managerId === user?.id || 
        p.businessSponsorId === user?.id || 
        p.businessOwnerId === user?.id ||
        p.technicalLeadId === user?.id;
      
      let matchesFilterView = true;
      switch (filterView) {
        case "all":
          matchesFilterView = true;
          break;
        case "active":
          matchesFilterView = !isClosed;
          break;
        case "my-active":
          matchesFilterView = isMyProject && !isClosed;
          break;
        case "closed":
          matchesFilterView = isClosed;
          break;
        case "my-closed":
          matchesFilterView = isMyProject && isClosed;
          break;
        case "internal":
          matchesFilterView = (p as any).isInternal === true;
          break;
      }
      
      return matchesSearch && matchesSource && matchesPortfolio && matchesWorkflow && matchesFilterView;
    });
    
    // Then sort (most recent first for all date-based sorts)
    return [...filtered].sort((a, b) => {
      if (sortBy === "createdAt") {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA; // Most recent first
      } else if (sortBy === "startDate") {
        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
        return dateB - dateA; // Most recent first
      } else if (sortBy === "updatedAt") {
        // Use createdAt as fallback if updatedAt is not available
        const dateA = (a as any).updatedAt ? new Date((a as any).updatedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const dateB = (b as any).updatedAt ? new Date((b as any).updatedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return dateB - dateA; // Most recent first
      }
      return 0;
    });
  }, [projects, externalProjects, search, sourceFilter, workflowFilter, sortBy, selectedPortfolio, filterView, user?.id]);

  useEffect(() => {
    setListCurrentPage(1);
  }, [filteredProjects, view]);

  const effectiveListPageSize = listPageSize === Infinity ? (filteredProjects?.length || 1) : listPageSize;

  const totalListPages = useMemo(() => {
    return Math.max(1, Math.ceil((filteredProjects?.length || 0) / effectiveListPageSize));
  }, [filteredProjects, effectiveListPageSize]);

  const displayedListProjects = useMemo(() => {
    if (listPageSize === Infinity) return filteredProjects || [];
    const start = (listCurrentPage - 1) * listPageSize;
    return (filteredProjects || []).slice(start, start + listPageSize);
  }, [filteredProjects, listCurrentPage, listPageSize]);

  const handleStatusChange = (projectId: number, newStatus: string) => {
    updateProject.mutate(
      { id: projectId, status: newStatus },
      {
        onSuccess: () => {
          toast({ title: "Project updated", description: `Status changed to ${newStatus}` });
        },
        onError: (err) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const handlePortfolioChange = (projectId: number, portfolioId: number | null) => {
    const portfolioName = portfolioId ? portfolios?.find(p => p.id === portfolioId)?.name : "Unassigned";
    updateProject.mutate(
      { id: projectId, portfolioId: portfolioId },
      {
        onSuccess: () => {
          toast({ title: "Project updated", description: `Moved to ${portfolioName}` });
        },
        onError: (err) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const handleKanbanProjectUpdate = (projectId: number, updates: Partial<Project>) => {
    updateProject.mutate(
      { id: projectId, ...updates },
      {
        onSuccess: () => {
          toast({ title: "Project updated" });
        },
        onError: (err) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const handleKanbanCfChange = (projectId: number, fieldDefinitionId: number, value: string | null) => {
    updateCfValue.mutate(
      { projectId, fieldDefinitionId, value },
      {
        onSuccess: () => {
          toast({ title: "Project updated" });
        },
        onError: (err) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  return (
    <PageTransition className="space-y-8">
      <FadeIn className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Projects</h1>
          <p className="mt-1 text-muted-foreground">Track execution and health of all initiatives.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFromExcel}
            accept=".xlsx,.xls"
            className="hidden"
            data-testid="input-import-projects-file"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                disabled={isImporting}
                data-testid="button-import-projects"
              >
                <Upload className="mr-2 h-4 w-4" />
                {isImporting ? "Importing..." : "Import"}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()} data-testid="dropdown-import-excel">
                <Table2 className="mr-2 h-4 w-4" />
                Import from Excel
              </DropdownMenuItem>
              <DropdownMenuItem asChild data-testid="dropdown-import-msproject">
                <Link href="/integrations?integration=ms-project">
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Import from MS Project
                </Link>
              </DropdownMenuItem>
              {orgIntegrations?.some(i => i.integrationType === 'planner' && i.connectionStatus === 'connected') && (
                <DropdownMenuItem asChild data-testid="dropdown-import-planner">
                  <Link href="/integrations?integration=planner">
                    <Calendar className="mr-2 h-4 w-4" />
                    Import from Microsoft Planner
                  </Link>
                </DropdownMenuItem>
              )}
              {orgIntegrations?.some(i => i.integrationType === 'planner-premium' && i.connectionStatus === 'connected') && (
                <DropdownMenuItem asChild data-testid="dropdown-import-planner-premium">
                  <Link href="/integrations?integration=planner-premium">
                    <Rocket className="mr-2 h-4 w-4" />
                    Import from Planner Premium
                  </Link>
                </DropdownMenuItem>
              )}
              {orgIntegrations?.some(i => i.integrationType === 'project-online' && i.connectionStatus === 'connected') && (
                <DropdownMenuItem asChild data-testid="dropdown-import-project-online">
                  <Link href="/integrations?integration=project-online">
                    <Cloud className="mr-2 h-4 w-4" />
                    Import from Project Online
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild data-testid="dropdown-configure-integrations">
                <Link href="/integrations">
                  <Settings2 className="mr-2 h-4 w-4" />
                  Configure Integrations
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button 
            variant="outline" 
            onClick={handleExportToExcel}
            disabled={!projects || projects.length === 0}
            data-testid="button-export-projects"
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          {outerProjectWorkflows.length > 1 ? (
            <div className="flex">
              <Button
                className="shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all rounded-r-none"
                onClick={() => openCreateProject(null)}
                data-testid="button-new-project"
              >
                <Plus className="mr-2 h-4 w-4" /> New Project
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all rounded-l-none border-l border-primary-foreground/20 px-2"
                    data-testid="button-new-project-workflow-menu"
                    aria-label="Choose workflow"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {outerProjectWorkflows.filter(w => w.isActive !== false).map(w => (
                    <DropdownMenuItem
                      key={w.id}
                      onSelect={() => openCreateProject(w.id)}
                      data-testid={`menu-new-project-workflow-${w.id}`}
                    >
                      {w.name}{w.isDefault ? " (Default)" : ""}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Button
              className="shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
              onClick={() => openCreateProject(null)}
              data-testid="button-new-project"
            >
              <Plus className="mr-2 h-4 w-4" /> New Project
            </Button>
          )}
          <CreateProjectDialog
            open={isDialogOpen}
            onOpenChange={(o) => {
              setIsDialogOpen(o);
              if (!o) setPendingWorkflowId(null);
            }}
            portfolios={portfolios || []}
            organizationId={currentOrganization?.id}
            onProjectCreated={(projectId) => navigate(`/projects/${projectId}`)}
            initialWorkflowId={pendingWorkflowId}
          />
        </div>
      </FadeIn>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input 
              className="pl-10 border-border" 
              placeholder="Search projects..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-projects"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="w-full sm:w-[200px]">
              <Select value={selectedPortfolio} onValueChange={setSelectedPortfolio}>
                <SelectTrigger data-testid="select-portfolio-filter">
                  <SelectValue placeholder="Filter by Portfolio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Portfolios</SelectItem>
                  {portfolios?.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      <div className="truncate max-w-[200px]" title={p.name}>{p.name}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-[180px]">
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger data-testid="select-source-filter">
                  <SelectValue placeholder="Filter by Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  <SelectItem value="manual">
                    <span className="flex items-center gap-2">
                      <PenTool className="h-3 w-3" />
                      Created in App
                    </span>
                  </SelectItem>
                  <SelectItem value="imported">
                    <span className="flex items-center gap-2">
                      <Upload className="h-3 w-3" />
                      Imported
                    </span>
                  </SelectItem>
                  <SelectItem value="external">
                    <span className="flex items-center gap-2">
                      <ExternalLink className="h-3 w-3" />
                      External
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-[180px]">
              <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
                <SelectTrigger data-testid="select-workflow-filter">
                  <SelectValue placeholder="Filter by Workflow" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Workflows</SelectItem>
                  <SelectItem value="default">Default Workflow</SelectItem>
                  {(outerProjectWorkflows || []).map(w => (
                    <SelectItem key={w.id} value={w.id.toString()}>
                      <div className="truncate max-w-[200px]" title={w.name}>{w.name}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-[180px]">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as "createdAt" | "startDate" | "updatedAt")}>
                <SelectTrigger data-testid="select-sort-by">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">
                    <span className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      Date Created
                    </span>
                  </SelectItem>
                  <SelectItem value="startDate">
                    <span className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      Start Date
                    </span>
                  </SelectItem>
                  <SelectItem value="updatedAt">
                    <span className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      Date Updated
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap sm:flex-nowrap rounded-lg border border-border overflow-hidden">
            <Button
              variant={view === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleViewChange("list")}
              className="rounded-none"
              data-testid="button-view-list"
            >
              <List className="h-4 w-4 mr-2" />
              List
            </Button>
            <Button
              variant={view === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleViewChange("grid")}
              className="rounded-none"
              data-testid="button-view-grid"
            >
              <Table2 className="h-4 w-4 mr-2" />
              Grid
            </Button>
            <Button
              variant={view === "kanban" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleViewChange("kanban")}
              className="rounded-none"
              data-testid="button-view-kanban"
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              Kanban
            </Button>
            <Button
              variant={view === "gantt" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleViewChange("gantt")}
              className="rounded-none"
              data-testid="button-view-gantt"
            >
              <GanttChart className="h-4 w-4 mr-2" />
              Gantt
            </Button>
            <Button
              variant={view === "map" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleViewChange("map")}
              className="rounded-none"
              data-testid="button-view-map"
            >
              <MapPin className="h-4 w-4 mr-2" />
              Map
            </Button>
          </div>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              sidebarWasCollapsed.current = sidebarCollapsed;
              setSidebarCollapsed(true);
              setIsFullscreen(true);
            }}
            data-testid="button-fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Fullscreen Container */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between gap-4 px-4 py-2 border-b bg-background shrink-0">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold">Projects - {view.charAt(0).toUpperCase() + view.slice(1)} View</h2>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setSidebarCollapsed(sidebarWasCollapsed.current);
                setIsFullscreen(false);
              }}
              data-testid="button-exit-fullscreen"
            >
              <Minimize2 className="h-4 w-4 mr-2" />
              Exit Fullscreen
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {view === "list" ? (
              <ProjectsListView
                projects={displayedListProjects}
                filteredProjects={filteredProjects || []}
                portfolios={portfolios || []}
                projectProgress={projectProgress}
                getRiskScoreForProject={getRiskScoreForProject}
                getRiskScoreColor={getRiskScoreColor}
                handleStatusChange={handleStatusChange}
                setDeleteProjectId={setDeleteProjectId}
                setRiskAssessProjectId={setRiskAssessProjectId}
                currentPage={listCurrentPage}
                totalPages={totalListPages}
                pageSize={effectiveListPageSize}
                onPageChange={setListCurrentPage}
                onPageSizeChange={handleListPageSizeChange}
                selectedPageSize={listPageSize}
                isLoading={isLoading}
                groupBy={listGroupBy}
                onGroupByChange={setListGroupBy}
                customFieldDefs={exportCustomFieldDefs}
                customFieldValues={exportCfValues}
                filterView={filterView}
                onFilterViewChange={setFilterView}
                organizationId={currentOrganization?.id || null}
                statusList={PROJECT_STATUS_LIST}
              />
            ) : view === "grid" ? (
              <ProjectsGridView 
                projects={filteredProjects || []} 
                portfolios={portfolios || []}
                onStatusChange={handleStatusChange}
                onDeleteProject={(id) => deleteProject.mutate(id)}
                onUpdateProject={(id, data) => updateProject.mutate({ id, ...data })}
                isAdmin={isOrgAdmin}
                organizationId={currentOrganization?.id || null}
                isFullscreen={true}
                onExitFullscreen={() => {
                  setSidebarCollapsed(sidebarWasCollapsed.current);
                  setIsFullscreen(false);
                }}
                filterView={filterView}
                onFilterViewChange={setFilterView}
                statusList={PROJECT_STATUS_LIST}
              />
            ) : view === "kanban" ? (
              <ProjectsKanbanView 
                projects={filteredProjects || []} 
                portfolios={portfolios || []}
                onStatusChange={handleStatusChange}
                onPortfolioChange={handlePortfolioChange}
                onProjectUpdate={handleKanbanProjectUpdate}
                customFieldDefs={exportCustomFieldDefs || []}
                cfValues={exportCfValues || []}
                onCustomFieldChange={handleKanbanCfChange}
              />
            ) : view === "gantt" ? (
              <ProjectsGanttView projects={filteredProjects || []} organizationId={currentOrganization?.id || null} />
            ) : (
              <ProjectsMapView projects={filteredProjects || []} portfolios={portfolios || []} />
            )}
          </div>
        </div>
      )}

      {/* Projects View */}
      {!isFullscreen && view === "list" ? (
        <ProjectsListView
          projects={displayedListProjects}
          filteredProjects={filteredProjects || []}
          portfolios={portfolios || []}
          projectProgress={projectProgress}
          getRiskScoreForProject={getRiskScoreForProject}
          getRiskScoreColor={getRiskScoreColor}
          handleStatusChange={handleStatusChange}
          setDeleteProjectId={setDeleteProjectId}
          setRiskAssessProjectId={setRiskAssessProjectId}
          currentPage={listCurrentPage}
          totalPages={totalListPages}
          pageSize={effectiveListPageSize}
          onPageChange={setListCurrentPage}
          onPageSizeChange={handleListPageSizeChange}
          selectedPageSize={listPageSize}
          isLoading={isLoading}
          groupBy={listGroupBy}
          onGroupByChange={setListGroupBy}
          customFieldDefs={exportCustomFieldDefs}
          customFieldValues={exportCfValues}
          filterView={filterView}
          onFilterViewChange={setFilterView}
          organizationId={currentOrganization?.id || null}
          statusList={PROJECT_STATUS_LIST}
        />
      ) : !isFullscreen && view === "grid" ? (
        <ProjectsGridView 
          projects={filteredProjects || []} 
          portfolios={portfolios || []}
          onStatusChange={handleStatusChange}
          onDeleteProject={(id) => deleteProject.mutate(id)}
          onUpdateProject={(id, data) => updateProject.mutate({ id, ...data })}
          isAdmin={isOrgAdmin}
          organizationId={currentOrganization?.id || null}
          filterView={filterView}
          onFilterViewChange={setFilterView}
          statusList={PROJECT_STATUS_LIST}
        />
      ) : !isFullscreen && view === "kanban" ? (
        <ProjectsKanbanView 
          projects={filteredProjects || []} 
          portfolios={portfolios || []}
          onStatusChange={handleStatusChange}
          onPortfolioChange={handlePortfolioChange}
          onProjectUpdate={handleKanbanProjectUpdate}
          customFieldDefs={exportCustomFieldDefs || []}
          cfValues={exportCfValues || []}
          onCustomFieldChange={handleKanbanCfChange}
        />
      ) : !isFullscreen && view === "gantt" ? (
        <ProjectsGanttView projects={filteredProjects || []} organizationId={currentOrganization?.id || null} />
      ) : !isFullscreen && view === "map" ? (
        <ProjectsMapView projects={filteredProjects || []} portfolios={portfolios || []} />
      ) : null}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteProjectId !== null} onOpenChange={() => setDeleteProjectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">Are you sure you want to delete this project? It will be moved to the recycle bin.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProjectId(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteProjectId && deleteProject.mutate(deleteProjectId)}
              disabled={deleteProject.isPending}
              data-testid="button-confirm-delete-project"
            >
              {deleteProject.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={riskAssessProjectId !== null} onOpenChange={() => setRiskAssessProjectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate AI Risk Assessment</DialogTitle>
            <DialogDescription>
              This will use AI to analyze the project and generate a comprehensive risk assessment. This action will consume 1 AI credit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskAssessProjectId(null)}>Cancel</Button>
            <Button 
              onClick={() => riskAssessProjectId && generateProjectRiskAssessment.mutate(riskAssessProjectId)}
              disabled={generateProjectRiskAssessment.isPending}
              data-testid="button-confirm-risk-assessment-project"
            >
              {generateProjectRiskAssessment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {generateProjectRiskAssessment.isPending ? "Generating..." : "Generate Assessment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importProgress !== null} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing Projects
            </DialogTitle>
            <DialogDescription>
              Please wait while your projects are being imported.
            </DialogDescription>
          </DialogHeader>
          {importProgress && (
            <div className="space-y-4 py-2">
              <Progress value={importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0} className="h-3" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Processing row {importProgress.current} of {importProgress.total}
                </span>
                <span className="font-medium">
                  {importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%
                </span>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-emerald-600 dark:text-emerald-400">
                  {importProgress.imported} imported
                </span>
                {importProgress.skipped > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {importProgress.skipped} skipped
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}

// Grid View Constants and Component
const GRID_COLUMN_STORAGE_KEY = "projects-grid-columns";

interface GridColumn {
  id: string;
  label: string;
  defaultVisible: boolean;
}

const ALL_GRID_COLUMNS: GridColumn[] = [
  { id: "name", label: "Name", defaultVisible: true },
  { id: "projectCode", label: "Project Code", defaultVisible: false },
  { id: "status", label: "Status", defaultVisible: true },
  { id: "priority", label: "Priority", defaultVisible: true },
  { id: "health", label: "Health", defaultVisible: true },
  { id: "billableStatus", label: "Billable Status", defaultVisible: false },
  { id: "portfolio", label: "Portfolio", defaultVisible: true },
  { id: "startDate", label: "Start Date", defaultVisible: true },
  { id: "endDate", label: "End Date", defaultVisible: true },
  { id: "baselineStartDate", label: "Baseline Start", defaultVisible: false },
  { id: "baselineEndDate", label: "Baseline End", defaultVisible: false },
  { id: "actualStartDate", label: "Actual Start", defaultVisible: false },
  { id: "actualEndDate", label: "Actual End", defaultVisible: false },
  { id: "budget", label: "Budget", defaultVisible: false },
  { id: "actualCost", label: "Actual Cost", defaultVisible: false },
  { id: "forecastCost", label: "Forecast Cost", defaultVisible: false },
  { id: "costVariance", label: "Cost Variance", defaultVisible: false },
  { id: "scheduleVariance", label: "Schedule Variance", defaultVisible: false },
  { id: "completion", label: "Progress %", defaultVisible: true },
  { id: "projectType", label: "Project Type", defaultVisible: false },
  { id: "methodology", label: "Methodology", defaultVisible: false },
  { id: "workflow", label: "Workflow", defaultVisible: true },
  { id: "department", label: "Department", defaultVisible: false },
  { id: "category", label: "Category", defaultVisible: false },
  { id: "businessValue", label: "Business Value", defaultVisible: false },
  { id: "riskLevel", label: "Risk Level", defaultVisible: false },
  { id: "source", label: "Source", defaultVisible: false },
  { id: "owner", label: "Manager", defaultVisible: false },
  { id: "createdAt", label: "Created Date", defaultVisible: false },
  { id: "updatedAt", label: "Updated Date", defaultVisible: false },
  { id: "description", label: "Description", defaultVisible: false },
  { id: "isInternal", label: "Internal", defaultVisible: false },
];

const GRID_COLUMN_ORDER_KEY = "projects-grid-column-order";

function getStoredColumns(): string[] {
  try {
    const stored = localStorage.getItem(GRID_COLUMN_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return ALL_GRID_COLUMNS.filter(c => c.defaultVisible).map(c => c.id);
}

function getStoredColumnOrder(): string[] {
  try {
    const stored = localStorage.getItem(GRID_COLUMN_ORDER_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return ALL_GRID_COLUMNS.map(c => c.id);
}

function saveColumnOrder(order: string[]) {
  localStorage.setItem(GRID_COLUMN_ORDER_KEY, JSON.stringify(order));
}

function saveColumns(columns: string[]) {
  localStorage.setItem(GRID_COLUMN_STORAGE_KEY, JSON.stringify(columns));
}

interface ResizableSortableColumnHeaderProps {
  column: GridColumn;
  children: React.ReactNode;
  isFullscreen?: boolean;
  width?: number;
  sortDirection?: SortDirection;
  onSort?: () => void;
  onResize?: (width: number) => void;
}

function ResizableSortableColumnHeader({ 
  column, 
  children, 
  isFullscreen,
  width,
  sortDirection,
  onSort,
  onResize,
}: ResizableSortableColumnHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isResizing ? 'none' : transition,
    opacity: isDragging ? 0.5 : 1,
    width: width ? `${width}px` : undefined,
    minWidth: width ? `${width}px` : undefined,
    maxWidth: width ? `${width}px` : undefined,
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width || 150;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startXRef.current;
      const newWidth = Math.max(80, Math.min(500, startWidthRef.current + diff));
      onResize?.(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleHeaderClick = (e: React.MouseEvent) => {
    if (!isResizing) {
      onSort?.();
    }
  };

  const renderSortIcon = () => {
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 text-primary" />;
    }
    if (sortDirection === 'desc') {
      return <ArrowDown className="h-3 w-3 text-primary" />;
    }
    return <ChevronsUpDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />;
  };
  
  return (
    <TableHead 
      ref={setNodeRef} 
      style={style} 
      className={cn(
        "whitespace-nowrap relative group select-none",
        isFullscreen && "bg-card",
        !isResizing && "cursor-pointer"
      )}
      data-testid={`column-header-${column.id}`}
    >
      <div className="flex items-center gap-1">
        <div 
          className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </div>
        <div 
          className="flex items-center gap-1 flex-1"
          onClick={handleHeaderClick}
        >
          <span>{children}</span>
          {renderSortIcon()}
        </div>
      </div>
      <div
        className={cn(
          "absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 transition-colors",
          isResizing && "bg-primary"
        )}
        onMouseDown={handleMouseDown}
        data-testid={`resize-handle-${column.id}`}
      />
    </TableHead>
  );
}

function SortableColumnHeader({ column, children, isFullscreen }: { column: GridColumn; children: React.ReactNode; isFullscreen?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  
  return (
    <TableHead 
      ref={setNodeRef} 
      style={style} 
      className={cn("whitespace-nowrap cursor-grab active:cursor-grabbing", isFullscreen && "bg-card")}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-1">
        <GripVertical className="h-3 w-3 text-muted-foreground" />
        {children}
      </div>
    </TableHead>
  );
}

export function ProjectsGridView({ 
  projects, 
  portfolios,
  onStatusChange,
  onDeleteProject,
  onUpdateProject,
  isAdmin,
  organizationId,
  isFullscreen: externalFullscreen,
  onExitFullscreen,
  filterView,
  onFilterViewChange,
  statusList = DEFAULT_PROJECT_STATUS_LIST,
}: { 
  projects: Project[];
  portfolios: Portfolio[];
  onStatusChange: (projectId: number, newStatus: string) => void;
  onDeleteProject: (projectId: number) => void;
  onUpdateProject: (projectId: number, data: Partial<Project>) => void;
  isAdmin: boolean;
  organizationId: number | null;
  isFullscreen?: boolean;
  onExitFullscreen?: () => void;
  filterView?: ProjectFilterView;
  onFilterViewChange?: (filterView: ProjectFilterView) => void;
  statusList?: string[];
}) {
  const PROJECT_STATUS_LIST = statusList;
  const { toast } = useToast();
  const { workflows: projectWorkflowsList } = useProjectWorkflows();
  const workflowsById = useMemo(() => {
    const map = new Map<number, ProjectWorkflow>();
    (projectWorkflowsList || []).forEach(w => map.set(w.id, w));
    return map;
  }, [projectWorkflowsList]);
  const defaultWorkflowName = useMemo(() => {
    const def = (projectWorkflowsList || []).find(w => w.isDefault);
    return def?.name || "Default";
  }, [projectWorkflowsList]);
  const getWorkflowName = useCallback((workflowId: number | null | undefined) => {
    if (workflowId == null) return defaultWorkflowName;
    return workflowsById.get(workflowId)?.name || defaultWorkflowName;
  }, [workflowsById, defaultWorkflowName]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(getStoredColumns);
  const [columnOrder, setColumnOrder] = useState<string[]>(getStoredColumnOrder);
  const [selectedProjects, setSelectedProjects] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{ projectId: number; columnId: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const [gridGroupBy, setGridGroupBy] = useState<GroupByOption>(() => {
    try {
      const stored = localStorage.getItem("projects-grid-group-by");
      if (stored) return stored as GroupByOption;
    } catch {}
    return "none";
  });
  const [gridCollapsedGroups, setGridCollapsedGroups] = useState<Record<string, boolean>>({});

  const handleGridGroupByChange = useCallback((value: GroupByOption) => {
    setGridGroupBy(value);
    setGridCollapsedGroups({});
    try { localStorage.setItem("projects-grid-group-by", value); } catch {}
  }, []);

  const toggleGridGroup = useCallback((groupKey: string) => {
    setGridCollapsedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }, []);

  const [gridPageSize, setGridPageSize] = useState<number>(() => {
    const saved = localStorage.getItem("projects-grid-page-size");
    return saved ? (saved === "Infinity" ? Infinity : Number(saved)) : 10;
  });
  const [gridCurrentPage, setGridCurrentPage] = useState(1);

  const handleGridPageSizeChange = useCallback((size: number) => {
    setGridPageSize(size);
    setGridCurrentPage(1);
    localStorage.setItem("projects-grid-page-size", String(size));
  }, []);

  useEffect(() => {
    setGridCurrentPage(1);
  }, [projects]);
  
  const { data: resources } = useQuery<Resource[]>({
    queryKey: ['/api/resources', organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/resources?organizationId=${organizationId}`);
      if (!res.ok) throw new Error('Failed to fetch resources');
      return res.json();
    },
    enabled: !!organizationId,
  });
  
  const resourceMap = useMemo(() => {
    const map = new Map<number, Resource>();
    resources?.forEach(r => map.set(r.id, r));
    return map;
  }, [resources]);
  
  const isFullscreen = externalFullscreen !== undefined ? externalFullscreen : internalFullscreen;
  const setIsFullscreen = onExitFullscreen ? () => onExitFullscreen() : setInternalFullscreen;

  const { data: customFieldDefs } = useCustomFieldDefinitions(organizationId);
  const { data: orgCfValues } = useOrganizationProjectCustomFieldValues(organizationId);

  const projectCustomFields = useMemo(() => {
    return (customFieldDefs || []).filter(d => d.entityType === "project" && d.isActive);
  }, [customFieldDefs]);

  const cfValuesMap = useMemo(() => {
    const map = new Map<string, ProjectCustomFieldValue>();
    (orgCfValues || []).forEach(v => {
      map.set(`${v.projectId}_${v.fieldDefinitionId}`, v);
    });
    return map;
  }, [orgCfValues]);

  const allGridColumns = useMemo<GridColumn[]>(() => {
    const cfColumns: GridColumn[] = projectCustomFields.map(cf => ({
      id: `cf_${cf.id}`,
      label: cf.name,
      defaultVisible: false,
    }));
    return [...ALL_GRID_COLUMNS, ...cfColumns];
  }, [projectCustomFields]);

  const defaultColumns = useMemo(() => ALL_GRID_COLUMNS.filter(c => c.defaultVisible).map(c => c.id), []);
  const defaultColumnOrder = useMemo(() => allGridColumns.map(c => c.id), [allGridColumns]);

  const defaultWidths = useMemo(() => ({
    name: 200,
    projectCode: 120,
    status: 120,
    priority: 100,
    health: 100,
    billableStatus: 120,
    portfolio: 150,
    startDate: 120,
    endDate: 120,
    baselineStartDate: 130,
    baselineEndDate: 130,
    actualStartDate: 120,
    actualEndDate: 120,
    budget: 120,
    actualCost: 120,
    forecastCost: 120,
    costVariance: 120,
    scheduleVariance: 130,
    completion: 100,
    projectType: 120,
    methodology: 120,
    department: 120,
    category: 120,
    businessValue: 120,
    riskLevel: 100,
    source: 100,
    owner: 150,
    createdAt: 120,
    updatedAt: 120,
    description: 200,
  }), []);

  const defaultGridSort = useMemo(() => ({ columnId: 'updatedAt' as const, direction: 'desc' as const }), []);

  const {
    columnWidths,
    sortState,
    handleColumnResize,
    handleColumnSort,
    getColumnWidth,
    getSortDirection,
  } = useColumnState({
    viewType: 'grid',
    organizationId,
    defaultWidths,
    defaultSort: defaultGridSort,
  });

  const getFieldValue = useCallback((project: Project, columnId: string): any => {
    switch (columnId) {
      case 'name': return project.name;
      case 'projectCode': return project.projectCode;
      case 'status': return project.status;
      case 'priority': return project.priority;
      case 'health': return project.health;
      case 'billableStatus': return project.billableStatus;
      case 'portfolio': return portfolios.find(p => p.id === project.portfolioId)?.name || '';
      case 'startDate': return project.startDate ? new Date(project.startDate) : null;
      case 'endDate': return project.endDate ? new Date(project.endDate) : null;
      case 'baselineStartDate': return project.baselineStartDate ? new Date(project.baselineStartDate) : null;
      case 'baselineEndDate': return project.baselineEndDate ? new Date(project.baselineEndDate) : null;
      case 'actualStartDate': return project.actualStartDate ? new Date(project.actualStartDate) : null;
      case 'actualEndDate': return project.actualEndDate ? new Date(project.actualEndDate) : null;
      case 'budget': return project.budget;
      case 'actualCost': return project.actualCost;
      case 'forecastCost': return project.forecastCost;
      case 'costVariance': return project.costVariance;
      case 'scheduleVariance': return project.scheduleVariance;
      case 'completion': return project.completionPercentage;
      case 'projectType': return project.projectType;
      case 'methodology': return project.methodology;
      case 'department': return project.department;
      case 'category': return project.category;
      case 'businessValue': return project.businessValue;
      case 'riskLevel': return project.riskLevel;
      case 'source': return project.source;
      case 'owner': return project.managerId;
      case 'createdAt': return project.createdAt ? new Date(project.createdAt) : null;
      case 'updatedAt': return (project as any).updatedAt ? new Date((project as any).updatedAt) : (project.createdAt ? new Date(project.createdAt) : null);
      case 'description': return project.description;
      default:
        if (columnId.startsWith("cf_")) {
          const cfId = parseInt(columnId.replace("cf_", ""));
          const cfValue = cfValuesMap.get(`${project.id}_${cfId}`);
          const rawValue = cfValue?.value ?? null;
          if (!rawValue) return null;
          const cfDef = projectCustomFields.find(d => d.id === cfId);
          if (cfDef?.fieldType === "number") return Number(rawValue);
          if (cfDef?.fieldType === "date") try { return new Date(rawValue); } catch { return rawValue; }
          if (cfDef?.fieldType === "checkbox") return rawValue === "true" ? 1 : 0;
          return rawValue;
        }
        return null;
    }
  }, [portfolios, cfValuesMap, projectCustomFields]);

  const sortedProjects = useMemo(() => {
    return sortData(projects, sortState, getFieldValue);
  }, [projects, sortState, getFieldValue]);

  const effectiveGridPageSize = gridPageSize === Infinity ? (sortedProjects.length || 1) : gridPageSize;

  const gridTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedProjects.length / effectiveGridPageSize));
  }, [sortedProjects, effectiveGridPageSize]);

  const displayedProjects = useMemo(() => {
    if (gridPageSize === Infinity) return sortedProjects;
    const start = (gridCurrentPage - 1) * gridPageSize;
    return sortedProjects.slice(start, start + gridPageSize);
  }, [sortedProjects, gridCurrentPage, gridPageSize]);

  const gridGroupByOptions = useMemo(() => {
    const options = [...GROUP_BY_STANDARD];
    projectCustomFields.forEach(def => {
      options.push({ value: `cf_${def.id}` as GroupByOption, label: def.name });
    });
    return options;
  }, [projectCustomFields]);

  useEffect(() => {
    if (gridGroupBy !== "none" && !gridGroupByOptions.some(o => o.value === gridGroupBy)) {
      handleGridGroupByChange("none");
    }
  }, [gridGroupBy, gridGroupByOptions, handleGridGroupByChange]);

  const gridGroupedProjects = useMemo(() => {
    if (gridGroupBy === "none") {
      return [{ key: "__all__", label: "", projects: displayedProjects, meta: null as any }];
    }

    const portfolioMap = new Map<number, Portfolio>();
    portfolios.forEach(p => portfolioMap.set(p.id, p));

    const getGroupKeyAndLabel = (project: Project): { key: string; label: string; sortOrder: number } => {
      switch (gridGroupBy) {
        case "portfolio": {
          const pid = project.portfolioId ?? null;
          const resolvedPid = pid !== null && portfolioMap.has(pid) ? pid : null;
          if (resolvedPid === null) return { key: "unassigned", label: "Unassigned", sortOrder: 999 };
          const p = portfolioMap.get(resolvedPid)!;
          return { key: `portfolio-${resolvedPid}`, label: p.name, sortOrder: 0 };
        }
        case "status": {
          const s = project.status || "Unknown";
          const idx = PROJECT_STATUS_LIST.indexOf(s);
          return { key: `status-${s}`, label: s, sortOrder: idx >= 0 ? idx : 999 };
        }
        case "priority": {
          const p = project.priority || "Medium";
          const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
          return { key: `priority-${p}`, label: p, sortOrder: order[p] ?? 4 };
        }
        case "health": {
          const h = project.health || "Green";
          const order: Record<string, number> = { Red: 0, Yellow: 1, Green: 2 };
          const labels: Record<string, string> = { Green: "On Track", Yellow: "At Risk", Red: "Off Track" };
          return { key: `health-${h}`, label: labels[h] || h, sortOrder: order[h] ?? 3 };
        }
        case "projectType": {
          const t = project.projectType || "";
          if (!t) return { key: "type-unset", label: "No Type", sortOrder: 999 };
          return { key: `type-${t}`, label: t, sortOrder: 0 };
        }
        case "methodology": {
          const m = project.methodology || "";
          if (!m) return { key: "method-unset", label: "No Methodology", sortOrder: 999 };
          return { key: `method-${m}`, label: m, sortOrder: 0 };
        }
        case "workflow": {
          const wfName = getWorkflowName(project.workflowId);
          return { key: `workflow-${project.workflowId ?? "default"}`, label: wfName, sortOrder: 0 };
        }
        default: {
          if (gridGroupBy.startsWith("cf_")) {
            const defId = parseInt(gridGroupBy.slice(3));
            const cfVal = cfValuesMap.get(`${project.id}_${defId}`);
            const raw = cfVal?.value || "";
            if (!raw) return { key: `cf-${defId}-unset`, label: "Not Set", sortOrder: 999 };
            const cfDef = projectCustomFields.find(d => d.id === defId);
            let displayLabel = raw;
            if (cfDef?.fieldType === "checkbox") {
              displayLabel = raw === "true" ? "Yes" : "No";
            } else if (cfDef?.fieldType === "multiselect") {
              try { displayLabel = JSON.parse(raw).join(", "); } catch { /* use raw */ }
            }
            return { key: `cf-${defId}-${raw}`, label: displayLabel, sortOrder: 0 };
          }
          return { key: "__all__", label: "", sortOrder: 0 };
        }
      }
    };

    const groupMap = new Map<string, { label: string; projects: Project[]; sortOrder: number; portfolio: Portfolio | null }>();
    displayedProjects.forEach(project => {
      const { key, label, sortOrder } = getGroupKeyAndLabel(project);
      if (!groupMap.has(key)) {
        const portfolio = gridGroupBy === "portfolio" && project.portfolioId ? portfolioMap.get(project.portfolioId) || null : null;
        groupMap.set(key, { label, projects: [], sortOrder, portfolio });
      }
      groupMap.get(key)!.projects.push(project);
    });

    return Array.from(groupMap.entries())
      .sort(([, a], [, b]) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.label.localeCompare(b.label);
      })
      .map(([key, val]) => ({ key, label: val.label, projects: val.projects, meta: val.portfolio }));
  }, [displayedProjects, portfolios, gridGroupBy, cfValuesMap, projectCustomFields, getWorkflowName]);

  const gridAllGroupsCollapsed = gridGroupedProjects.length > 0 && gridGroupedProjects.every(g => gridCollapsedGroups[g.key] === true);

  const gridCollapseAll = useCallback(() => {
    const collapsed: Record<string, boolean> = {};
    gridGroupedProjects.forEach(g => { collapsed[g.key] = true; });
    setGridCollapsedGroups(collapsed);
  }, [gridGroupedProjects]);

  const gridExpandAll = useCallback(() => {
    setGridCollapsedGroups({});
  }, []);

  const gridCurrentGroupLabel = gridGroupByOptions.find(o => o.value === gridGroupBy)?.label || "None";

  const handleApplyView = (view: { visibleColumns: string[]; columnOrder: string[] }) => {
    setVisibleColumns(view.visibleColumns);
    setColumnOrder(view.columnOrder);
    saveColumns(view.visibleColumns);
    saveColumnOrder(view.columnOrder);
  };
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );
  
  const toggleColumn = (columnId: string) => {
    setVisibleColumns(prev => {
      const newColumns = prev.includes(columnId) 
        ? prev.filter(c => c !== columnId)
        : [...prev, columnId];
      saveColumns(newColumns);
      return newColumns;
    });
    setColumnOrder(prev => {
      if (!prev.includes(columnId)) {
        const newOrder = [...prev, columnId];
        saveColumnOrder(newOrder);
        return newOrder;
      }
      return prev;
    });
  };

  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    setColumnOrder(prev => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      const newOrder = arrayMove(prev, oldIndex, newIndex);
      saveColumnOrder(newOrder);
      return newOrder;
    });
  };

  const getPortfolioName = (portfolioId: number | null | undefined) => {
    if (!portfolioId) return "-";
    const portfolio = portfolios.find(p => p.id === portfolioId);
    return portfolio?.name || "-";
  };

  const toggleSelectProject = (projectId: number) => {
    setSelectedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedProjects.size === projects.length) {
      setSelectedProjects(new Set());
    } else {
      setSelectedProjects(new Set(projects.map(p => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    const projectIds = Array.from(selectedProjects);
    for (const projectId of projectIds) {
      onDeleteProject(projectId);
    }
    setSelectedProjects(new Set());
    setBulkDeleteOpen(false);
    toast({ title: "Projects deleted", description: `${projectIds.length} project(s) moved to recycle bin` });
  };

  const startEditing = (projectId: number, columnId: string, currentValue: string) => {
    setEditingCell({ projectId, columnId });
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    if (!editingCell) return;
    const { projectId, columnId } = editingCell;
    
    const updateData: Partial<Project> = {};
    switch (columnId) {
      case "name":
        if (editValue.trim()) updateData.name = editValue;
        break;
      case "budget":
        updateData.budget = editValue;
        break;
      case "description":
        updateData.description = editValue;
        break;
    }
    
    if (Object.keys(updateData).length > 0) {
      onUpdateProject(projectId, updateData);
    }
    setEditingCell(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const getOrderedVisibleColumns = () => {
    return columnOrder
      .filter(id => visibleColumns.includes(id))
      .map(id => allGridColumns.find(c => c.id === id)!)
      .filter(Boolean);
  };

  const renderCellContent = (project: Project, columnId: string) => {
    const isEditing = editingCell?.projectId === project.id && editingCell?.columnId === columnId;
    
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            className="h-7 text-sm"
            autoFocus
            data-testid={`edit-input-${columnId}-${project.id}`}
          />
          <Button size="icon" variant="ghost" onClick={saveEdit} className="h-6 w-6">
            <Check className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-6 w-6">
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }
    
    switch (columnId) {
      case "name":
        return (
          <div className="flex items-center gap-2 group min-w-0">
            <Link href={`/projects/${project.id}`} className="font-medium text-primary hover:underline truncate flex-1 min-w-0" title={project.name}>
              {project.name}
            </Link>
            {(project as any).isInternal && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400 flex-shrink-0">
                Internal
              </Badge>
            )}
            {project.timesheetBlocked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-shrink-0" data-testid={`project-ts-blocked-table-${project.id}`}>
                    <LockIcon className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Timesheet entries blocked</TooltipContent>
              </Tooltip>
            )}
            {project.source === "planner" && project.plannerPlanId && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(`https://planner.cloud.microsoft/webui/plan/${project.plannerPlanId}/view/board`, '_blank');
                }}
                className="flex-shrink-0 flex items-center gap-0.5"
                title="Open in Planner"
              >
                <img src={plannerLogoPath} alt="Planner" className="h-4 w-4" />
                <Cloud className="h-3 w-3 text-indigo-500" />
              </button>
            )}
            {(project.source === "planner-premium" || project.source === "planner_premium") && project.plannerPlanId && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const tenantId = project.dataverseTenantId || '';
                  const planId = project.plannerPlanId;
                  const premiumUrl = tenantId 
                    ? `https://planner.cloud.microsoft/${tenantId}/en-US/Home/Planner/#/plantaskboard?planId=${planId}`
                    : `https://planner.cloud.microsoft/webui/plan/${planId}/view/board`;
                  window.open(premiumUrl, '_blank');
                }}
                className="flex-shrink-0 flex items-center gap-0.5"
                title="Open in Planner Premium"
              >
                <img src={plannerLogoPath} alt="Planner Premium" className="h-4 w-4" />
                <Crown className="h-3 w-3 text-purple-500" />
              </button>
            )}
            {project.source === "imported" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  {project.sourceFileUrl ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const link = document.createElement('a');
                        link.href = project.sourceFileUrl!;
                        link.download = project.sourceFileName || 'project.mpp';
                        link.click();
                      }}
                      className="flex-shrink-0 flex items-center gap-0.5"
                      title={`Download ${project.sourceFileName || "source file"}`}
                    >
                      <img src={msprojectLogoPath} alt="MS Project" className="h-4 w-4" />
                      <FileSpreadsheet className="h-3 w-3 text-emerald-500" />
                    </button>
                  ) : (
                    <span className="flex-shrink-0 flex items-center gap-0.5">
                      <img src={msprojectLogoPath} alt="MS Project" className="h-4 w-4" />
                      <FileSpreadsheet className="h-3 w-3 text-emerald-500" />
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent>{project.sourceFileUrl ? `Download ${project.sourceFileName || "source file"}` : "Imported from MS Project"}</TooltipContent>
              </Tooltip>
            )}
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => { e.preventDefault(); startEditing(project.id, "name", project.name); }}
              data-testid={`edit-name-${project.id}`}
            >
              <PenTool className="h-3 w-3" />
            </Button>
          </div>
        );
      case "status":
        return (
          <Select 
            value={project.status} 
            onValueChange={(newStatus) => onStatusChange(project.id, newStatus)}
          >
            <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs" data-testid={`grid-status-${project.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUS_LIST.map(status => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "priority":
        return (
          <Select 
            value={project.priority || "Medium"} 
            onValueChange={(newPriority) => onUpdateProject(project.id, { priority: newPriority })}
          >
            <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs border-0 p-0" data-testid={`grid-priority-${project.id}`}>
              <Badge className={cn(
                "text-xs",
                project.priority === 'Critical' && "bg-rose-500 text-white hover:bg-rose-500",
                project.priority === 'High' && "bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400",
                project.priority === 'Medium' && "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400",
                project.priority === 'Low' && "bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400"
              )}>
                {project.priority}
              </Badge>
            </SelectTrigger>
            <SelectContent>
              {[...PROJECT_PRIORITIES].reverse().map(priority => (
                <SelectItem key={priority} value={priority}>{priority}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "health":
        return (
          <Select 
            value={project.health || "Green"} 
            onValueChange={(newHealth) => onUpdateProject(project.id, { health: newHealth })}
          >
            <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs border-0 p-0" data-testid={`grid-health-${project.id}`}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-3 h-3 rounded-full",
                  project.health === 'Green' && "bg-emerald-500",
                  project.health === 'Yellow' && "bg-amber-500",
                  project.health === 'Red' && "bg-rose-500",
                )} />
                <span className="text-sm">{project.health || "-"}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {PROJECT_HEALTH_VALUES.map(health => (
                <SelectItem key={health} value={health}>{health}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "portfolio":
        return <span className="text-sm">{getPortfolioName(project.portfolioId)}</span>;
      case "startDate":
        return <span className="text-sm">{project.startDate ? format(new Date(project.startDate), 'MMM d, yyyy') : "-"}</span>;
      case "endDate":
        return <span className="text-sm">{project.endDate ? format(new Date(project.endDate), 'MMM d, yyyy') : "-"}</span>;
      case "budget":
        return (
          <div className="flex items-center gap-2 group">
            <CompactCurrency value={project.budget || 0} className="text-sm font-medium" />
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => startEditing(project.id, "budget", String(project.budget || "0"))}
              data-testid={`edit-budget-${project.id}`}
            >
              <PenTool className="h-3 w-3" />
            </Button>
          </div>
        );
      case "completion":
        return (
          <div className="flex items-center gap-2">
            <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full",
                  project.health === 'Green' && "bg-emerald-500",
                  project.health === 'Yellow' && "bg-amber-500",
                  project.health === 'Red' && "bg-rose-500",
                )}
                style={{ width: `${project.completionPercentage || 0}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{project.completionPercentage || 0}%</span>
          </div>
        );
      case "source":
        if ((project as any).isExternal) return <ExternalBadge organizationName={(project as any).sourceOrganizationName} />;
        if (project.source === "planner") return (
          <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
            <img src={plannerLogoPath} alt="Planner" className="h-3 w-3 mr-1" />
            <Cloud className="h-2.5 w-2.5 mr-1 text-indigo-500" />
            Planner
          </Badge>
        );
        if (project.source === "planner-premium" || project.source === "planner_premium") return (
          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
            <img src={plannerLogoPath} alt="Planner Premium" className="h-3 w-3 mr-1" />
            <Crown className="h-2.5 w-2.5 mr-1 text-purple-500" />
            Premium
          </Badge>
        );
        if (project.source === "imported") return (
          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <img src={msprojectLogoPath} alt="MS Project" className="h-3 w-3 mr-1" />
            <FileSpreadsheet className="h-2.5 w-2.5 mr-1 text-emerald-500" />
            MS Project
          </Badge>
        );
        return <Badge variant="outline" className="text-xs">Manual</Badge>;
      case "owner":
        const managerResource = project.managerResourceId ? resourceMap.get(project.managerResourceId) : null;
        if (!managerResource) return <span className="text-sm">-</span>;
        return (
          <MicrosoftContactCard
            displayName={managerResource.displayName}
            email={managerResource.email}
            title={managerResource.title}
            department={managerResource.department}
            phone={managerResource.phone}
            photoUrl={managerResource.photoUrl}
            side="top"
            align="start"
          >
            <span className="text-sm cursor-pointer hover:underline">{managerResource.displayName}</span>
          </MicrosoftContactCard>
        );
      case "description":
        return (
          <div className="flex items-center gap-2 group">
            <span className="text-sm text-muted-foreground line-clamp-1">{project.description || "-"}</span>
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={() => startEditing(project.id, "description", project.description || "")}
              data-testid={`edit-description-${project.id}`}
            >
              <PenTool className="h-3 w-3" />
            </Button>
          </div>
        );
      case "projectCode":
        return <span className="text-sm">{project.projectCode || "-"}</span>;
      case "billableStatus":
        const billableStatusColors: Record<string, string> = {
          "N/A": "bg-slate-400",
          "On Track": "bg-emerald-500",
          "Waiting for Approval": "bg-amber-500",
          "Verbal Approval": "bg-amber-500",
          "Email Approval": "bg-emerald-500",
          "SOW Signed": "bg-emerald-500",
          "PO Received": "bg-emerald-500",
          "Partially Invoiced": "bg-amber-500",
          "At Risk": "bg-amber-500",
          "Ready for Invoice": "bg-emerald-500",
          "Critical": "bg-rose-500",
          "Invoiced": "bg-blue-500",
        };
        const billableValue = project.billableStatus || "N/A";
        const billableColor = billableStatusColors[billableValue] || "bg-slate-400";
        return (
          <Badge variant="outline" className="text-xs">
            <span className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full shrink-0", billableColor)} />
              {billableValue}
            </span>
          </Badge>
        );
      case "baselineStartDate":
        return <span className="text-sm">{project.baselineStartDate ? format(new Date(project.baselineStartDate), 'MMM d, yyyy') : "-"}</span>;
      case "baselineEndDate":
        return <span className="text-sm">{project.baselineEndDate ? format(new Date(project.baselineEndDate), 'MMM d, yyyy') : "-"}</span>;
      case "actualStartDate":
        return <span className="text-sm">{project.actualStartDate ? format(new Date(project.actualStartDate), 'MMM d, yyyy') : "-"}</span>;
      case "actualEndDate":
        return <span className="text-sm">{project.actualEndDate ? format(new Date(project.actualEndDate), 'MMM d, yyyy') : "-"}</span>;
      case "actualCost":
        return <CompactCurrency value={project.actualCost || 0} className="text-sm" />;
      case "forecastCost":
        return project.forecastCost ? <CompactCurrency value={project.forecastCost} className="text-sm" /> : <span className="text-sm">-</span>;
      case "costVariance":
        const costVar = Number(project.costVariance || 0);
        return (
          <span className={cn("text-sm", costVar < 0 ? "text-rose-600" : costVar > 0 ? "text-emerald-600" : "")}>
            {project.costVariance ? <CompactCurrency value={costVar} /> : "-"}
          </span>
        );
      case "scheduleVariance":
        const schedVar = project.scheduleVariance || 0;
        return (
          <span className={cn("text-sm", schedVar < 0 ? "text-rose-600" : schedVar > 0 ? "text-emerald-600" : "")}>
            {project.scheduleVariance ? `${schedVar} days` : "-"}
          </span>
        );
      case "projectType":
        return <span className="text-sm">{project.projectType || "-"}</span>;
      case "methodology":
        return <span className="text-sm">{project.methodology || "-"}</span>;
      case "workflow":
        return (
          <Badge variant="outline" className="text-[11px] font-medium px-2 py-0.5 rounded-md max-w-full" title={getWorkflowName(project.workflowId)}>
            <span className="truncate">{getWorkflowName(project.workflowId)}</span>
          </Badge>
        );
      case "department":
        return <span className="text-sm">{project.department || "-"}</span>;
      case "category":
        return <span className="text-sm">{project.category || "-"}</span>;
      case "businessValue":
        return <span className="text-sm text-muted-foreground line-clamp-1">{project.businessValue || "-"}</span>;
      case "riskLevel":
        return project.riskLevel ? (
          <Badge variant="outline" className={cn(
            "text-xs",
            project.riskLevel === "High" && "border-rose-500 text-rose-600",
            project.riskLevel === "Medium" && "border-amber-500 text-amber-600",
            project.riskLevel === "Low" && "border-emerald-500 text-emerald-600"
          )}>
            {project.riskLevel}
          </Badge>
        ) : <span className="text-sm">-</span>;
      case "createdAt":
        return <span className="text-sm">{project.createdAt ? format(new Date(project.createdAt), 'MMM d, yyyy') : "-"}</span>;
      case "updatedAt":
        return <span className="text-sm">{(project as any).updatedAt ? format(new Date((project as any).updatedAt), 'MMM d, yyyy') : "-"}</span>;
      case "isInternal":
        return (project as any).isInternal ? (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">
            Internal
          </Badge>
        ) : <span className="text-sm text-muted-foreground">-</span>;
      default:
        if (columnId.startsWith("cf_")) {
          const cfId = parseInt(columnId.replace("cf_", ""));
          const cfValue = cfValuesMap.get(`${project.id}_${cfId}`);
          const rawValue = cfValue?.value ?? null;
          if (!rawValue) return <span className="text-sm text-muted-foreground">-</span>;
          const cfDef = projectCustomFields.find(d => d.id === cfId);
          if (cfDef?.fieldType === "checkbox") {
            return <span className="text-sm">{rawValue === "true" ? "Yes" : "No"}</span>;
          }
          if (cfDef?.fieldType === "multiselect") {
            try {
              const arr = JSON.parse(rawValue) as string[];
              return (
                <div className="flex flex-wrap gap-1">
                  {arr.map((v, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{v}</Badge>
                  ))}
                </div>
              );
            } catch { return <span className="text-sm">{rawValue}</span>; }
          }
          if (cfDef?.fieldType === "date" && rawValue) {
            try {
              return <span className="text-sm">{format(new Date(rawValue), 'MMM d, yyyy')}</span>;
            } catch { return <span className="text-sm">{rawValue}</span>; }
          }
          if (cfDef?.fieldType === "number" && rawValue) {
            return <span className="text-sm">{Number(rawValue).toLocaleString()}</span>;
          }
          if (cfDef?.fieldType === "url" && rawValue) {
            return (
              <a href={rawValue} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate">
                {rawValue}
              </a>
            );
          }
          return <span className="text-sm">{rawValue}</span>;
        }
        return "-";
    }
  };

  const orderedVisibleColumns = getOrderedVisibleColumns();

  return (
    <div className={cn(
      "space-y-4",
      isFullscreen && "fixed inset-0 z-50 bg-background flex flex-col"
    )}>
      {/* Fullscreen Header */}
      {isFullscreen && (
        <div className="flex items-center justify-between gap-4 px-4 py-2 border-b bg-background shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Projects</h2>
            <ViewsDropdown
              mode="grid"
              organizationId={organizationId}
              allColumns={allGridColumns}
              visibleColumns={visibleColumns}
              columnOrder={columnOrder}
              onApplyView={handleApplyView}
              defaultColumns={defaultColumns}
              defaultColumnOrder={defaultColumnOrder}
              filterView={filterView}
              onFilterViewChange={onFilterViewChange}
            />
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Group by:</span>
              <Select value={gridGroupBy} onValueChange={(v) => handleGridGroupByChange(v as GroupByOption)}>
                <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs border-border/60 bg-background shadow-none gap-1">
                  <SelectValue>{gridCurrentGroupLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {gridGroupByOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {gridGroupBy !== "none" && gridGroupedProjects.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                onClick={gridAllGroupsCollapsed ? gridExpandAll : gridCollapseAll}
              >
                {gridAllGroupsCollapsed ? (
                  <>
                    <ChevronsUpDown className="h-3 w-3 mr-1" />
                    Expand All
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Collapse All
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedProjects.size > 0 && (
              <>
                <span className="text-sm text-muted-foreground">{selectedProjects.size} selected</span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedProjects(new Set())}>
                  Clear
                </Button>
                {isAdmin && (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => setBulkDeleteOpen(true)}
                    data-testid="button-bulk-delete-fullscreen"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                )}
              </>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-grid-columns-fullscreen">
                  <Settings2 className="h-4 w-4 mr-2" />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Show Columns</p>
                  <p className="text-xs text-muted-foreground">Drag column headers to reorder</p>
                  <div className="space-y-1">
                    {[...allGridColumns].sort((a, b) => a.label.localeCompare(b.label)).map(column => (
                      <div
                        key={column.id}
                        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted cursor-pointer"
                        onClick={() => toggleColumn(column.id)}
                        data-testid={`toggle-column-fullscreen-${column.id}`}
                      >
                        <Checkbox 
                          checked={visibleColumns.includes(column.id)}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={() => toggleColumn(column.id)}
                        />
                        <span className="text-sm">{column.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onExitFullscreen}
              data-testid="button-exit-fullscreen"
            >
              <Minimize2 className="h-4 w-4 mr-2" />
              Exit Fullscreen
            </Button>
          </div>
        </div>
      )}
      
      {/* Bulk Actions Toolbar - Only show in non-fullscreen mode */}
      {!externalFullscreen && selectedProjects.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selectedProjects.size} project(s) selected</span>
          <Button variant="ghost" size="sm" onClick={() => setSelectedProjects(new Set())}>
            Clear selection
          </Button>
          {isAdmin && (
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={() => setBulkDeleteOpen(true)}
              data-testid="button-bulk-delete"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
          )}
        </div>
      )}
      
      {/* Toolbar - Only show in non-fullscreen mode */}
      {!isFullscreen && (
        <div className="flex justify-between gap-2">
          <div className="flex items-center gap-4">
            <ViewsDropdown
              mode="grid"
              organizationId={organizationId}
              allColumns={allGridColumns}
              visibleColumns={visibleColumns}
              columnOrder={columnOrder}
              onApplyView={handleApplyView}
              defaultColumns={defaultColumns}
              defaultColumnOrder={defaultColumnOrder}
              filterView={filterView}
              onFilterViewChange={onFilterViewChange}
            />
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Group by:</span>
              <Select value={gridGroupBy} onValueChange={(v) => handleGridGroupByChange(v as GroupByOption)}>
                <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs border-border/60 bg-background shadow-none gap-1">
                  <SelectValue>{gridCurrentGroupLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {gridGroupByOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {gridGroupBy !== "none" && gridGroupedProjects.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                onClick={gridAllGroupsCollapsed ? gridExpandAll : gridCollapseAll}
              >
                {gridAllGroupsCollapsed ? (
                  <>
                    <ChevronsUpDown className="h-3 w-3 mr-1" />
                    Expand All
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Collapse All
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-grid-columns">
                  <Settings2 className="h-4 w-4 mr-2" />
                  Columns
                </Button>
              </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-0">
              <div className="p-3 pb-2 border-b">
                <p className="text-sm font-medium">Show Columns</p>
                <p className="text-xs text-muted-foreground">Drag column headers to reorder</p>
              </div>
              <div className="max-h-64 overflow-y-auto p-2">
                <div className="space-y-1">
                  {[...allGridColumns].sort((a, b) => a.label.localeCompare(b.label)).map(column => (
                    <div
                      key={column.id}
                      className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted cursor-pointer"
                      onClick={() => toggleColumn(column.id)}
                      data-testid={`toggle-column-${column.id}`}
                    >
                      <Checkbox 
                        checked={visibleColumns.includes(column.id)}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => toggleColumn(column.id)}
                      />
                      <span className="text-sm">{column.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          </div>
        </div>
      )}

      <div className={cn(
        "rounded-lg border bg-card overflow-x-auto",
        isFullscreen && "flex-1 overflow-auto border-0 rounded-none [&>div]:overflow-visible"
      )}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
          <Table>
            <TableHeader className={cn(isFullscreen && "sticky top-0 z-20 bg-card shadow-sm")}>
              <TableRow className={cn(isFullscreen && "bg-card")}>
                <TableHead className={cn("w-10 sticky left-0 z-10 bg-card", isFullscreen && "bg-card")}>
                  <Checkbox 
                    checked={projects.length > 0 && selectedProjects.size === projects.length}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <SortableContext items={orderedVisibleColumns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                  {orderedVisibleColumns.map(column => (
                    <ResizableSortableColumnHeader 
                      key={column.id} 
                      column={column} 
                      isFullscreen={isFullscreen}
                      width={getColumnWidth(column.id, defaultWidths[column.id as keyof typeof defaultWidths] || 150)}
                      sortDirection={getSortDirection(column.id)}
                      onSort={() => handleColumnSort(column.id)}
                      onResize={(width) => handleColumnResize(column.id, width)}
                    >
                      {column.label}
                    </ResizableSortableColumnHeader>
                  ))}
                </SortableContext>
                <TableHead className={cn("w-10", isFullscreen && "bg-card")}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProjects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={orderedVisibleColumns.length + 2} className="text-center py-8 text-muted-foreground">
                    No projects found
                  </TableCell>
                </TableRow>
              ) : (
                gridGroupedProjects.map((group) => {
                  const isGroupCollapsed = gridCollapsedGroups[group.key] === true;
                  const showGroupHeader = gridGroupBy !== "none";
                  const portfolio = gridGroupBy === "portfolio" ? group.meta as Portfolio | null : null;
                  const portfolioHealth = portfolio ? (HEALTH_CONFIG[portfolio.healthScore || 'Green'] || HEALTH_CONFIG.Green) : null;
                  const statusColor = gridGroupBy === "status" ? (STATUS_COLORS[group.label] || "") : "";
                  const priorityColor = gridGroupBy === "priority" ? (PRIORITY_COLORS[group.label] || "") : "";
                  const healthConfig = gridGroupBy === "health" ? (Object.values(HEALTH_CONFIG).find(h => h.label === group.label) || null) : null;

                  const rows: JSX.Element[] = [];
                  if (showGroupHeader) {
                    rows.push(
                        <TableRow key={`${group.key}-header`} className="bg-gradient-to-r from-muted/60 to-muted/30 hover:from-muted/80 hover:to-muted/50 cursor-pointer border-b-2 border-border/60" onClick={() => toggleGridGroup(group.key)}>
                          <TableCell colSpan={orderedVisibleColumns.length + 2} className="py-2.5 px-4">
                            <div className="flex items-center gap-3">
                              <ChevronRight className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200", isGroupCollapsed ? "" : "rotate-90")} />
                              {gridGroupBy === "portfolio" && (
                                <FolderOpen className="h-4 w-4 text-primary/70 shrink-0" />
                              )}
                              {gridGroupBy === "status" && statusColor && (
                                <div className={cn("w-3 h-3 rounded-sm shrink-0", statusColor.split(" ")[0])} />
                              )}
                              {gridGroupBy === "health" && healthConfig && (
                                <div className={cn("w-3 h-3 rounded-full shrink-0", healthConfig.dot)} />
                              )}
                              {gridGroupBy === "priority" && priorityColor && (
                                <div className={cn("w-3 h-3 rounded-sm shrink-0", priorityColor.split(" ")[0])} />
                              )}
                              <span className="text-sm font-bold text-foreground truncate tracking-tight">
                                {group.label}
                              </span>
                              <Badge variant="secondary" className="text-[10px] px-2 py-0.5 shrink-0 font-semibold rounded-full bg-primary/10 text-primary border-0">
                                {group.projects.length}
                              </Badge>
                              {portfolio && portfolioHealth && (
                                <>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <div className={cn("w-2 h-2 rounded-full", portfolioHealth.dot)} />
                                    <span className="text-[11px] text-muted-foreground">{portfolioHealth.label}</span>
                                  </div>
                                  {portfolio.status && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                                      {portfolio.status}
                                    </Badge>
                                  )}
                                  {portfolio.budgetAllocated && Number(portfolio.budgetAllocated) > 0 && (
                                    <span className="text-[11px] text-muted-foreground shrink-0">
                                      Budget: <CompactCurrency value={portfolio.budgetAllocated} />
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                    );
                  }
                  if (!isGroupCollapsed) {
                    group.projects.forEach(project => {
                      rows.push(
                        <TableRow 
                          key={project.id} 
                          data-testid={`grid-row-${project.id}`}
                          className={cn(selectedProjects.has(project.id) && "bg-muted/50")}
                        >
                          <TableCell>
                            <Checkbox 
                              checked={selectedProjects.has(project.id)}
                              onCheckedChange={() => toggleSelectProject(project.id)}
                              data-testid={`checkbox-project-${project.id}`}
                            />
                          </TableCell>
                          {orderedVisibleColumns.map(column => {
                            const width = getColumnWidth(column.id, defaultWidths[column.id as keyof typeof defaultWidths] || 150);
                            return (
                              <TableCell 
                                key={column.id}
                                className="overflow-hidden"
                                style={{ 
                                  width: `${width}px`, 
                                  minWidth: `${width}px`, 
                                  maxWidth: `${width}px` 
                                }}
                              >
                                {renderCellContent(project, column.id)}
                              </TableCell>
                            );
                          })}
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" data-testid={`grid-menu-${project.id}`}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/projects/${project.id}`}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </Link>
                                </DropdownMenuItem>
                                {isAdmin && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => onDeleteProject(project.id)} 
                                      className="text-red-600 focus:text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  }
                  return rows;
                })
              )}
            </TableBody>
          </Table>
        </DndContext>
      </div>
      {sortedProjects.length > 0 && (
        <ProjectsPagination
          currentPage={gridCurrentPage}
          totalPages={gridTotalPages}
          totalItems={sortedProjects.length}
          pageSize={effectiveGridPageSize}
          onPageChange={setGridCurrentPage}
          onPageSizeChange={handleGridPageSizeChange}
          selectedPageSize={gridPageSize}
        />
      )}
      
      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedProjects.size} Project(s)</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete {selectedProjects.size} project(s)? They will be moved to the recycle bin.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleBulkDelete}
              data-testid="button-confirm-bulk-delete"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Kanban View Components
const KANBAN_STATUS_COLUMN_COLORS: Record<string, string> = {
  "Initiation": "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  "Planning": "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200",
  "Execution": "bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200",
  "Monitoring": "bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200",
  "Closing": "bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200",
  "Billing": "bg-cyan-100 text-cyan-700 dark:bg-cyan-800 dark:text-cyan-200",
  "Closed": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

const KANBAN_STATUS_COLUMNS = [
  ...PROJECT_STATUSES.map(s => ({ id: s, label: s, color: KANBAN_STATUS_COLUMN_COLORS[s] || "" })),
  { id: "Billing", label: "Billing", color: KANBAN_STATUS_COLUMN_COLORS["Billing"] },
  { id: "Closed", label: "Closed", color: KANBAN_STATUS_COLUMN_COLORS["Closed"], isLocked: true },
];

const KANBAN_PRIORITY_COLUMN_COLORS: Record<string, string> = {
  "Critical": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  "High": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "Medium": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Low": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const KANBAN_PRIORITY_COLUMNS = [...PROJECT_PRIORITIES].reverse().map(p => ({
  id: p,
  label: p,
  color: KANBAN_PRIORITY_COLUMN_COLORS[p] || "",
}));

const KANBAN_HEALTH_COLUMN_META: Record<string, { label: string; color: string }> = {
  "Green": { label: "On Track", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "Yellow": { label: "At Risk", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  "Red": { label: "Off Track", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
};

const KANBAN_HEALTH_COLUMNS = PROJECT_HEALTH_VALUES.map(h => ({
  id: h,
  label: KANBAN_HEALTH_COLUMN_META[h]?.label || h,
  color: KANBAN_HEALTH_COLUMN_META[h]?.color || "",
}));

type KanbanGroupBy = "status" | "portfolio" | "priority" | "health" | "projectType" | "methodology" | `cf_${number}`;

const KANBAN_GROUP_BY_OPTIONS: { value: KanbanGroupBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "portfolio", label: "Portfolio" },
  { value: "priority", label: "Priority" },
  { value: "health", label: "Health" },
  { value: "projectType", label: "Project Type" },
  { value: "methodology", label: "Methodology" },
];

const DRAGGABLE_GROUPS = new Set<string>(["status", "portfolio", "priority", "health"]);

export function ProjectsKanbanView({ 
  projects, 
  portfolios,
  onStatusChange,
  onPortfolioChange,
  onProjectUpdate,
  customFieldDefs,
  cfValues,
  onCustomFieldChange,
}: { 
  projects: Project[]; 
  portfolios: Portfolio[];
  onStatusChange: (projectId: number, newStatus: string) => void;
  onPortfolioChange: (projectId: number, portfolioId: number | null) => void;
  onProjectUpdate: (projectId: number, updates: Partial<Project>) => void;
  customFieldDefs: CustomFieldDefinition[];
  cfValues: ProjectCustomFieldValue[];
  onCustomFieldChange: (projectId: number, fieldDefinitionId: number, value: string | null) => void;
}) {
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [groupBy, setGroupBy] = useState<KanbanGroupBy>("status");
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  const projectCustomFields = useMemo(() => {
    return customFieldDefs.filter(d => d.entityType === "project" && d.isActive);
  }, [customFieldDefs]);

  const cfValuesMap = useMemo(() => {
    const map = new Map<string, ProjectCustomFieldValue>();
    cfValues.forEach(v => {
      map.set(`${v.projectId}_${v.fieldDefinitionId}`, v);
    });
    return map;
  }, [cfValues]);

  const groupByOptions = useMemo(() => {
    const options = [...KANBAN_GROUP_BY_OPTIONS];
    projectCustomFields.forEach(def => {
      options.push({ value: `cf_${def.id}` as KanbanGroupBy, label: def.name });
    });
    return options;
  }, [projectCustomFields]);

  const isDraggable = useMemo(() => {
    if (DRAGGABLE_GROUPS.has(groupBy)) return true;
    if (groupBy.startsWith("cf_")) {
      const defId = parseInt(groupBy.slice(3));
      const cfDef = projectCustomFields.find(d => d.id === defId);
      return cfDef?.fieldType === "select" || cfDef?.fieldType === "checkbox";
    }
    return false;
  }, [groupBy, projectCustomFields]);

  const handleDragStart = (event: DragStartEvent) => {
    if (!isDraggable) return;
    const projectId = Number(event.active.id);
    const project = projects.find(p => p.id === projectId);
    if (project) setActiveProject(project);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveProject(null);
    if (!isDraggable) return;
    const { active, over } = event;
    if (!over) return;
    
    const projectId = Number(active.id);
    const targetId = String(over.id);
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    if (groupBy === "status") {
      if (project.status !== targetId && KANBAN_STATUS_COLUMNS.some(s => s.id === targetId)) {
        onStatusChange(projectId, targetId);
      }
    } else if (groupBy === "portfolio") {
      const newPortfolioId = targetId === "unassigned" ? null : Number(targetId);
      const currentPortfolioId = project.portfolioId ?? null;
      if (currentPortfolioId !== newPortfolioId) {
        onPortfolioChange(projectId, newPortfolioId);
      }
    } else if (groupBy === "priority") {
      if (project.priority !== targetId) {
        onProjectUpdate(projectId, { priority: targetId });
      }
    } else if (groupBy === "health") {
      if (project.health !== targetId) {
        onProjectUpdate(projectId, { health: targetId });
      }
    } else if (groupBy.startsWith("cf_")) {
      const defId = parseInt(groupBy.slice(3));
      const cfDef = projectCustomFields.find(d => d.id === defId);
      if (cfDef) {
        const newValue = targetId === "__unset__" ? null : targetId;
        const currentVal = cfValuesMap.get(`${projectId}_${defId}`)?.value || null;
        if (currentVal !== newValue) {
          onCustomFieldChange(projectId, defId, newValue);
        }
      }
    }
  };

  const columns = useMemo(() => {
    const defaultColor = "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";

    switch (groupBy) {
      case "status":
        return KANBAN_STATUS_COLUMNS;
      case "portfolio": {
        const cols = portfolios.map(p => ({
          id: String(p.id),
          label: p.name,
          color: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200",
        }));
        cols.push({ id: "unassigned", label: "Unassigned", color: defaultColor });
        return cols;
      }
      case "priority":
        return KANBAN_PRIORITY_COLUMNS;
      case "health":
        return KANBAN_HEALTH_COLUMNS;
      case "projectType": {
        const types = new Set<string>();
        projects.forEach(p => { if (p.projectType) types.add(p.projectType); });
        const cols = Array.from(types).sort().map(t => ({ id: t, label: t, color: defaultColor }));
        cols.push({ id: "__unset__", label: "No Type", color: defaultColor });
        return cols;
      }
      case "methodology": {
        const methods = new Set<string>();
        projects.forEach(p => { if (p.methodology) methods.add(p.methodology); });
        const cols = Array.from(methods).sort().map(m => ({ id: m, label: m, color: defaultColor }));
        cols.push({ id: "__unset__", label: "No Methodology", color: defaultColor });
        return cols;
      }
      default: {
        if (groupBy.startsWith("cf_")) {
          const defId = parseInt(groupBy.slice(3));
          const cfDef = projectCustomFields.find(d => d.id === defId);
          if (cfDef) {
            if (cfDef.fieldType === "select" && cfDef.options) {
              try {
                const options: string[] = JSON.parse(cfDef.options);
                const cols = options.map(opt => ({ id: opt, label: opt, color: defaultColor }));
                cols.push({ id: "__unset__", label: "Not Set", color: defaultColor });
                return cols;
              } catch { /* fallthrough */ }
            }
            if (cfDef.fieldType === "checkbox") {
              return [
                { id: "true", label: "Yes", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
                { id: "false", label: "No", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
              ];
            }
            const values = new Set<string>();
            projects.forEach(p => {
              const val = cfValuesMap.get(`${p.id}_${defId}`)?.value;
              if (val) {
                if (cfDef.fieldType === "multiselect") {
                  try { JSON.parse(val).forEach((v: string) => values.add(v)); } catch { values.add(val); }
                } else {
                  values.add(val);
                }
              }
            });
            const cols = Array.from(values).sort().map(v => ({ id: v, label: v, color: defaultColor }));
            cols.push({ id: "__unset__", label: "Not Set", color: defaultColor });
            return cols;
          }
        }
        return KANBAN_STATUS_COLUMNS;
      }
    }
  }, [groupBy, portfolios, projects, projectCustomFields, cfValuesMap]);

  const getProjectsForColumn = useCallback((columnId: string) => {
    switch (groupBy) {
      case "status":
        return projects.filter(p => p.status === columnId);
      case "portfolio":
        if (columnId === "unassigned") {
          return projects.filter(p => !p.portfolioId || !portfolios.some(pf => pf.id === p.portfolioId));
        }
        return projects.filter(p => p.portfolioId === Number(columnId));
      case "priority":
        return projects.filter(p => (p.priority || "Medium") === columnId);
      case "health":
        return projects.filter(p => (p.health || "Green") === columnId);
      case "projectType":
        if (columnId === "__unset__") return projects.filter(p => !p.projectType);
        return projects.filter(p => p.projectType === columnId);
      case "methodology":
        if (columnId === "__unset__") return projects.filter(p => !p.methodology);
        return projects.filter(p => p.methodology === columnId);
      default: {
        if (groupBy.startsWith("cf_")) {
          const defId = parseInt(groupBy.slice(3));
          const cfDef = projectCustomFields.find(d => d.id === defId);
          return projects.filter(p => {
            const val = cfValuesMap.get(`${p.id}_${defId}`)?.value || "";
            if (columnId === "__unset__") return !val;
            if (cfDef?.fieldType === "multiselect") {
              try { return (JSON.parse(val) as string[]).includes(columnId); } catch { return val === columnId; }
            }
            if (cfDef?.fieldType === "checkbox") {
              return (val || "false") === columnId;
            }
            return val === columnId;
          });
        }
        return projects.filter(p => p.status === columnId);
      }
    }
  }, [groupBy, projects, portfolios, projectCustomFields, cfValuesMap]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground font-medium">Group by:</span>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as KanbanGroupBy)}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groupByOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DndContext 
        sensors={sensors} 
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={cn(
          "flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 md:grid md:overflow-x-visible md:snap-none md:pb-0",
          columns.length <= 3 ? "md:grid-cols-3" : columns.length <= 5 ? "md:grid-cols-5" : columns.length <= 7 ? "md:grid-cols-4 lg:grid-cols-7" : "md:grid-cols-4"
        )}>
          {columns.map(col => (
            <ProjectKanbanColumn
              key={col.id}
              column={col}
              projects={getProjectsForColumn(col.id)}
              isDraggable={isDraggable}
            />
          ))}
        </div>
        <DragOverlay>
          {activeProject && (
            <div className="opacity-80">
              <Card className="shadow-lg border-primary">
                <CardContent className="p-4">
                  <div className="font-medium text-sm">{activeProject.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{activeProject.completionPercentage}% complete</div>
                </CardContent>
              </Card>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function ProjectKanbanColumn({ 
  column, 
  projects,
  isDraggable,
}: { 
  column: { id: string; label: string; color: string }; 
  projects: Project[];
  isDraggable: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "space-y-3 min-h-[300px] rounded-lg transition-colors p-2 min-w-[280px] snap-center flex-shrink-0 md:min-w-0 md:flex-shrink",
        isDraggable && isOver && "bg-primary/5 ring-2 ring-primary ring-dashed"
      )}
    >
      <div className={cn("rounded-lg p-3 font-semibold text-center flex items-center justify-center gap-2", column.color)}>
        <span>{column.label}</span>
        <Badge variant="secondary" className="text-xs font-medium">{projects.length}</Badge>
      </div>
      <div className="space-y-3">
        {projects.map(project => (
          <DraggableProjectCard key={project.id} project={project} isDraggable={isDraggable} />
        ))}
        {projects.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
            {isDraggable ? "Drop projects here" : "No projects"}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableProjectCard({ project, isDraggable = true }: { project: Project; isDraggable?: boolean }) {
  const [, navigate] = useLocation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: project.id,
    disabled: !isDraggable,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const dragMovedRef = useRef(false);
  useEffect(() => {
    if (isDragging) {
      dragMovedRef.current = true;
    } else if (dragMovedRef.current) {
      const t = setTimeout(() => { dragMovedRef.current = false; }, 250);
      return () => clearTimeout(t);
    }
  }, [isDragging]);

  const handlePointerDownReset = () => {
    if (!isDragging) dragMovedRef.current = false;
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const target = e.target as HTMLElement;
    const interactive = target.closest('button, a');
    if (interactive && e.currentTarget.contains(interactive)) return;
    navigate(`/projects/${project.id}`);
  };

  const cardBody = (
        <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="font-medium text-sm line-clamp-2 flex-1">{project.name}</div>
              {(project as any).isInternal && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400 flex-shrink-0">
                  Internal
                </Badge>
              )}
              {project.timesheetBlocked && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-shrink-0" data-testid={`project-timesheet-blocked-${project.id}`}>
                      <LockIcon className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Timesheet entries blocked</TooltipContent>
                </Tooltip>
              )}
              {project.source === "planner" && project.plannerPlanId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(`https://planner.cloud.microsoft/webui/plan/${project.plannerPlanId}/view/board`, '_blank');
                  }}
                  className="flex-shrink-0 flex items-center gap-0.5"
                  title="Open in Planner"
                >
                  <img src={plannerLogoPath} alt="Planner" className="h-4 w-4" />
                  <Cloud className="h-3 w-3 text-indigo-500" />
                </button>
              )}
              {(project.source === "planner-premium" || project.source === "planner_premium") && project.plannerPlanId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const tenantId = project.dataverseTenantId || '';
                    const planId = project.plannerPlanId;
                    const premiumUrl = tenantId 
                      ? `https://planner.cloud.microsoft/${tenantId}/en-US/Home/Planner/#/plantaskboard?planId=${planId}`
                      : `https://planner.cloud.microsoft/webui/plan/${planId}/view/board`;
                    window.open(premiumUrl, '_blank');
                  }}
                  className="flex-shrink-0 flex items-center gap-0.5"
                  title="Open in Planner Premium"
                >
                  <img src={plannerLogoPath} alt="Planner Premium" className="h-4 w-4" />
                  <Crown className="h-3 w-3 text-purple-500" />
                </button>
              )}
              {project.source === "imported" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    {project.sourceFileUrl ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const link = document.createElement('a');
                          link.href = project.sourceFileUrl!;
                          link.download = project.sourceFileName || 'project.mpp';
                          link.click();
                        }}
                        className="flex-shrink-0 flex items-center gap-0.5"
                        title={`Download ${project.sourceFileName || "source file"}`}
                      >
                        <img src={msprojectLogoPath} alt="MS Project" className="h-4 w-4" />
                        <FileSpreadsheet className="h-3 w-3 text-emerald-500" />
                      </button>
                    ) : (
                      <span className="flex-shrink-0 flex items-center gap-0.5">
                        <img src={msprojectLogoPath} alt="MS Project" className="h-4 w-4" />
                        <FileSpreadsheet className="h-3 w-3 text-emerald-500" />
                      </span>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>{project.sourceFileUrl ? `Download ${project.sourceFileName || "source file"}` : "Imported from MS Project"}</TooltipContent>
                </Tooltip>
              )}
            </div>
            
            <div className="flex items-center gap-2 mt-2">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full",
                    project.health === 'Green' && "bg-emerald-500",
                    project.health === 'Yellow' && "bg-amber-500",
                    project.health === 'Red' && "bg-rose-500",
                  )}
                  style={{ width: `${project.completionPercentage}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{project.completionPercentage}%</span>
            </div>

            <div className="flex items-center justify-between mt-3 gap-2">
              <Badge className={cn(
                "text-xs",
                project.priority === 'Critical' && "bg-rose-500 text-white hover:bg-rose-500",
                project.priority === 'High' && "bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400",
                project.priority === 'Medium' && "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400",
                project.priority === 'Low' && "bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400"
              )}>
                {project.priority}
              </Badge>
              {project.endDate && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(project.endDate), 'MMM d')}
                </span>
              )}
            </div>
          </CardContent>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isDraggable ? { ...attributes, ...listeners } : {})}
      className={cn(isDragging && "opacity-50")}
      onClick={isDraggable ? handleCardClick : undefined}
      onPointerDownCapture={isDraggable ? handlePointerDownReset : undefined}
    >
      {isDraggable ? (
        <Card
          className="cursor-grab hover:shadow-md transition-shadow active:cursor-grabbing select-none"
          data-testid={`kanban-project-${project.id}`}
        >
          {cardBody}
        </Card>
      ) : (
        <Link href={`/projects/${project.id}`}>
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            data-testid={`kanban-project-${project.id}`}
          >
            {cardBody}
          </Card>
        </Link>
      )}
    </div>
  );
}

// Gantt View Component
type ZoomLevel = 30 | 60 | 90 | 180 | 365 | 730 | 1095 | 1825;
type RangePreset = "month" | "quarter" | "year" | "2year" | "3year" | "5year" | "custom";
const zoomDaysArray: ZoomLevel[] = [30, 60, 90, 180, 365, 730, 1095, 1825];
const zoomDaysLabels: Record<ZoomLevel, string> = {
  30: '1 Month',
  60: '2 Months',
  90: '3 Months',
  180: '6 Months',
  365: '1 Year',
  730: '2 Years',
  1095: '3 Years',
  1825: '5 Years'
};

const GANTT_COLUMNS: GridColumn[] = [
  { id: "name", label: "Project", defaultVisible: true },
  { id: "status", label: "Status", defaultVisible: false },
  { id: "health", label: "Health", defaultVisible: false },
  { id: "completion", label: "%", defaultVisible: false },
];

export function ProjectsGanttView({ projects, organizationId }: { projects: Project[]; organizationId: number | null }) {
  const [zoomDays, setZoomDays] = useState<ZoomLevel>(90);
  const [rangePreset, setRangePreset] = useState<RangePreset>("custom");
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const [timelineStart, setTimelineStart] = useState(() => {
    const projectsWithDates = projects.filter(p => p.startDate);
    if (projectsWithDates.length > 0) {
      const earliestStart = projectsWithDates.reduce((earliest, p) => {
        const start = parseISO(p.startDate!);
        return start < earliest ? start : earliest;
      }, parseISO(projectsWithDates[0].startDate!));
      return startOfMonth(earliestStart);
    }
    return startOfMonth(new Date());
  });

  const timelineEnd = addDays(timelineStart, zoomDays - 1);
  const days = eachDayOfInterval({ start: timelineStart, end: timelineEnd });
  const totalDays = days.length;

  const getBarPosition = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return null;
    
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    
    const startOffset = Math.max(0, differenceInDays(start, timelineStart));
    const duration = differenceInDays(end, start) + 1;
    const endOffset = startOffset + duration;
    
    if (endOffset <= 0 || startOffset >= totalDays) return null;
    
    const clampedStart = Math.max(0, startOffset);
    const clampedEnd = Math.min(totalDays, endOffset);
    
    return {
      left: `${(clampedStart / totalDays) * 100}%`,
      width: `${((clampedEnd - clampedStart) / totalDays) * 100}%`,
    };
  };

  // Calculate "Today" marker position
  const [todayDate, setTodayDate] = useState(() => new Date());
  
  // Update today's date at midnight
  useEffect(() => {
    const now = new Date();
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const timeout = setTimeout(() => {
      setTodayDate(new Date());
    }, msUntilMidnight);
    return () => clearTimeout(timeout);
  }, [todayDate]);

  const todayOffset = differenceInDays(todayDate, timelineStart);
  const isTodayVisible = todayOffset >= 0 && todayOffset < totalDays;
  const todayPosition = isTodayVisible ? (todayOffset / totalDays) * 100 : null;

  const getTimeMarkers = () => {
    return days.reduce((acc, day, index) => {
      if (zoomDays <= 60) {
        if (day.getDate() === 1 || day.getDate() === 15 || index === 0) {
          acc.push({ index, label: format(day, 'MMM d') });
        }
      } else if (zoomDays <= 180) {
        if (day.getDate() === 1 || index === 0) {
          acc.push({ index, label: format(day, 'MMM yyyy') });
        }
      } else if (zoomDays <= 365) {
        if (day.getDate() === 1 && (day.getMonth() % 3 === 0 || index === 0)) {
          acc.push({ index, label: format(day, 'MMM yyyy') });
        }
      } else if (zoomDays <= 1095) {
        // 2-3 years: show every 6 months
        if (day.getDate() === 1 && (day.getMonth() % 6 === 0 || index === 0)) {
          acc.push({ index, label: format(day, 'MMM yyyy') });
        }
      } else {
        // 5 years: show yearly
        if (day.getDate() === 1 && day.getMonth() === 0) {
          acc.push({ index, label: format(day, 'yyyy') });
        }
      }
      return acc;
    }, [] as { index: number; label: string }[]);
  };

  const handleZoomIn = () => {
    setRangePreset("custom");
    const idx = zoomDaysArray.indexOf(zoomDays);
    if (idx > 0) setZoomDays(zoomDaysArray[idx - 1]);
  };

  const handleZoomOut = () => {
    setRangePreset("custom");
    const idx = zoomDaysArray.indexOf(zoomDays);
    if (idx < zoomDaysArray.length - 1) setZoomDays(zoomDaysArray[idx + 1]);
  };

  const handleRangePreset = (preset: RangePreset) => {
    setRangePreset(preset);
    const today = new Date();
    if (preset === "month") {
      setTimelineStart(startOfMonth(today));
      setZoomDays(30);
    } else if (preset === "quarter") {
      const quarterStart = startOfMonth(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1));
      setTimelineStart(quarterStart);
      setZoomDays(90);
    } else if (preset === "year") {
      setTimelineStart(new Date(today.getFullYear(), 0, 1));
      setZoomDays(365);
    } else if (preset === "2year") {
      setTimelineStart(new Date(today.getFullYear(), 0, 1));
      setZoomDays(730);
    } else if (preset === "3year") {
      setTimelineStart(new Date(today.getFullYear(), 0, 1));
      setZoomDays(1095);
    } else if (preset === "5year") {
      setTimelineStart(new Date(today.getFullYear(), 0, 1));
      setZoomDays(1825);
    }
  };

  const navigateTimeline = (direction: 'prev' | 'next') => {
    setRangePreset("custom");
    const step = zoomDays <= 60 ? 30 : zoomDays <= 180 ? 30 : 90;
    setTimelineStart(prev => addDays(prev, direction === 'next' ? step : -step));
  };

  const goToToday = () => {
    setRangePreset("custom");
    setTimelineStart(startOfMonth(new Date()));
  };

  // Auto-fit to show all project bars
  const handleAutoFit = () => {
    setRangePreset("custom");
    
    // Find the earliest start date and latest end date across all projects
    const projectsWithDates = projects.filter(p => p.startDate || p.endDate);
    if (projectsWithDates.length === 0) {
      // No projects with dates, default to showing current month
      setTimelineStart(startOfMonth(new Date()));
      setZoomDays(90);
      return;
    }
    
    let earliestStart: Date | null = null;
    let latestEnd: Date | null = null;
    
    for (const project of projectsWithDates) {
      if (project.startDate) {
        const start = parseISO(project.startDate);
        if (!earliestStart || start < earliestStart) {
          earliestStart = start;
        }
      }
      if (project.endDate) {
        const end = parseISO(project.endDate);
        if (!latestEnd || end > latestEnd) {
          latestEnd = end;
        }
      }
    }
    
    // If we only have start dates but no end dates, use start dates for both
    if (!earliestStart && latestEnd) earliestStart = latestEnd;
    if (!latestEnd && earliestStart) latestEnd = earliestStart;
    
    if (!earliestStart || !latestEnd) {
      setTimelineStart(startOfMonth(new Date()));
      setZoomDays(90);
      return;
    }
    
    // Add some padding (1 week before and after)
    const paddedStart = addDays(earliestStart, -7);
    const paddedEnd = addDays(latestEnd, 7);
    
    // Calculate the number of days needed
    const daysNeeded = differenceInDays(paddedEnd, paddedStart) + 1;
    
    // Find the smallest zoom level that fits all projects
    let bestZoom: ZoomLevel = 1825; // Start with largest
    for (const zoom of [...zoomDaysArray].reverse()) {
      if (zoom >= daysNeeded) {
        bestZoom = zoom;
      }
    }
    
    // Set timeline start to the beginning of the month of the earliest date
    setTimelineStart(startOfMonth(paddedStart));
    setZoomDays(bestZoom);
  };

  const timeMarkers = getTimeMarkers();

  const defaultGanttWidths = useMemo(() => ({ name: 256 }), []);

  const {
    sortState: ganttSortState,
    handleColumnSort: handleGanttSort,
    handleColumnResize: handleGanttResize,
    getColumnWidth: getGanttColumnWidth,
    getSortDirection: getGanttSortDirection,
  } = useColumnState({
    viewType: 'gantt',
    organizationId,
    defaultWidths: defaultGanttWidths,
  });

  const getGanttFieldValue = useCallback((project: Project, columnId: string): any => {
    switch (columnId) {
      case 'name': return project.name;
      case 'status': return project.status;
      case 'health': return project.health;
      case 'completion': return project.completionPercentage;
      case 'startDate': return project.startDate ? new Date(project.startDate) : null;
      case 'endDate': return project.endDate ? new Date(project.endDate) : null;
      default: return null;
    }
  }, []);

  const sortedGanttProjects = useMemo(() => {
    return sortData(projects, ganttSortState, getGanttFieldValue);
  }, [projects, ganttSortState, getGanttFieldValue]);

  const projectColumnWidth = getGanttColumnWidth('name', 256);

  const handleGanttResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = projectColumnWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startXRef.current;
      const newWidth = Math.max(150, Math.min(500, startWidthRef.current + diff));
      handleGanttResize('name', newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const renderGanttSortIcon = () => {
    const direction = getGanttSortDirection('name');
    if (direction === 'asc') {
      return <ArrowUp className="h-3 w-3 text-primary" />;
    }
    if (direction === 'desc') {
      return <ArrowDown className="h-3 w-3 text-primary" />;
    }
    return <ChevronsUpDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />;
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigateTimeline('prev')} data-testid="button-gantt-prev">
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday} data-testid="button-gantt-today">
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigateTimeline('next')} data-testid="button-gantt-next">
              Next
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-2">Range:</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <Button
                variant={rangePreset === "month" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none text-xs px-3"
                onClick={() => handleRangePreset("month")}
                data-testid="button-range-month"
              >
                Month
              </Button>
              <Button
                variant={rangePreset === "quarter" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none text-xs px-3"
                onClick={() => handleRangePreset("quarter")}
                data-testid="button-range-quarter"
              >
                Quarter
              </Button>
              <Button
                variant={rangePreset === "year" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none text-xs px-3"
                onClick={() => handleRangePreset("year")}
                data-testid="button-range-year"
              >
                Year
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-2">Zoom:</span>
            <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoomDaysArray.indexOf(zoomDays) === 0} data-testid="button-zoom-in">
              +
            </Button>
            <span className="text-xs text-muted-foreground min-w-[60px] text-center">{zoomDaysLabels[zoomDays]}</span>
            <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoomDaysArray.indexOf(zoomDays) === zoomDaysArray.length - 1} data-testid="button-zoom-out">
              -
            </Button>
            <Button variant="outline" size="sm" onClick={handleAutoFit} data-testid="button-auto-fit">
              Fit All
            </Button>
          </div>

          <span className="text-sm text-muted-foreground">
            {format(timelineStart, 'MMM d, yyyy')} - {format(timelineEnd, 'MMM d, yyyy')}
          </span>
        </div>

        <div className="relative overflow-x-auto">
          <div className="min-w-[800px] relative">
            <div className="flex border-b border-border mb-2">
              <div 
                className="flex-shrink-0 p-2 font-semibold text-sm relative group select-none cursor-pointer"
                style={{ width: `${projectColumnWidth}px` }}
                onClick={() => handleGanttSort('name')}
                data-testid="gantt-column-header-name"
              >
                <div className="flex items-center gap-1">
                  <span>Project</span>
                  {renderGanttSortIcon()}
                </div>
                <div
                  className={cn(
                    "absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 transition-colors",
                    isResizing && "bg-primary"
                  )}
                  onMouseDown={handleGanttResizeMouseDown}
                  onClick={(e) => e.stopPropagation()}
                  data-testid="gantt-resize-handle-name"
                />
              </div>
              <div className="flex-1 relative h-8">
                {timeMarkers.map((marker, i) => (
                  <div 
                    key={i}
                    className="absolute text-xs text-muted-foreground"
                    style={{ left: `${(marker.index / totalDays) * 100}%` }}
                  >
                    {marker.label}
                  </div>
                ))}
                {/* Today marker in header */}
                {todayPosition !== null && (
                  <div 
                    className="absolute top-0 bottom-0 z-30 pointer-events-none"
                    style={{ left: `${todayPosition}%` }}
                  >
                    <div className="w-[2px] h-full bg-rose-500" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap font-semibold shadow-md">
                      Today
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 relative">
              {sortedGanttProjects.map(project => {
                const barPosition = getBarPosition(project.startDate, project.endDate);
                
                return (
                  <div key={project.id} className="flex items-center">
                    <div 
                      className="flex-shrink-0 p-2"
                      style={{ width: `${projectColumnWidth}px` }}
                    >
                      <Link href={`/projects/${project.id}`}>
                        <div className="hover:text-primary cursor-pointer">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-sm truncate flex-1">{project.name}</div>
                            {project.source === "planner" && project.plannerPlanId && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.open(`https://planner.cloud.microsoft/webui/plan/${project.plannerPlanId}/view/board`, '_blank');
                                }}
                                className="flex-shrink-0 flex items-center gap-0.5"
                                title="Open in Planner"
                              >
                                <img src={plannerLogoPath} alt="Planner" className="h-4 w-4" />
                                <Cloud className="h-3 w-3 text-indigo-500" />
                              </button>
                            )}
                            {(project.source === "planner-premium" || project.source === "planner_premium") && project.plannerPlanId && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const tenantId = project.dataverseTenantId || '';
                                  const planId = project.plannerPlanId;
                                  const premiumUrl = tenantId 
                                    ? `https://planner.cloud.microsoft/${tenantId}/en-US/Home/Planner/#/plantaskboard?planId=${planId}`
                                    : `https://planner.cloud.microsoft/webui/plan/${planId}/view/board`;
                                  window.open(premiumUrl, '_blank');
                                }}
                                className="flex-shrink-0 flex items-center gap-0.5"
                                title="Open in Planner Premium"
                              >
                                <img src={plannerLogoPath} alt="Planner Premium" className="h-4 w-4" />
                                <Crown className="h-3 w-3 text-purple-500" />
                              </button>
                            )}
                            {project.source === "imported" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {project.sourceFileUrl ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const link = document.createElement('a');
                                        link.href = project.sourceFileUrl!;
                                        link.download = project.sourceFileName || 'project.mpp';
                                        link.click();
                                      }}
                                      className="flex-shrink-0 flex items-center gap-0.5"
                                      title={`Download ${project.sourceFileName || "source file"}`}
                                    >
                                      <img src={msprojectLogoPath} alt="MS Project" className="h-4 w-4" />
                                      <FileSpreadsheet className="h-3 w-3 text-emerald-500" />
                                    </button>
                                  ) : (
                                    <span className="flex-shrink-0 flex items-center gap-0.5">
                                      <img src={msprojectLogoPath} alt="MS Project" className="h-4 w-4" />
                                      <FileSpreadsheet className="h-3 w-3 text-emerald-500" />
                                    </span>
                                  )}
                                </TooltipTrigger>
                                <TooltipContent>{project.sourceFileUrl ? `Download ${project.sourceFileName || "source file"}` : "Imported from MS Project"}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">{project.status}</Badge>
                            <span className="text-xs text-muted-foreground">{project.completionPercentage}%</span>
                          </div>
                        </div>
                      </Link>
                    </div>
                    <div className="flex-1 relative h-10 bg-muted/30 rounded">
                      {barPosition ? (
                        <div
                          className={cn(
                            "absolute top-1 bottom-1 rounded-md flex items-center justify-center text-xs font-medium text-white",
                            project.health === 'Green' && "bg-emerald-500",
                            project.health === 'Yellow' && "bg-amber-500",
                            project.health === 'Red' && "bg-rose-500",
                            !project.health && "bg-primary"
                          )}
                          style={barPosition}
                          data-testid={`gantt-bar-${project.id}`}
                        >
                          <div className="truncate px-2">
                            {project.startDate && project.endDate && (
                              <span>{differenceInDays(parseISO(project.endDate), parseISO(project.startDate)) + 1}d</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                          No dates set
                        </div>
                      )}
                      {/* Today marker line in each row */}
                      {todayPosition !== null && (
                        <div 
                          className="absolute top-0 bottom-0 w-[2px] bg-rose-500 z-30 pointer-events-none"
                          style={{ left: `${todayPosition}%` }}
                          data-testid={`gantt-today-line-${project.id}`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {projects.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No projects to display
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
