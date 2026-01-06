import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Upload, FileSpreadsheet, RefreshCw, Trash2, ChevronDown, ChevronRight, Clock, FolderPlus, CheckCircle2, ExternalLink } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";
import type { MppImport, MppImportTask, Portfolio } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";

interface MppImportWithTasks extends MppImport {
  tasks?: MppImportTask[];
}

export default function Integrations() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedImports, setExpandedImports] = useState<Set<number>>(new Set());
  const [selectedImportId, setSelectedImportId] = useState<number | null>(null);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [convertingImport, setConvertingImport] = useState<MppImportWithTasks | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectPortfolio, setProjectPortfolio] = useState("");
  const [projectStatus, setProjectStatus] = useState("Initiation");
  const [projectPriority, setProjectPriority] = useState("Medium");

  const { data: imports, isLoading, refetch } = useQuery<MppImportWithTasks[]>({
    queryKey: ['/api/mpp-imports', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/mpp-imports?organizationId=${currentOrganization?.id}`);
      if (!res.ok) throw new Error('Failed to fetch imports');
      return res.json();
    },
    enabled: !!currentOrganization?.id,
    refetchInterval: 30000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('organizationId', String(currentOrganization?.id));
      
      const res = await fetch('/api/mpp-imports/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "File imported successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/mpp-imports'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (importId: number) => {
      const res = await apiRequest('DELETE', `/api/mpp-imports/${importId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Import removed successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/mpp-imports'] });
    },
  });

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ['/api/portfolios', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/portfolios?organizationId=${currentOrganization?.id}`);
      if (!res.ok) throw new Error('Failed to fetch portfolios');
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const convertMutation = useMutation({
    mutationFn: async (data: { importId: number; name: string; portfolioId?: number; status: string; priority: string }) => {
      const res = await apiRequest('POST', `/api/mpp-imports/${data.importId}/convert`, {
        name: data.name,
        portfolioId: data.portfolioId,
        status: data.status,
        priority: data.priority,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Project Created", 
        description: data.message || `Project created with ${data.taskCount} tasks`,
      });
      setConvertModalOpen(false);
      setConvertingImport(null);
      queryClient.invalidateQueries({ queryKey: ['/api/mpp-imports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openConvertModal = (imp: MppImportWithTasks) => {
    setConvertingImport(imp);
    setProjectName(imp.fileName.replace(/\.(mpp|xml|csv)$/i, ''));
    setProjectPortfolio("");
    setProjectStatus("Initiation");
    setProjectPriority("Medium");
    setConvertModalOpen(true);
  };

  const handleConvert = () => {
    if (!convertingImport || !projectName.trim()) return;
    const portfolioNum = projectPortfolio && projectPortfolio !== "none" ? Number(projectPortfolio) : undefined;
    convertMutation.mutate({
      importId: convertingImport.id,
      name: projectName.trim(),
      portfolioId: portfolioNum && portfolioNum > 0 ? portfolioNum : undefined,
      status: projectStatus,
      priority: projectPriority,
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    e.target.value = '';
  };

  const toggleExpanded = (importId: number) => {
    const newExpanded = new Set(expandedImports);
    if (newExpanded.has(importId)) {
      newExpanded.delete(importId);
    } else {
      newExpanded.add(importId);
      if (!imports?.find(i => i.id === importId)?.tasks?.length) {
        fetchTasks(importId);
      }
    }
    setExpandedImports(newExpanded);
  };

  const fetchTasks = async (importId: number) => {
    setSelectedImportId(importId);
    const res = await fetch(`/api/mpp-imports/${importId}/tasks`);
    if (res.ok) {
      const tasks = await res.json();
      queryClient.setQueryData<MppImportWithTasks[]>(
        ['/api/mpp-imports', currentOrganization?.id],
        (old) => old?.map(imp => imp.id === importId ? { ...imp, tasks } : imp)
      );
    }
    setSelectedImportId(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Integrations</h1>
        <p className="mt-2 text-muted-foreground">Connect external project management tools and import data.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="card-mpp-connector">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
                <FileSpreadsheet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle>Microsoft Project (MPP) Connector</CardTitle>
                <CardDescription>Import task schedules from MS Project files</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="font-medium text-sm mb-2">Supported Formats</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default">MPP (Native)</Badge>
                  <Badge variant="secondary">XML (MSPDI)</Badge>
                  <Badge variant="secondary">CSV</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Upload native .mpp files directly, or export from MS Project as XML/CSV
                </p>
              </div>
              
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="font-medium text-sm mb-2">Imported Fields</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Task Name &amp; WBS</li>
                  <li>Start Date &amp; Finish Date</li>
                  <li>Duration &amp; % Complete</li>
                  <li>Task Hierarchy (Outline Level, Summary/Milestone)</li>
                </ul>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mpp,.xml,.csv"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-file-upload"
            />
            <Button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              data-testid="button-upload-mpp"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload File
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Import History</CardTitle>
            <CardDescription>Previously imported project files</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh-imports"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !imports?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileSpreadsheet className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No imports yet. Upload your first file above.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {imports.map((imp) => (
                <div key={imp.id} className="border rounded-lg" data-testid={`import-item-${imp.id}`}>
                  <div 
                    className="flex items-center justify-between p-4 cursor-pointer hover-elevate"
                    onClick={() => toggleExpanded(imp.id)}
                    data-testid={`button-expand-import-${imp.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        {expandedImports.has(imp.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{imp.fileName}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span data-testid={`text-last-synced-${imp.id}`}>
                            Last synced: {imp.lastSyncedAt ? formatDistanceToNow(new Date(imp.lastSyncedAt), { addSuffix: true }) : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{imp.taskCount} tasks</Badge>
                      <Badge variant="secondary">{imp.fileType?.toUpperCase()}</Badge>
                      {imp.projectId ? (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Converted
                        </Badge>
                      ) : imp.status === "converted" ? (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Converted
                        </Badge>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openConvertModal(imp);
                          }}
                          data-testid={`button-create-project-${imp.id}`}
                        >
                          <FolderPlus className="mr-2 h-4 w-4" />
                          Create Project
                        </Button>
                      )}
                      {imp.projectId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/projects/${imp.projectId}`);
                          }}
                          data-testid={`button-view-project-${imp.id}`}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(imp.id);
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-import-${imp.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedImports.has(imp.id) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t overflow-hidden"
                      >
                        <div className="p-4">
                          {selectedImportId === imp.id ? (
                            <div className="flex justify-center py-4">
                              <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                          ) : imp.tasks?.length ? (
                            <div className="rounded-lg border overflow-auto max-h-96">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Task Name</TableHead>
                                    <TableHead>Start Date</TableHead>
                                    <TableHead>Finish Date</TableHead>
                                    <TableHead>Duration</TableHead>
                                    <TableHead className="text-right">% Complete</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {imp.tasks.map((task) => (
                                    <TableRow key={task.id} data-testid={`row-task-${task.id}`}>
                                      <TableCell className="font-medium">
                                        <span style={{ paddingLeft: `${(task.outlineLevel || 1) * 12}px` }}>
                                          {task.isSummary && <span className="font-bold">{task.taskName}</span>}
                                          {task.isMilestone && <span className="text-primary">{task.taskName}</span>}
                                          {!task.isSummary && !task.isMilestone && task.taskName}
                                        </span>
                                      </TableCell>
                                      <TableCell>
                                        {task.startDate ? format(new Date(task.startDate), 'MMM d, yyyy') : '-'}
                                      </TableCell>
                                      <TableCell>
                                        {task.finishDate ? format(new Date(task.finishDate), 'MMM d, yyyy') : '-'}
                                      </TableCell>
                                      <TableCell>{task.duration || `${task.durationDays || 0} days`}</TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                            <div 
                                              className="h-full bg-primary rounded-full"
                                              style={{ width: `${task.percentComplete || 0}%` }}
                                            />
                                          </div>
                                          <span className="text-sm">{task.percentComplete || 0}%</span>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-center py-4">No tasks in this import</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={convertModalOpen} onOpenChange={setConvertModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Project from Import</DialogTitle>
            <DialogDescription>
              This will create a new project with {convertingImport?.taskCount || 0} tasks from the imported file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
                data-testid="input-project-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portfolio">Portfolio (Optional)</Label>
              <Select value={projectPortfolio} onValueChange={setProjectPortfolio}>
                <SelectTrigger data-testid="select-portfolio">
                  <SelectValue placeholder="No portfolio selected" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Portfolio</SelectItem>
                  {portfolios?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={projectStatus} onValueChange={setProjectStatus}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Initiation">Initiation</SelectItem>
                    <SelectItem value="Planning">Planning</SelectItem>
                    <SelectItem value="Execution">Execution</SelectItem>
                    <SelectItem value="Monitoring">Monitoring</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={projectPriority} onValueChange={setProjectPriority}>
                  <SelectTrigger data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConvert} 
              disabled={convertMutation.isPending || !projectName.trim()}
              data-testid="button-confirm-create"
            >
              {convertMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FolderPlus className="mr-2 h-4 w-4" />
              )}
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
