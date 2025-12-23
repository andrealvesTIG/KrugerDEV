import { useState } from "react";
import { usePortfolios, useCreatePortfolio } from "@/hooks/use-portfolios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, FolderOpen, ArrowRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPortfolioSchema } from "@shared/schema";
import type { InsertPortfolio } from "@shared/schema";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Portfolios() {
  const { data: portfolios, isLoading } = usePortfolios();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredPortfolios = portfolios?.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Portfolios</h1>
          <p className="mt-1 text-slate-500">Manage your strategic project groupings.</p>
        </div>
        <CreatePortfolioDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
      </div>

      {/* Search and Filters */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input 
          className="pl-10 max-w-md bg-white border-slate-200" 
          placeholder="Search portfolios..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filteredPortfolios?.map((portfolio, index) => (
          <motion.div
            key={portfolio.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Link href={`/portfolios/${portfolio.id}`}>
              <Card className="group cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                      <FolderOpen className="h-6 w-6" />
                    </div>
                  </div>
                  <CardTitle className="mt-4 text-xl">{portfolio.name}</CardTitle>
                  <CardDescription className="line-clamp-2 mt-2">{portfolio.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    View Details <ArrowRight className="ml-1 h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}

        {!isLoading && filteredPortfolios?.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
            <div className="rounded-full bg-slate-50 p-4 mb-4">
              <FolderOpen className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900">No portfolios found</h3>
            <p className="text-slate-500 mt-1 max-w-sm">
              Get started by creating a new portfolio to organize your projects.
            </p>
            <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
              Create Portfolio
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function CreatePortfolioDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const createMutation = useCreatePortfolio();
  
  const form = useForm<InsertPortfolio>({
    resolver: zodResolver(insertPortfolioSchema),
    defaultValues: { name: "", description: "", strategy: "" }
  });

  const onSubmit = (data: InsertPortfolio) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        toast({ title: "Success", description: "Portfolio created successfully" });
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
            <Input id="name" {...form.register("name")} placeholder="e.g. Q4 Strategic Initiatives" />
            {form.formState.errors.name && <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...form.register("description")} placeholder="Brief overview of this portfolio" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="strategy">Strategic Alignment</Label>
            <Textarea id="strategy" {...form.register("strategy")} placeholder="How does this align with company goals?" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Portfolio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
