import { useState, useEffect } from "react";
import { usePortfolios, useCreatePortfolio, useUpdatePortfolio } from "@/hooks/use-portfolios";
import { useProjects } from "@/hooks/use-projects";
import { useResources } from "@/hooks/use-resources";
import { useOrganization } from "@/hooks/use-organization";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, FolderOpen, ArrowRight, Pencil, Briefcase, MoreVertical, Trash2, LayoutGrid, List, Users, X, Calendar, DollarSign, Building2, Target } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPortfolioSchema } from "@shared/schema";
import type { InsertPortfolio, Portfolio, Resource } from "@shared/schema";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";

export default function Portfolios() {
  const { currentOrganization } = useOrganization();
  const { data: portfolios, isLoading } = usePortfolios(currentOrganization?.id);
  const { data: projects } = useProjects(currentOrganization?.id);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [deletePortfolioId, setDeletePortfolioId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const { toast } = useToast();

  const deletePortfolio = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/portfolios/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      toast({ title: "Success", description: "Portfolio moved to recycle bin" });
      setDeletePortfolioId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const filteredPortfolios = portfolios
    ?.filter(p => 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      p.description?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

  const getProjectCountForPortfolio = (portfolioId: number) => {
    return projects?.filter(p => p.portfolioId === portfolioId).length || 0;
  };

  const getProjectHealthSummary = (portfolioId: number) => {
    const portfolioProjects = projects?.filter(p => p.portfolioId === portfolioId) || [];
    const green = portfolioProjects.filter(p => p.health === "Green").length;
    const yellow = portfolioProjects.filter(p => p.health === "Yellow").length;
    const red = portfolioProjects.filter(p => p.health === "Red").length;
    return { green, yellow, red, total: portfolioProjects.length };
  };

  const handleEditClick = (e: React.MouseEvent, portfolio: Portfolio) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingPortfolio(portfolio);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Portfolios</h1>
          <p className="mt-1 text-muted-foreground">Manage your strategic project groupings.</p>
        </div>
        <CreatePortfolioDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} organizationId={currentOrganization?.id} />
      </div>

      {/* Search and Filters */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input 
            className="pl-10 bg-card border-border" 
            placeholder="Search portfolios..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-portfolios"
          />
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/30">
          <Button
            variant={viewMode === "cards" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("cards")}
            data-testid="button-view-cards"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("table")}
            data-testid="button-view-table"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Card View */}
      {viewMode === "cards" && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPortfolios?.map((portfolio, index) => {
            const healthSummary = getProjectHealthSummary(portfolio.id);
            return (
              <motion.div
                key={portfolio.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="h-full"
              >
                <Link href={`/portfolios/${portfolio.id}`} className="h-full block">
                  <Card className="group cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all duration-300 h-full flex flex-col" data-testid={`card-portfolio-${portfolio.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                          <FolderOpen className="h-6 w-6" />
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              data-testid={`button-menu-portfolio-${portfolio.id}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.preventDefault()}>
                            <DropdownMenuItem onClick={(e) => { e.preventDefault(); handleEditClick(e as any, portfolio); }} data-testid={`menu-edit-portfolio-${portfolio.id}`}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={(e) => { e.preventDefault(); setDeletePortfolioId(portfolio.id); }} 
                              className="text-red-600 focus:text-red-600"
                              data-testid={`menu-delete-portfolio-${portfolio.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <CardTitle className="mt-4 text-xl">{portfolio.name}</CardTitle>
                      <CardDescription className="line-clamp-2 mt-2">{portfolio.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 flex-1 flex flex-col">
                      {/* Status and Department Row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {portfolio.status && (
                          <Badge 
                            variant="secondary" 
                            className={
                              portfolio.status === "Active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                              portfolio.status === "On Hold" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                              portfolio.status === "Closed" ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" :
                              "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            }
                            data-testid={`badge-status-${portfolio.id}`}
                          >
                            {portfolio.status}
                          </Badge>
                        )}
                        {portfolio.department && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`text-department-${portfolio.id}`}>
                            <Building2 className="h-3 w-3" />
                            <span>{portfolio.department}</span>
                          </div>
                        )}
                      </div>

                      {/* Projects Count */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Briefcase className="h-4 w-4" />
                        <span>{healthSummary.total} Project{healthSummary.total !== 1 ? 's' : ''}</span>
                      </div>
                      
                      {/* Health Summary Badges */}
                      {healthSummary.total > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {healthSummary.green > 0 && (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                              {healthSummary.green} Healthy
                            </Badge>
                          )}
                          {healthSummary.yellow > 0 && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                              {healthSummary.yellow} At Risk
                            </Badge>
                          )}
                          {healthSummary.red > 0 && (
                            <Badge variant="secondary" className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 text-xs">
                              {healthSummary.red} Critical
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Budget Progress */}
                      {portfolio.budgetAllocated && Number(portfolio.budgetAllocated) > 0 && (
                        <div className="space-y-1.5" data-testid={`budget-info-${portfolio.id}`}>
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <DollarSign className="h-3 w-3" />
                              <span>Budget</span>
                            </div>
                            <span className="font-medium">
                              ${Number(portfolio.budgetSpent || 0).toLocaleString()} / ${Number(portfolio.budgetAllocated).toLocaleString()}
                            </span>
                          </div>
                          <Progress 
                            value={Math.min((Number(portfolio.budgetSpent || 0) / Number(portfolio.budgetAllocated)) * 100, 100)} 
                            className="h-1.5"
                          />
                        </div>
                      )}

                      {/* Timeline */}
                      {(portfolio.targetStartDate || portfolio.targetEndDate) && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`timeline-info-${portfolio.id}`}>
                          <Calendar className="h-3 w-3" />
                          <span>
                            {portfolio.targetStartDate ? new Date(portfolio.targetStartDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'TBD'}
                            {' — '}
                            {portfolio.targetEndDate ? new Date(portfolio.targetEndDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'TBD'}
                          </span>
                        </div>
                      )}

                      {/* Strategic Objective Preview */}
                      {portfolio.strategicObjective && (
                        <div className="flex items-start gap-2 text-xs text-muted-foreground" data-testid={`objective-info-${portfolio.id}`}>
                          <Target className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="line-clamp-1">{portfolio.strategicObjective}</span>
                        </div>
                      )}

                      <div className="flex-1" />
                      <div className="flex items-center text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity pt-2">
                        View Details <ArrowRight className="ml-1 h-4 w-4" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}

          {!isLoading && filteredPortfolios?.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
              <div className="rounded-full bg-slate-50 p-4 mb-4">
                <FolderOpen className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">No portfolios found</h3>
              <p className="text-slate-500 mt-1 max-w-sm">
                Get started by creating a new portfolio to organize your projects.
              </p>
              <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-portfolio">
                Create Portfolio
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Projects</TableHead>
                <TableHead className="text-center">Health Summary</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPortfolios?.map((portfolio) => {
                const healthSummary = getProjectHealthSummary(portfolio.id);
                return (
                  <TableRow 
                    key={portfolio.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    data-testid={`row-portfolio-${portfolio.id}`}
                  >
                    <TableCell>
                      <Link href={`/portfolios/${portfolio.id}`} className="flex items-center gap-3 font-medium hover:text-primary">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary">
                          <FolderOpen className="h-4 w-4" />
                        </div>
                        {portfolio.name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <span className="text-muted-foreground line-clamp-1">{portfolio.description || "—"}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{healthSummary.total}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {healthSummary.green > 0 && (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs">
                            {healthSummary.green}
                          </Badge>
                        )}
                        {healthSummary.yellow > 0 && (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                            {healthSummary.yellow}
                          </Badge>
                        )}
                        {healthSummary.red > 0 && (
                          <Badge variant="secondary" className="bg-rose-100 text-rose-700 text-xs">
                            {healthSummary.red}
                          </Badge>
                        )}
                        {healthSummary.total === 0 && <span className="text-muted-foreground text-sm">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" data-testid={`button-menu-portfolio-table-${portfolio.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingPortfolio(portfolio)} data-testid={`menu-edit-portfolio-table-${portfolio.id}`}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => setDeletePortfolioId(portfolio.id)} 
                            className="text-red-600 focus:text-red-600"
                            data-testid={`menu-delete-portfolio-table-${portfolio.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && filteredPortfolios?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <FolderOpen className="h-8 w-8 text-slate-400 mb-2" />
                      <p className="text-muted-foreground">No portfolios found</p>
                      <Button className="mt-4" size="sm" onClick={() => setIsCreateDialogOpen(true)}>
                        Create Portfolio
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Edit Portfolio Dialog */}
      <EditPortfolioDialog 
        portfolio={editingPortfolio} 
        open={!!editingPortfolio} 
        onOpenChange={(open) => !open && setEditingPortfolio(null)} 
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deletePortfolioId !== null} onOpenChange={() => setDeletePortfolioId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Portfolio</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">Are you sure you want to delete this portfolio? It will be moved to the recycle bin.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePortfolioId(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => deletePortfolioId && deletePortfolio.mutate(deletePortfolioId)}
              disabled={deletePortfolio.isPending}
              data-testid="button-confirm-delete-portfolio"
            >
              {deletePortfolio.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreatePortfolioDialog({ open, onOpenChange, organizationId }: { open: boolean; onOpenChange: (o: boolean) => void; organizationId?: number }) {
  const { toast } = useToast();
  const createMutation = useCreatePortfolio();
  const [limitError, setLimitError] = useState<{ resourceType: string } | null>(null);
  
  const form = useForm<InsertPortfolio>({
    resolver: zodResolver(insertPortfolioSchema),
    defaultValues: { name: "", description: "", strategy: "", organizationId: organizationId || undefined }
  });

  const onSubmit = (data: InsertPortfolio) => {
    createMutation.mutate({ ...data, organizationId: organizationId || null }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Portfolio created successfully" });
        onOpenChange(false);
        form.reset();
      },
      onError: (err: any) => {
        if (err.limitExceeded) {
          setLimitError({ resourceType: err.resourceType || "portfolios" });
        } else {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all" data-testid="button-new-portfolio">
          <Plus className="mr-2 h-4 w-4" /> New Portfolio
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Portfolio</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register("name")} placeholder="e.g. Q4 Strategic Initiatives" data-testid="input-portfolio-name" />
            {form.formState.errors.name && <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...form.register("description")} placeholder="Brief overview of this portfolio" data-testid="input-portfolio-description" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="strategy">Strategic Alignment</Label>
            <Textarea id="strategy" {...form.register("strategy")} placeholder="How does this align with company goals?" data-testid="input-portfolio-strategy" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-portfolio">
              {createMutation.isPending ? "Creating..." : "Create Portfolio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <LimitExceededDialog
        open={!!limitError}
        onOpenChange={(o) => !o && setLimitError(null)}
        resourceType={limitError?.resourceType || "portfolios"}
      />
    </Dialog>
  );
}

function EditPortfolioDialog({ portfolio, open, onOpenChange }: { portfolio: Portfolio | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const updateMutation = useUpdatePortfolio();
  const { data: resources } = useResources(currentOrganization?.id ?? null);
  const [teamMemberResourceIds, setTeamMemberResourceIds] = useState<number[]>([]);
  const [teamMemberOpen, setTeamMemberOpen] = useState(false);
  
  const form = useForm<InsertPortfolio>({
    resolver: zodResolver(insertPortfolioSchema),
    defaultValues: { name: "", description: "", strategy: "" }
  });

  useEffect(() => {
    if (portfolio) {
      form.reset({
        name: portfolio.name,
        description: portfolio.description || "",
        strategy: portfolio.strategy || "",
      });
      setTeamMemberResourceIds(portfolio.teamMemberResourceIds || []);
    }
  }, [portfolio, form]);

  const toggleResource = (resourceId: number) => {
    setTeamMemberResourceIds(prev => 
      prev.includes(resourceId) 
        ? prev.filter(id => id !== resourceId)
        : [...prev, resourceId]
    );
  };

  const removeResource = (resourceId: number) => {
    setTeamMemberResourceIds(prev => prev.filter(id => id !== resourceId));
  };

  const selectedResources = resources?.filter(r => teamMemberResourceIds.includes(r.id)) || [];

  const onSubmit = (data: InsertPortfolio) => {
    if (!portfolio) return;
    updateMutation.mutate({ id: portfolio.id, ...data, teamMemberResourceIds }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Portfolio updated successfully" });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Portfolio</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" {...form.register("name")} placeholder="e.g. Q4 Strategic Initiatives" data-testid="input-edit-portfolio-name" />
            {form.formState.errors.name && <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea id="edit-description" {...form.register("description")} placeholder="Brief overview of this portfolio" data-testid="input-edit-portfolio-description" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-strategy">Strategic Alignment</Label>
            <Textarea id="edit-strategy" {...form.register("strategy")} placeholder="How does this align with company goals?" data-testid="input-edit-portfolio-strategy" />
          </div>
          
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Members
            </Label>
            <p className="text-xs text-muted-foreground">
              Team members added here can see this portfolio even if they have restricted visibility.
            </p>
            
            <div className="flex flex-wrap gap-1 mb-2">
              {selectedResources.map(resource => (
                <Badge key={resource.id} variant="secondary" className="pl-2 pr-1 py-1">
                  {resource.firstName} {resource.lastName}
                  <button
                    type="button"
                    onClick={() => removeResource(resource.id)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                    data-testid={`button-remove-team-member-${resource.id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            
            <Popover open={teamMemberOpen} onOpenChange={setTeamMemberOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="w-full justify-start" data-testid="button-add-team-members">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Team Members
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search team members..." />
                  <CommandList>
                    <CommandEmpty>No resources found.</CommandEmpty>
                    <CommandGroup>
                      {resources?.map(resource => (
                        <CommandItem
                          key={resource.id}
                          onSelect={() => toggleResource(resource.id)}
                          className="cursor-pointer"
                          data-testid={`option-team-member-${resource.id}`}
                        >
                          <Checkbox
                            checked={teamMemberResourceIds.includes(resource.id)}
                            className="mr-2"
                          />
                          <div className="flex flex-col">
                            <span>{resource.firstName} {resource.lastName}</span>
                            {resource.email && (
                              <span className="text-xs text-muted-foreground">{resource.email}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={updateMutation.isPending} data-testid="button-update-portfolio">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
