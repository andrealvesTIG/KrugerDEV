-- Sync Billing Plans Script
-- Run this on your production database to match development
-- This script adds the credits meter and credit allocation rules that are missing

-- ============================================
-- STEP 1: Update plan basic info
-- ============================================

UPDATE plans SET 
  name = 'Free Forever',
  description = 'Start your project management journey with essential tools. Perfect for individuals and small projects exploring structured delivery.',
  annual_price_cents = 0,
  max_seats = 1,
  display_order = 0
WHERE code = 'FREE';

UPDATE plans SET 
  name = 'Professional',
  description = 'Elevate your project management with advanced tracking, reporting, and team collaboration. Ideal for growing teams managing multiple initiatives.',
  annual_price_cents = 12960,
  max_seats = 3,
  display_order = 1
WHERE code = 'BASIC';

UPDATE plans SET 
  name = 'Business',
  description = 'Enterprise-grade portfolio management with unlimited team members, advanced analytics, resource planning, and priority support for scaling organizations.',
  annual_price_cents = 30240,
  max_seats = 25,
  display_order = 2
WHERE code = 'TEAM';

UPDATE plans SET 
  name = 'Enterprise',
  description = 'Tailored solutions for global enterprises with dedicated success management, custom integrations, SSO/SAML, advanced security, and unlimited capacity.',
  annual_price_cents = NULL,
  max_seats = NULL,
  display_order = 3
WHERE code = 'ENTERPRISE';

-- ============================================
-- STEP 2: Create the "credits" meter if missing
-- ============================================

INSERT INTO meters (code, name, unit_label, aggregation_type)
SELECT 'credits', 'Credits', 'credit', 'COUNT'
WHERE NOT EXISTS (SELECT 1 FROM meters WHERE code = 'credits');

-- ============================================
-- STEP 3: Create credit meter rules for each plan
-- ============================================

-- Get meter and plan IDs
DO $$
DECLARE
  v_credits_meter_id INTEGER;
  v_free_plan_id INTEGER;
  v_basic_plan_id INTEGER;
  v_team_plan_id INTEGER;
  v_enterprise_plan_id INTEGER;
BEGIN
  -- Get the credits meter ID
  SELECT id INTO v_credits_meter_id FROM meters WHERE code = 'credits';
  
  -- Get plan IDs
  SELECT id INTO v_free_plan_id FROM plans WHERE code = 'FREE';
  SELECT id INTO v_basic_plan_id FROM plans WHERE code = 'BASIC';
  SELECT id INTO v_team_plan_id FROM plans WHERE code = 'TEAM';
  SELECT id INTO v_enterprise_plan_id FROM plans WHERE code = 'ENTERPRISE';
  
  -- FREE plan: 10 included, 10 hard cap
  INSERT INTO plan_meter_rules (plan_id, meter_id, rule_type, included_units_annual, is_shared_pool)
  SELECT v_free_plan_id, v_credits_meter_id, 'INCLUDED_QUOTA', 10, false
  WHERE NOT EXISTS (
    SELECT 1 FROM plan_meter_rules 
    WHERE plan_id = v_free_plan_id AND meter_id = v_credits_meter_id AND rule_type = 'INCLUDED_QUOTA'
  );
  
  INSERT INTO plan_meter_rules (plan_id, meter_id, rule_type, hard_cap_units, is_shared_pool)
  SELECT v_free_plan_id, v_credits_meter_id, 'HARD_CAP', 10, false
  WHERE NOT EXISTS (
    SELECT 1 FROM plan_meter_rules 
    WHERE plan_id = v_free_plan_id AND meter_id = v_credits_meter_id AND rule_type = 'HARD_CAP'
  );
  
  -- BASIC/Professional plan: 500 included, overage at $0.025/credit
  INSERT INTO plan_meter_rules (plan_id, meter_id, rule_type, included_units_annual, is_shared_pool)
  SELECT v_basic_plan_id, v_credits_meter_id, 'INCLUDED_QUOTA', 500, false
  WHERE NOT EXISTS (
    SELECT 1 FROM plan_meter_rules 
    WHERE plan_id = v_basic_plan_id AND meter_id = v_credits_meter_id AND rule_type = 'INCLUDED_QUOTA'
  );
  
  INSERT INTO plan_meter_rules (plan_id, meter_id, rule_type, overage_unit_price_microcents, is_shared_pool)
  SELECT v_basic_plan_id, v_credits_meter_id, 'METERED_OVERAGE', 25000, false
  WHERE NOT EXISTS (
    SELECT 1 FROM plan_meter_rules 
    WHERE plan_id = v_basic_plan_id AND meter_id = v_credits_meter_id AND rule_type = 'METERED_OVERAGE'
  );
  
  -- TEAM/Business plan: 1000 included (shared pool), overage at $0.015/credit
  INSERT INTO plan_meter_rules (plan_id, meter_id, rule_type, included_units_annual, is_shared_pool)
  SELECT v_team_plan_id, v_credits_meter_id, 'INCLUDED_QUOTA', 1000, true
  WHERE NOT EXISTS (
    SELECT 1 FROM plan_meter_rules 
    WHERE plan_id = v_team_plan_id AND meter_id = v_credits_meter_id AND rule_type = 'INCLUDED_QUOTA'
  );
  
  INSERT INTO plan_meter_rules (plan_id, meter_id, rule_type, overage_unit_price_microcents, is_shared_pool)
  SELECT v_team_plan_id, v_credits_meter_id, 'METERED_OVERAGE', 15000, true
  WHERE NOT EXISTS (
    SELECT 1 FROM plan_meter_rules 
    WHERE plan_id = v_team_plan_id AND meter_id = v_credits_meter_id AND rule_type = 'METERED_OVERAGE'
  );
  
  -- ENTERPRISE plan: 100000 included
  INSERT INTO plan_meter_rules (plan_id, meter_id, rule_type, included_units_annual, is_shared_pool)
  SELECT v_enterprise_plan_id, v_credits_meter_id, 'INCLUDED_QUOTA', 100000, false
  WHERE NOT EXISTS (
    SELECT 1 FROM plan_meter_rules 
    WHERE plan_id = v_enterprise_plan_id AND meter_id = v_credits_meter_id AND rule_type = 'INCLUDED_QUOTA'
  );
  
  RAISE NOTICE 'Credit meter rules created/verified successfully';
END $$;

-- ============================================
-- STEP 4: Verify the setup
-- ============================================

-- Show updated plans
SELECT id, code, name, annual_price_cents, max_seats, display_order 
FROM plans 
ORDER BY display_order;

-- Show credits meter rules
SELECT p.code as plan, m.code as meter, pmr.rule_type, pmr.included_units_annual, pmr.hard_cap_units, pmr.overage_unit_price_microcents
FROM plan_meter_rules pmr
JOIN plans p ON pmr.plan_id = p.id
JOIN meters m ON pmr.meter_id = m.id
WHERE m.code = 'credits'
ORDER BY p.display_order;
