CREATE TABLE IF NOT EXISTS "cross_project_references" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "reference_type" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" integer NOT NULL,
  "source_project_id" integer NOT NULL REFERENCES "projects"("id"),
  "target_type" text NOT NULL,
  "target_id" integer NOT NULL,
  "target_project_id" integer NOT NULL REFERENCES "projects"("id"),
  "relationship_type" text NOT NULL,
  "notes" text,
  "created_by" varchar REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cross_project_refs_org_idx" ON "cross_project_references" ("organization_id");
CREATE INDEX IF NOT EXISTS "cross_project_refs_source_idx" ON "cross_project_references" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "cross_project_refs_target_idx" ON "cross_project_references" ("target_type", "target_id");
