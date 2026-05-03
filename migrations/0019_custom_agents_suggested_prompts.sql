-- Per-agent starter prompt cards: 4 short questions auto-generated from the
-- agent's systemPrompt at create/update time. Nullable so existing rows stay
-- valid until the next regeneration.

ALTER TABLE "custom_agents" ADD COLUMN IF NOT EXISTS "suggested_prompts" text[];
