import { useQuery, useMutation } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CreditCard, Check, Zap, Users, FileText, FolderKanban, CheckSquare, Sparkles, AlertTriangle, Plus, Wallet, DollarSign, UserPlus, Clock, CheckCircle2, History, XCircle, Receipt, Calendar, Minus } from "lucide-react";
import { SiPaypal } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import PayPalSubscriptionButton from "@/components/PayPalSubscriptionButton";
import type { Plan, Subscription } from "@shared/schema";

interface CycleUsageRollup {
  meterCode: string;
  includedUnits: number;
  usedUnits: number;
  remainingUnits: number;
  overageUnits: number;
  overageCostMicrocents: number;
  hardCapHit: boolean;
}

interface BillingCycleHistory {
  id: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  planName: string;
  usage: CycleUsageRollup[];
}

interface PlanWithRules extends Omit<Plan, 'monthlyPriceCents'> {
  monthlyPriceCents?: number | null;
  meterRules?: Array<{
    meterCode: string;
    meterName: string;
    ruleType: string;
    includedUnitsMonthly: number | null;
    hardCapUnits: number | null;
    overageUnitPriceMicrocents: number | null;
  }>;
}

interface CreditCostInfo {
  resourceType: string;
  creditCost: number;
  displayName: string;
  description: string | null;
}

interface SeatInfo {
  currentSeats: number;
  maxSeats: number | null;
  remaining: number | null;
  planName: string;
  pendingInvites: number;
  extraSeatPriceCents?: number | null;
  bonusSeats?: number;
  isAdmin?: boolean;
}

interface UsageSummary {
  credits: {
    used: number;
    included: number;
    hardCap: number | null;
    remaining: number;
    limit: number;
  };
  creditCosts: CreditCostInfo[];
}

interface BillingTransaction {
  id: number;
  subscriptionId: number | null;
  userId: string | null;
  orgId: number | null;
  provider: string;
  externalTransactionId: string | null;
  externalInvoiceId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  description: string | null;
  planName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  paymentMethodType: string | null;
  paymentMethodLast4: string | null;
  receiptUrl: string | null;
  failureReason: string | null;
  createdAt: string;
}

interface CreditLedgerEntry {
  id: number;
  creditsUsed: number;
  resourceType: string;
  resourceId: string;
  occurredAt: string;
  createdAt: string;
  userId: string | null;
  userName: string;
  userEmail: string | null;
}

interface CreditLedgerResponse {
  entries: CreditLedgerEntry[];
  total: number;
}

const meterIcons: Record<string, typeof Sparkles> = {
  AI_RUNS: Sparkles,
  DOCUMENTS: FileText,
  PROJECTS: FolderKanban,
  TASKS: CheckSquare,
};

const meterLabels: Record<string, string> = {
  AI_RUNS: "AI Runs",
  DOCUMENTS: "Documents",
  PROJECTS: "Projects",
  TASKS: "Tasks",
};

function formatPrice(microcents: number): string {
  return formatCurrency(microcents / 1000000, { showCents: true });
}

function formatPlanPrice(cents: number | null | undefined, isContactUs?: boolean): string {
  if (cents === null || cents === undefined) return "Contact Us";
  if (cents === 0) return "Free";
  return formatCurrency(cents / 100, { showCents: true });
}

function isContactUsPlan(plan: PlanWithRules): boolean {
  return plan.monthlyPriceCents === null;
}

function getLimit(rules: PlanWithRules['meterRules'], meterCode: string): { included: number | null; hardCap: number | null; overage: number | null } {
  if (!rules) return { included: null, hardCap: null, overage: null };
  
  // Plan rules use lowercase meterCode, but our display keys are uppercase
  const lowerMeterCode = meterCode.toLowerCase();
  const meterRules = rules.filter(r => r.meterCode === lowerMeterCode);
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

type BillingPeriod = "monthly" | "yearly";

// Exported content component for use in OrgSettings
export function BillingContent() {
  const { user, isLoading: authLoading } = useAuth();
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [changePlanDialog, setChangePlanDialog] = useState<PlanWithRules | null>(null);
  const [activeTab, setActiveTab] = useState("billing");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [processingPayPalReturn, setProcessingPayPalReturn] = useState(false);
  const paypalReturnProcessed = useRef(false);

  // Handle PayPal redirect return (mobile devices use redirect instead of popup)
  useEffect(() => {
    if (paypalReturnProcessed.current || !user) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const subscriptionId = urlParams.get('subscription_id');
    const planCode = urlParams.get('plan_code');
    
    if (!subscriptionId) return;
    
    paypalReturnProcessed.current = true;
    setProcessingPayPalReturn(true);
    
    const activateSubscription = async () => {
      try {
        // First verify the subscription with PayPal
        const verifyRes = await fetch(`/api/paypal/subscription/${subscriptionId}`, {
          credentials: 'include',
        });
        
        if (!verifyRes.ok) {
          throw new Error('Failed to verify subscription with PayPal');
        }
        
        const subscriptionData = await verifyRes.json();
        
        // Only proceed if subscription is active or approved
        if (subscriptionData.status !== 'ACTIVE' && subscriptionData.status !== 'APPROVED') {
          throw new Error(`Subscription status is ${subscriptionData.status}, expected ACTIVE or APPROVED`);
        }
        
        // Determine plan code from URL or try to detect from subscription
        let finalPlanCode = planCode;
        if (!finalPlanCode) {
          // Try to get plan info from subscription data
          const planId = subscriptionData.plan_id;
          if (planId) {
            // Fetch plans to match PayPal plan ID to our plan code
            const plansRes = await fetch('/api/billing/plans', { credentials: 'include' });
            if (plansRes.ok) {
              const plansData = await plansRes.json();
              const plansArr = plansData.plans || plansData;
              const matchingPlan = plansArr.find((p: any) => p.paypalPlanId === planId);
              if (matchingPlan) {
                finalPlanCode = matchingPlan.code;
              }
            }
          }
        }
        
        if (!finalPlanCode) {
          throw new Error('Could not determine plan for subscription');
        }
        
        // Activate the subscription in our system (organization-based)
        if (!currentOrganization?.id) {
          throw new Error('Please select an organization first');
        }
        await apiRequest('POST', '/api/billing/subscription/paypal', {
          planCode: finalPlanCode,
          paypalSubscriptionId: subscriptionId,
          organizationId: currentOrganization.id,
        });
        
        // Refresh subscription data
        queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
        queryClient.invalidateQueries({ queryKey: ['/api/billing/usage'] });
        
        toast({
          title: "Subscription Activated!",
          description: "Your subscription has been successfully activated.",
        });
        
        // Clean up URL parameters
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        
      } catch (error: any) {
        console.error('Failed to activate PayPal subscription:', error);
        toast({
          title: "Subscription Activation Failed",
          description: error.message || "Please contact support if the issue persists.",
          variant: "destructive",
        });
      } finally {
        setProcessingPayPalReturn(false);
      }
    };
    
    activateSubscription();
  }, [user, toast, currentOrganization]);

  const YEARLY_DISCOUNT = 0.10; // 10% discount for yearly billing
  
  function getPriceForPeriod(monthlyPriceCents: number | null | undefined): { 
    displayPrice: string; 
    periodLabel: string; 
    annualTotal?: string;
    savings?: string;
  } {
    if (monthlyPriceCents === null || monthlyPriceCents === undefined) {
      return { displayPrice: "Contact Us", periodLabel: "" };
    }
    if (monthlyPriceCents === 0) {
      return { displayPrice: "Free", periodLabel: "" };
    }
    
    const monthlyPrice = monthlyPriceCents / 100;
    
    if (billingPeriod === "yearly") {
      const discountedMonthly = monthlyPrice * (1 - YEARLY_DISCOUNT);
      const annualTotal = discountedMonthly * 12;
      const savings = monthlyPrice * 12 * YEARLY_DISCOUNT;
      return { 
        displayPrice: formatCurrency(discountedMonthly, { showCents: true }),
        periodLabel: "/mo",
        annualTotal: `${formatCurrency(annualTotal, { showCents: true })}/year`,
        savings: `Save ${formatCurrency(savings, { showCents: true })}`
      };
    }
    
    return { 
      displayPrice: formatCurrency(monthlyPrice, { showCents: true }),
      periodLabel: "/mo"
    };
  }

  const { data: plansResponse, isLoading: plansLoading } = useQuery<{ plans: PlanWithRules[]; creditCosts: any[] }>({
    queryKey: ['/api/billing/plans'],
  });
  const plans = plansResponse?.plans;

  const { data: subscription, isLoading: subscriptionLoading } = useQuery<Subscription & { plan?: Plan }>({
    queryKey: ['/api/billing/subscription', currentOrganization?.id],
    queryFn: async () => {
      const url = currentOrganization?.id 
        ? `/api/billing/subscription?orgId=${currentOrganization.id}`
        : '/api/billing/subscription';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch subscription');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: usage, isLoading: usageLoading } = useQuery<UsageSummary>({
    queryKey: ['/api/billing/usage', currentOrganization?.id],
    queryFn: async () => {
      const url = currentOrganization?.id 
        ? `/api/billing/usage?orgId=${currentOrganization.id}`
        : '/api/billing/usage';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch usage');
      return res.json();
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  interface PaymentMethod {
    hasPaymentMethod: boolean;
    type?: string;
    email?: string;
    payerId?: string;
    name?: string;
    status?: string;
  }

  const { data: paymentMethod, isLoading: paymentLoading } = useQuery<PaymentMethod>({
    queryKey: ['/api/billing/payment-method'],
    enabled: !!user && !!subscription,
  });

  const { data: billingHistory, isLoading: historyLoading } = useQuery<BillingTransaction[]>({
    queryKey: ['/api/billing/history', currentOrganization?.id],
    queryFn: async () => {
      const url = currentOrganization?.id 
        ? `/api/billing/history?orgId=${currentOrganization.id}&limit=50`
        : '/api/billing/history?limit=50';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch billing history');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: cycleHistory, isLoading: cycleHistoryLoading } = useQuery<BillingCycleHistory[]>({
    queryKey: ['/api/billing/cycle-history', currentOrganization?.id],
    queryFn: async () => {
      const url = currentOrganization?.id 
        ? `/api/billing/cycle-history?orgId=${currentOrganization.id}`
        : '/api/billing/cycle-history';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch cycle history');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: creditLedger, isLoading: ledgerLoading } = useQuery<CreditLedgerResponse>({
    queryKey: ['/api/billing/credit-ledger', currentOrganization?.id],
    queryFn: async () => {
      const url = currentOrganization?.id 
        ? `/api/billing/credit-ledger?limit=100&orgId=${currentOrganization.id}`
        : '/api/billing/credit-ledger?limit=100';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch credit ledger');
      return res.json();
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: seatInfo, isLoading: seatLoading } = useQuery<SeatInfo>({
    queryKey: [`/api/organizations/${currentOrganization?.id}/seats`],
    enabled: !!currentOrganization?.id,
  });

  const purchaseExtraSeatMutation = useMutation({
    mutationFn: async (quantity: number = 1) => {
      return apiRequest('POST', `/api/organizations/${currentOrganization?.id}/seats/purchase`, { quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${currentOrganization?.id}/seats`] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/history'] });
      toast({ title: "Success", description: "Extra seat purchased successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeExtraSeatMutation = useMutation({
    mutationFn: async (quantity: number = 1) => {
      return apiRequest('POST', `/api/organizations/${currentOrganization?.id}/seats/remove`, { quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${currentOrganization?.id}/seats`] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/history'] });
      toast({ title: "Success", description: "Extra seat removed successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
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

  const enterpriseInquiryMutation = useMutation({
    mutationFn: async (planName: string) => {
      return apiRequest('POST', '/api/billing/enterprise-inquiry', { planName });
    },
    onSuccess: () => {
      toast({ 
        title: "Inquiry Sent!", 
        description: "We've received your inquiry and will contact you shortly." 
      });
      setChangePlanDialog(null);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: "Failed to send inquiry. Please try again or email sales@fridayreport.ai directly.", 
        variant: "destructive" 
      });
    },
  });

  if (authLoading || plansLoading || processingPayPalReturn) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {processingPayPalReturn && (
          <p className="text-muted-foreground">Activating your subscription...</p>
        )}
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
  const sortedPlans = plans ? [...plans].sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999)) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-foreground">Billing</h1>
        </div>
        {subscription && (
          <Badge variant={subscription.status === "ACTIVE" ? "default" : "secondary"} data-testid="badge-subscription-status">
            {subscription.status}
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full max-w-2xl flex-wrap h-auto gap-1 justify-start">
          <TabsTrigger value="billing" data-testid="tab-billing">
            <CreditCard className="h-4 w-4 mr-1 sm:mr-2" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="ledger" data-testid="tab-ledger">
            <FileText className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="sm:hidden">Credits</span>
            <span className="hidden sm:inline">Credit Ledger</span>
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="h-4 w-4 mr-1 sm:mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="billing" className="space-y-5 mt-4">

      {subscription && currentPlan && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card data-testid="card-current-subscription">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                Current Plan
                <Badge variant="default" data-testid="badge-current-plan">{currentPlan.name}</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                {format(new Date(subscription.currentPeriodStart), "MMM d")} - {format(new Date(subscription.currentPeriodEnd), "MMM d, yyyy")}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {usageLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : usage?.credits ? (
                <div className="space-y-4">
                  <div className="space-y-2" data-testid="card-usage-credits">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Wallet className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Credits</span>
                      </div>
                      {usage.credits.remaining <= 0 && <AlertTriangle className="h-4 w-4 text-destructive" />}
                    </div>
                    <Progress 
                      value={usage.credits.limit > 0 ? Math.min((usage.credits.used / usage.credits.limit) * 100, 100) : 0} 
                      className={`h-2 ${usage.credits.remaining <= 0 ? "bg-destructive/20" : usage.credits.remaining < usage.credits.limit * 0.2 ? "bg-warning/20" : ""}`}
                      data-testid="progress-credits"
                    />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {usage.credits.used.toLocaleString()} / {usage.credits.limit.toLocaleString()} credits used
                      </span>
                      <span className={`font-medium ${usage.credits.remaining <= 0 ? 'text-destructive' : 'text-primary'}`}>
                        {usage.credits.remaining.toLocaleString()} remaining
                      </span>
                    </div>
                  </div>
                  
                  {usage.creditCosts && usage.creditCosts.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium mb-2 text-muted-foreground">Credit Costs</p>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        {usage.creditCosts.slice(0, 6).map((cost) => (
                          <div key={cost.resourceType} className="flex items-center justify-between gap-1 text-muted-foreground">
                            <span>{cost.displayName}</span>
                            <span className="font-mono">{cost.creditCost}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No usage data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-payment-methods">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4" />
                Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {paymentLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : paymentMethod?.hasPaymentMethod ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-blue-500/10">
                        <SiPaypal className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">PayPal</p>
                        {paymentMethod.email && (
                          <p className="text-xs text-muted-foreground">{paymentMethod.email}</p>
                        )}
                        {paymentMethod.name && !paymentMethod.email && (
                          <p className="text-xs text-muted-foreground">{paymentMethod.name}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {paymentMethod.status === "ACTIVE" ? "Active" : paymentMethod.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your payment method is managed through your PayPal account.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-dashed bg-muted/30">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">No payment method</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A payment method will be added when you subscribe to a paid plan via PayPal.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Monthly Billing Summary */}
      {subscription && currentPlan && (
        <Card data-testid="card-billing-summary">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4" />
              Monthly Billing Summary
            </CardTitle>
            <CardDescription className="text-xs flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Billing cycle: {format(new Date(subscription.currentPeriodStart), "MMM d")} - {format(new Date(subscription.currentPeriodEnd), "MMM d, yyyy")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{currentPlan.name} Plan</span>
                <span className="font-medium">
                  {currentPlan.monthlyPriceCents === null || currentPlan.monthlyPriceCents === undefined
                    ? "Custom pricing" 
                    : currentPlan.monthlyPriceCents > 0 
                      ? formatCurrency(currentPlan.monthlyPriceCents / 100, { showCents: true }) 
                      : "Free"}
                </span>
              </div>
              
              {seatInfo?.bonusSeats !== undefined && seatInfo.bonusSeats > 0 && seatInfo.extraSeatPriceCents && seatInfo.extraSeatPriceCents > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Extra Seats ({seatInfo.bonusSeats} × {formatCurrency(seatInfo.extraSeatPriceCents / 100, { showCents: true })})
                  </span>
                  <span className="font-medium">
                    {formatCurrency((seatInfo.bonusSeats * seatInfo.extraSeatPriceCents) / 100, { showCents: true })}
                  </span>
                </div>
              )}
              
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Total Monthly Amount</span>
                  <span className="text-lg font-bold text-primary">
                    {(() => {
                      if (currentPlan.monthlyPriceCents === null) {
                        return "Contact sales";
                      }
                      const planPrice = currentPlan.monthlyPriceCents || 0;
                      const extraSeatsPrice = (seatInfo?.bonusSeats && seatInfo?.extraSeatPriceCents) 
                        ? seatInfo.bonusSeats * seatInfo.extraSeatPriceCents 
                        : 0;
                      const total = planPrice + extraSeatsPrice;
                      return total > 0 ? `${formatCurrency(total / 100, { showCents: true })}/mo` : "Free";
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extra Seats Section */}
      {seatInfo && currentOrganization && (
        <Card data-testid="card-extra-seats">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4" />
              Team Seats
            </CardTitle>
            <CardDescription className="text-xs">
              Manage team member seats for your organization
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {/* Current Seat Usage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Seat Usage</span>
                  </div>
                  {seatInfo.remaining === 0 && seatInfo.maxSeats !== null && (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                </div>
                {seatInfo.maxSeats !== null ? (
                  <>
                    <Progress 
                      value={Math.min((seatInfo.currentSeats / seatInfo.maxSeats) * 100, 100)} 
                      className={`h-2 ${seatInfo.remaining === 0 ? "bg-destructive/20" : ""}`}
                      data-testid="progress-seats"
                    />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {seatInfo.currentSeats} / {seatInfo.maxSeats} seats used
                        {seatInfo.pendingInvites > 0 && (
                          <span className="ml-1">({seatInfo.pendingInvites} pending)</span>
                        )}
                      </span>
                      <span className={`font-medium ${seatInfo.remaining === 0 ? 'text-destructive' : 'text-primary'}`}>
                        {seatInfo.remaining} available
                      </span>
                    </div>
                    {seatInfo.bonusSeats !== undefined && seatInfo.bonusSeats > 0 && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        Includes {seatInfo.bonusSeats} extra seat{seatInfo.bonusSeats !== 1 ? 's' : ''} purchased
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    <Check className="h-4 w-4 inline mr-1 text-green-500" />
                    Unlimited seats ({seatInfo.currentSeats} members)
                  </div>
                )}
              </div>

              {/* Purchase/Remove Extra Seats (Admin only) */}
              {seatInfo.extraSeatPriceCents && seatInfo.extraSeatPriceCents > 0 && seatInfo.isAdmin && seatInfo.maxSeats !== null && (
                <div className="pt-3 border-t">
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex-1">
                      <div className="text-sm font-medium">Extra Seats</div>
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(seatInfo.extraSeatPriceCents / 100, { showCents: true })}/seat/month
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="icon" 
                        variant="outline" 
                        className="h-8 w-8 p-0"
                        onClick={() => removeExtraSeatMutation.mutate(1)}
                        disabled={removeExtraSeatMutation.isPending || (seatInfo.bonusSeats || 0) <= 0}
                        data-testid="button-remove-seat"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-bold min-w-[1.5rem] text-center" data-testid="text-bonus-seats">
                        {seatInfo.bonusSeats || 0}
                      </span>
                      <Button 
                        size="icon" 
                        variant="outline" 
                        className="h-8 w-8 p-0"
                        onClick={() => purchaseExtraSeatMutation.mutate(1)}
                        disabled={purchaseExtraSeatMutation.isPending}
                        data-testid="button-add-seat"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Extra seats are billed monthly and added to your next invoice.
                  </p>
                </div>
              )}

              {/* Message for non-admins */}
              {seatInfo.extraSeatPriceCents && seatInfo.extraSeatPriceCents > 0 && !seatInfo.isAdmin && seatInfo.maxSeats !== null && (
                <div className="pt-3 border-t">
                  <div className="text-xs text-muted-foreground">
                    Contact your organization admin to purchase additional seats.
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-display font-semibold text-center">Plans</h2>
        <div className="flex justify-center">
          <div className="flex items-center gap-1 p-1.5 bg-muted rounded-xl border shadow-sm" data-testid="billing-period-toggle">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
                billingPeriod === "monthly" 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10"
              }`}
              data-testid="button-billing-monthly"
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("yearly")}
              className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 ${
                billingPeriod === "yearly" 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10"
              }`}
              data-testid="button-billing-yearly"
            >
              Yearly
              <Badge className="bg-green-500 hover:bg-green-500 text-white text-[10px] px-1.5 py-0.5">Save 10%</Badge>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          {sortedPlans?.map((plan) => {
            const isCurrentPlan = currentPlan?.code === plan.code;
            const planRules = plan.meterRules || [];
            const priceInfo = getPriceForPeriod(plan.monthlyPriceCents);

            return (
              <Card 
                key={plan.id} 
                className={`flex-1 min-w-[220px] max-w-[280px] flex flex-col ${isCurrentPlan ? "border-primary" : ""}`} 
                data-testid={`card-plan-${plan.code.toLowerCase()}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-1.5 text-base">
                      {plan.code === "TEAM" && <Users className="h-4 w-4 text-primary" />}
                      {plan.code === "BASIC" && <Zap className="h-4 w-4 text-primary" />}
                      {plan.name}
                    </CardTitle>
                    {isCurrentPlan && <Badge variant="secondary" className="text-xs">Current</Badge>}
                  </div>
                  <div className="mt-1">
                    <span className="text-2xl font-bold" data-testid={`price-${plan.code.toLowerCase()}`}>
                      {priceInfo.displayPrice}
                    </span>
                    {priceInfo.periodLabel && (
                      <span className="text-muted-foreground text-xs">{priceInfo.periodLabel}</span>
                    )}
                    {priceInfo.annualTotal && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {priceInfo.annualTotal}
                      </div>
                    )}
                    {priceInfo.savings && billingPeriod === "yearly" && plan.monthlyPriceCents && plan.monthlyPriceCents > 0 && (
                      <Badge variant="outline" className="text-[10px] mt-1 text-green-600 border-green-600/30">
                        {priceInfo.savings}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-3 flex-1">
                  <div className="space-y-3">
                    {/* Plan description - parse bullet points */}
                    {plan.description && (
                      <div className="space-y-1.5">
                        {plan.description.split(' - ').filter(Boolean).slice(0, 4).map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Check className="h-3 w-3 text-primary flex-shrink-0 mt-0.5" />
                            <span>{feature.replace(/^- /, '').trim()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Show credits allocation */}
                    {(() => {
                      const creditsRules = planRules?.filter((r: any) => r.meterCode === 'credits') || [];
                      const quotaRule = creditsRules.find((r: any) => r.ruleType === 'INCLUDED_QUOTA');
                      const hardCapRule = creditsRules.find((r: any) => r.ruleType === 'HARD_CAP');
                      const creditsLimit = quotaRule?.includedUnitsMonthly || hardCapRule?.hardCapUnits || 0;
                      
                      // Calculate capacity estimates based on credit costs
                      const projectCost = usage?.creditCosts?.find(c => c.resourceType === 'project')?.creditCost || 5;
                      const taskCost = usage?.creditCosts?.find(c => c.resourceType === 'task')?.creditCost || 1;
                      const issueCost = usage?.creditCosts?.find(c => c.resourceType === 'issue')?.creditCost || 1;
                      
                      const maxProjects = creditsLimit ? Math.floor(creditsLimit / projectCost) : null;
                      const maxTasks = creditsLimit ? Math.floor(creditsLimit / taskCost) : null;
                      const maxIssues = creditsLimit ? Math.floor(creditsLimit / issueCost) : null;
                      
                      // Find overage pricing rule
                      const overageRule = creditsRules.find((r: any) => r.ruleType === 'METERED_OVERAGE');
                      const overagePriceMicrocents = overageRule?.overageUnitPriceMicrocents;
                      
                      return (
                        <div className="pt-2 border-t space-y-1.5">
                          <div className="flex items-center gap-2 text-xs">
                            <Wallet className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                            <span className="font-medium">
                              {creditsLimit ? `${creditsLimit.toLocaleString()} credits/month` : 'Unlimited credits'}
                            </span>
                          </div>
                          {creditsLimit > 0 && (
                            <div className="ml-5 text-[10px] text-muted-foreground">
                              Up to {maxProjects?.toLocaleString()} projects, {maxTasks?.toLocaleString()} tasks, {maxIssues?.toLocaleString()} issues
                            </div>
                          )}
                          {overagePriceMicrocents && overagePriceMicrocents > 0 && (
                            <div className="ml-5 text-[10px] text-muted-foreground flex items-center gap-1">
                              <DollarSign className="h-2.5 w-2.5" />
                              <span>Overage: {formatPrice(overagePriceMicrocents)}/credit</span>
                            </div>
                          )}
                          {plan.maxSeats && (
                            <div className="flex items-center gap-2 text-xs">
                              <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground">
                                Up to {plan.maxSeats} {plan.maxSeats === 1 ? 'seat' : 'seats'}
                              </span>
                            </div>
                          )}
                          {plan.maxSeats && plan.extraSeatPriceCents && plan.extraSeatPriceCents > 0 && (
                            <div className="ml-5 text-[10px] text-muted-foreground">
                              +{formatCurrency(plan.extraSeatPriceCents / 100, { showCents: true })}/seat/month for extra seats
                            </div>
                          )}
                          {!plan.maxSeats && (
                            <div className="flex items-center gap-2 text-xs">
                              <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground">Unlimited seats</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </CardContent>
                <CardFooter className="pt-0">
                  {isCurrentPlan ? (
                    <Button size="sm" variant="outline" className="w-full" disabled data-testid={`button-plan-${plan.code.toLowerCase()}-current`}>
                      Current
                    </Button>
                  ) : isContactUsPlan(plan) ? (
                    <Button 
                      size="sm"
                      variant="outline"
                      className="w-full" 
                      onClick={() => enterpriseInquiryMutation.mutate(plan.name)}
                      disabled={enterpriseInquiryMutation.isPending}
                      data-testid={`button-plan-${plan.code.toLowerCase()}-contact`}
                    >
                      {enterpriseInquiryMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      Contact Sales
                    </Button>
                  ) : (
                    <Button 
                      size="sm"
                      className="w-full" 
                      onClick={() => setChangePlanDialog(plan)}
                      data-testid={`button-plan-${plan.code.toLowerCase()}-select`}
                    >
                      {currentPlan && ["FREE"].includes(currentPlan.code) && plan.code !== "FREE" ? "Upgrade" : "Switch"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Credit Pricing Section */}
      <Card data-testid="card-credit-pricing">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            Credit Pricing
          </CardTitle>
          <CardDescription className="text-xs">
            Each action costs credits. Mix and match resources based on your needs.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {usageLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : usage?.creditCosts && usage.creditCosts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {usage.creditCosts.map((cost) => {
                const icons: Record<string, typeof FolderKanban> = {
                  projects: FolderKanban,
                  tasks: CheckSquare,
                  issues: AlertTriangle,
                  risks: AlertTriangle,
                  documents: FileText,
                  resources: Users,
                  resource_assignments: Users,
                  ai_runs: Sparkles
                };
                const Icon = icons[cost.resourceType] || Zap;
                
                return (
                  <div 
                    key={cost.resourceType} 
                    className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                    data-testid={`credit-price-${cost.resourceType}`}
                  >
                    <div className="p-2 rounded-md bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{cost.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {cost.creditCost} {cost.creditCost === 1 ? 'credit' : 'credits'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              Credit pricing information not available
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="ledger" className="space-y-5 mt-4">
          <Card data-testid="card-credit-ledger">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                Credit Usage Ledger
              </CardTitle>
              <CardDescription className="text-xs">
                Detailed history of all credit usage in your account
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {ledgerLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !creditLedger || creditLedger.entries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Wallet className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No credit usage recorded yet</p>
                  <p className="text-xs mt-1">Credit transactions will appear here as you use the platform</p>
                </div>
              ) : (
                <div className="space-y-1 overflow-x-auto">
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b min-w-0">
                    <div>Date</div>
                    <div className="hidden sm:block">User</div>
                    <div>Type</div>
                    <div className="hidden sm:block">Resource ID</div>
                    <div className="text-right">Credits</div>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {creditLedger.entries.map((entry) => (
                      <div 
                        key={entry.id} 
                        className="grid grid-cols-3 sm:grid-cols-5 gap-2 px-3 py-2 text-sm border-b last:border-0 hover:bg-muted/50"
                        data-testid={`ledger-entry-${entry.id}`}
                      >
                        <div className="text-muted-foreground text-xs sm:text-sm">
                          {format(new Date(entry.occurredAt), "MMM d, yyyy h:mm a")}
                        </div>
                        <div className="truncate hidden sm:block" title={entry.userEmail || undefined}>
                          {entry.userName}
                        </div>
                        <div>
                          <Badge variant="outline" className="text-xs capitalize">
                            {entry.resourceType.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground font-mono text-xs hidden sm:block">
                          #{entry.resourceId}
                        </div>
                        <div className="text-right font-medium text-destructive">
                          -{entry.creditsUsed}
                        </div>
                      </div>
                    ))}
                  </div>
                  {creditLedger.total > creditLedger.entries.length && (
                    <div className="text-center py-2 text-xs text-muted-foreground">
                      Showing {creditLedger.entries.length} of {creditLedger.total} entries
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-5 mt-4">
          <Card data-testid="card-billing-cycle-history">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" />
                Billing Cycle History
              </CardTitle>
              <CardDescription className="text-xs">
                Credit usage and allocations for each billing period
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {cycleHistoryLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !cycleHistory || cycleHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No billing cycle history yet</p>
                  <p className="text-xs mt-1">Your billing cycles will appear here as each period completes</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cycleHistory.map((cycle) => {
                    const creditsUsage = cycle.usage.find(u => u.meterCode === 'credits');
                    const otherUsage = cycle.usage.filter(u => u.meterCode !== 'credits');
                    const isCurrent = cycle.status === "OPEN";
                    const creditsPercent = creditsUsage && creditsUsage.includedUnits > 0
                      ? Math.min((creditsUsage.usedUnits / creditsUsage.includedUnits) * 100, 100)
                      : 0;

                    return (
                      <div 
                        key={cycle.id} 
                        className={`border rounded-md overflow-visible ${isCurrent ? "border-primary/50" : ""}`}
                        data-testid={`cycle-${cycle.id}`}
                      >
                        <div className="flex items-center justify-between gap-3 p-3 bg-muted/30">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {format(new Date(cycle.periodStart), "MMM d")} - {format(new Date(cycle.periodEnd), "MMM d, yyyy")}
                            </span>
                            <Badge variant={isCurrent ? "default" : "secondary"} className="text-xs">
                              {isCurrent ? "Current" : "Closed"}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{cycle.planName}</span>
                        </div>
                        <div className="p-3 space-y-3">
                          {creditsUsage && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <div className="flex items-center gap-1.5">
                                  <Wallet className="h-3.5 w-3.5 text-primary" />
                                  <span className="font-medium">Credits</span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {creditsUsage.usedUnits.toLocaleString()} / {creditsUsage.includedUnits.toLocaleString()} used
                                </span>
                              </div>
                              <Progress 
                                value={creditsPercent} 
                                className={`h-1.5 ${creditsUsage.remainingUnits <= 0 && creditsUsage.includedUnits > 0 ? "bg-destructive/20" : ""}`}
                              />
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{creditsUsage.remainingUnits.toLocaleString()} remaining</span>
                                {creditsUsage.overageUnits > 0 && (
                                  <span className="text-destructive">
                                    {creditsUsage.overageUnits.toLocaleString()} overage
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          {otherUsage.length > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t">
                              {otherUsage.map((u) => (
                                <div key={u.meterCode} className="text-xs">
                                  <span className="text-muted-foreground capitalize">{u.meterCode.replace(/_/g, ' ')}</span>
                                  <div className="font-medium">
                                    {u.usedUnits} / {u.includedUnits > 0 ? u.includedUnits : 'Unlimited'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-payment-history">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4" />
                Payment History
              </CardTitle>
              <CardDescription className="text-xs">
                View your past payments and invoices
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !billingHistory || billingHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No payment history yet</p>
                  <p className="text-xs mt-1">Your payments will appear here once you upgrade to a paid plan</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {billingHistory.map((transaction) => (
                    <div 
                      key={transaction.id} 
                      className="flex items-center justify-between gap-3 p-3 border rounded-md"
                      data-testid={`transaction-${transaction.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          transaction.status === "COMPLETED" 
                            ? "bg-green-500/10 text-green-600" 
                            : transaction.status === "FAILED" 
                              ? "bg-destructive/10 text-destructive" 
                              : "bg-muted text-muted-foreground"
                        }`}>
                          {transaction.status === "COMPLETED" ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : transaction.status === "FAILED" ? (
                            <XCircle className="h-4 w-4" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {transaction.description || transaction.planName || "Payment"}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{format(new Date(transaction.createdAt), "MMM d, yyyy")}</span>
                            {transaction.provider && (
                              <>
                                <span className="text-muted-foreground/50">|</span>
                                <span className="capitalize">{transaction.provider}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${
                          transaction.status === "COMPLETED" 
                            ? "text-foreground" 
                            : transaction.status === "FAILED" 
                              ? "text-destructive" 
                              : "text-muted-foreground"
                        }`}>
                          {formatCurrency(transaction.amountCents / 100, { showCents: true, currency: transaction.currency || "USD" })}
                        </p>
                        <Badge 
                          variant={
                            transaction.status === "COMPLETED" ? "default" : 
                            transaction.status === "FAILED" ? "destructive" : "secondary"
                          }
                          className="text-xs"
                        >
                          {transaction.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <Dialog open={!!changePlanDialog} onOpenChange={(open) => !open && setChangePlanDialog(null)}>
        <DialogContent data-testid="dialog-change-plan">
          <DialogHeader>
            <DialogTitle>
              {changePlanDialog && isContactUsPlan(changePlanDialog) 
                ? `Interested in ${changePlanDialog?.name}?` 
                : `Change to ${changePlanDialog?.name} Plan`}
            </DialogTitle>
            <DialogDescription>
              {changePlanDialog && isContactUsPlan(changePlanDialog) 
                ? "Our Enterprise plan offers custom pricing tailored to your organization's needs."
                : changePlanDialog?.code === "FREE" 
                  ? "Downgrading will reduce your usage limits. Any usage over the new limits may be affected."
                  : (() => {
                      const dialogPriceInfo = getPriceForPeriod(changePlanDialog?.monthlyPriceCents);
                      const billingLabel = billingPeriod === "yearly" 
                        ? `${dialogPriceInfo.displayPrice}/mo (${dialogPriceInfo.annualTotal} billed annually)`
                        : `${dialogPriceInfo.displayPrice}/month`;
                      return `You're about to ${currentPlan?.code === "FREE" ? "upgrade" : "switch"} to the ${changePlanDialog?.name} plan at ${billingLabel}.`;
                    })()}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <h4 className="font-medium mb-3">New Plan Limits:</h4>
            <div className="space-y-2">
              {(() => {
                const creditsRules = changePlanDialog?.meterRules?.filter((r: any) => r.meterCode === 'credits') || [];
                const quotaRule = creditsRules.find((r: any) => r.ruleType === 'INCLUDED_QUOTA');
                const hardCapRule = creditsRules.find((r: any) => r.ruleType === 'HARD_CAP');
                const creditsLimit = quotaRule?.includedUnitsMonthly || hardCapRule?.hardCapUnits;
                return (
                  <div className="flex items-center gap-3 text-sm">
                    <Wallet className="h-4 w-4 text-primary" />
                    <span className="font-medium">
                      {creditsLimit ? `${creditsLimit.toLocaleString()} credits per month` : 'Unlimited credits'}
                    </span>
                  </div>
                );
              })()}
              <p className="text-xs text-muted-foreground ml-7">
                Credits are used when creating projects (5 credits), tasks, issues, risks (1 credit each), and more.
              </p>
            </div>
            
            {changePlanDialog && isContactUsPlan(changePlanDialog) ? (
              <div className="mt-4 pt-4 border-t">
                <div className="p-4 rounded-md bg-muted/50 text-center">
                  <p className="text-sm font-medium mb-2">Get a Custom Quote</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Contact our sales team to discuss your organization's specific requirements and get custom pricing.
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button 
                      variant="default"
                      onClick={() => enterpriseInquiryMutation.mutate(changePlanDialog.name)}
                      disabled={enterpriseInquiryMutation.isPending}
                      data-testid="button-contact-sales"
                    >
                      {enterpriseInquiryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Contact Sales
                    </Button>
                    {user?.role === 'super_admin' && (
                      <Button 
                        variant="outline"
                        onClick={() => changePlanMutation.mutate(changePlanDialog.code)}
                        disabled={changePlanMutation.isPending}
                        data-testid="button-admin-switch-enterprise"
                      >
                        {changePlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Switch to Enterprise (Admin)
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : changePlanDialog && changePlanDialog.monthlyPriceCents != null && changePlanDialog.monthlyPriceCents > 0 ? (
              <div className="mt-4 pt-4 border-t">
                {billingPeriod === "yearly" && (
                  <div className="mb-3 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Yearly billing coming soon! Currently subscribing monthly. You'll receive the yearly rate once available.
                    </p>
                  </div>
                )}
                {changePlanDialog.paypalPlanId ? (
                  <>
                    <p className="text-sm text-muted-foreground mb-3">Subscribe with PayPal for secure recurring payments:</p>
                    <PayPalSubscriptionButton
                      key={`paypal-btn-${changePlanDialog.code}-${changePlanDialog.paypalPlanId}`}
                      planId={changePlanDialog.paypalPlanId}
                      planCode={changePlanDialog.code}
                      onSuccess={async (subscriptionId, subscriptionData) => {
                        try {
                          if (!currentOrganization?.id) {
                            throw new Error('Please select an organization first');
                          }
                          await apiRequest('POST', '/api/billing/subscription/paypal', {
                            planCode: changePlanDialog.code,
                            paypalSubscriptionId: subscriptionId,
                            organizationId: currentOrganization.id,
                          });
                          queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
                          queryClient.invalidateQueries({ queryKey: ['/api/billing/usage'] });
                          setChangePlanDialog(null);
                          toast({ 
                            title: "Subscription Active!", 
                            description: `Your ${changePlanDialog.name} plan subscription is now active.` 
                          });
                        } catch (error) {
                          console.error('[Billing] PayPal activation error:', error);
                          const errorMessage = error instanceof Error ? error.message : "Failed to activate subscription. Please contact support.";
                          toast({ 
                            title: "Error", 
                            description: errorMessage, 
                            variant: "destructive" 
                          });
                        }
                      }}
                      onError={(error) => {
                        toast({ 
                          title: "Payment Error", 
                          description: "There was an issue with your payment. Please try again.", 
                          variant: "destructive" 
                        });
                      }}
                      onCancel={() => {
                        toast({ 
                          title: "Payment Cancelled", 
                          description: "Your subscription was not processed." 
                        });
                      }}
                    />
                  </>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Payment processing is being set up. Please check back shortly.</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanDialog(null)} data-testid="button-cancel-plan-change">
              Cancel
            </Button>
            {(!changePlanDialog?.monthlyPriceCents || changePlanDialog.monthlyPriceCents === 0) && (
              <Button 
                onClick={() => changePlanDialog && changePlanMutation.mutate(changePlanDialog.code)}
                disabled={changePlanMutation.isPending}
                data-testid="button-confirm-plan-change"
              >
                {changePlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Downgrade to Free
              </Button>
            )}
            {user?.role === 'super_admin' && changePlanDialog?.monthlyPriceCents != null && changePlanDialog.monthlyPriceCents > 0 && (
              <Button 
                onClick={() => changePlanDialog && changePlanMutation.mutate(changePlanDialog.code)}
                disabled={changePlanMutation.isPending}
                data-testid="button-admin-switch-plan"
              >
                {changePlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Switch Plan (Admin)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Default export wraps BillingContent for standalone page use
export default function Billing() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [, setLocation] = useLocation();
  
  const shouldRedirect = currentOrganization?.billingHidden && user?.role !== 'super_admin';
  
  useEffect(() => {
    if (shouldRedirect) {
      setLocation('/');
    }
  }, [shouldRedirect, setLocation]);
  
  if (shouldRedirect) {
    return null;
  }
  
  return <BillingContent />;
}
