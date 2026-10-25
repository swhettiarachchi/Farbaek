-- Farbaek schema v45: you can't remove your last trusted device (ADR 0072).
--
-- With no trusted device left, the office counts as new and opens to the
-- first device that signs in with both codes (app_office_device_known), which
-- would undo "only my computer and phone". Like the last owner, the last
-- trusted device stays until another is added. Losing every device is what
-- private.reset_staff_devices, over SSH, is for. Waiting requests can always
-- be removed.

create or replace function public.app_staff_revoke_device(p_actor uuid, p_session uuid, p_device uuid, p_ip_hash text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_d record;
begin
  v_role := private.require_staff(p_actor, p_session, 'devices.own');
  perform pg_advisory_xact_lock(hashtext('farbaek.staff_devices:' || p_actor::text));
  select * into v_d from public.staff_devices d where d.id = p_device and d.user_id = p_actor and d.revoked_at is null for update;
  if not found then
    raise exception 'DEVICE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_d.approved_at is not null and not exists (
    select 1 from public.staff_devices d
    where d.user_id = p_actor and d.id <> p_device and d.approved_at is not null and d.revoked_at is null
  ) then
    raise exception 'LAST_DEVICE' using errcode = 'P0001';
  end if;
  update public.staff_devices set revoked_at = now(), revoked_by = p_actor, request_code = null where id = p_device;
  perform private.record_staff_event(p_actor, v_role, p_session, 'aal2', 'device.revoked', 'device', p_device::text, null, null, null, 'success', jsonb_build_object('label', v_d.label), p_ip_hash, p_ua, null);
end;
$$;
