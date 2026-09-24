-- ============================================================
-- mibale · 0018 — private profiles
-- A private profile shows everyone its name, main photo and age. Everything else (photos, bio,
-- city, hobbies, traits, events, communities, followers) is only for approved followers.
-- Following a private profile is a request the owner approves. Dating is its own world: people
-- who fit each other mutually (and matches) still see the dating card.
-- ============================================================

alter table public.profiles add column if not exists is_private boolean not null default false;
grant select (is_private) on public.profiles to authenticated;
grant update (is_private) on public.profiles to authenticated;

-- ---------- follows: requests to private profiles ----------
alter table public.follows add column if not exists approved boolean not null default true;
grant update (approved) on public.follows to authenticated;

-- May the signed-in user see _id's full profile?
create or replace function app_private.can_see_full(_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  _private boolean;
  _dating boolean;
begin
  if _id = auth.uid() then return true; end if;
  select is_private, dating_enabled into _private, _dating from public.profiles where id = _id;
  if not found then return false; end if;
  if not _private then return true; end if;
  if exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = _id and f.approved) then
    return true;
  end if;
  if app_private.is_staff(auth.uid()) then return true; end if;
  if exists (select 1 from public.dates d
             where (d.profile_a = auth.uid() and d.profile_b = _id) or (d.profile_b = auth.uid() and d.profile_a = _id)) then
    return true;
  end if;
  return _dating and app_private.dating_on() and app_private.mutual_fit(_id);
end;
$$;
revoke all on function app_private.can_see_full(uuid) from public;
grant execute on function app_private.can_see_full(uuid) to authenticated, service_role;

-- Members read profiles through this view: the private columns come back empty unless allowed.
-- (Direct column reads are revoked in 0019, once every app build reads through the view.)

create or replace view public.profile_cards with (security_barrier = true) as
select p.id, p.name, p.avatar_url, p.gender, p.birth_year, p.dating_enabled, p.onboarded, p.banned_at, p.created_at,
       p.is_private,
       x.full as full_access,
       case when x.full then p.photos else '{}'::text[] end as photos,
       case when x.full then p.bio else '' end as bio,
       case when x.full then p.city end as city,
       case when x.full then p.hobbies else '{}'::text[] end as hobbies,
       case when x.full then p.traits else '{}'::text[] end as traits
from public.profiles p
cross join lateral (select app_private.can_see_full(p.id) as full) x
where auth.uid() is not null
  -- same rows as "profiles: members read unblocked"
  and (p.id = auth.uid()
       or not app_private.blocked_between(auth.uid(), p.id)
       or exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id));
revoke all on public.profile_cards from public, anon;
grant select on public.profile_cards to authenticated, service_role;

create or replace function app_private.follows_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.approved := not coalesce((select is_private from public.profiles where id = new.following_id), false);
  return new;
end;
$$;
drop trigger if exists follows_before_insert on public.follows;
create trigger follows_before_insert
  before insert on public.follows
  for each row execute function app_private.follows_before_insert();

create or replace function app_private.follows_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _name text;
begin
  select name into _name from public.profiles where id = new.follower_id;
  if new.approved then
    perform app_private.create_notification(
      new.following_id, new.follower_id, 'follow',
      coalesce(nullif(_name, ''), 'מישהו') || ' התחיל/ה לעקוב אחריך', '',
      '/profile/' || new.follower_id, '{}'::jsonb);
  else
    perform app_private.create_notification(
      new.following_id, new.follower_id, 'follow_request',
      coalesce(nullif(_name, ''), 'מישהו') || ' ביקש/ה לעקוב אחריך', 'אפשר לאשר או לדחות',
      '/notifications', jsonb_build_object('follower_id', new.follower_id));
  end if;
  return new;
end;
$$;

create or replace function app_private.follows_after_approve()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _name text;
begin
  if new.approved and not old.approved then
    select name into _name from public.profiles where id = new.following_id;
    perform app_private.create_notification(
      new.follower_id, new.following_id, 'follow_accepted',
      coalesce(nullif(_name, ''), 'מישהו') || ' אישר/ה את בקשת המעקב שלך', '',
      '/profile/' || new.following_id, '{}'::jsonb);
    -- the request notification is done
    delete from public.notifications
     where recipient_id = new.following_id and type = 'follow_request' and actor_id = new.follower_id;
  end if;
  return new;
end;
$$;
drop trigger if exists follows_after_approve on public.follows;
create trigger follows_after_approve
  after update of approved on public.follows
  for each row execute function app_private.follows_after_approve();

-- Declining (deleting a pending request) clears its notification too.
create or replace function app_private.follows_after_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not old.approved then
    delete from public.notifications
     where recipient_id = old.following_id and type = 'follow_request' and actor_id = old.follower_id;
  end if;
  return old;
end;
$$;
drop trigger if exists follows_after_delete on public.follows;
create trigger follows_after_delete
  after delete on public.follows
  for each row execute function app_private.follows_after_delete();

-- Going public approves everyone who was waiting.
create or replace function app_private.profiles_after_privacy()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.is_private and not new.is_private then
    update public.follows set approved = true where following_id = new.id and not approved;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_after_privacy on public.profiles;
create trigger profiles_after_privacy
  after update of is_private on public.profiles
  for each row execute function app_private.profiles_after_privacy();

drop policy if exists "follows: read unblocked" on public.follows;
create policy "follows: read" on public.follows
  for select to authenticated
  using (follower_id = auth.uid() or following_id = auth.uid()
         or (approved
             and not app_private.blocked_between(auth.uid(), follower_id)
             and not app_private.blocked_between(auth.uid(), following_id)
             and app_private.can_see_full(follower_id) and app_private.can_see_full(following_id)));

-- The profile owner approves a request (declining = deleting it, already allowed).
drop policy if exists "follows: approve request" on public.follows;
create policy "follows: approve request" on public.follows
  for update to authenticated
  using (following_id = auth.uid()) with check (following_id = auth.uid() and approved);

-- ---------- events & communities: a private profile isn't listed to strangers ----------
drop policy "event_participants: read" on public.event_participants;
create policy "event_participants: read" on public.event_participants
  for select to authenticated
  using (
    profile_id = auth.uid()
    or app_private.is_event_organizer(event_id)
    or (status = 'approved' and not app_private.blocked_between(auth.uid(), profile_id)
        and app_private.can_see_full(profile_id))
  );

drop policy "community_members: read" on public.community_members;
create policy "community_members: read" on public.community_members
  for select to authenticated
  using (profile_id = auth.uid() or app_private.is_community_admin(community_id) or app_private.can_see_full(profile_id));

-- ---------- counts that include people you can't see ----------
create or replace function app_private.event_approved_counts(ids uuid[])
returns table (event_id uuid, approved integer)
language sql stable security definer set search_path = ''
as $$
  select p.event_id, count(*)::integer
  from public.event_participants p
  where p.event_id = any(ids) and p.status = 'approved'
  group by p.event_id;
$$;
revoke all on function app_private.event_approved_counts(uuid[]) from public;
grant execute on function app_private.event_approved_counts(uuid[]) to authenticated, service_role;

create or replace function public.event_approved_counts(ids uuid[])
returns table (event_id uuid, approved integer)
language sql stable security invoker set search_path = ''
as $$ select * from app_private.event_approved_counts(ids); $$;
revoke all on function public.event_approved_counts(uuid[]) from public, anon;
grant execute on function public.event_approved_counts(uuid[]) to authenticated;

create or replace function app_private.follow_counts(_id uuid)
returns table (followers integer, following integer)
language sql stable security definer set search_path = ''
as $$
  select (select count(*)::integer from public.follows where following_id = _id and approved),
         (select count(*)::integer from public.follows where follower_id = _id and approved);
$$;
revoke all on function app_private.follow_counts(uuid) from public;
grant execute on function app_private.follow_counts(uuid) to authenticated, service_role;

create or replace function public.follow_counts(_id uuid)
returns table (followers integer, following integer)
language sql stable security invoker set search_path = ''
as $$ select * from app_private.follow_counts(_id); $$;
revoke all on function public.follow_counts(uuid) from public, anon;
grant execute on function public.follow_counts(uuid) to authenticated;
