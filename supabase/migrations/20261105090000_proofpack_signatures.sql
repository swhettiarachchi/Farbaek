-- Farbaek schema v34: signed ProofPacks (ADR 0062).
--
-- The server signs each ProofPack right after recording it: Ed25519 over the
-- DSSE encoding of the statement's canonical JSON, with Farbaek's key. The
-- signature lives beside the ProofPack, so a later edit to the stored record
-- no longer matches it. Members read signatures with the ProofPack; only the
-- service role writes them, through app_record_proofpack_signature, and a
-- signature is never changed once written.

create table public.proofpack_signatures (
  digest      text primary key references public.proofpacks (digest) on delete cascade,
  org_id      uuid not null,
  keyid       text not null check (keyid ~ '^farbaek-[0-9a-f]{16}$'),
  -- A 64-byte Ed25519 signature in base64.
  sig         text not null check (sig ~ '^[A-Za-z0-9+/]{86}==$'),
  created_at  timestamptz not null default now()
);

alter table public.proofpack_signatures enable row level security;
revoke all on public.proofpack_signatures from anon, authenticated;
grant select on public.proofpack_signatures to authenticated;
create policy "members read proofpack signatures" on public.proofpack_signatures
  for select to authenticated using ((select private.is_member(org_id)));

create function private.refuse_signature_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'PROOFPACK_SIGNATURE_IMMUTABLE' using errcode = '42501';
end;
$$;

create trigger proofpack_signatures_immutable
  before update on public.proofpack_signatures
  for each row execute function private.refuse_signature_update();

-- Records the server's signature for a ProofPack. The workspace comes from the
-- ProofPack itself; a ProofPack that's already signed keeps its signature.
create function public.app_record_proofpack_signature(p_digest text, p_keyid text, p_sig text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.proofpacks where digest = p_digest;
  if v_org is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.proofpack_signatures (digest, org_id, keyid, sig)
  values (p_digest, v_org, p_keyid, p_sig)
  on conflict (digest) do nothing;
  return found;
end;
$$;

revoke all on function public.app_record_proofpack_signature(text, text, text) from public, anon, authenticated;
grant execute on function public.app_record_proofpack_signature(text, text, text) to service_role;

notify pgrst, 'reload schema';
