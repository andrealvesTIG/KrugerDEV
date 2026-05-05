-- Friday Conversation onboarding flag — keeps an adopted public-preview
-- chat in Onboarding Agent mode for every subsequent reply, even after
-- page reloads and even on accounts whose org is no longer "empty".
--
-- Set by /api/jarvis/guest/adopt when migrating a guest transcript into
-- a real friday_conversations row, and read by the chat endpoint to OR
-- onto the per-request `forceOnboarding` flag before resolving the
-- system prompt in jarvisService. Defaults to false so the column is
-- inert for every existing conversation and for chats started by the
-- normal "+ New chat" button.

ALTER TABLE "friday_conversations"
  ADD COLUMN IF NOT EXISTS "is_onboarding" boolean NOT NULL DEFAULT false;
