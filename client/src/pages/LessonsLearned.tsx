import { useState } from "react";
import { useAllLessonsLearned, useUpdateLessonLearned, useDeleteLessonLearned } from "@/hooks/use-lessons-learned";
import { useOrganization } from "@/hooks/use-organization";
import { useProjects } from "@/hooks/use-projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pencil, Trash2, Search, Filter, Lightbulb, X } from "lucide-react";
import { format } from "date-fns";
import type { LessonLearned } from "@shared/schema";

export default function LessonsLearned() {
  const { currentOrganization } = useOrganization();
  const { data: lessons, isLoading } = useAllLessonsLearned(currentOrganization?.id);
  const { data: projects } = useProjects();
  const updateLesson = useUpdateLessonLearned();
  const deleteLesson = useDeleteLessonLearned();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Process',
    lessonType: 'Positive',
    impact: 'Medium',
    phase: '',
    rootCause: '',
    recommendations: '',
    status: 'Draft'
  });

  const handleUpdate = async (lesson: LessonLearned) => {
    if (!editingId) return;
    try {
      await updateLesson.mutateAsync({
        id: editingId,
        projectId: lesson.projectId,
        organizationId: lesson.organizationId ?? undefined,
        data: {
          title: form.title,
          description: form.description,
          category: form.category,
          lessonType: form.lessonType,
          impact: form.impact,
          phase: form.phase || null,
          rootCause: form.rootCause || null,
          recommendation: form.recommendations || null,
          status: form.status
        }
      });
      toast({ title: "Lesson learned updated" });
      setEditingId(null);
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to update lesson learned", variant: "destructive" });
    }
  };

  const handleDelete = async (lesson: LessonLearned) => {
    try {
      await deleteLesson.mutateAsync({ id: lesson.id, projectId: lesson.projectId, organizationId: lesson.organizationId ?? undefined });
      toast({ title: "Lesson learned deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete lesson learned", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      category: 'Process',
      lessonType: 'Positive',
      impact: 'Medium',
      phase: '',
      rootCause: '',
      recommendations: '',
      status: 'Draft'
    });
  };

  const startEdit = (l: LessonLearned) => {
    setEditingId(l.id);
    setForm({
      title: l.title,
      description: l.description || '',
      category: l.category || 'Process',
      lessonType: l.lessonType || 'Positive',
      impact: l.impact || 'Medium',
      phase: l.phase || '',
      rootCause: l.rootCause || '',
      recommendations: l.recommendation || '',
      status: l.status || 'Draft'
    });
  };

  const getProjectName = (projectId: number) => {
    const project = projects?.find(p => p.id === projectId);
    return project?.name || 'Unknown Project';
  };

  const getTypeColor = (type: string) => {
    return type === 'Positive' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Under Review': return 'bg-yellow-100 text-yellow-800';
      case 'Archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'High': return 'bg-red-100 text-red-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredLessons = lessons?.filter(l => {
    const matchesSearch = searchTerm === "" || 
      l.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.description && l.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = filterCategory === "all" || l.category === filterCategory;
    const matchesType = filterType === "all" || l.lessonType === filterType;
    const matchesStatus = filterStatus === "all" || l.status === filterStatus;
    const matchesProject = filterProject === "all" || l.projectId.toString() === filterProject;
    return matchesSearch && matchesCategory && matchesType && matchesStatus && matchesProject;
  });

  const clearFilters = () => {
    setSearchTerm("");
    setFilterCategory("all");
    setFilterType("all");
    setFilterStatus("all");
    setFilterProject("all");
  };

  const hasActiveFilters = searchTerm !== "" || filterCategory !== "all" || filterType !== "all" || filterStatus !== "all" || filterProject !== "all";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Lessons Learned</h1>
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredLessons?.length || 0} lessons across all projects
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search lessons..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-lessons"
              />
            </div>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-project">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects?.map(p => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[150px]" data-testid="select-filter-category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Process">Process</SelectItem>
                <SelectItem value="Technical">Technical</SelectItem>
                <SelectItem value="Communication">Communication</SelectItem>
                <SelectItem value="Resource">Resource</SelectItem>
                <SelectItem value="Risk Management">Risk Management</SelectItem>
                <SelectItem value="Stakeholder">Stakeholder</SelectItem>
                <SelectItem value="Vendor">Vendor</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[130px]" data-testid="select-filter-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Positive">Positive</SelectItem>
                <SelectItem value="Negative">Negative</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Under Review">Under Review</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredLessons?.map(l => (
              <Card key={l.id} className="p-4" data-testid={`card-lesson-${l.id}`}>
                {editingId === l.id ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Title</Label>
                        <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} data-testid="input-edit-lesson-title" />
                      </div>
                      <div className="col-span-2">
                        <Label>Description</Label>
                        <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} data-testid="input-edit-lesson-description" />
                      </div>
                      <div>
                        <Label>Category</Label>
                        <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                          <SelectTrigger data-testid="select-edit-lesson-category"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Process">Process</SelectItem>
                            <SelectItem value="Technical">Technical</SelectItem>
                            <SelectItem value="Communication">Communication</SelectItem>
                            <SelectItem value="Resource">Resource</SelectItem>
                            <SelectItem value="Risk Management">Risk Management</SelectItem>
                            <SelectItem value="Stakeholder">Stakeholder</SelectItem>
                            <SelectItem value="Vendor">Vendor</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Type</Label>
                        <Select value={form.lessonType} onValueChange={v => setForm(p => ({ ...p, lessonType: v }))}>
                          <SelectTrigger data-testid="select-edit-lesson-type"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Positive">Positive (What Went Well)</SelectItem>
                            <SelectItem value="Negative">Negative (What to Improve)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Impact</Label>
                        <Select value={form.impact} onValueChange={v => setForm(p => ({ ...p, impact: v }))}>
                          <SelectTrigger data-testid="select-edit-lesson-impact"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Low">Low</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="High">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Status</Label>
                        <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                          <SelectTrigger data-testid="select-edit-lesson-status"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Draft">Draft</SelectItem>
                            <SelectItem value="Under Review">Under Review</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                            <SelectItem value="Archived">Archived</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label>Root Cause</Label>
                        <Textarea value={form.rootCause} onChange={e => setForm(p => ({ ...p, rootCause: e.target.value }))} data-testid="input-edit-lesson-root-cause" />
                      </div>
                      <div className="col-span-2">
                        <Label>Recommendations</Label>
                        <Textarea value={form.recommendations} onChange={e => setForm(p => ({ ...p, recommendations: e.target.value }))} data-testid="input-edit-lesson-recommendations" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => { setEditingId(null); resetForm(); }} data-testid="button-cancel-edit-lesson">Cancel</Button>
                      <Button onClick={() => handleUpdate(l)} disabled={!form.title} data-testid="button-save-edit-lesson">
                        Update
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{l.title}</div>
                        <div className="text-sm text-muted-foreground mt-1">{l.description}</div>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <Badge variant="outline">{getProjectName(l.projectId)}</Badge>
                          <Badge variant="secondary">{l.category}</Badge>
                          <Badge className={getTypeColor(l.lessonType || '')}>{l.lessonType}</Badge>
                          <Badge className={getImpactColor(l.impact || '')}>{l.impact} Impact</Badge>
                          <Badge className={getStatusColor(l.status || '')}>{l.status}</Badge>
                          {l.phase && <Badge variant="outline">{l.phase}</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(l)} data-testid={`button-edit-lesson-${l.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(l)} data-testid={`button-delete-lesson-${l.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {(l.rootCause || l.recommendation) && (
                      <div className="mt-3 text-sm space-y-2">
                        {l.rootCause && (
                          <div>
                            <span className="font-medium">Root Cause:</span> {l.rootCause}
                          </div>
                        )}
                        {l.recommendation && (
                          <div>
                            <span className="font-medium">Recommendations:</span> {l.recommendation}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-2 text-xs text-muted-foreground">
                      Added: {format(new Date(l.createdAt!), 'MMM d, yyyy')}
                    </div>
                  </>
                )}
              </Card>
            ))}

            {(!filteredLessons || filteredLessons.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">
                <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No lessons learned found</p>
                <p className="text-sm mt-1">
                  {hasActiveFilters 
                    ? "Try adjusting your filters or search term." 
                    : "Lessons learned are added from individual project pages."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
