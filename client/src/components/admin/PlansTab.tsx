import { useState } from "react";
  import { useAuth } from "@/hooks/use-auth";
  import { useQuery, useMutation } from "@tanstack/react-query";
  import { queryClient, apiRequest } from "@/lib/queryClient";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Textarea } from "@/components/ui/textarea";
  import { Checkbox } from "@/components/ui/checkbox";
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { Loader2, Trash2, Plus, Edit, CreditCard, DollarSign, ArrowUp, ArrowDown, Eye, EyeOff, Wallet, ChevronRight } from "lucide-react";
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
  import { useToast } from "@/hooks/use-toast";

  interface PlanData {
  id: number;
  code: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number | null;
  maxSeats: number | null;
  extraSeatPriceCents: number | null;
  isActive: boolean | null;
  displayOrder: number | null;
  meterRules: Array<{
    meterCode: string;
    meterName: string;
    includedQuota: number | null;
    hardCap: number | null;
    overagePriceMicrocents: number | null;
    isSharedPool: boolean;
  }>;
}

interface PlanMeterRule {
  id: number;
  planId: number;
  meterId: number;
  ruleType: string;
  includedUnitsMonthly: number | null;
  hardCapUnits: number | null;
  overageUnitPriceMicrocents: number | null;
  isSharedPool: boolean | null;
  meter: {
    id: number;
    code: string;
    name: string;
    unitLabel: string | null;
  };
}

export function PlansTab() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [editingPlan, setEditingPlan] = useState<PlanData | null>(null);
  const [editingRules, setEditingRules] = useState<PlanMeterRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPlan, setNewPlan] = useState({ code: "", name: "", description: "", monthlyPriceCents: 0, maxSeats: "" });
  const [deletePlanId, setDeletePlanId] = useState<number | null>(null);
  const [isSyncingPayPal, setIsSyncingPayPal] = useState(false);
  const [isInitializingSeats, setIsInitializingSeats] = useState(false);

  const plansUrl = isSuperAdmin ? '/api/billing/plans?includeInactive=true' : '/api/billing/plans';
  const { data: plansResponse, isLoading } = useQuery<{ plans: PlanData[]; creditCosts: any[] }>({
    queryKey: [plansUrl],
    staleTime: 0,
  });
  const plans = plansResponse?.plans;

  const togglePlanActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/admin/plans/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      });
      if (!res.ok) throw new Error('Failed to update plan');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [plansUrl] });
      toast({ title: "Plan updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const syncPayPalPlans = async () => {
    setIsSyncingPayPal(true);
    try {
      const res = await fetch('/api/admin/paypal/sync-plans', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to sync PayPal plans');
      }
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plans'] });
      toast({ 
        title: "PayPal Plans Synced", 
        description: `Successfully synced ${result.plans?.length || 0} plans with PayPal.` 
      });
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to sync PayPal plans", 
        variant: "destructive" 
      });
    }
    setIsSyncingPayPal(false);
  };

  const initExtraSeatPrices = async () => {
    setIsInitializingSeats(true);
    try {
      const res = await fetch('/api/admin/plans/init-extra-seat-prices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to initialize extra seat prices');
      }
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plans'] });
      toast({ 
        title: "Extra Seat Prices Initialized", 
        description: `Professional: $5/seat, Business: $8/seat` 
      });
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to initialize extra seat prices", 
        variant: "destructive" 
      });
    }
    setIsInitializingSeats(false);
  };

  const sortedPlans = plans ? [...plans].sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999)) : [];

  const reorderPlans = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      return apiRequest('PUT', '/api/admin/plans/reorder', { orderedIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plans'] });
      toast({ title: "Success", description: "Plan order updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reorder plans", variant: "destructive" });
    }
  });

  const movePlan = (planId: number, direction: 'up' | 'down') => {
    const currentIndex = sortedPlans.findIndex(p => p.id === planId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= sortedPlans.length) return;
    
    const newOrder = [...sortedPlans];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];
    reorderPlans.mutate(newOrder.map(p => p.id));
  };

  const createPlan = useMutation({
    mutationFn: async (data: { code: string; name: string; description?: string; monthlyPriceCents?: number; maxSeats?: number }) => {
      return apiRequest('POST', '/api/admin/plans', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plans'] });
      toast({ title: "Success", description: "Plan created successfully" });
      setIsCreateOpen(false);
      setNewPlan({ code: "", name: "", description: "", monthlyPriceCents: 0, maxSeats: "" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create plan", variant: "destructive" });
    }
  });

  const deletePlan = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/plans/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plans'] });
      toast({ title: "Success", description: "Plan deleted successfully" });
      setDeletePlanId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete plan", variant: "destructive" });
    }
  });

  const updatePlan = useMutation({
    mutationFn: async (data: { id: number; name?: string; description?: string; monthlyPriceCents?: number | null; maxSeats?: number; extraSeatPriceCents?: number | null }) => {
      return apiRequest('PUT', `/api/admin/plans/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plans'] });
      toast({ title: "Success", description: "Plan updated successfully" });
      setEditingPlan(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update plan", variant: "destructive" });
    }
  });

  const updateRule = useMutation({
    mutationFn: async (data: { planId: number; ruleId: number; includedUnitsMonthly?: number; hardCapUnits?: number; overageUnitPriceMicrocents?: number }) => {
      const { planId, ruleId, ...updates } = data;
      return apiRequest('PUT', `/api/admin/plans/${planId}/rules/${ruleId}`, updates);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Rule updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update rule", variant: "destructive" });
    }
  });

  const createRule = useMutation({
    mutationFn: async (data: { planId: number; meterId: number; ruleType: string; overageUnitPriceMicrocents?: number }) => {
      const { planId, ...ruleData } = data;
      return apiRequest('POST', `/api/admin/plans/${planId}/rules`, ruleData);
    },
    onSuccess: (_, variables) => {
      toast({ title: "Success", description: "Overage rule created" });
      fetchRules(variables.planId);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create rule", variant: "destructive" });
    }
  });

  const fetchRules = async (planId: number) => {
    setLoadingRules(true);
    try {
      const res = await fetch(`/api/admin/plans/${planId}/rules`, {
        credentials: 'include'
      });
      if (!res.ok) {
        throw new Error('Failed to fetch');
      }
      const data = await res.json();
      setEditingRules(data);
    } catch (err) {
      toast({ title: "Error", description: "Failed to fetch rules", variant: "destructive" });
    }
    setLoadingRules(false);
  };

  const formatPrice = (cents: number | null) => {
    if (cents === null) return "Contact Us";
    if (cents === 0) return "Free";
    return `$${(cents / 100).toFixed(2)}/mo`;
  };

  const formatOveragePrice = (microcents: number | null) => {
    if (!microcents) return "N/A";
    return `$${(microcents / 1000000).toFixed(4)}`;
  };

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CreditCard className="h-5 w-5" />
              Subscription Plans
            </CardTitle>
            <CardDescription>Configure pricing, quotas, and features for each plan</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              variant="outline" 
              size="sm"
              onClick={initExtraSeatPrices} 
              disabled={isInitializingSeats}
              data-testid="button-init-seat-prices"
              className="whitespace-nowrap"
            >
              {isInitializingSeats ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <DollarSign className="h-4 w-4 mr-2" />
              )}
              <span className="hidden sm:inline">Init Seat Prices</span>
              <span className="sm:hidden">Init Seats</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={syncPayPalPlans} 
              disabled={isSyncingPayPal}
              data-testid="button-sync-paypal"
              className="whitespace-nowrap"
            >
              {isSyncingPayPal ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wallet className="h-4 w-4 mr-2" />
              )}
              <span className="hidden sm:inline">Sync PayPal Plans</span>
              <span className="sm:hidden">Sync PayPal</span>
            </Button>
            <Button size="sm" onClick={() => setIsCreateOpen(true)} data-testid="button-create-plan" className="whitespace-nowrap">
              <Plus className="h-4 w-4 mr-2" />
              Add Plan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Monthly Price</TableHead>
                <TableHead>Max Seats</TableHead>
                <TableHead>Extra Seat Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlans.map((plan, index) => (
                <TableRow key={plan.id} data-testid={`plan-row-${plan.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => movePlan(plan.id, 'up')}
                        disabled={index === 0 || reorderPlans.isPending}
                        data-testid={`button-move-plan-up-${plan.id}`}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => movePlan(plan.id, 'down')}
                        disabled={index === sortedPlans.length - 1 || reorderPlans.isPending}
                        data-testid={`button-move-plan-down-${plan.id}`}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{plan.name}</div>
                    <div className="text-sm text-muted-foreground">{plan.code}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={plan.monthlyPriceCents ? "default" : "secondary"}>
                      {formatPrice(plan.monthlyPriceCents)}
                    </Badge>
                  </TableCell>
                  <TableCell>{plan.maxSeats || "Unlimited"}</TableCell>
                  <TableCell>
                    {plan.extraSeatPriceCents !== null 
                      ? `$${(plan.extraSeatPriceCents / 100).toFixed(2)}/mo`
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={plan.isActive ? "default" : "outline"}>
                      {plan.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {isSuperAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => togglePlanActive.mutate({ id: plan.id, isActive: !plan.isActive })}
                          disabled={togglePlanActive.isPending}
                          title={plan.isActive ? "Deactivate plan" : "Activate plan"}
                        >
                          {plan.isActive ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-green-600" />
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingPlan(plan);
                          fetchRules(plan.id);
                        }}
                        data-testid={`button-edit-plan-${plan.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletePlanId(plan.id)}
                        data-testid={`button-delete-plan-${plan.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Plan: {editingPlan?.name}</DialogTitle>
            <DialogDescription>Update plan details and usage quotas</DialogDescription>
          </DialogHeader>
          
          {editingPlan && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plan-name">Name</Label>
                  <Input
                    id="plan-name"
                    value={editingPlan.name}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                    data-testid="input-plan-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-price">Monthly Price ($)</Label>
                  <div className="space-y-2">
                    <Input
                      id="plan-price"
                      type="number"
                      step="0.01"
                      value={editingPlan.monthlyPriceCents === null ? "" : (editingPlan.monthlyPriceCents || 0) / 100}
                      onChange={(e) => setEditingPlan({ 
                        ...editingPlan, 
                        monthlyPriceCents: Math.round(parseFloat(e.target.value || "0") * 100) 
                      })}
                      disabled={editingPlan.monthlyPriceCents === null}
                      placeholder={editingPlan.monthlyPriceCents === null ? "Contact Us" : "0.00"}
                      data-testid="input-plan-price"
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="contact-us-pricing"
                        checked={editingPlan.monthlyPriceCents === null}
                        onCheckedChange={(checked) => setEditingPlan({
                          ...editingPlan,
                          monthlyPriceCents: checked ? null : 0
                        })}
                        data-testid="checkbox-contact-us-pricing"
                      />
                      <Label htmlFor="contact-us-pricing" className="text-xs text-muted-foreground cursor-pointer">
                        Contact Us pricing (custom/enterprise)
                      </Label>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="plan-description">Description</Label>
                  <Textarea
                    id="plan-description"
                    value={editingPlan.description || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                    data-testid="input-plan-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-seats">Max Seats</Label>
                  <Input
                    id="plan-seats"
                    type="number"
                    value={editingPlan.maxSeats || ""}
                    placeholder="Unlimited"
                    onChange={(e) => setEditingPlan({ 
                      ...editingPlan, 
                      maxSeats: e.target.value ? parseInt(e.target.value) : null 
                    })}
                    data-testid="input-plan-seats"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-extra-seat-price">Extra Seat Price (cents/month)</Label>
                  <Input
                    id="plan-extra-seat-price"
                    type="number"
                    value={editingPlan.extraSeatPriceCents ?? ""}
                    placeholder="N/A (no extra seats allowed)"
                    onChange={(e) => setEditingPlan({ 
                      ...editingPlan, 
                      extraSeatPriceCents: e.target.value ? parseInt(e.target.value) : null 
                    })}
                    data-testid="input-plan-extra-seat-price"
                  />
                  <p className="text-xs text-muted-foreground">
                    Price per additional seat per month (e.g., 500 = $5.00/seat/month). Leave empty to disable extra seats.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Credits Allocation
                </h4>
                
                {loadingRules ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Credits Rules - Primary Focus */}
                    {(() => {
                      const creditsRules = editingRules.filter(r => r.meter.code === 'credits');
                      const quotaRule = creditsRules.find(r => r.ruleType === 'INCLUDED_QUOTA');
                      const hardCapRule = creditsRules.find(r => r.ruleType === 'HARD_CAP');
                      const overageRule = creditsRules.find(r => r.ruleType === 'METERED_OVERAGE');
                      
                      return (
                        <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                          <div className="flex items-center gap-2">
                            <Wallet className="h-5 w-5 text-primary" />
                            <span className="font-medium">Monthly Credits</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            {quotaRule && (
                              <div className="space-y-2">
                                <Label className="text-sm">Included Credits</Label>
                                <Input
                                  type="number"
                                  value={quotaRule.includedUnitsMonthly || ""}
                                  onChange={(e) => {
                                    const newRules = editingRules.map(r => 
                                      r.id === quotaRule.id 
                                        ? { ...r, includedUnitsMonthly: parseInt(e.target.value) || null } 
                                        : r
                                    );
                                    setEditingRules(newRules);
                                  }}
                                  placeholder="0"
                                  data-testid="input-credits-quota"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Credits included each billing cycle
                                </p>
                              </div>
                            )}
                            
                            {hardCapRule && (
                              <div className="space-y-2">
                                <Label className="text-sm">Hard Cap</Label>
                                <Input
                                  type="number"
                                  value={hardCapRule.hardCapUnits || ""}
                                  onChange={(e) => {
                                    const newRules = editingRules.map(r => 
                                      r.id === hardCapRule.id 
                                        ? { ...r, hardCapUnits: parseInt(e.target.value) || null } 
                                        : r
                                    );
                                    setEditingRules(newRules);
                                  }}
                                  placeholder="No limit"
                                  data-testid="input-credits-cap"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Maximum credits allowed (blocks usage when reached)
                                </p>
                              </div>
                            )}
                          </div>
                          
                          {overageRule ? (
                            <div className="pt-3 border-t space-y-2">
                              <Label className="text-sm">Overage Pricing</Label>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  step="0.0001"
                                  className="w-32"
                                  value={(overageRule.overageUnitPriceMicrocents || 0) / 1000000}
                                  onChange={(e) => {
                                    const newRules = editingRules.map(r => 
                                      r.id === overageRule.id 
                                        ? { ...r, overageUnitPriceMicrocents: Math.round(parseFloat(e.target.value || "0") * 1000000) } 
                                        : r
                                    );
                                    setEditingRules(newRules);
                                  }}
                                  data-testid="input-credits-overage"
                                />
                                <span className="text-sm text-muted-foreground">per credit</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Price per credit when usage exceeds included quota
                              </p>
                            </div>
                          ) : quotaRule && (
                            <div className="pt-3 border-t space-y-2">
                              <Label className="text-sm">Overage Pricing</Label>
                              <p className="text-xs text-muted-foreground mb-2">No overage rule configured for credits</p>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  if (editingPlan) {
                                    createRule.mutate({
                                      planId: editingPlan.id,
                                      meterId: quotaRule.meterId,
                                      ruleType: 'METERED_OVERAGE',
                                      overageUnitPriceMicrocents: 10000
                                    });
                                  }
                                }}
                                disabled={createRule.isPending}
                                data-testid="button-add-credits-overage"
                              >
                                {createRule.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                                Add Credits Overage Rule
                              </Button>
                            </div>
                          )}
                          
                          {/* Capacity Estimates */}
                          {quotaRule?.includedUnitsMonthly && (
                            <div className="pt-3 border-t">
                              <p className="text-xs font-medium text-muted-foreground mb-2">Estimated Capacity (with {quotaRule.includedUnitsMonthly.toLocaleString()} credits)</p>
                              <div className="flex flex-wrap gap-3 text-xs">
                                <span className="px-2 py-1 rounded bg-muted">
                                  {Math.floor(quotaRule.includedUnitsMonthly / 5)} projects
                                </span>
                                <span className="px-2 py-1 rounded bg-muted">
                                  {Math.floor(quotaRule.includedUnitsMonthly / 1)} tasks
                                </span>
                                <span className="px-2 py-1 rounded bg-muted">
                                  {Math.floor(quotaRule.includedUnitsMonthly / 1)} issues
                                </span>
                                <span className="px-2 py-1 rounded bg-muted">
                                  {Math.floor(quotaRule.includedUnitsMonthly / 3)} AI runs
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    
                    {/* Other Meters (collapsed) */}
                    {editingRules.filter(r => r.meter.code !== 'credits').length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                          <ChevronRight className="h-4 w-4" />
                          <span>Other Meters ({editingRules.filter(r => r.meter.code !== 'credits').length} rules)</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-3">
                          <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Meter</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {editingRules.filter(r => r.meter.code !== 'credits').map(rule => (
                                <TableRow key={rule.id}>
                                  <TableCell className="font-medium text-sm">
                                    {rule.meter.name}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="secondary" className="text-xs">
                                      {rule.ruleType.replace(/_/g, " ")}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {rule.ruleType === "INCLUDED_QUOTA" && (
                                      <Input
                                        type="number"
                                        className="w-20"
                                        value={rule.includedUnitsMonthly || ""}
                                        onChange={(e) => {
                                          const newRules = editingRules.map(r => 
                                            r.id === rule.id 
                                              ? { ...r, includedUnitsMonthly: parseInt(e.target.value) || null } 
                                              : r
                                          );
                                          setEditingRules(newRules);
                                        }}
                                      />
                                    )}
                                    {rule.ruleType === "HARD_CAP" && (
                                      <Input
                                        type="number"
                                        className="w-20"
                                        value={rule.hardCapUnits || ""}
                                        onChange={(e) => {
                                          const newRules = editingRules.map(r => 
                                            r.id === rule.id 
                                              ? { ...r, hardCapUnits: parseInt(e.target.value) || null } 
                                              : r
                                          );
                                          setEditingRules(newRules);
                                        }}
                                      />
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingPlan(null)} data-testid="button-cancel-edit-plan">
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    // Save plan details
                    await updatePlan.mutateAsync({
                      id: editingPlan.id,
                      name: editingPlan.name,
                      description: editingPlan.description || undefined,
                      monthlyPriceCents: editingPlan.monthlyPriceCents,
                      maxSeats: editingPlan.maxSeats || undefined,
                      extraSeatPriceCents: editingPlan.extraSeatPriceCents,
                    });
                    
                    // Save all meter rules
                    const promises = editingRules.map(rule => {
                      const updates: any = {};
                      if (rule.ruleType === 'INCLUDED_QUOTA') {
                        updates.includedUnitsMonthly = rule.includedUnitsMonthly ?? undefined;
                      } else if (rule.ruleType === 'HARD_CAP') {
                        updates.hardCapUnits = rule.hardCapUnits ?? undefined;
                      } else if (rule.ruleType === 'METERED_OVERAGE') {
                        updates.overageUnitPriceMicrocents = rule.overageUnitPriceMicrocents ?? undefined;
                      }
                      return updateRule.mutateAsync({ planId: editingPlan.id, ruleId: rule.id, ...updates });
                    });
                    await Promise.all(promises);
                  }}
                  disabled={updatePlan.isPending || updateRule.isPending}
                  data-testid="button-save-plan"
                >
                  {(updatePlan.isPending || updateRule.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Plan</DialogTitle>
            <DialogDescription>Add a new subscription plan with default meter rules</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan Code</Label>
                <Input
                  value={newPlan.code}
                  onChange={(e) => setNewPlan({ ...newPlan, code: e.target.value.toUpperCase() })}
                  placeholder="ENTERPRISE"
                  data-testid="input-new-plan-code"
                />
              </div>
              <div className="space-y-2">
                <Label>Plan Name</Label>
                <Input
                  value={newPlan.name}
                  onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                  placeholder="Enterprise"
                  data-testid="input-new-plan-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newPlan.description}
                onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })}
                placeholder="Plan description..."
                data-testid="input-new-plan-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monthly Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newPlan.monthlyPriceCents / 100}
                  onChange={(e) => setNewPlan({ ...newPlan, monthlyPriceCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                  placeholder="0.00"
                  data-testid="input-new-plan-price"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Seats</Label>
                <Input
                  type="number"
                  value={newPlan.maxSeats}
                  onChange={(e) => setNewPlan({ ...newPlan, maxSeats: e.target.value })}
                  placeholder="Unlimited"
                  data-testid="input-new-plan-seats"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createPlan.mutate({
                code: newPlan.code,
                name: newPlan.name,
                description: newPlan.description || undefined,
                monthlyPriceCents: newPlan.monthlyPriceCents,
                maxSeats: newPlan.maxSeats ? parseInt(newPlan.maxSeats) : undefined,
              })}
              disabled={!newPlan.code || !newPlan.name || createPlan.isPending}
              data-testid="button-save-new-plan"
            >
              {createPlan.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletePlanId !== null} onOpenChange={() => setDeletePlanId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this plan? This will remove all associated meter rules and features. Plans with active subscriptions cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePlanId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletePlanId && deletePlan.mutate(deletePlanId)}
              disabled={deletePlan.isPending}
              data-testid="button-confirm-delete-plan"
            >
              {deletePlan.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

