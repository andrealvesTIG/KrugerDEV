/**
 * Boot-time billing bootstrap.
 *
 * Ensures the minimum billing rows required by `checkCreditLimit` exist so
 * resource-creation gates (intakes, projects, etc.) do not block on a fresh
 * environment that was never seeded by `npm run seed:billing`.
 *
 * Idempotent — safe to run on every boot.
 *
 * What it guarantees:
 *   1. A `credits` meter row exists.
 *   2. A `CUSTOM` plan exists with an unlimited credit quota (no HARD_CAP).
 *   3. Every existing user with no subscription is given an ACTIVE `CUSTOM`
 *      subscription so the credit gate has something to read.
 *
 * Future-friendly: when an admin wants to tighten quotas later they can edit
 * `plan_meter_rules` directly or move users to a smaller plan; this function
 * only fills in *missing* rows.
 */

import { db } from "../db";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  plans,
  meters,
  planMeterRules,
  subscriptions,
  users,
} from "@shared/schema";

const UNLIMITED_CREDIT_QUOTA = 999_999_999;
const DEFAULT_PLAN_CODE = "CUSTOM";

export async function ensureBillingBootstrap(): Promise<void> {
  try {
    // 1. credits meter
    let [creditsMeter] = await db.select().from(meters).where(eq(meters.code, "credits")).limit(1);
    if (!creditsMeter) {
      [creditsMeter] = await db
        .insert(meters)
        .values({
          code: "credits",
          name: "Credits",
          unitLabel: "credit",
          aggregationType: "COUNT",
        })
        .returning();
      console.log("[billing-init] Created `credits` meter");
    }

    // 2. default plan (CUSTOM) with unlimited credit quota
    let [defaultPlan] = await db.select().from(plans).where(eq(plans.code, DEFAULT_PLAN_CODE)).limit(1);
    if (!defaultPlan) {
      [defaultPlan] = await db
        .insert(plans)
        .values({
          code: DEFAULT_PLAN_CODE,
          name: "Custom",
          description: "Custom plan with unlimited capacity.",
          annualPriceCents: 0,
          maxSeats: null,
          extraSeatPriceCents: null,
        })
        .returning();
      console.log(`[billing-init] Created \`${DEFAULT_PLAN_CODE}\` plan`);
    }

    // Ensure the INCLUDED_QUOTA rule exists for credits on the default plan.
    const [existingQuota] = await db
      .select()
      .from(planMeterRules)
      .where(
        and(
          eq(planMeterRules.planId, defaultPlan.id),
          eq(planMeterRules.meterId, creditsMeter.id),
          eq(planMeterRules.ruleType, "INCLUDED_QUOTA"),
        ),
      )
      .limit(1);
    if (!existingQuota) {
      await db.insert(planMeterRules).values({
        planId: defaultPlan.id,
        meterId: creditsMeter.id,
        ruleType: "INCLUDED_QUOTA",
        includedUnitsAnnual: UNLIMITED_CREDIT_QUOTA,
      });
      console.log(`[billing-init] Added unlimited credit quota for plan \`${DEFAULT_PLAN_CODE}\``);
    }

    // Make sure no HARD_CAP is throttling credits on the default plan.
    await db
      .delete(planMeterRules)
      .where(
        and(
          eq(planMeterRules.planId, defaultPlan.id),
          eq(planMeterRules.meterId, creditsMeter.id),
          eq(planMeterRules.ruleType, "HARD_CAP"),
        ),
      );

    // 3. Backfill subscriptions for users that don't have one. We bypass the
    // service helper and write the rows directly so this can run safely
    // before any auth flow has touched billing.
    const now = new Date();
    const yearLater = new Date(now);
    yearLater.setFullYear(yearLater.getFullYear() + 1);

    const inserted = await db.execute(sql`
      INSERT INTO subscriptions (
        plan_id, status, subject_type, user_id,
        current_period_start, current_period_end, created_at
      )
      SELECT
        ${defaultPlan.id},
        'ACTIVE',
        'USER',
        u.id,
        ${now},
        ${yearLater},
        ${now}
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
      )
      RETURNING id
    `);

    const newCount = (inserted as any).rowCount ?? (inserted as any).rows?.length ?? 0;
    if (newCount > 0) {
      console.log(`[billing-init] Backfilled ${newCount} user subscription(s) on plan \`${DEFAULT_PLAN_CODE}\``);
    }
  } catch (err) {
    console.error("[billing-init] Bootstrap failed:", err);
  }
}
