-- Per-message metadata for Friday/custom-agent chat messages.
-- Currently used to record which quick-reply chip the user picked on an
-- assistant message so the chips on that bubble can render with the
-- chosen option highlighted (and the others muted) on page reload or
-- when the user revisits the conversation later.
--
-- jsonb to leave room for forward-compatible per-message UI state without
-- another migration. NULL on legacy rows and on every assistant message
-- where no chip was clicked — the UI treats null/missing as "no
-- selection yet" and renders the chips in their default unselected
-- state.

ALTER TABLE "friday_messages" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE "custom_agent_messages" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
