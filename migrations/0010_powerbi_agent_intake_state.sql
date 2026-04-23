-- Power BI Agent: persistent intake-state snapshot per conversation
-- Stores the live extracted intake field values so the right-hand "Request Summary"
-- panel renders instantly when a conversation is loaded.
ALTER TABLE "powerbi_agent_conversations"
  ADD COLUMN IF NOT EXISTS "intake_state" jsonb;
