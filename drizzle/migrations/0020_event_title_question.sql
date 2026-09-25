-- Every event title reads as a question: "מי בא לכדורגל?". Notifications built in the database use the
-- same rule as the app (src/lib/event-title.ts): add "מי בא ל" unless it's there, end with "?".

create or replace function app_private.who_comes(_title text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when coalesce(btrim(_title), '') = '' then 'מי בא?'
    else (case when btrim(_title) like 'מי בא ל%' then '' else 'מי בא ל' end)
         || rtrim(btrim(_title), '?')
         || case when right(btrim(_title), 1) = '!' then '' else '?' end
  end;
$$;
revoke all on function app_private.who_comes(text) from public;
grant execute on function app_private.who_comes(text) to authenticated, service_role;

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
      app_private.who_comes(_ev.title), '/e/' || _ev.id,
      jsonb_build_object('event_id', _ev.id));
  elsif tg_op = 'INSERT' and new.status = 'approved' then
    perform app_private.create_notification(
      _ev.organizer_id, new.profile_id, 'event_joined',
      coalesce(_name, 'מישהו') || ' הצטרף/ה לאירוע',
      app_private.who_comes(_ev.title), '/e/' || _ev.id,
      jsonb_build_object('event_id', _ev.id));
  elsif tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    perform app_private.create_notification(
      new.profile_id, _ev.organizer_id, 'event_approved',
      '🎉 אושרת לאירוע ' || app_private.who_comes(_ev.title),
      'נתראה שם!', '/e/' || _ev.id,
      jsonb_build_object('event_id', _ev.id));
  end if;
  return new;
end;
$$;

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
    app_private.who_comes(_title), '/e/' || new.event_id, jsonb_build_object('event_id', new.event_id));
  return new;
end;
$$;
