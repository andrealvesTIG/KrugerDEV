-- Task #25: LinkedIn enrichment cache + AI follow-up draft history
-- Additive only; safe to run on environments that already have db:push applied.

CREATE TABLE IF NOT EXISTS "user_enrichment" (
  "user_id" varchar PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "source" text,
  "status" text DEFAULT 'ok',
  "error_message" text,
  "linkedin_url" text,
  "headline" text,
  "current_role" text,
  "current_company" text,
  "current_company_industry" text,
  "location" text,
  "photo_url" text,
  "recent_positions" jsonb,
  "raw_payload" jsonb,
  "fetched_at" timestamp DEFAULT NOW(),
  "updated_at" timestamp DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "user_followup_drafts" (
  "id" serial PRIMARY KEY,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "author_id" varchar REFERENCES "users"("id"),
  "author_name" text,
  "tone" text DEFAULT 'friendly',
  "subject" text,
  "content" text NOT NULL,
  "status" text DEFAULT 'draft',
  "meta" jsonb,
  "created_at" timestamp DEFAULT NOW(),
  "updated_at" timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "user_followup_drafts_user_idx"
  ON "user_followup_drafts" ("user_id", "created_at");
