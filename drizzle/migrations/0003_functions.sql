-- ============================================================
-- mibale · 0003 functions & triggers
-- SECURITY DEFINER functions live in app_private (never exposed by
-- PostgREST). Clients call SECURITY INVOKER wrappers in public.
-- ============================================================

-- ---------- helpers ----------
create or replace function app_private.can_write()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.banned_at is null
  );
$$;

create or replace function app_private.blocks_with(other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = auth.uid())
  );
$$;

create or replace function app_private.blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks x
    where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a)
  );
$$;

create or replace function app_private.blocked_profile_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select b.blocked_id from public.blocks b where b.blocker_id = auth.uid()
  union
  select b.blocker_id from public.blocks b where b.blocked_id = auth.uid();
$$;

create or replace function app_private.is_event_organizer(_event_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.events e where e.id = _event_id and e.organizer_id = auth.uid());
$$;

create or replace function app_private.is_event_member(_event_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.event_participants p
    where p.event_id = _event_id and p.profile_id = auth.uid() and p.status = 'approved'
  );
$$;

create or replace function app_private.is_community_member(_community_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.community_members m
    where m.community_id = _community_id and m.profile_id = auth.uid()
  );
$$;

create or replace function app_private.is_community_admin(_community_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.community_members m
    where m.community_id = _community_id and m.profile_id = auth.uid() and m.role in ('founder', 'admin')
  );
$$;

-- ---------- notifications: server-side only ----------
create or replace function app_private.create_notification(
  _recipient uuid, _actor uuid, _type text, _title text,
  _body text default '', _link text default null, _data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  _id uuid;
begin
  if _recipient is null or _recipient = _actor then
    return null;
  end if;
  if _actor is not null and app_private.blocked_between(_recipient, _actor) then
    return null;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, title, body, link, data)
  values (_recipient, _actor, _type, _title, coalesce(_body, ''), _link, coalesce(_data, '{}'::jsonb))
  returning id into _id;
  return _id;
end;
$$;

-- Wrapper exists for server code (service_role) only — clients can never write notifications.
create or replace function public.create_notification(
  _recipient uuid, _actor uuid, _type text, _title text,
  _body text default '', _link text default null, _data jsonb default '{}'::jsonb
)
returns uuid
language sql security invoker set search_path = ''
as $$
  select app_private.create_notification(_recipient, _actor, _type, _title, _body, _link, _data);
$$;

-- ---------- profiles ----------
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

create or replace function app_private.profiles_before_write()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.birth_year := case when new.birth_date is null then null
                         else extract(year from new.birth_date)::smallint end;
  new.updated_at := now();
  if new.avatar_url is null and coalesce(array_length(new.photos, 1), 0) > 0 then
    new.avatar_url := new.photos[1];
  end if;
  return new;
end;
$$;

create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function app_private.profiles_before_write();

create or replace function app_private.my_profile_settings()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'birth_date', p.birth_date,
    'show_online', p.show_online,
    'pref_min_age', p.pref_min_age,
    'pref_max_age', p.pref_max_age,
    'pref_gender', p.pref_gender,
    'pref_distance_km', p.pref_distance_km,
    'notify_messages', p.notify_messages,
    'notify_events', p.notify_events,
    'notify_social', p.notify_social,
    'is_admin', app_private.has_role(p.id, 'admin'),
    'is_moderator', app_private.has_role(p.id, 'moderator')
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function app_private.online_status(ids uuid[])
returns table (profile_id uuid, is_online boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, (p.show_online and p.last_seen_at > now() - interval '5 minutes')
  from public.profiles p
  where p.id = any(ids)
    and auth.uid() is not null
    and not app_private.blocked_between(auth.uid(), p.id);
$$;

-- Distances to other people without ever exposing their coordinates.
create or replace function app_private.nearby_profiles(radius_km double precision default 50)
returns table (profile_id uuid, distance_km integer)
language sql stable security definer set search_path = ''
as $$
  with me as (select lat, lng from public.profile_locations where profile_id = auth.uid())
  select l.profile_id,
         greatest(1, round(6371 * 2 * asin(sqrt(
           power(sin(radians(l.lat - me.lat) / 2), 2) +
           cos(radians(me.lat)) * cos(radians(l.lat)) * power(sin(radians(l.lng - me.lng) / 2), 2)
         )))::integer) as distance_km
  from public.profile_locations l, me
  where l.profile_id <> auth.uid()
    and not app_private.blocked_between(auth.uid(), l.profile_id)
    and 6371 * 2 * asin(sqrt(
           power(sin(radians(l.lat - me.lat) / 2), 2) +
           cos(radians(me.lat)) * cos(radians(l.lat)) * power(sin(radians(l.lng - me.lng) / 2), 2)
         )) <= radius_km
  order by 2;
$$;

-- ---------- events ----------
create or replace function app_private.events_before_write()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.ends_at is null then
    new.ends_at := new.starts_at + interval '2 hours';
  end if;
  return new;
end;
$$;

create trigger events_before_write
  before insert or update on public.events
  for each row execute function app_private.events_before_write();

-- Organizer is always an approved participant — for every occurrence too.
create or replace function app_private.events_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _step interval;
  _i integer;
begin
  insert into public.event_participants (event_id, profile_id, status)
  values (new.id, new.organizer_id, 'approved')
  on conflict (event_id, profile_id) do update set status = 'approved';

  if new.recurrence <> 'none' and new.recurrence_parent_id is null then
    _step := case new.recurrence
      when 'daily' then interval '1 day'
      when 'weekly' then interval '7 days'
      when 'biweekly' then interval '14 days'
      else interval '1 month'
    end;
    for _i in 1..(case new.recurrence when 'daily' then 13 else 7 end) loop
      insert into public.events (
        organizer_id, community_id, title, description, category, subcategory, image_url,
        starts_at, ends_at, is_online, location_name, city, lat, lng, meeting_url, seats,
        auto_approve, recurrence, recurrence_parent_id, min_age, max_age, gender_target
      ) values (
        new.organizer_id, new.community_id, new.title, new.description, new.category, new.subcategory,
        new.image_url, new.starts_at + _step * _i, new.ends_at + _step * _i, new.is_online,
        new.location_name, new.city, new.lat, new.lng, new.meeting_url, new.seats,
        new.auto_approve, new.recurrence, new.id, new.min_age, new.max_age, new.gender_target
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger events_after_insert
  after insert on public.events
  for each row execute function app_private.events_after_insert();

-- Organizer cannot leave their own event. Cascaded deletes (event or
-- account removal) run at trigger depth > 1 and are allowed.
create or replace function app_private.participants_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
     and exists (select 1 from public.events e where e.id = old.event_id and e.organizer_id = old.profile_id) then
    raise exception 'organizer cannot leave own event';
  end if;
  return old;
end;
$$;

create or replace function app_private.participants_after_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _ev public.events;
  _name text;
begin
  select * into _ev from public.events where id = new.event_id;
  select name into _name from public.profiles where id = new.profile_id;

  if new.status = 'approved' then
    insert into public.event_tickets (event_id, profile_id) values (new.event_id, new.profile_id)
    on conflict do nothing;
  else
    delete from public.event_tickets where event_id = new.event_id and profile_id = new.profile_id;
  end if;

  if new.profile_id = _ev.organizer_id then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'pending' then
    perform app_private.create_notification(
      _ev.organizer_id, new.profile_id, 'event_join_request',
      coalesce(_name, 'מישהו') || ' ביקש/ה להצטרף',
      'מי בא ל' || _ev.title, '/e/' || _ev.id,
      jsonb_build_object('event_id', _ev.id));
  elsif tg_op = 'INSERT' and new.status = 'approved' then
    perform app_private.create_notification(
      _ev.organizer_id, new.profile_id, 'event_joined',
      coalesce(_name, 'מישהו') || ' הצטרף/ה לאירוע',
      'מי בא ל' || _ev.title, '/e/' || _ev.id,
      jsonb_build_object('event_id', _ev.id));
  elsif tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    perform app_private.create_notification(
      new.profile_id, _ev.organizer_id, 'event_approved',
      '🎉 אושרת לאירוע מי בא ל' || _ev.title,
      'נתראה שם!', '/e/' || _ev.id,
      jsonb_build_object('event_id', _ev.id));
  end if;
  return new;
end;
$$;

create trigger participants_after_write
  after insert or update on public.event_participants
  for each row execute function app_private.participants_after_write();

create trigger participants_guard
  before delete on public.event_participants
  for each row execute function app_private.participants_guard();

create or replace function app_private.join_event(_event_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  _ev public.events;
  _me public.profiles;
  _approved integer;
  _status public.participant_status;
  _age integer;
begin
  if not app_private.can_write() then
    raise exception 'not allowed';
  end if;
  select * into _ev from public.events where id = _event_id;
  if not found then raise exception 'event not found'; end if;
  if _ev.organizer_id = auth.uid() then return 'approved'; end if;
  if app_private.blocked_between(auth.uid(), _ev.organizer_id) then raise exception 'blocked'; end if;
  if _ev.ends_at < now() then raise exception 'event ended'; end if;

  select * into _me from public.profiles where id = auth.uid();
  if _ev.gender_target <> 'all' and _me.gender::text is distinct from _ev.gender_target::text then
    raise exception 'audience mismatch';
  end if;
  if _me.birth_date is not null then
    _age := extract(year from age(_me.birth_date))::integer;
    if (_ev.min_age is not null and _age < _ev.min_age) or (_ev.max_age is not null and _age > _ev.max_age) then
      raise exception 'age mismatch';
    end if;
  end if;

  select status into _status from public.event_participants
  where event_id = _event_id and profile_id = auth.uid();
  if found and _status in ('approved', 'pending') then
    return _status::text;
  end if;

  select count(*) into _approved from public.event_participants
  where event_id = _event_id and status = 'approved';
  if _ev.seats < 9999 and _approved >= _ev.seats then
    raise exception 'event full';
  end if;

  _status := case when _ev.auto_approve then 'approved' else 'pending' end;
  insert into public.event_participants (event_id, profile_id, status)
  values (_event_id, auth.uid(), _status)
  on conflict (event_id, profile_id) do update set status = excluded.status, updated_at = now();
  return _status::text;
end;
$$;

create or replace function app_private.review_event_join(_event_id uuid, _profile_id uuid, _approve boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  _ev public.events;
  _approved integer;
begin
  select * into _ev from public.events where id = _event_id;
  if not found or _ev.organizer_id <> auth.uid() then
    raise exception 'only the organizer can review requests';
  end if;
  if _approve then
    select count(*) into _approved from public.event_participants
    where event_id = _event_id and status = 'approved';
    if _ev.seats < 9999 and _approved >= _ev.seats then
      raise exception 'event full';
    end if;
  end if;
  update public.event_participants
     set status = case when _approve then 'approved'::public.participant_status else 'declined'::public.participant_status end,
         updated_at = now()
   where event_id = _event_id and profile_id = _profile_id and status = 'pending';
  return case when _approve then 'approved' else 'declined' end;
end;
$$;

create or replace function app_private.event_meeting_url(_event_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select e.meeting_url from public.events e
  where e.id = _event_id
    and (e.organizer_id = auth.uid() or app_private.is_event_member(_event_id));
$$;

create or replace function app_private.check_in(_event_id uuid, _code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  _ticket public.event_tickets;
  _name text;
  _status public.participant_status;
begin
  if not app_private.is_event_organizer(_event_id) then
    return jsonb_build_object('result', 'forbidden');
  end if;
  select * into _ticket from public.event_tickets where code = _code;
  if not found then
    return jsonb_build_object('result', 'invalid');
  end if;
  if _ticket.event_id <> _event_id then
    return jsonb_build_object('result', 'wrong_event');
  end if;
  select name into _name from public.profiles where id = _ticket.profile_id;
  select status into _status from public.event_participants
  where event_id = _event_id and profile_id = _ticket.profile_id;
  if _status is distinct from 'approved' then
    return jsonb_build_object('result', 'not_approved', 'name', _name);
  end if;
  if exists (select 1 from public.event_checkins where event_id = _event_id and profile_id = _ticket.profile_id) then
    return jsonb_build_object('result', 'already', 'name', _name, 'profile_id', _ticket.profile_id);
  end if;
  insert into public.event_checkins (event_id, profile_id, checked_in_by)
  values (_event_id, _ticket.profile_id, auth.uid());
  return jsonb_build_object('result', 'ok', 'name', _name, 'profile_id', _ticket.profile_id);
end;
$$;

-- ---------- communities ----------
create or replace function app_private.communities_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.community_members (community_id, profile_id, role)
  values (new.id, new.founder_id, 'founder')
  on conflict do nothing;
  return new;
end;
$$;

create trigger communities_after_insert
  after insert on public.communities
  for each row execute function app_private.communities_after_insert();

create or replace function app_private.request_community_join(_community_id uuid, _message text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  _c public.communities;
  _me public.profiles;
  _age integer;
  _admin record;
begin
  if not app_private.can_write() then raise exception 'not allowed'; end if;
  select * into _c from public.communities where id = _community_id;
  if not found then raise exception 'community not found'; end if;
  if app_private.is_community_member(_community_id) then return 'member'; end if;
  if app_private.blocked_between(auth.uid(), _c.founder_id) then raise exception 'blocked'; end if;

  select * into _me from public.profiles where id = auth.uid();
  if _c.audience_gender <> 'all' and _me.gender::text is distinct from _c.audience_gender::text then
    raise exception 'audience mismatch';
  end if;
  if _me.birth_date is not null then
    _age := extract(year from age(_me.birth_date))::integer;
    if _age < _c.min_age or _age > _c.max_age then raise exception 'age mismatch'; end if;
  end if;

  if _c.auto_approve then
    insert into public.community_members (community_id, profile_id, role)
    values (_community_id, auth.uid(), 'member') on conflict do nothing;
    delete from public.community_join_requests where community_id = _community_id and profile_id = auth.uid();
    return 'member';
  end if;

  insert into public.community_join_requests (community_id, profile_id, status, message)
  values (_community_id, auth.uid(), 'pending', _message)
  on conflict (community_id, profile_id)
    do update set status = 'pending', message = excluded.message, created_at = now(), reviewed_at = null;

  for _admin in
    select profile_id from public.community_members
    where community_id = _community_id and role in ('founder', 'admin')
  loop
    perform app_private.create_notification(
      _admin.profile_id, auth.uid(), 'community_join_request',
      coalesce(nullif(_me.name, ''), 'מישהו') || ' ביקש/ה להצטרף לקהילה',
      _c.name, '/community/' || _c.id, jsonb_build_object('community_id', _c.id));
  end loop;
  return 'pending';
end;
$$;

create or replace function app_private.review_community_join(_request_id uuid, _approve boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  _r public.community_join_requests;
  _c public.communities;
begin
  select * into _r from public.community_join_requests where id = _request_id;
  if not found then raise exception 'request not found'; end if;
  if not app_private.is_community_admin(_r.community_id) then
    raise exception 'only community admins can review';
  end if;
  select * into _c from public.communities where id = _r.community_id;

  update public.community_join_requests
     set status = case when _approve then 'approved'::public.request_status else 'declined'::public.request_status end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = _request_id;

  if _approve then
    insert into public.community_members (community_id, profile_id, role)
    values (_r.community_id, _r.profile_id, 'member') on conflict do nothing;
    perform app_private.create_notification(
      _r.profile_id, auth.uid(), 'community_approved',
      '🎉 התקבלת לקהילה ' || _c.name, '', '/community/' || _c.id,
      jsonb_build_object('community_id', _c.id));
  end if;
  return case when _approve then 'approved' else 'declined' end;
end;
$$;

-- ---------- stories ----------
create or replace function app_private.story_replies_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _author uuid;
begin
  select author_id into _author from public.stories where id = new.story_id;
  if _author is null or _author = new.author_id then return new; end if;
  insert into public.direct_messages (sender_id, recipient_id, kind, body, story_id)
  values (new.author_id, _author, 'story_reply', new.body, new.story_id);
  return new;
end;
$$;

create trigger story_replies_after_insert
  after insert on public.story_replies
  for each row execute function app_private.story_replies_after_insert();

create or replace function app_private.story_likes_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _author uuid;
  _name text;
begin
  select author_id into _author from public.stories where id = new.story_id;
  select name into _name from public.profiles where id = new.profile_id;
  perform app_private.create_notification(
    _author, new.profile_id, 'story_like',
    coalesce(nullif(_name, ''), 'מישהו') || ' אהב/ה את הסטורי שלך', '',
    '/story/' || new.story_id, jsonb_build_object('story_id', new.story_id));
  return new;
end;
$$;

create trigger story_likes_after_insert
  after insert on public.story_likes
  for each row execute function app_private.story_likes_after_insert();

-- ---------- event invites ----------
create or replace function app_private.event_invites_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _name text;
  _title text;
begin
  select name into _name from public.profiles where id = new.inviter_id;
  select title into _title from public.events where id = new.event_id;
  perform app_private.create_notification(
    new.invitee_id, new.inviter_id, 'event_invite',
    coalesce(nullif(_name, ''), 'מישהו') || ' הזמין/ה אותך לאירוע',
    'מי בא ל' || _title, '/e/' || new.event_id, jsonb_build_object('event_id', new.event_id));
  return new;
end;
$$;

create trigger event_invites_after_insert
  after insert on public.event_invites
  for each row execute function app_private.event_invites_after_insert();

-- ---------- follows ----------
create or replace function app_private.follows_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _name text;
begin
  select name into _name from public.profiles where id = new.follower_id;
  perform app_private.create_notification(
    new.following_id, new.follower_id, 'follow',
    coalesce(nullif(_name, ''), 'מישהו') || ' התחיל/ה לעקוב אחריך', '',
    '/profile/' || new.follower_id, '{}'::jsonb);
  return new;
end;
$$;

create trigger follows_after_insert
  after insert on public.follows
  for each row execute function app_private.follows_after_insert();

-- ---------- dating: mutual like → match ----------
create or replace function app_private.romantic_likes_after_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _a uuid := least(new.liker_id, new.liked_id);
  _b uuid := greatest(new.liker_id, new.liked_id);
  _inserted uuid;
begin
  if new.action <> 'like' then return new; end if;
  if exists (
    select 1 from public.romantic_likes r
    where r.liker_id = new.liked_id and r.liked_id = new.liker_id and r.action = 'like'
  ) then
    insert into public.dates (profile_a, profile_b) values (_a, _b)
    on conflict do nothing returning id into _inserted;
    if _inserted is not null then
      perform app_private.create_notification(new.liker_id, new.liked_id, 'match',
        '💘 יש לכם התאמה!', 'אפשר להתחיל לדבר', '/chat/' || new.liked_id, '{}'::jsonb);
      perform app_private.create_notification(new.liked_id, new.liker_id, 'match',
        '💘 יש לכם התאמה!', 'אפשר להתחיל לדבר', '/chat/' || new.liker_id, '{}'::jsonb);
    end if;
  end if;
  return new;
end;
$$;

create trigger romantic_likes_after_write
  after insert or update on public.romantic_likes
  for each row execute function app_private.romantic_likes_after_write();

-- ---------- blocks: sever every connection instantly ----------
create or replace function app_private.blocks_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.follows
   where (follower_id = new.blocker_id and following_id = new.blocked_id)
      or (follower_id = new.blocked_id and following_id = new.blocker_id);
  delete from public.romantic_likes
   where (liker_id = new.blocker_id and liked_id = new.blocked_id)
      or (liker_id = new.blocked_id and liked_id = new.blocker_id);
  delete from public.dates
   where profile_a = least(new.blocker_id, new.blocked_id)
     and profile_b = greatest(new.blocker_id, new.blocked_id);
  return new;
end;
$$;

create trigger blocks_after_insert
  after insert on public.blocks
  for each row execute function app_private.blocks_after_insert();

-- ---------- push ----------
create or replace function app_private.register_push_token(_token text, _platform text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.push_tokens (profile_id, token, platform)
  values (auth.uid(), _token, _platform)
  on conflict (token) do update set profile_id = auth.uid(), platform = excluded.platform, updated_at = now();
end;
$$;

-- ---------- admin ----------
create or replace function app_private.admin_overview()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_staff(auth.uid()) then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'new_this_week', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'events', (select count(*) from public.events),
    'upcoming_events', (select count(*) from public.events where starts_at > now()),
    'communities', (select count(*) from public.communities),
    'active_stories', (select count(*) from public.stories where expires_at > now()),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'banned', (select count(*) from public.profiles where banned_at is not null)
  );
end;
$$;

create or replace function app_private.admin_set_banned(_user_id uuid, _banned boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app_private.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  if _user_id = auth.uid() then raise exception 'cannot ban yourself'; end if;
  update public.profiles
     set banned_at = case when _banned then now() else null end
   where id = _user_id;
end;
$$;

-- ---------- grants on app_private ----------
revoke all on all functions in schema app_private from public;
grant execute on function
  app_private.can_write(),
  app_private.blocks_with(uuid),
  app_private.blocked_between(uuid, uuid),
  app_private.blocked_profile_ids(),
  app_private.is_event_organizer(uuid),
  app_private.is_event_member(uuid),
  app_private.is_community_member(uuid),
  app_private.is_community_admin(uuid),
  app_private.my_profile_settings(),
  app_private.online_status(uuid[]),
  app_private.nearby_profiles(double precision),
  app_private.join_event(uuid),
  app_private.review_event_join(uuid, uuid, boolean),
  app_private.event_meeting_url(uuid),
  app_private.check_in(uuid, text),
  app_private.request_community_join(uuid, text),
  app_private.review_community_join(uuid, boolean),
  app_private.register_push_token(text, text),
  app_private.admin_overview(),
  app_private.admin_set_banned(uuid, boolean)
to authenticated;
grant execute on function app_private.blocked_between(uuid, uuid) to anon;
grant execute on all functions in schema app_private to service_role;

-- ---------- public SECURITY INVOKER wrappers ----------
create or replace function public.blocks_with(other uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$ select app_private.blocks_with(other); $$;

create or replace function public.blocked_profile_ids()
returns setof uuid language sql stable security invoker set search_path = ''
as $$ select app_private.blocked_profile_ids(); $$;

create or replace function public.my_profile_settings()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app_private.my_profile_settings(); $$;

create or replace function public.online_status(ids uuid[])
returns table (profile_id uuid, is_online boolean) language sql stable security invoker set search_path = ''
as $$ select * from app_private.online_status(ids); $$;

create or replace function public.nearby_profiles(radius_km double precision default 50)
returns table (profile_id uuid, distance_km integer) language sql stable security invoker set search_path = ''
as $$ select * from app_private.nearby_profiles(radius_km); $$;

create or replace function public.join_event(_event_id uuid)
returns text language sql security invoker set search_path = ''
as $$ select app_private.join_event(_event_id); $$;

create or replace function public.review_event_join(_event_id uuid, _profile_id uuid, _approve boolean)
returns text language sql security invoker set search_path = ''
as $$ select app_private.review_event_join(_event_id, _profile_id, _approve); $$;

create or replace function public.event_meeting_url(_event_id uuid)
returns text language sql stable security invoker set search_path = ''
as $$ select app_private.event_meeting_url(_event_id); $$;

create or replace function public.check_in(_event_id uuid, _code text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.check_in(_event_id, _code); $$;

create or replace function public.request_community_join(_community_id uuid, _message text default null)
returns text language sql security invoker set search_path = ''
as $$ select app_private.request_community_join(_community_id, _message); $$;

create or replace function public.review_community_join(_request_id uuid, _approve boolean)
returns text language sql security invoker set search_path = ''
as $$ select app_private.review_community_join(_request_id, _approve); $$;

create or replace function public.register_push_token(_token text, _platform text)
returns void language sql security invoker set search_path = ''
as $$ select app_private.register_push_token(_token, _platform); $$;

create or replace function public.admin_overview()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app_private.admin_overview(); $$;

create or replace function public.admin_set_banned(_user_id uuid, _banned boolean)
returns void language sql security invoker set search_path = ''
as $$ select app_private.admin_set_banned(_user_id, _banned); $$;

-- Conversation list (invoker: relies on direct_messages RLS).
create or replace function public.my_conversations()
returns table (partner_id uuid, last_body text, last_kind public.message_kind, last_sender uuid,
               last_at timestamptz, unread integer)
language sql stable security invoker set search_path = ''
as $$
  with mine as (
    select case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as partner_id, m.*
    from public.direct_messages m
    where m.sender_id = auth.uid() or m.recipient_id = auth.uid()
  ), ranked as (
    select *, row_number() over (partition by partner_id order by created_at desc) as rn from mine
  )
  select r.partner_id, r.body, r.kind, r.sender_id, r.created_at,
         (select count(*)::integer from mine u
           where u.partner_id = r.partner_id and u.recipient_id = auth.uid() and u.read_at is null)
  from ranked r
  where r.rn = 1
    and r.partner_id not in (select app_private.blocked_profile_ids())
  order by r.created_at desc;
$$;

revoke all on function
  public.create_notification(uuid, uuid, text, text, text, text, jsonb),
  public.blocks_with(uuid),
  public.blocked_profile_ids(),
  public.my_profile_settings(),
  public.online_status(uuid[]),
  public.nearby_profiles(double precision),
  public.join_event(uuid),
  public.review_event_join(uuid, uuid, boolean),
  public.event_meeting_url(uuid),
  public.check_in(uuid, text),
  public.request_community_join(uuid, text),
  public.review_community_join(uuid, boolean),
  public.register_push_token(text, text),
  public.admin_overview(),
  public.admin_set_banned(uuid, boolean),
  public.my_conversations()
from public, anon, authenticated;

grant execute on function
  public.blocks_with(uuid),
  public.blocked_profile_ids(),
  public.my_profile_settings(),
  public.online_status(uuid[]),
  public.nearby_profiles(double precision),
  public.join_event(uuid),
  public.review_event_join(uuid, uuid, boolean),
  public.event_meeting_url(uuid),
  public.check_in(uuid, text),
  public.request_community_join(uuid, text),
  public.review_community_join(uuid, boolean),
  public.register_push_token(text, text),
  public.admin_overview(),
  public.admin_set_banned(uuid, boolean),
  public.my_conversations()
to authenticated;
grant execute on function public.create_notification(uuid, uuid, text, text, text, text, jsonb) to service_role;
