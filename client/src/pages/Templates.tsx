import { useState, useRef, useCallback, useMemo } from "react";
import { formatDuration } from "@/lib/workingDays";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TemplateGanttPreview } from "@/components/templates/TemplateGanttPreview";
import {
  Upload,
  FileText,
  FolderKanban,
  MoreHorizontal,
  Download,
  Copy,
  Trash2,
  Edit,
  Plus,
  RefreshCw,
  Loader2,
  ArrowLeft,
  ListTree,
  Milestone,
  GanttChartSquare,
  Sparkles,
  Lock,
  Mail,
  // icons that may be referenced by template.icon
  Code,
  ListChecks,
  Smartphone,
  Cloud,
  Layers,
  Server,
  Network,
  Building2,
  Users,
  ShieldAlert,
  FileCheck,
  BadgeCheck,
  LifeBuoy,
  Headphones,
  Globe,
  Database,
  Brain,
  // industry icons
  Heart,
  Landmark,
  Factory,
  Cpu,
  HardHat,
  Zap,
  Building,
  MonitorSmartphone,
} from "lucide-react";

interface ProjectTemplate {
  id: number;
  organizationId: number | null;
  name: string;
  description: string | null;
  sourceType: string;
  originalFileName: string | null;
  storedFileUrl: string | null;
  itemCount: number;
  milestoneCount: number;
  createdBy: string | null;
  sourceProjectId: number | null;
  isSystem: boolean;
  industry: string | null;
  category: string | null;
  slug: string | null;
  icon: string | null;
  estimatedDurationDays: number | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplateItem {
  id: number;
  templateId: number;
  taskId: number | null;
  wbs: string | null;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  duration: string | null;
  durationDays: number | null;
  outlineLevel: number;
  parentTaskId: number | null;
  isSummary: boolean;
  isMilestone: boolean;
  predecessors: string | null;
  notes: string | null;
  workHours: string | null;
}

interface ProjectTemplate_WithItems extends ProjectTemplate {
  items: TemplateItem[];
}

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Code,
  ListChecks,
  Smartphone,
  Cloud,
  Layers,
  Server,
  Network,
  Mail,
  Building2,
  Users,
  ShieldAlert,
  FileCheck,
  BadgeCheck,
  LifeBuoy,
  Headphones,
  Globe,
  Database,
  Brain,
  FileText,
  FolderKanban,
};

interface IndustryDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon: boolean;
}

const INDUSTRIES: IndustryDef[] = [
  { key: "it", label: "Information Technology", icon: MonitorSmartphone, comingSoon: false },
  { key: "healthcare", label: "Healthcare", icon: Heart, comingSoon: true },
  { key: "financial-services", label: "Financial Services", icon: Landmark, comingSoon: true },
  { key: "manufacturing", label: "Manufacturing", icon: Factory, comingSoon: true },
  { key: "industrial-automation", label: "Industrial Automation", icon: Cpu, comingSoon: true },
  { key: "capital-projects", label: "Capital Projects", icon: HardHat, comingSoon: true },
  { key: "energy", label: "Energy & Utilities", icon: Zap, comingSoon: true },
  { key: "government", label: "Government & Public Sector", icon: Building, comingSoon: true },
];

function getTemplateIcon(name: string | null | undefined): React.ComponentType<{ className?: string }> {
  if (name && TEMPLATE_ICONS[name]) return TEMPLATE_ICONS[name];
  return FileText;
}

function formatDays(days: number | null | undefined): string {
  if (days == null) return "—";
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

export default function Templates() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reimportFileInputRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<"library" | "my-templates">("library");
  const [activeIndustry, setActiveIndustry] = useState<string>("it");

  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showFromProjectDialog, setShowFromProjectDialog] = useState(false);
  const [showCreateProjectDialog, setShowCreateProjectDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [detailView, setDetailView] = useState<ProjectTemplate_WithItems | null>(null);

  const [uploadName, setUploadName] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [fromProjectName, setFromProjectName] = useState("");
  const [fromProjectDescription, setFromProjectDescription] = useState("");
  const [fromProjectId, setFromProjectId] = useState("");

  const [createProjectName, setCreateProjectName] = useState("");
  const [createProjectDescription, setCreateProjectDescription] = useState("");
  const [createProjectStartDate, setCreateProjectStartDate] = useState("");
  const [createProjectPortfolioId, setCreateProjectPortfolioId] = useState("");

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const orgId = currentOrganization?.id;

  // Library: pull all system templates for the active industry. The filter
  // happens server-side, but we always fetch the IT set so industry tab
  // switches are instant once cached.
  const { data: systemTemplates = [], isLoading: systemLoading } = useQuery<ProjectTemplate[]>({
    queryKey: ["/api/project-templates", "system", activeIndustry],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/project-templates?scope=system&industry=${encodeURIComponent(activeIndustry)}`,
      );
      return res.json();
    },
    enabled: view === "library" && !INDUSTRIES.find((i) => i.key === activeIndustry)?.comingSoon,
  });

  // My Templates: org-scoped templates only.
  const { data: orgTemplates = [], isLoading: orgLoading } = useQuery<ProjectTemplate[]>({
    queryKey: ["/api/project-templates", "org", orgId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/project-templates?scope=org&organizationId=${orgId}`);
      return res.json();
    },
    enabled: !!orgId && view === "my-templates",
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", orgId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects?organizationId=${orgId}`);
      return res.json();
    },
    enabled: !!orgId && showFromProjectDialog,
  });

  const { data: portfolios = [] } = useQuery<any[]>({
    queryKey: ["/api/portfolios", orgId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/portfolios?organizationId=${orgId}`);
      return res.json();
    },
    enabled: !!orgId && showCreateProjectDialog,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile || !uploadName || !orgId) throw new Error("Missing required fields");
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("name", uploadName);
      formData.append("description", uploadDescription);
      formData.append("organizationId", String(orgId));
      const res = await fetch("/api/project-templates/from-mpp", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      setShowUploadDialog(false);
      resetUploadForm();
      toast({ title: "Template created", description: "Template has been created from the uploaded file." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const fromProjectMutation = useMutation({
    mutationFn: async () => {
      if (!fromProjectId || !fromProjectName) throw new Error("Missing required fields");
      const res = await apiRequest("POST", "/api/project-templates/from-project", {
        projectId: Number(fromProjectId),
        name: fromProjectName,
        description: fromProjectDescription,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      setShowFromProjectDialog(false);
      resetFromProjectForm();
      toast({ title: "Template created", description: "Template has been created from the project." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate || !createProjectName) throw new Error("Missing required fields");
      const body: Record<string, any> = {
        name: createProjectName,
        description: createProjectDescription,
        startDate: createProjectStartDate || undefined,
        portfolioId: createProjectPortfolioId ? Number(createProjectPortfolioId) : undefined,
      };
      // System templates need a destination org since they live outside any
      // single tenant. Use the active organization.
      if (selectedTemplate.isSystem) {
        if (!orgId) throw new Error("No organization selected");
        body.organizationId = orgId;
      }
      const res = await apiRequest("POST", `/api/project-templates/${selectedTemplate.id}/create-project`, body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create project");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowCreateProjectDialog(false);
      resetCreateProjectForm();
      toast({ title: "Project created", description: data.message || "Project has been created from the template." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("No template selected");
      const res = await apiRequest("PUT", `/api/project-templates/${selectedTemplate.id}`, {
        name: editName,
        description: editDescription,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      setShowEditDialog(false);
      toast({ title: "Template updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("No template selected");
      const res = await apiRequest("DELETE", `/api/project-templates/${selectedTemplate.id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to delete template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      setShowDeleteConfirm(false);
      setSelectedTemplate(null);
      if (detailView && detailView.id === selectedTemplate?.id) setDetailView(null);
      toast({ title: "Template deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: ProjectTemplate) => {
      const body: Record<string, any> = {};
      // Duplicating a system template requires a destination organization.
      if (template.isSystem) {
        if (!orgId) throw new Error("No organization selected");
        body.organizationId = orgId;
      }
      const res = await apiRequest("POST", `/api/project-templates/${template.id}/duplicate`, body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to duplicate template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      toast({ title: "Saved to your templates", description: "Find the editable copy under My Templates." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reimportMutation = useMutation({
    mutationFn: async ({ templateId, file }: { templateId: number; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/project-templates/${templateId}/reimport`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Re-import failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      toast({ title: "Template updated", description: "Template has been re-imported with the new file." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetUploadForm = () => {
    setUploadName("");
    setUploadDescription("");
    setUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetFromProjectForm = () => {
    setFromProjectName("");
    setFromProjectDescription("");
    setFromProjectId("");
  };

  const resetCreateProjectForm = () => {
    setCreateProjectName("");
    setCreateProjectDescription("");
    setCreateProjectStartDate("");
    setCreateProjectPortfolioId("");
  };

  const handleViewDetails = useCallback(async (template: ProjectTemplate) => {
    try {
      const res = await apiRequest("GET", `/api/project-templates/${template.id}`);
      const data: ProjectTemplate_WithItems = await res.json();
      setDetailView(data);
    } catch {
      toast({ title: "Error", description: "Failed to load template details", variant: "destructive" });
    }
  }, [toast]);

  const handleDownload = useCallback(async (template: ProjectTemplate) => {
    try {
      const res = await fetch(`/api/project-templates/${template.id}/download`, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = template.originalFileName || "template.mpp";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Error", description: "Failed to download file", variant: "destructive" });
    }
  }, [toast]);

  const handleReimport = useCallback((template: ProjectTemplate) => {
    setSelectedTemplate(template);
    setTimeout(() => reimportFileInputRef.current?.click(), 100);
  }, []);

  const handleReimportFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedTemplate) {
      reimportMutation.mutate({ templateId: selectedTemplate.id, file });
    }
    if (reimportFileInputRef.current) reimportFileInputRef.current.value = "";
  }, [selectedTemplate, reimportMutation]);

  // Group system templates by category for display.
  const groupedSystem = useMemo(() => {
    const groups = new Map<string, ProjectTemplate[]>();
    for (const t of systemTemplates) {
      const cat = t.category || "Uncategorized";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(t);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [systemTemplates]);

  const activeIndustryDef = INDUSTRIES.find((i) => i.key === activeIndustry);

  if (!orgId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Please select an organization to manage templates.</p>
      </div>
    );
  }

  if (detailView) {
    const Icon = getTemplateIcon(detailView.icon);
    const isSystem = detailView.isSystem;
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setDetailView(null)} data-testid="button-back-templates">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Templates
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">{detailView.name}</h1>
              {(detailView.summary || detailView.description) && (
                <p className="mt-1 text-muted-foreground">{detailView.summary || detailView.description}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {isSystem && (
                  <Badge variant="default" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    System template
                  </Badge>
                )}
                {detailView.category && (
                  <Badge variant="outline">{detailView.category}</Badge>
                )}
                {!isSystem && (
                  <Badge variant={detailView.sourceType === "mpp" ? "default" : "secondary"}>
                    {detailView.sourceType === "mpp" ? "MPP Import" : detailView.sourceType === "system-copy" ? "Copied from library" : "From Project"}
                  </Badge>
                )}
                {detailView.originalFileName && (
                  <span className="text-sm text-muted-foreground">{detailView.originalFileName}</span>
                )}
                <span className="text-sm text-muted-foreground">
                  {detailView.itemCount} items · {detailView.milestoneCount} milestones
                </span>
                {detailView.estimatedDurationDays != null && (
                  <span className="text-sm text-muted-foreground">~{formatDays(detailView.estimatedDurationDays)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {detailView.storedFileUrl && !isSystem && (
              <Button variant="outline" size="sm" onClick={() => handleDownload(detailView)} data-testid="button-download-template">
                <Download className="mr-2 h-4 w-4" />
                Download File
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setSelectedTemplate(detailView);
                setCreateProjectName("");
                setCreateProjectDescription(detailView.summary || detailView.description || "");
                setShowCreateProjectDialog(true);
              }}
              data-testid="button-use-template"
            >
              <Plus className="mr-2 h-4 w-4" />
              Use this template
            </Button>
          </div>
        </div>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Template Items ({detailView.items.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {detailView.items.length === 0 ? (
              <p className="text-muted-foreground">No items in this template.</p>
            ) : (
              <Tabs defaultValue="timeline" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="timeline" data-testid="tab-template-timeline">
                    <GanttChartSquare className="mr-2 h-4 w-4" />
                    Timeline
                  </TabsTrigger>
                  <TabsTrigger value="list" data-testid="tab-template-list">
                    <ListTree className="mr-2 h-4 w-4" />
                    Item list
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="timeline" className="mt-0">
                  <TemplateGanttPreview items={detailView.items} />
                </TabsContent>
                <TabsContent value="list" className="mt-0">
                  <div className="rounded-md border max-h-[600px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">WBS</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="w-24">Duration</TableHead>
                          <TableHead className="w-20">Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailView.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {item.wbs || "-"}
                            </TableCell>
                            <TableCell>
                              <div
                                style={{ paddingLeft: `${((item.outlineLevel || 1) - 1) * 20}px` }}
                                className="flex items-center gap-2"
                              >
                                {item.isSummary ? (
                                  <ListTree className="h-4 w-4 text-blue-500" />
                                ) : item.isMilestone ? (
                                  <Milestone className="h-4 w-4 text-amber-500" />
                                ) : null}
                                <span className={item.isSummary ? "font-semibold" : ""}>
                                  {item.name}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.duration || (item.durationDays != null ? formatDuration(Number(item.durationDays)) : "-")}
                            </TableCell>
                            <TableCell>
                              {item.isMilestone ? (
                                <Badge variant="outline" className="text-xs">Milestone</Badge>
                              ) : item.isSummary ? (
                                <Badge variant="outline" className="text-xs">Summary</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Task</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Project Templates</h1>
          <p className="text-muted-foreground">
            Browse a curated library of project templates, or save your own from existing work.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setShowFromProjectDialog(true)} data-testid="button-from-project">
            <FolderKanban className="mr-2 h-4 w-4" />
            From Project
          </Button>
          <Button onClick={() => setShowUploadDialog(true)} data-testid="button-upload-file">
            <Upload className="mr-2 h-4 w-4" />
            Upload File
          </Button>
        </div>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as "library" | "my-templates")} className="space-y-6">
        <TabsList>
          <TabsTrigger value="library" data-testid="tab-library">
            <Sparkles className="mr-2 h-4 w-4" />
            Browse Library
          </TabsTrigger>
          <TabsTrigger value="my-templates" data-testid="tab-my-templates">
            <FolderKanban className="mr-2 h-4 w-4" />
            My Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="space-y-6">
          <Tabs value={activeIndustry} onValueChange={setActiveIndustry}>
            <TabsList className="flex w-full flex-wrap h-auto justify-start gap-1">
              {INDUSTRIES.map((ind) => {
                const Icon = ind.icon;
                return (
                  <TabsTrigger key={ind.key} value={ind.key} className="gap-2" data-testid={`tab-industry-${ind.key}`}>
                    <Icon className="h-4 w-4" />
                    {ind.label}
                    {ind.comingSoon && (
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">Soon</Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {activeIndustryDef?.comingSoon ? (
            <Card className="py-16">
              <CardContent className="flex flex-col items-center justify-center text-center">
                <activeIndustryDef.icon className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold">{activeIndustryDef.label} templates — coming soon</h3>
                <p className="mt-1 max-w-md text-muted-foreground">
                  We're building a curated set of templates for {activeIndustryDef.label.toLowerCase()}.
                  In the meantime, you can upload your own MPP, XML, or CSV file or save an existing project.
                </p>
                <div className="mt-6 flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={`mailto:templates@projectsynchron.com?subject=${encodeURIComponent("Template request: " + activeIndustryDef.label)}`}>
                      <Mail className="mr-2 h-4 w-4" />
                      Request a template
                    </a>
                  </Button>
                  <Button size="sm" onClick={() => setShowUploadDialog(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload your own
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : systemLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : systemTemplates.length === 0 ? (
            <Card className="py-16">
              <CardContent className="flex flex-col items-center justify-center text-center">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold">No templates available yet</h3>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {groupedSystem.map(([category, items]) => (
                <div key={category} className="space-y-3">
                  <h2 className="text-lg font-semibold">{category}</h2>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((template) => (
                      <SystemTemplateCard
                        key={template.id}
                        template={template}
                        onView={handleViewDetails}
                        onUse={(t) => {
                          setSelectedTemplate(t);
                          setCreateProjectName("");
                          setCreateProjectDescription(t.summary || t.description || "");
                          setShowCreateProjectDialog(true);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="my-templates" className="space-y-6">
          {orgLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : orgTemplates.length === 0 ? (
            <Card className="py-16">
              <CardContent className="flex flex-col items-center justify-center text-center">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold">No templates yet</h3>
                <p className="mt-1 text-muted-foreground max-w-sm">
                  Upload an MPP/XML/CSV file or save an existing project as a template to get started.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" onClick={() => setShowFromProjectDialog(true)}>
                    <FolderKanban className="mr-2 h-4 w-4" />
                    From Project
                  </Button>
                  <Button onClick={() => setShowUploadDialog(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload File
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {orgTemplates.map((template) => (
                <Card
                  key={template.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => handleViewDetails(template)}
                  data-testid={`card-template-${template.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{template.name}</CardTitle>
                        {template.description && (
                          <CardDescription className="mt-1 line-clamp-2">
                            {template.description}
                          </CardDescription>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedTemplate(template);
                              setCreateProjectName("");
                              setCreateProjectDescription(template.description || "");
                              setShowCreateProjectDialog(true);
                            }}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Use this template
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedTemplate(template);
                              setEditName(template.name);
                              setEditDescription(template.description || "");
                              setShowEditDialog(true);
                            }}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateMutation.mutate(template)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          {template.storedFileUrl && (
                            <>
                              <DropdownMenuItem onClick={() => handleDownload(template)}>
                                <Download className="mr-2 h-4 w-4" />
                                Download File
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleReimport(template)}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Re-import File
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setSelectedTemplate(template);
                              setShowDeleteConfirm(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Badge variant={template.sourceType === "mpp" ? "default" : "secondary"} className="text-xs">
                        {template.sourceType === "mpp" ? "MPP" : template.sourceType === "system-copy" ? "From Library" : "Project"}
                      </Badge>
                      <span>{template.itemCount} tasks</span>
                      {template.milestoneCount > 0 && (
                        <span>{template.milestoneCount} milestones</span>
                      )}
                    </div>
                    {template.originalFileName && (
                      <p className="mt-2 text-xs text-muted-foreground truncate">
                        {template.originalFileName}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {new Date(template.createdAt).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <input
        ref={reimportFileInputRef}
        type="file"
        accept=".mpp,.xml,.csv"
        className="hidden"
        onChange={handleReimportFileChange}
      />

      <Dialog open={showUploadDialog} onOpenChange={(open) => { setShowUploadDialog(open); if (!open) resetUploadForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload File as Template</DialogTitle>
            <DialogDescription>
              Upload an MPP, XML, or CSV file to create a new project template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="Enter template name"
              />
            </div>
            <div>
              <Label htmlFor="template-desc">Description (optional)</Label>
              <Textarea
                id="template-desc"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Describe this template"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="template-file">File</Label>
              <Input
                ref={fileInputRef}
                id="template-file"
                type="file"
                accept=".mpp,.xml,.csv"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
              <p className="mt-1 text-xs text-muted-foreground">Supported formats: MPP, XML (MSPDI), CSV</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUploadDialog(false); resetUploadForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!uploadFile || !uploadName || uploadMutation.isPending}
            >
              {uploadMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload & Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFromProjectDialog} onOpenChange={(open) => { setShowFromProjectDialog(open); if (!open) resetFromProjectForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Template from Project</DialogTitle>
            <DialogDescription>
              Save an existing project's structure as a reusable template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="from-project-name">Template Name</Label>
              <Input
                id="from-project-name"
                value={fromProjectName}
                onChange={(e) => setFromProjectName(e.target.value)}
                placeholder="Enter template name"
              />
            </div>
            <div>
              <Label htmlFor="from-project-desc">Description (optional)</Label>
              <Textarea
                id="from-project-desc"
                value={fromProjectDescription}
                onChange={(e) => setFromProjectDescription(e.target.value)}
                placeholder="Describe this template"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="source-project">Source Project</Label>
              <Select value={fromProjectId} onValueChange={setFromProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowFromProjectDialog(false); resetFromProjectForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={() => fromProjectMutation.mutate()}
              disabled={!fromProjectId || !fromProjectName || fromProjectMutation.isPending}
            >
              {fromProjectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateProjectDialog} onOpenChange={(open) => { setShowCreateProjectDialog(open); if (!open) resetCreateProjectForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project from Template</DialogTitle>
            <DialogDescription>
              Create a new project using "{selectedTemplate?.name}" as a template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-project-name">Project Name</Label>
              <Input
                id="new-project-name"
                value={createProjectName}
                onChange={(e) => setCreateProjectName(e.target.value)}
                placeholder="Enter project name"
              />
            </div>
            <div>
              <Label htmlFor="new-project-desc">Description (optional)</Label>
              <Textarea
                id="new-project-desc"
                value={createProjectDescription}
                onChange={(e) => setCreateProjectDescription(e.target.value)}
                placeholder="Describe this project"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="new-project-portfolio">Portfolio (optional)</Label>
              <Select value={createProjectPortfolioId} onValueChange={setCreateProjectPortfolioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a portfolio" />
                </SelectTrigger>
                <SelectContent>
                  {portfolios.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-project-start">Start Date (optional)</Label>
              <Input
                id="new-project-start"
                type="date"
                value={createProjectStartDate}
                onChange={(e) => setCreateProjectStartDate(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                If set, task dates will be adjusted relative to this start date.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateProjectDialog(false); resetCreateProjectForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={() => createProjectMutation.mutate()}
              disabled={!createProjectName || createProjectMutation.isPending}
            >
              {createProjectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={!editName || updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedTemplate?.name}"? This will also delete the stored file. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SystemTemplateCardProps {
  template: ProjectTemplate;
  onView: (t: ProjectTemplate) => void;
  onUse: (t: ProjectTemplate) => void;
}

function SystemTemplateCard({ template, onView, onUse }: SystemTemplateCardProps) {
  const Icon = getTemplateIcon(template.icon);
  return (
    <Card
      className="flex h-full cursor-pointer flex-col transition-shadow hover:shadow-md"
      onClick={() => onView(template)}
      data-testid={`card-system-template-${template.slug || template.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base leading-tight">{template.name}</CardTitle>
            {template.summary && (
              <CardDescription className="mt-1 line-clamp-2">{template.summary}</CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3 pt-0">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="default" className="gap-1 text-[10px]">
            <Lock className="h-3 w-3" />
            System
          </Badge>
          {template.category && (
            <Badge variant="outline" className="text-[10px]">{template.category}</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{template.itemCount} items</span>
          {template.milestoneCount > 0 && <span>{template.milestoneCount} milestones</span>}
          {template.estimatedDurationDays != null && <span>~{formatDays(template.estimatedDurationDays)}</span>}
        </div>
        <div className="pt-1">
          <Button
            size="sm"
            className="w-full"
            onClick={(e) => { e.stopPropagation(); onUse(template); }}
            data-testid={`button-use-${template.slug || template.id}`}
          >
            Use this template
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
