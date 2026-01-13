import { db } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import {
  plans,
  meters,
  planMeterRules,
  features,
  planFeatures,
  subscriptions,
  billingCycles,
  usageEvents,
  usageRollups,
  invoiceRecords,
  seatAssignments,
  billingAuditLogs,
  organizationMembers,
  Plan,
  Meter,
  PlanMeterRule,
  Subscription,
  BillingCycle,
  UsageEvent,
  UsageRollup,
  InsertUsageEvent,
} from "@shared/schema";

export interface UsageCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: number;
  limit: number | null;
  remaining: number | null;
  isHardCap: boolean;
  willIncurOverage: boolean;
  estimatedOverageCostMicrocents?: number;
}

export interface RecordUsageResult {
  success: boolean;
  usageEventId?: number;
  error?: string;
  rollup?: UsageRollup;
}

export interface SeatLimitResult {
  allowed: boolean;
  currentSeats: number;
  maxSeats: number | null;
  remaining: number | null;
  reason?: string;
}

export interface BillingProvider {
  checkLimit(subscriptionId: number, meterCode: string, unitsToAdd?: number): Promise<UsageCheckResult>;
  checkSeatLimit(orgId: number, seatsToAdd?: number): Promise<SeatLimitResult>;
  recordUsage(params: {
    subscriptionId: number;
    meterCode: string;
    units?: number;
    actorUserId?: string;
    requestId: string;
  }): Promise<RecordUsageResult>;
  getOrCreateBillingCycle(subscriptionId: number): Promise<BillingCycle>;
  calculateOverages(billingCycleId: number): Promise<{ totalMicrocents: number; byMeter: Record<string, number> }>;
  getSubscriptionForUser(userId: string): Promise<Subscription | null>;
  getSubscriptionForOrg(orgId: number): Promise<Subscription | null>;
  createSubscription(params: {
    planCode: string;
    userId?: string;
    orgId?: number;
  }): Promise<Subscription>;
  getUsageSummary(subscriptionId: number): Promise<Record<string, UsageRollup>>;
  ensureUserHasSubscription(userId: string): Promise<Subscription>;
  changePlan(subscriptionId: number, newPlanCode: string, actorUserId?: string): Promise<Subscription>;
  cancelSubscription(subscriptionId: number, actorUserId?: string): Promise<Subscription>;
}

function getMonthBoundaries(date: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export class MockBillingProvider implements BillingProvider {
  async getSubscriptionForUser(userId: string): Promise<Subscription | null> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "ACTIVE")))
      .limit(1);
    return subscription || null;
  }

  async getSubscriptionForOrg(orgId: number): Promise<Subscription | null> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, "ACTIVE")))
      .limit(1);
    return subscription || null;
  }

  async checkSeatLimit(orgId: number, seatsToAdd: number = 1): Promise<SeatLimitResult> {
    // Get the subscription for this org
    const subscription = await this.getSubscriptionForOrg(orgId);
    
    if (!subscription) {
      // No subscription means Free plan with default limit of 1 seat
      const currentSeats = await this.getOrgMemberCount(orgId);
      return {
        allowed: currentSeats + seatsToAdd <= 1,
        currentSeats,
        maxSeats: 1,
        remaining: Math.max(0, 1 - currentSeats),
        reason: currentSeats + seatsToAdd > 1 ? 'Free plan allows only 1 seat. Please upgrade to add more team members.' : undefined
      };
    }

    // Get the plan for this subscription
    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, subscription.planId))
      .limit(1);

    if (!plan) {
      return {
        allowed: false,
        currentSeats: 0,
        maxSeats: 0,
        remaining: 0,
        reason: 'Plan not found'
      };
    }

    // Get current member count
    const currentSeats = await this.getOrgMemberCount(orgId);

    // If maxSeats is null, unlimited seats
    if (plan.maxSeats === null) {
      return {
        allowed: true,
        currentSeats,
        maxSeats: null,
        remaining: null
      };
    }

    const remaining = Math.max(0, plan.maxSeats - currentSeats);
    const allowed = currentSeats + seatsToAdd <= plan.maxSeats;

    return {
      allowed,
      currentSeats,
      maxSeats: plan.maxSeats,
      remaining,
      reason: !allowed ? `Your ${plan.name} plan allows ${plan.maxSeats} seat${plan.maxSeats === 1 ? '' : 's'}. You currently have ${currentSeats}. Please upgrade to add more team members.` : undefined
    };
  }

  private async getOrgMemberCount(orgId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId));
    return Number(result[0]?.count || 0);
  }

  async createSubscription(params: {
    planCode: string;
    userId?: string;
    orgId?: number;
  }): Promise<Subscription> {
    const [plan] = await db.select().from(plans).where(eq(plans.code, params.planCode)).limit(1);
    if (!plan) {
      throw new Error(`Plan not found: ${params.planCode}`);
    }

    const { start, end } = getMonthBoundaries();
    const subjectType = params.orgId ? "ORG" : "USER";

    const [subscription] = await db
      .insert(subscriptions)
      .values({
        planId: plan.id,
        status: "ACTIVE",
        subjectType,
        userId: params.userId,
        orgId: params.orgId,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      })
      .returning();

    await this.getOrCreateBillingCycle(subscription.id);

    await db.insert(billingAuditLogs).values({
      actorUserId: params.userId,
      orgId: params.orgId,
      action: "SUBSCRIPTION_CREATED",
      entityType: "subscription",
      entityId: String(subscription.id),
      metadataJson: { planCode: params.planCode },
    });

    return subscription;
  }

  async getOrCreateBillingCycle(subscriptionId: number): Promise<BillingCycle> {
    const { start, end } = getMonthBoundaries();

    const [existingCycle] = await db
      .select()
      .from(billingCycles)
      .where(
        and(
          eq(billingCycles.subscriptionId, subscriptionId),
          eq(billingCycles.status, "OPEN")
        )
      )
      .limit(1);

    if (existingCycle) {
      return existingCycle;
    }

    const [newCycle] = await db
      .insert(billingCycles)
      .values({
        subscriptionId,
        periodStart: start,
        periodEnd: end,
        status: "OPEN",
      })
      .returning();

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (subscription) {
      const rules = await db
        .select()
        .from(planMeterRules)
        .innerJoin(meters, eq(planMeterRules.meterId, meters.id))
        .where(eq(planMeterRules.planId, subscription.planId));

      const meterIds = [...new Set(rules.map((r) => r.meters.id))];

      for (const meterId of meterIds) {
        const meterRules = rules.filter((r) => r.meters.id === meterId);
        const quotaRule = meterRules.find((r) => r.plan_meter_rules.ruleType === "INCLUDED_QUOTA");
        const includedUnits = quotaRule?.plan_meter_rules.includedUnitsMonthly || 0;

        await db.insert(usageRollups).values({
          billingCycleId: newCycle.id,
          meterId,
          includedUnits,
          usedUnits: 0,
          remainingUnits: includedUnits,
          overageUnits: 0,
          overageCostMicrocents: 0,
          hardCapHit: false,
        });
      }
    }

    return newCycle;
  }

  async checkLimit(
    subscriptionId: number,
    meterCode: string,
    unitsToAdd: number = 1
  ): Promise<UsageCheckResult> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription) {
      return {
        allowed: false,
        reason: "Subscription not found",
        currentUsage: 0,
        limit: null,
        remaining: null,
        isHardCap: false,
        willIncurOverage: false,
      };
    }

    const [meter] = await db.select().from(meters).where(eq(meters.code, meterCode)).limit(1);
    if (!meter) {
      return {
        allowed: false,
        reason: `Meter not found: ${meterCode}`,
        currentUsage: 0,
        limit: null,
        remaining: null,
        isHardCap: false,
        willIncurOverage: false,
      };
    }

    const rules = await db
      .select()
      .from(planMeterRules)
      .where(
        and(
          eq(planMeterRules.planId, subscription.planId),
          eq(planMeterRules.meterId, meter.id)
        )
      );

    const cycle = await this.getOrCreateBillingCycle(subscriptionId);

    const [rollup] = await db
      .select()
      .from(usageRollups)
      .where(
        and(eq(usageRollups.billingCycleId, cycle.id), eq(usageRollups.meterId, meter.id))
      )
      .limit(1);

    const currentUsage = rollup?.usedUnits || 0;
    const quotaRule = rules.find((r) => r.ruleType === "INCLUDED_QUOTA");
    const hardCapRule = rules.find((r) => r.ruleType === "HARD_CAP");
    const overageRule = rules.find((r) => r.ruleType === "METERED_OVERAGE");

    // For credits meter: plan limits are stored as actual credits, but usage is in hundredths
    // Multiply plan limits by 100 to convert to hundredths for comparison
    const isCredits = meterCode === "credits";
    const multiplier = isCredits ? 100 : 1;
    
    const includedQuota = (quotaRule?.includedUnitsMonthly || 0) * multiplier;
    const hardCap = hardCapRule?.hardCapUnits !== null && hardCapRule?.hardCapUnits !== undefined 
      ? hardCapRule.hardCapUnits * multiplier 
      : null;
    const projectedUsage = currentUsage + unitsToAdd;

    if (hardCap !== null && projectedUsage > hardCap) {
      // Convert back to display units for error message
      const displayLimit = isCredits ? hardCap / 100 : hardCap;
      const displayCurrent = isCredits ? currentUsage / 100 : currentUsage;
      return {
        allowed: false,
        reason: `Credit limit reached. You have ${displayLimit - displayCurrent} credits remaining.`,
        currentUsage,
        limit: hardCap,
        remaining: Math.max(0, hardCap - currentUsage),
        isHardCap: true,
        willIncurOverage: false,
      };
    }

    const willIncurOverage = projectedUsage > includedQuota && !!overageRule;
    let estimatedOverageCostMicrocents: number | undefined;

    if (willIncurOverage && overageRule) {
      const overageUnits = Math.max(0, projectedUsage - includedQuota);
      estimatedOverageCostMicrocents = overageUnits * (overageRule.overageUnitPriceMicrocents || 0);
    }

    return {
      allowed: true,
      currentUsage,
      limit: hardCap || includedQuota || null,
      remaining: hardCap ? Math.max(0, hardCap - currentUsage) : null,
      isHardCap: !!hardCap,
      willIncurOverage,
      estimatedOverageCostMicrocents,
    };
  }

  async recordUsage(params: {
    subscriptionId: number;
    meterCode: string;
    units?: number;
    actorUserId?: string;
    requestId: string;
  }): Promise<RecordUsageResult> {
    const units = params.units || 1;
    console.log(`[USAGE] Recording ${units} units for meter ${params.meterCode}, subscription ${params.subscriptionId}`);

    const [existingEvent] = await db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.requestId, params.requestId))
      .limit(1);

    if (existingEvent) {
      console.log(`[USAGE] Event already exists: ${existingEvent.id}`);
      return { success: true, usageEventId: existingEvent.id };
    }

    const checkResult = await this.checkLimit(params.subscriptionId, params.meterCode, units);
    console.log(`[USAGE] Check limit result:`, checkResult);
    if (!checkResult.allowed) {
      console.log(`[USAGE] Limit check failed: ${checkResult.reason}`);
      return { success: false, error: checkResult.reason };
    }

    const [meter] = await db.select().from(meters).where(eq(meters.code, params.meterCode)).limit(1);
    if (!meter) {
      console.log(`[USAGE] Meter not found: ${params.meterCode}`);
      return { success: false, error: `Meter not found: ${params.meterCode}` };
    }
    console.log(`[USAGE] Found meter: ${meter.id} (${meter.code})`);


    const cycle = await this.getOrCreateBillingCycle(params.subscriptionId);

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, params.subscriptionId))
      .limit(1);

    const [usageEvent] = await db
      .insert(usageEvents)
      .values({
        subscriptionId: params.subscriptionId,
        billingCycleId: cycle.id,
        meterId: meter.id,
        units,
        actorUserId: params.actorUserId,
        orgId: subscription?.orgId,
        requestId: params.requestId,
        occurredAt: new Date(),
      })
      .returning();

    const rules = await db
      .select()
      .from(planMeterRules)
      .where(
        and(
          eq(planMeterRules.planId, subscription!.planId),
          eq(planMeterRules.meterId, meter.id)
        )
      );

    const quotaRule = rules.find((r) => r.ruleType === "INCLUDED_QUOTA");
    const hardCapRule = rules.find((r) => r.ruleType === "HARD_CAP");
    const overageRule = rules.find((r) => r.ruleType === "METERED_OVERAGE");

    const includedQuota = quotaRule?.includedUnitsMonthly || 0;
    const hardCap = hardCapRule?.hardCapUnits;

    const [currentRollup] = await db
      .select()
      .from(usageRollups)
      .where(
        and(eq(usageRollups.billingCycleId, cycle.id), eq(usageRollups.meterId, meter.id))
      )
      .limit(1);

    const newUsedUnits = (currentRollup?.usedUnits || 0) + units;
    const newRemainingUnits = Math.max(0, includedQuota - newUsedUnits);
    const newOverageUnits = Math.max(0, newUsedUnits - includedQuota);
    const overageCostMicrocents = overageRule
      ? newOverageUnits * (overageRule.overageUnitPriceMicrocents || 0)
      : 0;
    const hardCapHit = hardCap !== null && hardCap !== undefined && newUsedUnits >= hardCap;

    if (currentRollup) {
      const [updatedRollup] = await db
        .update(usageRollups)
        .set({
          usedUnits: newUsedUnits,
          remainingUnits: newRemainingUnits,
          overageUnits: newOverageUnits,
          overageCostMicrocents,
          hardCapHit,
          updatedAt: new Date(),
        })
        .where(eq(usageRollups.id, currentRollup.id))
        .returning();

      return { success: true, usageEventId: usageEvent.id, rollup: updatedRollup };
    } else {
      const [newRollup] = await db
        .insert(usageRollups)
        .values({
          billingCycleId: cycle.id,
          meterId: meter.id,
          includedUnits: includedQuota,
          usedUnits: newUsedUnits,
          remainingUnits: newRemainingUnits,
          overageUnits: newOverageUnits,
          overageCostMicrocents,
          hardCapHit,
        })
        .returning();

      return { success: true, usageEventId: usageEvent.id, rollup: newRollup };
    }
  }

  async calculateOverages(billingCycleId: number): Promise<{ totalMicrocents: number; byMeter: Record<string, number> }> {
    const rollups = await db
      .select()
      .from(usageRollups)
      .innerJoin(meters, eq(usageRollups.meterId, meters.id))
      .where(eq(usageRollups.billingCycleId, billingCycleId));

    let totalMicrocents = 0;
    const byMeter: Record<string, number> = {};

    for (const row of rollups) {
      const cost = row.usage_rollups.overageCostMicrocents || 0;
      totalMicrocents += cost;
      byMeter[row.meters.code] = cost;
    }

    return { totalMicrocents, byMeter };
  }

  async getUsageSummary(subscriptionId: number): Promise<Record<string, UsageRollup>> {
    const cycle = await this.getOrCreateBillingCycle(subscriptionId);

    const rollups = await db
      .select()
      .from(usageRollups)
      .innerJoin(meters, eq(usageRollups.meterId, meters.id))
      .where(eq(usageRollups.billingCycleId, cycle.id));

    const summary: Record<string, UsageRollup> = {};
    for (const row of rollups) {
      summary[row.meters.code] = row.usage_rollups;
    }

    return summary;
  }

  async ensureUserHasSubscription(userId: string): Promise<Subscription> {
    let subscription = await this.getSubscriptionForUser(userId);
    if (!subscription) {
      subscription = await this.createSubscription({ planCode: "FREE", userId });
    }
    return subscription;
  }

  async changePlan(subscriptionId: number, newPlanCode: string, actorUserId?: string): Promise<Subscription> {
    const [plan] = await db.select().from(plans).where(eq(plans.code, newPlanCode)).limit(1);
    if (!plan) {
      throw new Error(`Plan not found: ${newPlanCode}`);
    }

    const [updatedSubscription] = await db
      .update(subscriptions)
      .set({ planId: plan.id })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    await db.insert(billingAuditLogs).values({
      actorUserId,
      action: "PLAN_CHANGED",
      entityType: "subscription",
      entityId: String(subscriptionId),
      metadataJson: { newPlanCode },
    });

    return updatedSubscription;
  }

  async cancelSubscription(subscriptionId: number, actorUserId?: string): Promise<Subscription> {
    const [updatedSubscription] = await db
      .update(subscriptions)
      .set({ status: "CANCELED" })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    await db.insert(billingAuditLogs).values({
      actorUserId,
      action: "SUBSCRIPTION_CANCELED",
      entityType: "subscription",
      entityId: String(subscriptionId),
    });

    return updatedSubscription;
  }
}

export const billingProvider = new MockBillingProvider();

// Resource types that consume credits
export const RESOURCE_TYPES = {
  PROJECT: "project",
  TASK: "task",
  ISSUE: "issue",
  RISK: "risk",
  DOCUMENT: "document",
  RESOURCE: "resource",
  RESOURCE_ASSIGNMENT: "resource_assignment",
  AI_RUN: "ai_run",
} as const;

export type ResourceType = (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES];

// Legacy meter codes for backwards compatibility
export const METER_CODES = {
  CREDITS: "credits",
  PROJECTS: "projects",
  TASKS: "tasks",
  DOCUMENTS: "documents",
  AI_RUNS: "ai_runs",
} as const;

export type MeterCode = (typeof METER_CODES)[keyof typeof METER_CODES];

// Get credit cost for a resource type from database
async function getResourceCreditCost(resourceType: ResourceType): Promise<number> {
  const result = await db.execute(
    sql`SELECT credit_cost FROM resource_credit_costs WHERE resource_type = ${resourceType} AND is_active = true`
  );
  const cost = (result.rows[0] as any)?.credit_cost;
  // Return default costs if not found (in hundredths of a credit)
  if (cost === undefined || cost === null) {
    const defaults: Record<string, number> = {
      project: 500,      // 5 credits
      task: 100,         // 1 credit
      issue: 100,        // 1 credit
      risk: 100,         // 1 credit
      document: 100,     // 1 credit
      resource: 200,     // 2 credits
      resource_assignment: 50,  // 0.5 credits
      ai_run: 300,       // 3 credits
    };
    return defaults[resourceType] || 100;
  }
  return cost;
}

// Get total credits used by a user in the current billing cycle
async function getTotalCreditsUsed(subscriptionId: number): Promise<number> {
  const cycle = await billingProvider.getOrCreateBillingCycle(subscriptionId);
  const [creditsMeter] = await db.select().from(meters).where(eq(meters.code, "credits")).limit(1);
  if (!creditsMeter) return 0;
  
  const [rollup] = await db
    .select()
    .from(usageRollups)
    .where(
      and(
        eq(usageRollups.billingCycleId, cycle.id),
        eq(usageRollups.meterId, creditsMeter.id)
      )
    )
    .limit(1);
  
  return rollup?.usedUnits || 0;
}

// Get credits limit for a subscription
async function getCreditsLimit(subscriptionId: number): Promise<{ included: number; hardCap: number | null }> {
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1);
  if (!subscription) return { included: 0, hardCap: 0 };
  
  const [creditsMeter] = await db.select().from(meters).where(eq(meters.code, "credits")).limit(1);
  if (!creditsMeter) return { included: 0, hardCap: null };
  
  const rules = await db
    .select()
    .from(planMeterRules)
    .where(
      and(
        eq(planMeterRules.planId, subscription.planId),
        eq(planMeterRules.meterId, creditsMeter.id)
      )
    );
  
  const quotaRule = rules.find((r) => r.ruleType === "INCLUDED_QUOTA");
  const hardCapRule = rules.find((r) => r.ruleType === "HARD_CAP");
  
  return {
    included: quotaRule?.includedUnitsMonthly || 0,
    hardCap: hardCapRule?.hardCapUnits || null
  };
}

// Helper function to check and enforce credit limits before resource creation
export async function checkCreditLimit(
  userId: string,
  resourceType: ResourceType
): Promise<{ allowed: boolean; error?: string; creditsRequired: number; creditsRemaining?: number }> {
  try {
    let subscription = await billingProvider.getSubscriptionForUser(userId);
    if (!subscription) {
      await billingProvider.ensureUserHasSubscription(userId);
      subscription = await billingProvider.getSubscriptionForUser(userId);
      if (!subscription) {
        return { allowed: false, error: "Unable to verify subscription", creditsRequired: 0 };
      }
    }

    const creditCostHundredths = await getResourceCreditCost(resourceType);
    const creditsUsedHundredths = await getTotalCreditsUsed(subscription.id);
    const { included, hardCap } = await getCreditsLimit(subscription.id);
    
    // Plan limits are stored as actual credits, convert to hundredths for comparison
    const limitHundredths = (hardCap !== null ? hardCap : included) * 100;
    const creditsRemainingHundredths = Math.max(0, limitHundredths - creditsUsedHundredths);
    
    // Convert from hundredths to display format (actual credits)
    const displayCreditsRequired = creditCostHundredths / 100;
    const displayRemaining = creditsRemainingHundredths / 100;
    const displayLimit = limitHundredths / 100;
    
    if (creditsUsedHundredths + creditCostHundredths > limitHundredths) {
      return {
        allowed: false,
        error: `You need ${displayCreditsRequired} credits but only have ${displayRemaining.toLocaleString()} remaining. Your plan includes ${displayLimit.toLocaleString()} credits. Please upgrade your plan.`,
        creditsRequired: creditCostHundredths,
        creditsRemaining: creditsRemainingHundredths
      };
    }
    
    return { 
      allowed: true, 
      creditsRequired: creditCostHundredths,
      creditsRemaining: creditsRemainingHundredths
    };
  } catch (error) {
    console.error("Error checking credit limit:", error);
    return { allowed: true, creditsRequired: 0 };
  }
}

// Legacy function for backwards compatibility - redirects to credit system
export async function checkAndEnforceLimit(
  userId: string,
  meterCode: MeterCode,
  unitsToAdd: number = 1
): Promise<{ allowed: boolean; error?: string; remaining?: number }> {
  // Map old meter codes to resource types
  const meterToResource: Record<string, ResourceType> = {
    projects: RESOURCE_TYPES.PROJECT,
    tasks: RESOURCE_TYPES.TASK,
    documents: RESOURCE_TYPES.DOCUMENT,
    ai_runs: RESOURCE_TYPES.AI_RUN,
  };
  
  const resourceType = meterToResource[meterCode];
  if (!resourceType) {
    return { allowed: true };
  }
  
  const result = await checkCreditLimit(userId, resourceType);
  return {
    allowed: result.allowed,
    error: result.error,
    // creditsRemaining is in hundredths, convert to actual credits for display
    remaining: result.creditsRemaining !== undefined ? result.creditsRemaining / 100 : undefined
  };
}

// Helper function to record credit usage after successful resource creation
export async function recordCreditUsage(
  userId: string,
  resourceType: ResourceType,
  resourceId: string | number
): Promise<void> {
  try {
    console.log(`[CREDITS] Recording credit usage for user ${userId}, resource ${resourceType}, id ${resourceId}`);
    
    const subscription = await billingProvider.getSubscriptionForUser(userId);
    if (!subscription) {
      console.log(`[CREDITS] No subscription found for user ${userId}`);
      return;
    }
    console.log(`[CREDITS] Found subscription ${subscription.id} for user ${userId}`);

    const creditCost = await getResourceCreditCost(resourceType);
    console.log(`[CREDITS] Credit cost for ${resourceType}: ${creditCost} (hundredths)`);
    
    const result = await billingProvider.recordUsage({
      subscriptionId: subscription.id,
      meterCode: "credits",
      units: creditCost,
      actorUserId: userId,
      requestId: `${resourceType}_${resourceId}_${Date.now()}`,
    });
    console.log(`[CREDITS] Record usage result:`, result);
  } catch (error) {
    console.error("[CREDITS] Error recording credit usage:", error);
  }
}

// Legacy function for backwards compatibility
export async function recordResourceUsage(
  userId: string,
  meterCode: MeterCode,
  resourceId: string | number,
  units: number = 1
): Promise<void> {
  const meterToResource: Record<string, ResourceType> = {
    projects: RESOURCE_TYPES.PROJECT,
    tasks: RESOURCE_TYPES.TASK,
    documents: RESOURCE_TYPES.DOCUMENT,
    ai_runs: RESOURCE_TYPES.AI_RUN,
  };
  
  const resourceType = meterToResource[meterCode];
  if (resourceType) {
    await recordCreditUsage(userId, resourceType, resourceId);
  }
}

// Get all credit costs for display
export async function getAllCreditCosts(): Promise<Array<{ resourceType: string; creditCost: number; displayName: string; description: string | null }>> {
  const result = await db.execute(
    sql`SELECT resource_type, credit_cost, display_name, description FROM resource_credit_costs WHERE is_active = true ORDER BY credit_cost DESC`
  );
  
  // Map snake_case database columns to camelCase
  return (result.rows as any[]).map(row => ({
    resourceType: row.resource_type,
    creditCost: Number(row.credit_cost),
    displayName: row.display_name,
    description: row.description
  }));
}

// Update a credit cost (for Super Admin)
export async function updateCreditCost(
  resourceType: string, 
  creditCost: number,
  updatedBy: string
): Promise<void> {
  await db.execute(
    sql`UPDATE resource_credit_costs SET credit_cost = ${creditCost}, updated_at = NOW(), updated_by = ${updatedBy} WHERE resource_type = ${resourceType}`
  );
}

// Check seat limit for an organization
export async function checkSeatLimit(orgId: number, seatsToAdd: number = 1): Promise<SeatLimitResult> {
  return billingProvider.checkSeatLimit(orgId, seatsToAdd);
}
