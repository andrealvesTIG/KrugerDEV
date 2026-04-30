import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { users, usageEvents, meters, organizationMembers, plans, subscriptions, billingCycles, usageRollups, planMeterRules } from "@shared/schema";
import type { User } from "@shared/models/auth";
import {
  classifyError,
  getUserIdFromRequest,
  hasAdminAccess,
  userHasOrgAccess,
} from "./helpers";
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, qBool, pathStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400, e404 } from "../route-registry";

export async function registerBillingRoutes(app: Express) {
  // ============= BILLING ROUTES =============
  
  // Get all plans with meter rules
  apiRoute(app, 'get', '/api/billing/plans', {
    tag: 'Billing',
    summary: 'List available billing plans',
    responses: { ...r200('Plans list', arrOf('Plan')), ...authRes },
  }, async (req, res) => {
    try {
      const { plans, meters, planMeterRules } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const { getAllCreditCosts } = await import("../services/billing");
      
      let includeInactive = false;
      if (req.query.includeInactive === 'true') {
        const userId = getUserIdFromRequest(req);
        if (userId) {
          const user = await storage.getUser(userId);
          if (user?.role === 'super_admin') {
            includeInactive = true;
          }
        }
      }
      
      const allPlans = includeInactive
        ? await db.select().from(plans).orderBy(plans.displayOrder)
        : await db.select().from(plans).where(eq(plans.isActive, true));
      const allRules = await db
        .select()
        .from(planMeterRules)
        .innerJoin(meters, eq(planMeterRules.meterId, meters.id));

      const creditCosts = await getAllCreditCosts();
      
      const plansWithRules = allPlans.map(plan => ({
        ...plan,
        meterRules: allRules
          .filter(r => r.plan_meter_rules.planId === plan.id)
          .map(r => ({
            meterCode: r.meters.code,
            meterName: r.meters.name,
            ruleType: r.plan_meter_rules.ruleType,
            includedUnitsAnnual: r.plan_meter_rules.includedUnitsAnnual,
            hardCapUnits: r.plan_meter_rules.hardCapUnits,
            overageUnitPriceMicrocents: r.plan_meter_rules.overageUnitPriceMicrocents,
          })),
      }));
      
      res.json({ plans: plansWithRules, creditCosts });
    } catch (error) {
      console.error("Error fetching plans:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch plans" : classified.message });
    }
  });

  // Get subscription - supports both user and org-based subscriptions
  apiRoute(app, 'get', '/api/billing/subscription', {
    tag: 'Billing',
    summary: 'Get current subscription',
    parameters: [qInt('orgId', true)],
    responses: { ...r200('Subscription details', ref('Plan')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { billingProvider } = await import("../services/billing");
      const { plans } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const orgIdParam = req.query.orgId;
      const orgId = orgIdParam ? parseInt(orgIdParam as string) : null;
      
      let subscription = null;
      
      if (orgId) {
        if (!await userHasOrgAccess(userId, orgId)) {
          return res.status(403).json({ message: "Access denied" });
        }
        subscription = await billingProvider.getSubscriptionForOrg(orgId);
        if (!subscription) {
          // Auto-create a free subscription for organizations without one
          subscription = await billingProvider.createSubscription({ planCode: "FREE", orgId });
        }
      } else {
        // No orgId provided - show user's personal subscription
        subscription = await billingProvider.getSubscriptionForUser(userId);
        if (!subscription) {
          // Auto-create a free subscription for new users
          subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
        }
      }
      
      // Get the plan details
      const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId));
      
      res.json({ ...subscription, plan });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch subscription" : classified.message });
    }
  });

  // Get usage summary (credits-based)
  apiRoute(app, 'get', '/api/billing/usage', {
    tag: 'Billing',
    summary: 'Get current usage metrics',
    parameters: [qInt('orgId', true)],
    responses: { ...r200('Usage data', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { billingProvider, getAllCreditCosts } = await import("../services/billing");
      const { meters, planMeterRules, usageRollups } = await import("@shared/schema");
      const { sql, eq, and } = await import("drizzle-orm");
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;
      
      let subscription;
      
      if (orgId) {
        if (!await userHasOrgAccess(userId, orgId)) {
          return res.status(403).json({ message: "Access denied" });
        }
        subscription = await billingProvider.getSubscriptionForOrg(orgId);
        if (!subscription) {
          // Auto-create a free subscription for organizations without one
          subscription = await billingProvider.createSubscription({ planCode: "FREE", orgId });
        }
      } else {
        // No orgId provided - show user's personal subscription
        subscription = await billingProvider.getSubscriptionForUser(userId);
        if (!subscription) {
          // Auto-create a free subscription for new users
          subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
        }
      }
      
      // Get credits meter
      const [creditsMeter] = await db.select().from(meters).where(eq(meters.code, "credits")).limit(1);
      
      // Get credits limit from plan rules
      let creditsIncluded = 0;
      let creditsHardCap: number | null = null;
      
      if (creditsMeter) {
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
        
        creditsIncluded = quotaRule?.includedUnitsAnnual || 0;
        creditsHardCap = hardCapRule?.hardCapUnits || null;
      }
      
      // Get credits used from rollups
      const cycle = await billingProvider.getOrCreateBillingCycle(subscription.id);
      let creditsUsedHundredths = 0;
      
      if (creditsMeter) {
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
        
        creditsUsedHundredths = rollup?.usedUnits || 0;
      }
      
      // Convert usage from hundredths to actual credits for display
      // Plan meter rules store credits as actual credits (200, 500, etc.)
      // Usage rollups store in hundredths (500 = 5 credits)
      const creditsUsed = creditsUsedHundredths / 100;
      const limit = creditsHardCap !== null ? creditsHardCap : creditsIncluded;
      const remaining = Math.max(0, limit - creditsUsed);
      
      // Get credit costs for display
      const creditCosts = await getAllCreditCosts();
      
      // Return credits-based usage - plan limits are in actual credits, not hundredths
      res.json({
        credits: {
          used: creditsUsed,
          included: creditsIncluded,
          hardCap: creditsHardCap,
          remaining: remaining,
          limit: limit
        },
        creditCosts: creditCosts.map(c => ({
          ...c,
          creditCost: c.creditCost / 100 // Credit costs table uses hundredths, convert for display
        }))
      });
    } catch (error) {
      console.error("Error fetching usage:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch usage" : classified.message });
    }
  });

  // Get AI operation credit costs for frontend warnings
  apiRoute(app, 'get', '/api/billing/ai-costs', {
    tag: 'Billing',
    summary: 'Get AI feature costs',
    parameters: [qInt('orgId', true)],
    responses: { ...r200('AI costs', ref('Plan')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { billingProvider, getAllCreditCosts } = await import("../services/billing");
      const { meters, planMeterRules, usageRollups } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      // Get user's subscription
      let subscription = await billingProvider.getSubscriptionForUser(userId);
      if (!subscription) {
        subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
      }
      
      // Get credits meter info
      const [creditsMeter] = await db.select().from(meters).where(eq(meters.code, "credits")).limit(1);
      
      // Get credits limits from plan
      let creditsIncluded = 0;
      let creditsHardCap: number | null = null;
      let hasQuotaRule = false; // Track whether a quota rule exists at all
      
      if (creditsMeter) {
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
        
        hasQuotaRule = quotaRule !== undefined;
        creditsIncluded = quotaRule?.includedUnitsAnnual || 0;
        creditsHardCap = hardCapRule?.hardCapUnits ?? null;
      }
      
      // Get current usage
      const cycle = await billingProvider.getOrCreateBillingCycle(subscription.id);
      let creditsUsedHundredths = 0;
      
      if (creditsMeter) {
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
        
        creditsUsedHundredths = rollup?.usedUnits || 0;
      }
      
      const creditsUsed = creditsUsedHundredths / 100;
      
      // Determine if there's an explicit limit set
      // If hardCap exists, use it; if quota rule exists (even with 0 units), use quota; if neither, limit is null (unlimited)
      const hasExplicitLimit = creditsHardCap !== null || hasQuotaRule;
      const limit = hasExplicitLimit ? (creditsHardCap !== null ? creditsHardCap : creditsIncluded) : null;
      const remaining = limit !== null ? Math.max(0, limit - creditsUsed) : null;
      
      // Get all credit costs
      const creditCosts = await getAllCreditCosts();
      
      // Find AI-related credit costs - check for specific resource types
      const aiRunCost = creditCosts.find(c => c.resourceType === 'ai_run');
      const aiProjectCost = creditCosts.find(c => c.resourceType === 'ai_project_generation');
      const aiDemoCost = creditCosts.find(c => c.resourceType === 'ai_demo_generation');
      
      // Use specific costs if available, fallback to ai_run, then default 3 credits
      const projectCreditCost = aiProjectCost ? aiProjectCost.creditCost / 100 : 
                                 aiRunCost ? aiRunCost.creditCost / 100 : 3;
      const demoCreditCost = aiDemoCost ? aiDemoCost.creditCost / 100 : 
                              aiRunCost ? aiRunCost.creditCost / 100 : 3;
      
      // If remaining is null (unlimited), user can afford; otherwise check balance
      const canAffordProject = remaining === null || remaining >= projectCreditCost;
      const canAffordDemo = remaining === null || remaining >= demoCreditCost;
      
      res.json({
        aiProjectGeneration: {
          creditCost: projectCreditCost,
          description: "Generate a project with AI",
          canAfford: canAffordProject,
        },
        aiDemoDataGeneration: {
          creditCost: demoCreditCost,
          description: "Generate demo data with custom industry using AI",
          canAfford: canAffordDemo,
        },
        credits: {
          used: creditsUsed,
          remaining: remaining,
          limit: limit,
        },
        // Overall flag for backward compat - true if can afford at least one operation
        canAfford: canAffordProject || canAffordDemo,
      });
    } catch (error) {
      console.error("Error fetching AI costs:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch AI costs" : classified.message });
    }
  });

  // Get billing/payment history
  apiRoute(app, 'get', '/api/billing/history', {
    tag: 'Billing',
    summary: 'Get billing history',
    parameters: [qInt('orgId', true)],
    responses: { ...r200('Billing history', { type: 'array', items: { type: 'object' } }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;
      
      const transactions = await storage.getBillingTransactions(userId, orgId, limit, offset);
      
      // Prevent caching of billing history
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching billing history:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch billing history" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/billing/cycle-history', {
    tag: 'Billing',
    summary: 'Get billing cycle history',
    parameters: [qInt('orgId', true)],
    responses: { ...r200('Cycle history', { type: 'array', items: { type: 'object' } }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;
      const { billingProvider } = await import("../services/billing");

      let subscription = null;
      if (orgId) {
        subscription = await billingProvider.getSubscriptionForOrg(orgId);
        if (!subscription) {
          subscription = await billingProvider.createSubscription({ planCode: "FREE", orgId });
        }
      } else {
        subscription = await billingProvider.getSubscriptionForUser(userId);
        if (!subscription) {
          subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
        }
      }

      await billingProvider.getOrCreateBillingCycle(subscription.id);

      const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1);

      const allCycles = await db
        .select()
        .from(billingCycles)
        .where(eq(billingCycles.subscriptionId, subscription.id))
        .orderBy(desc(billingCycles.periodStart));

      const seenPeriods = new Set<string>();
      const cycles = allCycles.filter(cycle => {
        const key = `${cycle.periodStart}-${cycle.periodEnd}`;
        if (seenPeriods.has(key)) return false;
        seenPeriods.add(key);
        return true;
      });

      const result = [];
      for (const cycle of cycles) {
        const rollups = await db
          .select({
            meterCode: meters.code,
            includedUnits: usageRollups.includedUnits,
            usedUnits: usageRollups.usedUnits,
            remainingUnits: usageRollups.remainingUnits,
            overageUnits: usageRollups.overageUnits,
            overageCostMicrocents: usageRollups.overageCostMicrocents,
            hardCapHit: usageRollups.hardCapHit,
          })
          .from(usageRollups)
          .innerJoin(meters, eq(usageRollups.meterId, meters.id))
          .where(eq(usageRollups.billingCycleId, cycle.id));

        const convertedRollups = rollups.map(r => {
          if (r.meterCode === 'credits') {
            return {
              ...r,
              includedUnits: r.includedUnits / 100,
              usedUnits: r.usedUnits / 100,
              remainingUnits: r.remainingUnits / 100,
              overageUnits: r.overageUnits / 100,
            };
          }
          return r;
        });

        result.push({
          id: cycle.id,
          periodStart: cycle.periodStart,
          periodEnd: cycle.periodEnd,
          status: cycle.status,
          planName: plan?.name || "Unknown",
          usage: convertedRollups,
        });
      }

      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json(result);
    } catch (error) {
      console.error("Error fetching billing cycle history:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch billing cycle history" : classified.message });
    }
  });

  // Get credit usage ledger - detailed history of all credit transactions
  apiRoute(app, 'get', '/api/billing/credit-ledger', {
    tag: 'Billing',
    summary: 'Get credit ledger',
    parameters: [qInt('orgId', true)],
    responses: { ...r200('Credit ledger', ref('Plan')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;
      
      // Get subscription - if orgId is explicitly provided, only show that org's data (no fallback)
      const { billingProvider } = await import("../services/billing");
      let subscription = null;
      
      if (orgId) {
        subscription = await billingProvider.getSubscriptionForOrg(orgId);
        if (!subscription) {
          // Auto-create a free subscription for organizations without one
          subscription = await billingProvider.createSubscription({ planCode: "FREE", orgId });
        }
      } else {
        // No orgId provided - show user's personal subscription
        subscription = await billingProvider.getSubscriptionForUser(userId);
        if (!subscription) {
          // Auto-create a free subscription for new users
          subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
        }
      }

      // Query usage events for credits meter with user details
      const result = await db.select({
        id: usageEvents.id,
        units: usageEvents.units,
        requestId: usageEvents.requestId,
        occurredAt: usageEvents.occurredAt,
        createdAt: usageEvents.createdAt,
        actorUserId: usageEvents.actorUserId,
        meterCode: meters.code,
        meterName: meters.name,
      })
      .from(usageEvents)
      .innerJoin(meters, eq(usageEvents.meterId, meters.id))
      .where(
        and(
          eq(usageEvents.subscriptionId, subscription.id),
          eq(meters.code, 'credits')
        )
      )
      .orderBy(desc(usageEvents.occurredAt))
      .limit(limit)
      .offset(offset);

      // Get total count
      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(usageEvents)
        .innerJoin(meters, eq(usageEvents.meterId, meters.id))
        .where(
          and(
            eq(usageEvents.subscriptionId, subscription.id),
            eq(meters.code, 'credits')
          )
        );
      
      const total = countResult[0]?.count || 0;

      // Get user details for each entry
      const userIds = Array.from(new Set(result.map(e => e.actorUserId).filter((id): id is string => id !== null)));
      const users = await Promise.all(
        userIds.map(uid => storage.getUser(uid as string))
      );
      const userMap = new Map(
        users.filter(Boolean).map(u => [u!.id, u])
      );

      // Parse resource type from request_id (format: "project_123_timestamp")
      const parseResourceType = (requestId: string): { type: string; resourceId: string } => {
        const parts = requestId.split('_');
        if (parts.length >= 2) {
          return { type: parts[0], resourceId: parts[1] };
        }
        return { type: 'unknown', resourceId: requestId };
      };

      const entries = result.map(e => {
        const user = e.actorUserId ? userMap.get(e.actorUserId) : null;
        const { type, resourceId } = parseResourceType(e.requestId);
        return {
          id: e.id,
          creditsUsed: e.units / 100, // Convert from hundredths
          resourceType: type,
          resourceId,
          occurredAt: e.occurredAt,
          createdAt: e.createdAt,
          userId: e.actorUserId,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'System',
          userEmail: user?.email || null,
        };
      });

      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json({ entries, total: Number(total) });
    } catch (error) {
      console.error("Error fetching credit ledger:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch credit ledger" : classified.message });
    }
  });

  // Enterprise plan inquiry - sends email to both user and sales
  apiRoute(app, 'post', '/api/billing/enterprise-inquiry', {
    tag: 'Billing',
    summary: 'Submit enterprise plan inquiry',
    requestBody: body({ type: 'object', properties: { organizationId: { type: 'integer' }, message: { type: 'string' } } }),
    responses: { ...r201('Inquiry submitted', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { planName, organizationName } = req.body;
      
      if (!planName) {
        return res.status(400).json({ message: "Plan name is required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
      
      const { sendEnterpriseInquiryEmail } = await import("../services/email");
      const result = await sendEnterpriseInquiryEmail(
        user.email,
        userName,
        planName,
        organizationName
      );
      
      res.status(201).json({ 
        success: result.userSent || result.salesSent,
        userEmailSent: result.userSent,
        salesEmailSent: result.salesSent
      });
    } catch (error) {
      console.error("Error sending enterprise inquiry:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to send inquiry" : classified.message });
    }
  });

  // Create subscription
  apiRoute(app, 'post', '/api/billing/subscription', {
    tag: 'Billing',
    summary: 'Create new subscription',
    requestBody: body({ type: 'object', properties: { organizationId: { type: 'integer' }, planId: { type: 'integer' }, billingCycle: { type: 'string' } } }),
    responses: { ...r201('Subscription created', ref('Plan')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { planCode } = req.body;
      if (!planCode) {
        return res.status(400).json({ message: "Plan code is required" });
      }
      
      const { billingProvider } = await import("../services/billing");
      
      // Check if user already has a subscription
      const existing = await billingProvider.getSubscriptionForUser(userId);
      if (existing) {
        return res.status(400).json({ message: "User already has a subscription. Use PATCH to change plan." });
      }
      
      const subscription = await billingProvider.createSubscription({ planCode, userId });
      res.status(201).json(subscription);
    } catch (error) {
      console.error("Error creating subscription:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create subscription" : classified.message });
    }
  });

  // Change plan
  apiRoute(app, 'patch', '/api/billing/subscription/:id/plan', {
    tag: 'Billing',
    summary: 'Change subscription plan',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { planId: { type: 'integer' } } }),
    responses: { ...r200('Plan changed', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const subscriptionId = parseInt(req.params.id);
      const { planCode } = req.body;
      
      if (!planCode) {
        return res.status(400).json({ message: "Plan code is required" });
      }
      
      const { billingProvider } = await import("../services/billing");
      
      const subscription = await billingProvider.changePlan(subscriptionId, planCode, userId);
      res.json(subscription);
    } catch (error) {
      console.error("Error changing plan:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to change plan" : classified.message });
    }
  });

  // ============= ADMIN PLAN ROUTES =============

  // Create a new plan (super admin only)
  apiRoute(app, 'post', '/api/admin/plans', {
    tag: 'Billing',
    summary: 'Create a new plan',
    requestBody: body({ type: 'object', properties: { code: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, annualPriceCents: { type: 'integer' }, maxSeats: { type: 'integer' } } }),
    responses: { ...r201('Plan created', ref('Plan')), ...createRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans, meters, planMeterRules, features, planFeatures } = await import("@shared/schema");
      const { code, name, description, annualPriceCents, maxSeats } = req.body;

      if (!code || !name) {
        return res.status(400).json({ message: "Code and name are required" });
      }

      const existingPlan = await db.select().from(plans).where(eq(plans.code, code.toUpperCase())).limit(1);
      if (existingPlan.length > 0) {
        return res.status(400).json({ message: "Plan code already exists" });
      }

      const [newPlan] = await db.insert(plans).values({
        code: code.toUpperCase(),
        name,
        description: description || null,
        annualPriceCents: annualPriceCents || 0,
        maxSeats: maxSeats || null,
        isActive: true,
      }).returning();

      const allMeters = await db.select().from(meters);
      const meterRulesValues: any[] = [];
      
      for (const meter of allMeters) {
        meterRulesValues.push({
          planId: newPlan.id,
          meterId: meter.id,
          ruleType: "INCLUDED_QUOTA",
          includedUnitsAnnual: 10,
          isSharedPool: false,
        });
        meterRulesValues.push({
          planId: newPlan.id,
          meterId: meter.id,
          ruleType: "HARD_CAP",
          hardCapUnits: 10,
          isSharedPool: false,
        });
      }
      
      if (meterRulesValues.length > 0) {
        await db.insert(planMeterRules).values(meterRulesValues);
      }

      const allFeatures = await db.select().from(features);
      if (allFeatures.length > 0) {
        const featureValues = allFeatures.map(f => ({
          planId: newPlan.id,
          featureId: f.id,
          isEnabled: false,
        }));
        await db.insert(planFeatures).values(featureValues);
      }

      res.status(201).json(newPlan);
    } catch (error) {
      console.error("Error creating plan:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create plan" : classified.message });
    }
  });

  // Reorder plans (super admin only) - MUST be before :id route
  apiRoute(app, 'put', '/api/admin/plans/reorder', {
    tag: 'Billing',
    summary: 'Reorder plans',
    requestBody: body({ type: 'object', properties: { orderedIds: { type: 'array', items: { type: 'integer' } } } }),
    responses: { ...r200('Plans reordered', { type: 'object' }), ...stdRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans } = await import("@shared/schema");
      const { orderedIds } = req.body;
      
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ message: "orderedIds must be an array" });
      }

      for (let i = 0; i < orderedIds.length; i++) {
        await db.update(plans)
          .set({ displayOrder: i })
          .where(eq(plans.id, orderedIds[i]));
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering plans:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to reorder plans" : classified.message });
    }
  });

  // Update a plan (super admin only)
  apiRoute(app, 'put', '/api/admin/plans/:id', {
    tag: 'Billing',
    summary: 'Update a plan',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Plan updated', ref('Plan')), ...updateRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans } = await import("@shared/schema");
      const planId = parseInt(req.params.id);
      const { name, description, annualPriceCents, maxSeats, extraSeatPriceCents, isActive, paypalPlanId, paypalProductId } = req.body;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (annualPriceCents !== undefined) updates.annualPriceCents = annualPriceCents;
      if (maxSeats !== undefined) updates.maxSeats = maxSeats;
      if (extraSeatPriceCents !== undefined) updates.extraSeatPriceCents = extraSeatPriceCents;
      if (isActive !== undefined) updates.isActive = isActive;
      if (paypalPlanId !== undefined) updates.paypalPlanId = paypalPlanId;
      if (paypalProductId !== undefined) updates.paypalProductId = paypalProductId;

      const [updated] = await db.update(plans)
        .set(updates)
        .where(eq(plans.id, planId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating plan:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to update plan" : classified.message });
    }
  });

  // Initialize extra seat prices for plans (super admin only)
  apiRoute(app, 'post', '/api/admin/plans/init-extra-seat-prices', {
    tag: 'Billing',
    summary: 'Initialize extra seat prices',
    responses: { ...r200('Seat prices initialized', { type: 'object' }), ...stdRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans } = await import("@shared/schema");
      
      // Update Professional plan (code: BASIC) with $54/seat/year extra
      await db.update(plans)
        .set({ extraSeatPriceCents: 5400 })
        .where(eq(plans.code, 'BASIC'));
      
      // Update Business plan (code: TEAM) with $86.40/seat/year extra
      await db.update(plans)
        .set({ extraSeatPriceCents: 8640 })
        .where(eq(plans.code, 'TEAM'));

      // Update Enterprise plan with $64.80/seat/year extra
      await db.update(plans)
        .set({ extraSeatPriceCents: 6480 })
        .where(eq(plans.code, 'ENTERPRISE'));
      
      // Get updated plans
      const updatedPlans = await db.select().from(plans).orderBy(plans.displayOrder);
      
      res.json({ 
        message: "Extra seat prices initialized successfully",
        plans: updatedPlans.map(p => ({ 
          code: p.code, 
          name: p.name, 
          extraSeatPriceCents: p.extraSeatPriceCents 
        }))
      });
    } catch (error) {
      console.error("Error initializing extra seat prices:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to initialize extra seat prices" : classified.message });
    }
  });

  // Delete a plan (super admin only)
  apiRoute(app, 'delete', '/api/admin/plans/:id', {
    tag: 'Billing',
    summary: 'Delete a plan',
    parameters: [pathId()],
    responses: { ...r200('Plan deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans, planMeterRules, planFeatures, subscriptions } = await import("@shared/schema");
      const planId = parseInt(req.params.id);

      const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.planId, planId)).limit(1);
      if (existingSub) {
        return res.status(400).json({ message: "Cannot delete plan with active subscriptions. Deactivate it instead." });
      }

      await db.delete(planMeterRules).where(eq(planMeterRules.planId, planId));
      await db.delete(planFeatures).where(eq(planFeatures.planId, planId));
      await db.delete(plans).where(eq(plans.id, planId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting plan:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to delete plan" : classified.message });
    }
  });

  // Get plan meter rules
  apiRoute(app, 'get', '/api/admin/plans/:id/rules', {
    tag: 'Billing',
    summary: 'Get plan meter rules',
    parameters: [pathId()],
    responses: { ...r200('Plan rules', ref('Plan')), ...idRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!hasAdminAccess(user)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { planMeterRules, meters } = await import("@shared/schema");
      const planId = parseInt(req.params.id);

      const rules = await db.select({
        id: planMeterRules.id,
        planId: planMeterRules.planId,
        meterId: planMeterRules.meterId,
        ruleType: planMeterRules.ruleType,
        includedUnitsAnnual: planMeterRules.includedUnitsAnnual,
        hardCapUnits: planMeterRules.hardCapUnits,
        overageUnitPriceMicrocents: planMeterRules.overageUnitPriceMicrocents,
        isSharedPool: planMeterRules.isSharedPool,
        meter: {
          id: meters.id,
          code: meters.code,
          name: meters.name,
          unitLabel: meters.unitLabel,
        }
      })
      .from(planMeterRules)
      .innerJoin(meters, eq(planMeterRules.meterId, meters.id))
      .where(eq(planMeterRules.planId, planId));

      res.json(rules);
    } catch (error) {
      console.error("Error fetching plan rules:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch plan rules" : classified.message });
    }
  });

  // Create plan meter rule
  apiRoute(app, 'post', '/api/admin/plans/:planId/rules', {
    tag: 'Billing',
    summary: 'Create plan meter rule',
    parameters: [pathId('planId')],
    requestBody: body({ type: 'object', properties: { meterId: { type: 'integer' }, ruleType: { type: 'string' } } }),
    responses: { ...r201('Rule created', ref('Plan')), ...createRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { planMeterRules } = await import("@shared/schema");
      const planId = parseInt(req.params.planId);
      const { meterId, ruleType, includedUnitsAnnual, hardCapUnits, overageUnitPriceMicrocents, isSharedPool } = req.body;

      if (!meterId || !ruleType) {
        return res.status(400).json({ message: "meterId and ruleType are required" });
      }

      const [newRule] = await db.insert(planMeterRules)
        .values({
          planId,
          meterId,
          ruleType,
          includedUnitsAnnual: includedUnitsAnnual || null,
          hardCapUnits: hardCapUnits || null,
          overageUnitPriceMicrocents: overageUnitPriceMicrocents || null,
          isSharedPool: isSharedPool || false,
        })
        .returning();

      res.status(201).json(newRule);
    } catch (error) {
      console.error("Error creating rule:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create rule" : classified.message });
    }
  });

  // Update plan meter rule
  apiRoute(app, 'put', '/api/admin/plans/:planId/rules/:ruleId', {
    tag: 'Billing',
    summary: 'Update plan meter rule',
    parameters: [pathId('planId'), pathId('ruleId')],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Rule updated', ref('Plan')), ...updateRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { planMeterRules } = await import("@shared/schema");
      const ruleId = parseInt(req.params.ruleId);
      const { includedUnitsAnnual, hardCapUnits, overageUnitPriceMicrocents } = req.body;

      const updates: any = {};
      if (includedUnitsAnnual !== undefined) updates.includedUnitsAnnual = includedUnitsAnnual;
      if (hardCapUnits !== undefined) updates.hardCapUnits = hardCapUnits;
      if (overageUnitPriceMicrocents !== undefined) updates.overageUnitPriceMicrocents = overageUnitPriceMicrocents;

      const [updated] = await db.update(planMeterRules)
        .set(updates)
        .where(eq(planMeterRules.id, ruleId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating rule:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to update rule" : classified.message });
    }
  });

  // === CREDIT COST MANAGEMENT (Super Admin) ===
  
  // Get all credit costs
  apiRoute(app, 'get', '/api/admin/credit-costs', {
    tag: 'Billing',
    summary: 'Get all credit costs',
    responses: { ...r200('Credit costs', arrOf('Plan')), ...stdRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!hasAdminAccess(user)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { getAllCreditCosts } = await import("../services/billing");
      const costs = await getAllCreditCosts();
      
      // Return raw values for editing (in hundredths)
      res.json(costs);
    } catch (error) {
      console.error("Error fetching credit costs:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch credit costs" : classified.message });
    }
  });

  // Update a credit cost
  apiRoute(app, 'put', '/api/admin/credit-costs/:resourceType', {
    tag: 'Billing',
    summary: 'Update credit cost',
    parameters: [pathStr('resourceType')],
    requestBody: body({ type: 'object', properties: { creditCost: { type: 'integer' }, displayName: { type: 'string' }, description: { type: 'string' } } }),
    responses: { ...r200('Credit cost updated', ref('Plan')), ...updateRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { resourceType } = req.params;
      const { creditCost, displayName, description } = req.body;
      const { resourceCreditCosts } = await import("@shared/schema");
      
      if (creditCost === undefined || creditCost < 0) {
        return res.status(400).json({ message: "Invalid credit cost" });
      }

      const [updated] = await db.update(resourceCreditCosts)
        .set({ 
          creditCost: Math.round(creditCost),
          displayName: displayName || undefined,
          description: description || undefined,
          updatedAt: new Date(),
          updatedBy: userId
        })
        .where(eq(resourceCreditCosts.resourceType, resourceType))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Resource type not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating credit cost:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to update credit cost" : classified.message });
    }
  });

  // Get plan credits summary (for plan management UI)
  apiRoute(app, 'get', '/api/admin/plans/:id/credits', {
    tag: 'Billing',
    summary: 'Get plan credits summary',
    parameters: [pathId()],
    responses: { ...r200('Plan credits', ref('Plan')), ...idRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!hasAdminAccess(user)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { planMeterRules, meters } = await import("@shared/schema");
      const planId = parseInt(req.params.id);

      // Get credits meter
      const [creditsMeter] = await db.select().from(meters).where(eq(meters.code, "credits")).limit(1);
      
      if (!creditsMeter) {
        return res.json({ included: 0, hardCap: null });
      }

      const rules = await db.select()
        .from(planMeterRules)
        .where(and(
          eq(planMeterRules.planId, planId),
          eq(planMeterRules.meterId, creditsMeter.id)
        ));

      const quotaRule = rules.find((r) => r.ruleType === "INCLUDED_QUOTA");
      const hardCapRule = rules.find((r) => r.ruleType === "HARD_CAP");

      res.json({
        meterId: creditsMeter.id,
        included: quotaRule?.includedUnitsAnnual || 0,
        hardCap: hardCapRule?.hardCapUnits || null,
        quotaRuleId: quotaRule?.id,
        hardCapRuleId: hardCapRule?.id
      });
    } catch (error) {
      console.error("Error fetching plan credits:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch plan credits" : classified.message });
    }
  });

  // === PAYPAL ROUTES ===
  // Only register PayPal routes if credentials are configured
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    try {
      const { createPaypalOrder, capturePaypalOrder, loadPaypalDefault } = await import("../paypal");

      app.get("/paypal/setup", async (req, res) => {
        await loadPaypalDefault(req, res);
      });

      app.post("/paypal/order", async (req, res) => {
        await createPaypalOrder(req, res);
      });

      app.post("/paypal/order/:orderID/capture", async (req, res) => {
        await capturePaypalOrder(req, res);
      });
      
      
      // PayPal Subscription routes
      const { 
        createProduct, 
        createPlan, 
        createSubscription, 
        getSubscription, 
        cancelSubscription, 
        activateSubscription,
        listPlans: listPayPalPlans,
        getPayPalClientId 
      } = await import("../paypalSubscriptions");

      apiRoute(app, 'get', '/api/paypal/subscription/client-id', {
        tag: 'Billing',
        summary: 'Get PayPal client ID',
        responses: { ...r200('PayPal client ID', ref('Plan')), ...authRes },
      }, getPayPalClientId);
      apiRoute(app, 'post', '/api/paypal/subscription/product', {
        tag: 'Billing',
        summary: 'Create PayPal product',
        requestBody: body({ type: 'object' }),
        responses: { ...r201('Product created', ref('Plan')), ...createRes },
      }, createProduct);
      apiRoute(app, 'post', '/api/paypal/subscription/plan', {
        tag: 'Billing',
        summary: 'Create PayPal plan',
        requestBody: body({ type: 'object' }),
        responses: { ...r201('Plan created', ref('Plan')), ...createRes },
      }, createPlan);
      apiRoute(app, 'get', '/api/paypal/subscription/plans', {
        tag: 'Billing',
        summary: 'List PayPal plans',
        responses: { ...r200('PayPal plans', { type: 'object' }), ...authRes },
      }, listPayPalPlans);
      apiRoute(app, 'post', '/api/paypal/subscription/create', {
        tag: 'Billing',
        summary: 'Create PayPal subscription',
        requestBody: body({ type: 'object', properties: { planId: { type: 'string' } } }),
        responses: { ...r200('Subscription created', ref('Plan')), ...inputRes },
      }, createSubscription);
      apiRoute(app, 'get', '/api/paypal/subscription/:subscriptionId', {
        tag: 'Billing',
        summary: 'Get PayPal subscription details',
        parameters: [pathStr('subscriptionId')],
        responses: { ...r200('Subscription details', ref('Plan')), ...idRes },
      }, getSubscription);
      apiRoute(app, 'post', '/api/paypal/subscription/:subscriptionId/cancel', {
        tag: 'Billing',
        summary: 'Cancel PayPal subscription',
        parameters: [pathStr('subscriptionId')],
        responses: { ...r200('Subscription cancelled', { type: 'object' }), ...fullRes },
      }, cancelSubscription);
      apiRoute(app, 'post', '/api/paypal/subscription/:subscriptionId/activate', {
        tag: 'Billing',
        summary: 'Activate PayPal subscription',
        parameters: [pathStr('subscriptionId')],
        responses: { ...r200('Subscription activated', { type: 'object' }), ...fullRes },
      }, activateSubscription);
      
      // Get payment method from user's active PayPal subscription
      apiRoute(app, 'get', '/api/billing/payment-method', {
        tag: 'Billing',
        summary: 'Get payment method on file',
        parameters: [qInt('orgId', true)],
        responses: { ...r200('Payment method', ref('Plan')), ...authRes },
      }, async (req, res) => {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
          return res.status(401).json({ message: "Authentication required" });
        }
        
        try {
          const { billingProvider } = await import("../services/billing");
          const subscription = await billingProvider.getSubscriptionForUser(userId);
          
          if (!subscription?.paypalSubscriptionId) {
            return res.json({ hasPaymentMethod: false });
          }
          
          // Fetch PayPal subscription details
          const PAYPAL_API_BASE = process.env.NODE_ENV === "production"
            ? "https://api-m.paypal.com"
            : "https://api-m.sandbox.paypal.com";
          
          const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
          const tokenRes = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
          });
          
          if (!tokenRes.ok) {
            return res.json({ hasPaymentMethod: true, type: "paypal" });
          }
          
          const { access_token } = await tokenRes.json();
          
          const subRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscription.paypalSubscriptionId}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
          });
          
          if (!subRes.ok) {
            return res.json({ hasPaymentMethod: true, type: "paypal" });
          }
          
          const subData = await subRes.json();
          
          // Extract subscriber info
          const subscriber = subData.subscriber || {};
          const payerEmail = subscriber.email_address || null;
          const payerId = subscriber.payer_id || null;
          const payerName = subscriber.name ? `${subscriber.name.given_name || ""} ${subscriber.name.surname || ""}`.trim() : null;
          
          res.json({
            hasPaymentMethod: true,
            type: "paypal",
            email: payerEmail,
            payerId: payerId,
            name: payerName,
            status: subData.status,
          });
        } catch (error) {
          console.error("Error fetching payment method:", error);
          const classified = classifyError(error);
          res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch payment method" : classified.message });
        }
      });

      // Admin: Sync all billing plans to PayPal
      apiRoute(app, 'post', '/api/admin/paypal/sync-plans', {
        tag: 'Billing',
        summary: 'Sync billing plans to PayPal',
        responses: { ...r200('Plans synced', ref('Plan')), ...stdRes },
      }, async (req, res) => {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
          return res.status(401).json({ message: "Authentication required" });
        }

        const user = await storage.getUser(userId);
        if (user?.role !== "super_admin") {
          return res.status(403).json({ message: "Super admin access required" });
        }

        try {
          const { plans } = await import("@shared/schema");
          const allPlans = await db.select().from(plans);
          
          const PAYPAL_API_BASE = process.env.NODE_ENV === "production"
            ? "https://api-m.paypal.com"
            : "https://api-m.sandbox.paypal.com";

          const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
          const tokenRes = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
          });
          
          if (!tokenRes.ok) {
            const errorData = await tokenRes.json();
            console.error("PayPal auth failed:", errorData);
            return res.status(500).json({ message: "PayPal authentication failed", error: errorData });
          }
          const { access_token } = await tokenRes.json();

          // STEP 1: Fetch ALL existing plans from PayPal
          const existingPlansRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans?page_size=20&total_required=true`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
          });

          let paypalPlans: any[] = [];
          if (existingPlansRes.ok) {
            const data = await existingPlansRes.json();
            paypalPlans = data.plans || [];
          }

          // STEP 2: Fetch details for each PayPal plan to get pricing
          const paypalPlanDetails: any[] = [];
          for (const pp of paypalPlans) {
            if (pp.status === "ACTIVE") {
              try {
                const detailRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans/${pp.id}`, {
                  method: "GET",
                  headers: {
                    "Authorization": `Bearer ${access_token}`,
                    "Content-Type": "application/json",
                  },
                });
                if (detailRes.ok) {
                  const detail = await detailRes.json();
                  const billingCycle = detail.billing_cycles?.find((bc: any) => bc.tenure_type === "REGULAR");
                  const price = billingCycle?.pricing_scheme?.fixed_price?.value;
                  const intervalUnit = billingCycle?.frequency?.interval_unit ?? null;
                  const intervalCount = billingCycle?.frequency?.interval_count ?? null;
                  paypalPlanDetails.push({
                    id: pp.id,
                    name: pp.name,
                    status: pp.status,
                    product_id: detail.product_id,
                    price: price ? parseFloat(price) : null,
                    priceCents: price ? Math.round(parseFloat(price) * 100) : null,
                    intervalUnit,
                    intervalCount,
                  });
                }
              } catch (e) {
                console.error(`[PayPal Sync] Error fetching plan details for ${pp.id}:`, e);
              }
            }
          }

          // STEP 3: Match PayPal plans to database plans by price
          const results = [];
          let productId = paypalPlanDetails[0]?.product_id || allPlans.find(p => p.paypalProductId)?.paypalProductId;

          for (const dbPlan of allPlans) {
            if (!dbPlan.annualPriceCents || dbPlan.annualPriceCents === 0) {
              results.push({ planCode: dbPlan.code, status: "skipped", reason: "free_plan" });
              continue;
            }

            // Find matching PayPal plan by price AND yearly interval
            // (PayPal billing intervals are immutable, so monthly plans can never be reused for annual billing.)
            const matchingPaypalPlan = paypalPlanDetails.find(pp =>
              pp.priceCents === dbPlan.annualPriceCents &&
              pp.intervalUnit === "YEAR" &&
              (pp.intervalCount === 1 || pp.intervalCount == null)
            );
            
            if (matchingPaypalPlan) {
              // Update database with correct PayPal plan ID
              if (dbPlan.paypalPlanId !== matchingPaypalPlan.id) {
                await db.update(plans)
                  .set({ 
                    paypalPlanId: matchingPaypalPlan.id, 
                    paypalProductId: matchingPaypalPlan.product_id 
                  })
                  .where(eq(plans.id, dbPlan.id));
                results.push({ 
                  planCode: dbPlan.code, 
                  paypalPlanId: matchingPaypalPlan.id, 
                  status: "updated",
                  oldPaypalPlanId: dbPlan.paypalPlanId,
                  price: `$${(dbPlan.annualPriceCents / 100).toFixed(2)}`
                });
              } else {
                results.push({ 
                  planCode: dbPlan.code, 
                  paypalPlanId: dbPlan.paypalPlanId, 
                  status: "already_correct" 
                });
              }
            } else {
              // No matching plan found - need to create one
              
              // Create product if needed
              if (!productId) {
                const productRes = await fetch(`${PAYPAL_API_BASE}/v1/catalogs/products`, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${access_token}`,
                    "Content-Type": "application/json",
                    "PayPal-Request-Id": `product-fridayreport-${Date.now()}`,
                  },
                  body: JSON.stringify({
                    name: "FridayReport.AI Subscription",
                    description: "Project Portfolio Management subscription",
                    type: "SERVICE",
                    category: "SOFTWARE",
                  }),
                });
                
                if (productRes.ok) {
                  const product = await productRes.json();
                  productId = product.id;
                }
              }

              // Create the plan in PayPal
              const priceValue = (dbPlan.annualPriceCents / 100).toFixed(2);
              const planRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${access_token}`,
                  "Content-Type": "application/json",
                  "PayPal-Request-Id": `plan-${dbPlan.code}-${Date.now()}`,
                },
                body: JSON.stringify({
                  product_id: productId,
                  name: `${dbPlan.name} Plan`,
                  description: dbPlan.description || `${dbPlan.name} annual subscription`,
                  status: "ACTIVE",
                  billing_cycles: [{
                    frequency: { interval_unit: "YEAR", interval_count: 1 },
                    tenure_type: "REGULAR",
                    sequence: 1,
                    total_cycles: 0,
                    pricing_scheme: {
                      fixed_price: { value: priceValue, currency_code: "USD" },
                    },
                  }],
                  payment_preferences: {
                    auto_bill_outstanding: true,
                    setup_fee: { value: "0", currency_code: "USD" },
                    setup_fee_failure_action: "CONTINUE",
                    payment_failure_threshold: 3,
                  },
                }),
              });
              
              if (planRes.ok) {
                const paypalPlan = await planRes.json();
                await db.update(plans)
                  .set({ paypalPlanId: paypalPlan.id, paypalProductId: productId })
                  .where(eq(plans.id, dbPlan.id));
                results.push({ planCode: dbPlan.code, paypalPlanId: paypalPlan.id, status: "created" });
              } else {
                const errorData = await planRes.json();
                results.push({ planCode: dbPlan.code, error: errorData.message || "Failed to create plan", status: "error" });
              }
            }
          }

          res.json({ success: true, productId, paypalPlansFound: paypalPlanDetails.length, plans: results });
        } catch (error) {
          console.error("Failed to sync PayPal plans:", error);
          const classified = classifyError(error);
          res.status(classified.status).json({ message: classified.status === 500 ? "Failed to sync PayPal plans" : classified.message });
        }
      });

      // Update subscription with PayPal subscription ID
      apiRoute(app, 'post', '/api/billing/subscription/paypal', {
        tag: 'Billing',
        summary: 'Create PayPal subscription',
        requestBody: body({ type: 'object', properties: { organizationId: { type: 'integer' }, planId: { type: 'integer' }, subscriptionId: { type: 'string' } } }),
        responses: { ...r201('Subscription created', ref('Plan')), ...inputRes },
      }, async (req, res) => {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
          return res.status(401).json({ message: "Authentication required" });
        }

        try {
          const { planCode, paypalSubscriptionId, organizationId } = req.body;
          const { plans, subscriptions, billingCycles, usageRollups, meters, planMeterRules, organizationMembers } = await import("@shared/schema");
          
          if (!paypalSubscriptionId || typeof paypalSubscriptionId !== 'string') {
            return res.status(400).json({ message: "PayPal subscription ID is required" });
          }
          
          if (!organizationId || typeof organizationId !== 'number') {
            return res.status(400).json({ message: "Organization ID is required" });
          }
          
          // Verify user is an admin of the organization
          const [membership] = await db.select()
            .from(organizationMembers)
            .where(and(
              eq(organizationMembers.organizationId, organizationId),
              eq(organizationMembers.userId, userId)
            ));
          
          if (!membership || (membership.role !== 'org_admin' && membership.role !== 'owner')) {
            return res.status(403).json({ message: "Only organization admins can manage subscriptions" });
          }
          
          // Verify PayPal subscription and derive plan from PayPal's data (prevents plan spoofing)
          const PAYPAL_API_BASE = process.env.NODE_ENV === "production"
            ? "https://api-m.paypal.com"
            : "https://api-m.sandbox.paypal.com";
          
          const PAYPAL_CLIENT_ID = (process.env.PAYPAL_CLIENT_ID || "").trim();
          const PAYPAL_CLIENT_SECRET = (process.env.PAYPAL_CLIENT_SECRET || "").trim();
          
          let verifiedPlan: typeof plans.$inferSelect | null = null;
          
          if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
            // PayPal credentials not configured - require planCode as fallback
            const [requestedPlan] = await db.select().from(plans).where(eq(plans.code, planCode));
            if (!requestedPlan) {
              return res.status(404).json({ message: "Plan not found" });
            }
            if (requestedPlan.paypalPlanId) {
              // Plan requires PayPal verification but credentials missing
              console.error("PayPal credentials not configured, cannot verify subscription for PayPal-enabled plan");
              return res.status(500).json({ message: "Payment verification is not configured. Please contact support." });
            }
            verifiedPlan = requestedPlan;
          } else {
            // Verify subscription with PayPal API
            try {
              const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
              const tokenRes = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
                method: "POST",
                headers: {
                  "Authorization": `Basic ${auth}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: "grant_type=client_credentials",
              });
              
              if (!tokenRes.ok) {
                console.error("Failed to get PayPal access token:", await tokenRes.text());
        return res.status(500).json({ message: "Failed to authenticate with payment provider. Please try again." });
              }
              
              const tokenData = await tokenRes.json();
              
              const subRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${paypalSubscriptionId}`, {
                headers: {
                  "Authorization": `Bearer ${tokenData.access_token}`,
                  "Content-Type": "application/json",
                },
              });
              
              if (!subRes.ok) {
                console.error(`Failed to verify PayPal subscription ${paypalSubscriptionId}:`, await subRes.text());
                return res.status(400).json({ message: "Failed to verify PayPal subscription" });
              }
              
              const paypalSub = await subRes.json();
              
              // Verify the subscription is active/approved/pending
              // APPROVAL_PENDING: User approved but first payment not yet processed
              // APPROVED: User approved, awaiting activation
              // ACTIVE: Subscription is fully active
              const validStatuses = ['ACTIVE', 'APPROVED', 'APPROVAL_PENDING'];
              if (!validStatuses.includes(paypalSub.status)) {
                console.error(`PayPal subscription ${paypalSubscriptionId} has status ${paypalSub.status}, rejecting`);
                return res.status(400).json({ 
                  message: `PayPal subscription status is '${paypalSub.status}'. Expected: ACTIVE, APPROVED, or APPROVAL_PENDING.`,
                  status: paypalSub.status
                });
              }
              
              // Derive plan from PayPal's plan_id (server-side, ignore URL param to prevent spoofing)
              const paypalPlanIdFromSub = paypalSub.plan_id;
              
              if (paypalPlanIdFromSub) {
                const [matchingPlan] = await db.select().from(plans).where(eq(plans.paypalPlanId, paypalPlanIdFromSub));
                if (matchingPlan) {
                  verifiedPlan = matchingPlan;
                } else {
                  
                  // Return detailed error to help debug
                  const availablePlansList = await db.select().from(plans);
                  return res.status(400).json({
                    message: "PayPal plan ID not found in database. Please use 'Sync PayPal Plans' in Super Admin.",
                    paypalPlanId: paypalPlanIdFromSub,
                    availablePlans: availablePlansList.map((p: typeof plans.$inferSelect) => ({ code: p.code, paypalPlanId: p.paypalPlanId }))
                  });
                }
              }
              
              // If no matching plan found from PayPal, fall back to planCode
              if (!verifiedPlan && planCode) {
                const [requestedPlan] = await db.select().from(plans).where(eq(plans.code, planCode));
                if (requestedPlan) {
                  // Check if the plan's paypalPlanId matches what we got from PayPal
                  if (!requestedPlan.paypalPlanId) {
                    // Plan has no PayPal ID set, allow fallback
                    verifiedPlan = requestedPlan;
                  } else if (paypalPlanIdFromSub && requestedPlan.paypalPlanId !== paypalPlanIdFromSub) {
                    // Plan has a different paypalPlanId - this could be sandbox/live mismatch
                    console.error(`[PayPal Activation] Plan mismatch: ${planCode} has DB paypalPlanId=${requestedPlan.paypalPlanId} but PayPal returned ${paypalPlanIdFromSub}`);
                    console.error(`[PayPal Activation] This usually means the database has sandbox plan IDs but you're using live PayPal credentials, or vice versa.`);
                    return res.status(400).json({ 
                      message: "Subscription plan ID mismatch. Please contact support.",
                      details: "The payment was processed but the plan IDs don't match. Your payment is safe - contact support to activate your subscription."
                    });
                  } else {
                    verifiedPlan = requestedPlan;
                  }
                }
              }
            } catch (verifyError) {
              console.error("PayPal verification error:", verifyError);
              const classified = classifyError(verifyError);
              return res.status(classified.status).json({ message: classified.status === 500 ? "Failed to verify subscription with PayPal. Please try again." : classified.message });
            }
          }
          
          if (!verifiedPlan) {
            return res.status(404).json({ message: "Could not determine subscription plan" });
          }
          
          const plan = verifiedPlan;

          // Check if organization has existing subscription
          const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, organizationId));
          
          const now = new Date();
          const periodStart = now;
          const periodEnd = new Date(
            new Date(now).setFullYear(now.getFullYear() + 1),
          );

          const { billingTransactions } = await import("@shared/schema");

          if (existingSub) {
            // Update existing subscription
            await db.update(subscriptions)
              .set({ 
                planId: plan.id, 
                paypalSubscriptionId,
                status: "ACTIVE",
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
              })
              .where(eq(subscriptions.id, existingSub.id));

            // Close any existing OPEN billing cycle for this subscription so
            // usage on the new annual plan starts on a fresh cycle/rollups
            // matching the new plan's annual quotas.
            await db.update(billingCycles)
              .set({ status: "CLOSED" })
              .where(and(
                eq(billingCycles.subscriptionId, existingSub.id),
                eq(billingCycles.status, "OPEN"),
              ));

            const [newCycle] = await db.insert(billingCycles).values({
              subscriptionId: existingSub.id,
              periodStart,
              periodEnd,
              status: "OPEN",
            }).returning();

            const allMeters = await db.select().from(meters);
            const allRules = await db.select().from(planMeterRules).where(eq(planMeterRules.planId, plan.id));

            for (const meter of allMeters) {
              const rules = allRules.filter(r => r.meterId === meter.id);
              const includedQuota = rules.find(r => r.ruleType === "INCLUDED_QUOTA");

              await db.insert(usageRollups).values({
                billingCycleId: newCycle.id,
                meterId: meter.id,
                includedUnits: includedQuota?.includedUnitsAnnual || 0,
                usedUnits: 0,
                remainingUnits: includedQuota?.includedUnitsAnnual || 0,
                overageUnits: 0,
                overageCostMicrocents: 0,
                hardCapHit: false,
              });
            }

            // Record the initial subscription transaction
            if (plan.annualPriceCents && plan.annualPriceCents > 0) {
              await db.insert(billingTransactions).values({
                subscriptionId: existingSub.id,
                userId,
                orgId: organizationId,
                provider: "paypal",
                externalTransactionId: paypalSubscriptionId,
                amountCents: plan.annualPriceCents,
                currency: "USD",
                status: "COMPLETED",
                description: `${plan.name} subscription activated`,
                planName: plan.name,
                periodStart,
                periodEnd,
                paymentMethodType: "paypal",
                createdAt: now,
              });
            }
            
            res.json({ success: true, subscriptionId: existingSub.id, organizationId });
          } else {
            // Create new subscription for organization
            const [newSub] = await db.insert(subscriptions).values({
              planId: plan.id,
              orgId: organizationId,
              subjectType: "ORGANIZATION",
              status: "ACTIVE",
              paypalSubscriptionId,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            }).returning();

            // Create billing cycle and usage rollups
            const [cycle] = await db.insert(billingCycles).values({
              subscriptionId: newSub.id,
              periodStart,
              periodEnd,
              status: "OPEN",
            }).returning();

            const allMeters = await db.select().from(meters);
            const allRules = await db.select().from(planMeterRules).where(eq(planMeterRules.planId, plan.id));

            for (const meter of allMeters) {
              const rules = allRules.filter(r => r.meterId === meter.id);
              const includedQuota = rules.find(r => r.ruleType === "INCLUDED_QUOTA");
              
              await db.insert(usageRollups).values({
                billingCycleId: cycle.id,
                meterId: meter.id,
                includedUnits: includedQuota?.includedUnitsAnnual || 0,
                usedUnits: 0,
                remainingUnits: includedQuota?.includedUnitsAnnual || 0,
                overageUnits: 0,
                overageCostMicrocents: 0,
                hardCapHit: false,
              });
            }

            // Record the initial subscription transaction
            if (plan.annualPriceCents && plan.annualPriceCents > 0) {
              await db.insert(billingTransactions).values({
                subscriptionId: newSub.id,
                userId,
                orgId: organizationId,
                provider: "paypal",
                externalTransactionId: paypalSubscriptionId,
                amountCents: plan.annualPriceCents,
                currency: "USD",
                status: "COMPLETED",
                description: `${plan.name} subscription activated`,
                planName: plan.name,
                periodStart,
                periodEnd,
                paymentMethodType: "paypal",
                createdAt: now,
              });
            }

            res.status(201).json({ success: true, subscriptionId: newSub.id, organizationId });
          }
        } catch (error) {
          console.error("Failed to update subscription:", error);
          const classified = classifyError(error);
          res.status(classified.status).json({ message: classified.status === 500 ? "Failed to update subscription" : classified.message });
        }
      });

      // PayPal Webhook handler for recording payment transactions
      apiRoute(app, 'post', '/api/webhooks/paypal', {
        tag: 'Billing',
        summary: 'PayPal webhook handler',
        security: [],
        responses: { ...r200('Webhook processed', { type: 'object' }) },
      }, async (req, res) => {
        try {
          const { event_type, resource, create_time } = req.body;

          // Handle subscription payment events
          if (event_type === "PAYMENT.SALE.COMPLETED" || event_type === "BILLING.SUBSCRIPTION.PAYMENT.COMPLETED") {
            const paypalSubscriptionId = resource?.billing_agreement_id || resource?.id;
            const transactionId = resource?.id;
            const amount = resource?.amount?.total || resource?.gross_amount?.value;
            const currency = resource?.amount?.currency || resource?.gross_amount?.currency_code || "USD";
            
            if (paypalSubscriptionId && transactionId && amount) {
              const { subscriptions, plans, billingTransactions } = await import("@shared/schema");
              
              // Find the subscription by PayPal subscription ID
              const [subscription] = await db.select({
                sub: subscriptions,
                plan: plans,
              }).from(subscriptions)
                .leftJoin(plans, eq(subscriptions.planId, plans.id))
                .where(eq(subscriptions.paypalSubscriptionId, paypalSubscriptionId));
              
              if (subscription) {
                const amountCents = Math.round(parseFloat(amount) * 100);

                // Annual renewal: if the existing period has ended, advance the
                // subscription forward by one year and open a fresh billing cycle
                // + rollups so the recorded transaction lands on the new period.
                let activeSub = subscription.sub;
                const now = new Date();
                const periodEndDate = new Date(activeSub.currentPeriodEnd);
                if (now >= periodEndDate) {
                  const periodStartNew = periodEndDate;
                  const periodEndNew = new Date(
                    new Date(periodStartNew).setFullYear(periodStartNew.getFullYear() + 1),
                  );

                  const [updatedSub] = await db.update(subscriptions)
                    .set({
                      currentPeriodStart: periodStartNew,
                      currentPeriodEnd: periodEndNew,
                    })
                    .where(eq(subscriptions.id, activeSub.id))
                    .returning();
                  if (updatedSub) activeSub = updatedSub;

                  await db.update(billingCycles)
                    .set({ status: "CLOSED" })
                    .where(and(
                      eq(billingCycles.subscriptionId, activeSub.id),
                      eq(billingCycles.status, "OPEN"),
                    ));

                  const [renewedCycle] = await db.insert(billingCycles).values({
                    subscriptionId: activeSub.id,
                    periodStart: periodStartNew,
                    periodEnd: periodEndNew,
                    status: "OPEN",
                  }).returning();

                  if (renewedCycle && subscription.plan) {
                    const allMeters = await db.select().from(meters);
                    const allRules = await db.select().from(planMeterRules)
                      .where(eq(planMeterRules.planId, subscription.plan.id));
                    for (const meter of allMeters) {
                      const rules = allRules.filter(r => r.meterId === meter.id);
                      const includedQuota = rules.find(r => r.ruleType === "INCLUDED_QUOTA");
                      await db.insert(usageRollups).values({
                        billingCycleId: renewedCycle.id,
                        meterId: meter.id,
                        includedUnits: includedQuota?.includedUnitsAnnual || 0,
                        usedUnits: 0,
                        remainingUnits: includedQuota?.includedUnitsAnnual || 0,
                        overageUnits: 0,
                        overageCostMicrocents: 0,
                        hardCapHit: false,
                      });
                    }
                  }
                }

                // Check if we already recorded this transaction (idempotency)
                const [existingTx] = await db.select().from(billingTransactions)
                  .where(eq(billingTransactions.externalTransactionId, transactionId));
                
                if (!existingTx) {
                  // Record the payment transaction
                  await db.insert(billingTransactions).values({
                    subscriptionId: activeSub.id,
                    userId: activeSub.userId,
                    orgId: activeSub.orgId,
                    provider: "paypal",
                    externalTransactionId: transactionId,
                    amountCents,
                    currency: currency.toUpperCase(),
                    status: "COMPLETED",
                    description: `${subscription.plan?.name || 'Subscription'} payment`,
                    planName: subscription.plan?.name,
                    periodStart: activeSub.currentPeriodStart,
                    periodEnd: activeSub.currentPeriodEnd,
                    paymentMethodType: "paypal",
                    metadata: { event_type, resource_id: resource?.id },
                    createdAt: new Date(create_time || Date.now()),
                  });
                }
              }
            }
          }
          
          // Handle failed payment events
          if (event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED" || event_type === "PAYMENT.SALE.DENIED") {
            const paypalSubscriptionId = resource?.billing_agreement_id || resource?.id;
            const transactionId = resource?.id;
            const amount = resource?.amount?.total || resource?.gross_amount?.value;
            const currency = resource?.amount?.currency || resource?.gross_amount?.currency_code || "USD";
            const failureReason = resource?.status_details?.reason || "Payment failed";
            
            if (paypalSubscriptionId && transactionId) {
              const { subscriptions, plans, billingTransactions } = await import("@shared/schema");
              
              const [subscription] = await db.select({
                sub: subscriptions,
                plan: plans,
              }).from(subscriptions)
                .leftJoin(plans, eq(subscriptions.planId, plans.id))
                .where(eq(subscriptions.paypalSubscriptionId, paypalSubscriptionId));
              
              if (subscription) {
                const amountCents = amount ? Math.round(parseFloat(amount) * 100) : 0;
                
                await db.insert(billingTransactions).values({
                  subscriptionId: subscription.sub.id,
                  userId: subscription.sub.userId,
                  orgId: subscription.sub.orgId,
                  provider: "paypal",
                  externalTransactionId: transactionId,
                  amountCents,
                  currency: currency?.toUpperCase() || "USD",
                  status: "FAILED",
                  description: `Failed payment for ${subscription.plan?.name || 'Subscription'}`,
                  planName: subscription.plan?.name,
                  failureReason,
                  paymentMethodType: "paypal",
                  metadata: { event_type, resource_id: resource?.id },
                  createdAt: new Date(create_time || Date.now()),
                });
              }
            }
          }

          // Always respond 200 to acknowledge receipt
          res.status(200).json({ received: true });
        } catch (error) {
          console.error("[PayPal Webhook] Error processing webhook:", error);
          // Still return 200 to avoid PayPal retries on non-critical errors
          res.status(200).json({ received: true, error: "Processing error logged" });
        }
      });

    } catch (error) {
      console.warn("[routes] PayPal routes not registered - credentials may be invalid:", error);
    }
  }


}
