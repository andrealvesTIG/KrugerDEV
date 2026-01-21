import { useState, useMemo, useRef } from "react";
import { useProjects, useCreateProject, useUpdateProject } from "@/hooks/use-projects";
import { useExternalProjects } from "@/hooks/use-external-shares";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { useAllTasks } from "@/hooks/use-tasks";
import { ExternalBadge } from "@/components/ExternalBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertProjectSchema } from "@shared/schema";
import type { InsertProject, Project } from "@shared/schema";
import { Link } from "wouter";
import { Plus, Search, Calendar, Target, AlertCircle, TrendingUp, List, LayoutGrid, GanttChart, MoreVertical, Trash2, Eye, Upload, PenTool, ChevronDown, Download, RefreshCw, CheckCircle, Loader2, ClipboardList, ExternalLink, Table2, Settings2, Check, Crown, Database, GripVertical, X, Maximize2, Minimize2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import plannerLogoPath from "@/assets/planner-logo.png";
import msprojectLogoPath from "@/assets/msproject-logo.png";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, differenceInDays, parseISO, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCorners, useDroppable, useDraggable, closestCenter } from "@dnd-kit/core";
import { useSortable, SortableContext, horizontalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/hooks/use-auth";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import ExcelJS from "exceljs";

const PROJECT_STATUS_LIST = ["Initiation", "Planning", "Execution", "Monitoring", "Closing"];

export default function Projects() {
  const { currentOrganization, memberships } = useOrganization();
  const { user } = useAuth();
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"createdAt" | "startDate" | "updatedAt">("createdAt");
  const { data: projects, isLoading } = useProjects(currentOrganization?.id, selectedPortfolio !== "all" ? parseInt(selectedPortfolio) : undefined);
  const { data: externalProjects } = useExternalProjects();
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const { data: allTasks } = useAllTasks();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  // Check if user is admin for current organization
  const currentMembership = memberships.find(m => m.organizationId === currentOrganization?.id);
  const isOrgAdmin = user?.role === 'super_admin' || 
    currentMembership?.role === 'org_admin' || 
    currentOrganization?.ownerId === user?.id;
  const [view, setView] = useState<"list" | "grid" | "kanban" | "gantt">(() => {
    const saved = localStorage.getItem("projects-view-preference");
    if (saved && ["list", "grid", "kanban", "gantt"].includes(saved)) {
      return saved as "list" | "grid" | "kanban" | "gantt";
    }
    return "grid";
  });

  const handleViewChange = (newView: "list" | "grid" | "kanban" | "gantt") => {
    setView(newView);
    localStorage.setItem("projects-view-preference", newView);
  };
  const updateProject = useUpdateProject();
  const createProject = useCreateProject();
  const { toast } = useToast();
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportToExcel = async () => {
    if (!projects || projects.length === 0) {
      toast({ title: "No data", description: "There are no projects to export", variant: "destructive" });
      return;
    }
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Projects");
    
    worksheet.columns = [
      { header: "Name", key: "name", width: 30 },
      { header: "Description", key: "description", width: 40 },
      { header: "Portfolio", key: "portfolio", width: 25 },
      { header: "Status", key: "status", width: 15 },
      { header: "Priority", key: "priority", width: 12 },
      { header: "Health", key: "health", width: 10 },
      { header: "Start Date", key: "startDate", width: 15 },
      { header: "End Date", key: "endDate", width: 15 },
      { header: "Budget", key: "budget", width: 15 },
      { header: "Completion %", key: "completion", width: 12 }
    ];
    
    projects.forEach(p => {
      const portfolio = portfolios?.find(pf => pf.id === p.portfolioId);
      worksheet.addRow({
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
      });
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
      let limitReached = false;
      
      for (let i = 0; i < jsonData.length; i++) {
        if (limitReached) break;
        const row = jsonData[i];
        const name = row["Name"] || row["name"] || row["Project Name"] || row["projectName"];
        if (!name || typeof name !== "string" || name.trim() === "") {
          skipped++;
          continue;
        }
        
        const portfolioName = (row["Portfolio"] || row["portfolio"] || "").toString().trim();
        let matchedPortfolioId: number | null = null;
        if (portfolioName) {
          const matchedPortfolio = portfolios?.find(p => p.name.toLowerCase() === portfolioName.toLowerCase());
          if (matchedPortfolio) {
            matchedPortfolioId = matchedPortfolio.id;
          }
        }
        
        const statusValue = row["Status"] || row["status"] || "Initiation";
        const validStatus = PROJECT_STATUS_LIST.includes(statusValue) ? statusValue : "Initiation";
        
        const priorityValue = row["Priority"] || row["priority"] || "Medium";
        const validPriorities = ["Critical", "High", "Medium", "Low"];
        const validPriority = validPriorities.includes(priorityValue) ? priorityValue : "Medium";
        
        const healthValue = row["Health"] || row["health"] || "Green";
        const validHealths = ["Green", "Yellow", "Red"];
        const validHealth = validHealths.includes(healthValue) ? healthValue : "Green";
        
        const startDateRaw = (row["Start Date"] || row["startDate"] || "").toString().trim();
        const endDateRaw = (row["End Date"] || row["endDate"] || "").toString().trim();
        const budgetRaw = (row["Budget"] || row["budget"] || "0").toString().replace(/[^0-9.]/g, "") || "0";
        const completionRaw = parseInt((row["Completion %"] || row["completion"] || "0").toString().replace(/[^0-9]/g, "")) || 0;
        
        try {
          await createProject.mutateAsync({
            organizationId: currentOrganization.id,
            portfolioId: matchedPortfolioId,
            name: name.trim(),
            description: (row["Description"] || row["description"] || "").toString().trim() || null,
            status: validStatus,
            priority: validPriority as "Critical" | "High" | "Medium" | "Low",
            health: validHealth as "Green" | "Yellow" | "Red",
            startDate: startDateRaw || null,
            endDate: endDateRaw || null,
            budget: budgetRaw,
            completionPercentage: Math.min(100, Math.max(0, completionRaw))
          });
          imported++;
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
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchesSource = sourceFilter === "all" || 
        (sourceFilter === "manual" && (p.source === "manual" || !p.source)) ||
        (sourceFilter === "imported" && p.source === "imported") ||
        (sourceFilter === "external" && (p as any).isExternal);
      // If portfolio is selected, only show org projects from that portfolio
      const matchesPortfolio = selectedPortfolio === "all" || 
        (!(p as any).isExternal && p.portfolioId === parseInt(selectedPortfolio));
      return matchesSearch && matchesSource && matchesPortfolio;
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
  }, [projects, externalProjects, search, sourceFilter, sortBy, selectedPortfolio]);

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
          <Button 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            data-testid="button-import-projects"
          >
            <Upload className="mr-2 h-4 w-4" />
            {isImporting ? "Importing..." : "Import"}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExportToExcel}
            disabled={!projects || projects.length === 0}
            data-testid="button-export-projects"
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <CreateProjectDialog 
            open={isDialogOpen} 
            onOpenChange={setIsDialogOpen} 
            portfolios={portfolios || []}
            organizationId={currentOrganization?.id}
          />
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-4 sm:flex-row bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            className="pl-10 border-border" 
            placeholder="Search projects..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-projects"
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={selectedPortfolio} onValueChange={setSelectedPortfolio}>
            <SelectTrigger data-testid="select-portfolio-filter">
              <SelectValue placeholder="Filter by Portfolio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Portfolios</SelectItem>
              {portfolios?.map(p => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
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
        {/* Sort Dropdown */}
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
        {/* View Toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
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
        </div>
      </div>

      {/* Projects View */}
      {view === "list" ? (
        <div className="space-y-6">
          {filteredProjects?.map((project, index) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <Link href={`/projects/${project.id}`}>
                <div className="group relative flex flex-col gap-5 rounded-2xl border border-border bg-card p-7 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 sm:flex-row sm:items-center cursor-pointer">
                  
                  {/* Status Indicator Stripe */}
                  <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl transition-all duration-300 group-hover:w-2",
                    project.health === 'Green' && "bg-gradient-to-b from-emerald-400 to-emerald-600",
                    project.health === 'Yellow' && "bg-gradient-to-b from-amber-400 to-amber-600",
                    project.health === 'Red' && "bg-gradient-to-b from-rose-400 to-rose-600",
                  )} />

                  <div className="flex-1 pl-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors duration-200">
                        {project.name}
                      </h3>
                      {/* Planner Logo for synced projects */}
                      {project.source === "planner" && project.plannerPlanId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(`https://planner.cloud.microsoft/webui/plan/${project.plannerPlanId}/view/board`, '_blank');
                          }}
                          className="flex items-center gap-1.5 px-2 py-1 bg-indigo-100 dark:bg-indigo-900/50 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors"
                          title="Synced from Microsoft Planner - Click to open in Planner"
                          data-testid={`planner-badge-${project.id}`}
                        >
                          <img src={plannerLogoPath} alt="Planner" className="h-4 w-4" />
                          <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Planner</span>
                          <ExternalLink className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                        </button>
                      )}
                      {/* MS Project Logo for imported projects */}
                      {project.source === "imported" && project.sourceFileUrl && (
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
                          className="flex items-center gap-1.5 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/50 rounded-md hover:bg-emerald-200 dark:hover:bg-emerald-800/50 transition-colors"
                          title={`Imported from MS Project - Click to download ${project.sourceFileName || "source file"}`}
                          data-testid={`msproject-badge-${project.id}`}
                        >
                          <img src={msprojectLogoPath} alt="MS Project" className="h-4 w-4" />
                          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">MS Project</span>
                          <Download className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        </button>
                      )}
                      {/* External Project Badge */}
                      {(project as any).isExternal && (
                        <ExternalBadge 
                          organizationName={(project as any).sourceOrganizationName}
                          accessRole={(project as any).accessRole}
                        />
                      )}
                      {/* Inline Status Dropdown */}
                      <Select 
                        value={project.status} 
                        onValueChange={(newStatus) => {
                          handleStatusChange(project.id, newStatus);
                        }}
                      >
                        <SelectTrigger 
                          className="h-7 w-auto min-w-[120px] text-xs font-medium border-slate-300 dark:border-slate-600"
                          onClick={(e) => e.preventDefault()}
                          data-testid={`select-project-status-${project.id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent onClick={(e) => e.stopPropagation()}>
                          {PROJECT_STATUS_LIST.map(status => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>Due {project.endDate ? format(new Date(project.endDate), 'MMM d, yyyy') : 'TBD'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                project.health === 'Green' && "bg-emerald-500",
                                project.health === 'Yellow' && "bg-amber-500",
                                project.health === 'Red' && "bg-rose-500",
                              )}
                              style={{ width: `${projectProgress[project.id] || 0}%` }}
                            />
                          </div>
                          <span className="font-medium">{projectProgress[project.id] || 0}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 pl-5 sm:pl-0 mt-4 sm:mt-0">
                    <div className="text-right hidden sm:block">
                      <div className="flex items-center gap-1.5 justify-end text-muted-foreground mb-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase tracking-wide">Budget</span>
                      </div>
                      <p className="text-lg font-bold text-foreground">${Number(project.budget).toLocaleString()}</p>
                    </div>
                    <Badge className={cn(
                      "ml-auto sm:ml-0 px-4 py-1.5 text-xs font-semibold rounded-full",
                      project.priority === 'Critical' && "bg-rose-500 text-white hover:bg-rose-500",
                      project.priority === 'High' && "bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400",
                      project.priority === 'Medium' && "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400",
                      project.priority === 'Low' && "bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400"
                    )}>
                      {project.priority}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={(e) => e.preventDefault()}
                          data-testid={`button-menu-project-${project.id}`}
                        >
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
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={(e) => { e.preventDefault(); setDeleteProjectId(project.id); }} 
                          className="text-red-600 focus:text-red-600"
                          data-testid={`menu-delete-project-${project.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}

          {!isLoading && filteredProjects?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-border rounded-xl">
              <div className="rounded-full bg-muted p-4 mb-4">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground">No projects found</h3>
              <p className="text-muted-foreground mt-1 mb-4">Try adjusting your filters or create a new project.</p>
            </div>
          )}
        </div>
      ) : view === "grid" ? (
        <ProjectsGridView 
          projects={filteredProjects || []} 
          portfolios={portfolios || []}
          onStatusChange={handleStatusChange}
          onDeleteProject={(id) => deleteProject.mutate(id)}
          onUpdateProject={(id, data) => updateProject.mutate({ id, ...data })}
          isAdmin={isOrgAdmin}
        />
      ) : view === "kanban" ? (
        <ProjectsKanbanView 
          projects={filteredProjects || []} 
          onStatusChange={handleStatusChange} 
        />
      ) : (
        <ProjectsGanttView projects={filteredProjects || []} />
      )}

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
    </div>
  );
}

type ProjectSource = "manual" | "planner" | "planner-premium" | "msproject";

interface PlannerPlan {
  id: string;
  title: string;
  createdDateTime: string;
  owner: string;
}

interface DataversePlan {
  id: string;
  title: string;
  createdDateTime: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  description?: string | null;
  isPremium: boolean;
}

function CreateProjectDialog({ open, onOpenChange, portfolios, organizationId }: { open: boolean, onOpenChange: (o: boolean) => void, portfolios: any[], organizationId?: number }) {
  const { toast } = useToast();
  const createMutation = useCreateProject();
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitError, setLimitError] = useState<{ message?: string; resourceType?: string } | null>(null);
  const [projectSource, setProjectSource] = useState<ProjectSource>("manual");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [plannerSearchTerm, setPlannerSearchTerm] = useState("");
  const [msProjectPortfolioId, setMsProjectPortfolioId] = useState<number | null>(null);
  const [isImportingMsProject, setIsImportingMsProject] = useState(false);
  const [selectedMsProjectFile, setSelectedMsProjectFile] = useState<File | null>(null);
  const msProjectFileInputRef = useRef<HTMLInputElement>(null);
  
  // Check Planner connection status - only when dialog is open and Planner source selected (org-scoped)
  const { data: plannerStatus, refetch: refetchPlannerStatus } = useQuery<{ configured: boolean; connected: boolean }>({
    queryKey: ["/api/planner/status", organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/planner/status?organizationId=${organizationId}`);
      if (!res.ok) throw new Error('Failed to fetch planner status');
      return res.json();
    },
    enabled: open && projectSource === "planner" && !!organizationId,
  });

  // Fetch Planner plans when connected - only when dialog is open and connected (org-scoped)
  const { data: plannerPlans, isLoading: isLoadingPlans, refetch: refetchPlans } = useQuery<{ plans: PlannerPlan[] }>({
    queryKey: ["/api/planner/plans", organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/planner/plans?organizationId=${organizationId}`);
      if (!res.ok) throw new Error('Failed to fetch planner plans');
      return res.json();
    },
    enabled: open && projectSource === "planner" && plannerStatus?.connected === true && !!organizationId,
  });

  // Connect to Planner mutation (org-scoped)
  const connectPlanner = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/planner/connect", { organizationId });
      return response.json();
    },
    onSuccess: (data: { authUrl: string }) => {
      window.location.href = data.authUrl;
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to connect to Planner", variant: "destructive" });
    },
  });

  // Import from Planner mutation
  const importFromPlanner = useMutation({
    mutationFn: async ({ planId, portfolioId }: { planId: string; portfolioId: number | null }) => {
      const response = await apiRequest("POST", "/api/planner/import", {
        planId,
        organizationId,
        portfolioId,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Success", description: data.message || "Project imported successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onOpenChange(false);
      setSelectedPlanId(null);
      setProjectSource("manual");
    },
    onError: (err: any) => {
      if (err.limitExceeded) {
        setLimitError({ message: err.message, resourceType: err.resourceType });
        setLimitDialogOpen(true);
        onOpenChange(false);
      } else if (err.status === 401) {
        toast({ title: "Session Expired", description: "Please reconnect to Planner", variant: "destructive" });
        refetchPlannerStatus();
      } else {
        toast({ title: "Error", description: err.message || "Failed to import from Planner", variant: "destructive" });
      }
    },
  });

  // Dataverse (Planner Premium) state
  const [dataverseEnvUrl, setDataverseEnvUrl] = useState("");
  const [dataverseSearchTerm, setDataverseSearchTerm] = useState("");
  const [selectedDataversePlanId, setSelectedDataversePlanId] = useState<string | null>(null);

  // Check Dataverse connection status
  const { data: dataverseStatus, refetch: refetchDataverseStatus } = useQuery<{ 
    configured: boolean; 
    connected: boolean;
    environmentUrl: string | null;
  }>({
    queryKey: ["/api/dataverse/status"],
    enabled: open && projectSource === "planner-premium",
  });

  // Fetch Dataverse Premium plans when connected
  const { data: dataversePlans, isLoading: isLoadingDataversePlans, refetch: refetchDataversePlans } = useQuery<{ plans: DataversePlan[] }>({
    queryKey: ["/api/dataverse/plans"],
    enabled: open && projectSource === "planner-premium" && dataverseStatus?.connected === true,
  });

  // Set Dataverse environment URL mutation
  const setDataverseEnvironment = useMutation({
    mutationFn: async (environmentUrl: string) => {
      const response = await apiRequest("POST", "/api/dataverse/set-environment", { environmentUrl });
      return response.json();
    },
    onSuccess: () => {
      refetchDataverseStatus();
      toast({ title: "Success", description: "Dataverse environment configured" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to set environment URL", variant: "destructive" });
    },
  });

  // Connect to Dataverse mutation
  const connectDataverse = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/dataverse/connect");
      return response.json();
    },
    onSuccess: (data: { authUrl: string }) => {
      window.location.href = data.authUrl;
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to connect to Dataverse", variant: "destructive" });
    },
  });

  // Import from Dataverse mutation
  const importFromDataverse = useMutation({
    mutationFn: async ({ planId, portfolioId }: { planId: string; portfolioId: number | null }) => {
      const response = await apiRequest("POST", "/api/dataverse/import", {
        planId,
        organizationId,
        portfolioId,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Success", description: data.message || "Premium plan imported successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onOpenChange(false);
      setSelectedDataversePlanId(null);
      setProjectSource("manual");
    },
    onError: (err: any) => {
      if (err.limitExceeded) {
        setLimitError({ message: err.message, resourceType: err.resourceType });
        setLimitDialogOpen(true);
        onOpenChange(false);
      } else if (err.status === 401) {
        toast({ title: "Session Expired", description: "Please reconnect to Dataverse", variant: "destructive" });
        refetchDataverseStatus();
      } else {
        toast({ title: "Error", description: err.message || "Failed to import Premium plan", variant: "destructive" });
      }
    },
  });

  // Filter Dataverse plans by search term
  const filteredDataversePlans = useMemo(() => {
    if (!dataversePlans?.plans) return [];
    if (!dataverseSearchTerm.trim()) return dataversePlans.plans;
    const term = dataverseSearchTerm.toLowerCase();
    return dataversePlans.plans.filter(plan => 
      plan.title.toLowerCase().includes(term)
    );
  }, [dataversePlans?.plans, dataverseSearchTerm]);
  
  const form = useForm<InsertProject>({
    resolver: zodResolver(insertProjectSchema.extend({
      name: z.string().min(1, "Project name is required"),
    })),
    defaultValues: {
      name: "",
      description: "",
      priority: "Medium",
      status: "Initiation",
      budget: "0",
      organizationId: organizationId || undefined,
    }
  });

  const onSubmit = (data: InsertProject) => {
    createMutation.mutate({ ...data, organizationId: organizationId || null }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Project created successfully" });
        onOpenChange(false);
        form.reset();
      },
      onError: (err: any) => {
        if (err.limitExceeded) {
          setLimitError({ message: err.message, resourceType: err.resourceType });
          setLimitDialogOpen(true);
          onOpenChange(false);
        } else {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      }
    });
  };

  const handlePlannerImport = () => {
    if (!selectedPlanId) {
      toast({ title: "Select a Plan", description: "Please select a Planner plan to import", variant: "destructive" });
      return;
    }
    importFromPlanner.mutate({ planId: selectedPlanId, portfolioId: selectedPortfolioId });
  };

  const selectedPlan = plannerPlans?.plans?.find(p => p.id === selectedPlanId);

  const filteredPlannerPlans = useMemo(() => {
    if (!plannerPlans?.plans) return [];
    if (!plannerSearchTerm.trim()) return plannerPlans.plans;
    const searchLower = plannerSearchTerm.toLowerCase().trim();
    return plannerPlans.plans.filter(plan => 
      plan.title.toLowerCase().includes(searchLower)
    );
  }, [plannerPlans?.plans, plannerSearchTerm]);

  const handleMsProjectFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedMsProjectFile(file);
    }
  };

  const handleMsProjectImport = async () => {
    if (!selectedMsProjectFile) {
      toast({ title: "Select a File", description: "Please select an MS Project file to import", variant: "destructive" });
      return;
    }

    setIsImportingMsProject(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedMsProjectFile);
      if (organizationId) formData.append("organizationId", organizationId.toString());
      if (msProjectPortfolioId) formData.append("portfolioId", msProjectPortfolioId.toString());

      const uploadResponse = await fetch("/api/mpp-imports/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.message || "Upload failed");
      }

      const importRecord = await uploadResponse.json();
      
      // Now convert the import to a project
      const response = await fetch(`/api/mpp-imports/${importRecord.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: importRecord.fileName.replace(/\.[^/.]+$/, ""),
          portfolioId: msProjectPortfolioId,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Import failed");
      }

      const result = await response.json();
      toast({ title: "Success", description: result.message || "Project imported successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onOpenChange(false);
      setSelectedMsProjectFile(null);
      setMsProjectPortfolioId(null);
      setProjectSource("manual");
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.message || "Could not import MS Project file", variant: "destructive" });
    } finally {
      setIsImportingMsProject(false);
      if (msProjectFileInputRef.current) msProjectFileInputRef.current.value = "";
    }
  };

  return (
    <>
    <LimitExceededDialog
      open={limitDialogOpen}
      onOpenChange={setLimitDialogOpen}
      resourceType={limitError?.resourceType}
      message={limitError?.message}
    />
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) {
        setProjectSource("manual");
        setSelectedPlanId(null);
        setPlannerSearchTerm("");
      }
    }}>
      <DialogTrigger asChild>
        <Button className="shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
          <Plus className="mr-2 h-4 w-4" /> New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        
        {/* Source Selector - Card-based design with logos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
          <button
            type="button"
            onClick={() => setProjectSource("manual")}
            className={cn(
              "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover-elevate",
              projectSource === "manual" 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-primary/50"
            )}
            data-testid="button-source-manual"
          >
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <PenTool className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-xs font-medium text-center">Create Manually</span>
          </button>
          
          <button
            type="button"
            onClick={() => setProjectSource("planner")}
            className={cn(
              "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover-elevate",
              projectSource === "planner" 
                ? "border-indigo-500 bg-indigo-500/5" 
                : "border-border hover:border-indigo-500/50"
            )}
            data-testid="button-source-planner"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center">
              <img src={plannerLogoPath} alt="Planner" className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium text-center">Planner</span>
          </button>
          
          <button
            type="button"
            onClick={() => setProjectSource("planner-premium")}
            className={cn(
              "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover-elevate",
              projectSource === "planner-premium" 
                ? "border-purple-500 bg-purple-500/5" 
                : "border-border hover:border-purple-500/50"
            )}
            data-testid="button-source-planner-premium"
          >
            <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center relative">
              <img src={plannerLogoPath} alt="Planner Premium" className="h-5 w-5" />
              <Crown className="h-3 w-3 text-purple-600 absolute -top-1 -right-1" />
            </div>
            <span className="text-xs font-medium text-center">Premium</span>
          </button>
          
          <button
            type="button"
            onClick={() => setProjectSource("msproject")}
            className={cn(
              "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover-elevate",
              projectSource === "msproject" 
                ? "border-emerald-500 bg-emerald-500/5" 
                : "border-border hover:border-emerald-500/50"
            )}
            data-testid="button-source-msproject"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center">
              <img src={msprojectLogoPath} alt="MS Project" className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium text-center">MS Project</span>
          </button>
        </div>

        {projectSource === "manual" && (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="name">Project Name</Label>
                <Input id="name" {...form.register("name")} placeholder="Project Alpha" data-testid="input-project-name" />
                {form.formState.errors.name && <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>}
              </div>
              
              <div className="space-y-2 col-span-2">
                <Label htmlFor="portfolioId">Portfolio</Label>
                <Controller
                  control={form.control}
                  name="portfolioId"
                  render={({ field }) => (
                    <Select 
                      onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} 
                      value={field.value?.toString() || "none"}
                    >
                      <SelectTrigger data-testid="select-portfolio">
                        <SelectValue placeholder="Select Portfolio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Portfolio</SelectItem>
                        {portfolios.map(p => (
                          <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Controller
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="select-priority">
                        <SelectValue placeholder="Select Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget">Budget ($)</Label>
                <Input id="budget" type="number" {...form.register("budget")} data-testid="input-budget" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" type="date" {...form.register("startDate")} data-testid="input-start-date" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input id="endDate" type="date" {...form.register("endDate")} data-testid="input-end-date" />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" {...form.register("description")} data-testid="input-description" />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-project">
                {createMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {projectSource === "planner" && (
          <div className="space-y-4 pt-2">
            {/* Planner Import View */}
            {!plannerStatus?.configured ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Microsoft 365 is not configured.</p>
                <p className="text-sm text-muted-foreground mt-1">Contact your administrator to set up the integration.</p>
              </div>
            ) : !plannerStatus?.connected ? (
              <div className="text-center py-8">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-4">Connect to Microsoft Planner to import plans</p>
                <Button 
                  onClick={() => connectPlanner.mutate()}
                  disabled={connectPlanner.isPending}
                  data-testid="button-connect-planner"
                >
                  {connectPlanner.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Connect to Planner
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Connected to Microsoft Planner</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => refetchPlans()}
                    disabled={isLoadingPlans}
                    data-testid="button-refresh-plans"
                  >
                    <RefreshCw className={cn("h-4 w-4", isLoadingPlans && "animate-spin")} />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Select Plan to Import</Label>
                  {isLoadingPlans ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !plannerPlans?.plans?.length ? (
                    <div className="text-center py-8 border rounded-md bg-muted/20">
                      <p className="text-muted-foreground">No plans found in your Planner account.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search plans..."
                          value={plannerSearchTerm}
                          onChange={(e) => setPlannerSearchTerm(e.target.value)}
                          className="pl-9"
                          data-testid="input-planner-search"
                        />
                      </div>
                      {filteredPlannerPlans.length === 0 ? (
                        <div className="text-center py-4 text-sm text-muted-foreground">
                          No plans match "{plannerSearchTerm}"
                        </div>
                      ) : (
                        <div className="grid gap-2 max-h-[200px] overflow-y-auto">
                          {filteredPlannerPlans.map((plan) => (
                            <div
                              key={plan.id}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors hover-elevate",
                                selectedPlanId === plan.id 
                                  ? "border-primary bg-primary/5" 
                                  : "border-border hover:border-primary/50"
                              )}
                              onClick={() => setSelectedPlanId(plan.id)}
                              data-testid={`plan-option-${plan.id}`}
                            >
                              <ClipboardList className="h-5 w-5 text-primary shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{plan.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  Created {format(new Date(plan.createdDateTime), 'MMM d, yyyy')}
                                </p>
                              </div>
                              {selectedPlanId === plan.id && (
                                <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Target Portfolio (Optional)</Label>
                  <Select 
                    onValueChange={(val) => setSelectedPortfolioId(val === "none" ? null : parseInt(val))} 
                    value={selectedPortfolioId?.toString() || "none"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Portfolio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Portfolio</SelectItem>
                      {portfolios.map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedPlan && (
                  <div className="p-3 bg-muted/30 rounded-md">
                    <p className="text-sm">
                      Importing <strong>{selectedPlan.title}</strong> will create a new project with all tasks from this Planner plan.
                    </p>
                  </div>
                )}

                <DialogFooter>
                  <Button 
                    onClick={handlePlannerImport}
                    disabled={!selectedPlanId || importFromPlanner.isPending}
                    data-testid="button-import-planner"
                  >
                    {importFromPlanner.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Import Project
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}

        {projectSource === "planner-premium" && (
          <div className="space-y-4 pt-2">
            {/* Planner Premium (Dataverse) Import View */}
            <div className="flex items-center gap-3 p-4 rounded-lg border bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
              <div className="relative">
                <img src={plannerLogoPath} alt="Planner Premium" className="h-8 w-8" />
                <Crown className="h-4 w-4 text-purple-600 absolute -top-1 -right-1" />
              </div>
              <div>
                <p className="font-medium">Planner Premium</p>
                <p className="text-sm text-muted-foreground">Import from Project for the Web via Dataverse</p>
              </div>
            </div>

            {!dataverseStatus?.configured ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Microsoft 365 is not configured.</p>
                <p className="text-sm text-muted-foreground mt-1">Contact your administrator to set up the integration.</p>
              </div>
            ) : !dataverseStatus?.environmentUrl ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <Database className="h-12 w-12 mx-auto text-purple-500 mb-3" />
                  <p className="text-muted-foreground mb-2">Configure your Dataverse environment</p>
                  <p className="text-xs text-muted-foreground">Required for accessing Premium Planner plans</p>
                </div>
                <div className="space-y-2">
                  <Label>Dataverse Environment URL</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://yourorg.crm.dynamics.com"
                      value={dataverseEnvUrl}
                      onChange={(e) => setDataverseEnvUrl(e.target.value)}
                      data-testid="input-dataverse-url"
                    />
                    <Button 
                      onClick={() => setDataverseEnvironment.mutate(dataverseEnvUrl)}
                      disabled={!dataverseEnvUrl || setDataverseEnvironment.isPending}
                      data-testid="button-set-dataverse-env"
                    >
                      {setDataverseEnvironment.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Set"
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Find your URL in Power Platform Admin Center
                  </p>
                </div>
              </div>
            ) : !dataverseStatus?.connected ? (
              <div className="text-center py-8">
                <Database className="h-12 w-12 mx-auto text-purple-500 mb-3" />
                <p className="text-sm text-muted-foreground mb-2">
                  Environment: {dataverseStatus.environmentUrl}
                </p>
                <p className="text-muted-foreground mb-4">Connect to Dataverse to import Premium plans</p>
                <Button 
                  onClick={() => connectDataverse.mutate()}
                  disabled={connectDataverse.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                  data-testid="button-connect-dataverse"
                >
                  {connectDataverse.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Database className="mr-2 h-4 w-4" />
                      Connect to Dataverse
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Connected to Dataverse</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => refetchDataversePlans()}
                    disabled={isLoadingDataversePlans}
                    data-testid="button-refresh-dataverse-plans"
                  >
                    <RefreshCw className={cn("h-4 w-4", isLoadingDataversePlans && "animate-spin")} />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Select Premium Plan to Import</Label>
                  {isLoadingDataversePlans ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !dataversePlans?.plans?.length ? (
                    <div className="text-center py-8 border rounded-md bg-muted/20">
                      <p className="text-muted-foreground">No Premium plans found in your Dataverse environment.</p>
                      <p className="text-xs text-muted-foreground mt-1">Make sure you have access to Project for the Web.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search Premium plans..."
                          value={dataverseSearchTerm}
                          onChange={(e) => setDataverseSearchTerm(e.target.value)}
                          className="pl-9"
                          data-testid="input-dataverse-search"
                        />
                      </div>
                      {filteredDataversePlans.length === 0 ? (
                        <div className="text-center py-4 text-sm text-muted-foreground">
                          No plans match "{dataverseSearchTerm}"
                        </div>
                      ) : (
                        <div className="grid gap-2 max-h-[200px] overflow-y-auto overflow-x-hidden">
                          {filteredDataversePlans.map((plan) => (
                            <div
                              key={plan.id}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors hover-elevate overflow-hidden",
                                selectedDataversePlanId === plan.id 
                                  ? "border-purple-500 bg-purple-500/5" 
                                  : "border-border hover:border-purple-500/50"
                              )}
                              onClick={() => setSelectedDataversePlanId(plan.id)}
                              data-testid={`dataverse-plan-option-${plan.id}`}
                            >
                              <div className="relative shrink-0">
                                <ClipboardList className="h-5 w-5 text-purple-600" />
                                <Crown className="h-3 w-3 text-purple-500 absolute -top-1 -right-1" />
                              </div>
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <p className="font-medium truncate">{plan.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  Created {format(new Date(plan.createdDateTime), 'MMM d, yyyy')}
                                </p>
                              </div>
                              {selectedDataversePlanId === plan.id && (
                                <CheckCircle className="h-5 w-5 text-purple-600 shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Target Portfolio (Optional)</Label>
                  <Select 
                    onValueChange={(val) => setSelectedPortfolioId(val === "none" ? null : parseInt(val))} 
                    value={selectedPortfolioId?.toString() || "none"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Portfolio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Portfolio</SelectItem>
                      {portfolios.map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedDataversePlanId && filteredDataversePlans.find(p => p.id === selectedDataversePlanId) && (
                  <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-md">
                    <p className="text-sm">
                      Importing <strong>{filteredDataversePlans.find(p => p.id === selectedDataversePlanId)?.title}</strong> will create a new project with all tasks from this Premium plan.
                    </p>
                  </div>
                )}

                <DialogFooter>
                  <Button 
                    onClick={() => {
                      if (!selectedDataversePlanId) {
                        toast({ title: "Select a Plan", description: "Please select a Premium plan to import", variant: "destructive" });
                        return;
                      }
                      importFromDataverse.mutate({ planId: selectedDataversePlanId, portfolioId: selectedPortfolioId });
                    }}
                    disabled={!selectedDataversePlanId || importFromDataverse.isPending}
                    className="bg-purple-600 hover:bg-purple-700"
                    data-testid="button-import-dataverse"
                  >
                    {importFromDataverse.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Import Premium Plan
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}

        {projectSource === "msproject" && (
          <div className="space-y-4 pt-2">
            {/* MS Project File Import */}
            <div className="flex items-center gap-3 p-4 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
              <img src={msprojectLogoPath} alt="MS Project" className="h-8 w-8" />
              <div>
                <p className="font-medium">Import from MS Project</p>
                <p className="text-sm text-muted-foreground">Upload .mpp, .xml (MSPDI), or .csv project files</p>
              </div>
            </div>

            <input
              type="file"
              ref={msProjectFileInputRef}
              onChange={handleMsProjectFileSelect}
              accept=".mpp,.xml,.csv"
              className="hidden"
              data-testid="input-msproject-file"
            />

            <div className="space-y-2">
              <Label>Select Project File</Label>
              <div 
                className={cn(
                  "flex flex-col items-center justify-center gap-3 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-all hover-elevate",
                  selectedMsProjectFile 
                    ? "border-emerald-500 bg-emerald-500/5" 
                    : "border-border hover:border-emerald-500/50"
                )}
                onClick={() => msProjectFileInputRef.current?.click()}
                data-testid="dropzone-msproject"
              >
                {selectedMsProjectFile ? (
                  <>
                    <div className="flex items-center gap-2">
                      <img src={msprojectLogoPath} alt="MS Project" className="h-5 w-5" />
                      <span className="font-medium">{selectedMsProjectFile.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(selectedMsProjectFile.size / 1024).toFixed(1)} KB
                    </p>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMsProjectFile(null);
                        if (msProjectFileInputRef.current) msProjectFileInputRef.current.value = "";
                      }}
                    >
                      Choose Different File
                    </Button>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to select a file</p>
                    <p className="text-xs text-muted-foreground">Supports .mpp, .xml, .csv</p>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Target Portfolio (Optional)</Label>
              <Select 
                onValueChange={(val) => setMsProjectPortfolioId(val === "none" ? null : parseInt(val))} 
                value={msProjectPortfolioId?.toString() || "none"}
              >
                <SelectTrigger data-testid="select-msproject-portfolio">
                  <SelectValue placeholder="Select Portfolio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Portfolio</SelectItem>
                  {portfolios.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedMsProjectFile && (
              <div className="p-3 bg-muted/30 rounded-md">
                <p className="text-sm">
                  Importing <strong>{selectedMsProjectFile.name}</strong> will create a new project with all tasks from this file.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button 
                onClick={handleMsProjectImport}
                disabled={!selectedMsProjectFile || isImportingMsProject}
                data-testid="button-import-msproject"
              >
                {isImportingMsProject ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Import Project
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
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
  { id: "completion", label: "Completion %", defaultVisible: true },
  { id: "projectType", label: "Project Type", defaultVisible: false },
  { id: "methodology", label: "Methodology", defaultVisible: false },
  { id: "department", label: "Department", defaultVisible: false },
  { id: "category", label: "Category", defaultVisible: false },
  { id: "businessValue", label: "Business Value", defaultVisible: false },
  { id: "riskLevel", label: "Risk Level", defaultVisible: false },
  { id: "source", label: "Source", defaultVisible: false },
  { id: "owner", label: "Manager", defaultVisible: false },
  { id: "createdAt", label: "Created Date", defaultVisible: false },
  { id: "description", label: "Description", defaultVisible: false },
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

interface Portfolio {
  id: number;
  name: string;
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

function ProjectsGridView({ 
  projects, 
  portfolios,
  onStatusChange,
  onDeleteProject,
  onUpdateProject,
  isAdmin,
}: { 
  projects: Project[];
  portfolios: Portfolio[];
  onStatusChange: (projectId: number, newStatus: string) => void;
  onDeleteProject: (projectId: number) => void;
  onUpdateProject: (projectId: number, data: Partial<Project>) => void;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const [visibleColumns, setVisibleColumns] = useState<string[]>(getStoredColumns);
  const [columnOrder, setColumnOrder] = useState<string[]>(getStoredColumnOrder);
  const [selectedProjects, setSelectedProjects] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{ projectId: number; columnId: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
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
      .map(id => ALL_GRID_COLUMNS.find(c => c.id === id)!)
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
          <div className="flex items-center gap-2 group">
            <Link href={`/projects/${project.id}`} className="font-medium text-primary hover:underline">
              {project.name}
            </Link>
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
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
              {["Initiation", "Planning", "Execution", "Monitoring", "Closing"].map(status => (
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
              {["Critical", "High", "Medium", "Low"].map(priority => (
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
              {["Green", "Yellow", "Red"].map(health => (
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
            <span className="text-sm font-medium">${Number(project.budget || 0).toLocaleString()}</span>
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
        if (project.source === "planner") return <Badge variant="outline" className="text-xs">Planner</Badge>;
        if (project.source === "imported") return <Badge variant="outline" className="text-xs">MS Project</Badge>;
        return <Badge variant="outline" className="text-xs">Manual</Badge>;
      case "owner":
        return <span className="text-sm">{project.managerId || "-"}</span>;
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
        return (
          <Badge variant="outline" className="text-xs">
            {project.billableStatus || "N/A"}
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
        return <span className="text-sm">${Number(project.actualCost || 0).toLocaleString()}</span>;
      case "forecastCost":
        return <span className="text-sm">{project.forecastCost ? `$${Number(project.forecastCost).toLocaleString()}` : "-"}</span>;
      case "costVariance":
        const costVar = Number(project.costVariance || 0);
        return (
          <span className={cn("text-sm", costVar < 0 ? "text-rose-600" : costVar > 0 ? "text-emerald-600" : "")}>
            {project.costVariance ? `$${costVar.toLocaleString()}` : "-"}
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
      default:
        return "-";
    }
  };

  const orderedVisibleColumns = getOrderedVisibleColumns();

  return (
    <div className={cn(
      "space-y-4",
      isFullscreen && "fixed inset-0 z-50 bg-background p-4 flex flex-col"
    )}>
      {/* Bulk Actions Toolbar */}
      {selectedProjects.size > 0 && (
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
      
      <div className="flex justify-end gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setIsFullscreen(!isFullscreen)}
          data-testid="button-grid-fullscreen"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="h-4 w-4 mr-2" />
              Exit Fullscreen
            </>
          ) : (
            <>
              <Maximize2 className="h-4 w-4 mr-2" />
              Fullscreen
            </>
          )}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-grid-columns">
              <Settings2 className="h-4 w-4 mr-2" />
              Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <div className="space-y-2">
              <p className="text-sm font-medium">Show Columns</p>
              <p className="text-xs text-muted-foreground">Drag column headers to reorder</p>
              <div className="space-y-1">
                {ALL_GRID_COLUMNS.map(column => (
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

      <div className={cn(
        "rounded-lg border bg-card overflow-x-auto",
        isFullscreen && "flex-1 overflow-y-auto"
      )}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
          <Table>
            <TableHeader className={cn(isFullscreen && "sticky top-0 z-10 bg-card")}>
              <TableRow className={cn(isFullscreen && "bg-card")}>
                <TableHead className={cn("w-10", isFullscreen && "bg-card")}>
                  <Checkbox 
                    checked={projects.length > 0 && selectedProjects.size === projects.length}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <SortableContext items={orderedVisibleColumns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                  {orderedVisibleColumns.map(column => (
                    <SortableColumnHeader key={column.id} column={column} isFullscreen={isFullscreen}>
                      {column.label}
                    </SortableColumnHeader>
                  ))}
                </SortableContext>
                <TableHead className={cn("w-10", isFullscreen && "bg-card")}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={orderedVisibleColumns.length + 2} className="text-center py-8 text-muted-foreground">
                    No projects found
                  </TableCell>
                </TableRow>
              ) : (
                projects.map(project => (
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
                    {orderedVisibleColumns.map(column => (
                      <TableCell key={column.id}>
                        {renderCellContent(project, column.id)}
                      </TableCell>
                    ))}
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
                ))
              )}
            </TableBody>
          </Table>
        </DndContext>
      </div>
      
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
const PROJECT_STATUSES = [
  { id: "Initiation", label: "Initiation", color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  { id: "Planning", label: "Planning", color: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200" },
  { id: "Execution", label: "Execution", color: "bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200" },
  { id: "Monitoring", label: "Monitoring", color: "bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200" },
  { id: "Closing", label: "Closing", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200" },
];

function ProjectsKanbanView({ 
  projects, 
  onStatusChange 
}: { 
  projects: Project[]; 
  onStatusChange: (projectId: number, newStatus: string) => void;
}) {
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const projectId = Number(event.active.id);
    const project = projects.find(p => p.id === projectId);
    if (project) setActiveProject(project);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveProject(null);
    const { active, over } = event;
    if (!over) return;
    
    const projectId = Number(active.id);
    const newStatus = String(over.id);
    const project = projects.find(p => p.id === projectId);
    
    if (project && project.status !== newStatus && PROJECT_STATUSES.some(s => s.id === newStatus)) {
      onStatusChange(projectId, newStatus);
    }
  };

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {PROJECT_STATUSES.map(status => (
          <ProjectKanbanColumn
            key={status.id}
            column={status}
            projects={projects.filter(p => p.status === status.id)}
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
  );
}

function ProjectKanbanColumn({ 
  column, 
  projects 
}: { 
  column: { id: string; label: string; color: string }; 
  projects: Project[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "space-y-3 min-h-[300px] rounded-lg transition-colors p-2",
        isOver && "bg-primary/5 ring-2 ring-primary ring-dashed"
      )}
    >
      <div className={cn("rounded-lg p-3 font-semibold text-center", column.color)}>
        {column.label} ({projects.length})
      </div>
      <div className="space-y-3">
        {projects.map(project => (
          <DraggableProjectCard key={project.id} project={project} />
        ))}
        {projects.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
            Drop projects here
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableProjectCard({ project }: { project: Project }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: project.id,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(isDragging && "opacity-50")}
    >
      <Link href={`/projects/${project.id}`}>
        <Card 
          className="cursor-grab hover:shadow-md transition-shadow active:cursor-grabbing"
          data-testid={`kanban-project-${project.id}`}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="font-medium text-sm line-clamp-2 flex-1">{project.name}</div>
              {project.source === "planner" && project.plannerPlanId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(`https://planner.cloud.microsoft/webui/plan/${project.plannerPlanId}/view/board`, '_blank');
                  }}
                  className="flex-shrink-0"
                  title="Open in Planner"
                >
                  <img src={plannerLogoPath} alt="Planner" className="h-4 w-4" />
                </button>
              )}
              {project.source === "imported" && project.sourceFileUrl && (
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
                  className="flex-shrink-0"
                  title={`Download ${project.sourceFileName || "source file"}`}
                >
                  <img src={msprojectLogoPath} alt="MS Project" className="h-4 w-4" />
                </button>
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
        </Card>
      </Link>
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

function ProjectsGanttView({ projects }: { projects: Project[] }) {
  const [zoomDays, setZoomDays] = useState<ZoomLevel>(90);
  const [rangePreset, setRangePreset] = useState<RangePreset>("custom");
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

  const timeMarkers = getTimeMarkers();

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
          </div>

          <span className="text-sm text-muted-foreground">
            {format(timelineStart, 'MMM d, yyyy')} - {format(timelineEnd, 'MMM d, yyyy')}
          </span>
        </div>

        <div className="relative overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="flex border-b border-border mb-2">
              <div className="w-64 flex-shrink-0 p-2 font-semibold text-sm">Project</div>
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
              </div>
            </div>

            <div className="space-y-2">
              {projects.map(project => {
                const barPosition = getBarPosition(project.startDate, project.endDate);
                
                return (
                  <div key={project.id} className="flex items-center">
                    <div className="w-64 flex-shrink-0 p-2">
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
                                className="flex-shrink-0"
                                title="Open in Planner"
                              >
                                <img src={plannerLogoPath} alt="Planner" className="h-4 w-4" />
                              </button>
                            )}
                            {project.source === "imported" && project.sourceFileUrl && (
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
                                className="flex-shrink-0"
                                title={`Download ${project.sourceFileName || "source file"}`}
                              >
                                <img src={msprojectLogoPath} alt="MS Project" className="h-4 w-4" />
                              </button>
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
