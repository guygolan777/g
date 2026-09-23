-- Phone numbers & contact matching.
-- • A verified phone (auth.users.phone, set by the SMS-code flow) is kept here only as a SHA-256 hash.
-- • Synced contacts are stored only as hashes of their numbers — never names, never raw numbers —
--   so we can tell you who's already on mibale and notify you when one of them joins later.
-- • Both tables live in app_private (not exposed through the API); clients use the RPCs below.

create table app_private.phone_hashes (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  phone_hash text not null unique
);

create table app_private.contact_hashes (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  phone_hash text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, phone_hash)
);
create index contact_hashes_hash_idx on app_private.contact_hashes (phone_hash);

-- Digits only, international format without "+" (GoTrue stores e.g. 972501234567).
create or replace function app_private.phone_hash(_phone text)
returns text language sql immutable set search_path = ''
as $$
  select encode(extensions.digest(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 'sha256'), 'hex');
$$;

-- Keeps phone_hashes in sync with the verified phone and tells contacts that you joined.
create or replace function app_private.handle_phone_verified()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _hash text;
  _name text;
  _owner uuid;
begin
  if new.phone is null or new.phone = '' or new.phone_confirmed_at is null then
    delete from app_private.phone_hashes where profile_id = new.id;
    return new;
  end if;
  if not exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;
  _hash := app_private.phone_hash(new.phone);
  if exists (select 1 from app_private.phone_hashes where profile_id = new.id and phone_hash = _hash) then
    return new; -- nothing changed
  end if;
  delete from app_private.phone_hashes where phone_hash = _hash and profile_id <> new.id;
  insert into app_private.phone_hashes (profile_id, phone_hash) values (new.id, _hash)
  on conflict (profile_id) do update set phone_hash = excluded.phone_hash;

  select coalesce(nullif(p.name, ''), 'מישהו') into _name from public.profiles p where p.id = new.id;
  for _owner in
    select c.owner_id from app_private.contact_hashes c where c.phone_hash = _hash and c.owner_id <> new.id
  loop
    perform app_private.create_notification(
      _owner, new.id, 'contact_joined',
      '👋 ' || _name || ' מאנשי הקשר שלך הצטרף/ה ל-mibale',
      'אפשר לעקוב, לשלוח הודעה ולהזמין לאירועים', '/profile/' || new.id, '{}'::jsonb);
  end loop;
  return new;
end;
$$;

create trigger on_auth_user_phone
  after insert or update of phone, phone_confirmed_at on auth.users
  for each row execute function app_private.handle_phone_verified();

-- Upload contact hashes (max 3000 per call, 5000 stored per user) and get back who's on mibale.
create or replace function app_private.sync_contacts(_hashes text[])
returns table (profile_id uuid, phone_hash text, name text, avatar_url text)
language plpgsql security definer set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _clean text[];
begin
  if _uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if coalesce(array_length(_hashes, 1), 0) > 3000 then
    raise exception 'too many contacts' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct h), '{}') into _clean
  from unnest(_hashes) h where h ~ '^[0-9a-f]{64}$';

  insert into app_private.contact_hashes (owner_id, phone_hash)
  select _uid, h from unnest(_clean) h
  where (select count(*) from app_private.contact_hashes where owner_id = _uid) < 5000
  on conflict do nothing;

  return query
    select p.id, ph.phone_hash, p.name, p.avatar_url
    from app_private.phone_hashes ph
    join public.profiles p on p.id = ph.profile_id
    where ph.phone_hash = any (_clean)
      and p.id <> _uid
      and p.banned_at is null
      and p.onboarded
      and not app_private.blocked_between(_uid, p.id)
    order by p.name;
end;
$$;

create or replace function app_private.clear_my_contacts()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare _n integer;
begin
  delete from app_private.contact_hashes where owner_id = auth.uid();
  get diagnostics _n = row_count;
  return _n;
end;
$$;

create or replace function app_private.my_contacts_count()
returns integer language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from app_private.contact_hashes where owner_id = auth.uid();
$$;

revoke all on function app_private.sync_contacts(text[]), app_private.clear_my_contacts(), app_private.my_contacts_count() from public, anon;
grant execute on function app_private.sync_contacts(text[]), app_private.clear_my_contacts(), app_private.my_contacts_count() to authenticated;

create or replace function public.sync_contacts(_hashes text[])
returns table (profile_id uuid, phone_hash text, name text, avatar_url text)
language sql security invoker set search_path = ''
as $$ select * from app_private.sync_contacts(_hashes); $$;

create or replace function public.clear_my_contacts()
returns integer language sql security invoker set search_path = ''
as $$ select app_private.clear_my_contacts(); $$;

create or replace function public.my_contacts_count()
returns integer language sql stable security invoker set search_path = ''
as $$ select app_private.my_contacts_count(); $$;

revoke all on function public.sync_contacts(text[]), public.clear_my_contacts(), public.my_contacts_count() from public, anon;
grant execute on function public.sync_contacts(text[]), public.clear_my_contacts(), public.my_contacts_count() to authenticated;
