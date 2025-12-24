import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useProjects, useDeleteProject } from "@/hooks/use-projects";
import { useAllIssues, useDeleteIssue } from "@/hooks/use-issues";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Trash2, Shield, FolderKanban, AlertTriangle, CircleDot, Users, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { Risk } from "@shared/schema";

export default function Admin() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  if (authLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isAdmin = user?.role === "admin";

  if (!isAdmin) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-16 w-16 text-slate-300" />
        <h2 className="text-2xl font-bold text-slate-700">Access Denied</h2>
        <p className="text-slate-500">You need administrator privileges to access this page.</p>
        <Badge variant="outline" className="text-sm">
          Current role: {user?.role || "user"}
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Admin Panel</h1>
          <p className="text-slate-500">Manage projects, resources, risks, and issues</p>
        </div>
      </div>

      <Tabs defaultValue="projects" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="projects" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2">
            <FolderKanban className="h-4 w-4" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="resources" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2">
            <Users className="h-4 w-4" />
            Resources
          </TabsTrigger>
          <TabsTrigger value="risks" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2">
            <AlertTriangle className="h-4 w-4" />
            Risks
          </TabsTrigger>
          <TabsTrigger value="issues" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2">
            <CircleDot className="h-4 w-4" />
            Issues
          </TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="projects">
            <ProjectsAdminTab />
          </TabsContent>
          <TabsContent value="resources">
            <ResourcesAdminTab />
          </TabsContent>
          <TabsContent value="risks">
            <RisksAdminTab />
          </TabsContent>
          <TabsContent value="issues">
            <IssuesAdminTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function ProjectsAdminTab() {
  const { data: projects, isLoading } = useProjects();
  const deleteProject = useDeleteProject();
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const handleDelete = () => {
    if (deleteId) {
      deleteProject.mutate(deleteId, {
        onSuccess: () => {
          toast({ title: "Deleted", description: "Project deleted successfully" });
          setDeleteId(null);
        }
      });
    }
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Projects</CardTitle>
        <CardDescription>Manage all projects in the system</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects?.map(project => (
              <TableRow key={project.id} data-testid={`admin-project-${project.id}`}>
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{project.status}</Badge>
                </TableCell>
                <TableCell>
                  <Badge className={cn(
                    project.health === 'Green' ? "bg-emerald-100 text-emerald-800" :
                    project.health === 'Yellow' ? "bg-amber-100 text-amber-800" :
                    "bg-rose-100 text-rose-800"
                  )}>{project.health}</Badge>
                </TableCell>
                <TableCell>{project.priority}</TableCell>
                <TableCell>${Number(project.budget).toLocaleString()}</TableCell>
                <TableCell>{project.completionPercentage}%</TableCell>
                <TableCell>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setDeleteId(project.id)}
                    data-testid={`button-delete-admin-project-${project.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {projects?.length === 0 && (
          <div className="text-center py-8 text-slate-500">No projects found.</div>
        )}
      </CardContent>

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this project? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ResourcesAdminTab() {
  const { data: users, isLoading } = useQuery<any[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const res = await fetch('/api/users');
      if (!res.ok) return [];
      return res.json();
    }
  });

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Resources</CardTitle>
        <CardDescription>View all users and their roles</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map(user => (
              <TableRow key={user.id} data-testid={`admin-user-${user.id}`}>
                <TableCell className="font-medium">
                  {user.firstName} {user.lastName}
                </TableCell>
                <TableCell>{user.email || 'N/A'}</TableCell>
                <TableCell>
                  <Badge variant={user.role === 'admin' ? 'default' : 'outline'}>
                    {user.role || 'user'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy') : 'N/A'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {(!users || users.length === 0) && (
          <div className="text-center py-8 text-slate-500">No users found.</div>
        )}
      </CardContent>
    </Card>
  );
}

function RisksAdminTab() {
  const { data: projects } = useProjects();
  const [allRisks, setAllRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);

  useState(() => {
    if (projects) {
      Promise.all(
        projects.map(p => 
          fetch(`/api/projects/${p.id}/risks`).then(r => r.json())
        )
      ).then(results => {
        const risks = results.flat();
        setAllRisks(risks);
        setLoading(false);
      });
    }
  });

  const { data: risks, isLoading } = useQuery<Risk[]>({
    queryKey: ['/api/all-risks'],
    queryFn: async () => {
      if (!projects) return [];
      const results = await Promise.all(
        projects.map(p => 
          fetch(`/api/projects/${p.id}/risks`).then(r => r.json())
        )
      );
      return results.flat();
    },
    enabled: !!projects
  });

  const getProjectName = (projectId: number) => {
    return projects?.find(p => p.id === projectId)?.name || "Unknown";
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Risks</CardTitle>
        <CardDescription>View risks across all projects</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Probability</TableHead>
              <TableHead>Impact</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {risks?.map(risk => (
              <TableRow key={risk.id} data-testid={`admin-risk-${risk.id}`}>
                <TableCell className="font-medium">{risk.title}</TableCell>
                <TableCell>{getProjectName(risk.projectId)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(
                    risk.probability === 'High' ? "bg-red-50 text-red-700" : "bg-slate-50"
                  )}>{risk.probability}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(
                    risk.impact === 'High' ? "bg-red-50 text-red-700" : "bg-slate-50"
                  )}>{risk.impact}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{risk.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {(!risks || risks.length === 0) && (
          <div className="text-center py-8 text-slate-500">No risks recorded.</div>
        )}
      </CardContent>
    </Card>
  );
}

function IssuesAdminTab() {
  const { data: issues, isLoading } = useAllIssues();
  const { data: projects } = useProjects();
  const deleteIssue = useDeleteIssue();
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<{ id: number; projectId: number } | null>(null);

  const getProjectName = (projectId: number) => {
    return projects?.find(p => p.id === projectId)?.name || "Unknown";
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteIssue.mutate(deleteId, {
        onSuccess: () => {
          toast({ title: "Deleted", description: "Issue deleted successfully" });
          setDeleteId(null);
        }
      });
    }
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  const priorityColors: Record<string, string> = {
    Low: "bg-slate-100 text-slate-700",
    Medium: "bg-blue-100 text-blue-700",
    High: "bg-amber-100 text-amber-700",
    Critical: "bg-rose-100 text-rose-700",
  };

  const statusColors: Record<string, string> = {
    Open: "bg-red-100 text-red-700",
    "In Progress": "bg-blue-100 text-blue-700",
    Resolved: "bg-emerald-100 text-emerald-700",
    Closed: "bg-slate-100 text-slate-700",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Issues</CardTitle>
        <CardDescription>Manage issues across all projects</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues?.map(issue => (
              <TableRow key={issue.id} data-testid={`admin-issue-${issue.id}`}>
                <TableCell className="font-medium">{issue.title}</TableCell>
                <TableCell>{getProjectName(issue.projectId)}</TableCell>
                <TableCell>{issue.type}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={priorityColors[issue.priority || 'Medium']}>
                    {issue.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusColors[issue.status || 'Open']}>
                    {issue.status}
                  </Badge>
                </TableCell>
                <TableCell>{issue.assignee || 'Unassigned'}</TableCell>
                <TableCell>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setDeleteId({ id: issue.id, projectId: issue.projectId })}
                    data-testid={`button-delete-admin-issue-${issue.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {(!issues || issues.length === 0) && (
          <div className="text-center py-8 text-slate-500">No issues found.</div>
        )}
      </CardContent>

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this issue? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
