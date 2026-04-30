-- Convert subscription plans from monthly to annual-only billing.
--
-- Safe to run on a database whose schema may pre-date the column rename.
-- Steps:
--   1. Rename `monthly_price_cents` -> `annual_price_cents` and
--      `included_units_monthly` -> `included_units_annual` if needed.
--   2. Wipe all billing activity (cycles, usage, transactions, invoices,
--      payment events, subscriptions).
--   3. Clear PayPal plan/product IDs so PayPal sync creates fresh
--      annual plans (PayPal billing intervals are immutable).
--   4. Backfill annual prices and extra-seat prices on the canonical plans.
--
-- Quota numbers (included_units_annual on plan_meter_rules) keep their
-- existing values per spec.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'monthly_price_cents'
  ) THEN
    EXECUTE 'ALTER TABLE plans RENAME COLUMN monthly_price_cents TO annual_price_cents';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plan_meter_rules' AND column_name = 'included_units_monthly'
  ) THEN
    EXECUTE 'ALTER TABLE plan_meter_rules RENAME COLUMN included_units_monthly TO included_units_annual';
  END IF;
END $$;

TRUNCATE TABLE
  payment_events,
  billing_cycles,
  usage_events,
  usage_rollups,
  billing_transactions,
  invoice_records,
  subscriptions
RESTART IDENTITY CASCADE;

UPDATE plans
SET paypal_plan_id = NULL,
    paypal_product_id = NULL;

UPDATE plans SET annual_price_cents = 0,     extra_seat_price_cents = NULL WHERE code = 'FREE';
UPDATE plans SET annual_price_cents = 12960, extra_seat_price_cents = 5400 WHERE code = 'BASIC';
UPDATE plans SET annual_price_cents = 30240, extra_seat_price_cents = 8640 WHERE code = 'TEAM';

-- Enterprise: convert legacy $900/mo (90000) row to annual ($9720 = 90000 * 12 * 0.90).
-- Preserve NULL ("Contact Us") rows untouched. Always sync the extra-seat price.
UPDATE plans SET annual_price_cents = 972000 WHERE code = 'ENTERPRISE' AND annual_price_cents = 90000;
UPDATE plans SET extra_seat_price_cents = 6480 WHERE code = 'ENTERPRISE';

COMMIT;
