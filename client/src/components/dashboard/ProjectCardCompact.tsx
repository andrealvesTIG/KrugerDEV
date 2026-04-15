import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusReportDialog } from "@/components/StatusReportDialog";
import { FileText, TrendingUp, Calendar, DollarSign } from "lucide-react";
import type { Project, Risk, Issue, ProjectFinancial, Task, ChangeRequest, ProjectDocument } from "@shared/schema";
import { formatCurrency } from "@/lib/format";
import { CompactCurrency } from "@/components/CompactCurrency";

interface ProjectCardCompactProps {
  project: Project;
  showBudget?: boolean;
  showProgress?: boolean;
  className?: string;
}

const healthColors: Record<string, string> = {
  Green: "bg-emerald-500",
  Yellow: "bg-amber-500",
  Red: "bg-destructive",
};

const healthBadgeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Green: "default",
  Yellow: "secondary",
  Red: "destructive",
};

export function ProjectCardCompact({ project, showBudget = true, showProgress = true, className = "" }: ProjectCardCompactProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: risks = [] } = useQuery<Risk[]>({
    queryKey: ['/api/projects', project.id, 'risks'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/risks`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: dialogOpen,
  });

  const { data: issues = [] } = useQuery<Issue[]>({
    queryKey: ['/api/projects', project.id, 'issues'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/issues`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: dialogOpen,
  });

  const { data: financials = [] } = useQuery<ProjectFinancial[]>({
    queryKey: ['/api/projects', project.id, 'financials'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/financials`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: dialogOpen,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/projects', project.id, 'tasks'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/tasks`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: dialogOpen,
  });

  const { data: changeRequests = [] } = useQuery<ChangeRequest[]>({
    queryKey: ['/api/projects', project.id, 'change-requests'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/change-requests`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: dialogOpen,
  });

  const { data: documents = [] } = useQuery<ProjectDocument[]>({
    queryKey: ['/api/projects', project.id, 'documents'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/documents`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: dialogOpen,
  });

  const formatBudget = (amount: number) => formatCurrency(amount, { compact: true });

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "TBD";
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <>
      <Card 
        className={`p-3 hover-elevate cursor-pointer transition-all ${className}`}
        onClick={() => setDialogOpen(true)}
        data-testid={`project-card-${project.id}`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate" title={project.name}>
              {project.name}
            </h4>
            <p className="text-xs text-muted-foreground truncate">
              {project.status}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className={`w-2.5 h-2.5 rounded-full ${healthColors[project.health || "Green"]}`} title={`Health: ${project.health}`} />
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); setDialogOpen(true); }}
              data-testid={`button-report-${project.id}`}
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {showProgress && (
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{project.completionPercentage || 0}%</span>
            </div>
            <Progress value={project.completionPercentage || 0} className="h-1.5" />
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {showBudget && project.budget && (
            <div className="flex items-center gap-1">
              <CompactCurrency value={project.budget} />
            </div>
          )}
          {project.endDate && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{formatDate(project.endDate)}</span>
            </div>
          )}
        </div>
      </Card>

      <StatusReportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={project}
        risks={risks}
        issues={issues}
        financials={financials}
        tasks={tasks}
        changeRequests={changeRequests}
        documents={documents}
      />
    </>
  );
}

export function ProjectCardCompactSkeleton() {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1">
          <Skeleton className="h-4 w-3/4 mb-1" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-6 w-6 rounded" />
      </div>
      <Skeleton className="h-1.5 w-full mb-2" />
      <div className="flex justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
    </Card>
  );
}
