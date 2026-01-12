import { sql, relations } from "drizzle-orm";
import { pgTable, serial, text, integer, boolean, timestamp, varchar, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";

export const planCodeEnum = ["FREE", "BASIC", "TEAM"] as const;
export type PlanCode = typeof planCodeEnum[number];

export const meterCodeEnum = ["ai_runs", "documents", "projects", "tasks"] as const;
export type MeterCode = typeof meterCodeEnum[number];

export const ruleTypeEnum = ["INCLUDED_QUOTA", "HARD_CAP", "METERED_OVERAGE"] as const;
export type RuleType = typeof ruleTypeEnum[number];

export const aggregationTypeEnum = ["COUNT", "GAUGE"] as const;
export type AggregationType = typeof aggregationTypeEnum[number];

export const subscriptionStatusEnum = ["ACTIVE", "PAST_DUE", "CANCELED", "TRIALING"] as const;
export type SubscriptionStatus = typeof subscriptionStatusEnum[number];

export const subjectTypeEnum = ["USER", "ORG"] as const;
export type SubjectType = typeof subjectTypeEnum[number];

export const billingCycleStatusEnum = ["OPEN", "CLOSED"] as const;
export type BillingCycleStatus = typeof billingCycleStatusEnum[number];

export const invoiceStatusEnum = ["DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE"] as const;
export type InvoiceStatus = typeof invoiceStatusEnum[number];

export const memberRoleEnum = ["OWNER", "ADMIN", "MEMBER"] as const;
export type MemberRole = typeof memberRoleEnum[number];

export const memberStatusEnum = ["INVITED", "ACTIVE"] as const;
export type MemberStatus = typeof memberStatusEnum[number];

export const referralStatusEnum = ["PENDING", "SIGNED_UP", "CONVERTED", "PAID_OUT"] as const;
export type ReferralStatus = typeof referralStatusEnum[number];

export const payoutStatusEnum = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type PayoutStatus = typeof payoutStatusEnum[number];

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  monthlyPriceCents: integer("monthly_price_cents").default(0),
  isActive: boolean("is_active").default(true),
  stripePriceId: text("stripe_price_id"),
  stripeProductId: text("stripe_product_id"),
  paypalPlanId: text("paypal_plan_id"),
  paypalProductId: text("paypal_product_id"),
  maxSeats: integer("max_seats"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const meters = pgTable("meters", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  unitLabel: text("unit_label").notNull(),
  aggregationType: text("aggregation_type").notNull().default("COUNT"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const planMeterRules = pgTable("plan_meter_rules", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").references(() => plans.id).notNull(),
  meterId: integer("meter_id").references(() => meters.id).notNull(),
  ruleType: text("rule_type").notNull(),
  includedUnitsMonthly: integer("included_units_monthly"),
  hardCapUnits: integer("hard_cap_units"),
  overageUnitPriceMicrocents: integer("overage_unit_price_microcents"),
  isSharedPool: boolean("is_shared_pool").default(false),
  stripeMeterId: text("stripe_meter_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const features = pgTable("features", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const planFeatures = pgTable("plan_features", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").references(() => plans.id).notNull(),
  featureId: integer("feature_id").references(() => features.id).notNull(),
  isEnabled: boolean("is_enabled").default(true),
  limitsJson: jsonb("limits_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").references(() => plans.id).notNull(),
  status: text("status").notNull().default("ACTIVE"),
  subjectType: text("subject_type").notNull(),
  userId: varchar("user_id").references(() => users.id),
  orgId: integer("org_id"),
  hardCapEnabled: boolean("hard_cap_enabled").default(false),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  paypalSubscriptionId: text("paypal_subscription_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_subscriptions_user_id").on(table.userId),
  index("idx_subscriptions_org_id").on(table.orgId),
]);

export const seatAssignments = pgTable("seat_assignments", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const billingCycles = pgTable("billing_cycles", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: text("status").notNull().default("OPEN"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_billing_cycles_subscription_id").on(table.subscriptionId),
]);

export const usageEvents = pgTable("usage_events", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id).notNull(),
  billingCycleId: integer("billing_cycle_id").references(() => billingCycles.id).notNull(),
  meterId: integer("meter_id").references(() => meters.id).notNull(),
  units: integer("units").notNull().default(1),
  actorUserId: varchar("actor_user_id").references(() => users.id),
  orgId: integer("org_id"),
  requestId: text("request_id").notNull().unique(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_usage_events_billing_cycle").on(table.billingCycleId),
  index("idx_usage_events_meter").on(table.meterId),
  uniqueIndex("idx_usage_events_request_id").on(table.requestId),
]);

export const usageRollups = pgTable("usage_rollups", {
  id: serial("id").primaryKey(),
  billingCycleId: integer("billing_cycle_id").references(() => billingCycles.id).notNull(),
  meterId: integer("meter_id").references(() => meters.id).notNull(),
  includedUnits: integer("included_units").notNull().default(0),
  usedUnits: integer("used_units").notNull().default(0),
  remainingUnits: integer("remaining_units").notNull().default(0),
  overageUnits: integer("overage_units").notNull().default(0),
  overageCostMicrocents: integer("overage_cost_microcents").notNull().default(0),
  hardCapHit: boolean("hard_cap_hit").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const invoiceRecords = pgTable("invoice_records", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id).notNull(),
  billingCycleId: integer("billing_cycle_id").references(() => billingCycles.id),
  providerInvoiceId: text("provider_invoice_id"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull().default("DRAFT"),
  hostedInvoiceUrl: text("hosted_invoice_url"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const paymentEvents = pgTable("payment_events", {
  id: serial("id").primaryKey(),
  providerEventId: text("provider_event_id").notNull().unique(),
  type: text("type").notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  receivedAt: timestamp("received_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_payment_events_provider_id").on(table.providerEventId),
]);

export const billingAuditLogs = pgTable("billing_audit_logs", {
  id: serial("id").primaryKey(),
  actorUserId: varchar("actor_user_id").references(() => users.id),
  orgId: integer("org_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_billing_audit_logs_actor").on(table.actorUserId),
  index("idx_billing_audit_logs_entity").on(table.entityType, table.entityId),
]);

export const plansRelations = relations(plans, ({ many }) => ({
  meterRules: many(planMeterRules),
  features: many(planFeatures),
  subscriptions: many(subscriptions),
}));

export const metersRelations = relations(meters, ({ many }) => ({
  rules: many(planMeterRules),
  usageEvents: many(usageEvents),
  rollups: many(usageRollups),
}));

export const planMeterRulesRelations = relations(planMeterRules, ({ one }) => ({
  plan: one(plans, {
    fields: [planMeterRules.planId],
    references: [plans.id],
  }),
  meter: one(meters, {
    fields: [planMeterRules.meterId],
    references: [meters.id],
  }),
}));

export const featuresRelations = relations(features, ({ many }) => ({
  planFeatures: many(planFeatures),
}));

export const planFeaturesRelations = relations(planFeatures, ({ one }) => ({
  plan: one(plans, {
    fields: [planFeatures.planId],
    references: [plans.id],
  }),
  feature: one(features, {
    fields: [planFeatures.featureId],
    references: [features.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  billingCycles: many(billingCycles),
  usageEvents: many(usageEvents),
  invoices: many(invoiceRecords),
}));

export const billingCyclesRelations = relations(billingCycles, ({ one, many }) => ({
  subscription: one(subscriptions, {
    fields: [billingCycles.subscriptionId],
    references: [subscriptions.id],
  }),
  usageEvents: many(usageEvents),
  rollups: many(usageRollups),
  invoices: many(invoiceRecords),
}));

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [usageEvents.subscriptionId],
    references: [subscriptions.id],
  }),
  billingCycle: one(billingCycles, {
    fields: [usageEvents.billingCycleId],
    references: [billingCycles.id],
  }),
  meter: one(meters, {
    fields: [usageEvents.meterId],
    references: [meters.id],
  }),
  actor: one(users, {
    fields: [usageEvents.actorUserId],
    references: [users.id],
  }),
}));

export const usageRollupsRelations = relations(usageRollups, ({ one }) => ({
  billingCycle: one(billingCycles, {
    fields: [usageRollups.billingCycleId],
    references: [billingCycles.id],
  }),
  meter: one(meters, {
    fields: [usageRollups.meterId],
    references: [meters.id],
  }),
}));

export const invoiceRecordsRelations = relations(invoiceRecords, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [invoiceRecords.subscriptionId],
    references: [subscriptions.id],
  }),
  billingCycle: one(billingCycles, {
    fields: [invoiceRecords.billingCycleId],
    references: [billingCycles.id],
  }),
}));

export const seatAssignmentsRelations = relations(seatAssignments, ({ one }) => ({
  user: one(users, {
    fields: [seatAssignments.userId],
    references: [users.id],
  }),
}));

// Referral Program Tables

export const referralCodes = pgTable("referral_codes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  code: text("code").notNull().unique(),
  commissionPercent: integer("commission_percent").notNull().default(10),
  isActive: boolean("is_active").default(true),
  totalReferrals: integer("total_referrals").default(0),
  totalEarningsCents: integer("total_earnings_cents").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_referral_codes_user_id").on(table.userId),
  uniqueIndex("idx_referral_codes_code").on(table.code),
]);

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referralCodeId: integer("referral_code_id").references(() => referralCodes.id).notNull(),
  referrerId: varchar("referrer_id").references(() => users.id).notNull(),
  referredUserId: varchar("referred_user_id").references(() => users.id),
  referredEmail: text("referred_email"),
  status: text("status").notNull().default("PENDING"),
  signedUpAt: timestamp("signed_up_at"),
  convertedAt: timestamp("converted_at"),
  conversionAmountCents: integer("conversion_amount_cents"),
  commissionAmountCents: integer("commission_amount_cents"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_referrals_referrer_id").on(table.referrerId),
  index("idx_referrals_referred_user_id").on(table.referredUserId),
  index("idx_referrals_code_id").on(table.referralCodeId),
]);

export const referralPayouts = pgTable("referral_payouts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("PENDING"),
  paypalEmail: text("paypal_email"),
  paypalTransactionId: text("paypal_transaction_id"),
  processedAt: timestamp("processed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_referral_payouts_user_id").on(table.userId),
]);

export const referralCodesRelations = relations(referralCodes, ({ one, many }) => ({
  user: one(users, {
    fields: [referralCodes.userId],
    references: [users.id],
  }),
  referrals: many(referrals),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referralCode: one(referralCodes, {
    fields: [referrals.referralCodeId],
    references: [referralCodes.id],
  }),
  referrer: one(users, {
    fields: [referrals.referrerId],
    references: [users.id],
  }),
}));

export const referralPayoutsRelations = relations(referralPayouts, ({ one }) => ({
  user: one(users, {
    fields: [referralPayouts.userId],
    references: [users.id],
  }),
}));

export const insertPlanSchema = createInsertSchema(plans).omit({ id: true, createdAt: true });
export const insertMeterSchema = createInsertSchema(meters).omit({ id: true, createdAt: true });
export const insertPlanMeterRuleSchema = createInsertSchema(planMeterRules).omit({ id: true, createdAt: true });
export const insertFeatureSchema = createInsertSchema(features).omit({ id: true, createdAt: true });
export const insertPlanFeatureSchema = createInsertSchema(planFeatures).omit({ id: true, createdAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true });
export const insertBillingCycleSchema = createInsertSchema(billingCycles).omit({ id: true, createdAt: true });
export const insertUsageEventSchema = createInsertSchema(usageEvents).omit({ id: true, createdAt: true });
export const insertUsageRollupSchema = createInsertSchema(usageRollups).omit({ id: true, updatedAt: true });
export const insertInvoiceRecordSchema = createInsertSchema(invoiceRecords).omit({ id: true, createdAt: true });
export const insertSeatAssignmentSchema = createInsertSchema(seatAssignments).omit({ id: true, createdAt: true });

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Meter = typeof meters.$inferSelect;
export type InsertMeter = z.infer<typeof insertMeterSchema>;
export type PlanMeterRule = typeof planMeterRules.$inferSelect;
export type InsertPlanMeterRule = z.infer<typeof insertPlanMeterRuleSchema>;
export type Feature = typeof features.$inferSelect;
export type InsertFeature = z.infer<typeof insertFeatureSchema>;
export type PlanFeature = typeof planFeatures.$inferSelect;
export type InsertPlanFeature = z.infer<typeof insertPlanFeatureSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type BillingCycle = typeof billingCycles.$inferSelect;
export type InsertBillingCycle = z.infer<typeof insertBillingCycleSchema>;
export type UsageEvent = typeof usageEvents.$inferSelect;
export type InsertUsageEvent = z.infer<typeof insertUsageEventSchema>;
export type UsageRollup = typeof usageRollups.$inferSelect;
export type InsertUsageRollup = z.infer<typeof insertUsageRollupSchema>;
export type InvoiceRecord = typeof invoiceRecords.$inferSelect;
export type InsertInvoiceRecord = z.infer<typeof insertInvoiceRecordSchema>;
export type SeatAssignment = typeof seatAssignments.$inferSelect;
export type InsertSeatAssignment = z.infer<typeof insertSeatAssignmentSchema>;

export const insertReferralCodeSchema = createInsertSchema(referralCodes).omit({ id: true, createdAt: true });
export const insertReferralSchema = createInsertSchema(referrals).omit({ id: true, createdAt: true });
export const insertReferralPayoutSchema = createInsertSchema(referralPayouts).omit({ id: true, createdAt: true });

export type ReferralCode = typeof referralCodes.$inferSelect;
export type InsertReferralCode = z.infer<typeof insertReferralCodeSchema>;
export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type ReferralPayout = typeof referralPayouts.$inferSelect;
export type InsertReferralPayout = z.infer<typeof insertReferralPayoutSchema>;
