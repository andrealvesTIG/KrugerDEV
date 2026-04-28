-- Workflow step email notifications: per-step recipient lists for intake
-- workflow steps. Sent from PUT /api/project-intakes/:id and the approve
-- flow whenever an intake's currentStep changes.
ALTER TABLE "intake_workflow_steps"
  ADD COLUMN IF NOT EXISTS "notify_on_entry" text[];
ALTER TABLE "intake_workflow_steps"
  ADD COLUMN IF NOT EXISTS "notify_on_exit" text[];
