-- Farbaek schema v61: Mesh in the browser (ADR 0096).
--
-- A phone or any browser can pair with a person's computer and send it files
-- through Farbaek's relay, or set up a direct link through it. The relay
-- records one audit event per session (v60); a session with a browser on one
-- side is recorded here, as the person whose browser it was. A browser is
-- named in the relay as browser:<user>:<device>, where the device is a random
-- id the browser keeps; an agent by its id.

create function public.app_mesh_relay_party_session_ended(p_org uuid, p_actor uuid, p_caller text, p_callee text, p_bytes bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_party constant text := '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|browser:[0-9a-f-]{36}:[0-9a-f-]{36})$';
begin
  if p_reason not in ('done', 'cancelled', 'idle', 'expired', 'allowance', 'unreachable', 'declined') or p_bytes is null or p_bytes < 0 then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  if p_caller !~ v_party or p_callee !~ v_party or (p_caller || p_callee) !~ ('browser:' || p_actor::text || ':') then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_actor) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (p_org, p_actor, 'mesh.relay_session', p_caller, jsonb_build_object('caller', p_caller, 'callee', p_callee, 'bytes', p_bytes, 'ended', p_reason));
end;
$$;
revoke all on function public.app_mesh_relay_party_session_ended(uuid, uuid, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.app_mesh_relay_party_session_ended(uuid, uuid, text, text, bigint, text) to service_role;

notify pgrst, 'reload schema';
