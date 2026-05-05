-- Backfill migration for the `guest_question_limit` column on
-- `builtin_agent_settings`. The column was added to `shared/schema.ts`
-- in an earlier change (super-admin per-agent guest cap override on
-- the Friday built-in) but the corresponding migration file was never
-- shipped. Dev environments picked it up via `drizzle-kit push`; this
-- file ensures production / freshly migrated environments get the
-- column too so the super-admin Agents tab and getGuestQuestionLimit()
-- don't crash on `column "guest_question_limit" does not exist`.
--
-- Nullable on purpose: NULL means "use the platform default
-- DEFAULT_GUEST_QUESTION_LIMIT", which is what
-- server/storage/builtinAgentSettingsStorage.ts already reads back.

ALTER TABLE "builtin_agent_settings"
  ADD COLUMN IF NOT EXISTS "guest_question_limit" integer;
