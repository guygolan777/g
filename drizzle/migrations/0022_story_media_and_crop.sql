-- ============================================================
-- mibale · 0022 — a separate story picture/video, and the feed crop point
-- story_image_url / story_video_url: optional media for the event's story only (vertical 9:16).
--   A story video's first frame goes in story_image_url (for the blurred backdrop).
-- media_position: which part of the picture the 4:3 crops show ("50% 30%" → CSS object-position).
-- ============================================================

alter table public.events add column if not exists story_image_url text;
alter table public.events add column if not exists story_video_url text;
alter table public.events add column if not exists media_position text;
alter table public.events drop constraint if exists events_story_media_web;
alter table public.events add constraint events_story_media_web check (
  (story_image_url is null or story_image_url ~ '^https?://') and (story_video_url is null or story_video_url ~ '^https?://'));
alter table public.events drop constraint if exists events_media_position_format;
alter table public.events add constraint events_media_position_format check (
  media_position is null or media_position ~ '^(100|[0-9]{1,2})% (100|[0-9]{1,2})%$');
grant select (story_image_url, story_video_url, media_position) on public.events to authenticated;
grant select (media_position) on public.events to anon;
grant insert (story_image_url, story_video_url, media_position), update (story_image_url, story_video_url, media_position)
  on public.events to authenticated;

-- Recurring series: occurrences keep the crop point (they have no story of their own).
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
        organizer_id, community_id, title, description, category, subcategory, image_url, video_url, media_position,
        starts_at, ends_at, is_online, location_name, city, lat, lng, meeting_url, seats,
        auto_approve, recurrence, recurrence_parent_id, min_age, max_age, gender_target
      ) values (
        new.organizer_id, new.community_id, new.title, new.description, new.category, new.subcategory,
        new.image_url, new.video_url, new.media_position, new.starts_at + _step * _i, new.ends_at + _step * _i, new.is_online,
        new.location_name, new.city, new.lat, new.lng, new.meeting_url, new.seats,
        new.auto_approve, new.recurrence, new.id, new.min_age, new.max_age, new.gender_target
      );
    end loop;
  end if;
  return new;
end;
$$;

-- The event's story: its own media when set (video first), otherwise the event's.
create or replace function app_private.event_story_media(_e public.events)
returns table (media_url text, media_type public.media_kind)
language sql immutable set search_path = ''
as $$
  select case
           when _e.story_video_url is not null then _e.story_video_url
           when _e.story_image_url is not null then _e.story_image_url
           else coalesce(_e.video_url, _e.image_url) end,
         (case
            when _e.story_video_url is not null then 'video'
            when _e.story_image_url is not null then 'image'
            when _e.video_url is not null then 'video'
            else 'image' end)::public.media_kind;
$$;

create or replace function app_private.event_story_sync()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _m record;
begin
  select * into _m from app_private.event_story_media(new);
  if tg_op = 'INSERT' then
    -- Occurrences of a recurring series and events that already started don't get their own story.
    if new.recurrence_parent_id is not null or new.starts_at <= now() then
      return new;
    end if;
    insert into public.stories (author_id, event_id, media_url, media_type, caption, expires_at)
    values (new.organizer_id, new.id, _m.media_url, _m.media_type, '', least(now() + interval '72 hours', new.starts_at))
    on conflict (event_id) where event_id is not null and not is_romantic do nothing;
  else
    update public.stories
    set media_url = _m.media_url,
        media_type = _m.media_type,
        expires_at = least(created_at + interval '72 hours', new.starts_at)
    where event_id = new.id and not is_romantic;
  end if;
  return new;
end;
$$;

drop trigger if exists events_story_sync on public.events;
create trigger events_story_sync
  after insert or update of image_url, video_url, story_image_url, story_video_url, starts_at on public.events
  for each row execute function app_private.event_story_sync();
