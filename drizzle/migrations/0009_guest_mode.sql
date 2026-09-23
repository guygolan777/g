-- ============================================================
-- mibale · 0009 — guest mode: attract without exposing people
-- Guests see events/communities and aggregate numbers only.
-- No profile (not even name/photo), no participants, no exact location.
-- ============================================================

-- Profiles are members-only.
drop policy if exists "profiles: guests read basic" on public.profiles;
revoke select on public.profiles from anon;

-- Events for guests: public, non-targeted events, with city-level location.
grant select (city, description, seats, is_online) on public.events to anon;
drop policy if exists "events: guests read limited columns" on public.events;
create policy "events: guests read public events" on public.events
  for select to anon using (gender_target = 'all');

-- Aggregate counts only (no identities).
create or replace function app_private.guest_event_counts(ids uuid[])
returns table (event_id uuid, approved integer)
language sql stable security definer set search_path = ''
as $$
  select p.event_id, count(*)::integer
  from public.event_participants p
  join public.events e on e.id = p.event_id and e.gender_target = 'all'
  where p.event_id = any(ids) and p.status = 'approved'
  group by p.event_id;
$$;

create or replace function app_private.guest_community_counts()
returns table (community_id uuid, members integer)
language sql stable security definer set search_path = ''
as $$
  select community_id, count(*)::integer from public.community_members group by community_id;
$$;

create or replace function app_private.guest_stats()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'members', (select count(*) from public.profiles where onboarded and banned_at is null),
    'events_week', (select count(*) from public.events where starts_at between now() and now() + interval '7 days'),
    'communities', (select count(*) from public.communities),
    'dating_open', (select count(*) from public.profiles where dating_enabled and onboarded and banned_at is null)
  );
$$;

revoke all on function app_private.guest_event_counts(uuid[]), app_private.guest_community_counts(), app_private.guest_stats() from public;
grant execute on function app_private.guest_event_counts(uuid[]), app_private.guest_community_counts(), app_private.guest_stats()
  to anon, authenticated, service_role;

create or replace function public.guest_event_counts(ids uuid[])
returns table (event_id uuid, approved integer) language sql stable security invoker set search_path = ''
as $$ select * from app_private.guest_event_counts(ids); $$;
create or replace function public.guest_community_counts()
returns table (community_id uuid, members integer) language sql stable security invoker set search_path = ''
as $$ select * from app_private.guest_community_counts(); $$;
create or replace function public.guest_stats()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app_private.guest_stats(); $$;

revoke all on function public.guest_event_counts(uuid[]), public.guest_community_counts(), public.guest_stats() from public;
grant execute on function public.guest_event_counts(uuid[]), public.guest_community_counts(), public.guest_stats()
  to anon, authenticated, service_role;
