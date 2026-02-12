import { db } from "../db";
import { organizations, subscriptions, plans } from "@shared/schema";
import { eq, isNull, sql, and, not, inArray } from "drizzle-orm";

async function fixSubscriptions() {
  console.log("=== Subscription Cleanup Script ===\n");

  // Step 1: Find the FREE plan
  const [freePlan] = await db.select().from(plans).where(eq(plans.code, "FREE")).limit(1);
  if (!freePlan) {
    console.error("FREE plan not found in database!");
    process.exit(1);
  }
  console.log(`Found FREE plan: id=${freePlan.id}\n`);

  // Step 2: Find orgs without any subscription
  const orgsWithoutSubs = await db.execute(sql`
    SELECT o.id, o.name, o.owner_id
    FROM organizations o
    LEFT JOIN subscriptions s ON s.org_id = o.id
    WHERE o.deactivated_at IS NULL AND s.id IS NULL
  `);

  console.log(`Organizations without subscriptions: ${orgsWithoutSubs.rows.length}`);
  for (const org of orgsWithoutSubs.rows) {
    const orgId = org.id as number;
    const ownerId = org.owner_id as string | null;
    console.log(`  - Org ${orgId}: "${org.name}" (owner: ${ownerId || 'none'})`);

    await db.insert(subscriptions).values({
      planId: freePlan.id,
      status: "ACTIVE",
      subjectType: "ORG",
      orgId: orgId,
      userId: ownerId || undefined,
      hardCapEnabled: false,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000),
    });
    console.log(`    -> Assigned FREE plan`);
  }

  // Step 3: Find and clean duplicate subscriptions per org
  console.log("\n--- Cleaning duplicate subscriptions ---");
  const duplicateOrgs = await db.execute(sql`
    SELECT org_id, COUNT(*) as sub_count
    FROM subscriptions
    WHERE org_id IS NOT NULL
    GROUP BY org_id
    HAVING COUNT(*) > 1
    ORDER BY org_id
  `);

  console.log(`Organizations with duplicate subscriptions: ${duplicateOrgs.rows.length}`);
  for (const row of duplicateOrgs.rows) {
    const orgId = row.org_id as number;
    const count = row.sub_count as number;

    // Get all subscriptions for this org, ordered by: ACTIVE first, then most recent
    const orgSubs = await db.execute(sql`
      SELECT id, plan_id, status, created_at
      FROM subscriptions
      WHERE org_id = ${orgId}
      ORDER BY 
        CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END,
        created_at DESC
    `);

    // Keep the first one (best: active + most recent), delete the rest
    const keepId = orgSubs.rows[0].id as number;
    const deleteIds = orgSubs.rows.slice(1).map(r => r.id as number);

    // Also check if there's a paid plan - prefer keeping that over FREE
    let bestId = keepId;
    for (const sub of orgSubs.rows) {
      const subPlanId = sub.plan_id as number;
      const subStatus = sub.status as string;
      if (subStatus === 'ACTIVE' && subPlanId !== freePlan.id) {
        bestId = sub.id as number;
        break;
      }
    }

    const finalDeleteIds = orgSubs.rows.filter(r => (r.id as number) !== bestId).map(r => r.id as number);

    console.log(`  Org ${orgId}: ${count} subs -> keeping sub ${bestId}, deleting [${finalDeleteIds.join(', ')}]`);

    if (finalDeleteIds.length > 0) {
      for (const delId of finalDeleteIds) {
        // Delete in FK dependency order
        await db.execute(sql`DELETE FROM usage_events WHERE subscription_id = ${delId}`);
        await db.execute(sql`DELETE FROM usage_events WHERE billing_cycle_id IN (SELECT id FROM billing_cycles WHERE subscription_id = ${delId})`);
        await db.execute(sql`DELETE FROM usage_rollups WHERE billing_cycle_id IN (SELECT id FROM billing_cycles WHERE subscription_id = ${delId})`);
        await db.execute(sql`DELETE FROM invoice_records WHERE subscription_id = ${delId}`);
        await db.execute(sql`DELETE FROM invoice_records WHERE billing_cycle_id IN (SELECT id FROM billing_cycles WHERE subscription_id = ${delId})`);
        await db.execute(sql`DELETE FROM billing_transactions WHERE subscription_id = ${delId}`);
        await db.execute(sql`DELETE FROM billing_cycles WHERE subscription_id = ${delId}`);
        await db.execute(sql`DELETE FROM subscriptions WHERE id = ${delId}`);
      }
      console.log(`    -> Deleted ${finalDeleteIds.length} duplicate(s) and their related records`);
    }
  }

  // Step 4: Verify final state
  console.log("\n--- Final verification ---");
  const finalCheck = await db.execute(sql`
    SELECT o.id, o.name, s.id as sub_id, p.code as plan_code, s.status
    FROM organizations o
    LEFT JOIN subscriptions s ON s.org_id = o.id
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE o.deactivated_at IS NULL
    ORDER BY o.id
  `);

  let allGood = true;
  for (const row of finalCheck.rows) {
    const hasSub = row.sub_id !== null;
    if (!hasSub) {
      console.log(`  WARNING: Org ${row.id} ("${row.name}") still has no subscription!`);
      allGood = false;
    }
  }

  if (allGood) {
    console.log("  All organizations have exactly one subscription.");
  }

  // Check for remaining duplicates
  const remainingDups = await db.execute(sql`
    SELECT org_id, COUNT(*) as cnt
    FROM subscriptions WHERE org_id IS NOT NULL
    GROUP BY org_id HAVING COUNT(*) > 1
  `);
  if (remainingDups.rows.length === 0) {
    console.log("  No duplicate subscriptions remain.");
  } else {
    console.log(`  WARNING: ${remainingDups.rows.length} orgs still have duplicates!`);
  }

  console.log("\n=== Done ===");
  process.exit(0);
}

fixSubscriptions().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
