-- Per-attempt log of outbound notification deliveries. Records which provider
-- (graph/smtp/resend) was used for each sendEmail call, the result, and minimal
-- metadata for diagnosis. Bodies, attachments and other sensitive content are
-- intentionally not stored.
CREATE TABLE IF NOT EXISTS "email_delivery_log" (
  "id" serial PRIMARY KEY,
  "recipient" text NOT NULL,
  "subject" text NOT NULL,
  "provider" text NOT NULL,
  "status" text NOT NULL,
  "error_message" text,
  "message_id" text,
  "cc_count" integer NOT NULL DEFAULT 0,
  "has_attachments" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "email_delivery_log_provider_check"
    CHECK ("provider" IN ('graph', 'smtp', 'resend')),
  CONSTRAINT "email_delivery_log_status_check"
    CHECK ("status" IN ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS "email_delivery_log_created_at_idx"
  ON "email_delivery_log" ("created_at");
CREATE INDEX IF NOT EXISTS "email_delivery_log_provider_idx"
  ON "email_delivery_log" ("provider");
CREATE INDEX IF NOT EXISTS "email_delivery_log_status_idx"
  ON "email_delivery_log" ("status");
