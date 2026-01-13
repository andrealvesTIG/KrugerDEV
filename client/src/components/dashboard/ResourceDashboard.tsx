import { useOrganization } from "@/hooks/use-organization";
import { useResources } from "@/hooks/use-resources";
import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "./KpiCard";
import { DashboardChartCard } from "./DashboardChartCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Users, UserCheck, Briefcase, Activity } from "lucide-react";
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
};

const DEPARTMENT_COLORS = [COLORS.Blue, COLORS.Purple, COLORS.Teal, COLORS.Pink, COLORS.Indigo, COLORS.Green, COLORS.Yellow];

export function ResourceDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: resources, isLoading: resourcesLoading } = useResources(currentOrganization?.id ?? null);

  const { data: allAssignments, isLoading: assignmentsLoading } = useQuery<(TaskResourceAssignment & { resource: Resource })[]>({
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
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeResources = resources?.filter(r => r.isActive) || [];
  const totalResources = activeResources.length;
  const assignments = allAssignments || [];
  
  const assignedResourceIds = new Set(assignments.map(a => a.resourceId));
  const resourcesWithAssignments = activeResources.filter(r => assignedResourceIds.has(r.id)).length;
  const unassignedResources = totalResources - resourcesWithAssignments;

  const avgAllocation = assignments.length > 0
    ? Math.round(assignments.reduce((sum, a) => sum + (a.allocationPercentage || 100), 0) / assignments.length)
    : 0;

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

  const assignmentCountByResource = assignments.reduce((acc, assignment) => {
    acc[assignment.resourceId] = (acc[assignment.resourceId] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const allocationDistribution = [
    { name: "Not Assigned", value: unassignedResources, color: COLORS.Red },
    { name: "Light (1-2)", value: activeResources.filter(r => (assignmentCountByResource[r.id] || 0) >= 1 && (assignmentCountByResource[r.id] || 0) <= 2).length, color: COLORS.Green },
    { name: "Moderate (3-5)", value: activeResources.filter(r => (assignmentCountByResource[r.id] || 0) >= 3 && (assignmentCountByResource[r.id] || 0) <= 5).length, color: COLORS.Yellow },
    { name: "Heavy (6+)", value: activeResources.filter(r => (assignmentCountByResource[r.id] || 0) >= 6).length, color: COLORS.Red },
  ].filter(d => d.value > 0);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Resources"
          value={totalResources}
          subtitle="Active team members"
          icon={Users}
          iconColor="text-blue-500"
          borderColor="border-l-blue-500"
          href="/resources"
          testId="kpi-total-resources"
        />
        <KpiCard
          title="Assigned"
          value={resourcesWithAssignments}
          subtitle="Currently on tasks"
          icon={UserCheck}
          iconColor="text-emerald-500"
          borderColor="border-l-emerald-500"
          delay={0.2}
          testId="kpi-assigned-resources"
        />
        <KpiCard
          title="Unassigned"
          value={unassignedResources}
          subtitle="Available for work"
          icon={Briefcase}
          iconColor="text-amber-500"
          borderColor="border-l-amber-500"
          delay={0.3}
          testId="kpi-unassigned-resources"
        />
        <KpiCard
          title="Avg Allocation"
          value={`${avgAllocation}%`}
          subtitle="Per assignment"
          icon={Activity}
          iconColor="text-purple-500"
          borderColor="border-l-purple-500"
          delay={0.4}
          testId="kpi-avg-allocation"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <DashboardChartCard
          title="Resources by Department"
          description="Team distribution across departments"
          testId="chart-resources-department"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={departmentData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {departmentData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard
          title="Workload Distribution"
          description="Number of task assignments per resource"
          testId="chart-workload-distribution"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={allocationDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {allocationDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard
          title="Top Skills"
          description="Most common skills in your team"
          testId="chart-top-skills"
          className="md:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={skillsData} layout="vertical">
              <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis dataKey="name" type="category" fontSize={12} tickLine={false} axisLine={false} width={120} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardChartCard>
      </div>

      <Card data-testid="card-resource-roster">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Resource Roster
          </CardTitle>
          <CardDescription>Overview of all active team members</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[350px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Assignments</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeResources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No resources found
                    </TableCell>
                  </TableRow>
                ) : (
                  activeResources.slice(0, 15).map((resource) => (
                    <TableRow key={resource.id} data-testid={`row-resource-${resource.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {getInitials(resource.displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{resource.displayName}</div>
                            {resource.email && (
                              <div className="text-xs text-muted-foreground">{resource.email}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{resource.title || "-"}</TableCell>
                      <TableCell>{resource.department || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {assignmentCountByResource[resource.id] || 0} tasks
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={assignmentCountByResource[resource.id] > 0 ? "default" : "outline"}
                        >
                          {assignmentCountByResource[resource.id] > 0 ? "Assigned" : "Available"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
