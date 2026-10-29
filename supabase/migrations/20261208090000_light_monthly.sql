-- Farbaek schema v67: Lite and Maker can also be paid monthly (ADR 0105).
--
-- The owner asked on 2026-10-29 that people may pay Lite and Maker monthly
-- as well as yearly. The monthly versions are plans of their own
-- ('lite_monthly', 'maker_monthly') with their own monthly products, so
-- checkout, plan changes and entitlements work as for every other plan.
-- The renewal reminder stays yearly only: the server passes the yearly
-- plans to app_billing_renewal_candidates. Additive.

alter table public.billing_accounts drop constraint billing_accounts_paid_plan_id_check;
alter table public.billing_accounts add constraint billing_accounts_paid_plan_id_check
  check (paid_plan_id in ('lite', 'lite_monthly', 'maker', 'maker_monthly', 'starter', 'plus', 'pro', 'studio', 'max', 'max_2x', 'max_3x', 'enterprise'));

alter table public.billing_products drop constraint billing_products_plan_id_check;
alter table public.billing_products add constraint billing_products_plan_id_check
  check (plan_id in ('lite', 'lite_monthly', 'maker', 'maker_monthly', 'starter', 'plus', 'pro', 'studio', 'max', 'max_2x', 'max_3x'));

alter table public.billing_checkouts drop constraint billing_checkouts_plan_id_check;
alter table public.billing_checkouts add constraint billing_checkouts_plan_id_check
  check (plan_id in ('lite', 'lite_monthly', 'maker', 'maker_monthly', 'starter', 'plus', 'pro', 'studio', 'max', 'max_2x', 'max_3x'));
