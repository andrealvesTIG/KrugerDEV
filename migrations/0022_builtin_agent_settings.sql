-- Per-agent platform-level settings for the three built-in agents
-- (Friday, Power BI Request, Project Agent). Singleton row per agent_key.
-- Lets super admins disable a built-in agent globally and/or override the
-- default system prompt and model.

CREATE TABLE IF NOT EXISTS "builtin_agent_settings" (
  "agent_key" text PRIMARY KEY NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "default_system_prompt" text,
  "default_model" text,
  "updated_by" varchar REFERENCES "users"("id"),
  "updated_at" timestamp DEFAULT now()
);

INSERT INTO "builtin_agent_settings" ("agent_key", "enabled")
VALUES ('friday', true), ('powerbi', true), ('project_agent', true)
ON CONFLICT ("agent_key") DO NOTHING;
