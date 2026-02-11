import { useState, useMemo } from "react";
import { normalizeSearch } from "@/lib/utils";
import { useOrganization } from "@/hooks/use-organization";
import { useResources } from "@/hooks/use-resources";
import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useQuery } from "@tanstack/react-query";
import { DashboardActionBar } from "./DashboardActionBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Briefcase, PieChart, TrendingUp, Filter, Search, X } from "lucide-react";
import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import type { TaskResourceAssignment, Resource, Project } from "@shared/schema";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Teal: "#14b8a6",
  Indigo: "#6366f1",
  Pink: "#ec4899",
  Cyan: "#06b6d4",
  Orange: "#f97316",
};

const COLOR_PALETTE = [COLORS.Blue, COLORS.Purple, COLORS.Teal, COLORS.Cyan, COLORS.Indigo, COLORS.Pink, COLORS.Orange, COLORS.Green, COLORS.Yellow];

interface ResourceFilters {
  resourceId: number | null;
  department: string | null;
  skill: string | null;
  searchQuery: string;
}

export function ResourceAllocationDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: resources, isLoading: resourcesLoading } = useResources(currentOrganization?.id ?? null);
  const { data: projectsData, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios(currentOrganization?.id);
  
  const [filters, setFilters] = useState<ResourceFilters>({
    resourceId: null,
    department: null,
    skill: null,
    searchQuery: "",
  });

  const { data: allAssignments = [], isLoading: assignmentsLoading } = useQuery<(TaskResourceAssignment & { resource: Resource })[]>({
    queryKey: ['/api/resource-assignments/all', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/resource-assignments?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const departments = useMemo(() => {
    const depts = new Set<string>();
    (resources || []).forEach(r => {
      if (r.department) depts.add(r.department);
    });
    return Array.from(depts).sort();
  }, [resources]);

  const allSkills = useMemo(() => {
    const skillSet = new Set<string>();
    (resources || []).forEach(r => {
      if (r.skills) {
        r.skills.split(",").map(s => s.trim()).filter(Boolean).forEach(skill => skillSet.add(skill));
      }
    });
    return Array.from(skillSet).sort();
  }, [resources]);

  const filteredResources = useMemo(() => {
    return (resources ?? []).filter(r => {
      if (!r.isActive) return false;
      if (filters.resourceId && r.id !== filters.resourceId) return false;
      if (filters.department && r.department !== filters.department) return false;
      if (filters.skill) {
        const resourceSkills = r.skills?.split(",").map(s => normalizeSearch(s.trim())) || [];
        if (!resourceSkills.includes(normalizeSearch(filters.skill))) return false;
      }
      if (filters.searchQuery) {
        const query = normalizeSearch(filters.searchQuery);
        const matchesName = normalizeSearch(r.displayName).includes(query);
        const matchesEmail = normalizeSearch(r.email).includes(query);
        const matchesDept = normalizeSearch(r.department).includes(query);
        if (!matchesName && !matchesEmail && !matchesDept) return false;
      }
      return true;
    });
  }, [resources, filters]);

  const clearFilters = () => {
    setFilters({ resourceId: null, department: null, skill: null, searchQuery: "" });
  };

  const hasActiveFilters = filters.resourceId || filters.department || filters.skill || filters.searchQuery;

  if (resourcesLoading || assignmentsLoading || projectsLoading || portfoliosLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeResources = filteredResources;
  const projects = projectsData || [];

  const assignmentCountByResource = allAssignments.reduce((acc, assignment) => {
    acc[assignment.resourceId] = (acc[assignment.resourceId] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const projectAssignments = allAssignments.reduce((acc, assignment) => {
    const resource = activeResources.find(r => r.id === assignment.resourceId);
    if (!resource) return acc;
    
    if (!acc[assignment.taskId]) {
      acc[assignment.taskId] = { taskId: assignment.taskId, resources: [] };
    }
    acc[assignment.taskId].resources.push(resource);
    return acc;
  }, {} as Record<number, { taskId: number; resources: Resource[] }>);

  const handleExportCsv = () => {
    const headers = ["Name", "Email", "Department", "Skills", "Assignments", "Allocation %"];
    const rows = activeResources.map(r => [
      r.displayName,
      r.email || "",
      r.department || "",
      r.skills || "",
      assignmentCountByResource[r.id] || 0,
      `${Math.min(100, (assignmentCountByResource[r.id] || 0) * 20)}%`
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resource_allocation.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const assignedResourceIds = new Set(
    allAssignments
      .filter(a => activeResources.some(r => r.id === a.resourceId))
      .map(a => a.resourceId)
  );
  const resourcesWithAssignments = activeResources.filter(r => assignedResourceIds.has(r.id)).length;
  const unassignedResources = activeResources.length - resourcesWithAssignments;

  const allocationDistribution = [
    { name: "Available", value: unassignedResources, color: COLORS.Green },
    { name: "Light (1-2)", value: activeResources.filter(r => (assignmentCountByResource[r.id] || 0) >= 1 && (assignmentCountByResource[r.id] || 0) <= 2).length, color: COLORS.Blue },
    { name: "Moderate (3-5)", value: activeResources.filter(r => (assignmentCountByResource[r.id] || 0) >= 3 && (assignmentCountByResource[r.id] || 0) <= 5).length, color: COLORS.Yellow },
    { name: "Heavy (6+)", value: activeResources.filter(r => (assignmentCountByResource[r.id] || 0) >= 6).length, color: COLORS.Red },
  ].filter(d => d.value > 0);

  const departmentAllocation = activeResources.reduce((acc, resource) => {
    const dept = resource.department || "Unassigned";
    if (!acc[dept]) {
      acc[dept] = { name: dept, total: 0, assigned: 0, available: 0 };
    }
    acc[dept].total += 1;
    if (assignedResourceIds.has(resource.id)) {
      acc[dept].assigned += 1;
    } else {
      acc[dept].available += 1;
    }
    return acc;
  }, {} as Record<string, { name: string; total: number; assigned: number; available: number }>);

  const departmentChartData = Object.values(departmentAllocation)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((d, i) => ({ ...d, fill: COLOR_PALETTE[i % COLOR_PALETTE.length] }));

  const skillAllocation = allSkills.slice(0, 10).map(skill => {
    const resourcesWithSkill = activeResources.filter(r => 
      r.skills?.split(",").map(s => normalizeSearch(s.trim())).includes(normalizeSearch(skill))
    );
    const assignedWithSkill = resourcesWithSkill.filter(r => assignedResourceIds.has(r.id)).length;
    return {
      name: skill.length > 12 ? skill.substring(0, 12) + "..." : skill,
      fullName: skill,
      total: resourcesWithSkill.length,
      assigned: assignedWithSkill,
      available: resourcesWithSkill.length - assignedWithSkill,
    };
  }).sort((a, b) => b.total - a.total);

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);

  const resourceAllocationList = activeResources
    .map(r => ({
      ...r,
      assignments: assignmentCountByResource[r.id] || 0,
      allocationPercent: Math.min(100, (assignmentCountByResource[r.id] || 0) * 20),
    }))
    .sort((a, b) => b.assignments - a.assignments);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Resource Allocation</h2>
          <p className="text-sm text-muted-foreground">View and analyze resource allocation across projects</p>
        </div>
        <DashboardActionBar title="Resource Allocation" dashboardType="resource-allocation" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search resources..."
              value={filters.searchQuery}
              onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
              className="pl-8 w-48 h-9"
              data-testid="input-search-resources"
            />
          </div>

          <Select
            value={filters.resourceId?.toString() || "all"}
            onValueChange={(value) => setFilters(prev => ({ ...prev, resourceId: value === "all" ? null : Number(value) }))}
          >
            <SelectTrigger className="w-48 h-9" data-testid="select-resource">
              <SelectValue placeholder="All Resources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Resources</SelectItem>
              {(resources || []).filter(r => r.isActive).map(r => (
                <SelectItem key={r.id} value={r.id.toString()}>{r.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.department || "all"}
            onValueChange={(value) => setFilters(prev => ({ ...prev, department: value === "all" ? null : value }))}
          >
            <SelectTrigger className="w-40 h-9" data-testid="select-department">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(dept => (
                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.skill || "all"}
            onValueChange={(value) => setFilters(prev => ({ ...prev, skill: value === "all" ? null : value }))}
          >
            <SelectTrigger className="w-40 h-9" data-testid="select-skill">
              <SelectValue placeholder="All Skills" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Skills</SelectItem>
              {allSkills.map(skill => (
                <SelectItem key={skill} value={skill}>{skill}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              data-testid="button-clear-filters"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 hover-elevate" data-testid="kpi-total-resources">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Users className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Resources</span>
          </div>
          <div className="text-2xl font-bold">{activeResources.length}</div>
          <div className="text-xs text-muted-foreground">{hasActiveFilters ? "filtered" : "active"}</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-assigned">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <Briefcase className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Assigned</span>
          </div>
          <div className="text-2xl font-bold">{resourcesWithAssignments}</div>
          <div className="text-xs text-muted-foreground">with tasks</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-available">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <PieChart className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Available</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{unassignedResources}</div>
          <div className="text-xs text-muted-foreground">no assignments</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-utilization">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-teal-500/10">
              <TrendingUp className="h-3.5 w-3.5 text-teal-500" />
            </div>
            <span className="text-xs text-muted-foreground">Utilization</span>
          </div>
          <div className="text-2xl font-bold">{activeResources.length > 0 ? Math.round((resourcesWithAssignments / activeResources.length) * 100) : 0}%</div>
          <Progress value={activeResources.length > 0 ? (resourcesWithAssignments / activeResources.length) * 100 : 0} className="h-1.5 mt-1" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card data-testid="chart-allocation-distribution">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PieChart className="h-4 w-4 text-muted-foreground" />
              Allocation Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie 
                    data={allocationDistribution} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={45} 
                    outerRadius={70} 
                    paddingAngle={3} 
                    dataKey="value"
                  >
                    {allocationDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-department-allocation">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              By Department
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentChartData} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" fontSize={10} tickLine={false} axisLine={false} width={55} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="assigned" stackId="a" fill={COLORS.Blue} name="Assigned" />
                  <Bar dataKey="available" stackId="a" fill={COLORS.Green} name="Available" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-skill-allocation">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              By Skill
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={skillAllocation}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false} angle={-45} textAnchor="end" height={50} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="assigned" stackId="a" fill={COLORS.Purple} name="Assigned" />
                  <Bar dataKey="available" stackId="a" fill={COLORS.Teal} name="Available" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="table-resource-allocation">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Resource Allocation Details</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <ScrollArea className="h-[320px]">
            <div className="space-y-2">
              {resourceAllocationList.map((resource) => (
                <div key={resource.id} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate" data-testid={`row-resource-${resource.id}`}>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{getInitials(resource.displayName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{resource.displayName}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{resource.department || "No department"}</span>
                      {resource.skills && (
                        <>
                          <span className="text-muted-foreground/50">|</span>
                          <span className="truncate">{resource.skills.split(",").slice(0, 2).join(", ")}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-medium">{resource.assignments}</div>
                      <div className="text-xs text-muted-foreground">tasks</div>
                    </div>
                    <Badge 
                      variant="secondary" 
                      className="text-[10px] h-5 min-w-[45px] justify-center" 
                      style={{ 
                        backgroundColor: `${resource.allocationPercent >= 80 ? COLORS.Red : resource.allocationPercent >= 50 ? COLORS.Yellow : COLORS.Green}15`, 
                        color: resource.allocationPercent >= 80 ? COLORS.Red : resource.allocationPercent >= 50 ? COLORS.Yellow : COLORS.Green
                      }}
                    >
                      {resource.allocationPercent}%
                    </Badge>
                    <div className="w-16">
                      <Progress value={resource.allocationPercent} className="h-1.5" />
                    </div>
                  </div>
                </div>
              ))}
              {resourceAllocationList.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No resources match filters</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
