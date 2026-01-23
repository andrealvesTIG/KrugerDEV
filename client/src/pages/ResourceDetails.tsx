import { useParams, Link, useLocation } from "wouter";
import { useResource, useUpdateResource } from "@/hooks/use-resources";
import { useOrganization } from "@/hooks/use-organization";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  Briefcase, 
  Building2, 
  MapPin, 
  DollarSign, 
  Clock, 
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User as UserIcon,
  ClipboardList,
  PieChart,
  FolderKanban,
  Save
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Resource, Task, Issue, Project } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ResourceAssignment = {
  taskId: number;
  taskName: string;
  projectId: number;
  projectName: string;
  status: string;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  allocationPercentage: number | null;
};

type ResourceIssueAssignment = {
  issueId: number;
  issueTitle: string;
  projectId: number;
  projectName: string;
  status: string;
  priority: string;
  dueDate: string | null;
};

type ResourceAllocation = {
  projectId: number;
  projectName: string;
  taskCount: number;
  totalHours: number;
  completedTasks: number;
};

export default function ResourceDetails() {
  const params = useParams();
  const resourceId = params.id ? parseInt(params.id) : null;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  
  const { data: resource, isLoading: resourceLoading } = useResource(resourceId);
  const updateResource = useUpdateResource();
  
  const [activeTab, setActiveTab] = useState("details");
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<Partial<Resource>>({});
  
  const { data: taskAssignments, isLoading: assignmentsLoading } = useQuery<ResourceAssignment[]>({
    queryKey: ["/api/resources", resourceId, "task-assignments"],
    enabled: !!resourceId,
    queryFn: async () => {
      const response = await fetch(`/api/resources/${resourceId}/task-assignments`);
      if (!response.ok) throw new Error("Failed to fetch task assignments");
      return response.json();
    },
  });
  
  const { data: issueAssignments, isLoading: issuesLoading } = useQuery<ResourceIssueAssignment[]>({
    queryKey: ["/api/resources", resourceId, "issue-assignments"],
    enabled: !!resourceId,
    queryFn: async () => {
      const response = await fetch(`/api/resources/${resourceId}/issue-assignments`);
      if (!response.ok) throw new Error("Failed to fetch issue assignments");
      return response.json();
    },
  });
  
  useEffect(() => {
    if (resource) {
      setEditValues({
        displayName: resource.displayName,
        email: resource.email,
        phone: resource.phone,
        title: resource.title,
        department: resource.department,
        location: resource.location,
        skills: resource.skills,
        hourlyRate: resource.hourlyRate,
        weeklyCapacity: resource.weeklyCapacity,
        availability: resource.availability,
        isActive: resource.isActive,
        isBillable: resource.isBillable,
        notes: resource.notes,
      });
    }
  }, [resource]);
  
  const handleSave = async () => {
    if (!resourceId) return;
    try {
      await updateResource.mutateAsync({ id: resourceId, updates: editValues });
      toast({ title: "Resource updated successfully" });
      setIsEditing(false);
    } catch (error) {
      toast({ title: "Error", description: "Failed to update resource", variant: "destructive" });
    }
  };
  
  // Deduplicate task assignments by task name + project name combination
  const uniqueTaskAssignments = taskAssignments?.reduce((acc, assignment) => {
    const key = `${assignment.taskName}-${assignment.projectName}`;
    if (!acc.some(a => `${a.taskName}-${a.projectName}` === key)) {
      acc.push(assignment);
    }
    return acc;
  }, [] as ResourceAssignment[]) || [];
  
  // Deduplicate allocations by project name (since same project may have been imported multiple times)
  const allocations: ResourceAllocation[] = uniqueTaskAssignments.reduce((acc, assignment) => {
    const existing = acc.find(a => a.projectName === assignment.projectName);
    if (existing) {
      existing.taskCount++;
      if (assignment.status === "Completed") existing.completedTasks++;
    } else {
      acc.push({
        projectId: assignment.projectId,
        projectName: assignment.projectName,
        taskCount: 1,
        totalHours: 0,
        completedTasks: assignment.status === "Completed" ? 1 : 0,
      });
    }
    return acc;
  }, [] as ResourceAllocation[]);
  
  const stats = {
    totalTasks: uniqueTaskAssignments.length,
    completedTasks: uniqueTaskAssignments.filter(t => t.status === "Completed").length,
    inProgressTasks: uniqueTaskAssignments.filter(t => t.status === "In Progress").length,
    totalIssues: issueAssignments?.length || 0,
    openIssues: issueAssignments?.filter(i => i.status !== "Closed" && i.status !== "Resolved").length || 0,
    projectsCount: allocations.length,
    totalAllocatedHours: allocations.reduce((sum, a) => sum + a.totalHours, 0),
  };
  
  if (resourceLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!resource) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Resource not found</p>
            <Button variant="outline" className="mt-4" onClick={() => setLocation("/resources")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Resources
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/resources">
          <Button variant="ghost" size="sm" data-testid="button-back-to-resources">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Resources
          </Button>
        </Link>
      </div>
      
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={resource.photoUrl || undefined} />
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {getInitials(resource.displayName)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold" data-testid="text-resource-name">{resource.displayName}</h1>
                <Badge variant={resource.isActive ? "default" : "secondary"} data-testid="badge-resource-status">
                  {resource.isActive ? "Active" : "Inactive"}
                </Badge>
                {resource.isBillable && (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Billable
                  </Badge>
                )}
              </div>
              
              {resource.title && (
                <p className="text-lg text-muted-foreground" data-testid="text-resource-title">
                  {resource.title}
                </p>
              )}
              
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2">
                {resource.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    <a href={`mailto:${resource.email}`} className="hover:underline" data-testid="text-resource-email">
                      {resource.email}
                    </a>
                  </div>
                )}
                {resource.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    <span data-testid="text-resource-phone">{resource.phone}</span>
                  </div>
                )}
                {resource.department && (
                  <div className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    <span data-testid="text-resource-department">{resource.department}</span>
                  </div>
                )}
                {resource.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span data-testid="text-resource-location">{resource.location}</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button variant="outline" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={updateResource.isPending} data-testid="button-save-resource">
                    {updateResource.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Save
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setIsEditing(true)} data-testid="button-edit-resource">
                  Edit
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5" data-testid="tabs-resource-details">
          <TabsTrigger value="details" className="gap-2">
            <UserIcon className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Assignments
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <PieChart className="h-4 w-4" />
            Stats
          </TabsTrigger>
          <TabsTrigger value="allocations" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            Allocations
          </TabsTrigger>
          <TabsTrigger value="issues" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Issues
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="details" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Resource Information</CardTitle>
              <CardDescription>View and edit resource details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label>Display Name</Label>
                    {isEditing ? (
                      <Input 
                        value={editValues.displayName || ""} 
                        onChange={e => setEditValues(prev => ({ ...prev, displayName: e.target.value }))}
                        data-testid="input-display-name"
                      />
                    ) : (
                      <p className="text-sm mt-1">{resource.displayName}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label>Email</Label>
                    {isEditing ? (
                      <Input 
                        type="email"
                        value={editValues.email || ""} 
                        onChange={e => setEditValues(prev => ({ ...prev, email: e.target.value }))}
                        data-testid="input-email"
                      />
                    ) : (
                      <p className="text-sm mt-1">{resource.email || "—"}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label>Phone</Label>
                    {isEditing ? (
                      <Input 
                        value={editValues.phone || ""} 
                        onChange={e => setEditValues(prev => ({ ...prev, phone: e.target.value }))}
                        data-testid="input-phone"
                      />
                    ) : (
                      <p className="text-sm mt-1">{resource.phone || "—"}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label>Title</Label>
                    {isEditing ? (
                      <Input 
                        value={editValues.title || ""} 
                        onChange={e => setEditValues(prev => ({ ...prev, title: e.target.value }))}
                        data-testid="input-title"
                      />
                    ) : (
                      <p className="text-sm mt-1">{resource.title || "—"}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label>Department</Label>
                    {isEditing ? (
                      <Input 
                        value={editValues.department || ""} 
                        onChange={e => setEditValues(prev => ({ ...prev, department: e.target.value }))}
                        data-testid="input-department"
                      />
                    ) : (
                      <p className="text-sm mt-1">{resource.department || "—"}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label>Location</Label>
                    {isEditing ? (
                      <Input 
                        value={editValues.location || ""} 
                        onChange={e => setEditValues(prev => ({ ...prev, location: e.target.value }))}
                        data-testid="input-location"
                      />
                    ) : (
                      <p className="text-sm mt-1">{resource.location || "—"}</p>
                    )}
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <Label>Skills</Label>
                    {isEditing ? (
                      <Textarea 
                        value={editValues.skills || ""} 
                        onChange={e => setEditValues(prev => ({ ...prev, skills: e.target.value }))}
                        placeholder="Comma-separated skills"
                        data-testid="input-skills"
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {resource.skills ? (
                          resource.skills.split(",").map((skill, i) => (
                            <Badge key={i} variant="secondary">{skill.trim()}</Badge>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Hourly Rate</Label>
                      {isEditing ? (
                        <Input 
                          type="number"
                          value={editValues.hourlyRate || ""} 
                          onChange={e => setEditValues(prev => ({ ...prev, hourlyRate: e.target.value }))}
                          data-testid="input-hourly-rate"
                        />
                      ) : (
                        <p className="text-sm mt-1">{resource.hourlyRate ? `$${resource.hourlyRate}/hr` : "—"}</p>
                      )}
                    </div>
                    
                    <div>
                      <Label>Weekly Capacity</Label>
                      {isEditing ? (
                        <Input 
                          type="number"
                          value={editValues.weeklyCapacity || ""} 
                          onChange={e => setEditValues(prev => ({ ...prev, weeklyCapacity: e.target.value }))}
                          data-testid="input-weekly-capacity"
                        />
                      ) : (
                        <p className="text-sm mt-1">{resource.weeklyCapacity ? `${resource.weeklyCapacity} hrs/week` : "40 hrs/week"}</p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <Label>Availability</Label>
                    {isEditing ? (
                      <Input 
                        type="number"
                        min="0"
                        max="100"
                        value={editValues.availability ?? 100} 
                        onChange={e => setEditValues(prev => ({ ...prev, availability: parseInt(e.target.value) }))}
                        data-testid="input-availability"
                      />
                    ) : (
                      <div className="mt-1">
                        <div className="flex items-center gap-2">
                          <Progress value={resource.availability ?? 100} className="h-2 flex-1" />
                          <span className="text-sm">{resource.availability ?? 100}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={isEditing ? (editValues.isActive ?? true) : (resource.isActive ?? true)}
                        onCheckedChange={isEditing ? (checked) => setEditValues(prev => ({ ...prev, isActive: checked })) : undefined}
                        disabled={!isEditing}
                        data-testid="switch-is-active"
                      />
                      <Label>Active</Label>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={isEditing ? (editValues.isBillable ?? true) : (resource.isBillable ?? true)}
                        onCheckedChange={isEditing ? (checked) => setEditValues(prev => ({ ...prev, isBillable: checked })) : undefined}
                        disabled={!isEditing}
                        data-testid="switch-is-billable"
                      />
                      <Label>Billable</Label>
                    </div>
                  </div>
                  
                  <div>
                    <Label>Notes</Label>
                    {isEditing ? (
                      <Textarea 
                        value={editValues.notes || ""} 
                        onChange={e => setEditValues(prev => ({ ...prev, notes: e.target.value }))}
                        data-testid="input-notes"
                      />
                    ) : (
                      <p className="text-sm mt-1 text-muted-foreground">{resource.notes || "No notes"}</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="assignments" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Task Assignments</CardTitle>
              <CardDescription>Tasks assigned to this resource</CardDescription>
            </CardHeader>
            <CardContent>
              {assignmentsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : uniqueTaskAssignments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Allocation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uniqueTaskAssignments.map((assignment) => (
                      <TableRow key={assignment.taskId} data-testid={`row-assignment-${assignment.taskId}`}>
                        <TableCell className="font-medium">{assignment.taskName}</TableCell>
                        <TableCell>
                          <Link href={`/projects/${assignment.projectId}`}>
                            <span className="text-primary hover:underline cursor-pointer">{assignment.projectName}</span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={assignment.status === "Completed" ? "default" : assignment.status === "In Progress" ? "secondary" : "outline"}>
                            {assignment.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={assignment.progress} className="h-2 w-16" />
                            <span className="text-xs text-muted-foreground">{assignment.progress}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {assignment.endDate ? format(new Date(assignment.endDate), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-right">{assignment.allocationPercentage ? `${assignment.allocationPercentage}%` : "100%"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No task assignments</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="stats" className="mt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <ClipboardList className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="stat-total-tasks">{stats.totalTasks}</p>
                    <p className="text-xs text-muted-foreground">Total Tasks</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="stat-completed-tasks">{stats.completedTasks}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="stat-in-progress">{stats.inProgressTasks}</p>
                    <p className="text-xs text-muted-foreground">In Progress</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <FolderKanban className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="stat-projects">{stats.projectsCount}</p>
                    <p className="text-xs text-muted-foreground">Projects</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="stat-open-issues">{stats.openIssues}</p>
                    <p className="text-xs text-muted-foreground">Open Issues</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                    <DollarSign className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="stat-allocated-hours">{stats.totalAllocatedHours}</p>
                    <p className="text-xs text-muted-foreground">Allocated Hours</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Task Completion Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Overall Progress</span>
                  <span>{stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%</span>
                </div>
                <Progress 
                  value={stats.totalTasks > 0 ? (stats.completedTasks / stats.totalTasks) * 100 : 0} 
                  className="h-3"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="allocations" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Project Allocations</CardTitle>
              <CardDescription>Projects this resource is assigned to</CardDescription>
            </CardHeader>
            <CardContent>
              {allocations.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-center">Tasks</TableHead>
                      <TableHead className="text-center">Completed</TableHead>
                      <TableHead className="text-center">Progress</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((allocation) => (
                      <TableRow key={allocation.projectId} data-testid={`row-allocation-${allocation.projectId}`}>
                        <TableCell>
                          <Link href={`/projects/${allocation.projectId}`}>
                            <span className="text-primary hover:underline cursor-pointer font-medium">
                              {allocation.projectName}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-center">{allocation.taskCount}</TableCell>
                        <TableCell className="text-center">{allocation.completedTasks}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Progress 
                              value={allocation.taskCount > 0 ? (allocation.completedTasks / allocation.taskCount) * 100 : 0} 
                              className="h-2 w-16" 
                            />
                            <span className="text-xs text-muted-foreground">
                              {allocation.taskCount > 0 ? Math.round((allocation.completedTasks / allocation.taskCount) * 100) : 0}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{allocation.totalHours || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <FolderKanban className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No project allocations</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="issues" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Assigned Issues</CardTitle>
              <CardDescription>Issues assigned to this resource</CardDescription>
            </CardHeader>
            <CardContent>
              {issuesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : issueAssignments && issueAssignments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Due Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issueAssignments.map((issue) => (
                      <TableRow key={issue.issueId} data-testid={`row-issue-${issue.issueId}`}>
                        <TableCell className="font-medium">{issue.issueTitle}</TableCell>
                        <TableCell>
                          <Link href={`/projects/${issue.projectId}`}>
                            <span className="text-primary hover:underline cursor-pointer">{issue.projectName}</span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={issue.status === "Closed" || issue.status === "Resolved" ? "default" : "secondary"}>
                            {issue.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={issue.priority === "High" || issue.priority === "Critical" ? "destructive" : "outline"}>
                            {issue.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {issue.dueDate ? format(new Date(issue.dueDate), "MMM d, yyyy") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No assigned issues</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
