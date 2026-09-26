-- ============================================================
-- mibale · 0023 — hide age and city
-- A private profile no longer shows its age to people it hasn't approved (only name and main
-- photo). Separately, anyone can hide their age and/or city from everyone. Dating matching and
-- event age limits still use the real birth year on the server — it just isn't shown.
-- ============================================================

alter table public.profiles
  add column if not exists hide_age boolean not null default false,
  add column if not exists hide_city boolean not null default false;
grant update (hide_age, hide_city) on public.profiles to authenticated;

-- Same view as 0018; birth_year and city are masked, and the owner reads back their own switches.
create or replace view public.profile_cards with (security_barrier = true) as
select p.id, p.name, p.avatar_url, p.gender,
       case when p.id = auth.uid() or (x.full and not p.hide_age) then p.birth_year end as birth_year,
       p.dating_enabled, p.onboarded, p.banned_at, p.created_at,
       p.is_private,
       x.full as full_access,
       case when x.full then p.photos else '{}'::text[] end as photos,
       case when x.full then p.bio else '' end as bio,
       case when p.id = auth.uid() or (x.full and not p.hide_city) then p.city end as city,
       case when x.full then p.hobbies else '{}'::text[] end as hobbies,
       case when x.full then p.traits else '{}'::text[] end as traits,
       case when p.id = auth.uid() then p.hide_age else false end as hide_age,
       case when p.id = auth.uid() then p.hide_city else false end as hide_city
from public.profiles p
cross join lateral (select app_private.can_see_full(p.id) as full) x
where auth.uid() is not null
  -- same rows as "profiles: members read unblocked"
  and (p.id = auth.uid()
       or not app_private.blocked_between(auth.uid(), p.id)
       or exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id));
revoke all on public.profile_cards from public, anon;
grant select on public.profile_cards to authenticated, service_role;

-- Members read ages only through the view from now on (every app build already does).
revoke select (birth_year) on public.profiles from authenticated;
