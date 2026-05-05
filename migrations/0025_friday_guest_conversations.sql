-- Friday Guest Conversations — public /ai preview transcript store.
-- Holds the lightweight, anonymous transcripts produced by visitors who
-- try Friday before signing in. The 2-question cap is enforced via
-- question_count (UPDATE ... WHERE question_count < limit RETURNING), so
-- concurrent guest requests can't slip past the cap. After the visitor
-- signs in, /api/jarvis/guest/adopt migrates the transcript into a real
-- friday_conversations row and stamps adopted_at so the public endpoint
-- refuses any further use of that session id.

CREATE TABLE IF NOT EXISTS "friday_guest_conversations" (
  "id" serial PRIMARY KEY,
  "guest_session_id" varchar(64) NOT NULL UNIQUE,
  "question_count" integer NOT NULL DEFAULT 0,
  "ip_hash" varchar(64),
  "user_agent" text,
  "messages" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "pending_question" text,
  "adopted_at" timestamp,
  "adopted_by_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "adopted_conversation_id" integer REFERENCES "friday_conversations"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "friday_guest_conv_session_idx"
  ON "friday_guest_conversations" ("guest_session_id");

-- Used by the per-IP defense-in-depth cap, which sums question_count
-- over rows for a given hashed IP within a 24-hour window.
CREATE INDEX IF NOT EXISTS "friday_guest_conv_created_idx"
  ON "friday_guest_conversations" ("created_at");
