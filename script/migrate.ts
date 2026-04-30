import pg from "pg";

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("No DATABASE_URL found, skipping migration");
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const migrations: string[] = [
    `ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS is_custom boolean DEFAULT false`,
    `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS risk_assessment_config jsonb`,

    `CREATE TABLE IF NOT EXISTS custom_portfolio_projects (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
      project_id INTEGER NOT NULL REFERENCES projects(id),
      added_at TIMESTAMP DEFAULT NOW(),
      added_by VARCHAR REFERENCES users(id)
    )`,

    `CREATE UNIQUE INDEX IF NOT EXISTS custom_portfolio_projects_unique 
     ON custom_portfolio_projects (portfolio_id, project_id)`,

    `CREATE TABLE IF NOT EXISTS portfolio_risk_assessments (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      risk_score INTEGER NOT NULL,
      summary TEXT NOT NULL,
      report_json TEXT NOT NULL,
      share_token TEXT NOT NULL,
      generated_by VARCHAR REFERENCES users(id),
      generated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS project_risk_assessments (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      risk_score INTEGER NOT NULL,
      summary TEXT NOT NULL,
      report_json TEXT NOT NULL,
      share_token TEXT NOT NULL,
      generated_by VARCHAR REFERENCES users(id),
      generated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    // === MISSING INDEXES ON FOREIGN KEY COLUMNS ===

    // Tasks indexes
    `CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_owner_id ON tasks (owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks (parent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status)`,

    // Issues indexes (covers both issues and risks)
    `CREATE INDEX IF NOT EXISTS idx_issues_project_id ON issues (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_issues_item_type ON issues (item_type)`,
    `CREATE INDEX IF NOT EXISTS idx_issues_assignee_id ON issues (assignee_id)`,
    `CREATE INDEX IF NOT EXISTS idx_issues_owner_id ON issues (owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_issues_status ON issues (status)`,

    // Milestones indexes
    `CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_milestones_owner_id ON milestones (owner_id)`,

    // Resources indexes
    `CREATE INDEX IF NOT EXISTS idx_resources_organization_id ON resources (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resources_user_id ON resources (user_id)`,

    // Task resource assignments indexes
    `CREATE INDEX IF NOT EXISTS idx_task_resource_assignments_task_id ON task_resource_assignments (task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_task_resource_assignments_resource_id ON task_resource_assignments (resource_id)`,

    // Issue resource assignments indexes
    `CREATE INDEX IF NOT EXISTS idx_issue_resource_assignments_issue_id ON issue_resource_assignments (issue_id)`,
    `CREATE INDEX IF NOT EXISTS idx_issue_resource_assignments_resource_id ON issue_resource_assignments (resource_id)`,

    // Notifications indexes
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_organization_id ON notifications (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications (is_read)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at)`,

    // Project comments indexes
    `CREATE INDEX IF NOT EXISTS idx_project_comments_project_id ON project_comments (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_project_comments_author_id ON project_comments (author_id)`,

    // Timesheet entries indexes
    `CREATE INDEX IF NOT EXISTS idx_timesheet_entries_organization_id ON timesheet_entries (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_timesheet_entries_user_id ON timesheet_entries (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_timesheet_entries_task_id ON timesheet_entries (task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_timesheet_entries_project_id ON timesheet_entries (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_timesheet_entries_entry_date ON timesheet_entries (entry_date)`,
    `CREATE INDEX IF NOT EXISTS idx_timesheet_entries_status ON timesheet_entries (status)`,

    // Project documents indexes
    `CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON project_documents (project_id)`,

    // Change requests indexes
    `CREATE INDEX IF NOT EXISTS idx_change_requests_project_id ON change_requests (project_id)`,

    // Cost items indexes
    `CREATE INDEX IF NOT EXISTS idx_cost_items_project_id ON cost_items (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cost_items_parent_id ON cost_items (parent_id)`,

    // Project financials indexes
    `CREATE INDEX IF NOT EXISTS idx_project_financials_project_id ON project_financials (project_id)`,

    // Billable status comments indexes
    `CREATE INDEX IF NOT EXISTS idx_billable_status_comments_project_id ON billable_status_comments (project_id)`,

    // Health status history indexes
    `CREATE INDEX IF NOT EXISTS idx_health_status_history_project_id ON health_status_history (project_id)`,

    // Project invoices indexes
    `CREATE INDEX IF NOT EXISTS idx_project_invoices_project_id ON project_invoices (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_project_invoices_organization_id ON project_invoices (organization_id)`,

    // Invoice notes indexes
    `CREATE INDEX IF NOT EXISTS idx_invoice_notes_invoice_id ON invoice_notes (invoice_id)`,

    // Task change logs indexes
    `CREATE INDEX IF NOT EXISTS idx_task_change_logs_task_id ON task_change_logs (task_id)`,

    // Project change logs indexes
    `CREATE INDEX IF NOT EXISTS idx_project_change_logs_project_id ON project_change_logs (project_id)`,

    // Issue change logs indexes
    `CREATE INDEX IF NOT EXISTS idx_issue_change_logs_issue_id ON issue_change_logs (issue_id)`,

    // Task dependencies indexes
    `CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies (task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies (depends_on_task_id)`,

    // Projects indexes
    `CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_projects_portfolio_id ON projects (portfolio_id)`,
    `CREATE INDEX IF NOT EXISTS idx_projects_manager_id ON projects (manager_id)`,
    `CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status)`,

    // Portfolios indexes
    `CREATE INDEX IF NOT EXISTS idx_portfolios_organization_id ON portfolios (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_portfolios_manager_id ON portfolios (manager_id)`,

    // Organization members indexes
    `CREATE INDEX IF NOT EXISTS idx_org_members_organization_id ON organization_members (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members (user_id)`,

    // Project intakes indexes
    `CREATE INDEX IF NOT EXISTS idx_project_intakes_organization_id ON project_intakes (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_project_intakes_submitter_id ON project_intakes (submitter_id)`,

    // Status report history indexes
    `CREATE INDEX IF NOT EXISTS idx_status_report_history_project_id ON status_report_history (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_status_report_history_organization_id ON status_report_history (organization_id)`,

    // Custom dashboards indexes
    `CREATE INDEX IF NOT EXISTS idx_custom_dashboards_organization_id ON custom_dashboards (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_custom_dashboards_user_id ON custom_dashboards (user_id)`,

    // Project views indexes
    `CREATE INDEX IF NOT EXISTS idx_project_views_organization_id ON project_views (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_project_views_user_id ON project_views (user_id)`,

    // Custom field definitions indexes
    `CREATE INDEX IF NOT EXISTS idx_custom_field_defs_organization_id ON custom_field_definitions (organization_id)`,

    // Project custom field values indexes
    `CREATE INDEX IF NOT EXISTS idx_project_custom_field_values_project_id ON project_custom_field_values (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_project_custom_field_values_field_def_id ON project_custom_field_values (field_definition_id)`,

    // Lessons learned indexes
    `CREATE INDEX IF NOT EXISTS idx_lessons_learned_project_id ON lessons_learned (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_lessons_learned_organization_id ON lessons_learned (organization_id)`,

    // Project scoring indexes
    `CREATE INDEX IF NOT EXISTS idx_project_scores_project_id ON project_scores (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_project_scores_criteria_id ON project_scores (criteria_id)`,
    `CREATE INDEX IF NOT EXISTS idx_project_scoring_criteria_org_id ON project_scoring_criteria (organization_id)`,

    // Project benefits indexes
    `CREATE INDEX IF NOT EXISTS idx_project_benefits_project_id ON project_benefits (project_id)`,

    // Project decisions indexes
    `CREATE INDEX IF NOT EXISTS idx_project_decisions_project_id ON project_decisions (project_id)`,

    // Simulation indexes
    `CREATE INDEX IF NOT EXISTS idx_simulation_runs_organization_id ON simulation_runs (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_simulation_events_run_id ON simulation_events (simulation_run_id)`,
    `CREATE INDEX IF NOT EXISTS idx_simulation_snapshots_run_id ON simulation_snapshots (simulation_run_id)`,

    // Report subscriptions indexes
    `CREATE INDEX IF NOT EXISTS idx_report_subscriptions_user_id ON report_subscriptions (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_report_subscriptions_organization_id ON report_subscriptions (organization_id)`,

    // Resource availability indexes
    `CREATE INDEX IF NOT EXISTS idx_resource_availability_resource_id ON resource_availability (resource_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_availability_org_id ON resource_availability (organization_id)`,

    // Resource skills indexes
    `CREATE INDEX IF NOT EXISTS idx_resource_skills_resource_id ON resource_skills (resource_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_skills_org_id ON resource_skills (organization_id)`,

    // Organization integrations indexes
    `CREATE INDEX IF NOT EXISTS idx_org_integrations_org_id ON organization_integrations (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_org_integrations_type ON organization_integrations (integration_type)`,

    // External shares indexes
    `CREATE INDEX IF NOT EXISTS idx_external_shares_source_org ON external_shares (source_organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_external_shares_shared_user ON external_shares (shared_with_user_id)`,

    // Help tickets indexes
    `CREATE INDEX IF NOT EXISTS idx_help_tickets_user_id ON help_tickets (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_help_tickets_organization_id ON help_tickets (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_help_tickets_status ON help_tickets (status)`,

    // API request logs indexes
    `CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON api_request_logs (created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_api_request_logs_user_id ON api_request_logs (user_id)`,

    // User activity logs indexes
    `CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs (created_at)`,

    // Non-project time entries indexes
    `CREATE INDEX IF NOT EXISTS idx_non_project_time_org_id ON non_project_time_entries (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_non_project_time_user_id ON non_project_time_entries (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_non_project_time_resource_id ON non_project_time_entries (resource_id)`,

    // Timesheet periods indexes
    `CREATE INDEX IF NOT EXISTS idx_timesheet_periods_org_id ON timesheet_periods (organization_id)`,

    // MPP imports indexes
    `CREATE INDEX IF NOT EXISTS idx_mpp_imports_organization_id ON mpp_imports (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_mpp_import_tasks_import_id ON mpp_import_tasks (import_id)`,

    // User consents indexes
    `CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents (user_id)`,

    // Organization invites indexes
    `CREATE INDEX IF NOT EXISTS idx_org_invites_organization_id ON organization_invites (organization_id)`,

    // Organization access requests indexes
    `CREATE INDEX IF NOT EXISTS idx_org_access_requests_organization_id ON organization_access_requests (organization_id)`,

    // Portfolio risk assessments indexes
    `CREATE INDEX IF NOT EXISTS idx_portfolio_risk_assessments_portfolio_id ON portfolio_risk_assessments (portfolio_id)`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_risk_assessments_org_id ON portfolio_risk_assessments (organization_id)`,

    // Project risk assessments indexes
    `CREATE INDEX IF NOT EXISTS idx_project_risk_assessments_project_id ON project_risk_assessments (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_project_risk_assessments_org_id ON project_risk_assessments (organization_id)`,

    // === ENCRYPTED TOKEN COLUMNS FOR INTEGRATION SECURITY ===
    `ALTER TABLE organization_integrations ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT`,
    `ALTER TABLE organization_integrations ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT`,
    `ALTER TABLE organization_integrations DROP COLUMN IF EXISTS tokens_encrypted`,

    // Clean up orphaned parent_id references (no FK constraint — enforced at app level)
    `UPDATE tasks SET parent_id = NULL WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM tasks)`,

    // Drop the FK constraint if it exists from a previous migration attempt
    `ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_parent_id_tasks_id_fk`,


    // Backfill milestones.organization_id from projects
    `ALTER TABLE milestones ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id)`,
    `ALTER TABLE milestones ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE milestones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    `UPDATE milestones SET organization_id = p.organization_id FROM projects p WHERE milestones.project_id = p.id AND milestones.organization_id IS NULL`,

    // Milestones indexes
    `CREATE INDEX IF NOT EXISTS idx_milestones_organization_id ON milestones (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_milestones_owner_id ON milestones (owner_id)`,

    // Additional issues indexes
    `CREATE INDEX IF NOT EXISTS idx_issues_assignee_id ON issues (assignee_id)`,
    `CREATE INDEX IF NOT EXISTS idx_issues_owner_id ON issues (owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_issues_status ON issues (status)`,

    // Tasks indexes
    `CREATE INDEX IF NOT EXISTS idx_tasks_owner_id ON tasks (owner_id)`,
    `DROP INDEX IF EXISTS tasks_project_external_id_unique_idx`,
    `CREATE INDEX IF NOT EXISTS tasks_project_external_id_idx ON tasks (project_id, external_id)`,

    // Notifications indexes
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_organization_id ON notifications (organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications (is_read)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at)`,

    `CREATE TABLE IF NOT EXISTS training_modules (
      id SERIAL PRIMARY KEY,
      module_key VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      cert_prefix VARCHAR(20) NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS training_lessons (
      id SERIAL PRIMARY KEY,
      module_id INTEGER NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
      lesson_key VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      video_title VARCHAR(255) NOT NULL DEFAULT '',
      video_description TEXT NOT NULL DEFAULT '',
      key_concepts JSONB NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE UNIQUE INDEX IF NOT EXISTS training_lessons_module_key ON training_lessons (module_id, lesson_key)`,

    `CREATE TABLE IF NOT EXISTS training_quiz_questions (
      id SERIAL PRIMARY KEY,
      lesson_id INTEGER NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
      question_key VARCHAR(100) NOT NULL,
      scenario TEXT NOT NULL,
      options JSONB NOT NULL DEFAULT '[]',
      correct_index INTEGER NOT NULL DEFAULT 0,
      explanation TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE UNIQUE INDEX IF NOT EXISTS training_questions_lesson_key ON training_quiz_questions (lesson_id, question_key)`,

    `CREATE TABLE IF NOT EXISTS uncon_selfie_leads (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      interviewer VARCHAR(255),
      photo_path TEXT,
      share_token VARCHAR(64) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS uncon_selfie_leads_email_idx ON uncon_selfie_leads (email)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uncon_selfie_leads_share_token_idx ON uncon_selfie_leads (share_token)`,

    // === MILESTONE CONSOLIDATION: Add milestone-specific columns to tasks table ===
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_number TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_type TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deliverables TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS success_metrics TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stakeholders TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id)`,

    // Backfill tasks.organization_id from projects
    `UPDATE tasks SET organization_id = p.organization_id FROM projects p WHERE tasks.project_id = p.id AND tasks.organization_id IS NULL`,

    // Migrate milestones data into tasks table (deduplicate by checking title+project combo)
    `INSERT INTO tasks (project_id, name, description, task_type, is_milestone, priority, start_date, end_date, baseline_end_date, actual_end_date, status, progress, assignee, owner_id, milestone_number, milestone_type, deliverables, acceptance_criteria, success_metrics, stakeholders, phase, notes, organization_id, created_at, deleted_at, deleted_by, is_demo)
     SELECT
       m.project_id,
       m.title,
       m.description,
       'Milestone',
       true,
       m.priority,
       m.start_date,
       m.due_date,
       m.baseline_due_date,
       m.actual_completion_date,
       COALESCE(m.status, CASE WHEN m.completed THEN 'Done' ELSE 'Not Started' END),
       CASE WHEN m.completed THEN 100 ELSE 0 END,
       m.assignee,
       m.owner_id,
       m.milestone_number,
       m.milestone_type,
       m.deliverables,
       m.acceptance_criteria,
       m.success_metrics,
       m.stakeholders,
       m.phase,
       m.notes,
       m.organization_id,
       m.created_at,
       m.deleted_at,
       m.deleted_by,
       m.is_demo
     FROM milestones m
     WHERE NOT EXISTS (
       SELECT 1 FROM tasks t
       WHERE t.project_id = m.project_id
         AND t.name = m.title
         AND t.is_milestone = true
         AND t.task_type = 'Milestone'
         AND COALESCE(t.end_date, '') = COALESCE(m.due_date, '')
         AND COALESCE(t.milestone_number, '') = COALESCE(m.milestone_number, '')
     )`,

    // Index for milestone queries on tasks
    // Normalize legacy tasks with isMilestone=true but missing taskType
    `UPDATE tasks SET task_type = 'Milestone' WHERE is_milestone = true AND (task_type IS NULL OR task_type = '')`,

    `CREATE INDEX IF NOT EXISTS idx_tasks_is_milestone ON tasks (is_milestone) WHERE is_milestone = true`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON tasks (organization_id)`,

    // Partial unique index for project invoices (soft-delete safe)
    `CREATE UNIQUE INDEX IF NOT EXISTS project_invoices_ext_org_source_idx
     ON project_invoices (external_id, organization_id, source) WHERE deleted_at IS NULL`,

    // Billing FK constraints (billing.ts can't import organizations due to circular deps)
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'subscriptions_org_id_fk') THEN
        ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_org_id_fk FOREIGN KEY (org_id) REFERENCES organizations(id);
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'seat_assignments_org_id_fk') THEN
        ALTER TABLE seat_assignments ADD CONSTRAINT seat_assignments_org_id_fk FOREIGN KEY (org_id) REFERENCES organizations(id);
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'usage_events_org_id_fk') THEN
        ALTER TABLE usage_events ADD CONSTRAINT usage_events_org_id_fk FOREIGN KEY (org_id) REFERENCES organizations(id);
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'billing_audit_logs_org_id_fk') THEN
        ALTER TABLE billing_audit_logs ADD CONSTRAINT billing_audit_logs_org_id_fk FOREIGN KEY (org_id) REFERENCES organizations(id);
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'billing_transactions_org_id_fk') THEN
        ALTER TABLE billing_transactions ADD CONSTRAINT billing_transactions_org_id_fk FOREIGN KEY (org_id) REFERENCES organizations(id);
      END IF;
    END $$`,

    // Backfill tasks.organization_id from projects for any null values
    `UPDATE tasks SET organization_id = (SELECT organization_id FROM projects WHERE projects.id = tasks.project_id) WHERE organization_id IS NULL AND project_id IS NOT NULL`,

    // Fix CUSTOM plan credit limits: hard_cap was set to 10 instead of matching the included quota
    `UPDATE plan_meter_rules SET hard_cap_units = 100000
     WHERE plan_id = (SELECT id FROM plans WHERE code = 'CUSTOM')
       AND meter_id = (SELECT id FROM meters WHERE code = 'credits')
       AND rule_type = 'HARD_CAP'
       AND (hard_cap_units IS NULL OR hard_cap_units < 100000)`,

    // Fix CUSTOM plan: ensure other resource hard caps are reasonable
    `UPDATE plan_meter_rules SET hard_cap_units = 10000
     WHERE plan_id = (SELECT id FROM plans WHERE code = 'CUSTOM')
       AND meter_id = (SELECT id FROM meters WHERE code = 'projects')
       AND rule_type = 'HARD_CAP'
       AND (hard_cap_units IS NULL OR hard_cap_units < 10000)`,

    `UPDATE plan_meter_rules SET hard_cap_units = 1000000
     WHERE plan_id = (SELECT id FROM plans WHERE code = 'CUSTOM')
       AND meter_id = (SELECT id FROM meters WHERE code = 'tasks')
       AND rule_type = 'HARD_CAP'
       AND (hard_cap_units IS NULL OR hard_cap_units < 1000000)`,

    `UPDATE plan_meter_rules SET hard_cap_units = 100000
     WHERE plan_id = (SELECT id FROM plans WHERE code = 'CUSTOM')
       AND meter_id = (SELECT id FROM meters WHERE code = 'documents')
       AND rule_type = 'HARD_CAP'
       AND (hard_cap_units IS NULL OR hard_cap_units < 100000)`,

    `UPDATE plan_meter_rules SET hard_cap_units = 100000
     WHERE plan_id = (SELECT id FROM plans WHERE code = 'CUSTOM')
       AND meter_id = (SELECT id FROM meters WHERE code = 'ai_runs')
       AND rule_type = 'HARD_CAP'
       AND (hard_cap_units IS NULL OR hard_cap_units < 100000)`,

    // Fix CUSTOM plan usage rollups: update included_units to match plan rules
    `UPDATE usage_rollups ur SET 
       included_units = pmr.included_units_annual * 100,
       remaining_units = GREATEST(0, pmr.included_units_annual * 100 - ur.used_units)
     FROM billing_cycles bc
     JOIN subscriptions s ON bc.subscription_id = s.id
     JOIN plans p ON s.plan_id = p.id
     JOIN plan_meter_rules pmr ON pmr.plan_id = p.id AND pmr.meter_id = ur.meter_id AND pmr.rule_type = 'INCLUDED_QUOTA'
     WHERE ur.billing_cycle_id = bc.id
       AND p.code = 'CUSTOM'
       AND ur.meter_id = (SELECT id FROM meters WHERE code = 'credits')
       AND ur.included_units < pmr.included_units_annual * 100`,

    // Deduplicate external_shares before adding unique index (keep latest row per object+user)
    `DELETE FROM external_shares WHERE id NOT IN (
      SELECT MAX(id) FROM external_shares GROUP BY object_type, object_id, shared_with_user_id
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS external_shares_obj_user_idx ON external_shares (object_type, object_id, shared_with_user_id)`,

    // Schedule version history for imported schedules (Task #23)
    `CREATE TABLE IF NOT EXISTS schedule_versions (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      version_number INTEGER NOT NULL,
      mpp_import_id INTEGER REFERENCES mpp_imports(id) ON DELETE SET NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'xml',
      file_url TEXT,
      imported_by VARCHAR REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      task_count INTEGER DEFAULT 0,
      is_current BOOLEAN DEFAULT FALSE,
      restore_of_version_id INTEGER,
      summary TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS schedule_versions_project_version_idx ON schedule_versions (project_id, version_number)`,
    `CREATE INDEX IF NOT EXISTS schedule_versions_project_idx ON schedule_versions (project_id)`,
    `CREATE INDEX IF NOT EXISTS schedule_versions_org_idx ON schedule_versions (organization_id)`,

    `CREATE TABLE IF NOT EXISTS schedule_version_tasks (
      id SERIAL PRIMARY KEY,
      version_id INTEGER NOT NULL REFERENCES schedule_versions(id) ON DELETE CASCADE,
      external_id INTEGER,
      wbs TEXT,
      name TEXT NOT NULL,
      start_date DATE,
      end_date DATE,
      duration TEXT,
      duration_days NUMERIC,
      progress INTEGER DEFAULT 0,
      status TEXT,
      is_summary BOOLEAN DEFAULT FALSE,
      is_milestone BOOLEAN DEFAULT FALSE,
      outline_level INTEGER DEFAULT 1,
      parent_external_id INTEGER,
      predecessors TEXT,
      notes TEXT,
      work_hours NUMERIC,
      actual_work_hours NUMERIC,
      remaining_work_hours NUMERIC,
      task_index INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS schedule_version_tasks_version_idx ON schedule_version_tasks (version_id)`,

    // Backfill v1 versions for existing imported projects that don't yet have a snapshot.
    // We pick exactly ONE mpp_imports row per project (most-recently synced, then
    // most-recently created) so the (project_id, version_number=1) unique index
    // is never violated when a project has multiple historical imports.
    `INSERT INTO schedule_versions (project_id, organization_id, version_number, mpp_import_id, file_name, file_type, file_url, imported_by, created_at, task_count, is_current, summary)
     SELECT DISTINCT ON (mi.project_id)
       mi.project_id, mi.organization_id, 1, mi.id, mi.file_name, mi.file_type, mi.file_url,
       mi.imported_by, COALESCE(mi.last_synced_at, mi.created_at, NOW()),
       mi.task_count, TRUE, 'Initial import (backfilled)'
     FROM mpp_imports mi
     WHERE mi.project_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM schedule_versions sv WHERE sv.project_id = mi.project_id)
     ORDER BY mi.project_id,
              COALESCE(mi.last_synced_at, mi.created_at) DESC NULLS LAST,
              mi.id DESC`,

    `INSERT INTO schedule_version_tasks (
       version_id, external_id, wbs, name, start_date, end_date, duration, duration_days,
       progress, status, is_summary, is_milestone, outline_level, parent_external_id,
       predecessors, notes, work_hours, actual_work_hours, remaining_work_hours, task_index, created_at
     )
     SELECT
       sv.id,
       mit.task_id,
       mit.wbs,
       mit.task_name,
       mit.start_date,
       mit.finish_date,
       mit.duration,
       mit.duration_days,
       COALESCE(mit.percent_complete, 0),
       CASE
         WHEN mit.percent_complete = 100 THEN 'Completed'
         WHEN COALESCE(mit.percent_complete, 0) > 0 THEN 'In Progress'
         ELSE 'Not Started'
       END,
       COALESCE(mit.is_summary, FALSE),
       COALESCE(mit.is_milestone, FALSE),
       COALESCE(mit.outline_level, 1),
       mit.parent_task_id,
       mit.predecessors,
       mit.notes,
       mit.work_hours,
       mit.actual_work_hours,
       mit.remaining_work_hours,
       0,
       COALESCE(mit.created_at, NOW())
     FROM schedule_versions sv
     JOIN mpp_import_tasks mit ON mit.import_id = sv.mpp_import_id
     WHERE sv.summary = 'Initial import (backfilled)'
       AND NOT EXISTS (SELECT 1 FROM schedule_version_tasks svt WHERE svt.version_id = sv.id)`,
  ];

  for (const sql of migrations) {
    try {
      await client.query(sql);
      const label = sql.replace(/\s+/g, ' ').trim().substring(0, 80);
      console.log(`  OK: ${label}...`);
    } catch (err: any) {
      console.warn(`  SKIP: ${err.message}`);
    }
  }

  await client.end();
  console.log("Database migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
