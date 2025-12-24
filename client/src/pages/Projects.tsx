import { useState } from "react";
import { useProjects, useCreateProject } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProjectSchema } from "@shared/schema";
import type { InsertProject } from "@shared/schema";
import { Link } from "wouter";
import { Plus, Search, Calendar, Target, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function Projects() {
  const { currentOrganization } = useOrganization();
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("all");
  const { data: projects, isLoading } = useProjects(currentOrganization?.id, selectedPortfolio !== "all" ? parseInt(selectedPortfolio) : undefined);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredProjects = projects?.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Projects</h1>
          <p className="mt-1 text-slate-500">Track execution and health of all initiatives.</p>
        </div>
        <CreateProjectDialog 
          open={isDialogOpen} 
          onOpenChange={setIsDialogOpen} 
          portfolios={portfolios || []}
        />
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-4 sm:flex-row bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input 
            className="pl-10 border-slate-200" 
            placeholder="Search projects..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={selectedPortfolio} onValueChange={setSelectedPortfolio}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by Portfolio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Portfolios</SelectItem>
              {portfolios?.map(p => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Projects List */}
      <div className="space-y-4">
        {filteredProjects?.map((project) => (
          <Link key={project.id} href={`/projects/${project.id}`}>
            <div className="group relative flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-primary/50 hover:shadow-md transition-all duration-200 sm:flex-row sm:items-center cursor-pointer">
              
              {/* Status Indicator Stripe */}
              <div className={cn(
                "absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl",
                project.health === 'Green' && "bg-emerald-500",
                project.health === 'Yellow' && "bg-amber-500",
                project.health === 'Red' && "bg-rose-500",
              )} />

              <div className="flex-1 pl-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-primary transition-colors">
                    {project.name}
                  </h3>
                  <Badge variant="outline" className="font-normal text-slate-500">
                    {project.status}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-6 text-sm text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>Due {project.endDate ? format(new Date(project.endDate), 'MMM d, yyyy') : 'TBD'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Target className="h-4 w-4" />
                    <span>{project.completionPercentage}% Complete</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 pl-4 sm:pl-0">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-900">Budget</p>
                  <p className="text-sm text-slate-500">${Number(project.budget).toLocaleString()}</p>
                </div>
                <Badge className={cn(
                  "ml-auto sm:ml-0",
                  project.priority === 'High' || project.priority === 'Critical' ? "bg-rose-100 text-rose-700 hover:bg-rose-100" : "bg-slate-100 text-slate-700 hover:bg-slate-100"
                )}>
                  {project.priority} Priority
                </Badge>
              </div>
            </div>
          </Link>
        ))}

        {!isLoading && filteredProjects?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-xl">
            <div className="rounded-full bg-slate-50 p-4 mb-4">
              <AlertCircle className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900">No projects found</h3>
            <p className="text-slate-500 mt-1 mb-4">Try adjusting your filters or create a new project.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateProjectDialog({ open, onOpenChange, portfolios }: { open: boolean, onOpenChange: (o: boolean) => void, portfolios: any[] }) {
  const { toast } = useToast();
  const createMutation = useCreateProject();
  
  const form = useForm<InsertProject>({
    resolver: zodResolver(insertProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      priority: "Medium",
      status: "Initiation",
      budget: "0",
    }
  });

  const onSubmit = (data: InsertProject) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        toast({ title: "Success", description: "Project created successfully" });
        onOpenChange(false);
        form.reset();
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
          <Plus className="mr-2 h-4 w-4" /> New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="name">Project Name</Label>
              <Input id="name" {...form.register("name")} placeholder="Project Alpha" />
              {form.formState.errors.name && <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>}
            </div>
            
            <div className="space-y-2 col-span-2">
              <Label htmlFor="portfolioId">Portfolio</Label>
              <Controller
                control={form.control}
                name="portfolioId"
                render={({ field }) => (
                  <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString()}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Portfolio" />
                    </SelectTrigger>
                    <SelectContent>
                      {portfolios.map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Controller
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget">Budget ($)</Label>
              <Input id="budget" type="number" {...form.register("budget")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" type="date" {...form.register("startDate")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" type="date" {...form.register("endDate")} />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" {...form.register("description")} />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
