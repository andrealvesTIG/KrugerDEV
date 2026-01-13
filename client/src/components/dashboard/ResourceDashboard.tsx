import { useState, useMemo } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useResources } from "@/hooks/use-resources";
import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useQuery } from "@tanstack/react-query";
import { DashboardActionBar } from "./DashboardActionBar";
import { DashboardFilters, getDefaultFilters, type DashboardFilterState } from "./DashboardFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Loader2, Users, UserCheck, Briefcase, Activity, UserPlus, Building2 } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import type { TaskResourceAssignment, Resource } from "@shared/schema";

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
};

const DEPARTMENT_COLORS = [COLORS.Blue, COLORS.Purple, COLORS.Teal, COLORS.Pink, COLORS.Indigo, COLORS.Green, COLORS.Yellow, COLORS.Cyan];

export function ResourceDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: resources, isLoading: resourcesLoading } = useResources(currentOrganization?.id ?? null);
  const { data: projectsData, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios(currentOrganization?.id);
  const [filters, setFilters] = useState<DashboardFilterState>(getDefaultFilters());

  const { data: allAssignments = [], isLoading: assignmentsLoading } = useQuery<(TaskResourceAssignment & { resource: Resource })[]>({
    queryKey: ['/api/resource-assignments/all', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/resource-assignments?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  if (resourcesLoading || assignmentsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleExportCsv = () => {
    const headers = ["Name", "Email", "Title", "Department", "Skills", "Assignments", "Status"];
    const rows = (activeResources || []).map(r => [
      r.displayName,
      r.email || "",
      r.title || "",
      r.department || "",
      r.skills || "",
      assignmentCountByResource[r.id] || 0,
      (assignmentCountByResource[r.id] || 0) > 0 ? "Assigned" : "Available"
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resource_dashboard.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeResources = resources?.filter(r => r.isActive) || [];
  const inactiveResources = resources?.filter(r => !r.isActive) || [];
  const totalResources = activeResources.length;
  
  const assignmentCountByResource = allAssignments.reduce((acc, assignment) => {
    acc[assignment.resourceId] = (acc[assignment.resourceId] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const assignedResourceIds = new Set(allAssignments.map(a => a.resourceId));
  const resourcesWithAssignments = activeResources.filter(r => assignedResourceIds.has(r.id)).length;
  const unassignedResources = totalResources - resourcesWithAssignments;

  const avgAllocation = allAssignments.length > 0
    ? Math.round(allAssignments.reduce((sum, a) => sum + (a.allocationPercentage || 100), 0) / allAssignments.length)
    : 0;

  const utilizationRate = totalResources > 0 ? Math.round((resourcesWithAssignments / totalResources) * 100) : 0;

  const departmentData = activeResources.reduce((acc, resource) => {
    const dept = resource.department || "Unassigned";
    const existing = acc.find(d => d.name === dept);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: dept, value: 1 });
    }
    return acc;
  }, [] as { name: string; value: number }[]);

  const skillsData = activeResources.reduce((acc, resource) => {
    const skills = resource.skills?.split(",").map(s => s.trim()).filter(Boolean) || [];
    skills.forEach(skill => {
      const existing = acc.find(s => s.name === skill);
      if (existing) {
        existing.count += 1;
      } else {
        acc.push({ name: skill, count: 1 });
      }
    });
    return acc;
  }, [] as { name: string; count: number }[]).sort((a, b) => b.count - a.count).slice(0, 8);

  const allocationDistribution = [
    { name: "Available", value: unassignedResources, color: COLORS.Green },
    { name: "Light (1-2)", value: activeResources.filter(r => (assignmentCountByResource[r.id] || 0) >= 1 && (assignmentCountByResource[r.id] || 0) <= 2).length, color: COLORS.Blue },
    { name: "Moderate (3-5)", value: activeResources.filter(r => (assignmentCountByResource[r.id] || 0) >= 3 && (assignmentCountByResource[r.id] || 0) <= 5).length, color: COLORS.Yellow },
    { name: "Heavy (6+)", value: activeResources.filter(r => (assignmentCountByResource[r.id] || 0) >= 6).length, color: COLORS.Red },
  ].filter(d => d.value > 0);

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);

  const topAssigned = activeResources
    .map(r => ({ ...r, assignments: assignmentCountByResource[r.id] || 0 }))
    .filter(r => r.assignments > 0)
    .sort((a, b) => b.assignments - a.assignments)
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Resource Overview</h2>
          <p className="text-sm text-muted-foreground">Team capacity, utilization, and skill distribution.</p>
        </div>
        <DashboardActionBar title="Resource Dashboard" dashboardType="resource" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
      </div>

      <DashboardFilters
        portfolios={portfolios || []}
        projects={projectsData || []}
        resources={resources || []}
        filters={filters}
        onFiltersChange={setFilters}
        showHealth={false}
        showPriority={false}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3 hover-elevate" data-testid="kpi-total-resources">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Users className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total</span>
          </div>
          <div className="text-2xl font-bold">{totalResources}</div>
          <div className="text-xs text-muted-foreground">{inactiveResources.length} inactive</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-assigned">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Assigned</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{resourcesWithAssignments}</div>
          <div className="text-xs text-muted-foreground">on tasks</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-available">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <UserPlus className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Available</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{unassignedResources}</div>
          <div className="text-xs text-muted-foreground">for work</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-utilization">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <Activity className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Utilization</span>
          </div>
          <div className="text-2xl font-bold">{utilizationRate}%</div>
          <Progress value={utilizationRate} className="h-1.5 mt-1" />
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-avg-allocation">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-cyan-500/10">
              <Briefcase className="h-3.5 w-3.5 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Avg Allocation</span>
          </div>
          <div className="text-2xl font-bold">{avgAllocation}%</div>
          <div className="text-xs text-muted-foreground">per assignment</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-departments">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-indigo-500/10">
              <Building2 className="h-3.5 w-3.5 text-indigo-500" />
            </div>
            <span className="text-xs text-muted-foreground">Departments</span>
          </div>
          <div className="text-2xl font-bold">{departmentData.length}</div>
          <div className="text-xs text-muted-foreground">teams</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card data-testid="chart-by-department">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              By Department
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={departmentData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                    {departmentData.map((_, i) => <Cell key={i} fill={DEPARTMENT_COLORS[i % DEPARTMENT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-workload-distribution">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Workload Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocationDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                    {allocationDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-top-skills">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              Top Skills
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={skillsData} layout="vertical">
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" fontSize={10} tickLine={false} axisLine={false} width={80} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="card-active-resources">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-emerald-500" />
              Most Active Resources
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[240px]">
              <div className="space-y-2">
                {topAssigned.map((resource) => (
                  <div key={resource.id} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate" data-testid={`resource-${resource.id}`}>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">{getInitials(resource.displayName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{resource.displayName}</div>
                      <div className="text-xs text-muted-foreground truncate">{resource.title || resource.department || "No title"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] h-5">{resource.assignments} tasks</Badge>
                      <div className="w-16">
                        <Progress value={Math.min(100, (resource.assignments / 8) * 100)} className="h-1.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card data-testid="card-available-resources">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-amber-500" />
              Available Resources
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[240px]">
              <div className="space-y-2">
                {activeResources.filter(r => !assignedResourceIds.has(r.id)).slice(0, 8).map((resource) => (
                  <div key={resource.id} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate" data-testid={`available-${resource.id}`}>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">{getInitials(resource.displayName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{resource.displayName}</div>
                      <div className="text-xs text-muted-foreground truncate">{resource.department || "No department"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {resource.skills && (
                        <div className="flex gap-1">
                          {resource.skills.split(",").slice(0, 2).map((skill, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] h-5">{skill.trim()}</Badge>
                          ))}
                        </div>
                      )}
                      <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-500/10 text-emerald-600">Available</Badge>
                    </div>
                  </div>
                ))}
                {activeResources.filter(r => !assignedResourceIds.has(r.id)).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">All resources are assigned</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
