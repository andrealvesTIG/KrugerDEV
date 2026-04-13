import { useState, useRef, useEffect, useMemo } from "react";
import { normalizeSearch } from "@/lib/utils";
import { useResources, useCreateResource, useUpdateResource, useDeleteResource } from "@/hooks/use-resources";
import { ResourceDialog } from "@/components/ResourceDialog";
import { useOrganization } from "@/hooks/use-organization";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Search, Users, Pencil, Trash2, DollarSign, MoreVertical, Download, Upload, GitMerge, ArrowRight, Check, ExternalLink, ClipboardList, ChevronDown, ChevronRight, FolderKanban, Building2, Layers, Wrench, Calendar, Clock, Percent, FileText, Target, ListTodo, User, Grid3X3, LayoutList, ZoomIn, ZoomOut, Maximize2, BarChart3, TrendingUp, CalendarDays, Sparkles, AlertTriangle, Lightbulb, ArrowUpDown, Loader2, RefreshCw, CircleDot } from "lucide-react";
import CapacityPlanningView from "@/components/resources/CapacityPlanningView";
import WorkloadDashboard from "@/components/resources/WorkloadDashboard";
import AvailabilityCalendar from "@/components/resources/AvailabilityCalendar";
import DemandForecast from "@/components/resources/DemandForecast";
import { MicrosoftContactCard } from "@/components/MicrosoftContactCard";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ExcelJS from "exceljs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Resource } from "@shared/schema";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, endOfWeek, addWeeks, parseISO, differenceInDays, startOfDay, endOfDay, addDays, startOfMonth, endOfMonth, addMonths, startOfQuarter, endOfQuarter, addQuarters, startOfYear, endOfYear, addYears, min, max } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


export default function Resources() {
  const { currentOrganization } = useOrganization();
  const { data: resources, isLoading } = useResources(currentOrganization?.id || null);
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const deleteResource = useDeleteResource();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [deleteResourceId, setDeleteResourceId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"resources" | "assignments" | "capacity" | "workload" | "availability" | "forecast">("resources");
  const [isAIOptimizeOpen, setIsAIOptimizeOpen] = useState(false);
  const [groupBy1, setGroupBy1] = useState<string>("resource");
  const [groupBy2, setGroupBy2] = useState<string>("none");
  const [groupBy3, setGroupBy3] = useState<string>("none");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const aiOptimizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/organizations/${currentOrganization?.id}/resource-optimization`);
      return res.json();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Fetch task details when a task is selected
  const { data: selectedTaskData, isLoading: isLoadingTask } = useQuery({
    queryKey: ['/api/tasks', selectedTaskId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tasks/${selectedTaskId}`);
      return res.json();
    },
    enabled: !!selectedTaskId && isTaskDialogOpen,
  });

  // Fetch task resource assignments
  const { data: taskResourcesData } = useQuery({
    queryKey: ['/api/tasks', selectedTaskId, 'resources'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tasks/${selectedTaskId}/resources`);
      return res.json();
    },
    enabled: !!selectedTaskId && isTaskDialogOpen,
  });

  const openTaskDialog = (taskId: number) => {
    setSelectedTaskId(taskId);
    setIsTaskDialogOpen(true);
  };

  const closeTaskDialog = () => {
    setIsTaskDialogOpen(false);
    setSelectedTaskId(null);
  };

  // Fetch resource assignments for Assignments View
  interface ResourceAssignment {
    assignmentId: number;
    taskId: number;
    resourceId: number;
    allocationPercentage: number | null;
    role: string | null;
    taskName: string;
    taskStatus: string | null;
    taskProgress: number | null;
    taskStartDate: string | null;
    taskEndDate: string | null;
    taskEstimatedHours: string | null;
    projectId: number;
    projectName: string;
    projectStatus: string | null;
    portfolioId: number | null;
    portfolioName: string | null;
    resourceName: string;
    resourceEmail: string | null;
    resourceTitle: string | null;
    resourceDepartment: string | null;
    resourceSkills: string | null;
  }

  const { data: assignmentsData, isLoading: isLoadingAssignments } = useQuery<ResourceAssignment[]>({
    queryKey: ['/api/resources/assignments', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/resources/assignments?organizationId=${currentOrganization?.id}`);
      if (!res.ok) throw new Error('Failed to fetch assignments');
      return res.json();
    },
    enabled: !!currentOrganization?.id && activeTab === "assignments",
  });

  const groupingOptions = [
    { value: "resource", label: "Resource", icon: Users },
    { value: "department", label: "Department", icon: Building2 },
    { value: "skills", label: "Skills", icon: Wrench },
    { value: "project", label: "Project", icon: FolderKanban },
    { value: "portfolio", label: "Portfolio", icon: Layers },
  ];

  // Reset dependent groupings when parent grouping changes
  useEffect(() => {
    if (groupBy2 === groupBy1 || groupBy2 === "none") {
      setGroupBy2("none");
      setGroupBy3("none");
    } else if (groupBy3 === groupBy1 || groupBy3 === groupBy2) {
      setGroupBy3("none");
    }
  }, [groupBy1]);

  useEffect(() => {
    if (groupBy3 === groupBy2 || groupBy2 === "none") {
      setGroupBy3("none");
    }
  }, [groupBy2]);

  const getGroupValue = (assignment: ResourceAssignment, groupKey: string): string => {
    switch (groupKey) {
      case "resource": return assignment.resourceName || "Unassigned";
      case "department": return assignment.resourceDepartment || "No Department";
      case "skills": return assignment.resourceSkills?.split(",")[0]?.trim() || "No Skills";
      case "project": return assignment.projectName || "No Project";
      case "portfolio": return assignment.portfolioName || "No Portfolio";
      default: return "All";
    }
  };

  const groupedAssignments = useMemo(() => {
    if (!assignmentsData) return {};
    
    const grouped: Record<string, Record<string, Record<string, ResourceAssignment[]>>> = {};
    
    assignmentsData.forEach((assignment) => {
      const key1 = getGroupValue(assignment, groupBy1);
      const key2 = groupBy2 !== "none" ? getGroupValue(assignment, groupBy2) : "_all";
      const key3 = groupBy3 !== "none" ? getGroupValue(assignment, groupBy3) : "_all";
      
      if (!grouped[key1]) grouped[key1] = {};
      if (!grouped[key1][key2]) grouped[key1][key2] = {};
      if (!grouped[key1][key2][key3]) grouped[key1][key2][key3] = [];
      
      grouped[key1][key2][key3].push(assignment);
    });

    // Sort keys alphabetically
    const sortedGrouped: typeof grouped = {};
    Object.keys(grouped).sort().forEach(k1 => {
      sortedGrouped[k1] = {};
      Object.keys(grouped[k1]).sort().forEach(k2 => {
        sortedGrouped[k1][k2] = {};
        Object.keys(grouped[k1][k2]).sort().forEach(k3 => {
          sortedGrouped[k1][k2][k3] = grouped[k1][k2][k3];
        });
      });
    });

    return sortedGrouped;
  }, [assignmentsData, groupBy1, groupBy2, groupBy3]);

  // Auto-open merge dialog when navigating from import wizard
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("openMerge") === "true") {
      setIsMergeDialogOpen(true);
      // Clean up the URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleExportToExcel = async () => {
    if (!resources || resources.length === 0) {
      toast({ title: "No data", description: "There are no resources to export", variant: "destructive" });
      return;
    }
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Resources");
    
    worksheet.columns = [
      { header: "Name", key: "name", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Title", key: "title", width: 20 },
      { header: "Department", key: "department", width: 20 },
      { header: "Skills", key: "skills", width: 30 },
      { header: "Hourly Rate", key: "hourlyRate", width: 12 },
      { header: "Active", key: "active", width: 8 },
      { header: "Notes", key: "notes", width: 40 }
    ];
    
    resources.forEach(r => {
      worksheet.addRow({
        name: r.displayName,
        email: r.email || "",
        title: r.title || "",
        department: r.department || "",
        skills: r.skills || "",
        hourlyRate: r.hourlyRate || "",
        active: r.isActive ? "Yes" : "No",
        notes: r.notes || ""
      });
    });
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Resources_${new Date().toISOString().split("T")[0]}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast({ title: "Success", description: `Exported ${resources.length} resources to Excel` });
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
      
      const headers: string[] = [];
      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value || "");
      });
      
      const jsonData: Record<string, string>[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rowData: Record<string, string> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = String(cell.value || "");
          }
        });
        jsonData.push(rowData);
      });
      
      let imported = 0;
      let skipped = 0;
      for (const row of jsonData) {
        const name = row["Name"] || row["name"] || row["Display Name"] || row["displayName"];
        if (!name || typeof name !== "string" || name.trim() === "") {
          skipped++;
          continue;
        }
        try {
          await createResource.mutateAsync({
            organizationId: currentOrganization.id,
            displayName: name.trim(),
            email: (row["Email"] || row["email"] || "").toString().trim() || null,
            title: (row["Title"] || row["title"] || "").toString().trim() || null,
            department: (row["Department"] || row["department"] || "").toString().trim() || null,
            skills: (row["Skills"] || row["skills"] || "").toString().trim() || null,
            hourlyRate: (row["Hourly Rate"] || row["hourlyRate"] || row["Rate"] || "").toString().trim() || null,
            isActive: (row["Active"] || row["active"] || "Yes").toString().toLowerCase() !== "no",
            notes: (row["Notes"] || row["notes"] || "").toString().trim() || null
          });
          imported++;
        } catch (err: any) {
          if (err?.limitExceeded) {
            toast({ 
              title: "Credit Limit Reached", 
              description: `Imported ${imported} resources. ${err.message || "Please upgrade your plan to import more."}`, 
              variant: "destructive" 
            });
            break;
          }
          skipped++;
        }
      }
      toast({ 
        title: "Import Complete", 
        description: `Imported ${imported} resources${skipped > 0 ? `, skipped ${skipped} rows` : ""}` 
      });
    } catch (err) {
      toast({ title: "Import Failed", description: "Could not read the Excel file", variant: "destructive" });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const filteredResources = resources?.filter(r => 
    normalizeSearch(r.displayName).includes(normalizeSearch(search)) || 
    normalizeSearch(r.email).includes(normalizeSearch(search)) ||
    normalizeSearch(r.title).includes(normalizeSearch(search)) ||
    normalizeSearch(r.department).includes(normalizeSearch(search))
  );

  const handleDelete = async () => {
    const idToDelete = deleteResourceId;
    const orgId = currentOrganization?.id;
    if (idToDelete && orgId) {
      setDeleteResourceId(null);
      try {
        await deleteResource.mutateAsync({ id: idToDelete, organizationId: orgId });
        toast({ title: "Success", description: "Resource deleted" });
      } catch (err) {
        toast({ title: "Error", description: "Failed to delete resource", variant: "destructive" });
      }
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Resources</h1>
        <p className="mt-1 text-muted-foreground">Manage your team members and assign them to tasks, issues, and risks.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImportFromExcel}
          accept=".xlsx,.xls"
          className="hidden"
          data-testid="input-import-file"
        />
        <Button 
          variant="outline" 
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          data-testid="button-import-resources"
        >
          <Upload className="mr-2 h-4 w-4" />
          {isImporting ? "Importing..." : "Import"}
        </Button>
        <Button 
          variant="outline" 
          onClick={handleExportToExcel}
          disabled={!resources || resources.length === 0}
          data-testid="button-export-resources"
        >
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
        <Button 
          variant="outline" 
          onClick={() => setIsMergeDialogOpen(true)}
          disabled={!resources || resources.length < 2}
          data-testid="button-merge-resources"
        >
          <GitMerge className="mr-2 h-4 w-4" />
          Match & Merge
        </Button>
        <Button
          variant="outline"
          onClick={() => { setIsAIOptimizeOpen(true); aiOptimizeMutation.mutate(); }}
          disabled={aiOptimizeMutation.isPending || !currentOrganization?.id}
          data-testid="button-ai-optimize"
        >
          {aiOptimizeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          AI Optimize
        </Button>
        <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-resource">
          <Plus className="mr-2 h-4 w-4" />
          Add Resource
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="resources" className="gap-2" data-testid="tab-resources">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Team</span> Resources
            </TabsTrigger>
            <TabsTrigger value="assignments" className="gap-2" data-testid="tab-assignments">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Assignments</span>
            </TabsTrigger>
            <TabsTrigger value="capacity" className="gap-2" data-testid="tab-capacity">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Capacity</span>
            </TabsTrigger>
            <TabsTrigger value="workload" className="gap-2" data-testid="tab-workload">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Workload</span>
            </TabsTrigger>
            <TabsTrigger value="availability" className="gap-2" data-testid="tab-availability">
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">Availability</span>
            </TabsTrigger>
            <TabsTrigger value="forecast" className="gap-2" data-testid="tab-forecast">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Forecast</span>
            </TabsTrigger>
          </TabsList>
          
          {activeTab === "resources" && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input 
                className="pl-10 max-w-md bg-card border-border" 
                placeholder="Search resources..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-resources"
              />
            </div>
          )}
        </div>

        <TabsContent value="resources" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <CardTitle>Team Resources</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredResources?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="mx-auto h-12 w-12 text-slate-300 mb-4" />
              <p>No resources found. Add your first team member to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResources?.map((resource, index) => (
                  <motion.tr
                    key={resource.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group"
                    data-testid={`row-resource-${resource.id}`}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <MicrosoftContactCard
                          displayName={resource.displayName}
                          email={resource.email}
                          title={resource.title}
                          department={resource.department}
                          phone={resource.phone}
                          photoUrl={resource.photoUrl}
                          side="right"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold cursor-pointer hover:bg-primary/20 transition-colors">
                            {resource.displayName.charAt(0).toUpperCase()}
                          </div>
                        </MicrosoftContactCard>
                        <MicrosoftContactCard
                          displayName={resource.displayName}
                          email={resource.email}
                          title={resource.title}
                          department={resource.department}
                          phone={resource.phone}
                          side="top"
                          align="start"
                        >
                          <span 
                            className="cursor-pointer hover:text-primary hover:underline"
                            onClick={() => window.location.href = `/resources/${resource.id}`}
                            data-testid={`link-resource-name-${resource.id}`}
                          >
                            {resource.displayName}
                          </span>
                        </MicrosoftContactCard>
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {resource.email || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {resource.title || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {resource.department || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {resource.hourlyRate ? `$${resource.hourlyRate}/hr` : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={resource.isActive ? "default" : "secondary"} className={resource.isActive ? "bg-emerald-100 text-emerald-700" : ""}>
                          {resource.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {resource.isApprover && (
                          <Badge variant="outline" className="text-blue-600 border-blue-300">
                            Timesheet
                          </Badge>
                        )}
                        {resource.isIntakeApprover && (
                          <Badge variant="outline" className="text-purple-600 border-purple-300">
                            Intake
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`button-menu-resource-${resource.id}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.preventDefault();
                              setEditingResource(resource);
                            }} 
                            data-testid={`menu-edit-resource-${resource.id}`}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.preventDefault();
                              setDeleteResourceId(resource.id);
                            }} 
                            className="text-red-600 focus:text-red-600"
                            data-testid={`menu-delete-resource-${resource.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  <CardTitle>Resource Assignments</CardTitle>
                  {assignmentsData && (
                    <Badge variant="secondary">{assignmentsData.length} assignments</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Group by:</Label>
                    <Select value={groupBy1} onValueChange={setGroupBy1}>
                      <SelectTrigger className="h-8 w-[130px]" data-testid="select-group-by-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {groupingOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              <opt.icon className="h-3 w-3" />
                              {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">then by:</Label>
                    <Select value={groupBy2} onValueChange={(v) => { setGroupBy2(v); if (v === "none") setGroupBy3("none"); }}>
                      <SelectTrigger className="h-8 w-[130px]" data-testid="select-group-by-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {groupingOptions.filter(opt => opt.value !== groupBy1).map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              <opt.icon className="h-3 w-3" />
                              {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {groupBy2 !== "none" && !showHeatmap && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">then by:</Label>
                      <Select value={groupBy3} onValueChange={setGroupBy3}>
                        <SelectTrigger className="h-8 w-[130px]" data-testid="select-group-by-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {groupingOptions.filter(opt => opt.value !== groupBy1 && opt.value !== groupBy2).map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div className="flex items-center gap-2">
                                <opt.icon className="h-3 w-3" />
                                {opt.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex items-center gap-1 border rounded-lg p-0.5">
                    <Button
                      size="sm"
                      variant={!showHeatmap ? "default" : "ghost"}
                      className="h-7 px-2"
                      onClick={() => setShowHeatmap(false)}
                      data-testid="button-list-view"
                    >
                      <LayoutList className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={showHeatmap ? "default" : "ghost"}
                      className="h-7 px-2"
                      onClick={() => setShowHeatmap(true)}
                      data-testid="button-heatmap-view"
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingAssignments ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : !assignmentsData || assignmentsData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardList className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                  <p>No task assignments found. Assign resources to tasks to see them here.</p>
                </div>
              ) : showHeatmap ? (
                <ResourceHeatmap 
                  assignments={assignmentsData} 
                  resources={resources || []}
                  onTaskClick={openTaskDialog}
                  groupBy={groupBy1}
                />
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3 pr-4">
                    {Object.entries(groupedAssignments).map(([key1, level2]) => (
                      <AssignmentGroup 
                        key={key1} 
                        groupKey={key1}
                        groupType={groupBy1}
                        level2={level2}
                        groupBy2={groupBy2}
                        groupBy3={groupBy3}
                        groupingOptions={groupingOptions}
                        setLocation={setLocation}
                        onTaskClick={openTaskDialog}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capacity" className="space-y-4">
          {currentOrganization?.id && (
            <CapacityPlanningView organizationId={currentOrganization.id} />
          )}
        </TabsContent>

        <TabsContent value="workload" className="space-y-4">
          {currentOrganization?.id && (
            <WorkloadDashboard organizationId={currentOrganization.id} />
          )}
        </TabsContent>

        <TabsContent value="availability" className="space-y-4">
          {currentOrganization?.id && (
            <AvailabilityCalendar organizationId={currentOrganization.id} />
          )}
        </TabsContent>

        <TabsContent value="forecast" className="space-y-4">
          {currentOrganization?.id && (
            <DemandForecast organizationId={currentOrganization.id} />
          )}
        </TabsContent>
      </Tabs>

      <ResourceDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        organizationId={currentOrganization?.id}
        onSuccess={() => {
          setIsCreateDialogOpen(false);
          toast({ title: "Success", description: "Resource created" });
        }}
      />

      {editingResource && (
        <ResourceDialog
          open={!!editingResource}
          onOpenChange={(open) => !open && setEditingResource(null)}
          organizationId={currentOrganization?.id}
          resource={editingResource}
          onSuccess={() => {
            setEditingResource(null);
            toast({ title: "Success", description: "Resource updated" });
          }}
        />
      )}

      <AlertDialog open={!!deleteResourceId} onOpenChange={(open) => !open && setDeleteResourceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resource</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this resource? This will also remove all their task, issue, and risk assignments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              type="button"
              onClick={() => {
                handleDelete();
              }} 
              className="bg-red-600 hover:bg-red-700" 
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MergeResourcesDialog
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
        organizationId={currentOrganization?.id}
        onMergeComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
          toast({ title: "Success", description: "Resources merged successfully" });
        }}
      />

      {/* Task View Dialog */}
      <Dialog open={isTaskDialogOpen} onOpenChange={(open) => !open && closeTaskDialog()}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-primary" />
              Task Details
            </DialogTitle>
          </DialogHeader>
          {isLoadingTask ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : selectedTaskData ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">{selectedTaskData.name}</h3>
                {selectedTaskData.description && (
                  <p className="text-sm text-muted-foreground">{selectedTaskData.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    Status
                  </p>
                  <Badge className={`text-xs ${
                    selectedTaskData.status === "Completed" ? "bg-emerald-100 text-emerald-700" :
                    selectedTaskData.status === "In Progress" ? "bg-blue-100 text-blue-700" :
                    selectedTaskData.status === "On Hold" ? "bg-yellow-100 text-yellow-700" :
                    "bg-slate-100 text-slate-700"
                  }`}>
                    {selectedTaskData.status || "Not Started"}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Percent className="h-3 w-3" />
                    Progress
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all" 
                        style={{ width: `${selectedTaskData.progress || 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">{selectedTaskData.progress || 0}%</span>
                  </div>
                </div>
                {selectedTaskData.startDate && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Start Date
                    </p>
                    <p className="text-sm font-medium">{format(new Date(selectedTaskData.startDate), "MMM d, yyyy")}</p>
                  </div>
                )}
                {selectedTaskData.endDate && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      End Date
                    </p>
                    <p className="text-sm font-medium">{format(new Date(selectedTaskData.endDate), "MMM d, yyyy")}</p>
                  </div>
                )}
                {selectedTaskData.estimatedHours && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Estimated Hours
                    </p>
                    <p className="text-sm font-medium">{selectedTaskData.estimatedHours}h</p>
                  </div>
                )}
                {selectedTaskData.priority && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      Priority
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {selectedTaskData.priority}
                    </Badge>
                  </div>
                )}
              </div>

              {taskResourcesData && taskResourcesData.length > 0 && (
                <Collapsible defaultOpen={true}>
                  <CollapsibleTrigger className="w-full" data-testid="trigger-task-assignments">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                      <ChevronDown className="h-4 w-4 text-muted-foreground collapsible-chevron" />
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Task Assignments</span>
                      <Badge variant="secondary" className="text-xs ml-auto">{taskResourcesData.length}</Badge>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 space-y-2 pl-2">
                      {taskResourcesData.map((res: any) => (
                        <div 
                          key={res.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                          data-testid={`task-assignment-row-${res.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p 
                                className="text-sm font-medium cursor-pointer hover:text-primary transition-colors"
                                onClick={() => {
                                  closeTaskDialog();
                                  setLocation(`/resources?id=${res.resourceId || res.resource?.id}`);
                                }}
                                data-testid={`task-resource-link-${res.resourceId || res.resource?.id}`}
                              >
                                {res.resource?.displayName || "Unknown Resource"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {res.resource?.role || res.resource?.jobTitle || "Team Member"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {res.allocationPercentage && (
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Allocation</p>
                                <p className="text-sm font-medium">{res.allocationPercentage}%</p>
                              </div>
                            )}
                            {res.estimatedHours && (
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Est. Hours</p>
                                <p className="text-sm font-medium">{res.estimatedHours}h</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              <DialogFooter className="flex gap-2">
                <Button variant="outline" onClick={closeTaskDialog} data-testid="button-close-task-dialog">
                  Close
                </Button>
                <Button 
                  onClick={() => {
                    closeTaskDialog();
                    setLocation(`/projects/${selectedTaskData.projectId}?task=${selectedTaskData.id}`);
                  }}
                  data-testid="button-edit-task"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Task
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Task not found
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isAIOptimizeOpen} onOpenChange={setIsAIOptimizeOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" aria-describedby="ai-optimize-description">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Resource Optimization
            </DialogTitle>
            <p id="ai-optimize-description" className="text-sm text-muted-foreground">
              AI-powered analysis of your team's resource allocation with actionable suggestions.
            </p>
          </DialogHeader>

          {aiOptimizeMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analyzing resource allocation across your projects...</p>
            </div>
          )}

          {aiOptimizeMutation.isError && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive">Failed to generate suggestions. Please try again.</p>
              <Button variant="outline" onClick={() => aiOptimizeMutation.mutate()} data-testid="button-retry-ai">
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          )}

          {aiOptimizeMutation.isSuccess && aiOptimizeMutation.data && (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm" data-testid="text-ai-summary">{aiOptimizeMutation.data.summary}</p>
                </CardContent>
              </Card>

              <div className="space-y-3">
                {aiOptimizeMutation.data.suggestions?.map((suggestion: any, idx: number) => {
                  const severityColor = suggestion.severity === "high" 
                    ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900" 
                    : suggestion.severity === "medium" 
                    ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900"
                    : "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900";
                  
                  const typeIcon = suggestion.type === "overallocation" ? <AlertTriangle className="h-4 w-4" />
                    : suggestion.type === "underutilization" ? <ArrowUpDown className="h-4 w-4" />
                    : suggestion.type === "bottleneck" ? <AlertTriangle className="h-4 w-4" />
                    : suggestion.type === "timeline_risk" ? <Clock className="h-4 w-4" />
                    : suggestion.type === "cost_saving" ? <DollarSign className="h-4 w-4" />
                    : <Lightbulb className="h-4 w-4" />;

                  return (
                    <Card key={idx} className={`border ${severityColor}`} data-testid={`card-suggestion-${idx}`}>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">{typeIcon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-sm">{suggestion.title}</h4>
                              <Badge variant="outline" className="text-[10px]">
                                {suggestion.severity}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                {suggestion.type?.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{suggestion.description}</p>
                          </div>
                        </div>

                        {suggestion.suggestedAction && (
                          <div className="pl-7">
                            <p className="text-sm">
                              <span className="font-medium">Suggested action:</span> {suggestion.suggestedAction}
                            </p>
                          </div>
                        )}

                        {suggestion.estimatedImpact && (
                          <div className="pl-7">
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium">Expected impact:</span> {suggestion.estimatedImpact}
                            </p>
                          </div>
                        )}

                        <div className="pl-7 flex flex-wrap gap-1">
                          {suggestion.affectedResources?.map((r: string, i: number) => (
                            <Badge key={`r-${i}`} variant="outline" className="text-[10px]">
                              <User className="h-3 w-3 mr-1" />{r}
                            </Badge>
                          ))}
                          {suggestion.affectedProjects?.map((p: string, i: number) => (
                            <Badge key={`p-${i}`} variant="outline" className="text-[10px]">
                              <FolderKanban className="h-3 w-3 mr-1" />{p}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Generated {aiOptimizeMutation.data.generatedAt ? new Date(aiOptimizeMutation.data.generatedAt).toLocaleString() : "just now"}
                </p>
                <Button variant="outline" size="sm" onClick={() => aiOptimizeMutation.mutate()} data-testid="button-regenerate-ai">
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Regenerate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Heatmap component for resource allocation visualization
interface ResourceHeatmapProps {
  assignments: ResourceAssignment[];
  resources: Resource[];
  onTaskClick: (taskId: number) => void;
  groupBy: string;
}

interface HeatmapGroup {
  key: string;
  name: string;
  capacity: number;
  assignments: ResourceAssignment[];
  weeks: { allocation: number; tasks: { id: number; name: string; allocation: number }[] }[];
}

interface AssignmentWeekData {
  assignment: ResourceAssignment;
  weeks: { allocation: number; active: boolean }[];
}

type TimeScale = "day" | "week" | "month" | "quarter" | "year";
type DisplayUnit = "hours" | "percent" | "fte";

interface TimePeriod {
  start: Date;
  end: Date;
  label: string;
  workDays: number;
}

const DEFAULT_PERIODS: Record<TimeScale, number> = {
  day: 14,
  week: 12,
  month: 6,
  quarter: 4,
  year: 2
};

function ResourceHeatmap({ assignments, resources, onTaskClick, groupBy }: ResourceHeatmapProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [timeScale, setTimeScale] = useState<TimeScale>("week");
  const [periodCount, setPeriodCount] = useState<number>(12);
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>("hours");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledToToday = useRef(false);

  // Calculate data range from assignments
  const dataRange = useMemo(() => {
    let minDate = new Date();
    let maxDate = new Date();
    
    assignments.forEach(a => {
      if (a.taskStartDate) {
        const start = parseISO(a.taskStartDate);
        if (start < minDate) minDate = start;
      }
      if (a.taskEndDate) {
        const end = parseISO(a.taskEndDate);
        if (end > maxDate) maxDate = end;
      }
    });
    
    return { minDate, maxDate };
  }, [assignments]);

  // Autofit handler
  const handleAutofit = () => {
    const { minDate, maxDate } = dataRange;
    const daysDiff = differenceInDays(maxDate, minDate);
    
    if (daysDiff <= 21) {
      setTimeScale("day");
      setPeriodCount(Math.min(Math.max(daysDiff + 7, 14), 30));
    } else if (daysDiff <= 90) {
      setTimeScale("week");
      setPeriodCount(Math.min(Math.ceil(daysDiff / 7) + 2, 16));
    } else if (daysDiff <= 365) {
      setTimeScale("month");
      setPeriodCount(Math.min(Math.ceil(daysDiff / 30) + 1, 12));
    } else if (daysDiff <= 730) {
      setTimeScale("quarter");
      setPeriodCount(Math.min(Math.ceil(daysDiff / 90) + 1, 8));
    } else {
      setTimeScale("year");
      setPeriodCount(Math.min(Math.ceil(daysDiff / 365) + 1, 5));
    }
  };

  // Zoom handlers
  const handleZoomIn = () => {
    const scales: TimeScale[] = ["year", "quarter", "month", "week", "day"];
    const currentIdx = scales.indexOf(timeScale);
    if (currentIdx < scales.length - 1) {
      const newScale = scales[currentIdx + 1];
      setTimeScale(newScale);
      setPeriodCount(DEFAULT_PERIODS[newScale]);
    } else {
      setPeriodCount(Math.min(periodCount + 7, 30));
    }
  };

  const handleZoomOut = () => {
    const scales: TimeScale[] = ["year", "quarter", "month", "week", "day"];
    const currentIdx = scales.indexOf(timeScale);
    if (currentIdx > 0) {
      const newScale = scales[currentIdx - 1];
      setTimeScale(newScale);
      setPeriodCount(DEFAULT_PERIODS[newScale]);
    } else {
      setPeriodCount(Math.max(periodCount - 1, 2));
    }
  };

  const today = new Date();

  const pastPeriodCount = useMemo((): number => {
    const { minDate } = dataRange;
    const todayStart = startOfDay(today);
    const minStart = startOfDay(minDate);
    if (minStart >= todayStart) return 0;
    const daysDiff = differenceInDays(todayStart, minStart);
    if (daysDiff <= 0) return 0;
    switch (timeScale) {
      case "day": return Math.min(daysDiff, 60);
      case "week": return Math.min(Math.ceil(daysDiff / 7), 26);
      case "month": return Math.min(Math.ceil(daysDiff / 30), 12);
      case "quarter": return Math.min(Math.ceil(daysDiff / 90), 8);
      case "year": return Math.min(Math.ceil(daysDiff / 365), 5);
    }
  }, [dataRange, timeScale]);

  const periods = useMemo((): TimePeriod[] => {
    const result: TimePeriod[] = [];
    const startOffset = -pastPeriodCount;
    const totalCount = pastPeriodCount + periodCount;
    
    for (let i = 0; i < totalCount; i++) {
      const offset = startOffset + i;
      let periodStart: Date, periodEnd: Date, label: string, workDays: number;
      
      switch (timeScale) {
        case "day":
          periodStart = startOfDay(addDays(today, offset));
          periodEnd = endOfDay(addDays(today, offset));
          label = format(periodStart, "MMM d");
          workDays = [0, 6].includes(periodStart.getDay()) ? 0 : 1;
          break;
        case "week":
          periodStart = startOfWeek(addWeeks(today, offset), { weekStartsOn: 1 });
          periodEnd = endOfWeek(addWeeks(today, offset), { weekStartsOn: 1 });
          label = format(periodStart, "MMM d");
          workDays = 5;
          break;
        case "month":
          periodStart = startOfMonth(addMonths(today, offset));
          periodEnd = endOfMonth(addMonths(today, offset));
          label = format(periodStart, "MMM yy");
          workDays = 22;
          break;
        case "quarter":
          periodStart = startOfQuarter(addQuarters(today, offset));
          periodEnd = endOfQuarter(addQuarters(today, offset));
          label = `Q${Math.floor(periodStart.getMonth() / 3) + 1} ${format(periodStart, "yy")}`;
          workDays = 65;
          break;
        case "year":
          periodStart = startOfYear(addYears(today, offset));
          periodEnd = endOfYear(addYears(today, offset));
          label = format(periodStart, "yyyy");
          workDays = 260;
          break;
      }
      
      result.push({ start: periodStart, end: periodEnd, label, workDays });
    }
    
    return result;
  }, [timeScale, periodCount, pastPeriodCount]);

  const todayIndex = useMemo((): number => {
    const now = new Date();
    return periods.findIndex(p => p.start <= now && p.end >= now);
  }, [periods]);

  const scrollToToday = () => {
    const container = scrollContainerRef.current;
    if (!container || todayIndex < 0) return;
    const nameColWidth = 256;
    const cellWidth = timeScale === "day" ? 50 : 65;
    const targetScroll = nameColWidth + (todayIndex * cellWidth) - (container.clientWidth / 4);
    container.scrollTo({ left: Math.max(0, targetScroll), behavior: "smooth" });
  };

  useEffect(() => {
    if (hasScrolledToToday.current) return;
    if (todayIndex < 0 || !scrollContainerRef.current) return;
    const timer = setTimeout(() => {
      scrollToToday();
      hasScrolledToToday.current = true;
    }, 100);
    return () => clearTimeout(timer);
  }, [todayIndex]);

  useEffect(() => {
    hasScrolledToToday.current = false;
  }, [timeScale, periodCount]);

  // Get capacity for a period based on timescale
  const getPeriodCapacity = (weeklyCapacity: number, period: TimePeriod): number => {
    switch (timeScale) {
      case "day": return weeklyCapacity / 5;
      case "week": return weeklyCapacity;
      case "month": return weeklyCapacity * 4.33;
      case "quarter": return weeklyCapacity * 13;
      case "year": return weeklyCapacity * 52;
    }
  };

  // Calculate allocation for a single assignment in a period
  const getAssignmentPeriodData = (assignment: ResourceAssignment, weeklyCapacity: number): AssignmentWeekData => {
    const weekData = periods.map(period => {
      if (!assignment.taskStartDate || !assignment.taskEndDate) {
        return { allocation: 0, active: false };
      }
      
      const taskStart = parseISO(assignment.taskStartDate);
      const taskEnd = parseISO(assignment.taskEndDate);
      const overlaps = (taskStart <= period.end && taskEnd >= period.start);
      
      if (!overlaps) return { allocation: 0, active: false };
      
      const overlapStart = taskStart > period.start ? taskStart : period.start;
      const overlapEnd = taskEnd < period.end ? taskEnd : period.end;
      const overlapDays = Math.max(0, differenceInDays(overlapEnd, overlapStart) + 1);
      
      // Calculate work days in the overlap period
      let workDaysInPeriod = 0;
      if (timeScale === "day") {
        workDaysInPeriod = [0, 6].includes(overlapStart.getDay()) ? 0 : 1;
      } else {
        workDaysInPeriod = Math.min(overlapDays, period.workDays) * (5 / 7); // Rough estimate
      }
      
      const periodCapacity = getPeriodCapacity(weeklyCapacity, period);
      const maxWorkDays = period.workDays;
      const allocationRatio = workDaysInPeriod / maxWorkDays;
      const periodAllocation = ((assignment.allocationPercentage || 100) / 100) * allocationRatio * periodCapacity;
      
      return { allocation: periodAllocation, active: true };
    });
    
    return { assignment, weeks: weekData };
  };

  // Get grouping key and name based on groupBy type
  const getGroupInfo = (assignment: ResourceAssignment): { key: string; name: string; capacity: number } => {
    switch (groupBy) {
      case "resource": {
        const resource = resources.find(r => r.id === assignment.resourceId);
        return {
          key: `resource-${assignment.resourceId}`,
          name: assignment.resourceName || "Unknown Resource",
          capacity: resource?.weeklyCapacity ? Number(resource.weeklyCapacity) : 40
        };
      }
      case "project":
        return {
          key: `project-${assignment.projectId}`,
          name: assignment.projectName || "Unknown Project",
          capacity: 40
        };
      case "portfolio":
        return {
          key: `portfolio-${assignment.portfolioId || 0}`,
          name: assignment.portfolioName || "No Portfolio",
          capacity: 40
        };
      case "skills": {
        const resource = resources.find(r => r.id === assignment.resourceId);
        const skillsRaw = resource?.skills || "";
        const skills = typeof skillsRaw === "string" 
          ? skillsRaw.split(",").map(s => s.trim()).filter(Boolean) 
          : [];
        const skillKey = skills.length > 0 ? skills.sort().join(",") : "none";
        return {
          key: `skills-${skillKey}`,
          name: skills.length > 0 ? skills.join(", ") : "No Skills",
          capacity: 40
        };
      }
      case "department": {
        const resource = resources.find(r => r.id === assignment.resourceId);
        const dept = resource?.department || "No Department";
        return {
          key: `department-${dept}`,
          name: dept,
          capacity: 40
        };
      }
      default:
        return {
          key: `resource-${assignment.resourceId}`,
          name: assignment.resourceName || "Unknown Resource",
          capacity: 40
        };
    }
  };

  // Group assignments and calculate rollups
  const groupedData = useMemo(() => {
    const groups: Record<string, HeatmapGroup> = {};
    
    assignments.forEach(assignment => {
      const { key: groupKey, name: groupName, capacity } = getGroupInfo(assignment);
      
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          name: groupName,
          capacity,
          assignments: [],
          weeks: periods.map(() => ({ allocation: 0, tasks: [] }))
        };
      }
      
      groups[groupKey].assignments.push(assignment);
      
      // Calculate rollup
      const assignmentPeriodData = getAssignmentPeriodData(assignment, capacity);
      assignmentPeriodData.weeks.forEach((w, idx) => {
        if (w.active) {
          groups[groupKey].weeks[idx].allocation += w.allocation;
          groups[groupKey].weeks[idx].tasks.push({
            id: assignment.taskId,
            name: assignment.taskName,
            allocation: assignment.allocationPercentage || 100
          });
        }
      });
    });
    
    return Object.values(groups);
  }, [assignments, resources, periods, groupBy]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const formatCellValue = (allocation: number, capacity: number): string => {
    if (allocation === 0) return "-";
    switch (displayUnit) {
      case "hours":
        return `${allocation.toFixed(0)}h`;
      case "percent":
        return `${((allocation / capacity) * 100).toFixed(0)}%`;
      case "fte":
        return (allocation / capacity).toFixed(2);
    }
  };

  const formatTooltipValue = (allocation: number, capacity: number): string => {
    switch (displayUnit) {
      case "hours":
        return `${allocation.toFixed(0)}h / ${capacity.toFixed(0)}h`;
      case "percent":
        return `${((allocation / capacity) * 100).toFixed(0)}% utilization`;
      case "fte":
        return `${(allocation / capacity).toFixed(2)} FTE`;
    }
  };

  // Get heat color based on utilization
  const getHeatColor = (allocation: number, capacity: number) => {
    if (allocation === 0) return "bg-slate-50 dark:bg-slate-900";
    const utilization = allocation / capacity;
    if (utilization <= 0.5) return "bg-emerald-100 dark:bg-emerald-900/30";
    if (utilization <= 0.75) return "bg-emerald-200 dark:bg-emerald-800/40";
    if (utilization <= 0.9) return "bg-emerald-300 dark:bg-emerald-700/50";
    if (utilization <= 1.0) return "bg-emerald-400 dark:bg-emerald-600/60";
    if (utilization <= 1.1) return "bg-yellow-300 dark:bg-yellow-700/50";
    if (utilization <= 1.25) return "bg-orange-300 dark:bg-orange-700/50";
    return "bg-red-400 dark:bg-red-600/60";
  };

  const getTextColor = (allocation: number, capacity: number) => {
    if (allocation === 0) return "text-muted-foreground";
    const utilization = allocation / capacity;
    if (utilization > 1.0) return "text-red-900 dark:text-red-100 font-medium";
    if (utilization > 0.75) return "text-emerald-900 dark:text-emerald-100";
    return "text-emerald-800 dark:text-emerald-200";
  };

  return (
    <div className="space-y-2">
      {/* Timescale controls */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Scale:</span>
            <Select value={timeScale} onValueChange={(v) => { setTimeScale(v as TimeScale); setPeriodCount(DEFAULT_PERIODS[v as TimeScale]); }}>
              <SelectTrigger className="w-[100px] h-8" data-testid="select-timescale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Days</SelectItem>
                <SelectItem value="week">Weeks</SelectItem>
                <SelectItem value="month">Months</SelectItem>
                <SelectItem value="quarter">Quarters</SelectItem>
                <SelectItem value="year">Years</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show:</span>
            <Select value={displayUnit} onValueChange={(v) => setDisplayUnit(v as DisplayUnit)}>
              <SelectTrigger className="w-[120px] h-8" data-testid="select-display-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="percent">% Utilization</SelectItem>
                <SelectItem value="fte">FTE</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleZoomOut} title="Zoom out" data-testid="button-zoom-out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleZoomIn} title="Zoom in" data-testid="button-zoom-in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={handleAutofit} title="Autofit to data range" data-testid="button-autofit">
            <Maximize2 className="h-4 w-4 mr-1" />
            Autofit
          </Button>
          {todayIndex >= 0 && (
            <Button variant="outline" size="sm" className="h-8" onClick={scrollToToday} title="Scroll to today" data-testid="button-scroll-today">
              <CircleDot className="h-4 w-4 mr-1" />
              Today
            </Button>
          )}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="overflow-auto border rounded-md"
        style={{ maxHeight: "560px" }}
      >
        <div style={{ minWidth: `${256 + periods.length * (timeScale === "day" ? 50 : 65)}px` }}>
          {/* Header row with period labels */}
          <div className="flex border-b sticky top-0 bg-background" style={{ zIndex: 20 }}>
            <div className="w-64 flex-shrink-0 p-2 font-medium text-sm border-r bg-background sticky left-0" style={{ zIndex: 30 }}>
              {groupBy === "resource" ? "Resource" : 
               groupBy === "project" ? "Project" :
               groupBy === "portfolio" ? "Portfolio" :
               groupBy === "skills" ? "Skills" :
               groupBy === "department" ? "Department" : "Group"} / Task
            </div>
            <div className="flex-1 flex">
              {periods.map((period, idx) => (
                <div 
                  key={idx} 
                  className={`flex-1 p-2 text-center text-xs font-medium border-r text-muted-foreground ${timeScale === "day" ? "min-w-[50px]" : "min-w-[65px]"} ${idx === todayIndex ? "bg-primary/5 border-b-2 border-b-primary font-semibold text-primary" : ""}`}
                >
                  {period.label}
                </div>
              ))}
            </div>
          </div>

        {/* Grouped rows */}
        <div>
          {groupedData.map((group) => {
            const isExpanded = expandedGroups.has(group.key);
            
            return (
              <div key={group.key}>
                {/* Group header row with rollup */}
                <div 
                  className="flex border-b bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleGroup(group.key)}
                  data-testid={`heatmap-group-${group.key}`}
                >
                  <div className="w-64 flex-shrink-0 p-2 border-r sticky left-0" style={{ zIndex: 10, backgroundColor: 'hsl(var(--muted))' }}>
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold flex-shrink-0">
                        {group.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{group.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {group.assignments.length} assignment{group.assignments.length > 1 ? 's' : ''} • {
                            displayUnit === "hours" ? `${group.capacity}h/week` :
                            displayUnit === "percent" ? "100% = full capacity" :
                            `1.0 FTE = ${group.capacity}h/week`
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 flex">
                    {group.weeks.map((weekData, weekIdx) => {
                      const periodCap = getPeriodCapacity(group.capacity, periods[weekIdx]);
                      const isToday = weekIdx === todayIndex;
                      return (
                      <div
                        key={weekIdx}
                        className={`flex-1 p-1.5 border-r ${timeScale === "day" ? "min-w-[50px]" : "min-w-[65px]"} ${getHeatColor(weekData.allocation, periodCap)} transition-colors ${isToday ? "ring-1 ring-inset ring-primary/30" : ""}`}
                        title={weekData.tasks.length > 0 
                          ? `${weekData.tasks.map(t => `${t.name} (${t.allocation}%)`).join('\n')}\n\nTotal: ${formatTooltipValue(weekData.allocation, periodCap)}`
                          : "No assignments"
                        }
                      >
                        <div className={`text-center text-xs ${getTextColor(weekData.allocation, periodCap)}`}>
                          {formatCellValue(weekData.allocation, periodCap)}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Expanded assignment rows */}
                {isExpanded && group.assignments.map((assignment) => {
                  const assignmentData = getAssignmentPeriodData(assignment, group.capacity);
                  return (
                    <div 
                      key={assignment.assignmentId}
                      className="flex border-b bg-background hover:bg-muted/10 transition-colors"
                      data-testid={`heatmap-assignment-${assignment.assignmentId}`}
                    >
                      <div className="w-64 flex-shrink-0 p-2 border-r pl-10 bg-background sticky left-0" style={{ zIndex: 10 }}>
                        <div className="flex items-center gap-2">
                          <ListTodo className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p 
                              className="text-xs font-medium truncate cursor-pointer hover:text-primary transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTaskClick(assignment.taskId);
                              }}
                            >
                              {assignment.taskName}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {groupBy === "resource" ? assignment.projectName : 
                               groupBy === "project" ? assignment.resourceName :
                               groupBy === "portfolio" ? `${assignment.projectName} • ${assignment.resourceName}` :
                               groupBy === "skills" ? `${assignment.projectName} • ${assignment.resourceName}` :
                               groupBy === "department" ? `${assignment.projectName} • ${assignment.resourceName}` :
                               assignment.resourceName}
                              {assignment.allocationPercentage && ` • ${assignment.allocationPercentage}%`}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 flex">
                        {assignmentData.weeks.map((weekData, weekIdx) => {
                          const isToday = weekIdx === todayIndex;
                          return (
                          <div
                            key={weekIdx}
                            className={`flex-1 p-1.5 border-r ${timeScale === "day" ? "min-w-[50px]" : "min-w-[65px]"} ${weekData.active ? 'bg-primary/10' : 'bg-slate-50 dark:bg-slate-900'} transition-colors cursor-pointer hover:opacity-80 ${isToday ? "ring-1 ring-inset ring-primary/30" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (weekData.active) {
                                onTaskClick(assignment.taskId);
                              }
                            }}
                          >
                            <div className={`text-center text-xs ${weekData.active ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                              {weekData.active ? formatCellValue(weekData.allocation, getPeriodCapacity(group.capacity, periods[weekIdx])) : "-"}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground flex-wrap">
        <span className="font-medium">Utilization:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-emerald-100 dark:bg-emerald-900/30" />
          <span>0-50%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-emerald-300 dark:bg-emerald-700/50" />
          <span>50-90%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-emerald-400 dark:bg-emerald-600/60" />
          <span>90-100%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-yellow-300 dark:bg-yellow-700/50" />
          <span>100-110%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-red-400 dark:bg-red-600/60" />
          <span>&gt;125%</span>
        </div>
      </div>
    </div>
  );
}


interface MergeResourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number | undefined;
  onMergeComplete: () => void;
}

interface DuplicateGroup {
  resources: Resource[];
  matchType: string;
}

function MergeResourcesDialog({ open, onOpenChange, organizationId, onMergeComplete }: MergeResourcesDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPrimary, setSelectedPrimary] = useState<{ [groupIndex: number]: number }>({});

  const { data: duplicatesData, isLoading, refetch } = useQuery<{ duplicateGroups: DuplicateGroup[] }>({
    queryKey: ['/api/resources/duplicates', organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/resources/duplicates?organizationId=${organizationId}`);
      if (!res.ok) throw new Error('Failed to fetch duplicates');
      return res.json();
    },
    enabled: !!organizationId && open,
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ primaryId, secondaryId }: { primaryId: number; secondaryId: number }) => {
      return apiRequest('POST', '/api/resources/merge', { primaryId, secondaryId, organizationId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
    },
  });

  const handleMergeGroup = async (groupIndex: number, resources: Resource[]) => {
    const primaryId = selectedPrimary[groupIndex] || resources[0].id;
    const secondaryResources = resources.filter(r => r.id !== primaryId);
    
    try {
      for (const secondary of secondaryResources) {
        await mergeMutation.mutateAsync({ primaryId, secondaryId: secondary.id });
      }
      toast({ title: "Merged", description: `Merged ${secondaryResources.length} duplicate(s) into primary resource` });
      onMergeComplete();
      setSelectedPrimary({});
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to merge resources", variant: "destructive" });
    }
  };

  const duplicateGroups = duplicatesData?.duplicateGroups || [];

  useEffect(() => {
    if (open) {
      setSelectedPrimary({});
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Match & Merge Duplicates
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : duplicateGroups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Check className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <p className="font-medium text-foreground">No duplicates found</p>
            <p className="text-sm mt-1">All resources appear to be unique.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Found {duplicateGroups.length} group(s) of potential duplicates. Select the primary resource to keep for each group, then merge.
            </p>
            
            {duplicateGroups.map((group, groupIndex) => (
              <Card key={groupIndex} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {group.matchType === 'email' ? 'Email Match' : 'Name Match'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {group.resources.length} resources
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleMergeGroup(groupIndex, group.resources)}
                    disabled={mergeMutation.isPending}
                    data-testid={`button-merge-group-${groupIndex}`}
                  >
                    <GitMerge className="h-4 w-4 mr-1" />
                    Merge
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {group.resources.map((resource, idx) => {
                    const isPrimary = (selectedPrimary[groupIndex] || group.resources[0].id) === resource.id;
                    return (
                      <div
                        key={resource.id}
                        className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                          isPrimary 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-muted-foreground/50'
                        }`}
                        onClick={() => setSelectedPrimary(prev => ({ ...prev, [groupIndex]: resource.id }))}
                        data-testid={`resource-option-${resource.id}`}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold shrink-0">
                          {resource.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{resource.displayName}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {resource.email || 'No email'} {resource.title && `• ${resource.title}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isPrimary ? (
                            <Badge variant="default" className="bg-primary">
                              Keep
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-muted-foreground">
                              <ArrowRight className="h-3 w-3 mr-1" />
                              Merge into primary
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-merge">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Assignment Group Component for hierarchical display
interface ResourceAssignment {
  assignmentId: number;
  taskId: number;
  resourceId: number;
  allocationPercentage: number | null;
  role: string | null;
  taskName: string;
  taskStatus: string | null;
  taskProgress: number | null;
  taskStartDate: string | null;
  taskEndDate: string | null;
  taskEstimatedHours: string | null;
  projectId: number;
  projectName: string;
  projectStatus: string | null;
  portfolioId: number | null;
  portfolioName: string | null;
  resourceName: string;
  resourceEmail: string | null;
  resourceTitle: string | null;
  resourceDepartment: string | null;
  resourceSkills: string | null;
}

interface AssignmentGroupProps {
  groupKey: string;
  groupType: string;
  level2: Record<string, Record<string, ResourceAssignment[]>>;
  groupBy2: string;
  groupBy3: string;
  groupingOptions: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  setLocation: (path: string) => void;
  onTaskClick: (taskId: number) => void;
}

function AssignmentGroup({ groupKey, groupType, level2, groupBy2, groupBy3, groupingOptions, setLocation, onTaskClick }: AssignmentGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  
  const GroupIcon = groupingOptions.find(o => o.value === groupType)?.icon || Users;
  const totalAssignments = Object.values(level2).flatMap(l3 => Object.values(l3).flat()).length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full" data-testid={`group-trigger-${groupKey}`}>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-sm font-semibold">
            {groupKey.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 text-left">
            <div className="font-medium">{groupKey}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <GroupIcon className="h-3 w-3" />
              {totalAssignments} assignment{totalAssignments !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-6 mt-2 space-y-2">
          {groupBy2 === "none" ? (
            // Direct assignments list
            <div className="space-y-1">
              {Object.values(level2).flatMap(l3 => Object.values(l3).flat()).map((assignment) => (
                <AssignmentRow key={assignment.assignmentId} assignment={assignment} setLocation={setLocation} onTaskClick={onTaskClick} />
              ))}
            </div>
          ) : (
            // Nested level 2
            Object.entries(level2).map(([key2, level3]) => (
              <AssignmentSubGroup
                key={key2}
                groupKey={key2}
                groupType={groupBy2}
                level3={level3}
                groupBy3={groupBy3}
                groupingOptions={groupingOptions}
                setLocation={setLocation}
                onTaskClick={onTaskClick}
              />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface AssignmentSubGroupProps {
  groupKey: string;
  groupType: string;
  level3: Record<string, ResourceAssignment[]>;
  groupBy3: string;
  groupingOptions: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  setLocation: (path: string) => void;
  onTaskClick: (taskId: number) => void;
}

function AssignmentSubGroup({ groupKey, groupType, level3, groupBy3, groupingOptions, setLocation, onTaskClick }: AssignmentSubGroupProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const GroupIcon = groupingOptions.find(o => o.value === groupType)?.icon || Users;
  const totalAssignments = Object.values(level3).flat().length;

  if (groupKey === "_all") {
    return (
      <div className="space-y-1">
        {Object.values(level3).flat().map((assignment) => (
          <AssignmentRow key={assignment.assignmentId} assignment={assignment} setLocation={setLocation} onTaskClick={onTaskClick} />
        ))}
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full" data-testid={`subgroup-trigger-${groupKey}`}>
        <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/30 transition-colors cursor-pointer">
          {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <GroupIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{groupKey}</span>
          <Badge variant="outline" className="text-[10px] h-5">{totalAssignments}</Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-6 mt-1 space-y-1">
          {groupBy3 === "none" ? (
            Object.values(level3).flat().map((assignment) => (
              <AssignmentRow key={assignment.assignmentId} assignment={assignment} setLocation={setLocation} onTaskClick={onTaskClick} />
            ))
          ) : (
            Object.entries(level3).map(([key3, assignments]) => (
              key3 === "_all" ? (
                assignments.map((assignment) => (
                  <AssignmentRow key={assignment.assignmentId} assignment={assignment} setLocation={setLocation} onTaskClick={onTaskClick} />
                ))
              ) : (
                <AssignmentLevel3Group
                  key={key3}
                  groupKey={key3}
                  groupType={groupBy3}
                  assignments={assignments}
                  groupingOptions={groupingOptions}
                  setLocation={setLocation}
                  onTaskClick={onTaskClick}
                />
              )
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface AssignmentLevel3GroupProps {
  groupKey: string;
  groupType: string;
  assignments: ResourceAssignment[];
  groupingOptions: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  setLocation: (path: string) => void;
  onTaskClick: (taskId: number) => void;
}

function AssignmentLevel3Group({ groupKey, groupType, assignments, groupingOptions, setLocation, onTaskClick }: AssignmentLevel3GroupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const GroupIcon = groupingOptions.find(o => o.value === groupType)?.icon || Users;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full" data-testid={`level3-trigger-${groupKey}`}>
        <div className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/20 transition-colors cursor-pointer">
          {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <GroupIcon className="h-3 w-3 text-muted-foreground" />
          <span className="text-sm">{groupKey}</span>
          <span className="text-[10px] text-muted-foreground">({assignments.length})</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-5 mt-1 space-y-1">
          {assignments.map((assignment) => (
            <AssignmentRow key={assignment.assignmentId} assignment={assignment} setLocation={setLocation} onTaskClick={onTaskClick} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface AssignmentRowProps {
  assignment: ResourceAssignment;
  setLocation: (path: string) => void;
  onTaskClick?: (taskId: number) => void;
}

function AssignmentRow({ assignment, setLocation, onTaskClick }: AssignmentRowProps) {
  const statusColors: Record<string, string> = {
    "Not Started": "bg-slate-100 text-slate-700",
    "In Progress": "bg-blue-100 text-blue-700",
    "On Hold": "bg-yellow-100 text-yellow-700",
    "Completed": "bg-emerald-100 text-emerald-700",
    "Cancelled": "bg-red-100 text-red-700",
  };

  const handleTaskClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onTaskClick) {
      onTaskClick(assignment.taskId);
    } else {
      setLocation(`/projects/${assignment.projectId}?task=${assignment.taskId}`);
    }
  };

  const handleProjectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocation(`/projects/${assignment.projectId}`);
  };

  const handleResourceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocation(`/resources?id=${assignment.resourceId}`);
  };

  const handlePortfolioClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (assignment.portfolioId) {
      setLocation(`/portfolios/${assignment.portfolioId}`);
    }
  };

  return (
    <div 
      className="flex items-center gap-3 p-2 rounded-md border bg-card hover:bg-accent/30 transition-colors group"
      data-testid={`assignment-row-${assignment.assignmentId}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span 
            className="font-medium text-sm truncate cursor-pointer hover:text-primary hover:underline"
            onClick={handleTaskClick}
            data-testid={`task-link-${assignment.taskId}`}
          >
            {assignment.taskName}
          </span>
          <Badge 
            variant="outline" 
            className="text-[10px] h-4 shrink-0 cursor-pointer hover:bg-accent"
            onClick={handleProjectClick}
            data-testid={`project-link-${assignment.projectId}`}
          >
            {assignment.projectName}
          </Badge>
          {assignment.portfolioName && (
            <Badge 
              variant="secondary" 
              className="text-[10px] h-4 shrink-0 cursor-pointer hover:bg-accent"
              onClick={handlePortfolioClick}
              data-testid={`portfolio-link-${assignment.portfolioId}`}
            >
              {assignment.portfolioName}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          <span 
            className="flex items-center gap-1 cursor-pointer hover:text-primary hover:underline"
            onClick={handleResourceClick}
            data-testid={`resource-link-${assignment.resourceId}`}
          >
            <Users className="h-3 w-3" />
            {assignment.resourceName}
          </span>
          {assignment.taskStartDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(assignment.taskStartDate), "MMM d")}
              {assignment.taskEndDate && ` - ${format(new Date(assignment.taskEndDate), "MMM d")}`}
            </span>
          )}
          {assignment.allocationPercentage && (
            <span className="flex items-center gap-1">
              <Percent className="h-3 w-3" />
              {assignment.allocationPercentage}%
            </span>
          )}
          {assignment.taskEstimatedHours && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {assignment.taskEstimatedHours}h
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {assignment.taskProgress != null && (
          <div className="w-16 flex items-center gap-1">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all" 
                style={{ width: `${assignment.taskProgress}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{assignment.taskProgress}%</span>
          </div>
        )}
        {assignment.taskStatus && (
          <Badge className={`text-[10px] h-5 ${statusColors[assignment.taskStatus] || "bg-muted text-muted-foreground"}`}>
            {assignment.taskStatus}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleProjectClick}
          data-testid={`goto-project-${assignment.projectId}`}
        >
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}
