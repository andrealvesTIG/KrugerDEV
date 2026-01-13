import { db } from "./db";
import { plans, meters, planMeterRules, features, planFeatures } from "@shared/schema";

async function seedBilling() {
  console.log("Seeding billing data...");

  const existingPlans = await db.select().from(plans);
  if (existingPlans.length > 0) {
    console.log("Billing data already seeded. Skipping...");
    return;
  }

  const [freePlan, professionalPlan, businessPlan, enterprisePlan] = await db.insert(plans).values([
    { code: "FREE", name: "Free", description: "Start your project management journey with essential tools. Perfect for individuals and small projects exploring structured delivery.", monthlyPriceCents: 0 },
    { code: "BASIC", name: "Professional", description: "Elevate your project management with advanced tracking, reporting, and team collaboration. Ideal for growing teams managing multiple initiatives.", maxSeats: 3, monthlyPriceCents: 1200 },
    { code: "TEAM", name: "Business", description: "Enterprise-grade portfolio management with unlimited team members, advanced analytics, resource planning, and priority support for scaling organizations.", maxSeats: 25, monthlyPriceCents: 2800 },
    { code: "ENTERPRISE", name: "Enterprise", description: "Tailored solutions for global enterprises with dedicated success management, custom integrations, SSO/SAML, advanced security, and unlimited capacity.", maxSeats: null, monthlyPriceCents: null },
  ]).returning();

  console.log("Created plans:", { freePlan, professionalPlan, businessPlan, enterprisePlan });

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

    { planId: professionalPlan.id, meterId: aiRunsMeter.id, ruleType: "INCLUDED_QUOTA", includedUnitsMonthly: 500 },
    { planId: professionalPlan.id, meterId: aiRunsMeter.id, ruleType: "METERED_OVERAGE", overageUnitPriceMicrocents: 20000 },
    { planId: professionalPlan.id, meterId: documentsMeter.id, ruleType: "INCLUDED_QUOTA", includedUnitsMonthly: 1000 },
    { planId: professionalPlan.id, meterId: documentsMeter.id, ruleType: "METERED_OVERAGE", overageUnitPriceMicrocents: 5000 },
    { planId: professionalPlan.id, meterId: projectsMeter.id, ruleType: "HARD_CAP", hardCapUnits: 20 },
    { planId: professionalPlan.id, meterId: tasksMeter.id, ruleType: "HARD_CAP", hardCapUnits: 10000 },

    { planId: businessPlan.id, meterId: aiRunsMeter.id, ruleType: "INCLUDED_QUOTA", includedUnitsMonthly: 2500, isSharedPool: true },
    { planId: businessPlan.id, meterId: aiRunsMeter.id, ruleType: "METERED_OVERAGE", overageUnitPriceMicrocents: 15000, isSharedPool: true },
    { planId: businessPlan.id, meterId: documentsMeter.id, ruleType: "INCLUDED_QUOTA", includedUnitsMonthly: 5000, isSharedPool: true },
    { planId: businessPlan.id, meterId: documentsMeter.id, ruleType: "METERED_OVERAGE", overageUnitPriceMicrocents: 4000, isSharedPool: true },
    { planId: businessPlan.id, meterId: projectsMeter.id, ruleType: "HARD_CAP", hardCapUnits: 100, isSharedPool: true },
    { planId: businessPlan.id, meterId: tasksMeter.id, ruleType: "HARD_CAP", hardCapUnits: 50000, isSharedPool: true },

    { planId: enterprisePlan.id, meterId: aiRunsMeter.id, ruleType: "INCLUDED_QUOTA", includedUnitsMonthly: 100000, isSharedPool: true },
    { planId: enterprisePlan.id, meterId: documentsMeter.id, ruleType: "INCLUDED_QUOTA", includedUnitsMonthly: 100000, isSharedPool: true },
    { planId: enterprisePlan.id, meterId: projectsMeter.id, ruleType: "HARD_CAP", hardCapUnits: 10000, isSharedPool: true },
    { planId: enterprisePlan.id, meterId: tasksMeter.id, ruleType: "HARD_CAP", hardCapUnits: 1000000, isSharedPool: true },
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

    { planId: professionalPlan.id, featureId: orgsFeature.id, isEnabled: false },
    { planId: professionalPlan.id, featureId: invitesFeature.id, isEnabled: false },
    { planId: professionalPlan.id, featureId: advancedFeature.id, isEnabled: true },
    { planId: professionalPlan.id, featureId: apiAccessFeature.id, isEnabled: true },
    { planId: professionalPlan.id, featureId: customBrandingFeature.id, isEnabled: false },

    { planId: businessPlan.id, featureId: orgsFeature.id, isEnabled: true },
    { planId: businessPlan.id, featureId: invitesFeature.id, isEnabled: true },
    { planId: businessPlan.id, featureId: advancedFeature.id, isEnabled: true },
    { planId: businessPlan.id, featureId: apiAccessFeature.id, isEnabled: true },
    { planId: businessPlan.id, featureId: customBrandingFeature.id, isEnabled: true },

    { planId: enterprisePlan.id, featureId: orgsFeature.id, isEnabled: true },
    { planId: enterprisePlan.id, featureId: invitesFeature.id, isEnabled: true },
    { planId: enterprisePlan.id, featureId: advancedFeature.id, isEnabled: true },
    { planId: enterprisePlan.id, featureId: apiAccessFeature.id, isEnabled: true },
    { planId: enterprisePlan.id, featureId: customBrandingFeature.id, isEnabled: true },
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
