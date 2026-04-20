ALTER TABLE "intake_workflows" ADD COLUMN IF NOT EXISTS "creation_mode" text DEFAULT 'dialog' NOT NULL;
ALTER TABLE "intake_workflows" ADD COLUMN IF NOT EXISTS "creation_url" text;
ALTER TABLE "project_workflows" ADD COLUMN IF NOT EXISTS "creation_mode" text DEFAULT 'dialog' NOT NULL;
ALTER TABLE "project_workflows" ADD COLUMN IF NOT EXISTS "creation_url" text;
