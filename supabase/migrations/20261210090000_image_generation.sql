-- Farbaek schema v69: image generation (ADR 0109).
--
-- Generating an image is an AI call like any other: room is reserved first,
-- then settled to what the provider reports, or refunded when it fails. The
-- usage ledger accepts only named operations, so this adds image_generation.

alter table public.ai_credit_ledger drop constraint ai_credit_ledger_operation_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_operation_check
  check (operation in ('contract_draft', 'change_proposal', 'agent_step', 'security_review', 'model_gateway', 'lens_mapping', 'policy_draft', 'image_generation'));
