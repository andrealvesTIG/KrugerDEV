import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CreditCard, Check, Zap, Users, FileText, FolderKanban, CheckSquare, Sparkles, AlertTriangle, ArrowRight, Plus, Wallet, Gift, Share2, DollarSign, Copy, UserPlus, TrendingUp, Clock, CheckCircle2, History, XCircle } from "lucide-react";
import { SiPaypal } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { format } from "date-fns";
import PayPalSubscriptionButton from "@/components/PayPalSubscriptionButton";
import type { Plan, Subscription, UsageRollup } from "@shared/schema";

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

interface ReferralCode {
  id: number;
  userId: string;
  code: string;
  commissionPercent: number;
  isActive: boolean;
  totalReferrals: number;
  totalEarningsCents: number;
  createdAt: string;
}

interface Referral {
  id: number;
  referralCodeId: number;
  referrerId: string;
  referredUserId: string | null;
  referredEmail: string | null;
  status: string;
  signedUpAt: string | null;
  convertedAt: string | null;
  conversionAmountCents: number | null;
  commissionAmountCents: number | null;
  createdAt: string;
}

interface ReferralPayout {
  id: number;
  userId: string;
  amountCents: number;
  status: string;
  paypalEmail: string | null;
  paypalTransactionId: string | null;
  processedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface ReferralStats {
  code: ReferralCode | null;
  totalReferrals: number;
  signedUp: number;
  converted: number;
  pendingEarningsCents: number;
  paidOutCents: number;
  referrals: Referral[];
  payouts: ReferralPayout[];
}

interface UsageSummary {
  [meterCode: string]: UsageRollup;
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
  return `$${(microcents / 1000000).toFixed(2)}`;
}

function formatPlanPrice(cents: number | null | undefined, isContactUs?: boolean): string {
  if (cents === null || cents === undefined) return "Contact Us";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
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

export default function Billing() {
  const { user, isLoading: authLoading } = useAuth();
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [changePlanDialog, setChangePlanDialog] = useState<PlanWithRules | null>(null);
  const [activeTab, setActiveTab] = useState("billing");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");

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
        displayPrice: `$${discountedMonthly.toFixed(2)}`,
        periodLabel: "/mo",
        annualTotal: `$${annualTotal.toFixed(2)}/year`,
        savings: `Save $${savings.toFixed(2)}`
      };
    }
    
    return { 
      displayPrice: `$${monthlyPrice.toFixed(2)}`,
      periodLabel: "/mo"
    };
  }

  const { data: plans, isLoading: plansLoading } = useQuery<PlanWithRules[]>({
    queryKey: ['/api/billing/plans'],
  });

  const { data: subscription, isLoading: subscriptionLoading } = useQuery<Subscription & { plan?: Plan }>({
    queryKey: ['/api/billing/subscription'],
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
    enabled: !!user && !!subscription,
  });

  const { data: referralStats, isLoading: referralLoading } = useQuery<ReferralStats>({
    queryKey: ['/api/referral/stats'],
    enabled: !!user,
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

  const requestPayoutMutation = useMutation({
    mutationFn: async (email: string) => {
      return apiRequest('POST', '/api/referral/request-payout', { paypalEmail: email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/referral/stats'] });
      toast({ title: "Payout Requested", description: "Your payout request has been submitted." });
      setPayoutDialogOpen(false);
      setPaypalEmail("");
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
  const sortedPlans = plans ? [...plans].sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999)) : [];

  const copyReferralLink = () => {
    if (referralStats?.code) {
      const link = `${window.location.origin}/auth?ref=${referralStats.code.code}`;
      navigator.clipboard.writeText(link);
      toast({ title: "Copied!", description: "Referral link copied to clipboard" });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case "SIGNED_UP":
        return <Badge variant="outline"><UserPlus className="h-3 w-3 mr-1" /> Signed Up</Badge>;
      case "CONVERTED":
        return <Badge variant="default"><TrendingUp className="h-3 w-3 mr-1" /> Converted</Badge>;
      case "PAID_OUT":
        return <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" /> Paid</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-foreground">Billing & Referrals</h1>
        </div>
        {subscription && (
          <Badge variant={subscription.status === "ACTIVE" ? "default" : "secondary"} data-testid="badge-subscription-status">
            {subscription.status}
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="billing" data-testid="tab-billing">
            <CreditCard className="h-4 w-4 mr-2" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
          <TabsTrigger value="referrals" data-testid="tab-referrals">
            <Gift className="h-4 w-4 mr-2" />
            Referrals
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
              ) : (
                <div className="grid grid-cols-2 gap-3">
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
                      <div key={meterCode} className="space-y-1" data-testid={`card-usage-${meterCode}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium">{meterLabels[meterCode]}</span>
                          </div>
                          {isAtLimit && <AlertTriangle className="h-3 w-3 text-destructive" />}
                        </div>
                        <Progress 
                          value={percentage} 
                          className={`h-1.5 ${isAtLimit ? "bg-destructive/20" : isNearLimit ? "bg-warning/20" : ""}`}
                          data-testid={`progress-${meterCode}`}
                        />
                        <p className="text-xs text-muted-foreground">
                          {current.toLocaleString()} / {limit > 0 ? limit.toLocaleString() : "∞"}
                        </p>
                      </div>
                    );
                  })}
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

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-display font-semibold">Plans</h2>
          <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-lg" data-testid="billing-period-toggle">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                billingPeriod === "monthly" 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-billing-monthly"
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("yearly")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                billingPeriod === "yearly" 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-billing-yearly"
            >
              Yearly
              <Badge variant="default" className="text-[10px] px-1.5 py-0">Save 10%</Badge>
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
                className={`flex-1 min-w-[220px] max-w-[280px] ${isCurrentPlan ? "border-primary" : ""}`} 
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
                <CardContent className="pt-0 pb-3">
                  <div className="space-y-1.5">
                    {Object.keys(meterLabels).map((meterCode) => {
                      const limits = getLimit(planRules as PlanWithRules['meterRules'], meterCode);
                      const Icon = meterIcons[meterCode] || Zap;
                      
                      return (
                        <div key={meterCode} className="flex items-center gap-2 text-xs">
                          <Check className="h-3 w-3 text-primary flex-shrink-0" />
                          <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span>{meterLabels[meterCode]}: {formatLimit(limits)}</span>
                        </div>
                      );
                    })}
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
        </TabsContent>

        <TabsContent value="history" className="space-y-5 mt-4">
          <Card data-testid="card-payment-history">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" />
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
                  <History className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No payment history yet</p>
                  <p className="text-xs mt-1">Your payments will appear here once you upgrade to a paid plan</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {billingHistory.map((transaction) => (
                    <div 
                      key={transaction.id} 
                      className="flex items-center justify-between p-3 border rounded-md"
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
                          ${(transaction.amountCents / 100).toFixed(2)} {transaction.currency}
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

        <TabsContent value="referrals" className="space-y-5 mt-4">
          <Card data-testid="card-referral-link">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Share2 className="h-4 w-4" />
                Your Referral Link
              </CardTitle>
              <CardDescription className="text-xs">
                Share your unique link and earn 10% commission on every paid subscription.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {referralLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Input 
                      value={referralStats?.code ? `${window.location.origin}/auth?ref=${referralStats.code.code}` : ""} 
                      readOnly 
                      className="font-mono text-sm"
                      data-testid="input-referral-link"
                    />
                    <Button size="icon" variant="outline" onClick={copyReferralLink} data-testid="button-copy-referral-link">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {referralStats?.code && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        Code: {referralStats.code.code}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {referralStats.code.commissionPercent}% Commission
                      </Badge>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card data-testid="card-stat-referrals">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <UserPlus className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{referralStats?.totalReferrals || 0}</p>
                    <p className="text-xs text-muted-foreground">Total Referrals</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-stat-signups">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-blue-500/10">
                    <Users className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{referralStats?.signedUp || 0}</p>
                    <p className="text-xs text-muted-foreground">Signed Up</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-stat-conversions">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-green-500/10">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{referralStats?.converted || 0}</p>
                    <p className="text-xs text-muted-foreground">Converted</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-stat-earnings">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-yellow-500/10">
                    <DollarSign className="h-4 w-4 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      ${((referralStats?.pendingEarningsCents || 0) / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">Pending Earnings</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-testid="card-referral-history">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Referral History</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {referralStats?.referrals && referralStats.referrals.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {referralStats.referrals.map((ref) => (
                      <div key={ref.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm truncate">
                            {ref.referredEmail || `User ${ref.referredUserId?.substring(0, 8)}...`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {ref.commissionAmountCents && (
                            <span className="text-xs text-muted-foreground">
                              ${(ref.commissionAmountCents / 100).toFixed(2)}
                            </span>
                          )}
                          {getStatusBadge(ref.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <UserPlus className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No referrals yet</p>
                    <p className="text-xs text-muted-foreground">Share your link to start earning</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-payout">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Request Payout</CardTitle>
                <CardDescription className="text-xs">
                  Minimum payout: $10.00 | Total paid: ${((referralStats?.paidOutCents || 0) / 100).toFixed(2)}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div className="p-3 rounded-md bg-muted/30 text-center">
                    <p className="text-sm text-muted-foreground">Available for payout</p>
                    <p className="text-2xl font-bold text-primary">
                      ${((referralStats?.pendingEarningsCents || 0) / 100).toFixed(2)}
                    </p>
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={() => setPayoutDialogOpen(true)}
                    disabled={(referralStats?.pendingEarningsCents || 0) < 1000}
                    data-testid="button-request-payout"
                  >
                    <DollarSign className="h-4 w-4 mr-2" />
                    Request Payout via PayPal
                  </Button>
                  {(referralStats?.pendingEarningsCents || 0) < 1000 && (
                    <p className="text-xs text-muted-foreground text-center">
                      You need ${(10 - (referralStats?.pendingEarningsCents || 0) / 100).toFixed(2)} more to request a payout
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
        <DialogContent data-testid="dialog-payout">
          <DialogHeader>
            <DialogTitle>Request Payout</DialogTitle>
            <DialogDescription>
              Enter your PayPal email to receive your earnings of ${((referralStats?.pendingEarningsCents || 0) / 100).toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="paypal-email">PayPal Email</Label>
            <Input 
              id="paypal-email"
              type="email" 
              value={paypalEmail} 
              onChange={(e) => setPaypalEmail(e.target.value)}
              placeholder="your@email.com"
              className="mt-2"
              data-testid="input-paypal-email"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutDialogOpen(false)} data-testid="button-cancel-payout">
              Cancel
            </Button>
            <Button 
              onClick={() => requestPayoutMutation.mutate(paypalEmail)}
              disabled={requestPayoutMutation.isPending || !paypalEmail}
              data-testid="button-confirm-payout"
            >
              {requestPayoutMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Request Payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            
            {changePlanDialog && isContactUsPlan(changePlanDialog) ? (
              <div className="mt-4 pt-4 border-t">
                <div className="p-4 rounded-md bg-muted/50 text-center">
                  <p className="text-sm font-medium mb-2">Get a Custom Quote</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Contact our sales team to discuss your organization's specific requirements and get custom pricing.
                  </p>
                  <Button 
                    variant="default"
                    onClick={() => enterpriseInquiryMutation.mutate(changePlanDialog.name)}
                    disabled={enterpriseInquiryMutation.isPending}
                    data-testid="button-contact-sales"
                  >
                    {enterpriseInquiryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Contact Sales
                  </Button>
                </div>
              </div>
            ) : changePlanDialog && changePlanDialog.monthlyPriceCents && changePlanDialog.monthlyPriceCents > 0 && (
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
                      planId={changePlanDialog.paypalPlanId}
                      onSuccess={async (subscriptionId, subscriptionData) => {
                        try {
                          await apiRequest('POST', '/api/billing/subscription/paypal', {
                            planCode: changePlanDialog.code,
                            paypalSubscriptionId: subscriptionId,
                          });
                          queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
                          queryClient.invalidateQueries({ queryKey: ['/api/billing/usage'] });
                          setChangePlanDialog(null);
                          toast({ 
                            title: "Subscription Active!", 
                            description: `Your ${changePlanDialog.name} plan subscription is now active.` 
                          });
                        } catch (error) {
                          toast({ 
                            title: "Error", 
                            description: "Failed to activate subscription. Please contact support.", 
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
            )}
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
