import { db } from "./db";
import { plans, meters, planMeterRules, features, planFeatures } from "@shared/schema";

async function seedBilling() {
  console.log("Seeding billing data...");

  const existingPlans = await db.select().from(plans);
  if (existingPlans.length > 0) {
    console.log("Billing data already seeded. Skipping...");
    return;
  }

  const [freePlan, basicPlan, teamPlan] = await db.insert(plans).values([
    { code: "FREE", name: "Free", description: "Basic access with limited usage" },
    { code: "BASIC", name: "Basic", description: "For individuals and small teams", maxSeats: 1 },
    { code: "TEAM", name: "Team", description: "For organizations with shared usage pools", maxSeats: 25 },
  ]).returning();

  console.log("Created plans:", { freePlan, basicPlan, teamPlan });

  const [aiRunsMeter, documentsMeter, projectsMeter, tasksMeter] = await db.insert(meters).values([
    { code: "ai_runs", name: "AI Runs", unitLabel: "run", aggregationType: "COUNT" },
    { code: "documents", name: "Documents", unitLabel: "document", aggregationType: "COUNT" },
    { code: "projects", name: "Projects", unitLabel: "project", aggregationType: "GAUGE" },
    { code: "tasks", name: "Tasks", unitLabel: "task", aggregationType: "COUNT" },
  ]).returning();

  console.log("Created meters:", { aiRunsMeter, documentsMeter, projectsMeter, tasksMeter });

  await db.insert(planMeterRules).values([
    { planId: freePlan.id, meterId: aiRunsMeter.id, ruleType: "INCLUDED_QUOTA", includedUnitsMonthly: 25 },
    { planId: freePlan.id, meterId: aiRunsMeter.id, ruleType: "HARD_CAP", hardCapUnits: 25 },
    { planId: freePlan.id, meterId: documentsMeter.id, ruleType: "INCLUDED_QUOTA", includedUnitsMonthly: 50 },
    { planId: freePlan.id, meterId: documentsMeter.id, ruleType: "HARD_CAP", hardCapUnits: 50 },
    { planId: freePlan.id, meterId: projectsMeter.id, ruleType: "HARD_CAP", hardCapUnits: 3 },
    { planId: freePlan.id, meterId: tasksMeter.id, ruleType: "HARD_CAP", hardCapUnits: 200 },

    { planId: basicPlan.id, meterId: aiRunsMeter.id, ruleType: "INCLUDED_QUOTA", includedUnitsMonthly: 500 },
    { planId: basicPlan.id, meterId: aiRunsMeter.id, ruleType: "METERED_OVERAGE", overageUnitPriceMicrocents: 20000 },
    { planId: basicPlan.id, meterId: documentsMeter.id, ruleType: "INCLUDED_QUOTA", includedUnitsMonthly: 1000 },
    { planId: basicPlan.id, meterId: documentsMeter.id, ruleType: "METERED_OVERAGE", overageUnitPriceMicrocents: 5000 },
    { planId: basicPlan.id, meterId: projectsMeter.id, ruleType: "HARD_CAP", hardCapUnits: 20 },
    { planId: basicPlan.id, meterId: tasksMeter.id, ruleType: "HARD_CAP", hardCapUnits: 10000 },

    { planId: teamPlan.id, meterId: aiRunsMeter.id, ruleType: "INCLUDED_QUOTA", includedUnitsMonthly: 2500, isSharedPool: true },
    { planId: teamPlan.id, meterId: aiRunsMeter.id, ruleType: "METERED_OVERAGE", overageUnitPriceMicrocents: 15000, isSharedPool: true },
    { planId: teamPlan.id, meterId: documentsMeter.id, ruleType: "INCLUDED_QUOTA", includedUnitsMonthly: 5000, isSharedPool: true },
    { planId: teamPlan.id, meterId: documentsMeter.id, ruleType: "METERED_OVERAGE", overageUnitPriceMicrocents: 4000, isSharedPool: true },
    { planId: teamPlan.id, meterId: projectsMeter.id, ruleType: "HARD_CAP", hardCapUnits: 100, isSharedPool: true },
    { planId: teamPlan.id, meterId: tasksMeter.id, ruleType: "HARD_CAP", hardCapUnits: 50000, isSharedPool: true },
  ]);

  console.log("Created plan meter rules");

  const [orgsFeature, invitesFeature, advancedFeature, apiAccessFeature, customBrandingFeature] = await db.insert(features).values([
    { code: "ORGS_ENABLED", name: "Organizations", description: "Create and manage organizations" },
    { code: "INVITES_ENABLED", name: "Team Invites", description: "Invite team members" },
    { code: "ADVANCED_ANALYTICS", name: "Advanced Analytics", description: "Access to advanced analytics dashboards" },
    { code: "API_ACCESS", name: "API Access", description: "Programmatic API access" },
    { code: "CUSTOM_BRANDING", name: "Custom Branding", description: "White-label and custom branding options" },
  ]).returning();

  console.log("Created features");

  await db.insert(planFeatures).values([
    { planId: freePlan.id, featureId: orgsFeature.id, isEnabled: false },
    { planId: freePlan.id, featureId: invitesFeature.id, isEnabled: false },
    { planId: freePlan.id, featureId: advancedFeature.id, isEnabled: false },
    { planId: freePlan.id, featureId: apiAccessFeature.id, isEnabled: false },
    { planId: freePlan.id, featureId: customBrandingFeature.id, isEnabled: false },

    { planId: basicPlan.id, featureId: orgsFeature.id, isEnabled: false },
    { planId: basicPlan.id, featureId: invitesFeature.id, isEnabled: false },
    { planId: basicPlan.id, featureId: advancedFeature.id, isEnabled: true },
    { planId: basicPlan.id, featureId: apiAccessFeature.id, isEnabled: true },
    { planId: basicPlan.id, featureId: customBrandingFeature.id, isEnabled: false },

    { planId: teamPlan.id, featureId: orgsFeature.id, isEnabled: true },
    { planId: teamPlan.id, featureId: invitesFeature.id, isEnabled: true },
    { planId: teamPlan.id, featureId: advancedFeature.id, isEnabled: true },
    { planId: teamPlan.id, featureId: apiAccessFeature.id, isEnabled: true },
    { planId: teamPlan.id, featureId: customBrandingFeature.id, isEnabled: true },
  ]);

  console.log("Created plan features");
  console.log("Billing seed completed successfully!");
}

seedBilling()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error seeding billing data:", error);
    process.exit(1);
  });
