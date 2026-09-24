-- Stories are events.
-- • Every new event automatically gets one story (author = organizer), visible until the earliest of:
--   72 hours after posting, the event's start, or the event filling up.
-- • Clients can no longer post standalone stories; the only client-created stories are the
--   romantic ones in dating mode (separate feature, unchanged).

-- Events without an image still get a story (the viewer renders the event card instead).
alter table public.stories alter column media_url drop not null;

-- Old standalone (non-event, non-romantic) stories don't fit the model anymore.
delete from public.stories where event_id is null and not is_romantic;

-- One event story per event.
delete from public.stories s
using public.stories d
where s.event_id is not null and not s.is_romantic and d.event_id = s.event_id and not d.is_romantic
  and (d.created_at, d.id) < (s.created_at, s.id);
create unique index stories_one_per_event on public.stories (event_id) where event_id is not null and not is_romantic;

-- Room left (organizer counts as an approved participant, as in join_event).
create or replace function app_private.event_has_room(_event_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select e.seats >= 9999
      or (select count(*) from public.event_participants p where p.event_id = e.id and p.status = 'approved') < e.seats
  from public.events e where e.id = _event_id;
$$;

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
    values (new.organizer_id, new.id, new.image_url, 'image', '', least(now() + interval '72 hours', new.starts_at))
    on conflict (event_id) where event_id is not null and not is_romantic do nothing;
  else
    update public.stories
    set media_url = new.image_url,
        expires_at = least(created_at + interval '72 hours', new.starts_at)
    where event_id = new.id and not is_romantic;
  end if;
  return new;
end;
$$;

create trigger events_story_sync
  after insert or update of image_url, starts_at on public.events
  for each row execute function app_private.event_story_sync();

-- Existing upcoming events get their story now.
insert into public.stories (author_id, event_id, media_url, media_type, caption, expires_at)
select e.organizer_id, e.id, e.image_url, 'image', '', least(now() + interval '72 hours', e.starts_at)
from public.events e
where e.starts_at > now() and e.recurrence_parent_id is null
on conflict (event_id) where event_id is not null and not is_romantic do nothing;

-- Read: event stories disappear once the event is full; romantic rules unchanged.
drop policy "stories: read active" on public.stories;
create policy "stories: read active" on public.stories
  for select to authenticated
  using (author_id = auth.uid()
         or (expires_at > now()
             and not app_private.blocked_between(auth.uid(), author_id)
             and (case when is_romantic then app_private.dating_on() and app_private.dating_on_for(author_id)
                       else event_id is not null and app_private.event_has_room(event_id) end)));

-- Write: clients may only post romantic stories (event stories come from the trigger above).
drop policy "stories: create own" on public.stories;
create policy "stories: create own" on public.stories
  for insert to authenticated
  with check (author_id = auth.uid() and app_private.can_write() and is_romantic and app_private.dating_on());
