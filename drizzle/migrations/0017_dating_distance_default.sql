-- Israel is small and dating visibility is mutual, so a 50 km default emptied the swing quickly.
-- Default to "no limit" (200 = unlimited in the app) and move everyone still on the old default.
alter table public.profiles alter column pref_distance_km set default 200;
update public.profiles set pref_distance_km = 200 where pref_distance_km = 50;

-- For the empty swing: how many people in dating mode are hidden by preferences (mine or theirs).
-- A count only — never who or where.
create or replace function app_private.dating_hidden_count()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.profiles p
  where p.id <> auth.uid()
    and p.dating_enabled and p.onboarded and p.banned_at is null
    and not app_private.blocked_between(auth.uid(), p.id)
    and not exists (select 1 from public.romantic_likes r where r.liker_id = auth.uid() and r.liked_id = p.id)
    and not app_private.mutual_fit(p.id);
$$;
revoke all on function app_private.dating_hidden_count() from public;
grant execute on function app_private.dating_hidden_count() to authenticated, service_role;

create or replace function public.dating_hidden_count()
returns integer
language sql stable security invoker set search_path = ''
as $$ select app_private.dating_hidden_count(); $$;
revoke all on function public.dating_hidden_count() from public, anon;
grant execute on function public.dating_hidden_count() to authenticated;
