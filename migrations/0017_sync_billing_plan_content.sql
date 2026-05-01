-- Sync billing plan content (names, descriptions, meters, meter rules) between
-- environments. This migration is intentionally idempotent and safe to run
-- against both dev and prod; it does not touch annual_price_cents or
-- extra_seat_price_cents (those are considered the canonical source of truth
-- in production).
--
-- Why this exists:
--   * Production was rendering sparse pricing cards because most plans only
--     had rules for the `credits` meter, with NULL included quotas, and no
--     rules at all for `ai_runs`, `documents`, `projects`, or `tasks`.
--   * Production used plan code `PRO` for the Professional tier while the
--     codebase enum (`shared/models/billing.ts`) and several SQL queries
--     (e.g. `WHERE code = 'BASIC'` in billingRoutes.ts) assume `BASIC`.
--   * Production plan names/descriptions were missing or set to the bare
--     code (e.g. "FREE" instead of "Free Forever").

BEGIN;

-- ============================================================================
-- STEP 1: Rename the Professional plan code from 'PRO' to 'BASIC' if needed.
-- The enum in shared/models/billing.ts and the rest of the codebase assume
-- 'BASIC' is the Professional tier code. Subscriptions reference plan_id, not
-- code, so the rename does not affect existing subscriptions.
-- ============================================================================

UPDATE plans
SET code = 'BASIC'
WHERE code = 'PRO'
  AND NOT EXISTS (SELECT 1 FROM plans WHERE code = 'BASIC');

-- ============================================================================
-- STEP 2: Set canonical plan names and descriptions. Prices are deliberately
-- NOT touched here.
-- ============================================================================

UPDATE plans SET
  name = 'Free Forever',
  description = 'Start your project management journey with essential tools. Perfect for individuals and small projects exploring structured delivery.'
WHERE code = 'FREE';

UPDATE plans SET
  name = 'Professional',
  description = 'Elevate your project management with advanced tracking, reporting, and team collaboration. Ideal for growing teams managing multiple initiatives.'
WHERE code = 'BASIC';

UPDATE plans SET
  name = 'Business',
  description = 'Enterprise-grade portfolio management with unlimited team members, advanced analytics, resource planning, and priority support for scaling organizations.'
WHERE code = 'TEAM';

UPDATE plans SET
  name = 'Enterprise',
  description = 'Tailored solutions for global enterprises with dedicated success management, custom integrations, SSO/SAML, advanced security, and unlimited capacity.'
WHERE code = 'ENTERPRISE';

UPDATE plans SET
  name = 'Custom',
  description = 'Bespoke configuration with custom limits, contract terms, and onboarding tailored to your organization.'
WHERE code = 'CUSTOM';

-- ============================================================================
-- STEP 3: Ensure all five meters exist. Codes are unique.
-- ============================================================================

INSERT INTO meters (code, name, unit_label, aggregation_type)
VALUES
  ('credits',   'Credits',   'credit',   'COUNT'),
  ('ai_runs',   'AI Runs',   'run',      'COUNT'),
  ('documents', 'Documents', 'document', 'COUNT'),
  ('projects',  'Projects',  'project',  'GAUGE'),
  ('tasks',     'Tasks',     'task',     'COUNT')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STEP 4: Rebuild the canonical plan_meter_rules. We delete every rule for the
-- five managed plans across the five managed meters, then reinsert them. This
-- cleans up duplicate rows (prod had four duplicate ENTERPRISE+credits
-- INCLUDED_QUOTA rows with NULL quotas) and fixes the rules whose
-- included_units_annual were stored as NULL.
-- ============================================================================

DO $$
DECLARE
  v_free_id       INTEGER;
  v_basic_id      INTEGER;
  v_team_id       INTEGER;
  v_enterprise_id INTEGER;
  v_custom_id     INTEGER;
  v_credits_id    INTEGER;
  v_ai_runs_id    INTEGER;
  v_documents_id  INTEGER;
  v_projects_id   INTEGER;
  v_tasks_id      INTEGER;
BEGIN
  SELECT id INTO v_free_id       FROM plans WHERE code = 'FREE';
  SELECT id INTO v_basic_id      FROM plans WHERE code = 'BASIC';
  SELECT id INTO v_team_id       FROM plans WHERE code = 'TEAM';
  SELECT id INTO v_enterprise_id FROM plans WHERE code = 'ENTERPRISE';
  SELECT id INTO v_custom_id     FROM plans WHERE code = 'CUSTOM';

  SELECT id INTO v_credits_id    FROM meters WHERE code = 'credits';
  SELECT id INTO v_ai_runs_id    FROM meters WHERE code = 'ai_runs';
  SELECT id INTO v_documents_id  FROM meters WHERE code = 'documents';
  SELECT id INTO v_projects_id   FROM meters WHERE code = 'projects';
  SELECT id INTO v_tasks_id      FROM meters WHERE code = 'tasks';

  -- Wipe the rules we manage, then rebuild from scratch. This is the easiest
  -- way to guarantee a clean state across both dev and prod, including the
  -- duplicate-row cleanup.
  DELETE FROM plan_meter_rules
  WHERE plan_id IN (v_free_id, v_basic_id, v_team_id, v_enterprise_id, v_custom_id)
    AND meter_id IN (v_credits_id, v_ai_runs_id, v_documents_id, v_projects_id, v_tasks_id);

  -- ----- FREE -----
  INSERT INTO plan_meter_rules (plan_id, meter_id, rule_type, included_units_annual, hard_cap_units, overage_unit_price_microcents, is_shared_pool) VALUES
    (v_free_id, v_credits_id,   'INCLUDED_QUOTA',  200,    NULL,   NULL, false),
    (v_free_id, v_credits_id,   'HARD_CAP',        NULL,   200,    NULL, false),
    (v_free_id, v_credits_id,   'METERED_OVERAGE', NULL,   NULL,   0,    false),
    (v_free_id, v_ai_runs_id,   'INCLUDED_QUOTA',  25,     NULL,   NULL, false),
    (v_free_id, v_ai_runs_id,   'HARD_CAP',        NULL,   25,     NULL, false),
    (v_free_id, v_documents_id, 'INCLUDED_QUOTA',  50,     NULL,   NULL, false),
    (v_free_id, v_documents_id, 'HARD_CAP',        NULL,   50,     NULL, false),
    (v_free_id, v_projects_id,  'HARD_CAP',        NULL,   3,      NULL, false),
    (v_free_id, v_tasks_id,     'HARD_CAP',        NULL,   200,    NULL, false);

  -- ----- BASIC / Professional -----
  INSERT INTO plan_meter_rules (plan_id, meter_id, rule_type, included_units_annual, hard_cap_units, overage_unit_price_microcents, is_shared_pool) VALUES
    (v_basic_id, v_credits_id,   'INCLUDED_QUOTA',  500,    NULL, NULL,   false),
    (v_basic_id, v_credits_id,   'METERED_OVERAGE', NULL,   NULL, 25000,  false),
    (v_basic_id, v_ai_runs_id,   'INCLUDED_QUOTA',  500,    NULL, NULL,   false),
    (v_basic_id, v_ai_runs_id,   'METERED_OVERAGE', NULL,   NULL, 20000,  false),
    (v_basic_id, v_documents_id, 'INCLUDED_QUOTA',  1000,   NULL, NULL,   false),
    (v_basic_id, v_documents_id, 'METERED_OVERAGE', NULL,   NULL, 5000,   false),
    (v_basic_id, v_projects_id,  'HARD_CAP',        NULL,   20,   NULL,   false),
    (v_basic_id, v_tasks_id,     'HARD_CAP',        NULL,   10000,NULL,   false);

  -- ----- TEAM / Business (shared pool) -----
  INSERT INTO plan_meter_rules (plan_id, meter_id, rule_type, included_units_annual, hard_cap_units, overage_unit_price_microcents, is_shared_pool) VALUES
    (v_team_id, v_credits_id,   'INCLUDED_QUOTA',  1000,   NULL, NULL,   true),
    (v_team_id, v_credits_id,   'METERED_OVERAGE', NULL,   NULL, 15000,  true),
    (v_team_id, v_ai_runs_id,   'INCLUDED_QUOTA',  2500,   NULL, NULL,   true),
    (v_team_id, v_ai_runs_id,   'METERED_OVERAGE', NULL,   NULL, 15000,  true),
    (v_team_id, v_documents_id, 'INCLUDED_QUOTA',  5000,   NULL, NULL,   true),
    (v_team_id, v_documents_id, 'METERED_OVERAGE', NULL,   NULL, 4000,   true),
    (v_team_id, v_projects_id,  'HARD_CAP',        NULL,   100,  NULL,   true),
    (v_team_id, v_tasks_id,     'HARD_CAP',        NULL,   50000,NULL,   true);

  -- ----- ENTERPRISE -----
  INSERT INTO plan_meter_rules (plan_id, meter_id, rule_type, included_units_annual, hard_cap_units, overage_unit_price_microcents, is_shared_pool) VALUES
    (v_enterprise_id, v_credits_id,   'INCLUDED_QUOTA',  7500,   NULL,   NULL,   false),
    (v_enterprise_id, v_credits_id,   'METERED_OVERAGE', NULL,   NULL,   10000,  false),
    (v_enterprise_id, v_ai_runs_id,   'INCLUDED_QUOTA',  10000,  NULL,   NULL,   false),
    (v_enterprise_id, v_ai_runs_id,   'HARD_CAP',        NULL,   10000,  NULL,   false),
    (v_enterprise_id, v_ai_runs_id,   'METERED_OVERAGE', NULL,   NULL,   10000,  false),
    (v_enterprise_id, v_documents_id, 'INCLUDED_QUOTA',  50000,  50000,  NULL,   false),
    (v_enterprise_id, v_documents_id, 'HARD_CAP',        50000,  50000,  NULL,   false),
    (v_enterprise_id, v_documents_id, 'METERED_OVERAGE', NULL,   NULL,   3000,   false),
    (v_enterprise_id, v_projects_id,  'INCLUDED_QUOTA',  500,    NULL,   NULL,   false),
    (v_enterprise_id, v_projects_id,  'HARD_CAP',        NULL,   500,    NULL,   false),
    (v_enterprise_id, v_tasks_id,     'INCLUDED_QUOTA',  100000, NULL,   NULL,   false),
    (v_enterprise_id, v_tasks_id,     'HARD_CAP',        NULL,   100000, NULL,   false);

  -- ----- CUSTOM -----
  IF v_custom_id IS NOT NULL THEN
    INSERT INTO plan_meter_rules (plan_id, meter_id, rule_type, included_units_annual, hard_cap_units, overage_unit_price_microcents, is_shared_pool) VALUES
      (v_custom_id, v_credits_id,   'INCLUDED_QUOTA',  100000,  100000,  NULL,   false),
      (v_custom_id, v_credits_id,   'HARD_CAP',        100000,  100000,  NULL,   false),
      (v_custom_id, v_credits_id,   'METERED_OVERAGE', NULL,    NULL,    10000,  false),
      (v_custom_id, v_ai_runs_id,   'INCLUDED_QUOTA',  10,      NULL,    NULL,   false),
      (v_custom_id, v_ai_runs_id,   'HARD_CAP',        NULL,    100000,  NULL,   false),
      (v_custom_id, v_documents_id, 'INCLUDED_QUOTA',  10,      NULL,    NULL,   false),
      (v_custom_id, v_documents_id, 'HARD_CAP',        NULL,    100000,  NULL,   false),
      (v_custom_id, v_projects_id,  'INCLUDED_QUOTA',  10,      NULL,    NULL,   false),
      (v_custom_id, v_projects_id,  'HARD_CAP',        NULL,    10000,   NULL,   false),
      (v_custom_id, v_tasks_id,     'INCLUDED_QUOTA',  10,      NULL,    NULL,   false),
      (v_custom_id, v_tasks_id,     'HARD_CAP',        NULL,    1000000, NULL,   false);
  END IF;
END $$;

COMMIT;
