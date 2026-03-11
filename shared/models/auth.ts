import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, text, boolean } from "drizzle-orm/pg-core";

// Session storage table for express-session
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table with email/password authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  
  // Custom fields added
  role: varchar("role").default("user"), // 'super_admin', 'user' (org-level roles are in organization_members)
  username: varchar("username").unique(),
  avatarUrl: varchar("avatar_url"),
  
  // Onboarding state
  onboardingCompleted: boolean("onboarding_completed").default(false),
  detectedCompany: varchar("detected_company"),
  detectedIndustry: varchar("detected_industry"),
  signupSource: varchar("signup_source"),

  // Microsoft 365 authentication
  microsoftId: varchar("microsoft_id").unique(), // Azure AD object ID (oid)
  microsoftTenantId: varchar("microsoft_tenant_id"), // Azure AD tenant ID (tid)

  // Google authentication
  googleId: varchar("google_id").unique(), // Google sub claim

  // API Key for external integrations (Power BI, etc.)
  apiKey: varchar("api_key").unique(),

  // Deactivation support
  deactivatedAt: timestamp("deactivated_at"),
  deactivatedBy: varchar("deactivated_by"),

  // Email verification
  emailVerified: boolean("email_verified").default(false),
  emailVerificationToken: varchar("email_verification_token"),
  emailVerificationExpiry: timestamp("email_verification_expiry"),

  // Professional credentials
  jobTitle: varchar("job_title"),
  pmiId: varchar("pmi_id"),
  linkedinUrl: varchar("linkedin_url"),
  publicProfileEnabled: boolean("public_profile_enabled").default(false),

  // Technician flag (managed by super admins only)
  isTechnician: boolean("is_technician").default(false),

  // Terms of Service and Privacy Policy consent
  termsAcceptedAt: timestamp("terms_accepted_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// Magic link tokens table for passwordless sign-up and sign-in
export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull(),
  token: varchar("token").notNull().unique(),
  type: varchar("type").default("signup"), // 'signup', 'signin', or 'resource_invite'
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  metadata: text("metadata"), // JSON string with additional context (e.g., organizationId, resourceId for resource_invite)
  createdAt: timestamp("created_at").defaultNow(),
});

export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
