import { useParams, Link, useLocation } from "wouter";
import { formatCurrency } from "@/lib/format";
import { useResource, useUpdateResource, useResourceSkills, useAddResourceSkill, useRemoveResourceSkill } from "@/hooks/use-resources";
import { useOrganization } from "@/hooks/use-organization";
import { useCustomFieldDefinitions, useResourceCustomFieldValues, useUpdateResourceCustomFieldValue } from "@/hooks/use-custom-fields";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
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
  Save,
  Plus,
  X,
  Wrench,
  Pencil,
  Check,
  ExternalLink
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import type { Resource, Task, Issue, Project, CustomFieldDefinition } from "@shared/schema";
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
  
  const { data: resourceSkills } = useResourceSkills(currentOrganization?.id ?? null, resource?.id ?? null);
  const addSkill = useAddResourceSkill();
  const removeSkill = useRemoveResourceSkill();
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillLevel, setNewSkillLevel] = useState("Intermediate");
  
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
        timesheetHidden: resource.timesheetHidden,
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
              {resource.userId && (
                <a
                  href={`/badges/${resource.userId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Public Profile
                  </Button>
                </a>
              )}
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
                        <p className="text-sm mt-1">{resource.hourlyRate ? `${formatCurrency(resource.hourlyRate, { showCents: true })}/hr` : "—"}</p>
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
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={isEditing ? (editValues.timesheetHidden ?? false) : (resource.timesheetHidden ?? false)}
                        onCheckedChange={isEditing ? (checked) => setEditValues(prev => ({ ...prev, timesheetHidden: checked })) : undefined}
                        disabled={!isEditing}
                        data-testid="switch-timesheet-hidden"
                      />
                      <Label>Hide from Timesheets</Label>
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
              {resource && currentOrganization?.id && (
                <ResourceCustomFieldsSection resourceId={resource.id} organizationId={currentOrganization.id} />
              )}
            </CardContent>
          </Card>
          
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Skills & Competencies</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                {resourceSkills?.map((skill) => (
                  <Badge key={skill.id} variant="secondary" className="gap-1 pr-1" data-testid={`badge-skill-${skill.id}`}>
                    {skill.skillName}
                    {skill.proficiencyLevel && (
                      <span className="text-xs text-muted-foreground ml-1">({skill.proficiencyLevel})</span>
                    )}
                    <span
                      role="button"
                      className="ml-1 cursor-pointer opacity-60 hover:opacity-100"
                      onClick={() => {
                        if (currentOrganization?.id) {
                          removeSkill.mutate(
                            { orgId: currentOrganization.id, id: skill.id },
                            {
                              onError: () => {
                                toast({ title: "Failed to remove skill", variant: "destructive" });
                              }
                            }
                          );
                        }
                      }}
                      data-testid={`button-remove-skill-${skill.id}`}
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </Badge>
                ))}
                {(!resourceSkills || resourceSkills.length === 0) && (
                  <p className="text-sm text-muted-foreground">No skills added yet</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  placeholder="Skill name..."
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  className="w-[180px]"
                  data-testid="input-new-skill-name"
                />
                <Select value={newSkillLevel} onValueChange={setNewSkillLevel}>
                  <SelectTrigger className="w-[140px]" data-testid="select-skill-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Beginner">Beginner</SelectItem>
                    <SelectItem value="Intermediate">Intermediate</SelectItem>
                    <SelectItem value="Advanced">Advanced</SelectItem>
                    <SelectItem value="Expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => {
                    if (newSkillName.trim() && currentOrganization?.id && resource?.id) {
                      addSkill.mutate(
                        {
                          orgId: currentOrganization.id,
                          resourceId: resource.id,
                          data: { skillName: newSkillName.trim(), proficiencyLevel: newSkillLevel }
                        },
                        {
                          onSuccess: () => {
                            toast({ title: "Skill added" });
                          },
                          onError: () => {
                            toast({ title: "Failed to add skill", variant: "destructive" });
                          }
                        }
                      );
                      setNewSkillName("");
                    }
                  }}
                  disabled={!newSkillName.trim() || addSkill.isPending}
                  data-testid="button-add-skill"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
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

function ResourceCustomFieldsSection({ resourceId, organizationId }: { resourceId: number; organizationId: number }) {
  const { toast } = useToast();
  const { data: allDefinitions = [], isLoading: definitionsLoading } = useCustomFieldDefinitions(organizationId);
  const definitions = useMemo(() => allDefinitions.filter(d => d.entityType === 'resource' && d.isActive !== false), [allDefinitions]);
  const { data: values = [], isLoading: valuesLoading } = useResourceCustomFieldValues(resourceId);
  const updateValue = useUpdateResourceCustomFieldValue();
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  if (definitionsLoading || valuesLoading) return null;
  if (definitions.length === 0) return null;

  const getFieldValue = (fieldId: number): string => {
    const val = values.find(v => v.fieldDefinitionId === fieldId);
    return val?.value || "";
  };

  const handleEdit = (field: CustomFieldDefinition) => {
    setEditingFieldId(field.id);
    setEditValue(getFieldValue(field.id));
  };

  const handleSave = async (fieldId: number) => {
    try {
      await updateValue.mutateAsync({
        resourceId,
        fieldDefinitionId: fieldId,
        value: editValue || null,
      });
      toast({ title: "Saved" });
    } catch {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
    setEditingFieldId(null);
  };

  const handleCancel = () => {
    setEditingFieldId(null);
    setEditValue("");
  };

  const parseMultiSelectValue = (value: string): string[] => {
    if (!value) return [];
    try {
      return JSON.parse(value);
    } catch {
      return value ? [value] : [];
    }
  };

  const toggleMultiSelectOption = (opt: string) => {
    const current = parseMultiSelectValue(editValue);
    const updated = current.includes(opt)
      ? current.filter(v => v !== opt)
      : [...current, opt];
    setEditValue(JSON.stringify(updated));
  };

  const renderFieldInput = (field: CustomFieldDefinition) => {
    switch (field.fieldType) {
      case "checkbox":
        return (
          <Checkbox
            checked={editValue === "true"}
            onCheckedChange={(checked) => setEditValue(checked ? "true" : "false")}
          />
        );
      case "select":
        return (
          <Select value={editValue} onValueChange={setEditValue}>
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {(field.options as string[] || []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "multiselect": {
        const selectedValues = parseMultiSelectValue(editValue);
        return (
          <div className="flex flex-wrap gap-1">
            {(field.options as string[] || []).map((opt) => (
              <Badge
                key={opt}
                variant={selectedValues.includes(opt) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleMultiSelectOption(opt)}
              >
                {opt}
              </Badge>
            ))}
          </div>
        );
      }
      case "date":
        return (
          <Input
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
          />
        );
      case "number":
        return (
          <Input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
          />
        );
      case "url":
        return (
          <Input
            type="url"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="https://..."
          />
        );
      default:
        return (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
          />
        );
    }
  };

  const renderFieldValue = (field: CustomFieldDefinition) => {
    const value = getFieldValue(field.id);
    if (!value) return <span className="text-muted-foreground text-sm">Not set</span>;

    switch (field.fieldType) {
      case "checkbox":
        return value === "true" ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground" />;
      case "url":
        return (
          <a href={value} target="_blank" rel="noopener noreferrer" className="underline text-sm flex items-center gap-1">
            {value.length > 30 ? value.substring(0, 30) + "..." : value}
            <ExternalLink className="h-3 w-3" />
          </a>
        );
      case "multiselect": {
        const selected = parseMultiSelectValue(value);
        return (
          <div className="flex flex-wrap gap-1">
            {selected.map((v) => (
              <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
            ))}
          </div>
        );
      }
      case "date":
        return <span className="text-sm">{format(new Date(value), 'MMM d, yyyy')}</span>;
      default:
        return <span className="text-sm">{value}</span>;
    }
  };

  return (
    <div className="mt-6 pt-4 border-t border-border">
      <div className="flex items-center gap-2 mb-3">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Custom Fields</Label>
        <Badge variant="secondary" className="text-[10px]">{definitions.length}</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        {definitions.map((field) => (
          <div key={field.id} className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              {field.name}
              {field.isRequired && <span className="text-destructive">*</span>}
            </Label>
            {editingFieldId === field.id ? (
              <div className="flex items-center gap-2">
                {renderFieldInput(field)}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSave(field.id)}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCancel}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                className="flex items-center justify-between p-1 rounded cursor-pointer hover:bg-muted min-h-[28px]"
                onClick={() => handleEdit(field)}
              >
                {renderFieldValue(field)}
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
