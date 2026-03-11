import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Edit, Trash2, ChevronDown, ChevronRight, BookOpen, HelpCircle, GraduationCap, Upload, Eye, EyeOff, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { allModules as staticModules } from "@/lib/trainingData";

interface TrainingModuleRecord {
  id: number;
  moduleKey: string;
  name: string;
  subtitle: string;
  certPrefix: string;
  sortOrder: number | null;
  isActive: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface TrainingLessonRecord {
  id: number;
  moduleId: number;
  lessonKey: string;
  title: string;
  description: string;
  videoTitle: string;
  videoDescription: string;
  keyConcepts: string[];
  sortOrder: number | null;
  isActive: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface TrainingQuizQuestionRecord {
  id: number;
  lessonId: number;
  questionKey: string;
  scenario: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sortOrder: number | null;
  isActive: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export function TrainingManagementTab() {
  const { toast } = useToast();
  const [expandedModule, setExpandedModule] = useState<number | null>(null);
  const [expandedLesson, setExpandedLesson] = useState<number | null>(null);

  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<TrainingModuleRecord | null>(null);
  const [deleteModuleId, setDeleteModuleId] = useState<number | null>(null);

  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<TrainingLessonRecord | null>(null);
  const [lessonModuleId, setLessonModuleId] = useState<number | null>(null);
  const [deleteLessonId, setDeleteLessonId] = useState<number | null>(null);

  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<TrainingQuizQuestionRecord | null>(null);
  const [questionLessonId, setQuestionLessonId] = useState<number | null>(null);
  const [deleteQuestionId, setDeleteQuestionId] = useState<number | null>(null);

  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);

  const { data: modules, isLoading: modulesLoading, isError: modulesError } = useQuery<TrainingModuleRecord[]>({
    queryKey: ['/api/admin/training/modules'],
    staleTime: 0,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        modules: staticModules.map((mod, i) => ({
          moduleKey: mod.id,
          name: mod.name,
          subtitle: mod.subtitle,
          certPrefix: mod.certPrefix,
          sortOrder: i,
          lessons: mod.lessons.map((lesson, j) => ({
            lessonKey: lesson.id,
            title: lesson.title,
            description: lesson.description,
            videoTitle: lesson.videoTitle,
            videoDescription: lesson.videoDescription,
            keyConcepts: lesson.keyConcepts,
            sortOrder: j,
            questions: lesson.questions.map((q, k) => ({
              questionKey: q.id,
              scenario: q.scenario,
              options: q.options,
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              sortOrder: k,
            })),
          })),
        })),
      };
      const res = await apiRequest('POST', '/api/admin/training/seed-from-static', payload);
      return res.json();
    },
    onSuccess: (data: { stats: { modules: number; lessons: number; questions: number } }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/training/modules'] });
      toast({ title: "Seed Complete", description: `Created ${data.stats.modules} modules, ${data.stats.lessons} lessons, ${data.stats.questions} questions` });
      setSeedConfirmOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to seed training data", variant: "destructive" });
    },
  });

  if (modulesLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (modulesError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <X className="h-12 w-12 mx-auto text-destructive/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to Load Training Content</h3>
          <p className="text-sm text-muted-foreground">Could not fetch training modules. Please try refreshing the page.</p>
        </CardContent>
      </Card>
    );
  }

  const hasData = modules && modules.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Training Content Management
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage training modules, lessons, and quiz questions for Friday Academy
          </p>
        </div>
        <div className="flex gap-2">
          {!hasData && (
            <Button variant="outline" onClick={() => setSeedConfirmOpen(true)} disabled={seedMutation.isPending}>
              {seedMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Seed from Template
            </Button>
          )}
          <Button onClick={() => { setEditingModule(null); setModuleDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Module
          </Button>
        </div>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Training Content</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get started by seeding the default training content or creating modules manually.
            </p>
            <Button variant="outline" onClick={() => setSeedConfirmOpen(true)} disabled={seedMutation.isPending}>
              {seedMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Seed Default Content
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {modules?.map((mod) => (
            <ModuleRow
              key={mod.id}
              module={mod}
              isExpanded={expandedModule === mod.id}
              onToggle={() => setExpandedModule(expandedModule === mod.id ? null : mod.id)}
              onEdit={() => { setEditingModule(mod); setModuleDialogOpen(true); }}
              onDelete={() => setDeleteModuleId(mod.id)}
              expandedLesson={expandedLesson}
              setExpandedLesson={setExpandedLesson}
              onAddLesson={() => { setLessonModuleId(mod.id); setEditingLesson(null); setLessonDialogOpen(true); }}
              onEditLesson={(lesson) => { setEditingLesson(lesson); setLessonModuleId(mod.id); setLessonDialogOpen(true); }}
              onDeleteLesson={(id) => setDeleteLessonId(id)}
              onAddQuestion={(lessonId) => { setQuestionLessonId(lessonId); setEditingQuestion(null); setQuestionDialogOpen(true); }}
              onEditQuestion={(q) => { setEditingQuestion(q); setQuestionLessonId(q.lessonId); setQuestionDialogOpen(true); }}
              onDeleteQuestion={(id) => setDeleteQuestionId(id)}
            />
          ))}
        </div>
      )}

      <ModuleDialog
        open={moduleDialogOpen}
        onOpenChange={setModuleDialogOpen}
        module={editingModule}
      />

      <DeleteConfirmDialog
        open={deleteModuleId !== null}
        onOpenChange={(open) => { if (!open) setDeleteModuleId(null); }}
        itemType="module"
        itemId={deleteModuleId}
        endpoint="/api/admin/training/modules"
        invalidateKey="/api/admin/training/modules"
      />

      <LessonDialog
        open={lessonDialogOpen}
        onOpenChange={setLessonDialogOpen}
        lesson={editingLesson}
        moduleId={lessonModuleId}
      />

      <DeleteConfirmDialog
        open={deleteLessonId !== null}
        onOpenChange={(open) => { if (!open) setDeleteLessonId(null); }}
        itemType="lesson"
        itemId={deleteLessonId}
        endpoint="/api/admin/training/lessons"
        invalidateKey="/api/admin/training/modules"
      />

      <QuestionDialog
        open={questionDialogOpen}
        onOpenChange={setQuestionDialogOpen}
        question={editingQuestion}
        lessonId={questionLessonId}
      />

      <DeleteConfirmDialog
        open={deleteQuestionId !== null}
        onOpenChange={(open) => { if (!open) setDeleteQuestionId(null); }}
        itemType="question"
        itemId={deleteQuestionId}
        endpoint="/api/admin/training/questions"
        invalidateKey="/api/admin/training/modules"
      />

      <Dialog open={seedConfirmOpen} onOpenChange={setSeedConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seed Training Content</DialogTitle>
            <DialogDescription>
              This will populate the database with the default training content ({staticModules.length} modules, {staticModules.reduce((s, m) => s + m.lessons.length, 0)} lessons, {staticModules.reduce((s, m) => s + m.lessons.reduce((ls, l) => ls + l.questions.length, 0), 0)} questions).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeedConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              {seedMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Seed Content
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModuleRow({
  module,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  expandedLesson,
  setExpandedLesson,
  onAddLesson,
  onEditLesson,
  onDeleteLesson,
  onAddQuestion,
  onEditQuestion,
  onDeleteQuestion,
}: {
  module: TrainingModuleRecord;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  expandedLesson: number | null;
  setExpandedLesson: (id: number | null) => void;
  onAddLesson: () => void;
  onEditLesson: (lesson: TrainingLessonRecord) => void;
  onDeleteLesson: (id: number) => void;
  onAddQuestion: (lessonId: number) => void;
  onEditQuestion: (q: TrainingQuizQuestionRecord) => void;
  onDeleteQuestion: (id: number) => void;
}) {
  const { data: lessons } = useQuery<TrainingLessonRecord[]>({
    queryKey: ['/api/admin/training/modules', module.id, 'lessons'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/training/modules/${module.id}/lessons`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isExpanded,
    staleTime: 0,
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('PUT', `/api/admin/training/modules/${module.id}`, { isActive: !module.isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/training/modules'] });
    },
  });

  return (
    <Card className={!module.isActive ? 'opacity-60' : ''}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{module.name}</span>
            <Badge variant="outline" className="text-xs">{module.certPrefix}</Badge>
            {!module.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
          </div>
          <p className="text-xs text-muted-foreground truncate">{module.subtitle}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleMutation.mutate()} title={module.isActive ? "Deactivate" : "Activate"}>
            {module.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {isExpanded && (
        <CardContent className="pt-0 pb-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" />
              Lessons ({lessons?.length ?? 0})
            </h4>
            <Button size="sm" variant="outline" onClick={onAddLesson}>
              <Plus className="h-3 w-3 mr-1" /> Add Lesson
            </Button>
          </div>
          {lessons && lessons.length > 0 ? (
            <div className="space-y-1">
              {lessons.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  isExpanded={expandedLesson === lesson.id}
                  onToggle={() => setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)}
                  onEdit={() => onEditLesson(lesson)}
                  onDelete={() => onDeleteLesson(lesson.id)}
                  onAddQuestion={() => onAddQuestion(lesson.id)}
                  onEditQuestion={onEditQuestion}
                  onDeleteQuestion={onDeleteQuestion}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-3 text-center">No lessons yet</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function LessonRow({
  lesson,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onAddQuestion,
  onEditQuestion,
  onDeleteQuestion,
}: {
  lesson: TrainingLessonRecord;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddQuestion: () => void;
  onEditQuestion: (q: TrainingQuizQuestionRecord) => void;
  onDeleteQuestion: (id: number) => void;
}) {
  const { data: questions } = useQuery<TrainingQuizQuestionRecord[]>({
    queryKey: ['/api/admin/training/lessons', lesson.id, 'questions'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/training/lessons/${lesson.id}/questions`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isExpanded,
    staleTime: 0,
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('PUT', `/api/admin/training/lessons/${lesson.id}`, { isActive: !lesson.isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/training/modules'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/training/modules', lesson.moduleId, 'lessons'] });
    },
  });

  return (
    <div className={`border rounded-lg ${!lesson.isActive ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={onToggle}>
        {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{lesson.title}</span>
            {!lesson.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
          </div>
          <p className="text-xs text-muted-foreground truncate">{lesson.description}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleMutation.mutate()} title={lesson.isActive ? "Deactivate" : "Activate"}>
            {lesson.isActive ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Edit className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t">
          <div className="mb-2">
            <p className="text-xs text-muted-foreground mb-1"><strong>Key Concepts:</strong></p>
            <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
              {lesson.keyConcepts.map((c, i) => <li key={i} className="truncate">{c}</li>)}
            </ul>
          </div>
          <div className="flex items-center justify-between mb-2 mt-3">
            <h5 className="text-xs font-medium flex items-center gap-1">
              <HelpCircle className="h-3 w-3" />
              Quiz Questions ({questions?.length ?? 0})
            </h5>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAddQuestion}>
              <Plus className="h-3 w-3 mr-1" /> Add Question
            </Button>
          </div>
          {questions && questions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs py-1">#</TableHead>
                  <TableHead className="text-xs py-1">Scenario</TableHead>
                  <TableHead className="text-xs py-1">Options</TableHead>
                  <TableHead className="text-xs py-1">Correct</TableHead>
                  <TableHead className="text-xs py-1 w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((q, i) => (
                  <TableRow key={q.id}>
                    <TableCell className="text-xs py-1">{i + 1}</TableCell>
                    <TableCell className="text-xs py-1 max-w-[300px] truncate">{q.scenario}</TableCell>
                    <TableCell className="text-xs py-1">{q.options.length}</TableCell>
                    <TableCell className="text-xs py-1">
                      <Badge variant="outline" className="text-xs">{String.fromCharCode(65 + q.correctIndex)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs py-1">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEditQuestion(q)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDeleteQuestion(q.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">No questions yet</p>
          )}
        </div>
      )}
    </div>
  );
}

function ModuleDialog({ open, onOpenChange, module }: { open: boolean; onOpenChange: (open: boolean) => void; module: TrainingModuleRecord | null }) {
  const { toast } = useToast();
  const isEdit = module !== null;
  const [form, setForm] = useState({
    moduleKey: '',
    name: '',
    subtitle: '',
    certPrefix: '',
    sortOrder: 0,
  });

  const resetForm = () => {
    if (module) {
      setForm({
        moduleKey: module.moduleKey,
        name: module.name,
        subtitle: module.subtitle,
        certPrefix: module.certPrefix,
        sortOrder: module.sortOrder ?? 0,
      });
    } else {
      setForm({ moduleKey: '', name: '', subtitle: '', certPrefix: '', sortOrder: 0 });
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await apiRequest('PUT', `/api/admin/training/modules/${module.id}`, form);
      } else {
        await apiRequest('POST', '/api/admin/training/modules', form);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/training/modules'] });
      toast({ title: "Success", description: `Module ${isEdit ? 'updated' : 'created'}` });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: `Failed to ${isEdit ? 'update' : 'create'} module`, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) resetForm(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} Training Module</DialogTitle>
          <DialogDescription>{isEdit ? 'Update module details' : 'Create a new training module'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Module Key (URL slug)</Label>
            <Input value={form.moduleKey} onChange={(e) => setForm({ ...form, moduleKey: e.target.value })} placeholder="e.g. schedule-management" />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Schedule Management" />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="Brief description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cert Prefix</Label>
              <Input value={form.certPrefix} onChange={(e) => setForm({ ...form, certPrefix: e.target.value })} placeholder="e.g. SM" maxLength={10} />
            </div>
            <div>
              <Label>Sort Order</Label>
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.moduleKey || !form.name}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LessonDialog({ open, onOpenChange, lesson, moduleId }: { open: boolean; onOpenChange: (open: boolean) => void; lesson: TrainingLessonRecord | null; moduleId: number | null }) {
  const { toast } = useToast();
  const isEdit = lesson !== null;
  const [form, setForm] = useState({
    lessonKey: '',
    title: '',
    description: '',
    videoTitle: '',
    videoDescription: '',
    keyConcepts: [''],
    sortOrder: 0,
  });

  const resetForm = () => {
    if (lesson) {
      setForm({
        lessonKey: lesson.lessonKey,
        title: lesson.title,
        description: lesson.description,
        videoTitle: lesson.videoTitle,
        videoDescription: lesson.videoDescription,
        keyConcepts: lesson.keyConcepts.length > 0 ? [...lesson.keyConcepts] : [''],
        sortOrder: lesson.sortOrder ?? 0,
      });
    } else {
      setForm({ lessonKey: '', title: '', description: '', videoTitle: '', videoDescription: '', keyConcepts: [''], sortOrder: 0 });
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        moduleId: moduleId!,
        keyConcepts: form.keyConcepts.filter(c => c.trim()),
      };
      if (isEdit) {
        await apiRequest('PUT', `/api/admin/training/lessons/${lesson.id}`, payload);
      } else {
        await apiRequest('POST', '/api/admin/training/lessons', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/training/modules'] });
      if (moduleId) queryClient.invalidateQueries({ queryKey: ['/api/admin/training/modules', moduleId, 'lessons'] });
      toast({ title: "Success", description: `Lesson ${isEdit ? 'updated' : 'created'}` });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: `Failed to ${isEdit ? 'update' : 'create'} lesson`, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} Lesson</DialogTitle>
          <DialogDescription>{isEdit ? 'Update lesson details' : 'Create a new lesson in this module'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Lesson Key</Label>
              <Input value={form.lessonKey} onChange={(e) => setForm({ ...form, lessonKey: e.target.value })} placeholder="e.g. intro" />
            </div>
            <div>
              <Label>Sort Order</Label>
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lesson title" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description" />
          </div>
          <div>
            <Label>Video Title</Label>
            <Input value={form.videoTitle} onChange={(e) => setForm({ ...form, videoTitle: e.target.value })} placeholder="Video title" />
          </div>
          <div>
            <Label>Video Description</Label>
            <Textarea value={form.videoDescription} onChange={(e) => setForm({ ...form, videoDescription: e.target.value })} placeholder="Video description" rows={3} />
          </div>
          <div>
            <Label className="mb-2 block">Key Concepts</Label>
            {form.keyConcepts.map((concept, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Textarea
                  value={concept}
                  onChange={(e) => {
                    const updated = [...form.keyConcepts];
                    updated[i] = e.target.value;
                    setForm({ ...form, keyConcepts: updated });
                  }}
                  placeholder={`Concept ${i + 1}`}
                  rows={2}
                  className="text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive"
                  onClick={() => {
                    if (form.keyConcepts.length > 1) {
                      setForm({ ...form, keyConcepts: form.keyConcepts.filter((_, j) => j !== i) });
                    }
                  }}
                  disabled={form.keyConcepts.length <= 1}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm({ ...form, keyConcepts: [...form.keyConcepts, ''] })}>
              <Plus className="h-3 w-3 mr-1" /> Add Concept
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.lessonKey || !form.title}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionDialog({ open, onOpenChange, question, lessonId }: { open: boolean; onOpenChange: (open: boolean) => void; question: TrainingQuizQuestionRecord | null; lessonId: number | null }) {
  const { toast } = useToast();
  const isEdit = question !== null;
  const [form, setForm] = useState({
    questionKey: '',
    scenario: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    explanation: '',
    sortOrder: 0,
  });

  const resetForm = () => {
    if (question) {
      setForm({
        questionKey: question.questionKey,
        scenario: question.scenario,
        options: [...question.options],
        correctIndex: question.correctIndex,
        explanation: question.explanation,
        sortOrder: question.sortOrder ?? 0,
      });
    } else {
      setForm({ questionKey: '', scenario: '', options: ['', '', '', ''], correctIndex: 0, explanation: '', sortOrder: 0 });
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        lessonId: lessonId!,
        options: form.options.filter(o => o.trim()),
      };
      if (isEdit) {
        await apiRequest('PUT', `/api/admin/training/questions/${question.id}`, payload);
      } else {
        await apiRequest('POST', '/api/admin/training/questions', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/training/modules'] });
      if (lessonId) queryClient.invalidateQueries({ queryKey: ['/api/admin/training/lessons', lessonId, 'questions'] });
      toast({ title: "Success", description: `Question ${isEdit ? 'updated' : 'created'}` });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: `Failed to ${isEdit ? 'update' : 'create'} question`, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} Quiz Question</DialogTitle>
          <DialogDescription>{isEdit ? 'Update question details' : 'Create a new quiz question'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Question Key</Label>
              <Input value={form.questionKey} onChange={(e) => setForm({ ...form, questionKey: e.target.value })} placeholder="e.g. intro-q1" />
            </div>
            <div>
              <Label>Sort Order</Label>
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div>
            <Label>Scenario</Label>
            <Textarea value={form.scenario} onChange={(e) => setForm({ ...form, scenario: e.target.value })} placeholder="Describe the scenario or question" rows={4} />
          </div>
          <div>
            <Label className="mb-2 block">Answer Options</Label>
            {form.options.map((option, i) => (
              <div key={i} className="flex items-start gap-2 mb-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium mt-1">
                  {String.fromCharCode(65 + i)}
                </div>
                <Textarea
                  value={option}
                  onChange={(e) => {
                    const updated = [...form.options];
                    updated[i] = e.target.value;
                    setForm({ ...form, options: updated });
                  }}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  rows={2}
                  className="text-sm"
                />
                <Button
                  variant={form.correctIndex === i ? "default" : "outline"}
                  size="sm"
                  className="h-8 shrink-0 mt-1"
                  onClick={() => setForm({ ...form, correctIndex: i })}
                  title="Mark as correct answer"
                >
                  {form.correctIndex === i ? <Check className="h-3 w-3" /> : <span className="text-xs">Correct</span>}
                </Button>
                {form.options.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive mt-1"
                    onClick={() => {
                      const updated = form.options.filter((_, j) => j !== i);
                      let newCorrect = form.correctIndex;
                      if (form.correctIndex === i) newCorrect = 0;
                      else if (form.correctIndex > i) newCorrect--;
                      setForm({ ...form, options: updated, correctIndex: newCorrect });
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm({ ...form, options: [...form.options, ''] })}>
              <Plus className="h-3 w-3 mr-1" /> Add Option
            </Button>
          </div>
          <div>
            <Label>Correct Answer</Label>
            <Select value={form.correctIndex.toString()} onValueChange={(v) => setForm({ ...form, correctIndex: parseInt(v) })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {form.options.map((_, i) => (
                  <SelectItem key={i} value={i.toString()}>
                    Option {String.fromCharCode(65 + i)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Explanation</Label>
            <Textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} placeholder="Explain why the correct answer is right" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.questionKey || !form.scenario || form.options.filter(o => o.trim()).length < 2}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({ open, onOpenChange, itemType, itemId, endpoint, invalidateKey }: { open: boolean; onOpenChange: (open: boolean) => void; itemType: string; itemId: number | null; endpoint: string; invalidateKey: string }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      if (!itemId) return;
      await apiRequest('DELETE', `${endpoint}/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/training/modules'] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.startsWith('/api/admin/training/');
      }});
      toast({ title: "Deleted", description: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} deleted` });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: `Failed to delete ${itemType}`, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {itemType.charAt(0).toUpperCase() + itemType.slice(1)}</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this {itemType}? {itemType === 'module' ? 'All associated lessons and questions will also be deleted.' : itemType === 'lesson' ? 'All associated questions will also be deleted.' : 'This action cannot be undone.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}