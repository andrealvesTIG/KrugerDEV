-- Custom AI agents (chat + scheduled): user-defined agents alongside Friday,
-- Power BI Request, and Project Agent. Mirrors shared/schema.ts.

CREATE TABLE IF NOT EXISTS "custom_agents" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "created_by" varchar NOT NULL REFERENCES "users"("id"),
  "type" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "icon" text DEFAULT 'Bot',
  "system_prompt" text NOT NULL,
  "model" text NOT NULL DEFAULT 'gpt-4o-mini',
  "data_scope" jsonb NOT NULL DEFAULT '{"type":"org"}'::jsonb,
  "allowed_tools" text[] NOT NULL DEFAULT '{}'::text[],
  "visibility" text NOT NULL DEFAULT 'private',
  "enabled" boolean NOT NULL DEFAULT true,
  "schedule_day" integer,
  "schedule_time" text,
  "timezone" text DEFAULT 'America/New_York',
  "recipient_emails" text[],
  "email_subject" text,
  "last_run" timestamp,
  "next_run" timestamp,
  "archived_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "custom_agents_org_idx" ON "custom_agents" ("organization_id");
CREATE INDEX IF NOT EXISTS "custom_agents_creator_idx" ON "custom_agents" ("created_by");
CREATE INDEX IF NOT EXISTS "custom_agents_next_run_idx" ON "custom_agents" ("next_run");

CREATE TABLE IF NOT EXISTS "custom_agent_members" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL REFERENCES "custom_agents"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "custom_agent_members_unique"
  ON "custom_agent_members" ("agent_id", "user_id");

CREATE TABLE IF NOT EXISTS "custom_agent_conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL REFERENCES "custom_agents"("id") ON DELETE CASCADE,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text,
  "archived_at" timestamp,
  "last_message_at" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "custom_agent_conversations_user_idx"
  ON "custom_agent_conversations" ("agent_id", "user_id", "last_message_at");

CREATE TABLE IF NOT EXISTS "custom_agent_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversation_id" integer NOT NULL
    REFERENCES "custom_agent_conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "attachments" jsonb,
  "page_context" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "custom_agent_messages_conv_idx"
  ON "custom_agent_messages" ("conversation_id", "created_at");

CREATE TABLE IF NOT EXISTS "custom_agent_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL REFERENCES "custom_agents"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "subject" text,
  "recipient_emails" text[],
  "email_preview" text,
  "error_message" text,
  "triggered_by" varchar,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "custom_agent_logs_agent_idx"
  ON "custom_agent_logs" ("agent_id", "created_at");
