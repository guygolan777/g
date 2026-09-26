-- ============================================================
-- mibale · 0021 — a short video for an event
-- image_url stays the still picture every view can show (cards, map, WhatsApp previews); for a video
-- event it's the video's first frame. video_url (≤30 s, checked in the app) plays on the event page
-- and makes the event's story a video.
-- ============================================================

alter table public.events add column if not exists video_url text;
alter table public.events drop constraint if exists events_video_url_https;
alter table public.events add constraint events_video_url_https check (video_url is null or video_url ~ '^https?://');
grant select (video_url) on public.events to authenticated;
grant insert (video_url), update (video_url) on public.events to authenticated;

-- Recurring series: occurrences carry the video too.
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
        organizer_id, community_id, title, description, category, subcategory, image_url, video_url,
        starts_at, ends_at, is_online, location_name, city, lat, lng, meeting_url, seats,
        auto_approve, recurrence, recurrence_parent_id, min_age, max_age, gender_target
      ) values (
        new.organizer_id, new.community_id, new.title, new.description, new.category, new.subcategory,
        new.image_url, new.video_url, new.starts_at + _step * _i, new.ends_at + _step * _i, new.is_online,
        new.location_name, new.city, new.lat, new.lng, new.meeting_url, new.seats,
        new.auto_approve, new.recurrence, new.id, new.min_age, new.max_age, new.gender_target
      );
    end loop;
  end if;
  return new;
end;
$$;

-- The event's story shows the video when there is one.
create or replace function app_private.event_story_sync()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Occurrences of a recurring series and events that already started don't get their own story.
    if new.recurrence_parent_id is not null or new.starts_at <= now() then
      return new;
    end if;
    insert into public.stories (author_id, event_id, media_url, media_type, caption, expires_at)
    values (new.organizer_id, new.id, coalesce(new.video_url, new.image_url),
            (case when new.video_url is not null then 'video' else 'image' end)::public.media_kind,
            '', least(now() + interval '72 hours', new.starts_at))
    on conflict (event_id) where event_id is not null and not is_romantic do nothing;
  else
    update public.stories
    set media_url = coalesce(new.video_url, new.image_url),
        media_type = (case when new.video_url is not null then 'video' else 'image' end)::public.media_kind,
        expires_at = least(created_at + interval '72 hours', new.starts_at)
    where event_id = new.id and not is_romantic;
  end if;
  return new;
end;
$$;

drop trigger if exists events_story_sync on public.events;
create trigger events_story_sync
  after insert or update of image_url, video_url, starts_at on public.events
  for each row execute function app_private.event_story_sync();
