-- Turning dating mode on for the first time asks for romantic preferences (gender, ages, distance)
-- before the person appears in the dating area. dating_prefs_at records that they were set.
alter table public.profiles add column if not exists dating_prefs_at timestamptz;
grant update (dating_prefs_at) on public.profiles to authenticated;

-- People who already use dating (or already changed their preferences) aren't asked again.
update public.profiles
set dating_prefs_at = now()
where dating_prefs_at is null
  and (dating_enabled or pref_gender <> 'all' or pref_min_age <> 18 or pref_max_age < 99 or pref_distance_km <> 50);

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
    'dating_prefs_at', p.dating_prefs_at,
    'notify_messages', p.notify_messages,
    'notify_events', p.notify_events,
    'notify_social', p.notify_social,
    'is_admin', app_private.has_role(p.id, 'admin'),
    'is_moderator', app_private.has_role(p.id, 'moderator')
  )
  from public.profiles p
  where p.id = auth.uid();
$$;
