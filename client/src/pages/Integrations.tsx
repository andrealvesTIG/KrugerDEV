import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, FileSpreadsheet, RefreshCw, Trash2, ChevronDown, ChevronRight, Clock, FolderPlus, CheckCircle2, ExternalLink, Files, X, Link2, BarChart3, Copy, Check, Puzzle, Building2, Settings, Briefcase, Rocket } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";
import type { MppImport, MppImportTask, Portfolio, Project } from "@shared/schema";
import { ProjectOnlineImportWizard } from "@/components/ProjectOnlineImportWizard";
import { PlannerImportWizard } from "@/components/PlannerImportWizard";
import { PlannerPremiumBulkImportWizard } from "@/components/PlannerPremiumBulkImportWizard";
import { Cloud } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  SiJira, SiAsana, SiTrello, SiNotion, SiClickup,
  SiSap, SiOracle, SiSalesforce,
  SiTableau, SiGoogleanalytics
} from "react-icons/si";
import { Calendar, LayoutGrid, Square } from "lucide-react";

interface MppImportWithTasks extends MppImport {
  tasks?: MppImportTask[];
}

type IntegrationCategory = "project" | "erp" | "analytics";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: IntegrationCategory;
  status: "active" | "coming_soon";
  bgColor: string;
}

const integrations: Integration[] = [
  // Project Management
  { id: "jira", name: "Jira", description: "Sync issues and projects from Atlassian Jira", icon: <SiJira className="h-6 w-6" />, category: "project", status: "coming_soon", bgColor: "bg-blue-100 dark:bg-blue-900" },
  { id: "asana", name: "Asana", description: "Import tasks and projects from Asana", icon: <SiAsana className="h-6 w-6" />, category: "project", status: "coming_soon", bgColor: "bg-pink-100 dark:bg-pink-900" },
  { id: "monday", name: "Monday.com", description: "Connect boards and items from Monday", icon: <LayoutGrid className="h-6 w-6" />, category: "project", status: "coming_soon", bgColor: "bg-red-100 dark:bg-red-900" },
  { id: "trello", name: "Trello", description: "Sync cards and boards from Trello", icon: <SiTrello className="h-6 w-6" />, category: "project", status: "coming_soon", bgColor: "bg-sky-100 dark:bg-sky-900" },
  { id: "ms-project", name: "MS Project", description: "Import MPP, XML, and CSV files", icon: <FileSpreadsheet className="h-6 w-6" />, category: "project", status: "active", bgColor: "bg-blue-100 dark:bg-blue-900" },
  { id: "planner", name: "Microsoft Planner", description: "Import tasks and plans from Microsoft Planner", icon: <Calendar className="h-6 w-6" />, category: "project", status: "active", bgColor: "bg-indigo-100 dark:bg-indigo-900" },
  { id: "planner-premium", name: "Planner Premium", description: "Bulk import plans from Project for the Web / Planner Premium", icon: <Rocket className="h-6 w-6" />, category: "project", status: "active", bgColor: "bg-purple-100 dark:bg-purple-900" },
  { id: "project-online", name: "Project Online", description: "Import projects from Microsoft Project Online", icon: <Cloud className="h-6 w-6" />, category: "project", status: "active", bgColor: "bg-blue-100 dark:bg-blue-900" },
  { id: "notion", name: "Notion", description: "Connect databases from Notion", icon: <SiNotion className="h-6 w-6" />, category: "project", status: "coming_soon", bgColor: "bg-stone-100 dark:bg-stone-900" },
  { id: "clickup", name: "ClickUp", description: "Sync tasks and spaces from ClickUp", icon: <SiClickup className="h-6 w-6" />, category: "project", status: "coming_soon", bgColor: "bg-violet-100 dark:bg-violet-900" },
  { id: "basecamp", name: "Basecamp", description: "Import projects from Basecamp", icon: <Briefcase className="h-6 w-6" />, category: "project", status: "coming_soon", bgColor: "bg-emerald-100 dark:bg-emerald-900" },
  
  // ERP
  { id: "sap", name: "SAP", description: "Connect to SAP ERP for financial data", icon: <SiSap className="h-6 w-6" />, category: "erp", status: "coming_soon", bgColor: "bg-blue-100 dark:bg-blue-900" },
  { id: "oracle", name: "Oracle", description: "Integrate with Oracle ERP Cloud", icon: <SiOracle className="h-6 w-6" />, category: "erp", status: "coming_soon", bgColor: "bg-red-100 dark:bg-red-900" },
  { id: "netsuite", name: "NetSuite", description: "Sync projects from Oracle NetSuite", icon: <Building2 className="h-6 w-6" />, category: "erp", status: "coming_soon", bgColor: "bg-orange-100 dark:bg-orange-900" },
  { id: "dynamics", name: "Dynamics 365", description: "Connect Microsoft Dynamics 365", icon: <Square className="h-6 w-6" />, category: "erp", status: "coming_soon", bgColor: "bg-cyan-100 dark:bg-cyan-900" },
  { id: "workday", name: "Workday", description: "Integrate Workday financials", icon: <Rocket className="h-6 w-6" />, category: "erp", status: "coming_soon", bgColor: "bg-amber-100 dark:bg-amber-900" },
  { id: "salesforce", name: "Salesforce", description: "Connect Salesforce CRM data", icon: <SiSalesforce className="h-6 w-6" />, category: "erp", status: "coming_soon", bgColor: "bg-blue-100 dark:bg-blue-900" },
  
  // Analytics
  { id: "power-bi", name: "Power BI", description: "Connect data to Power BI dashboards", icon: <BarChart3 className="h-6 w-6" />, category: "analytics", status: "active", bgColor: "bg-amber-100 dark:bg-amber-900" },
  { id: "tableau", name: "Tableau", description: "Export data to Tableau", icon: <SiTableau className="h-6 w-6" />, category: "analytics", status: "coming_soon", bgColor: "bg-blue-100 dark:bg-blue-900" },
  { id: "google-analytics", name: "Google Analytics", description: "Connect with Google Analytics", icon: <SiGoogleanalytics className="h-6 w-6" />, category: "analytics", status: "coming_soon", bgColor: "bg-orange-100 dark:bg-orange-900" },
  { id: "looker", name: "Looker", description: "Integrate with Google Looker", icon: <BarChart3 className="h-6 w-6" />, category: "analytics", status: "coming_soon", bgColor: "bg-purple-100 dark:bg-purple-900" },
];

const categories: { id: IntegrationCategory; name: string; icon: React.ReactNode; description: string }[] = [
  { id: "project", name: "Project Management", icon: <Puzzle className="h-4 w-4" />, description: "Connect your project management tools" },
  { id: "erp", name: "ERP Systems", icon: <Building2 className="h-4 w-4" />, description: "Integrate enterprise resource planning" },
  { id: "analytics", name: "Analytics & BI", icon: <BarChart3 className="h-4 w-4" />, description: "Connect business intelligence tools" },
];

export { integrations, categories };
export type { Integration, IntegrationCategory };

export default function Integrations() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Navigation state
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory>("project");
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  
  // MS Project integration states
  const [mppFullPage, setMppFullPage] = useState(false);
  const [powerBiDetailOpen, setPowerBiDetailOpen] = useState(false);
  const [expandedImports, setExpandedImports] = useState<Set<number>>(new Set());
  const [selectedImportId, setSelectedImportId] = useState<number | null>(null);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [convertingImport, setConvertingImport] = useState<MppImportWithTasks | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectPortfolio, setProjectPortfolio] = useState("");
  const [projectStatus, setProjectStatus] = useState("Initiation");
  const [projectPriority, setProjectPriority] = useState("Medium");
  
  // Multi-file upload states
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Map<string, 'pending' | 'uploading' | 'success' | 'error'>>(new Map());
  
  // Batch selection states
  const [selectedImports, setSelectedImports] = useState<Set<number>>(new Set());
  const [batchConvertModalOpen, setBatchConvertModalOpen] = useState(false);
  const [batchPortfolio, setBatchPortfolio] = useState("");
  const [batchStatus, setBatchStatus] = useState("Initiation");
  const [batchPriority, setBatchPriority] = useState("Medium");

  // Sync to existing project states
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncingImport, setSyncingImport] = useState<MppImportWithTasks | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [syncMode, setSyncMode] = useState<'merge' | 'replace'>('merge');
  
  // Power BI integration states
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const [powerBiDocsOpen, setPowerBiDocsOpen] = useState(false);
  
  // Project Online integration states
  const [showProjectOnlineWizard, setShowProjectOnlineWizard] = useState(false);
  
  // Microsoft Planner integration states
  const [showPlannerWizard, setShowPlannerWizard] = useState(false);
  
  // Planner Premium (Dataverse) integration states
  const [showPlannerPremiumWizard, setShowPlannerPremiumWizard] = useState(false);
  
  // Auto-open Planner Premium wizard after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dataverseConnected") === "true") {
      setShowPlannerPremiumWizard(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  
  // Planner connection status - organization scoped
  const { data: plannerStatus, refetch: refetchPlannerStatus } = useQuery<{ configured: boolean; connected: boolean }>({
    queryKey: ["/api/planner/status", currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/planner/status?organizationId=${currentOrganization?.id}`);
      if (!res.ok) throw new Error('Failed to fetch planner status');
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });
  
  const disconnectPlannerMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/planner/disconnect", { 
        organizationId: currentOrganization?.id 
      });
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    },
    onSuccess: () => {
      refetchPlannerStatus();
      toast({ title: "Disconnected", description: "Disconnected from Microsoft Planner" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

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

  // Upload a single file and return the result
  const uploadSingleFile = async (file: File): Promise<{ success: boolean; name: string }> => {
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
    return { success: true, name: file.name };
  };

  // Upload multiple files sequentially
  const uploadMultipleFiles = async (files: File[]) => {
    const fileNames = files.map(f => f.name);
    setUploadingFiles(fileNames);
    
    const newProgress = new Map<string, 'pending' | 'uploading' | 'success' | 'error'>();
    fileNames.forEach(name => newProgress.set(name, 'pending'));
    setUploadProgress(newProgress);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      setUploadProgress(prev => new Map(prev).set(file.name, 'uploading'));
      
      try {
        await uploadSingleFile(file);
        setUploadProgress(prev => new Map(prev).set(file.name, 'success'));
        successCount++;
      } catch (error) {
        setUploadProgress(prev => new Map(prev).set(file.name, 'error'));
        errorCount++;
      }
    }
    
    // Clear after a delay
    setTimeout(() => {
      setUploadingFiles([]);
      setUploadProgress(new Map());
    }, 3000);
    
    queryClient.invalidateQueries({ queryKey: ['/api/mpp-imports'] });
    
    if (successCount > 0) {
      toast({ 
        title: "Upload Complete", 
        description: `${successCount} file(s) imported successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}` 
      });
    } else {
      toast({ title: "Upload Failed", description: "All files failed to upload", variant: "destructive" });
    }
  };

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

  const { data: orgProjects } = useQuery<Project[]>({
    queryKey: ['/api/projects', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/projects?organizationId=${currentOrganization?.id}`);
      if (!res.ok) throw new Error('Failed to fetch projects');
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

  const syncMutation = useMutation({
    mutationFn: async (data: { importId: number; projectId: number; syncMode: 'merge' | 'replace' }) => {
      const res = await apiRequest('POST', `/api/mpp-imports/${data.importId}/sync`, {
        projectId: data.projectId,
        syncMode: data.syncMode,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Project Updated", 
        description: data.message || `Tasks synchronized successfully`,
      });
      setSyncModalOpen(false);
      setSyncingImport(null);
      queryClient.invalidateQueries({ queryKey: ['/api/mpp-imports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const batchConvertMutation = useMutation({
    mutationFn: async (data: { importIds: number[]; portfolioId?: number; status: string; priority: string }) => {
      const res = await apiRequest('POST', '/api/mpp-imports/batch-convert', {
        importIds: data.importIds,
        portfolioId: data.portfolioId,
        status: data.status,
        priority: data.priority,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Projects Created", 
        description: data.message || `${data.projectCount} projects created`,
      });
      setBatchConvertModalOpen(false);
      setSelectedImports(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/mpp-imports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.name.endsWith('.mpp') || file.name.endsWith('.xml') || file.name.endsWith('.csv')
    );
    
    if (files.length > 0) {
      uploadMultipleFiles(files);
    }
  }, [currentOrganization?.id]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      uploadMultipleFiles(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [currentOrganization?.id]);

  const openConvertModal = (imp: MppImportWithTasks) => {
    setConvertingImport(imp);
    setProjectName(imp.fileName.replace(/\.(mpp|xml|csv)$/i, ''));
    setProjectPortfolio("");
    setProjectStatus("Initiation");
    setProjectPriority("Medium");
    setConvertModalOpen(true);
  };

  const openSyncModal = (imp: MppImportWithTasks) => {
    setSyncingImport(imp);
    setSelectedProjectId(imp.projectId?.toString() || "");
    setSyncMode('merge');
    setSyncModalOpen(true);
  };

  const toggleImportSelection = (importId: number) => {
    setSelectedImports(prev => {
      const newSet = new Set(prev);
      if (newSet.has(importId)) {
        newSet.delete(importId);
      } else {
        newSet.add(importId);
      }
      return newSet;
    });
  };

  const selectAllUnconverted = () => {
    const unconverted = imports?.filter(imp => !imp.projectId && imp.status !== "converted") || [];
    setSelectedImports(new Set(unconverted.map(imp => imp.id)));
  };

  const clearSelection = () => {
    setSelectedImports(new Set());
  };

  // Get unconverted imports for batch actions
  const unconvertedImports = imports?.filter(imp => !imp.projectId && imp.status !== "converted") || [];
  const selectedUnconvertedCount = Array.from(selectedImports).filter(id => 
    unconvertedImports.some(imp => imp.id === id)
  ).length;

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

  const handleIntegrationClick = (integration: Integration) => {
    if (integration.status === "coming_soon") {
      setSelectedIntegration(integration);
      setComingSoonOpen(true);
    } else if (integration.id === "ms-project") {
      setMppFullPage(true);
    } else if (integration.id === "power-bi") {
      setPowerBiDetailOpen(true);
    } else if (integration.id === "project-online") {
      setShowProjectOnlineWizard(true);
    } else if (integration.id === "planner") {
      setShowPlannerWizard(true);
    } else if (integration.id === "planner-premium") {
      setShowPlannerPremiumWizard(true);
    }
  };

  const filteredIntegrations = integrations.filter(i => i.category === activeCategory);

  // Full-page MS Project view
  if (mppFullPage) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setMppFullPage(false)} data-testid="button-back-integrations">
            <ChevronRight className="h-4 w-4 rotate-180 mr-2" />
            Back to Integrations
          </Button>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
            <FileSpreadsheet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Microsoft Project Connector</h1>
            <p className="text-muted-foreground">Import task schedules from MS Project files</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Upload Files</CardTitle>
              <CardDescription>Import MPP, XML, or CSV files from MS Project</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="font-medium text-sm mb-2">Supported Formats</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="default">MPP (Native)</Badge>
                    <Badge variant="secondary">XML (MSPDI)</Badge>
                    <Badge variant="secondary">CSV</Badge>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="font-medium text-sm mb-2">Imported Fields</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>Task Name &amp; WBS</li>
                    <li>Start/Finish Date, Duration</li>
                    <li>% Complete, Hierarchy</li>
                  </ul>
                </div>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                  transition-colors duration-200
                  ${isDragOver 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }
                `}
                data-testid="dropzone-upload"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mpp,.xml,.csv"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file-upload"
                />
                
                {uploadingFiles.length > 0 ? (
                  <div className="space-y-3">
                    <Files className="mx-auto h-10 w-10 text-primary" />
                    <div className="text-sm font-medium">Uploading {uploadingFiles.length} file(s)...</div>
                    <div className="space-y-2 max-h-32 overflow-auto">
                      {uploadingFiles.map((fileName) => (
                        <div key={fileName} className="flex items-center justify-center gap-2 text-sm">
                          {uploadProgress.get(fileName) === 'uploading' && (
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                          )}
                          {uploadProgress.get(fileName) === 'success' && (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          )}
                          {uploadProgress.get(fileName) === 'error' && (
                            <X className="h-3 w-3 text-destructive" />
                          )}
                          {uploadProgress.get(fileName) === 'pending' && (
                            <Clock className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className="truncate max-w-[200px]">{fileName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload className={`mx-auto h-10 w-10 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div>
                      <p className="text-sm font-medium">
                        {isDragOver ? 'Drop files here' : 'Drag and drop files here'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        or click to browse - supports multiple files
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Import History</CardTitle>
                <CardDescription>Previously imported project files</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {unconvertedImports.length > 0 && (
                  <>
                    {selectedImports.size > 0 ? (
                      <>
                        <Badge variant="secondary">{selectedUnconvertedCount} selected</Badge>
                        <Button variant="outline" size="sm" onClick={clearSelection} data-testid="button-clear-selection">
                          Clear
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => {
                            setBatchPortfolio("");
                            setBatchStatus("Initiation");
                            setBatchPriority("Medium");
                            setBatchConvertModalOpen(true);
                          }}
                          disabled={selectedUnconvertedCount === 0}
                          data-testid="button-batch-convert"
                        >
                          <FolderPlus className="mr-2 h-4 w-4" />
                          Create All
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" onClick={selectAllUnconverted} data-testid="button-select-all">
                        <Files className="mr-2 h-4 w-4" />
                        Select All ({unconvertedImports.length})
                      </Button>
                    )}
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-imports">
                  <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
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
                <div className="space-y-2 max-h-96 overflow-auto">
                  {imports.map((imp) => {
                    const isUnconverted = !imp.projectId && imp.status !== "converted";
                    const isSelected = selectedImports.has(imp.id);
                    
                    return (
                      <div key={imp.id} className={`flex items-center justify-between p-3 rounded-lg border ${isSelected ? 'border-primary bg-primary/5' : 'bg-background'}`}>
                        <div className="flex items-center gap-3">
                          {isUnconverted && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleImportSelection(imp.id)}
                              data-testid={`checkbox-select-import-${imp.id}`}
                            />
                          )}
                          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{imp.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {imp.taskCount} tasks • {imp.lastSyncedAt ? formatDistanceToNow(new Date(imp.lastSyncedAt), { addSuffix: true }) : 'N/A'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {imp.projectId ? (
                            <>
                              <Badge variant="default" className="bg-green-600">Converted</Badge>
                              <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${imp.projectId}`)} data-testid={`button-view-project-${imp.id}`}>
                                <ExternalLink className="h-4 w-4 mr-1" />
                                View
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openSyncModal(imp)} data-testid={`button-resync-project-${imp.id}`}>
                                <RefreshCw className="h-4 w-4 mr-1" />
                                Re-sync
                              </Button>
                            </>
                          ) : imp.status === "converted" ? (
                            <Badge variant="default" className="bg-green-600">Converted</Badge>
                          ) : (
                            <>
                              <Button size="sm" onClick={() => openConvertModal(imp)} data-testid={`button-create-project-${imp.id}`}>
                                <FolderPlus className="h-4 w-4 mr-1" />
                                Create Project
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => openSyncModal(imp)} data-testid={`button-sync-project-${imp.id}`}>
                                <Link2 className="h-4 w-4 mr-1" />
                                Update Existing
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(imp.id)} disabled={deleteMutation.isPending} data-testid={`button-delete-import-${imp.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Convert Modal */}
        <Dialog open={convertModalOpen} onOpenChange={setConvertModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project from Import</DialogTitle>
              <DialogDescription>
                Convert "{convertingImport?.fileName}" into a new project with {convertingImport?.taskCount} tasks
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input 
                  value={projectName} 
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name"
                  data-testid="input-project-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Portfolio (Optional)</Label>
                <Select value={projectPortfolio} onValueChange={setProjectPortfolio}>
                  <SelectTrigger data-testid="select-portfolio">
                    <SelectValue placeholder="Select a portfolio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Portfolio</SelectItem>
                    {portfolios?.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={projectStatus} onValueChange={setProjectStatus}>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Initiation">Initiation</SelectItem>
                      <SelectItem value="Planning">Planning</SelectItem>
                      <SelectItem value="Execution">Execution</SelectItem>
                      <SelectItem value="Monitoring">Monitoring</SelectItem>
                      <SelectItem value="Closing">Closing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
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
              <Button variant="outline" onClick={() => setConvertModalOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => convertingImport && convertMutation.mutate({
                  importId: convertingImport.id,
                  name: projectName,
                  portfolioId: projectPortfolio && projectPortfolio !== "none" ? parseInt(projectPortfolio) : undefined,
                  status: projectStatus,
                  priority: projectPriority,
                })}
                disabled={!projectName || convertMutation.isPending}
                data-testid="button-confirm-create"
              >
                {convertMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Sync Modal */}
        <Dialog open={syncModalOpen} onOpenChange={setSyncModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Existing Project</DialogTitle>
              <DialogDescription>
                Sync tasks from "{syncingImport?.fileName}" to an existing project
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Select Project</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger data-testid="select-target-project">
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgProjects?.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sync Mode</Label>
                <Select value={syncMode} onValueChange={(v: 'merge' | 'replace') => setSyncMode(v)}>
                  <SelectTrigger data-testid="select-sync-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merge">Merge (Add new, update existing)</SelectItem>
                    <SelectItem value="replace">Replace (Remove all, add from import)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSyncModalOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => syncingImport && selectedProjectId && syncMutation.mutate({
                  importId: syncingImport.id,
                  projectId: parseInt(selectedProjectId),
                  syncMode,
                })}
                disabled={!selectedProjectId || syncMutation.isPending}
                data-testid="button-confirm-sync"
              >
                {syncMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sync Tasks
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Batch Convert Modal */}
        <Dialog open={batchConvertModalOpen} onOpenChange={setBatchConvertModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Batch Create Projects</DialogTitle>
              <DialogDescription>
                Create {selectedUnconvertedCount} projects from selected imports
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Portfolio (Optional)</Label>
                <Select value={batchPortfolio} onValueChange={setBatchPortfolio}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a portfolio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Portfolio</SelectItem>
                    {portfolios?.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={batchStatus} onValueChange={setBatchStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Initiation">Initiation</SelectItem>
                      <SelectItem value="Planning">Planning</SelectItem>
                      <SelectItem value="Execution">Execution</SelectItem>
                      <SelectItem value="Monitoring">Monitoring</SelectItem>
                      <SelectItem value="Closing">Closing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={batchPriority} onValueChange={setBatchPriority}>
                    <SelectTrigger>
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
              <Button variant="outline" onClick={() => setBatchConvertModalOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => batchConvertMutation.mutate({
                  importIds: Array.from(selectedImports),
                  portfolioId: batchPortfolio && batchPortfolio !== "none" ? parseInt(batchPortfolio) : undefined,
                  status: batchStatus,
                  priority: batchPriority,
                })}
                disabled={batchConvertMutation.isPending}
              >
                {batchConvertMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create {selectedUnconvertedCount} Projects
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left Navigation */}
      <div className="w-64 border-r bg-muted/30 p-4 shrink-0">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">Integrations</h2>
          <p className="text-sm text-muted-foreground">Connect your tools</p>
        </div>
        
        <nav className="space-y-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                activeCategory === cat.id 
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              data-testid={`nav-category-${cat.id}`}
            >
              {cat.icon}
              <span>{cat.name}</span>
              <Badge variant="secondary" className="ml-auto text-xs">
                {integrations.filter(i => i.category === cat.id).length}
              </Badge>
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            {categories.find(c => c.id === activeCategory)?.name}
          </h1>
          <p className="text-muted-foreground">
            {categories.find(c => c.id === activeCategory)?.description}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredIntegrations.map((integration) => {
            const isPlannerConnected = integration.id === "planner" && plannerStatus?.connected;
            
            return (
              <Card 
                key={integration.id} 
                className="hover-elevate cursor-pointer"
                onClick={() => handleIntegrationClick(integration)}
                data-testid={`card-integration-${integration.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${integration.bgColor}`}>
                      {integration.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">{integration.name}</h3>
                        {isPlannerConnected ? (
                          <Badge variant="default" className="text-xs bg-green-600">Connected</Badge>
                        ) : integration.status === "active" && (
                          <Badge variant="default" className="text-xs bg-green-600">Active</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{integration.description}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {isPlannerConnected ? (
                      <>
                        <Button 
                          variant="default" 
                          size="sm" 
                          className="flex-1"
                          data-testid={`button-configure-${integration.id}`}
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          Import Plans
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            disconnectPlannerMutation.mutate();
                          }}
                          disabled={disconnectPlannerMutation.isPending}
                          data-testid="button-disconnect-planner-card"
                        >
                          {disconnectPlannerMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </Button>
                      </>
                    ) : (
                      <Button 
                        variant={integration.status === "active" ? "default" : "outline"} 
                        size="sm" 
                        className="w-full"
                        data-testid={`button-configure-${integration.id}`}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        {integration.status === "active" ? "Configure" : "Learn More"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Coming Soon Dialog */}
      <Dialog open={comingSoonOpen} onOpenChange={setComingSoonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedIntegration && (
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${selectedIntegration.bgColor}`}>
                  {selectedIntegration.icon}
                </div>
              )}
              {selectedIntegration?.name} Integration
            </DialogTitle>
            <DialogDescription>
              This integration is coming soon! We're working hard to bring you seamless connectivity with {selectedIntegration?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <div className="rounded-lg border bg-muted/30 p-4 text-center">
              <Rocket className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <h4 className="font-medium mb-2">Coming Soon</h4>
              <p className="text-sm text-muted-foreground">
                We'll notify you when the {selectedIntegration?.name} integration is available. Stay tuned!
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComingSoonOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Power BI Detail Dialog */}
      <Dialog open={powerBiDetailOpen} onOpenChange={setPowerBiDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900">
                <BarChart3 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              Power BI Connector
            </DialogTitle>
            <DialogDescription>
              Connect your data to Power BI dashboards
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="font-medium text-sm mb-2">Available Data Endpoints</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Use these REST API endpoints in Power BI's Web connector to import your data.
              </p>
              <div className="space-y-2">
                {[
                  { name: 'Projects', endpoint: '/api/analytics/projects', desc: 'All projects with metrics' },
                  { name: 'Portfolios', endpoint: '/api/analytics/portfolios', desc: 'Portfolio summaries' },
                  { name: 'Risks', endpoint: '/api/analytics/risks', desc: 'Project risks' },
                  { name: 'Issues', endpoint: '/api/analytics/issues', desc: 'Project issues' },
                  { name: 'Milestones', endpoint: '/api/analytics/milestones', desc: 'Milestone data' },
                  { name: 'Summary', endpoint: '/api/analytics/summary', desc: 'Organization KPIs' },
                ].map((item) => (
                  <div key={item.endpoint} className="flex items-center justify-between gap-2 p-2 rounded-md bg-background border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const url = `${window.location.origin}${item.endpoint}`;
                        navigator.clipboard.writeText(url);
                        setCopiedEndpoint(item.endpoint);
                        setTimeout(() => setCopiedEndpoint(null), 2000);
                        toast({ title: "Copied", description: `${item.name} endpoint copied to clipboard` });
                      }}
                      data-testid={`button-copy-${item.name.toLowerCase()}`}
                    >
                      {copiedEndpoint === item.endpoint ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="font-medium text-sm mb-2">Setup Instructions</h4>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Open Power BI Desktop</li>
                <li>Select <strong>Get Data</strong> &rarr; <strong>Web</strong></li>
                <li>Paste the endpoint URL and authenticate</li>
                <li>Transform and load your data</li>
              </ol>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setPowerBiDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert to Project Modal */}
      <Dialog open={convertModalOpen} onOpenChange={setConvertModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project from Import</DialogTitle>
            <DialogDescription>
              Convert "{convertingImport?.fileName}" into a new project with {convertingImport?.taskCount} tasks
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input 
                value={projectName} 
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
                data-testid="input-project-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Portfolio (Optional)</Label>
              <Select value={projectPortfolio} onValueChange={setProjectPortfolio}>
                <SelectTrigger data-testid="select-portfolio">
                  <SelectValue placeholder="Select a portfolio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Portfolio</SelectItem>
                  {portfolios?.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={projectStatus} onValueChange={setProjectStatus}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Initiation">Initiation</SelectItem>
                    <SelectItem value="Planning">Planning</SelectItem>
                    <SelectItem value="Execution">Execution</SelectItem>
                    <SelectItem value="Monitoring">Monitoring</SelectItem>
                    <SelectItem value="Closing">Closing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
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
            <Button variant="outline" onClick={() => setConvertModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => convertingImport && convertMutation.mutate({
                importId: convertingImport.id,
                name: projectName,
                portfolioId: projectPortfolio && projectPortfolio !== "none" ? parseInt(projectPortfolio) : undefined,
                status: projectStatus,
                priority: projectPriority,
              })}
              disabled={!projectName || convertMutation.isPending}
              data-testid="button-confirm-create"
            >
              {convertMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync Modal */}
      <Dialog open={syncModalOpen} onOpenChange={setSyncModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Existing Project</DialogTitle>
            <DialogDescription>
              Sync tasks from "{syncingImport?.fileName}" to an existing project
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Project</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger data-testid="select-target-project">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {orgProjects?.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sync Mode</Label>
              <Select value={syncMode} onValueChange={(v: 'merge' | 'replace') => setSyncMode(v)}>
                <SelectTrigger data-testid="select-sync-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Merge (Add new, update existing)</SelectItem>
                  <SelectItem value="replace">Replace (Remove all, add from import)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => syncingImport && selectedProjectId && syncMutation.mutate({
                importId: syncingImport.id,
                projectId: parseInt(selectedProjectId),
                syncMode,
              })}
              disabled={!selectedProjectId || syncMutation.isPending}
              data-testid="button-confirm-sync"
            >
              {syncMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sync Tasks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Convert Modal */}
      <Dialog open={batchConvertModalOpen} onOpenChange={setBatchConvertModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch Create Projects</DialogTitle>
            <DialogDescription>
              Create {selectedUnconvertedCount} projects from selected imports
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Portfolio (Optional)</Label>
              <Select value={batchPortfolio} onValueChange={setBatchPortfolio}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a portfolio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Portfolio</SelectItem>
                  {portfolios?.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={batchStatus} onValueChange={setBatchStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Initiation">Initiation</SelectItem>
                    <SelectItem value="Planning">Planning</SelectItem>
                    <SelectItem value="Execution">Execution</SelectItem>
                    <SelectItem value="Monitoring">Monitoring</SelectItem>
                    <SelectItem value="Closing">Closing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={batchPriority} onValueChange={setBatchPriority}>
                  <SelectTrigger>
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
            <Button variant="outline" onClick={() => setBatchConvertModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => batchConvertMutation.mutate({
                importIds: Array.from(selectedImports),
                portfolioId: batchPortfolio && batchPortfolio !== "none" ? parseInt(batchPortfolio) : undefined,
                status: batchStatus,
                priority: batchPriority,
              })}
              disabled={batchConvertMutation.isPending}
            >
              {batchConvertMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create {selectedUnconvertedCount} Projects
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Project Online Import Wizard */}
      <ProjectOnlineImportWizard
        open={showProjectOnlineWizard}
        onOpenChange={setShowProjectOnlineWizard}
        organizationId={currentOrganization?.id || 0}
        portfolios={portfolios || []}
      />
      
      {/* Microsoft Planner Import Wizard */}
      <PlannerImportWizard
        open={showPlannerWizard}
        onOpenChange={setShowPlannerWizard}
        organizationId={currentOrganization?.id || 0}
        portfolios={portfolios || []}
      />
      
      {/* Planner Premium Bulk Import Wizard */}
      <PlannerPremiumBulkImportWizard
        open={showPlannerPremiumWizard}
        onOpenChange={setShowPlannerPremiumWizard}
        organizationId={currentOrganization?.id || 0}
        portfolios={portfolios || []}
      />
    </div>
  );
}
