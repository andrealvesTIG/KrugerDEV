-- Per-reply credit tracking for Friday assistant messages.
-- Stores hundredths of a credit (matching the credit_usage_ledger units) so
-- the chat indicator can show exactly what the Billing ledger recorded for
-- the same reply. NULL for legacy rows and user messages — the UI hides the
-- indicator on null/zero values, so leaving older messages untouched is safe.

ALTER TABLE "friday_messages" ADD COLUMN IF NOT EXISTS "credits_used" integer;
