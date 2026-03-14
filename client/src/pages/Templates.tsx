import { useState, useRef, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";

interface ProjectTemplate {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  sourceType: string;
  originalFileName: string | null;
  storedFileUrl: string | null;
  itemCount: number;
  milestoneCount: number;
  createdBy: string;
  sourceProjectId: number | null;
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

export default function Templates() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reimportFileInputRef = useRef<HTMLInputElement>(null);

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

  const { data: templates = [], isLoading } = useQuery<ProjectTemplate[]>({
    queryKey: ["/api/project-templates", orgId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/project-templates?organizationId=${orgId}`);
      return res.json();
    },
    enabled: !!orgId,
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
      const res = await apiRequest("POST", `/api/project-templates/${selectedTemplate.id}/create-project`, {
        name: createProjectName,
        description: createProjectDescription,
        startDate: createProjectStartDate || undefined,
        portfolioId: createProjectPortfolioId ? Number(createProjectPortfolioId) : undefined,
      });
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
    mutationFn: async (templateId: number) => {
      const res = await apiRequest("POST", `/api/project-templates/${templateId}/duplicate`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to duplicate template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      toast({ title: "Template duplicated" });
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

  if (!orgId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Please select an organization to manage templates.</p>
      </div>
    );
  }

  if (detailView) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setDetailView(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Templates
          </Button>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{detailView.name}</h1>
            {detailView.description && (
              <p className="mt-1 text-muted-foreground">{detailView.description}</p>
            )}
            <div className="mt-2 flex items-center gap-3">
              <Badge variant={detailView.sourceType === "mpp" ? "default" : "secondary"}>
                {detailView.sourceType === "mpp" ? "MPP Import" : "From Project"}
              </Badge>
              {detailView.originalFileName && (
                <span className="text-sm text-muted-foreground">{detailView.originalFileName}</span>
              )}
              <span className="text-sm text-muted-foreground">
                {detailView.itemCount} tasks, {detailView.milestoneCount} milestones
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {detailView.storedFileUrl && (
              <Button variant="outline" size="sm" onClick={() => handleDownload(detailView)}>
                <Download className="mr-2 h-4 w-4" />
                Download File
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setSelectedTemplate(detailView);
                setCreateProjectName("");
                setCreateProjectDescription(detailView.description || "");
                setShowCreateProjectDialog(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Project
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
                          {item.duration || (item.durationDays != null ? formatDuration(item.durationDays) : "-")}
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
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Project Templates</h1>
          <p className="text-muted-foreground">
            Create reusable project templates from MPP files or existing projects.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowFromProjectDialog(true)}>
            <FolderKanban className="mr-2 h-4 w-4" />
            From Project
          </Button>
          <Button onClick={() => setShowUploadDialog(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload File
          </Button>
        </div>
      </div>

      <Separator />

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : templates.length === 0 ? (
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
          {templates.map((template) => (
            <Card
              key={template.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => handleViewDetails(template)}
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
                        Create Project
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
                      <DropdownMenuItem onClick={() => duplicateMutation.mutate(template.id)}>
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
                    {template.sourceType === "mpp" ? "MPP" : "Project"}
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
