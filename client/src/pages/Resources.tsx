import { useState, useRef, useEffect } from "react";
import { useResources, useCreateResource, useUpdateResource, useDeleteResource } from "@/hooks/use-resources";
import { useOrganization } from "@/hooks/use-organization";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Users, Pencil, Trash2, Mail, Briefcase, DollarSign, MoreVertical, Download, Upload, UserCircle, GitMerge, ArrowRight, Check, ExternalLink } from "lucide-react";
import { MicrosoftContactCard } from "@/components/MicrosoftContactCard";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ExcelJS from "exceljs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertResourceSchema } from "@shared/schema";
import type { InsertResource, Resource } from "@shared/schema";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const resourceFormSchema = insertResourceSchema.extend({
  displayName: z.string().min(1, "Name is required"),
});

type ResourceFormData = z.infer<typeof resourceFormSchema>;

export default function Resources() {
  const { currentOrganization } = useOrganization();
  const { data: resources, isLoading } = useResources(currentOrganization?.id || null);
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const deleteResource = useDeleteResource();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [deleteResourceId, setDeleteResourceId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Auto-open merge dialog when navigating from import wizard
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("openMerge") === "true") {
      setIsMergeDialogOpen(true);
      // Clean up the URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleExportToExcel = async () => {
    if (!resources || resources.length === 0) {
      toast({ title: "No data", description: "There are no resources to export", variant: "destructive" });
      return;
    }
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Resources");
    
    worksheet.columns = [
      { header: "Name", key: "name", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Title", key: "title", width: 20 },
      { header: "Department", key: "department", width: 20 },
      { header: "Skills", key: "skills", width: 30 },
      { header: "Hourly Rate", key: "hourlyRate", width: 12 },
      { header: "Active", key: "active", width: 8 },
      { header: "Notes", key: "notes", width: 40 }
    ];
    
    resources.forEach(r => {
      worksheet.addRow({
        name: r.displayName,
        email: r.email || "",
        title: r.title || "",
        department: r.department || "",
        skills: r.skills || "",
        hourlyRate: r.hourlyRate || "",
        active: r.isActive ? "Yes" : "No",
        notes: r.notes || ""
      });
    });
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Resources_${new Date().toISOString().split("T")[0]}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast({ title: "Success", description: `Exported ${resources.length} resources to Excel` });
  };

  const handleImportFromExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentOrganization) return;
    setIsImporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error("No worksheet found");
      }
      
      const headers: string[] = [];
      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value || "");
      });
      
      const jsonData: Record<string, string>[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rowData: Record<string, string> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = String(cell.value || "");
          }
        });
        jsonData.push(rowData);
      });
      
      let imported = 0;
      let skipped = 0;
      for (const row of jsonData) {
        const name = row["Name"] || row["name"] || row["Display Name"] || row["displayName"];
        if (!name || typeof name !== "string" || name.trim() === "") {
          skipped++;
          continue;
        }
        try {
          await createResource.mutateAsync({
            organizationId: currentOrganization.id,
            displayName: name.trim(),
            email: (row["Email"] || row["email"] || "").toString().trim() || null,
            title: (row["Title"] || row["title"] || "").toString().trim() || null,
            department: (row["Department"] || row["department"] || "").toString().trim() || null,
            skills: (row["Skills"] || row["skills"] || "").toString().trim() || null,
            hourlyRate: (row["Hourly Rate"] || row["hourlyRate"] || row["Rate"] || "").toString().trim() || null,
            isActive: (row["Active"] || row["active"] || "Yes").toString().toLowerCase() !== "no",
            notes: (row["Notes"] || row["notes"] || "").toString().trim() || null
          });
          imported++;
        } catch (err: any) {
          if (err?.limitExceeded) {
            toast({ 
              title: "Credit Limit Reached", 
              description: `Imported ${imported} resources. ${err.message || "Please upgrade your plan to import more."}`, 
              variant: "destructive" 
            });
            break;
          }
          skipped++;
        }
      }
      toast({ 
        title: "Import Complete", 
        description: `Imported ${imported} resources${skipped > 0 ? `, skipped ${skipped} rows` : ""}` 
      });
    } catch (err) {
      toast({ title: "Import Failed", description: "Could not read the Excel file", variant: "destructive" });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const filteredResources = resources?.filter(r => 
    r.displayName.toLowerCase().includes(search.toLowerCase()) || 
    r.email?.toLowerCase().includes(search.toLowerCase()) ||
    r.title?.toLowerCase().includes(search.toLowerCase()) ||
    r.department?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    const idToDelete = deleteResourceId;
    const orgId = currentOrganization?.id;
    if (idToDelete && orgId) {
      setDeleteResourceId(null);
      try {
        await deleteResource.mutateAsync({ id: idToDelete, organizationId: orgId });
        toast({ title: "Success", description: "Resource deleted" });
      } catch (err) {
        toast({ title: "Error", description: "Failed to delete resource", variant: "destructive" });
      }
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Resources</h1>
          <p className="mt-1 text-muted-foreground">Manage your team members and assign them to tasks, issues, and risks.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFromExcel}
            accept=".xlsx,.xls"
            className="hidden"
            data-testid="input-import-file"
          />
          <Button 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            data-testid="button-import-resources"
          >
            <Upload className="mr-2 h-4 w-4" />
            {isImporting ? "Importing..." : "Import"}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExportToExcel}
            disabled={!resources || resources.length === 0}
            data-testid="button-export-resources"
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setIsMergeDialogOpen(true)}
            disabled={!resources || resources.length < 2}
            data-testid="button-merge-resources"
          >
            <GitMerge className="mr-2 h-4 w-4" />
            Match & Merge
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-resource">
            <Plus className="mr-2 h-4 w-4" />
            Add Resource
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input 
          className="pl-10 max-w-md bg-card border-border" 
          placeholder="Search resources..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-search-resources"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Team Resources</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredResources?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="mx-auto h-12 w-12 text-slate-300 mb-4" />
              <p>No resources found. Add your first team member to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResources?.map((resource, index) => (
                  <motion.tr
                    key={resource.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group"
                    data-testid={`row-resource-${resource.id}`}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <MicrosoftContactCard
                          displayName={resource.displayName}
                          email={resource.email}
                          title={resource.title}
                          department={resource.department}
                          phone={resource.phone}
                          photoUrl={resource.photoUrl}
                          side="right"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold cursor-pointer hover:bg-primary/20 transition-colors">
                            {resource.displayName.charAt(0).toUpperCase()}
                          </div>
                        </MicrosoftContactCard>
                        <MicrosoftContactCard
                          displayName={resource.displayName}
                          email={resource.email}
                          title={resource.title}
                          department={resource.department}
                          phone={resource.phone}
                          side="top"
                          align="start"
                        >
                          <span 
                            className="cursor-pointer hover:text-primary hover:underline"
                            onClick={() => window.location.href = `/resources/${resource.id}`}
                            data-testid={`link-resource-name-${resource.id}`}
                          >
                            {resource.displayName}
                          </span>
                        </MicrosoftContactCard>
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {resource.email || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {resource.title || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {resource.department || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {resource.hourlyRate ? `$${resource.hourlyRate}/hr` : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={resource.isActive ? "default" : "secondary"} className={resource.isActive ? "bg-emerald-100 text-emerald-700" : ""}>
                          {resource.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {resource.isApprover && (
                          <Badge variant="outline" className="text-blue-600 border-blue-300">
                            Approver
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`button-menu-resource-${resource.id}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.preventDefault();
                              setEditingResource(resource);
                            }} 
                            data-testid={`menu-edit-resource-${resource.id}`}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.preventDefault();
                              setDeleteResourceId(resource.id);
                            }} 
                            className="text-red-600 focus:text-red-600"
                            data-testid={`menu-delete-resource-${resource.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ResourceDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        organizationId={currentOrganization?.id}
        onSuccess={() => {
          setIsCreateDialogOpen(false);
          toast({ title: "Success", description: "Resource created" });
        }}
      />

      {editingResource && (
        <ResourceDialog
          open={!!editingResource}
          onOpenChange={(open) => !open && setEditingResource(null)}
          organizationId={currentOrganization?.id}
          resource={editingResource}
          onSuccess={() => {
            setEditingResource(null);
            toast({ title: "Success", description: "Resource updated" });
          }}
        />
      )}

      <AlertDialog open={!!deleteResourceId} onOpenChange={(open) => !open && setDeleteResourceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resource</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this resource? This will also remove all their task, issue, and risk assignments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              type="button"
              onClick={() => {
                handleDelete();
              }} 
              className="bg-red-600 hover:bg-red-700" 
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MergeResourcesDialog
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
        organizationId={currentOrganization?.id}
        onMergeComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
          toast({ title: "Success", description: "Resources merged successfully" });
        }}
      />
    </div>
  );
}

interface ResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number | undefined;
  resource?: Resource;
  onSuccess: () => void;
}

interface OrgMember {
  userId: string;
  role: string;
  user?: {
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  };
}

function ResourceDialog({ open, onOpenChange, organizationId, resource, onSuccess }: ResourceDialogProps) {
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const isEditing = !!resource;
  const [selectedUserId, setSelectedUserId] = useState<string | null>(resource?.userId || null);
  
  // Fetch organization members for user linking
  const { data: members = [] } = useQuery<OrgMember[]>({
    queryKey: [`/api/organizations/${organizationId}/members`],
    enabled: !!organizationId && open,
  });

  const form = useForm<ResourceFormData>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      organizationId: organizationId || 0,
      displayName: resource?.displayName || "",
      email: resource?.email || "",
      title: resource?.title || "",
      department: resource?.department || "",
      skills: resource?.skills || "",
      hourlyRate: resource?.hourlyRate || "",
      isActive: resource?.isActive ?? true,
      isApprover: resource?.isApprover ?? false,
      notes: resource?.notes || "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        organizationId: organizationId || 0,
        displayName: resource?.displayName || "",
        email: resource?.email || "",
        title: resource?.title || "",
        department: resource?.department || "",
        skills: resource?.skills || "",
        hourlyRate: resource?.hourlyRate || "",
        isActive: resource?.isActive ?? true,
        isApprover: resource?.isApprover ?? false,
        notes: resource?.notes || "",
      });
      setSelectedUserId(resource?.userId || null);
    }
  }, [open, organizationId, resource]);

  const { toast } = useToast();

  const onSubmit = async (data: ResourceFormData) => {
    if (!organizationId) {
      toast({ title: "Error", description: "No organization selected", variant: "destructive" });
      return;
    }
    try {
      const resourceData = {
        organizationId,
        displayName: data.displayName,
        email: data.email || null,
        title: data.title || null,
        department: data.department || null,
        skills: data.skills || null,
        hourlyRate: data.hourlyRate || null,
        isActive: data.isActive ?? true,
        isApprover: data.isApprover ?? false,
        notes: data.notes || null,
        userId: selectedUserId,
      };
      if (isEditing && resource) {
        await updateResource.mutateAsync({ id: resource.id, updates: resourceData });
      } else {
        await createResource.mutateAsync(resourceData);
      }
      onSuccess();
      form.reset();
    } catch (err: any) {
      console.error("Failed to save resource:", err?.message || err);
      if (err?.limitExceeded) {
        toast({ 
          title: "Credit Limit Reached", 
          description: err.message || "Please upgrade your plan to create more resources.", 
          variant: "destructive" 
        });
        onOpenChange(false);
      } else {
        toast({ 
          title: "Error", 
          description: err?.message || "Failed to save resource", 
          variant: "destructive" 
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Resource" : "Add New Resource"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="displayName">Name *</Label>
              <Input id="displayName" {...form.register("displayName")} placeholder="John Smith" data-testid="input-resource-name" />
              {form.formState.errors.displayName && (
                <p className="text-sm text-red-500 mt-1">{form.formState.errors.displayName.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...form.register("email")} placeholder="john@example.com" data-testid="input-resource-email" />
            </div>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" {...form.register("title")} placeholder="Software Engineer" data-testid="input-resource-title" />
            </div>
            <div>
              <Label htmlFor="department">Department</Label>
              <Input id="department" {...form.register("department")} placeholder="Engineering" data-testid="input-resource-department" />
            </div>
            <div>
              <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
              <Input id="hourlyRate" {...form.register("hourlyRate")} placeholder="100" data-testid="input-resource-rate" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="skills">Skills</Label>
              <Input id="skills" {...form.register("skills")} placeholder="React, TypeScript, Node.js" data-testid="input-resource-skills" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" {...form.register("notes")} placeholder="Additional notes..." data-testid="input-resource-notes" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="userId" className="flex items-center gap-2">
                <UserCircle className="h-4 w-4" />
                Link to User Account
              </Label>
              <Select
                value={selectedUserId || "none"}
                onValueChange={(value) => setSelectedUserId(value === "none" ? null : value)}
              >
                <SelectTrigger data-testid="select-resource-user">
                  <SelectValue placeholder="Select a user account..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked user</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.user?.firstName && member.user?.lastName
                        ? `${member.user.firstName} ${member.user.lastName}`
                        : member.user?.email || member.userId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Link this resource to a user account to enable timesheet logging
              </p>
            </div>
            <div className="col-span-2 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="isActive"
                  checked={form.watch("isActive") ?? true}
                  onCheckedChange={(checked) => form.setValue("isActive", checked)}
                  data-testid="switch-resource-active"
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="isApprover"
                  checked={form.watch("isApprover") ?? false}
                  onCheckedChange={(checked) => form.setValue("isApprover", checked)}
                  data-testid="switch-resource-approver"
                />
                <Label htmlFor="isApprover" className="text-sm">
                  Timesheet Approver
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-resource">
              Cancel
            </Button>
            <Button type="submit" disabled={createResource.isPending || updateResource.isPending} data-testid="button-save-resource">
              {isEditing ? "Save Changes" : "Create Resource"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface MergeResourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number | undefined;
  onMergeComplete: () => void;
}

interface DuplicateGroup {
  resources: Resource[];
  matchType: string;
}

function MergeResourcesDialog({ open, onOpenChange, organizationId, onMergeComplete }: MergeResourcesDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPrimary, setSelectedPrimary] = useState<{ [groupIndex: number]: number }>({});

  const { data: duplicatesData, isLoading, refetch } = useQuery<{ duplicateGroups: DuplicateGroup[] }>({
    queryKey: ['/api/resources/duplicates', organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/resources/duplicates?organizationId=${organizationId}`);
      if (!res.ok) throw new Error('Failed to fetch duplicates');
      return res.json();
    },
    enabled: !!organizationId && open,
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ primaryId, secondaryId }: { primaryId: number; secondaryId: number }) => {
      return apiRequest('POST', '/api/resources/merge', { primaryId, secondaryId, organizationId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
    },
  });

  const handleMergeGroup = async (groupIndex: number, resources: Resource[]) => {
    const primaryId = selectedPrimary[groupIndex] || resources[0].id;
    const secondaryResources = resources.filter(r => r.id !== primaryId);
    
    try {
      for (const secondary of secondaryResources) {
        await mergeMutation.mutateAsync({ primaryId, secondaryId: secondary.id });
      }
      toast({ title: "Merged", description: `Merged ${secondaryResources.length} duplicate(s) into primary resource` });
      onMergeComplete();
      setSelectedPrimary({});
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to merge resources", variant: "destructive" });
    }
  };

  const duplicateGroups = duplicatesData?.duplicateGroups || [];

  useEffect(() => {
    if (open) {
      setSelectedPrimary({});
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Match & Merge Duplicates
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : duplicateGroups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Check className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <p className="font-medium text-foreground">No duplicates found</p>
            <p className="text-sm mt-1">All resources appear to be unique.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Found {duplicateGroups.length} group(s) of potential duplicates. Select the primary resource to keep for each group, then merge.
            </p>
            
            {duplicateGroups.map((group, groupIndex) => (
              <Card key={groupIndex} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {group.matchType === 'email' ? 'Email Match' : 'Name Match'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {group.resources.length} resources
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleMergeGroup(groupIndex, group.resources)}
                    disabled={mergeMutation.isPending}
                    data-testid={`button-merge-group-${groupIndex}`}
                  >
                    <GitMerge className="h-4 w-4 mr-1" />
                    Merge
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {group.resources.map((resource, idx) => {
                    const isPrimary = (selectedPrimary[groupIndex] || group.resources[0].id) === resource.id;
                    return (
                      <div
                        key={resource.id}
                        className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                          isPrimary 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-muted-foreground/50'
                        }`}
                        onClick={() => setSelectedPrimary(prev => ({ ...prev, [groupIndex]: resource.id }))}
                        data-testid={`resource-option-${resource.id}`}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold shrink-0">
                          {resource.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{resource.displayName}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {resource.email || 'No email'} {resource.title && `• ${resource.title}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isPrimary ? (
                            <Badge variant="default" className="bg-primary">
                              Keep
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-muted-foreground">
                              <ArrowRight className="h-3 w-3 mr-1" />
                              Merge into primary
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-merge">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
