-- Power BI Agent: persistent conversations & messages
-- Adds two tables to back the agent History drawer + read-only resume.
-- Schema mirrors shared/schema.ts (powerbiAgentConversations / powerbiAgentMessages).

CREATE TABLE IF NOT EXISTS "powerbi_agent_conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text,
  "model" text DEFAULT 'fast',
  "submitted_intake_id" integer,
  "archived_at" timestamp,
  "last_message_at" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pbi_agent_conv_user_idx"
  ON "powerbi_agent_conversations" ("user_id", "last_message_at");
CREATE INDEX IF NOT EXISTS "pbi_agent_conv_org_idx"
  ON "powerbi_agent_conversations" ("organization_id");

CREATE TABLE IF NOT EXISTS "powerbi_agent_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversation_id" integer NOT NULL
    REFERENCES "powerbi_agent_conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "attachments" jsonb,
  "options" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pbi_agent_msg_conv_idx"
  ON "powerbi_agent_messages" ("conversation_id", "created_at");
