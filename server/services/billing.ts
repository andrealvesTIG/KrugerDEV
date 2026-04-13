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
  private async advancePeriodIfNeeded(subscription: Subscription): Promise<Subscription> {
    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);
    if (now > periodEnd) {
      const { start, end } = getMonthBoundaries(now);

      await db
        .update(billingCycles)
        .set({ status: "CLOSED" })
        .where(
          and(
            eq(billingCycles.subscriptionId, subscription.id),
            eq(billingCycles.status, "OPEN")
          )
        );

      const [updated] = await db
        .update(subscriptions)
        .set({ currentPeriodStart: start, currentPeriodEnd: end })
        .where(eq(subscriptions.id, subscription.id))
        .returning();

      if (updated) {
        await this.getOrCreateBillingCycle(updated.id);
      }

      return updated || subscription;
    }
    return subscription;
  }

  async getSubscriptionForUser(userId: string): Promise<Subscription | null> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "ACTIVE")))
      .limit(1);
    if (!subscription) return null;
    return this.advancePeriodIfNeeded(subscription);
  }

  async getSubscriptionForOrg(orgId: number): Promise<Subscription | null> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, "ACTIVE")))
      .limit(1);
    if (!subscription) return null;
    return this.advancePeriodIfNeeded(subscription);
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
    
    // Get bonus seats from subscription
    const bonusSeats = subscription.bonusSeats || 0;

    // If maxSeats is null, unlimited seats
    if (plan.maxSeats === null) {
      return {
        allowed: true,
        currentSeats,
        maxSeats: null,
        remaining: null
      };
    }

    // Total available seats = plan seats + bonus seats
    const totalMaxSeats = plan.maxSeats + bonusSeats;
    const remaining = Math.max(0, totalMaxSeats - currentSeats);
    const allowed = currentSeats + seatsToAdd <= totalMaxSeats;

    return {
      allowed,
      currentSeats,
      maxSeats: totalMaxSeats,
      remaining,
      reason: !allowed ? `Your ${plan.name} plan allows ${plan.maxSeats} seat${plan.maxSeats === 1 ? '' : 's'}${bonusSeats > 0 ? ` plus ${bonusSeats} bonus seat${bonusSeats === 1 ? '' : 's'}` : ''}. You currently have ${currentSeats}. Please upgrade to add more team members.` : undefined
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

    // Guard: prevent duplicate active subscriptions for the same plan
    if (params.orgId) {
      const [existing] = await db.select().from(subscriptions)
        .where(and(eq(subscriptions.orgId, params.orgId), eq(subscriptions.status, "ACTIVE"), eq(subscriptions.planId, plan.id)))
        .limit(1);
      if (existing) {
        return existing;
      }
    } else if (params.userId) {
      const [existing] = await db.select().from(subscriptions)
        .where(and(eq(subscriptions.userId, params.userId), eq(subscriptions.status, "ACTIVE"), eq(subscriptions.planId, plan.id)))
        .limit(1);
      if (existing) {
        return existing;
      }
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

  async getOrCreateBillingCycle(subscriptionId: number, dbHandle: typeof db = db): Promise<BillingCycle> {
    const { start, end } = getMonthBoundaries();

    const [existingCycle] = await dbHandle
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

    try {
      const [newCycle] = await dbHandle
        .insert(billingCycles)
        .values({
          subscriptionId,
          periodStart: start,
          periodEnd: end,
          status: "OPEN",
        })
        .onConflictDoNothing()
        .returning();

      if (!newCycle) {
        const [racedCycle] = await dbHandle
          .select()
          .from(billingCycles)
          .where(
            and(
              eq(billingCycles.subscriptionId, subscriptionId),
              eq(billingCycles.status, "OPEN")
            )
          )
          .limit(1);
        if (racedCycle) return racedCycle;
        throw new Error(`Failed to create or find OPEN billing cycle for subscription ${subscriptionId}`);
      }

      const [subscription] = await dbHandle
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .limit(1);

      if (subscription) {
        const rules = await dbHandle
          .select()
          .from(planMeterRules)
          .innerJoin(meters, eq(planMeterRules.meterId, meters.id))
          .where(eq(planMeterRules.planId, subscription.planId));

        const meterIds = [...new Set(rules.map((r) => r.meters.id))];

        for (const meterId of meterIds) {
          const meterRules = rules.filter((r) => r.meters.id === meterId);
          const meterInfo = meterRules[0]?.meters;
          const quotaRule = meterRules.find((r) => r.plan_meter_rules.ruleType === "INCLUDED_QUOTA");
          const rawIncludedUnits = quotaRule?.plan_meter_rules.includedUnitsMonthly || 0;
          const isCredits = meterInfo?.code === 'credits';
          const includedUnits = rawIncludedUnits * (isCredits ? 100 : 1);

          await dbHandle.insert(usageRollups).values({
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
    } catch (error: any) {
      if (error.code === '23505') {
        const [racedCycle] = await dbHandle
          .select()
          .from(billingCycles)
          .where(
            and(
              eq(billingCycles.subscriptionId, subscriptionId),
              eq(billingCycles.status, "OPEN")
            )
          )
          .limit(1);
        if (racedCycle) return racedCycle;
      }
      throw error;
    }
  }

  async checkLimit(
    subscriptionId: number,
    meterCode: string,
    unitsToAdd: number = 1,
    dbHandle: typeof db = db
  ): Promise<UsageCheckResult> {
    const [subscription] = await dbHandle
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

    const [meter] = await dbHandle.select().from(meters).where(eq(meters.code, meterCode)).limit(1);
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

    const rules = await dbHandle
      .select()
      .from(planMeterRules)
      .where(
        and(
          eq(planMeterRules.planId, subscription.planId),
          eq(planMeterRules.meterId, meter.id)
        )
      );

    const cycle = await this.getOrCreateBillingCycle(subscriptionId, dbHandle);

    const [rollup] = await dbHandle
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
    const [existingEvent] = await db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.requestId, params.requestId))
      .limit(1);

    if (existingEvent) {
      return { success: true, usageEventId: existingEvent.id };
    }

    const [meter] = await db.select().from(meters).where(eq(meters.code, params.meterCode)).limit(1);
    if (!meter) {
      return { success: false, error: `Meter not found: ${params.meterCode}` };
    }

    const billingInstance = this;
    return await db.transaction(async (tx) => {
      const checkResult = await billingInstance.checkLimit(params.subscriptionId, params.meterCode, units, tx as any);
      if (!checkResult.allowed) {
        return { success: false, error: checkResult.reason } as RecordUsageResult;
      }

      const cycle = await billingInstance.getOrCreateBillingCycle(params.subscriptionId, tx as any);

      const [subscription] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, params.subscriptionId))
        .limit(1);

      const [usageEvent] = await tx
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

      const rules = await tx
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

      const isCredits = params.meterCode === 'credits';
      const includedQuota = (quotaRule?.includedUnitsMonthly || 0) * (isCredits ? 100 : 1);
      const hardCap = hardCapRule?.hardCapUnits ? hardCapRule.hardCapUnits * (isCredits ? 100 : 1) : null;

      const [currentRollup] = await tx
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
        const [updatedRollup] = await tx
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

        return { success: true, usageEventId: usageEvent.id, rollup: updatedRollup } as RecordUsageResult;
      } else {
        const [newRollup] = await tx
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

        return { success: true, usageEventId: usageEvent.id, rollup: newRollup } as RecordUsageResult;
      }
    });
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
  PORTFOLIO: "portfolio",
  INTAKE: "intake",
  CHANGE_REQUEST: "change_request",
  REPORT: "report",
  EMAIL: "email",
  SHARE: "share",
  SEARCH: "search",
  INTEGRATION: "integration",
} as const;

export type ResourceType = (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES];

// Legacy meter codes for backwards compatibility
export const METER_CODES = {
  CREDITS: "credits",
  PROJECTS: "projects",
  TASKS: "tasks",
  DOCUMENTS: "documents",
  AI_RUNS: "ai_runs",
  ISSUES: "issues",
  RISKS: "risks",
  RESOURCES: "resources",
  RESOURCE_ASSIGNMENTS: "resource_assignments",
  PORTFOLIOS: "portfolios",
  INTAKES: "intakes",
  CHANGE_REQUESTS: "change_requests",
  REPORTS: "reports",
  EMAILS: "emails",
  SHARES: "shares",
  SEARCHES: "searches",
  INTEGRATIONS: "integrations",
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
      portfolio: 1000,   // 10 credits
      intake: 200,       // 2 credits
      change_request: 100, // 1 credit
      report: 300,       // 3 credits
      email: 25,         // 0.25 credits
      share: 100,        // 1 credit
      search: 10,        // 0.1 credits
      integration: 800,  // 8 credits
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
  resourceType: ResourceType,
  orgId?: number | null
): Promise<{ allowed: boolean; error?: string; creditsRequired: number; creditsRemaining?: number }> {
  try {
    let subscription = null;
    if (orgId) {
      subscription = await billingProvider.getSubscriptionForOrg(orgId);
    }
    if (!subscription) {
      subscription = await billingProvider.getSubscriptionForUser(userId);
    }
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
    return { allowed: false, creditsRequired: 0, error: "Billing system temporarily unavailable" };
  }
}

// Legacy function for backwards compatibility - redirects to credit system
export async function checkAndEnforceLimit(
  userId: string,
  meterCode: MeterCode,
  unitsToAdd: number = 1,
  orgId?: number | null
): Promise<{ allowed: boolean; error?: string; remaining?: number }> {
  const meterToResource: Record<string, ResourceType> = {
    projects: RESOURCE_TYPES.PROJECT,
    tasks: RESOURCE_TYPES.TASK,
    documents: RESOURCE_TYPES.DOCUMENT,
    ai_runs: RESOURCE_TYPES.AI_RUN,
    issues: RESOURCE_TYPES.ISSUE,
    risks: RESOURCE_TYPES.RISK,
    resources: RESOURCE_TYPES.RESOURCE,
    resource_assignments: RESOURCE_TYPES.RESOURCE_ASSIGNMENT,
    portfolios: RESOURCE_TYPES.PORTFOLIO,
    intakes: RESOURCE_TYPES.INTAKE,
    change_requests: RESOURCE_TYPES.CHANGE_REQUEST,
    reports: RESOURCE_TYPES.REPORT,
    emails: RESOURCE_TYPES.EMAIL,
    shares: RESOURCE_TYPES.SHARE,
    searches: RESOURCE_TYPES.SEARCH,
    integrations: RESOURCE_TYPES.INTEGRATION,
  };
  
  const resourceType = meterToResource[meterCode];
  if (!resourceType) {
    return { allowed: true };
  }
  
  const result = await checkCreditLimit(userId, resourceType, orgId);
  return {
    allowed: result.allowed,
    error: result.error,
    remaining: result.creditsRemaining !== undefined ? result.creditsRemaining / 100 : undefined
  };
}

// Helper function to record credit usage after successful resource creation
export async function recordCreditUsage(
  userId: string,
  resourceType: ResourceType,
  resourceId: string | number,
  orgId?: number | null
): Promise<void> {
  try {
    let subscription = null;
    if (orgId) {
      subscription = await billingProvider.getSubscriptionForOrg(orgId);
    }
    
    if (!subscription) {
      subscription = await billingProvider.getSubscriptionForUser(userId);
    }
    
    if (!subscription) {
      return;
    }

    const creditCost = await getResourceCreditCost(resourceType);
    
    await billingProvider.recordUsage({
      subscriptionId: subscription.id,
      meterCode: "credits",
      units: creditCost,
      actorUserId: userId,
      requestId: `${resourceType}_${resourceId}_${Date.now()}`,
    });
  } catch (error) {
    console.error("[CREDITS] Error recording credit usage:", error);
  }
}

// Legacy function for backwards compatibility
export async function recordResourceUsage(
  userId: string,
  meterCode: MeterCode,
  resourceId: string | number,
  units: number = 1,
  orgId?: number | null
): Promise<void> {
  const meterToResource: Record<string, ResourceType> = {
    projects: RESOURCE_TYPES.PROJECT,
    tasks: RESOURCE_TYPES.TASK,
    documents: RESOURCE_TYPES.DOCUMENT,
    ai_runs: RESOURCE_TYPES.AI_RUN,
    issues: RESOURCE_TYPES.ISSUE,
    risks: RESOURCE_TYPES.RISK,
    resources: RESOURCE_TYPES.RESOURCE,
    resource_assignments: RESOURCE_TYPES.RESOURCE_ASSIGNMENT,
    portfolios: RESOURCE_TYPES.PORTFOLIO,
    intakes: RESOURCE_TYPES.INTAKE,
    change_requests: RESOURCE_TYPES.CHANGE_REQUEST,
    reports: RESOURCE_TYPES.REPORT,
    emails: RESOURCE_TYPES.EMAIL,
    shares: RESOURCE_TYPES.SHARE,
    searches: RESOURCE_TYPES.SEARCH,
    integrations: RESOURCE_TYPES.INTEGRATION,
  };
  
  const resourceType = meterToResource[meterCode];
  if (resourceType) {
    await recordCreditUsage(userId, resourceType, resourceId, orgId);
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

export async function cleanupDuplicateBillingCycles(): Promise<number> {
  const openCycles = await db
    .select()
    .from(billingCycles)
    .where(eq(billingCycles.status, "OPEN"))
    .orderBy(billingCycles.subscriptionId, billingCycles.id);

  const grouped = new Map<string, typeof openCycles>();
  for (const cycle of openCycles) {
    const key = `${cycle.subscriptionId}::${cycle.periodStart}::${cycle.periodEnd}`;
    const existing = grouped.get(key) || [];
    existing.push(cycle);
    grouped.set(key, existing);
  }

  let deletedCount = 0;
  for (const [groupKey, cycles] of grouped) {
    if (cycles.length <= 1) continue;

    const keepCycle = cycles[0];
    const subId = keepCycle.subscriptionId;
    const duplicateIds = cycles.slice(1).map(c => c.id);

    await db.transaction(async (tx) => {
      for (const dupId of duplicateIds) {
        await tx
          .update(usageEvents)
          .set({ billingCycleId: keepCycle.id })
          .where(eq(usageEvents.billingCycleId, dupId));

        const dupRollups = await tx
          .select()
          .from(usageRollups)
          .where(eq(usageRollups.billingCycleId, dupId));

        for (const rollup of dupRollups) {
          const [existing] = await tx
            .select()
            .from(usageRollups)
            .where(
              and(
                eq(usageRollups.billingCycleId, keepCycle.id),
                eq(usageRollups.meterId, rollup.meterId)
              )
            )
            .limit(1);

          if (existing) {
            const mergedUsed = existing.usedUnits + rollup.usedUnits;
            const includedUnits = existing.includedUnits;
            const mergedRemaining = Math.max(0, includedUnits - mergedUsed);
            const mergedOverage = Math.max(0, mergedUsed - includedUnits);
            const mergedOverageCost = existing.overageCostMicrocents + rollup.overageCostMicrocents;

            await tx
              .update(usageRollups)
              .set({
                usedUnits: mergedUsed,
                remainingUnits: mergedRemaining,
                overageUnits: mergedOverage,
                overageCostMicrocents: mergedOverageCost,
                hardCapHit: existing.hardCapHit || rollup.hardCapHit,
              })
              .where(eq(usageRollups.id, existing.id));
          } else {
            await tx.insert(usageRollups).values({
              billingCycleId: keepCycle.id,
              meterId: rollup.meterId,
              includedUnits: rollup.includedUnits,
              usedUnits: rollup.usedUnits,
              remainingUnits: rollup.remainingUnits,
              overageUnits: rollup.overageUnits,
              overageCostMicrocents: rollup.overageCostMicrocents,
              hardCapHit: rollup.hardCapHit,
            });
          }

          await tx.delete(usageRollups).where(eq(usageRollups.id, rollup.id));
        }

        await tx.delete(billingCycles).where(eq(billingCycles.id, dupId));
        deletedCount++;
      }
    });

    console.log(`[billing] Cleaned up ${duplicateIds.length} duplicate OPEN cycle(s) for subscription ${subId}, kept cycle ${keepCycle.id}`);
  }

  return deletedCount;
}
