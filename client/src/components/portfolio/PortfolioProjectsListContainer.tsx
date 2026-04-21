import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { ProjectsListView, type GroupByOption } from "@/pages/Projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useAllTasks } from "@/hooks/use-tasks";
import { useUpdateProject } from "@/hooks/use-projects";
import { useCustomFieldDefinitions, useOrganizationProjectCustomFieldValues } from "@/hooks/use-custom-fields";
import { DEFAULT_PROJECT_STATUS_LIST } from "@/lib/project-statuses";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Search, Loader2, ArrowUpToLine } from "lucide-react";
import { normalizeSearch } from "@/lib/utils";
import type { ProjectFilterView } from "@/components/ViewsDropdown";

interface PortfolioProjectsListContainerProps {
  projects: Project[];
  organizationId: number;
  onRemoveProject: (projectId: number) => Promise<void> | void;
  financialBudgets?: Record<number, number>;
}

export function PortfolioProjectsListContainer({
  projects: portfolioProjects,
  organizationId,
  onRemoveProject,
  financialBudgets,
}: PortfolioProjectsListContainerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: portfolios } = usePortfolios(organizationId);
  const { data: allTasks } = useAllTasks(organizationId);
  const { data: customFieldDefs } = useCustomFieldDefinitions(organizationId);
  const { data: customFieldValues } = useOrganizationProjectCustomFieldValues(organizationId);

  const { data: orgWorkflowSteps } = useQuery<Array<{ id: number; stepKey: string; position: number; label: string; description: string | null; isTerminal: boolean | null; isActive: boolean | null }>>({
    queryKey: ['/api/organizations', organizationId, 'project-workflow-steps'],
    enabled: !!organizationId,
  });

  const { data: projectRiskAssessments } = useQuery<{ projectId: number; riskScore: number; summary: string; generatedAt: string }[]>({
    queryKey: ['/api/project-risk-assessments/org', organizationId],
    enabled: !!organizationId,
  });

  const updateProject = useUpdateProject();

  const generateRiskAssessment = useMutation({
    mutationFn: async (projectId: number) => {
      return apiRequest('POST', `/api/projects/${projectId}/risk-assessment`, {});
    },
    onSuccess: (_data, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-risk-assessments/org', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'risk-assessment', 'latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: 'Risk assessment generated' });
      setRiskAssessProjectId(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const [search, setSearch] = useState('');
  const [filterView, setFilterView] = useState<ProjectFilterView>('active');
  const [groupBy, setGroupBy] = useState<GroupByOption>('none');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [riskAssessProjectId, setRiskAssessProjectId] = useState<number | null>(null);
  const [removeProjectId, setRemoveProjectId] = useState<number | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Apply financial-budget overrides if provided so the Budget column matches the rest of the portfolio page
  const projectsWithBudget = useMemo(() => {
    if (!financialBudgets) return portfolioProjects;
    return portfolioProjects.map(p =>
      financialBudgets[p.id] !== undefined
        ? ({ ...p, budget: String(financialBudgets[p.id]) } as unknown as Project)
        : p
    );
  }, [portfolioProjects, financialBudgets]);

  const PROJECT_STATUS_LIST = useMemo<string[]>(() => {
    if (!orgWorkflowSteps || orgWorkflowSteps.length === 0) return [...DEFAULT_PROJECT_STATUS_LIST];
    return orgWorkflowSteps.filter(s => s.isActive !== false).map(s => s.stepKey);
  }, [orgWorkflowSteps]);

  const filtered = useMemo(() => {
    return projectsWithBudget.filter(p => {
      const matchesSearch = !search || normalizeSearch(p.name).includes(normalizeSearch(search));
      const isClosed = p.status === 'Closed';
      let matchesFilter = true;
      switch (filterView) {
        case 'all': matchesFilter = true; break;
        case 'active': matchesFilter = !isClosed; break;
        case 'closed': matchesFilter = isClosed; break;
        default: matchesFilter = !isClosed; break;
      }
      return matchesSearch && matchesFilter;
    });
  }, [projectsWithBudget, search, filterView]);

  const effectivePageSize = pageSize === Infinity ? Math.max(1, filtered.length) : pageSize;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / effectivePageSize)), [filtered.length, effectivePageSize]);

  const displayed = useMemo(() => {
    if (pageSize === Infinity) return filtered;
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const projectProgress = useMemo(() => {
    const map: Record<number, number> = {};
    if (!allTasks) {
      portfolioProjects.forEach(p => { map[p.id] = p.completionPercentage || 0; });
      return map;
    }
    portfolioProjects.forEach(project => {
      const tasks = allTasks.filter(t => t.projectId === project.id);
      if (tasks.length === 0) {
        map[project.id] = project.completionPercentage || 0;
      } else {
        const total = tasks.reduce((sum, t) => sum + (t.progress || 0), 0);
        map[project.id] = Math.round(total / tasks.length);
      }
    });
    return map;
  }, [allTasks, portfolioProjects]);

  const getRiskScoreForProject = (projectId: number) =>
    projectRiskAssessments?.find(a => a.projectId === projectId);

  const getRiskScoreColor = (score: number) => {
    if (score <= 25) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (score <= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    if (score <= 75) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
  };

  const handleStatusChange = (projectId: number, newStatus: string) => {
    updateProject.mutate(
      { id: projectId, status: newStatus },
      {
        onSuccess: () => toast({ title: 'Project updated', description: `Status changed to ${newStatus}` }),
        onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
      }
    );
  };

  const handleConfirmRemove = async () => {
    if (removeProjectId == null) return;
    setIsRemoving(true);
    try {
      await onRemoveProject(removeProjectId);
      setRemoveProjectId(null);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          placeholder="Search projects..."
          className="pl-9"
          data-testid="input-search-portfolio-projects"
        />
      </div>

      <ProjectsListView
        projects={displayed}
        filteredProjects={filtered}
        portfolios={portfolios || []}
        projectProgress={projectProgress}
        getRiskScoreForProject={getRiskScoreForProject}
        getRiskScoreColor={getRiskScoreColor}
        handleStatusChange={handleStatusChange}
        setDeleteProjectId={() => { /* delete hidden in portfolio context */ }}
        setRiskAssessProjectId={setRiskAssessProjectId}
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={effectivePageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        selectedPageSize={pageSize}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        customFieldDefs={customFieldDefs}
        customFieldValues={customFieldValues}
        filterView={filterView}
        onFilterViewChange={(v) => { setFilterView(v); setCurrentPage(1); }}
        organizationId={organizationId}
        statusList={PROJECT_STATUS_LIST}
        hideDeleteAction
        extraRowActions={(project) => (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => { e.preventDefault(); setRemoveProjectId(project.id); }}
              className="text-amber-700 focus:text-amber-700"
              data-testid={`menu-remove-portfolio-project-${project.id}`}
            >
              <ArrowUpToLine className="h-4 w-4 mr-2" />
              Remove from Portfolio
            </DropdownMenuItem>
          </>
        )}
      />

      <Dialog open={removeProjectId !== null} onOpenChange={(open) => !open && setRemoveProjectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove project from portfolio?</DialogTitle>
            <DialogDescription>
              The project will remain in the system; it just won't be associated with this portfolio anymore.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveProjectId(null)} disabled={isRemoving}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRemove}
              disabled={isRemoving}
              data-testid="button-confirm-remove-portfolio-project"
            >
              {isRemoving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Removing...</>) : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={riskAssessProjectId !== null} onOpenChange={(open) => !open && setRiskAssessProjectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate AI Risk Assessment</DialogTitle>
            <DialogDescription>
              This will use AI to analyze the project and generate a comprehensive risk assessment. This action will consume 1 AI credit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskAssessProjectId(null)}>Cancel</Button>
            <Button
              onClick={() => riskAssessProjectId && generateRiskAssessment.mutate(riskAssessProjectId)}
              disabled={generateRiskAssessment.isPending}
              data-testid="button-confirm-risk-assessment-portfolio-project"
            >
              {generateRiskAssessment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {generateRiskAssessment.isPending ? 'Generating...' : 'Generate Assessment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
