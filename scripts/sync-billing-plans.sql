-- Sync Billing Plans Script
-- Run this on your production database to match development

-- Update plan names, descriptions, prices, and display order
UPDATE plans SET 
  name = 'Free Forever',
  description = 'Start your project management journey with essential tools. Perfect for individuals and small projects exploring structured delivery.',
  monthly_price_cents = 0,
  max_seats = 1,
  display_order = 0
WHERE code = 'FREE';

UPDATE plans SET 
  name = 'Professional',
  description = 'Elevate your project management with advanced tracking, reporting, and team collaboration. Ideal for growing teams managing multiple initiatives.',
  monthly_price_cents = 1200,
  max_seats = 3,
  display_order = 1
WHERE code = 'BASIC';

UPDATE plans SET 
  name = 'Business',
  description = 'Enterprise-grade portfolio management with unlimited team members, advanced analytics, resource planning, and priority support for scaling organizations.',
  monthly_price_cents = 2800,
  max_seats = 25,
  display_order = 2
WHERE code = 'TEAM';

UPDATE plans SET 
  name = 'Enterprise',
  description = 'Tailored solutions for global enterprises with dedicated success management, custom integrations, SSO/SAML, advanced security, and unlimited capacity.',
  monthly_price_cents = NULL,
  max_seats = NULL,
  display_order = 3
WHERE code = 'ENTERPRISE';

-- Verify the updates
SELECT id, code, name, monthly_price_cents, max_seats, display_order FROM plans ORDER BY display_order;
