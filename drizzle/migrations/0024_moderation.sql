-- ============================================================
-- mibale · 0024 — moderation & user safety
--  • Suspensions: temporary (until a date) or permanent, with a reason the user sees.
--  • Audit log of every staff action (and of automatic ones).
--  • Reports: a snapshot of the reported content (kept even if it's deleted), the user behind it,
--    one open report per reporter per item, a daily cap per reporter.
--  • Auto-hide: a story or event reported by 3 different people is hidden until staff review it.
--  • Word filter: staff-managed words that either flag content for review or block it.
--  • Rate limits on direct messages (flooding, and new accounts messaging many strangers).
--  • Staff tools: warn, suspend, lift, remove content, hide/restore, resolve, roles.
-- Moderators can't act on staff; only admins manage roles.
-- ============================================================

-- ---------- suspensions ----------
alter table public.profiles
  add column if not exists banned_until timestamptz,   -- null + banned_at = permanent
  add column if not exists ban_reason text;
-- (not granted to members: staff read them through admin_user_detail, users through my_moderation_status)

-- A suspension that has run out no longer blocks writing, even before it's lifted.
create or replace function app_private.can_write()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.banned_at is null or p.banned_until <= now())
  );
$$;

create or replace function app_private.is_admin(_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = 'admin'); $$;
revoke all on function app_private.is_admin(uuid) from public;
grant execute on function app_private.is_admin(uuid) to authenticated, service_role;

-- ---------- audit log ----------
create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,   -- null = automatic
  target_user_id uuid references public.profiles (id) on delete set null,
  action text not null,        -- warn | suspend | unsuspend | remove_content | hide | unhide | auto_hide
                               -- | resolve | dismiss | set_role | word_add | word_remove
  target_type text,
  target_id uuid,
  reason text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists moderation_actions_created_idx on public.moderation_actions (created_at desc);
create index if not exists moderation_actions_user_idx on public.moderation_actions (target_user_id, created_at desc);
revoke all on public.moderation_actions from anon, authenticated;
grant select on public.moderation_actions to authenticated;
grant all on public.moderation_actions to service_role;
alter table public.moderation_actions enable row level security;
drop policy if exists "moderation_actions: staff read" on public.moderation_actions;
create policy "moderation_actions: staff read" on public.moderation_actions
  for select to authenticated using (app_private.is_staff(auth.uid()));

create or replace function app_private.log_action(
  _action text, _target_user uuid, _target_type text default null, _target_id uuid default null,
  _reason text default '', _details jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.moderation_actions (actor_id, target_user_id, action, target_type, target_id, reason, details)
  values (auth.uid(), _target_user, _action, _target_type, _target_id, coalesce(_reason, ''), coalesce(_details, '{}'::jsonb));
$$;
revoke all on function app_private.log_action(text, uuid, text, uuid, text, jsonb) from public;

-- ---------- hidden content ----------
alter table public.stories add column if not exists hidden_at timestamptz;
alter table public.events add column if not exists hidden_at timestamptz;

create or replace function app_private.event_hidden(_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select hidden_at is not null from public.events where id = _id), false); $$;
revoke all on function app_private.event_hidden(uuid) from public;
grant execute on function app_private.event_hidden(uuid) to anon, authenticated, service_role;

-- Restrictive: on top of the existing read policies, hidden items are seen only by their owner and staff.
drop policy if exists "stories: hide moderated" on public.stories;
create policy "stories: hide moderated" on public.stories as restrictive
  for select to authenticated
  using (author_id = auth.uid() or app_private.is_staff(auth.uid())
         or (hidden_at is null and (event_id is null or not app_private.event_hidden(event_id))));
drop policy if exists "events: hide moderated" on public.events;
create policy "events: hide moderated" on public.events as restrictive
  for select to authenticated
  using (hidden_at is null or organizer_id = auth.uid() or app_private.is_staff(auth.uid()));
drop policy if exists "events: hide moderated from guests" on public.events;
create policy "events: hide moderated from guests" on public.events as restrictive
  for select to anon using (hidden_at is null);

-- ---------- reports ----------
alter table public.reports alter column reporter_id drop not null;          -- null = the word filter
alter table public.reports
  add column if not exists target_user_id uuid references public.profiles (id) on delete set null,
  add column if not exists snapshot jsonb not null default '{}'::jsonb,
  add column if not exists auto boolean not null default false;
create index if not exists reports_target_idx on public.reports (target_type, target_id, status);
create index if not exists reports_target_user_idx on public.reports (target_user_id, created_at desc);
create unique index if not exists reports_one_open_per_reporter
  on public.reports (reporter_id, target_type, target_id) where status = 'open' and reporter_id is not null;

-- Who is behind a reported item, and what it said at the time.
create or replace function app_private.report_target_info(_type public.report_target, _id uuid)
returns table (owner uuid, snapshot jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  case _type
    when 'profile' then
      return query select p.id, jsonb_build_object('name', p.name, 'bio', p.bio, 'avatar_url', p.avatar_url, 'photos', p.photos)
        from public.profiles p where p.id = _id;
    when 'event' then
      return query select e.organizer_id, jsonb_build_object('title', e.title, 'description', e.description, 'image_url', e.image_url, 'video_url', e.video_url)
        from public.events e where e.id = _id;
    when 'community' then
      return query select c.founder_id, jsonb_build_object('name', c.name, 'description', c.description, 'image_url', c.image_url)
        from public.communities c where c.id = _id;
    when 'story' then
      return query select s.author_id, jsonb_build_object('media_url', s.media_url, 'media_type', s.media_type, 'caption', s.caption, 'event_id', s.event_id)
        from public.stories s where s.id = _id;
    when 'post' then
      return query select p.author_id, jsonb_build_object('body', p.body, 'image_url', p.image_url)
        from public.posts p where p.id = _id;
    when 'message' then
      return query
        select m.sender_id, jsonb_build_object('table', 'direct_messages', 'body', m.body, 'media_url', m.media_url, 'recipient_id', m.recipient_id)
          from public.direct_messages m where m.id = _id
        union all
        select m.sender_id, jsonb_build_object('table', 'event_messages', 'body', m.body, 'media_url', m.media_url, 'event_id', m.event_id)
          from public.event_messages m where m.id = _id
        union all
        select m.sender_id, jsonb_build_object('table', 'community_messages', 'body', m.body, 'media_url', m.media_url, 'community_id', m.community_id)
          from public.community_messages m where m.id = _id
        union all
        select r.author_id, jsonb_build_object('table', 'story_replies', 'body', r.body, 'story_id', r.story_id)
          from public.story_replies r where r.id = _id
        union all
        select c.author_id, jsonb_build_object('table', 'post_comments', 'body', c.body, 'post_id', c.post_id)
          from public.post_comments c where c.id = _id;
  end case;
end;
$$;
revoke all on function app_private.report_target_info(public.report_target, uuid) from public;

create or replace function app_private.reports_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _info record;
begin
  new.auto := coalesce(current_setting('mibale.system_report', true), '') = '1';
  if not new.auto then
    new.reporter_id := auth.uid();
    new.status := 'open';
    new.resolved_by := null;
    new.resolved_at := null;
    if (select count(*) from public.reports
         where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 20 then
      raise exception 'report_limit' using hint = 'too many reports today';
    end if;
  end if;
  select * into _info from app_private.report_target_info(new.target_type, new.target_id) limit 1;
  if not found then raise exception 'report_target_missing'; end if;
  if _info.owner = new.reporter_id then raise exception 'cannot report yourself'; end if;
  new.target_user_id := _info.owner;
  new.snapshot := _info.snapshot;
  -- Reporting a person: attach the last messages they sent the reporter (the reporter shares them by reporting).
  if new.target_type = 'profile' and new.reporter_id is not null then
    new.snapshot := new.snapshot || jsonb_build_object('messages_to_reporter', coalesce((
      select jsonb_agg(jsonb_build_object('body', m.body, 'kind', m.kind, 'media_url', m.media_url, 'at', m.created_at) order by m.created_at)
        from (select * from public.direct_messages
               where sender_id = _info.owner and recipient_id = new.reporter_id
               order by created_at desc limit 10) m), '[]'::jsonb));
  end if;
  return new;
end;
$$;
drop trigger if exists reports_before_insert on public.reports;
create trigger reports_before_insert
  before insert on public.reports
  for each row execute function app_private.reports_before_insert();

create or replace function app_private.notify_staff(_title text, _body text, _link text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare _u uuid;
begin
  for _u in select distinct user_id from public.user_roles where role in ('admin', 'moderator') loop
    perform app_private.create_notification(_u, null, 'moderation_alert', _title, _body, _link, '{}'::jsonb);
  end loop;
end;
$$;
revoke all on function app_private.notify_staff(text, text, text) from public;

-- 3 different people reported the same story/event → hide it until staff look at it.
create or replace function app_private.reports_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _reporters int;
begin
  select count(distinct reporter_id) into _reporters from public.reports
   where target_type = new.target_type and target_id = new.target_id and status = 'open' and reporter_id is not null;
  if _reporters >= 3 and new.target_type in ('story', 'event') then
    if new.target_type = 'story' then
      update public.stories set hidden_at = now() where id = new.target_id and hidden_at is null;
    else
      update public.events set hidden_at = now() where id = new.target_id and hidden_at is null;
    end if;
    if found then
      insert into public.moderation_actions (actor_id, target_user_id, action, target_type, target_id, reason)
      values (null, new.target_user_id, 'auto_hide', new.target_type::text, new.target_id, 'דווח ע״י ' || _reporters || ' משתמשים');
      perform app_private.notify_staff('תוכן הוסתר אוטומטית', 'דווח ע״י ' || _reporters || ' משתמשים — ממתין לבדיקה', '/admin/reports');
    end if;
  elsif (select count(*) from public.reports where target_type = new.target_type and target_id = new.target_id and status = 'open') = 1 then
    perform app_private.notify_staff(
      case when new.auto then 'סינון אוטומטי: תוכן חשוד' else 'דיווח חדש' end,
      new.reason, '/admin/reports');
  end if;
  return null;
end;
$$;
drop trigger if exists reports_after_insert on public.reports;
create trigger reports_after_insert
  after insert on public.reports
  for each row execute function app_private.reports_after_insert();

-- ---------- word filter ----------
create table if not exists public.moderation_words (
  word text primary key check (char_length(word) between 2 and 60 and word = lower(btrim(word))),
  action text not null default 'flag' check (action in ('flag', 'block')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
revoke all on public.moderation_words from anon, authenticated;
grant select, insert, delete on public.moderation_words to authenticated;
grant all on public.moderation_words to service_role;
alter table public.moderation_words enable row level security;
drop policy if exists "moderation_words: staff" on public.moderation_words;
create policy "moderation_words: staff" on public.moderation_words
  for all to authenticated
  using (app_private.is_staff(auth.uid())) with check (app_private.is_staff(auth.uid()));

-- Checks the text columns named in the trigger arguments: TG_ARGV = report target type, then columns.
create or replace function app_private.content_filter()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _row jsonb := to_jsonb(new);
  _text text := '';
  _i int;
  _hit record;
  _owner uuid;
begin
  if app_private.is_staff(auth.uid()) then return new; end if;
  for _i in 1 .. tg_nargs - 1 loop
    _text := _text || ' ' || coalesce(_row ->> tg_argv[_i], '');
  end loop;
  _text := lower(_text);
  if btrim(_text) = '' then return new; end if;
  -- blocking words first
  select word, action into _hit from public.moderation_words
   where position(word in _text) > 0 order by (action = 'block') desc limit 1;
  if not found then return new; end if;
  if _hit.action = 'block' then
    raise exception 'blocked_content' using hint = 'the text contains a blocked word';
  end if;
  if tg_op = 'INSERT' or (to_jsonb(old) is distinct from _row) then
    -- flag after the row exists: report it as the system
    perform set_config('mibale.system_report', '1', true);
    begin
      insert into public.reports (reporter_id, target_type, target_id, reason, details)
      values (null, tg_argv[0]::public.report_target, (_row ->> 'id')::uuid, 'סינון אוטומטי', 'מילה: ' || _hit.word);
    exception when others then null;  -- never fail the user's write because of the filter
    end;
    perform set_config('mibale.system_report', '', true);
  end if;
  return new;
end;
$$;

-- BEFORE triggers block; flagged rows need to exist before they're reported, so flagging runs AFTER.
create or replace function app_private.content_filter_block()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _row jsonb := to_jsonb(new);
  _text text := '';
  _i int;
begin
  if app_private.is_staff(auth.uid()) then return new; end if;
  for _i in 1 .. tg_nargs - 1 loop
    _text := _text || ' ' || coalesce(_row ->> tg_argv[_i], '');
  end loop;
  if exists (select 1 from public.moderation_words where action = 'block' and position(word in lower(_text)) > 0) then
    raise exception 'blocked_content' using hint = 'the text contains a blocked word';
  end if;
  return new;
end;
$$;

do $$
declare
  _t record;
begin
  for _t in select * from (values
    ('direct_messages',    'message',   'body'),
    ('event_messages',     'message',   'body'),
    ('community_messages', 'message',   'body'),
    ('story_replies',      'message',   'body'),
    ('post_comments',      'message',   'body'),
    ('posts',              'post',      'body'),
    ('stories',            'story',     'caption'),
    ('events',             'event',     'title, description'),
    ('communities',        'community', 'name, description'),
    ('profiles',           'profile',   'name, bio')
  ) as v(tbl, target, cols) loop
    execute format('drop trigger if exists content_filter_block on public.%I', _t.tbl);
    execute format('drop trigger if exists content_filter_flag on public.%I', _t.tbl);
    execute format(
      'create trigger content_filter_block before insert or update of %s on public.%I for each row execute function app_private.content_filter_block(%L, %s)',
      _t.cols, _t.tbl, _t.target,
      (select string_agg(quote_literal(btrim(c)), ', ') from unnest(string_to_array(_t.cols, ',')) c));
    execute format(
      'create trigger content_filter_flag after insert or update of %s on public.%I for each row execute function app_private.content_filter(%L, %s)',
      _t.cols, _t.tbl, _t.target,
      (select string_agg(quote_literal(btrim(c)), ', ') from unnest(string_to_array(_t.cols, ',')) c));
  end loop;
end $$;

-- ---------- rate limits ----------
create or replace function app_private.dm_rate_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _joined timestamptz;
begin
  if (select count(*) from public.direct_messages
       where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_limited' using hint = 'too many messages, slow down';
  end if;
  -- New accounts (first week) may open at most 15 new conversations a day.
  select created_at into _joined from public.profiles where id = new.sender_id;
  if _joined > now() - interval '7 days'
     and not exists (select 1 from public.direct_messages
                      where (sender_id = new.sender_id and recipient_id = new.recipient_id)
                         or (sender_id = new.recipient_id and recipient_id = new.sender_id))
     and (select count(distinct recipient_id) from public.direct_messages m
           where m.sender_id = new.sender_id and m.created_at > now() - interval '1 day'
             and not exists (select 1 from public.direct_messages r
                              where r.sender_id = m.recipient_id and r.recipient_id = new.sender_id
                                and r.created_at < m.created_at)) >= 15 then
    raise exception 'rate_limited_new_chats' using hint = 'new accounts can start 15 conversations a day';
  end if;
  return new;
end;
$$;
drop trigger if exists dm_rate_limit on public.direct_messages;
create trigger dm_rate_limit
  before insert on public.direct_messages
  for each row execute function app_private.dm_rate_limit();

-- ---------- my status (the suspended screen) ----------
create or replace function app_private.my_moderation_status()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  _p record;
begin
  if auth.uid() is null then return null; end if;
  -- lift my own suspension once it has run out
  update public.profiles set banned_at = null, banned_until = null, ban_reason = null
   where id = auth.uid() and banned_at is not null and banned_until <= now();
  select banned_at, banned_until, ban_reason into _p from public.profiles where id = auth.uid();
  return jsonb_build_object('banned_at', _p.banned_at, 'banned_until', _p.banned_until, 'ban_reason', coalesce(_p.ban_reason, ''));
end;
$$;

-- ---------- staff actions ----------
create or replace function app_private.assert_can_moderate(_user uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  if _user = auth.uid() then raise exception 'cannot moderate yourself'; end if;
  if app_private.is_staff(_user) and not app_private.is_admin(auth.uid()) then
    raise exception 'only an admin can act on staff';
  end if;
end;
$$;

create or replace function app_private.admin_suspend(_user_id uuid, _until timestamptz, _reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.assert_can_moderate(_user_id);
  update public.profiles
     set banned_at = now(), banned_until = _until, ban_reason = nullif(btrim(coalesce(_reason, '')), '')
   where id = _user_id;
  if not found then raise exception 'user not found'; end if;
  perform app_private.log_action('suspend', _user_id, 'profile', _user_id, _reason,
    jsonb_build_object('until', _until));
end;
$$;

create or replace function app_private.admin_unsuspend(_user_id uuid, _reason text default '')
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.assert_can_moderate(_user_id);
  update public.profiles set banned_at = null, banned_until = null, ban_reason = null where id = _user_id;
  perform app_private.log_action('unsuspend', _user_id, 'profile', _user_id, _reason);
end;
$$;

-- The old on/off switch (older app builds) = permanent suspension / lift, now logged and role-safe.
create or replace function app_private.admin_set_banned(_user_id uuid, _banned boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if _banned then perform app_private.admin_suspend(_user_id, null, '');
  else perform app_private.admin_unsuspend(_user_id, ''); end if;
end;
$$;

create or replace function app_private.admin_warn(_user_id uuid, _reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app_private.assert_can_moderate(_user_id);
  if btrim(coalesce(_reason, '')) = '' then raise exception 'reason required'; end if;
  insert into public.notifications (recipient_id, actor_id, type, title, body, link)
  values (_user_id, null, 'moderation_warning', 'אזהרה מצוות mibale', _reason, '/terms');
  perform app_private.log_action('warn', _user_id, 'profile', _user_id, _reason);
end;
$$;

-- Delete a reported item (its snapshot stays on the reports and in the log).
create or replace function app_private.admin_remove_content(_type public.report_target, _id uuid, _reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _info record;
begin
  if not app_private.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  if _type = 'profile' then raise exception 'suspend the user instead'; end if;
  select * into _info from app_private.report_target_info(_type, _id) limit 1;
  if not found then raise exception 'not found'; end if;
  if app_private.is_staff(_info.owner) and not app_private.is_admin(auth.uid()) then
    raise exception 'only an admin can act on staff';
  end if;
  case _type
    when 'event' then delete from public.events where id = _id;
    when 'community' then delete from public.communities where id = _id;
    when 'story' then delete from public.stories where id = _id;
    when 'post' then delete from public.posts where id = _id;
    when 'message' then
      delete from public.direct_messages where id = _id;
      delete from public.event_messages where id = _id;
      delete from public.community_messages where id = _id;
      delete from public.story_replies where id = _id;
      delete from public.post_comments where id = _id;
  end case;
  update public.reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
   where target_type = _type and target_id = _id and status = 'open';
  perform app_private.log_action('remove_content', _info.owner, _type::text, _id, _reason, _info.snapshot);
  if _info.owner is not null then
    insert into public.notifications (recipient_id, actor_id, type, title, body, link)
    values (_info.owner, null, 'moderation_removed', 'תוכן שלך הוסר ע״י צוות mibale',
            coalesce(nullif(btrim(_reason), ''), 'התוכן הפר את כללי הקהילה'), '/terms');
  end if;
end;
$$;

create or replace function app_private.admin_set_hidden(_type public.report_target, _id uuid, _hidden boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _owner uuid;
begin
  if not app_private.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  if _type = 'story' then
    update public.stories set hidden_at = case when _hidden then now() end where id = _id returning author_id into _owner;
  elsif _type = 'event' then
    update public.events set hidden_at = case when _hidden then now() end where id = _id returning organizer_id into _owner;
  else
    raise exception 'only stories and events can be hidden';
  end if;
  perform app_private.log_action(case when _hidden then 'hide' else 'unhide' end, _owner, _type::text, _id);
end;
$$;

-- Close every open report on an item.
create or replace function app_private.admin_resolve_reports(_type public.report_target, _id uuid, _status public.report_status, _note text default '')
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _owner uuid;
begin
  if not app_private.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  if _status = 'open' then raise exception 'bad status'; end if;
  select target_user_id into _owner from public.reports
   where target_type = _type and target_id = _id order by created_at desc limit 1;
  update public.reports set status = _status, resolved_by = auth.uid(), resolved_at = now()
   where target_type = _type and target_id = _id and status = 'open';
  -- dismissing reports on auto-hidden content brings it back
  if _status = 'dismissed' then
    if _type = 'story' then update public.stories set hidden_at = null where id = _id; end if;
    if _type = 'event' then update public.events set hidden_at = null where id = _id; end if;
  end if;
  perform app_private.log_action(case when _status = 'dismissed' then 'dismiss' else 'resolve' end, _owner, _type::text, _id, _note);
end;
$$;

create or replace function app_private.admin_set_role(_user_id uuid, _role public.app_role)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app_private.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  if _user_id = auth.uid() then raise exception 'cannot change your own role'; end if;
  delete from public.user_roles where user_id = _user_id and role in ('admin', 'moderator');
  if _role <> 'user' then
    insert into public.user_roles (user_id, role) values (_user_id, _role) on conflict do nothing;
  end if;
  perform app_private.log_action('set_role', _user_id, 'profile', _user_id, _role::text);
end;
$$;

-- Words: add/remove with a log line.
create or replace function app_private.admin_set_word(_word text, _action text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _w text := lower(btrim(_word));
begin
  if not app_private.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  if _action is null then
    delete from public.moderation_words where word = _w;
    perform app_private.log_action('word_remove', null, null, null, _w);
  else
    insert into public.moderation_words (word, action, created_by) values (_w, _action, auth.uid())
    on conflict (word) do update set action = excluded.action;
    perform app_private.log_action('word_add', null, null, null, _w, jsonb_build_object('action', _action));
  end if;
end;
$$;

-- ---------- staff views ----------
-- Open reports grouped per item, busiest first.
create or replace function app_private.admin_report_queue(_status text default 'open')
returns table (
  target_type public.report_target, target_id uuid, target_user_id uuid, target_user_name text,
  target_user_avatar text, reports bigint, reporters bigint, reasons text[], auto boolean,
  snapshot jsonb, hidden boolean, first_at timestamptz, last_at timestamptz, status public.report_status)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  return query
  select r.target_type, r.target_id, max(r.target_user_id::text)::uuid, max(p.name), max(p.avatar_url),
         count(*), count(distinct r.reporter_id), array_agg(distinct r.reason), bool_or(r.auto),
         (array_agg(r.snapshot order by r.created_at desc))[1],
         case r.target_type
           when 'story' then coalesce((select s.hidden_at is not null from public.stories s where s.id = r.target_id), false)
           when 'event' then coalesce((select e.hidden_at is not null from public.events e where e.id = r.target_id), false)
           else false end,
         min(r.created_at), max(r.created_at),
         (array_agg(r.status order by r.created_at desc))[1]
    from public.reports r
    left join public.profiles p on p.id = r.target_user_id
   where (_status = 'all' or r.status = 'open')
   group by r.target_type, r.target_id
   order by bool_or(r.status = 'open') desc, count(distinct r.reporter_id) desc, max(r.created_at) desc
   limit 200;
end;
$$;

create or replace function app_private.admin_user_detail(_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  _p public.profiles;
begin
  if not app_private.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  select * into _p from public.profiles where id = _user_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', _p.id, 'name', _p.name, 'avatar_url', _p.avatar_url, 'photos', _p.photos, 'bio', _p.bio,
    'city', _p.city, 'birth_year', _p.birth_year, 'gender', _p.gender, 'created_at', _p.created_at,
    'last_seen_at', _p.last_seen_at, 'is_private', _p.is_private, 'dating_enabled', _p.dating_enabled,
    'banned_at', _p.banned_at, 'banned_until', _p.banned_until, 'ban_reason', _p.ban_reason,
    'email', (select u.email from auth.users u where u.id = _user_id),
    'phone', (select u.phone from auth.users u where u.id = _user_id),
    'roles', (select coalesce(jsonb_agg(role), '[]'::jsonb) from public.user_roles where user_id = _user_id and role <> 'user'),
    'reports_against', (select count(*) from public.reports where target_user_id = _user_id),
    'reports_against_open', (select count(*) from public.reports where target_user_id = _user_id and status = 'open'),
    'reporters_against', (select count(distinct reporter_id) from public.reports where target_user_id = _user_id),
    'reports_filed', (select count(*) from public.reports where reporter_id = _user_id),
    'blocked_by', (select count(*) from public.blocks where blocked_id = _user_id),
    'warnings', (select count(*) from public.moderation_actions where target_user_id = _user_id and action = 'warn'),
    'events', (select count(*) from public.events where organizer_id = _user_id),
    'dms_24h', (select count(*) from public.direct_messages where sender_id = _user_id and created_at > now() - interval '1 day'),
    'chats_24h', (select count(distinct recipient_id) from public.direct_messages where sender_id = _user_id and created_at > now() - interval '1 day'),
    'followers', (select count(*) from public.follows where following_id = _user_id and approved)
  );
end;
$$;

create or replace function app_private.admin_overview()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not app_private.is_staff(auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.profiles set banned_at = null, banned_until = null, ban_reason = null
   where banned_at is not null and banned_until <= now();
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'new_this_week', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'events', (select count(*) from public.events),
    'upcoming_events', (select count(*) from public.events where starts_at > now()),
    'communities', (select count(*) from public.communities),
    'active_stories', (select count(*) from public.stories where expires_at > now()),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'banned', (select count(*) from public.profiles where banned_at is not null),
    'reports_24h', (select count(*) from public.reports where created_at > now() - interval '1 day'),
    'auto_flags', (select count(*) from public.reports where status = 'open' and auto),
    'hidden', (select count(*) from public.stories where hidden_at is not null and expires_at > now())
              + (select count(*) from public.events where hidden_at is not null),
    'actions_7d', (select count(*) from public.moderation_actions where created_at > now() - interval '7 days')
  );
end;
$$;

-- ---------- grants + public wrappers ----------
revoke all on function
  app_private.reports_before_insert(), app_private.reports_after_insert(), app_private.content_filter(),
  app_private.content_filter_block(), app_private.dm_rate_limit(), app_private.my_moderation_status(),
  app_private.assert_can_moderate(uuid), app_private.admin_suspend(uuid, timestamptz, text),
  app_private.admin_unsuspend(uuid, text), app_private.admin_warn(uuid, text),
  app_private.admin_remove_content(public.report_target, uuid, text),
  app_private.admin_set_hidden(public.report_target, uuid, boolean),
  app_private.admin_resolve_reports(public.report_target, uuid, public.report_status, text),
  app_private.admin_set_role(uuid, public.app_role), app_private.admin_set_word(text, text),
  app_private.admin_report_queue(text), app_private.admin_user_detail(uuid)
from public;
grant execute on function
  app_private.my_moderation_status(), app_private.admin_suspend(uuid, timestamptz, text),
  app_private.admin_unsuspend(uuid, text), app_private.admin_warn(uuid, text),
  app_private.admin_remove_content(public.report_target, uuid, text),
  app_private.admin_set_hidden(public.report_target, uuid, boolean),
  app_private.admin_resolve_reports(public.report_target, uuid, public.report_status, text),
  app_private.admin_set_role(uuid, public.app_role), app_private.admin_set_word(text, text),
  app_private.admin_report_queue(text), app_private.admin_user_detail(uuid)
to authenticated, service_role;

create or replace function public.my_moderation_status()
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.my_moderation_status(); $$;
create or replace function public.admin_suspend(_user_id uuid, _until timestamptz, _reason text)
returns void language sql security invoker set search_path = ''
as $$ select app_private.admin_suspend(_user_id, _until, _reason); $$;
create or replace function public.admin_unsuspend(_user_id uuid, _reason text default '')
returns void language sql security invoker set search_path = ''
as $$ select app_private.admin_unsuspend(_user_id, _reason); $$;
create or replace function public.admin_warn(_user_id uuid, _reason text)
returns void language sql security invoker set search_path = ''
as $$ select app_private.admin_warn(_user_id, _reason); $$;
create or replace function public.admin_remove_content(_type public.report_target, _id uuid, _reason text)
returns void language sql security invoker set search_path = ''
as $$ select app_private.admin_remove_content(_type, _id, _reason); $$;
create or replace function public.admin_set_hidden(_type public.report_target, _id uuid, _hidden boolean)
returns void language sql security invoker set search_path = ''
as $$ select app_private.admin_set_hidden(_type, _id, _hidden); $$;
create or replace function public.admin_resolve_reports(_type public.report_target, _id uuid, _status public.report_status, _note text default '')
returns void language sql security invoker set search_path = ''
as $$ select app_private.admin_resolve_reports(_type, _id, _status, _note); $$;
create or replace function public.admin_set_role(_user_id uuid, _role public.app_role)
returns void language sql security invoker set search_path = ''
as $$ select app_private.admin_set_role(_user_id, _role); $$;
create or replace function public.admin_set_word(_word text, _action text)
returns void language sql security invoker set search_path = ''
as $$ select app_private.admin_set_word(_word, _action); $$;
create or replace function public.admin_report_queue(_status text default 'open')
returns table (
  target_type public.report_target, target_id uuid, target_user_id uuid, target_user_name text,
  target_user_avatar text, reports bigint, reporters bigint, reasons text[], auto boolean,
  snapshot jsonb, hidden boolean, first_at timestamptz, last_at timestamptz, status public.report_status)
language sql stable security invoker set search_path = ''
as $$ select * from app_private.admin_report_queue(_status); $$;
create or replace function public.admin_user_detail(_user_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app_private.admin_user_detail(_user_id); $$;
-- admin_overview now also lifts expired suspensions → volatile
create or replace function public.admin_overview()
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.admin_overview(); $$;

revoke all on function
  public.my_moderation_status(), public.admin_suspend(uuid, timestamptz, text), public.admin_unsuspend(uuid, text),
  public.admin_warn(uuid, text), public.admin_remove_content(public.report_target, uuid, text),
  public.admin_set_hidden(public.report_target, uuid, boolean),
  public.admin_resolve_reports(public.report_target, uuid, public.report_status, text),
  public.admin_set_role(uuid, public.app_role), public.admin_set_word(text, text),
  public.admin_report_queue(text), public.admin_user_detail(uuid)
from public, anon;
grant execute on function
  public.my_moderation_status(), public.admin_suspend(uuid, timestamptz, text), public.admin_unsuspend(uuid, text),
  public.admin_warn(uuid, text), public.admin_remove_content(public.report_target, uuid, text),
  public.admin_set_hidden(public.report_target, uuid, boolean),
  public.admin_resolve_reports(public.report_target, uuid, public.report_status, text),
  public.admin_set_role(uuid, public.app_role), public.admin_set_word(text, text),
  public.admin_report_queue(text), public.admin_user_detail(uuid)
to authenticated;
