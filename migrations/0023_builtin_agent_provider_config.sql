-- Adds a structured per-built-in-agent provider config blob so super
-- admins can set platform-default credentials (Friday Azure / OpenAI,
-- Power BI Anthropic). NULL means "fall back to env-var defaults".
ALTER TABLE "builtin_agent_settings"
  ADD COLUMN IF NOT EXISTS "provider_config" jsonb;
