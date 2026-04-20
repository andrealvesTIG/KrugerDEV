import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/use-organization";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useRisks, useCreateRisk, useUpdateRisk, useDeleteRisk, useRiskHistory, useConvertRiskToIssue, useAiMitigationSuggestion } from "@/hooks/use-risks";
import { useRiskResourceAssignments, useUpdateRiskResourceAssignments } from "@/hooks/use-resources";
import type { Risk } from "@shared/schema";
import { format, parseISO } from "date-fns";
import { CompactCurrency } from "@/components/CompactCurrency";
import { cn } from "@/lib/utils";

import { CreateRiskDialog } from "@/components/CreateRiskDialog";
import { EditRiskDialog, type RiskFormData } from "@/components/EditRiskDialog";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from "recharts";

import {
  Loader2,
  AlertTriangle,
  Plus,
  Trash2,
  Sparkles,
  History,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  ArrowRight,
  CheckCircle2,
  Shield,
  TrendingUp,
  RefreshCw,
  Download,
  ExternalLink,
  Share2,
} from "lucide-react";

function RiskHistoryDialog({ riskId, open, onOpenChange }: { riskId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: history, isLoading } = useRiskHistory(riskId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Risk Change History
          </DialogTitle>
          <DialogDescription>
            View all changes made to this risk over time.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No changes recorded yet
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {history.map((log) => (
                  <div 
                    key={log.id} 
                    className="border-l-2 border-muted-foreground/30 pl-4 pb-4"
                    data-testid={`risk-history-entry-${log.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-xs">
                        {log.changeType === 'created' ? 'Created' : 'Updated'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(String(log.changedAt)), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                    <div className="mt-2 text-sm">
                      <span className="font-medium">{log.changedByName}</span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground break-words">
                      {log.changeSummary}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProjectRiskScoreTrendChart({ projectId, getRiskScoreColor }: {
  projectId: number;
  getRiskScoreColor: (score: number) => string;
}) {
  const { data: history } = useQuery<{ id: number; riskScore: number; generatedAt: string }[]>({
    queryKey: ["/api/projects", projectId, "risk-assessment", "history"],
  });

  if (!history || history.length < 2) return null;

  const chartData = history.map((item) => ({
    date: format(new Date(item.generatedAt), "MMM d"),
    fullDate: format(new Date(item.generatedAt), "MMM d, yyyy"),
    score: item.riskScore,
  }));

  const latestScore = chartData[chartData.length - 1].score;
  const previousScore = chartData[chartData.length - 2].score;
  const scoreDelta = latestScore - previousScore;

  return (
    <Card data-testid="card-project-risk-trend">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Risk Score Trend
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={cn("text-lg font-bold", getRiskScoreColor(latestScore))}>
              {latestScore}
            </span>
            {scoreDelta !== 0 && (
              <Badge className={cn("text-xs", scoreDelta > 0 ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300")}>
                {scoreDelta > 0 ? "+" : ""}{scoreDelta} pts
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>{history.length} assessments tracked</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-48" data-testid="display-project-risk-trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} className="text-muted-foreground" />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  const score = d.score as number;
                  return (
                    <div className="bg-popover border rounded-md p-2 shadow-md">
                      <p className="text-xs text-muted-foreground">{d.fullDate}</p>
                      <p className={cn("text-sm font-bold", getRiskScoreColor(score))}>
                        Score: {score}
                      </p>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={30} stroke="hsl(var(--chart-2))" strokeDasharray="3 3" label={{ value: "Low", position: "right", fontSize: 10 }} />
              <ReferenceLine y={60} stroke="hsl(var(--chart-4))" strokeDasharray="3 3" label={{ value: "Medium", position: "right", fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 4, fill: "hsl(var(--primary))" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function RisksTab({ projectId, projectName, portfolioId, urlRiskId, readOnly = false }: { projectId: number; projectName?: string; portfolioId?: number | null; urlRiskId?: string | null; readOnly?: boolean }) {
  const { currentOrganization } = useOrganization();
  const { data: risks, isLoading } = useRisks(projectId);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const portfolioName = portfolioId ? portfolios?.find(p => p.id === portfolioId)?.name : undefined;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreateRiskDialogOpen, setIsCreateRiskDialogOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [deleteRiskData, setDeleteRiskData] = useState<Risk | null>(null);
  const [historyRiskId, setHistoryRiskId] = useState<number | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [escalateToPortfolio, setEscalateToPortfolio] = useState(false);
  const createRisk = useCreateRisk();
  const updateRisk = useUpdateRisk();
  const deleteRisk = useDeleteRisk();
  const convertRiskToIssue = useConvertRiskToIssue();
  const aiMitigationSuggestion = useAiMitigationSuggestion();
  const updateRiskResources = useUpdateRiskResourceAssignments();
  const { data: riskHistory, isLoading: historyLoading } = useRiskHistory(editingRisk?.id || 0);
  const { data: riskAssignments } = useRiskResourceAssignments(editingRisk?.id ?? null);
  const { toast } = useToast();

  const [riskAssessmentDialogOpen, setRiskAssessmentDialogOpen] = useState(false);
  const [riskReport, setRiskReport] = useState<any>(null);
  const [riskAssessmentId, setRiskAssessmentId] = useState<number | null>(null);
  const [riskShareToken, setRiskShareToken] = useState("");
  const [riskConfirmOpen, setRiskConfirmOpen] = useState(false);
  const [selectedSuggestedRisks, setSelectedSuggestedRisks] = useState<Set<number>>(new Set());
  const [isCreatingSuggested, setIsCreatingSuggested] = useState(false);
  const [createdSuggestedIndices, setCreatedSuggestedIndices] = useState<Set<number>>(new Set());

  const { data: latestProjectAssessment } = useQuery<{ riskScore: number; generatedAt: string; summary: string; shareToken: string; id: number; report: any } | null>({
    queryKey: ["/api/projects", projectId, "risk-assessment", "latest"],
  });

  const recentProjectAssessment = useMemo(() => {
    if (!latestProjectAssessment?.riskScore || !latestProjectAssessment?.generatedAt) return null;
    const generatedAt = new Date(latestProjectAssessment.generatedAt);
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    if (generatedAt > tenDaysAgo) return { score: latestProjectAssessment.riskScore, generatedAt };
    return null;
  }, [latestProjectAssessment]);

  const generateProjectRiskAssessment = useMutation({
    mutationFn: async (options?: { force?: boolean }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/risk-assessment`, { force: options?.force ?? false });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.assessment) {
        setRiskReport(data.assessment.report);
        setRiskAssessmentId(data.assessment.id);
        setRiskShareToken(data.assessment.shareToken || "");
        setSelectedSuggestedRisks(new Set());
        setCreatedSuggestedIndices(new Set());
        setRiskAssessmentDialogOpen(true);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "risk-assessment", "latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "risk-assessment", "history"] });
    },
    onError: (err: any) => {
      if (err?.limitExceeded) {
        toast({ title: "Credit Limit Reached", description: err.message || "Please upgrade your plan.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: err?.message || "Failed to generate risk assessment", variant: "destructive" });
      }
    },
  });

  const handleProjectRiskAssessmentClick = () => {
    if (latestProjectAssessment?.report) {
      setRiskReport(latestProjectAssessment.report);
      setRiskAssessmentId(latestProjectAssessment.id);
      setRiskShareToken(latestProjectAssessment.shareToken || "");
      setSelectedSuggestedRisks(new Set());
      setCreatedSuggestedIndices(new Set());
      setRiskAssessmentDialogOpen(true);
    } else {
      setRiskForceRecalculate(false);
      setRiskConfirmOpen(true);
    }
  };

  const [riskForceRecalculate, setRiskForceRecalculate] = useState(false);

  const handleRecalculateProjectRisk = () => {
    setRiskForceRecalculate(true);
    setRiskConfirmOpen(true);
  };

  const getRiskScoreColor = (score: number) => {
    if (score <= 25) return "text-emerald-600 dark:text-emerald-400";
    if (score <= 50) return "text-amber-500 dark:text-amber-400";
    if (score <= 75) return "text-orange-500 dark:text-orange-400";
    return "text-rose-600 dark:text-rose-400";
  };

  const getRiskScoreBg = (score: number) => {
    if (score <= 25) return "bg-emerald-100 dark:bg-emerald-900/50";
    if (score <= 50) return "bg-amber-100 dark:bg-amber-900/50";
    if (score <= 75) return "bg-orange-100 dark:bg-orange-900/50";
    return "bg-rose-100 dark:bg-rose-900/50";
  };

  const getRiskScoreLabel = (score: number) => {
    if (score <= 25) return "Low";
    if (score <= 50) return "Moderate";
    if (score <= 75) return "High";
    return "Critical";
  };

  useEffect(() => {
    if (riskAssignments && editingRisk) {
      setSelectedResourceIds(riskAssignments.map(a => a.resourceId));
    }
  }, [riskAssignments, editingRisk]);

  const riskAutoOpenRef = useRef(false);
  useEffect(() => {
    if (urlRiskId && risks && risks.length > 0 && !riskAutoOpenRef.current) {
      const riskId = parseInt(urlRiskId);
      const risk = risks.find(r => r.id === riskId);
      if (risk) {
        setEditingRisk(risk);
        setIsDialogOpen(true);
        riskAutoOpenRef.current = true;
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('riskId');
        window.history.replaceState({}, '', newUrl.toString());
      }
    }
  }, [urlRiskId, risks]);

  const openEditDialog = (risk: Risk) => {
    setEditingRisk(risk);
    setShowHistory(false);
    setEscalateToPortfolio(risk.escalatedToPortfolio || false);
    setIsDialogOpen(true);
  };


  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <div className="space-y-6">
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Project Risks
          </CardTitle>
          <CardDescription>Track and mitigate potential issues.</CardDescription>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {recentProjectAssessment && (
            <div
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={handleProjectRiskAssessmentClick}
              data-testid="display-project-risk-score"
            >
              <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md", getRiskScoreBg(recentProjectAssessment.score))}>
                <Shield className="h-4 w-4" />
                <span className={cn("text-lg font-bold", getRiskScoreColor(recentProjectAssessment.score))} data-testid="text-project-risk-score">
                  {recentProjectAssessment.score}
                </span>
                <span className={cn("text-xs font-medium", getRiskScoreColor(recentProjectAssessment.score))}>
                  {getRiskScoreLabel(recentProjectAssessment.score)}
                </span>
              </div>
              <span className="text-xs text-muted-foreground hidden sm:inline" data-testid="text-project-risk-score-date">
                {recentProjectAssessment.generatedAt.toLocaleDateString()}
              </span>
            </div>
          )}
          {recentProjectAssessment ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecalculateProjectRisk}
              disabled={generateProjectRiskAssessment.isPending}
              data-testid="button-recalculate-project-risk"
            >
              {generateProjectRiskAssessment.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Recalculate
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleProjectRiskAssessmentClick}
              disabled={generateProjectRiskAssessment.isPending}
              data-testid="button-project-risk-assessment"
            >
              {generateProjectRiskAssessment.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Shield className="h-4 w-4 mr-2" />
              )}
              AI Risk Assessment
            </Button>
          )}
          <Button size="sm" onClick={() => setIsCreateRiskDialogOpen(true)} disabled={readOnly}><Plus className="mr-2 h-4 w-4" /> Add Risk</Button>
          <CreateRiskDialog
            open={isCreateRiskDialogOpen}
            onOpenChange={setIsCreateRiskDialogOpen}
            organizationId={currentOrganization?.id ?? null}
            projectId={projectId}
          />
          <EditRiskDialog
            open={isDialogOpen}
            onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingRisk(null); }}
            risk={editingRisk}
            onSubmit={(data: RiskFormData) => {
              if (!editingRisk) return;
              const escalationData = escalateToPortfolio 
                ? { escalatedToPortfolio: true, escalatedAt: editingRisk.escalatedToPortfolio ? editingRisk.escalatedAt : new Date().toISOString() }
                : { escalatedToPortfolio: false, escalatedAt: null };
              updateRisk.mutate({ id: editingRisk.id, projectId, ...data, ...escalationData }, {
                onSuccess: () => {
                  updateRiskResources.mutate({ riskId: editingRisk.id, resourceIds: selectedResourceIds });
                  toast({ title: "Success", description: "Risk updated" });
                  setIsDialogOpen(false);
                  setEditingRisk(null);
                },
                onError: (error: any) => {
                  toast({ title: "Error", description: error?.message || "Failed to update risk", variant: "destructive" });
                }
              });
            }}
            isSubmitting={updateRisk.isPending}
            projectLink={projectName ? { name: projectName, id: projectId } : null}
            portfolioLink={(portfolioId && portfolioName) ? { name: portfolioName, id: portfolioId } : null}
            organizationId={currentOrganization?.id}
            resourceIds={selectedResourceIds}
            onResourcesChange={setSelectedResourceIds}
            projectName={projectName}
            portfolioId={portfolioId}
            portfolioName={portfolioName}
            escalateToPortfolio={escalateToPortfolio}
            onEscalateChange={setEscalateToPortfolio}
            onConvertToIssue={() => {
              if (editingRisk) {
                convertRiskToIssue.mutate({ id: editingRisk.id, projectId }, {
                  onSuccess: () => {
                    toast({ title: "Success", description: "Risk converted to issue" });
                    setIsDialogOpen(false);
                    setEditingRisk(null);
                  },
                  onError: (err: any) => {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  }
                });
              }
            }}
            isConverting={convertRiskToIssue.isPending}
            history={riskHistory || []}
            historyLoading={historyLoading}
            onAiSuggest={(data) => aiMitigationSuggestion.mutateAsync(data)}
            isAiSuggesting={aiMitigationSuggestion.isPending}
            onDelete={() => {
              if (editingRisk) {
                deleteRisk.mutate({ id: editingRisk.id, projectId }, {
                  onSuccess: () => {
                    toast({ title: "Deleted", description: "Risk deleted" });
                    setIsDialogOpen(false);
                    setEditingRisk(null);
                  }
                });
              }
            }}
            isDeleting={deleteRisk.isPending}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {risks?.map(risk => (
            <div 
              key={risk.id} 
              className="flex items-start justify-between rounded-lg border p-4 cursor-pointer hover-elevate transition-colors"
              onClick={() => openEditDialog(risk)}
              data-testid={`risk-card-${risk.id}`}
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                   <span className="font-semibold truncate max-w-[200px]" title={risk.title}>{risk.title}</span>
                   <Badge variant="outline" className={cn(
                     "shrink-0",
                     risk.probability === 'High' ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-slate-50 dark:bg-slate-800"
                   )}>{risk.probability} Prob</Badge>
                   <Badge variant="outline" className={cn(
                     "shrink-0",
                     risk.impact === 'High' ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-slate-50 dark:bg-slate-800"
                   )}>{risk.impact} Impact</Badge>
                   <Badge variant="outline" className={cn(
                     "shrink-0",
                     risk.status === 'Open' ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                     risk.status === 'Mitigated' ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                     "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                   )}>{risk.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2" title={risk.description || ""}>{risk.description}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  {risk.dueDate && (
                    <span className="text-xs text-muted-foreground">
                      <span className="font-medium">Due:</span> {new Date(risk.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  {risk.costExposure && (
                    <span className="text-xs text-muted-foreground">
                      <span className="font-medium">Exposure:</span> <CompactCurrency value={risk.costExposure} />
                    </span>
                  )}
                </div>
                {risk.mitigationPlan && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2" title={risk.mitigationPlan || ""}>
                    <span className="font-medium shrink-0">Mitigation:</span> {risk.mitigationPlan}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`button-menu-risk-${risk.id}`}
                  >
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem 
                    onClick={() => setHistoryRiskId(risk.id)}
                    data-testid={`button-history-risk-${risk.id}`}
                  >
                    <History className="h-4 w-4 mr-2" />
                    View History
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => {
                      convertRiskToIssue.mutate({ id: risk.id, projectId }, {
                        onSuccess: () => {
                          toast({ title: "Success", description: "Risk converted to issue" });
                        },
                        onError: () => {
                          toast({ title: "Error", description: "Failed to convert risk to issue", variant: "destructive" });
                        }
                      });
                    }}
                    disabled={convertRiskToIssue.isPending}
                    data-testid={`button-convert-risk-${risk.id}`}
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Convert to Issue
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setDeleteRiskData(risk)}
                    data-testid={`button-delete-risk-${risk.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          {risks?.length === 0 && <div className="text-center py-8 text-muted-foreground">No risks recorded.</div>}
        </div>
      </CardContent>

      <Dialog open={deleteRiskData !== null} onOpenChange={(open) => !open && setDeleteRiskData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Risk</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">Are you sure you want to delete this risk? It will be moved to the recycle bin.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRiskData(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (deleteRiskData) {
                  deleteRisk.mutate({ id: deleteRiskData.id, projectId }, {
                    onSuccess: () => {
                      toast({ title: "Success", description: "Risk moved to recycle bin" });
                      setDeleteRiskData(null);
                    }
                  });
                }
              }}
              disabled={deleteRisk.isPending}
              data-testid="button-confirm-delete-risk"
            >
              {deleteRisk.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RiskHistoryDialog 
        riskId={historyRiskId || 0} 
        open={historyRiskId !== null} 
        onOpenChange={(open) => !open && setHistoryRiskId(null)} 
      />
    </Card>

    <AlertDialog open={riskConfirmOpen} onOpenChange={setRiskConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Generate AI Risk Assessment</AlertDialogTitle>
          <AlertDialogDescription>
            This will use AI to analyze your project data (tasks, risks, issues, milestones, and budget) and produce a comprehensive risk assessment report. This uses 1 AI credit.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-project-risk-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              generateProjectRiskAssessment.mutate({ force: riskForceRecalculate });
              setRiskForceRecalculate(false);
            }}
            disabled={generateProjectRiskAssessment.isPending}
            data-testid="button-project-risk-confirm"
          >
            {generateProjectRiskAssessment.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
            ) : (
              "Generate Assessment"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={riskAssessmentDialogOpen} onOpenChange={setRiskAssessmentDialogOpen}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Project Risk Assessment — {projectName || "Project"}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[55vh] pr-4">
          {riskReport && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className={cn("flex items-center justify-center h-16 w-16 rounded-md text-2xl font-bold", getRiskScoreBg(riskReport.riskScore), getRiskScoreColor(riskReport.riskScore))} data-testid="display-project-assessment-score">
                  {riskReport.riskScore}
                </div>
                <div className="flex-1 min-w-0">
                  <Badge className={cn("mb-1", getRiskScoreBg(riskReport.riskScore), getRiskScoreColor(riskReport.riskScore))}>
                    {riskReport.overallRiskLevel || getRiskScoreLabel(riskReport.riskScore)}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{riskReport.summary}</p>
                </div>
              </div>

              {riskReport.categories && riskReport.categories.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Risk Categories</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3" data-testid="display-project-risk-categories">
                      {riskReport.categories.map((cat: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between gap-4" data-testid={`project-risk-category-${idx}`}>
                          <span className="text-sm font-medium flex-1">{cat.name}</span>
                          <div className="flex items-center gap-2">
                            <Progress value={cat.score} className="w-24 h-2" />
                            <span className={cn("text-sm font-semibold w-8 text-right", getRiskScoreColor(cat.score))}>
                              {cat.score}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {riskReport.topRisks && riskReport.topRisks.length > 0 && (() => {
                const existingRiskTitles = (risks || []).map((r: any) => r.title?.toLowerCase().trim()).filter(Boolean);
                const isAlreadyCreated = (suggestedRisk: any, idx: number): boolean => {
                  if (createdSuggestedIndices.has(idx)) return true;
                  const suggestedTitle = suggestedRisk.title?.toLowerCase().trim();
                  if (!suggestedTitle) return false;
                  return existingRiskTitles.some((existing: string) => {
                    if (existing === suggestedTitle) return true;
                    const shorter = existing.length < suggestedTitle.length ? existing : suggestedTitle;
                    const longer = existing.length < suggestedTitle.length ? suggestedTitle : existing;
                    return longer.includes(shorter) && shorter.length > 5;
                  });
                };
                const selectableCount = riskReport.topRisks.filter((r: any, i: number) => !isAlreadyCreated(r, i)).length;
                const allSelectableSelected = selectableCount > 0 && selectedSuggestedRisks.size === selectableCount;
                return (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-base">Top Risks</CardTitle>
                      <div className="flex items-center gap-2">
                        {selectedSuggestedRisks.size > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {selectedSuggestedRisks.size} selected
                          </span>
                        )}
                        {selectableCount > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              if (allSelectableSelected) {
                                setSelectedSuggestedRisks(new Set());
                              } else {
                                const selectableIndices = new Set<number>();
                                riskReport.topRisks.forEach((r: any, i: number) => {
                                  if (!isAlreadyCreated(r, i)) selectableIndices.add(i);
                                });
                                setSelectedSuggestedRisks(selectableIndices);
                              }
                            }}
                            data-testid="button-select-all-suggested-risks"
                          >
                            {allSelectableSelected ? "Deselect All" : "Select All"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3" data-testid="display-project-top-risks">
                      {riskReport.topRisks.map((risk: any, idx: number) => {
                        const isSelected = selectedSuggestedRisks.has(idx);
                        const alreadyExists = isAlreadyCreated(risk, idx);
                        return (
                          <div
                            key={idx}
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-md transition-colors",
                              alreadyExists
                                ? "bg-muted/30 opacity-60"
                                : isSelected
                                  ? "bg-primary/10 ring-1 ring-primary/30 cursor-pointer"
                                  : "bg-muted/50 hover:bg-muted/80 cursor-pointer"
                            )}
                            onClick={() => {
                              if (alreadyExists) return;
                              setSelectedSuggestedRisks(prev => {
                                const next = new Set(prev);
                                if (next.has(idx)) next.delete(idx);
                                else next.add(idx);
                                return next;
                              });
                            }}
                            data-testid={`project-top-risk-${idx}`}
                          >
                            {alreadyExists ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="shrink-0">
                                    <Checkbox
                                      checked={true}
                                      disabled
                                      className="mt-0.5"
                                      data-testid={`checkbox-suggested-risk-${idx}`}
                                    />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>Risk already created</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Checkbox
                                checked={isSelected}
                                className="mt-0.5 shrink-0"
                                onCheckedChange={(checked) => {
                                  setSelectedSuggestedRisks(prev => {
                                    const next = new Set(prev);
                                    if (checked) next.add(idx);
                                    else next.delete(idx);
                                    return next;
                                  });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`checkbox-suggested-risk-${idx}`}
                              />
                            )}
                            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium">{risk.title}</p>
                                {alreadyExists && (
                                  <Badge variant="outline" className="text-[10px]">Already exists</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">Impact: {risk.impact}</p>
                              <p className="text-xs text-muted-foreground">Likelihood: {risk.likelihood}</p>
                              {risk.mitigation && (
                                <p className="text-xs text-primary mt-1">Mitigation: {risk.mitigation}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
                );
              })()}

              {riskReport.recommendations && riskReport.recommendations.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2" data-testid="display-project-recommendations">
                      {riskReport.recommendations.map((rec: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-muted/50" data-testid={`project-recommendation-${idx}`}>
                          <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                          <p className="text-sm">{typeof rec === "string" ? rec : rec.text || rec.description || rec.title}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </ScrollArea>
        <DialogFooter className="flex-row flex-wrap gap-2 pt-4 border-t">
          {selectedSuggestedRisks.size > 0 && riskReport?.topRisks && (
            <Button
              onClick={async () => {
                setIsCreatingSuggested(true);
                const risksToCreate = riskReport.topRisks.filter((_: any, i: number) => selectedSuggestedRisks.has(i));
                let created = 0;
                for (const risk of risksToCreate) {
                  const likelihoodMap: Record<string, string> = { "Very High": "Very High", "High": "High", "Medium": "Medium", "Low": "Low", "Very Low": "Very Low" };
                  const impactMap: Record<string, string> = { "Very High": "Very High", "High": "High", "Medium": "Medium", "Low": "Low", "Very Low": "Very Low" };
                  try {
                    await new Promise<void>((resolve, reject) => {
                      createRisk.mutate({
                        projectId,
                        title: risk.title,
                        description: risk.impact ? `Impact: ${risk.impact}` : "",
                        probability: likelihoodMap[risk.likelihood] || "Medium",
                        impact: impactMap[risk.impactLevel] || impactMap[risk.impact] || "Medium",
                        status: "Open",
                        mitigationPlan: risk.mitigation || "",
                        itemType: "risk",
                      }, {
                        onSuccess: () => { created++; resolve(); },
                        onError: (err) => reject(err),
                      });
                    });
                  } catch (err: any) {
                    toast({ title: "Error", description: err?.message || `Failed to create risk: ${risk.title}`, variant: "destructive" });
                  }
                }
                setIsCreatingSuggested(false);
                if (created > 0) {
                  setCreatedSuggestedIndices(prev => {
                    const next = new Set(prev);
                    selectedSuggestedRisks.forEach(i => next.add(i));
                    return next;
                  });
                  toast({ title: "Success", description: `${created} risk${created > 1 ? "s" : ""} created from suggestions` });
                }
                setSelectedSuggestedRisks(new Set());
              }}
              disabled={isCreatingSuggested}
              data-testid="button-create-suggested-risks"
            >
              {isCreatingSuggested ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create {selectedSuggestedRisks.size} Risk{selectedSuggestedRisks.size > 1 ? "s" : ""}
            </Button>
          )}
          {riskAssessmentId && (
            <Button
              variant="outline"
              onClick={() => {
                window.open(`/api/projects/${projectId}/risk-assessment/${riskAssessmentId}/pdf`, "_blank");
              }}
              data-testid="button-project-risk-download-pdf"
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          )}
          {riskShareToken && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  window.open(`/project-risk-assessment/share/${riskShareToken}`, "_blank");
                }}
                data-testid="button-project-risk-open-tab"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in New Tab
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/project-risk-assessment/share/${riskShareToken}`);
                  toast({
                    title: "Link Copied",
                    description: "Share link has been copied to clipboard.",
                  });
                }}
                data-testid="button-project-risk-copy-share"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Copy Share Link
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            onClick={() => setRiskAssessmentDialogOpen(false)}
            data-testid="button-project-risk-dialog-close"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ProjectRiskScoreTrendChart projectId={projectId} getRiskScoreColor={getRiskScoreColor} />
    </div>
  );
}

export default RisksTab;
