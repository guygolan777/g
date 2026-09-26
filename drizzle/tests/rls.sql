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

-- Romantic stories reach only people who fit the author's preferences (Maya: men 18–99, any distance).
begin;
update public.profiles set dating_enabled = true where id in ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006');
update public.profiles set pref_gender = 'male', pref_min_age = 18, pref_max_age = 99, pref_distance_km = 200 where id = '00000000-0000-4000-a000-000000000002';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001'); -- Noa, a woman
do $$ begin
  if exists (select 1 from public.stories where is_romantic and author_id = '00000000-0000-4000-a000-000000000002') then
    raise exception 'FAIL: romantic story shown outside the author''s gender preference';
  end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000006'); -- Daniel, a man born 1994
do $$ begin
  if not exists (select 1 from public.stories where is_romantic and author_id = '00000000-0000-4000-a000-000000000002') then
    raise exception 'FAIL: romantic story hidden from someone who fits the preferences';
  end if;
end $$;
reset role;
update public.profiles set pref_max_age = 25 where id = '00000000-0000-4000-a000-000000000002';
set local role authenticated; select pg_temp.as_user('00000000-0000-4000-a000-000000000006');
do $$ begin
  if exists (select 1 from public.stories where is_romantic and author_id = '00000000-0000-4000-a000-000000000002') then
    raise exception 'FAIL: romantic story shown outside the author''s age range';
  end if;
end $$;
rollback;

-- Mutual: a woman looking for men and a woman looking for women never see each other.
begin;
update public.profiles set dating_enabled = true, pref_gender = 'male', pref_min_age = 18, pref_max_age = 99, pref_distance_km = 200
  where id = '00000000-0000-4000-a000-000000000001'; -- Noa
update public.profiles set dating_enabled = true, pref_gender = 'female', pref_min_age = 18, pref_max_age = 99, pref_distance_km = 200
  where id = '00000000-0000-4000-a000-000000000002'; -- Maya
insert into public.stories (author_id, media_url, media_type, caption, is_romantic)
  values ('00000000-0000-4000-a000-000000000001', 'https://example.com/n.jpg', 'image', 'noa', true);
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
do $$ begin
  if exists (select 1 from public.stories where is_romantic and author_id = '00000000-0000-4000-a000-000000000002') then
    raise exception 'FAIL: Noa (wants men) sees Maya''s romantic story';
  end if;
  if exists (select 1 from public.mutual_fits(array['00000000-0000-4000-a000-000000000002'::uuid])) then
    raise exception 'FAIL: Maya in Noa''s swing';
  end if;
  if not exists (select 1 from public.mutual_fits(array['00000000-0000-4000-a000-000000000006'::uuid])) then
    raise exception 'FAIL: Daniel (man, wants women) missing from Noa''s swing';
  end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
do $$ begin
  if exists (select 1 from public.stories where is_romantic and author_id = '00000000-0000-4000-a000-000000000001') then
    raise exception 'FAIL: Maya (wants women) sees Noa''s story though Noa wants men';
  end if;
  if exists (select 1 from public.mutual_fits(array['00000000-0000-4000-a000-000000000001'::uuid])) then
    raise exception 'FAIL: Noa in Maya''s swing';
  end if;
end $$;
rollback;

-- Empty swing: a count of people hidden by preferences (mine or theirs); new profiles default to no distance limit.
begin;
update public.profiles set dating_enabled = true, pref_min_age = 18, pref_max_age = 18
  where id = '00000000-0000-4000-a000-000000000001'; -- Noa: nobody fits an 18–18 range
set local role authenticated; select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
do $$ begin
  if coalesce(public.dating_hidden_count(), 0) = 0 then raise exception 'FAIL: hidden count is 0 with an impossible age range'; end if;
end $$;
reset role;
do $$ begin
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'pref_distance_km') <> '200' then
    raise exception 'FAIL: pref_distance_km default is not 200 (unlimited)';
  end if;
end $$;
rollback;

-- Private profile (Shira): strangers see only name/photo/age; follow = request; hidden from attendee lists.
begin;
update public.profiles set is_private = true, dating_enabled = false where id = '00000000-0000-4000-a000-000000000003';
update public.profiles set dating_enabled = false where id = '00000000-0000-4000-a000-000000000009';
insert into public.event_participants (event_id, profile_id, status)
  values ('20000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003', 'approved')
  on conflict (event_id, profile_id) do update set status = 'approved';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000009'); -- Yoni: a stranger
do $$
declare _c record;
begin
  select * into _c from public.profile_cards where id = '00000000-0000-4000-a000-000000000003';
  if _c.name is null or _c.birth_year is null then raise exception 'FAIL: private profile hides its name/age'; end if;
  if _c.full_access or _c.bio <> '' or _c.city is not null or cardinality(_c.photos) > 0 or cardinality(_c.hobbies) > 0 then
    raise exception 'FAIL: private profile details visible to a stranger';
  end if;
  -- (direct reads of bio etc. are revoked by 0019 — tested in rls-lockdown.sql)
  if exists (select 1 from public.event_participants where profile_id = '00000000-0000-4000-a000-000000000003' and event_id = '20000000-0000-4000-a000-000000000001') then
    raise exception 'FAIL: private profile listed as an attendee to a stranger';
  end if;
  if not exists (select 1 from public.event_approved_counts(array['20000000-0000-4000-a000-000000000001'::uuid]) c where c.approved >= 2) then
    raise exception 'FAIL: attendee count leaves out the private attendee';
  end if;
  if exists (select 1 from public.follows where following_id = '00000000-0000-4000-a000-000000000003') then
    raise exception 'FAIL: private profile''s followers listed to a stranger';
  end if;
  insert into public.follows (follower_id, following_id) values (auth.uid(), '00000000-0000-4000-a000-000000000003');
  if (select approved from public.follows where follower_id = auth.uid() and following_id = '00000000-0000-4000-a000-000000000003') then
    raise exception 'FAIL: following a private profile was approved without asking';
  end if;
  if (select full_access from public.profile_cards where id = '00000000-0000-4000-a000-000000000003') then
    raise exception 'FAIL: a pending request unlocks the profile';
  end if;
  begin
    update public.follows set approved = true where follower_id = auth.uid() and following_id = '00000000-0000-4000-a000-000000000003';
    if found then raise exception 'FAIL: requester approved their own request'; end if;
  exception when insufficient_privilege or check_violation then null; end;
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001'); -- Noa: an approved follower + the organizer
do $$ begin
  if not (select full_access from public.profile_cards where id = '00000000-0000-4000-a000-000000000003') then
    raise exception 'FAIL: approved follower can''t see the private profile';
  end if;
  if not exists (select 1 from public.event_participants where profile_id = '00000000-0000-4000-a000-000000000003' and event_id = '20000000-0000-4000-a000-000000000001') then
    raise exception 'FAIL: organizer can''t see a private attendee';
  end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000003'); -- Shira approves Yoni
do $$ begin
  if not exists (select 1 from public.notifications where type = 'follow_request' and actor_id = '00000000-0000-4000-a000-000000000009') then
    raise exception 'FAIL: no follow request notification';
  end if;
  update public.follows set approved = true where follower_id = '00000000-0000-4000-a000-000000000009' and following_id = auth.uid();
  if exists (select 1 from public.notifications where type = 'follow_request' and actor_id = '00000000-0000-4000-a000-000000000009') then
    raise exception 'FAIL: request notification left after approving';
  end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000009');
do $$ begin
  if not (select full_access from public.profile_cards where id = '00000000-0000-4000-a000-000000000003') then
    raise exception 'FAIL: approved request doesn''t unlock the profile';
  end if;
  if not exists (select 1 from public.notifications where type = 'follow_accepted') then raise exception 'FAIL: no approval notification'; end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-a000-000000000004'); -- Tamar requests, then Shira goes public
insert into public.follows (follower_id, following_id) values ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000003');
select pg_temp.as_user('00000000-0000-4000-a000-000000000003');
update public.profiles set is_private = false where id = '00000000-0000-4000-a000-000000000003';
do $$ begin
  if not (select approved from public.follows where follower_id = '00000000-0000-4000-a000-000000000004' and following_id = auth.uid()) then
    raise exception 'FAIL: going public didn''t approve waiting requests';
  end if;
end $$;
rollback;

-- Event video: the event's story plays the video; image_url stays the still frame.
begin;
set local role authenticated; select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
do $$
declare _id uuid;
begin
  insert into public.events (organizer_id, title, category, starts_at, is_online, location_name, seats, image_url, video_url)
  values (auth.uid(), 'וידאו', 'ball', now() + interval '2 days', false, 'x', 10,
          'https://example.com/frame.jpg', 'https://example.com/clip.mp4')
  returning id into _id;
  if not exists (select 1 from public.stories where event_id = _id and media_type = 'video' and media_url = 'https://example.com/clip.mp4') then
    raise exception 'FAIL: video event story is not the video';
  end if;
  update public.events set video_url = null where id = _id;
  if not exists (select 1 from public.stories where event_id = _id and media_type = 'image' and media_url = 'https://example.com/frame.jpg') then
    raise exception 'FAIL: removing the video didn''t fall back to the picture';
  end if;
  begin
    update public.events set video_url = 'javascript:alert(1)' where id = _id;
    raise exception 'FAIL: non-web video url accepted';
  exception when check_violation then null; end;
end $$;
rollback;

-- Separate story media: the story uses it (video first); clearing it falls back to the event's media.
begin;
set local role authenticated; select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
do $$
declare _id uuid;
begin
  insert into public.events (organizer_id, title, category, starts_at, is_online, location_name, seats, image_url, media_position)
  values (auth.uid(), 'סטורי נפרד', 'ball', now() + interval '2 days', false, 'x', 10, 'https://example.com/wide.jpg', '50% 20%')
  returning id into _id;
  update public.events set story_image_url = 'https://example.com/tall.jpg' where id = _id;
  if not exists (select 1 from public.stories where event_id = _id and media_type = 'image' and media_url = 'https://example.com/tall.jpg') then
    raise exception 'FAIL: story ignores its own picture';
  end if;
  update public.events set story_video_url = 'https://example.com/tall.mp4' where id = _id;
  if not exists (select 1 from public.stories where event_id = _id and media_type = 'video' and media_url = 'https://example.com/tall.mp4') then
    raise exception 'FAIL: story ignores its own video';
  end if;
  update public.events set story_video_url = null, story_image_url = null where id = _id;
  if not exists (select 1 from public.stories where event_id = _id and media_type = 'image' and media_url = 'https://example.com/wide.jpg') then
    raise exception 'FAIL: story didn''t fall back to the event picture';
  end if;
  begin
    update public.events set media_position = 'top; background:red' where id = _id;
    raise exception 'FAIL: free-text media_position accepted';
  exception when check_violation then null; end;
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

-- Account deletion: only your own account, everything of yours goes with it; guests can't call it.
begin;
set local role anon;
do $$ begin
  begin
    perform public.delete_my_account();
    raise exception 'FAIL: anon deleted an account';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000003');
select public.delete_my_account();
reset role;
do $$ begin
  if exists (select 1 from auth.users where id = '00000000-0000-4000-a000-000000000003') then raise exception 'FAIL: auth user not deleted'; end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-000000000003') then raise exception 'FAIL: profile not deleted'; end if;
  if exists (select 1 from public.events where organizer_id = '00000000-0000-4000-a000-000000000003') then raise exception 'FAIL: events not deleted'; end if;
  if (select count(*) from auth.users) < 9 then raise exception 'FAIL: deleted other accounts'; end if;
end $$;
rollback;

-- Phones & contacts: matching by hash only, notify on join, blocks respected, guests can't call.
begin;
update auth.users set phone = '972501110001', phone_confirmed_at = now() where id = '00000000-0000-4000-a000-000000000002';
update auth.users set phone = '972501110002', phone_confirmed_at = now() where id = '00000000-0000-4000-a000-000000000003';
do $$ begin
  if not exists (select 1 from app_private.phone_hashes where profile_id = '00000000-0000-4000-a000-000000000002' and phone_hash = app_private.phone_hash('972501110001'))
     or not exists (select 1 from app_private.phone_hashes where profile_id = '00000000-0000-4000-a000-000000000003' and phone_hash = app_private.phone_hash('972501110002')) then
    raise exception 'FAIL: phone hashes not stored'; end if;
  if (select count(*) from app_private.phone_hashes) <> 10 then raise exception 'FAIL: seed phones not hashed'; end if;
  if exists (select 1 from app_private.phone_hashes where phone_hash like '9725%') then raise exception 'FAIL: raw phone stored'; end if;
end $$;
set local role anon;
do $$ begin
  begin
    perform public.sync_contacts(array[app_private.phone_hash('972501110001')]);
    raise exception 'FAIL: anon synced contacts';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
do $$
declare _n integer;
begin
  select count(*) into _n from public.sync_contacts(array[
    app_private.phone_hash('972501110001'), app_private.phone_hash('972501110002'),
    app_private.phone_hash('972509999999'), 'not-a-hash']);
  if _n <> 2 then raise exception 'FAIL: expected 2 contact matches, got %', _n; end if;
  if public.my_contacts_count() <> 3 then raise exception 'FAIL: expected 3 stored hashes, got %', public.my_contacts_count(); end if;
  begin
    perform 1 from app_private.contact_hashes;
    raise exception 'FAIL: contact_hashes readable by client';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Someone Noa has saved (…9999999) signs up later → Noa is notified.
update auth.users set phone = '972509999999', phone_confirmed_at = now() where id = '00000000-0000-4000-a000-000000000004';
do $$ begin
  if not exists (select 1 from public.notifications where recipient_id = '00000000-0000-4000-a000-000000000001'
                 and type = 'contact_joined' and actor_id = '00000000-0000-4000-a000-000000000004') then
    raise exception 'FAIL: no contact_joined notification'; end if;
end $$;
-- Blocked people are never matched.
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001');
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
do $$ begin
  if exists (select 1 from public.sync_contacts(array[app_private.phone_hash('972501110001')])) then
    raise exception 'FAIL: blocked contact matched'; end if;
  if public.clear_my_contacts() < 3 then raise exception 'FAIL: clear contacts'; end if;
  begin
    perform public.sync_contacts(array_fill('a'::text, array[3001]));
    raise exception 'FAIL: oversized sync accepted';
  exception when invalid_parameter_value then null; end;
end $$;
do $$ begin
  if public.my_contacts_count() <> 0 then raise exception 'FAIL: contacts left after clear'; end if;
end $$;
rollback;

-- Paid events: joining never approves by itself; payment link only for requesters/organizer.
begin;
update public.events set price = 50, auto_approve = true, payment_link = 'https://www.bitpay.co.il/app/me/demo'
where id = '20000000-0000-4000-a000-000000000001';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000009');
do $$ begin
  if public.event_payment_link('20000000-0000-4000-a000-000000000001') is not null then
    raise exception 'FAIL: payment link visible before joining'; end if;
  if public.join_event('20000000-0000-4000-a000-000000000001') <> 'pending' then
    raise exception 'FAIL: paid auto-approve event approved without payment'; end if;
  if public.event_payment_link('20000000-0000-4000-a000-000000000001') is null then
    raise exception 'FAIL: requester cannot see payment link'; end if;
  begin
    perform payment_link from public.events limit 1;
    raise exception 'FAIL: payment_link column readable';
  exception when insufficient_privilege then null; end;
end $$;
-- Free auto-approve events still approve instantly.
reset role;
update public.events set price = 0 where id = '20000000-0000-4000-a000-000000000019';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000009');
do $$ begin
  if public.join_event('20000000-0000-4000-a000-000000000019') <> 'approved' then
    raise exception 'FAIL: free auto event not approved'; end if;
end $$;
rollback;

-- Stories are events: auto-created with the event, gone when full; clients can post only romantic stories.
begin;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
do $$
declare _e uuid;
begin
  insert into public.events (organizer_id, title, category, starts_at, seats, is_online)
  values (auth.uid(), 'בדיקת סטורי', 'fun', now() + interval '5 days', 2, true) returning id into _e;
  if not exists (select 1 from public.stories where event_id = _e and expires_at <= now() + interval '72 hours 1 minute') then
    raise exception 'FAIL: no auto story (72h cap) for new event'; end if;
  update public.events set starts_at = now() + interval '3 hours' where id = _e;
  if not exists (select 1 from public.stories where event_id = _e and expires_at <= now() + interval '3 hours 1 minute') then
    raise exception 'FAIL: story expiry not capped at event start'; end if;
  begin
    insert into public.stories (author_id, media_url, caption) values (auth.uid(), 'https://x/y.jpg', 'standalone');
    raise exception 'FAIL: standalone story allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('mibale.test_event', _e::text, true);
end $$;
-- Someone else fills the last seat (2 seats: organizer + 1) → story hidden from others.
reset role;
insert into public.event_participants (event_id, profile_id, status)
values (current_setting('mibale.test_event')::uuid, '00000000-0000-4000-a000-000000000005', 'approved');
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000007');
do $$ begin
  if exists (select 1 from public.stories where event_id = current_setting('mibale.test_event')::uuid) then
    raise exception 'FAIL: full event story still visible'; end if;
end $$;
rollback;

select 'RLS tests passed' as result;
