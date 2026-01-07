import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, CreditCard, Check, Zap, Users, FileText, FolderKanban, CheckSquare, Sparkles, AlertTriangle, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { format } from "date-fns";
import type { Plan, Subscription, UsageRollup } from "@shared/schema";

interface PlanWithRules extends Plan {
  meterRules?: Array<{
    meterCode: string;
    meterName: string;
    ruleType: string;
    includedUnitsMonthly: number | null;
    hardCapUnits: number | null;
    overageUnitPriceMicrocents: number | null;
  }>;
}

interface UsageSummary {
  [meterCode: string]: UsageRollup;
}

const meterIcons: Record<string, typeof Sparkles> = {
  ai_runs: Sparkles,
  documents: FileText,
  projects: FolderKanban,
  tasks: CheckSquare,
};

const meterLabels: Record<string, string> = {
  ai_runs: "AI Runs",
  documents: "Documents",
  projects: "Projects",
  tasks: "Tasks",
};

function formatPrice(microcents: number): string {
  return `$${(microcents / 1000000).toFixed(2)}`;
}

function getLimit(rules: PlanWithRules['meterRules'], meterCode: string): { included: number | null; hardCap: number | null; overage: number | null } {
  if (!rules) return { included: null, hardCap: null, overage: null };
  
  const meterRules = rules.filter(r => r.meterCode === meterCode);
  let included: number | null = null;
  let hardCap: number | null = null;
  let overage: number | null = null;
  
  for (const rule of meterRules) {
    if (rule.ruleType === "INCLUDED_QUOTA" && rule.includedUnitsMonthly) {
      included = rule.includedUnitsMonthly;
    }
    if (rule.ruleType === "HARD_CAP" && rule.hardCapUnits) {
      hardCap = rule.hardCapUnits;
    }
    if (rule.ruleType === "METERED_OVERAGE" && rule.overageUnitPriceMicrocents) {
      overage = rule.overageUnitPriceMicrocents;
    }
  }
  
  return { included, hardCap, overage };
}

function formatLimit(limits: { included: number | null; hardCap: number | null; overage: number | null }): string {
  if (limits.hardCap && !limits.included) {
    return `${limits.hardCap.toLocaleString()} (hard cap)`;
  }
  if (limits.included) {
    if (limits.overage) {
      return `${limits.included.toLocaleString()} included + ${formatPrice(limits.overage)}/extra`;
    }
    return `${limits.included.toLocaleString()} included`;
  }
  return "Unlimited";
}

export default function Billing() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [changePlanDialog, setChangePlanDialog] = useState<PlanWithRules | null>(null);

  const { data: plans, isLoading: plansLoading } = useQuery<PlanWithRules[]>({
    queryKey: ['/api/billing/plans'],
  });

  const { data: subscription, isLoading: subscriptionLoading } = useQuery<Subscription & { plan?: Plan }>({
    queryKey: ['/api/billing/subscription'],
    enabled: !!user,
  });

  const { data: usage, isLoading: usageLoading } = useQuery<UsageSummary>({
    queryKey: ['/api/billing/usage'],
    enabled: !!user && !!subscription,
  });

  const changePlanMutation = useMutation({
    mutationFn: async (planCode: string) => {
      if (!subscription) {
        return apiRequest('POST', '/api/billing/subscription', { planCode });
      }
      return apiRequest('PATCH', `/api/billing/subscription/${subscription.id}/plan`, { planCode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/usage'] });
      toast({ title: "Plan Updated", description: "Your subscription has been updated successfully." });
      setChangePlanDialog(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (authLoading || plansLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <CreditCard className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-2xl font-bold text-foreground">Please Log In</h2>
        <p className="text-muted-foreground">You need to be logged in to view billing information.</p>
      </div>
    );
  }

  const currentPlan = subscription?.plan || plans?.find(p => p.code === "FREE");
  const sortedPlans = plans?.sort((a, b) => {
    const order = ["FREE", "BASIC", "TEAM"];
    return order.indexOf(a.code) - order.indexOf(b.code);
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <CreditCard className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Billing & Subscription</h1>
          <p className="text-muted-foreground">Manage your plan and monitor usage</p>
        </div>
      </div>

      {subscription && currentPlan && (
        <Card data-testid="card-current-subscription">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Current Plan
                  <Badge variant="default" data-testid="badge-current-plan">{currentPlan.name}</Badge>
                </CardTitle>
                <CardDescription>
                  Billing period: {format(new Date(subscription.currentPeriodStart), "MMM d, yyyy")} - {format(new Date(subscription.currentPeriodEnd), "MMM d, yyyy")}
                </CardDescription>
              </div>
              <Badge variant={subscription.status === "ACTIVE" ? "default" : "secondary"} data-testid="badge-subscription-status">
                {subscription.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Usage This Period</h3>
              {usageLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {Object.keys(meterLabels).map((meterCode) => {
                    const rollup = usage?.[meterCode];
                    const Icon = meterIcons[meterCode] || Zap;
                    const planWithRules = plans?.find(p => p.code === currentPlan.code);
                    const limits = getLimit(planWithRules?.meterRules, meterCode);
                    
                    const current = rollup?.usedUnits || 0;
                    const limit = limits.hardCap || limits.included || 0;
                    const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
                    const isNearLimit = percentage >= 80;
                    const isAtLimit = percentage >= 100;

                    return (
                      <Card key={meterCode} className="bg-muted/30" data-testid={`card-usage-${meterCode}`}>
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{meterLabels[meterCode]}</p>
                              <p className="text-sm text-muted-foreground">
                                {current.toLocaleString()} / {limit > 0 ? limit.toLocaleString() : "∞"}
                              </p>
                            </div>
                            {isAtLimit && (
                              <AlertTriangle className="h-5 w-5 text-destructive" />
                            )}
                          </div>
                          <Progress 
                            value={percentage} 
                            className={isAtLimit ? "bg-destructive/20" : isNearLimit ? "bg-warning/20" : ""}
                            data-testid={`progress-${meterCode}`}
                          />
                          {limits.overage && current > (limits.included || 0) && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Overage: {(current - (limits.included || 0)).toLocaleString()} units at {formatPrice(limits.overage)}/unit
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-2xl font-display font-bold">Available Plans</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {sortedPlans?.map((plan) => {
            const isCurrentPlan = currentPlan?.code === plan.code;
            const planRules = plan.meterRules || [];

            return (
              <Card 
                key={plan.id} 
                className={isCurrentPlan ? "border-primary shadow-md" : ""} 
                data-testid={`card-plan-${plan.code.toLowerCase()}`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      {plan.code === "TEAM" && <Users className="h-5 w-5 text-primary" />}
                      {plan.code === "BASIC" && <Zap className="h-5 w-5 text-primary" />}
                      {plan.name}
                    </CardTitle>
                    {isCurrentPlan && (
                      <Badge variant="secondary" className="text-xs">Current</Badge>
                    )}
                  </div>
                  <CardDescription>{plan.description || `${plan.name} plan features`}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {Object.keys(meterLabels).map((meterCode) => {
                      const limits = getLimit(planRules as PlanWithRules['meterRules'], meterCode);
                      const Icon = meterIcons[meterCode] || Zap;
                      
                      return (
                        <div key={meterCode} className="flex items-center gap-3">
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm">
                            {meterLabels[meterCode]}: {formatLimit(limits)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
                <CardFooter>
                  {isCurrentPlan ? (
                    <Button variant="outline" className="w-full" disabled data-testid={`button-plan-${plan.code.toLowerCase()}-current`}>
                      Current Plan
                    </Button>
                  ) : (
                    <Button 
                      className="w-full" 
                      onClick={() => setChangePlanDialog(plan)}
                      data-testid={`button-plan-${plan.code.toLowerCase()}-select`}
                    >
                      {currentPlan && ["FREE"].includes(currentPlan.code) && plan.code !== "FREE" 
                        ? "Upgrade" 
                        : "Switch"} 
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={!!changePlanDialog} onOpenChange={(open) => !open && setChangePlanDialog(null)}>
        <DialogContent data-testid="dialog-change-plan">
          <DialogHeader>
            <DialogTitle>Change to {changePlanDialog?.name} Plan</DialogTitle>
            <DialogDescription>
              {changePlanDialog?.code === "FREE" 
                ? "Downgrading will reduce your usage limits. Any usage over the new limits may be affected."
                : `You're about to ${currentPlan?.code === "FREE" ? "upgrade" : "switch"} to the ${changePlanDialog?.name} plan.`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <h4 className="font-medium mb-3">New Plan Limits:</h4>
            <div className="space-y-2">
              {Object.keys(meterLabels).map((meterCode) => {
                const limits = getLimit(changePlanDialog?.meterRules as PlanWithRules['meterRules'], meterCode);
                const Icon = meterIcons[meterCode] || Zap;
                
                return (
                  <div key={meterCode} className="flex items-center gap-3 text-sm">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span>{meterLabels[meterCode]}: {formatLimit(limits)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanDialog(null)} data-testid="button-cancel-plan-change">
              Cancel
            </Button>
            <Button 
              onClick={() => changePlanDialog && changePlanMutation.mutate(changePlanDialog.code)}
              disabled={changePlanMutation.isPending}
              data-testid="button-confirm-plan-change"
            >
              {changePlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
