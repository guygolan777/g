-- ============================================================
-- mibale · 0007 — price, audience visibility, romantic stories, date invites
-- ============================================================

-- ---------- events: price + max distance ----------
alter table public.events
  add column price numeric(10, 2) not null default 0 check (price >= 0),
  add column max_distance_km smallint check (max_distance_km is null or max_distance_km > 0);

grant select (price, max_distance_km) on public.events to anon, authenticated;
grant insert (price, max_distance_km) on public.events to authenticated;
grant update (price, max_distance_km) on public.events to authenticated;

-- Only people who match an event's audience (gender, age, distance) can see it.
-- The organizer and existing participants always can.
create or replace function app_private.event_visible(
  _event_id uuid, _organizer uuid, _gender public.audience_gender,
  _min_age smallint, _max_age smallint, _max_km smallint,
  _lat double precision, _lng double precision
)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  _me public.profiles;
  _age integer;
  _loc public.profile_locations;
begin
  if auth.uid() is null then return true; end if;
  if _organizer = auth.uid() then return true; end if;
  if app_private.blocked_between(auth.uid(), _organizer) then return false; end if;
  if exists (select 1 from public.event_participants p where p.event_id = _event_id and p.profile_id = auth.uid()) then
    return true;
  end if;
  if app_private.is_staff(auth.uid()) then return true; end if;

  select * into _me from public.profiles where id = auth.uid();
  if _gender <> 'all' and _me.gender::text is distinct from _gender::text then return false; end if;
  if _me.birth_date is not null and (_min_age is not null or _max_age is not null) then
    _age := extract(year from age(_me.birth_date))::integer;
    if (_min_age is not null and _age < _min_age) or (_max_age is not null and _age > _max_age) then return false; end if;
  end if;
  if _max_km is not null and _lat is not null and _lng is not null then
    select * into _loc from public.profile_locations where profile_id = auth.uid();
    if found and 6371 * 2 * asin(sqrt(
         power(sin(radians(_lat - _loc.lat) / 2), 2) +
         cos(radians(_loc.lat)) * cos(radians(_lat)) * power(sin(radians(_lng - _loc.lng) / 2), 2))) > _max_km then
      return false;
    end if;
  end if;
  return true;
end;
$$;
revoke all on function app_private.event_visible(uuid, uuid, public.audience_gender, smallint, smallint, smallint, double precision, double precision) from public;
grant execute on function app_private.event_visible(uuid, uuid, public.audience_gender, smallint, smallint, smallint, double precision, double precision) to authenticated, service_role;

drop policy "events: members read" on public.events;
create policy "events: members read (audience)" on public.events
  for select to authenticated
  using (app_private.event_visible(id, organizer_id, gender_target, min_age, max_age, max_distance_km, lat, lng));

-- ---------- romantic stories (visible only with dating mode on) ----------
alter table public.stories add column is_romantic boolean not null default false;

create or replace function app_private.dating_on()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select dating_enabled from public.profiles where id = auth.uid()), false); $$;
revoke all on function app_private.dating_on() from public;
grant execute on function app_private.dating_on() to authenticated, service_role;

drop policy "stories: read active" on public.stories;
create policy "stories: read active" on public.stories
  for select to authenticated
  using (author_id = auth.uid()
         or (expires_at > now()
             and not app_private.blocked_between(auth.uid(), author_id)
             and (not is_romantic or app_private.dating_on())));

-- ---------- date invites (sent from a chat) ----------
create table public.date_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  location text,
  starts_at timestamptz not null,
  note text not null default '',
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint no_self_invite check (sender_id <> recipient_id)
);
grant select, insert on public.date_invites to authenticated;
grant update (status) on public.date_invites to authenticated;
grant all on public.date_invites to service_role;
alter table public.date_invites enable row level security;

create policy "date_invites: parties read" on public.date_invites
  for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy "date_invites: send" on public.date_invites
  for insert to authenticated
  with check (sender_id = auth.uid() and status = 'pending' and app_private.can_write()
              and not app_private.blocked_between(sender_id, recipient_id));
create policy "date_invites: recipient answers" on public.date_invites
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

alter table public.direct_messages add column date_invite_id uuid references public.date_invites (id) on delete set null;

create or replace function app_private.date_invites_after_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _name text;
begin
  if tg_op = 'INSERT' then
    insert into public.direct_messages (sender_id, recipient_id, kind, body, date_invite_id)
    values (new.sender_id, new.recipient_id, 'date_invite',
            '📅 הזמנה לדייט: ' || new.title || coalesce(' | 📍 ' || nullif(new.location, ''), ''), new.id);
    select name into _name from public.profiles where id = new.sender_id;
    perform app_private.create_notification(new.recipient_id, new.sender_id, 'date_invite',
      coalesce(nullif(_name, ''), 'מישהו') || ' הזמין/ה אותך לדייט', new.title, '/chat/' || new.sender_id, '{}'::jsonb);
  elsif new.status <> old.status and new.status <> 'pending' then
    select name into _name from public.profiles where id = new.recipient_id;
    perform app_private.create_notification(new.sender_id, new.recipient_id, 'date_answer',
      coalesce(nullif(_name, ''), 'מישהו') || case when new.status = 'approved' then ' אישר/ה את הדייט 🎉' else ' לא יכול/ה הפעם' end,
      new.title, '/chat/' || new.recipient_id, '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger date_invites_after_write
  after insert or update on public.date_invites
  for each row execute function app_private.date_invites_after_write();

alter publication supabase_realtime add table public.date_invites;
