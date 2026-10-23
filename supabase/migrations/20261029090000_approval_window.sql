-- Farbaek schema v27: the approval window (the Approval Wallet, ADR 0042).
--
-- A change proposal can be approved for 72 hours after it's made. After
-- that it can only be discarded, and the agent proposes again against the
-- files as they are then. The window is set when the row is inserted and
-- can't be moved afterwards.

-- now() is stable, so rows that already exist all get this statement's time
-- plus 72 hours: nothing open expires the moment this is applied.
alter table public.change_proposals
  add column expires_at timestamptz not null default (now() + interval '72 hours');
alter table public.change_proposals
  add constraint change_proposals_expiry check (expires_at > created_at);

-- Enforced on the row itself, so every path that applies a proposal is
-- covered. Raising here rolls back the whole application: files, ProofPack
-- and task transitions.
create function private.refuse_expired_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.expires_at is distinct from old.expires_at then
    raise exception 'INVALID_PROPOSAL' using errcode = '22023';
  end if;
  if old.status = 'pending' and new.status = 'applied' and now() >= old.expires_at then
    raise exception 'PROPOSAL_EXPIRED' using errcode = '40001';
  end if;
  return new;
end;
$$;

revoke all on function private.refuse_expired_approval() from public, anon, authenticated;

create trigger change_proposals_approval_window
  before update on public.change_proposals
  for each row execute function private.refuse_expired_approval();
