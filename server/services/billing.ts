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

export interface BillingProvider {
  checkLimit(subscriptionId: number, meterCode: string, unitsToAdd?: number): Promise<UsageCheckResult>;
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

    const includedQuota = quotaRule?.includedUnitsMonthly || 0;
    const hardCap = hardCapRule?.hardCapUnits;
    const projectedUsage = currentUsage + unitsToAdd;

    if (hardCap !== null && hardCap !== undefined && projectedUsage > hardCap) {
      return {
        allowed: false,
        reason: `Hard cap reached for ${meterCode}. Limit: ${hardCap}`,
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

    const checkResult = await this.checkLimit(params.subscriptionId, params.meterCode, units);
    if (!checkResult.allowed) {
      return { success: false, error: checkResult.reason };
    }

    const [meter] = await db.select().from(meters).where(eq(meters.code, params.meterCode)).limit(1);
    if (!meter) {
      return { success: false, error: `Meter not found: ${params.meterCode}` };
    }

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
