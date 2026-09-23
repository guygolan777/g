-- RLS / grant assertions against the demo seed. Each block raises on failure.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(_id text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', _id, true);
$$;

-- Guests: no profiles at all; events without exact location or participants; counts only.
begin; set local role anon;
do $$ begin
  begin perform name from public.profiles limit 1; raise exception 'FAIL: anon read profiles';
  exception when insufficient_privilege then null; end;
  begin perform location_name from public.events limit 1; raise exception 'FAIL: anon read exact location';
  exception when insufficient_privilege then null; end;
  perform id, title, city, description from public.events limit 1;
  if (select count(*) from public.guest_event_counts(array(select id from public.events))) = 0 then raise exception 'FAIL: guest counts'; end if;
  if (public.guest_stats() ->> 'members')::int < 10 then raise exception 'FAIL: guest stats'; end if;
  begin perform 1 from public.event_participants limit 1; raise exception 'FAIL: anon read participants';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- Members never see sensitive profile columns or meeting_url directly.
begin; set local role authenticated; select pg_temp.as_user('00000000-0000-4000-a000-000000000003');
do $$ begin
  begin perform birth_date from public.profiles limit 1; raise exception 'FAIL: birth_date readable';
  exception when insufficient_privilege then null; end;
  begin perform pref_min_age from public.profiles limit 1; raise exception 'FAIL: pref readable';
  exception when insufficient_privilege then null; end;
  begin perform meeting_url from public.events limit 1; raise exception 'FAIL: meeting_url readable';
  exception when insufficient_privilege then null; end;
  if (select public.my_profile_settings() ->> 'birth_date') is null then raise exception 'FAIL: my_profile_settings'; end if;
  -- meeting_url only for approved participants (Shira is not in the book club).
  if public.event_meeting_url('20000000-0000-4000-a000-000000000008') is not null then raise exception 'FAIL: meeting_url leaked'; end if;
  -- notifications cannot be written by clients
  begin
    insert into public.notifications (recipient_id, type, title) values ('00000000-0000-4000-a000-000000000001', 'x', 'spam');
    raise exception 'FAIL: client inserted notification';
  exception when insufficient_privilege then null; end;
  -- roles are not self-assignable
  begin
    insert into public.user_roles (user_id, role) values (auth.uid(), 'admin');
    raise exception 'FAIL: self-assigned role';
  exception when insufficient_privilege then null; end;
  -- cannot unban yourself / edit banned_at
  begin
    update public.profiles set banned_at = null where id = auth.uid();
    raise exception 'FAIL: banned_at writable';
  exception when insufficient_privilege then null; end;
  -- other people's tickets are invisible
  if exists (select 1 from public.event_tickets where profile_id <> auth.uid()) then raise exception 'FAIL: foreign tickets visible'; end if;
  -- admin overview is staff-only
  begin perform public.admin_overview(); raise exception 'FAIL: admin_overview for member';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
rollback;

-- Join flow: manual approval → pending → organizer approves → ticket + notification.
begin;
set local role authenticated; select pg_temp.as_user('00000000-0000-4000-a000-000000000010');
do $$ begin
  if public.join_event('20000000-0000-4000-a000-000000000002') <> 'pending' then raise exception 'FAIL: expected pending'; end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
do $$ begin
  perform public.review_event_join('20000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000010', true);
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000010');
do $$ begin
  if not exists (select 1 from public.event_tickets where event_id = '20000000-0000-4000-a000-000000000002') then raise exception 'FAIL: no ticket'; end if;
  if not exists (select 1 from public.notifications where type = 'event_approved') then raise exception 'FAIL: no approval notification'; end if;
  -- the organizer cannot leave their own event
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
do $$ begin
  begin
    delete from public.event_participants where event_id = '20000000-0000-4000-a000-000000000002' and profile_id = auth.uid();
    raise exception 'FAIL: organizer left';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
rollback;

-- Blocking severs follows both ways and hides profiles.
begin;
set local role authenticated; select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
insert into public.follows values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006') on conflict do nothing;
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006');
select pg_temp.as_user('00000000-0000-4000-a000-000000000006');
do $$ begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-000000000001') then raise exception 'FAIL: blocked profile visible'; end if;
  if exists (select 1 from public.follows where follower_id = '00000000-0000-4000-a000-000000000001' and following_id = auth.uid()) then raise exception 'FAIL: follow survived block'; end if;
  begin
    insert into public.direct_messages (sender_id, recipient_id, body) values (auth.uid(), '00000000-0000-4000-a000-000000000001', 'hi');
    raise exception 'FAIL: DM to blocker';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- Audience: an event limited to women / 30 km is hidden from people who don't match.
begin;
update public.events set gender_target = 'female' where id = '20000000-0000-4000-a000-000000000011';
update public.profile_locations set lat = 29.5577, lng = 34.9519 where profile_id = '00000000-0000-4000-a000-000000000004'; -- Tamar → Eilat
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000007'); -- Omer (male, not a participant)
do $$ begin
  if exists (select 1 from public.events where id = '20000000-0000-4000-a000-000000000011'
             and not exists (select 1 from public.event_participants p where p.event_id = events.id and p.profile_id = auth.uid()))
  then raise exception 'FAIL: female-only event visible to a man'; end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000004'); -- Tamar in Eilat
do $$ begin
  if exists (select 1 from public.events where id = '20000000-0000-4000-a000-000000000018') then
    raise exception 'FAIL: 30 km event visible 250 km away';
  end if;
end $$;
rollback;

-- Romantic stories are visible only with dating mode on.
begin;
update public.profiles set dating_enabled = false where id = '00000000-0000-4000-a000-000000000007';
set local role authenticated; select pg_temp.as_user('00000000-0000-4000-a000-000000000007');
do $$ begin
  if exists (select 1 from public.stories where is_romantic) then raise exception 'FAIL: romantic story visible with dating off'; end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000006');
do $$ begin
  if not exists (select 1 from public.stories where is_romantic) then raise exception 'FAIL: romantic story hidden with dating on'; end if;
end $$;
rollback;

-- Date invites: sender creates, a DM + notification appear, only the recipient answers.
begin;
set local role authenticated; select pg_temp.as_user('00000000-0000-4000-a000-000000000006');
insert into public.date_invites (sender_id, recipient_id, title, starts_at)
values ('00000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000001', 'קפה', now() + interval '1 day');
do $$ begin
  if not exists (select 1 from public.direct_messages where kind = 'date_invite' and sender_id = auth.uid()) then raise exception 'FAIL: no invite message'; end if;
  update public.date_invites set status = 'approved' where sender_id = auth.uid();
  if exists (select 1 from public.date_invites where sender_id = auth.uid() and status = 'approved') then raise exception 'FAIL: sender answered own invite'; end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
update public.date_invites set status = 'approved' where recipient_id = auth.uid();
select pg_temp.as_user('00000000-0000-4000-a000-000000000006');
do $$ begin
  if not exists (select 1 from public.notifications where type = 'date_answer') then raise exception 'FAIL: no answer notification'; end if;
end $$;
rollback;

-- Heart off: can't swipe, can't be swiped, romantic stories hidden both ways; likes & matches stay readable.
begin;
update public.profiles set dating_enabled = true where id in ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006');
insert into public.romantic_likes (liker_id, liked_id, action) values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006', 'like');
update public.profiles set dating_enabled = false where id = '00000000-0000-4000-a000-000000000002'; -- Maya closes her heart
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000006');
do $$ begin
  begin
    insert into public.romantic_likes (liker_id, liked_id) values (auth.uid(), '00000000-0000-4000-a000-000000000002');
    raise exception 'FAIL: liked someone whose heart is off';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from public.stories where is_romantic) then raise exception 'FAIL: closed author''s romantic story visible'; end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
do $$ begin
  begin
    insert into public.romantic_likes (liker_id, liked_id) values (auth.uid(), '00000000-0000-4000-a000-000000000006');
    raise exception 'FAIL: swiped with heart off';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.profiles set dating_enabled = false where id = '00000000-0000-4000-a000-000000000001';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
do $$ begin
  if not exists (select 1 from public.romantic_likes where liker_id = auth.uid()) then raise exception 'FAIL: "liked" list lost with heart off'; end if;
end $$;
rollback;

select 'RLS tests passed' as result;
