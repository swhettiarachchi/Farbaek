-- Farbaek schema v30: custom domains for published sites (ADR 0045).
--
-- A person connects their own domain (www.example.com) to a published site.
-- It stays pending until Farbaek finds the DNS records it asked for: a TXT
-- record proving control, and the name pointing at Farbaek. Only verified
-- domains serve the site, and only they get a certificate when Caddy asks.
-- Members read their workspace's domains; only the server writes.

create table public.site_domains (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  site_id       uuid not null references public.sites (id) on delete cascade,
  hostname      text not null unique check (
    char_length(hostname) between 4 and 253
    and hostname = lower(hostname)
    and hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$'
    and hostname !~ '(^|\.)farbaek\.(com|si)$'
  ),
  verify_token  text not null check (verify_token ~ '^[a-z0-9]{32}$'),
  status        text not null default 'pending' check (status in ('pending', 'verified')),
  verified_at   timestamptz,
  checked_at    timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint site_domains_verified check ((status = 'verified') = (verified_at is not null))
);
create index site_domains_site_idx on public.site_domains (site_id);

alter table public.site_domains enable row level security;
revoke all on public.site_domains from public, anon, authenticated, service_role;
grant select on public.site_domains to authenticated, service_role;
create policy "members read their workspace's site domains" on public.site_domains
  for select to authenticated using ((select private.is_member(org_id)));

-- Adds a pending domain to a site. Contributors only; at most two per site.
create function public.app_add_site_domain(p_site uuid, p_actor uuid, p_hostname text, p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site record;
  v_id uuid;
begin
  select s.id, s.org_id, s.blocked_at into v_site from public.sites s where s.id = p_site for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_site.org_id, p_actor);
  if v_site.blocked_at is not null then
    raise exception 'SITE_BLOCKED' using errcode = '42501';
  end if;
  if (select count(*) from public.site_domains where site_id = p_site) >= 2 then
    raise exception 'DOMAIN_LIMIT' using errcode = '54000';
  end if;
  if exists (select 1 from public.site_domains where hostname = p_hostname) then
    raise exception 'DOMAIN_TAKEN' using errcode = '23505';
  end if;
  begin
    insert into public.site_domains (org_id, site_id, hostname, verify_token, created_by)
    values (v_site.org_id, p_site, p_hostname, p_token, p_actor)
    returning id into v_id;
  exception when check_violation then
    raise exception 'INVALID_DOMAIN' using errcode = '22023';
  end;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_site.org_id, p_actor, 'site.domain_added', p_site::text, jsonb_build_object('hostname', p_hostname));
  return v_id;
end;
$$;

-- Records the result of a DNS check. A verified domain stays verified only while its records stay in place.
create function public.app_mark_site_domain(p_domain uuid, p_actor uuid, p_verified boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.site_domains%rowtype;
  v_status text := case when p_verified then 'verified' else 'pending' end;
begin
  select * into v_d from public.site_domains where id = p_domain for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_d.org_id, p_actor);
  update public.site_domains
     set status = v_status,
         verified_at = case when p_verified then coalesce(verified_at, now()) else null end,
         checked_at = now()
   where id = p_domain;
  if v_status is distinct from v_d.status then
    insert into public.audit_events (org_id, actor_id, action, target, metadata)
    values (v_d.org_id, p_actor, case when p_verified then 'site.domain_verified' else 'site.domain_unverified' end, v_d.site_id::text, jsonb_build_object('hostname', v_d.hostname));
  end if;
  return v_status;
end;
$$;

create function public.app_remove_site_domain(p_domain uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.site_domains%rowtype;
begin
  select * into v_d from public.site_domains where id = p_domain for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_contributor(v_d.org_id, p_actor);
  delete from public.site_domains where id = p_domain;
  insert into public.audit_events (org_id, actor_id, action, target, metadata)
  values (v_d.org_id, p_actor, 'site.domain_removed', v_d.site_id::text, jsonb_build_object('hostname', v_d.hostname));
end;
$$;

-- For serving and certificates: the site name a verified domain belongs to, or null.
create function public.app_site_name_for_domain(p_hostname text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.name from public.site_domains d join public.sites s on s.id = d.site_id
  where d.hostname = lower(p_hostname) and d.status = 'verified';
$$;

revoke all on function public.app_add_site_domain(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_add_site_domain(uuid, uuid, text, text) to service_role;
revoke all on function public.app_mark_site_domain(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.app_mark_site_domain(uuid, uuid, boolean) to service_role;
revoke all on function public.app_remove_site_domain(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_remove_site_domain(uuid, uuid) to service_role;
revoke all on function public.app_site_name_for_domain(text) from public, anon, authenticated;
grant execute on function public.app_site_name_for_domain(text) to service_role;
