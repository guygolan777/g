-- Dating visibility is mutual: two people see each other (romantic stories, the swing) only when
-- each fits the other's romantic preferences — gender, age range and distance. A woman looking for
-- men and a woman looking for women never see each other, in either direction.

-- Does _who fit _of's preferences?
create or replace function app_private.fits_prefs(_who uuid, _of uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with a as (
    select p.pref_gender, p.pref_min_age, p.pref_max_age, p.pref_distance_km, l.lat, l.lng
    from public.profiles p left join public.profile_locations l on l.profile_id = p.id
    where p.id = _of
  ), v as (
    select p.gender, p.birth_year, l.lat, l.lng
    from public.profiles p left join public.profile_locations l on l.profile_id = p.id
    where p.id = _who
  )
  select coalesce((
    select (a.pref_gender = 'all' or v.gender::text = a.pref_gender::text)
       and v.birth_year between extract(year from now())::int - a.pref_max_age
                            and extract(year from now())::int - a.pref_min_age
       -- 200 km means "no limit"; an author without a location can't filter by distance.
       and (a.pref_distance_km >= 200 or a.lat is null
            or (v.lat is not null
                and 6371 * 2 * asin(sqrt(
                      power(sin(radians(v.lat - a.lat) / 2), 2) +
                      cos(radians(a.lat)) * cos(radians(v.lat)) * power(sin(radians(v.lng - a.lng) / 2), 2)
                    )) <= a.pref_distance_km))
    from a, v), false);
$$;
revoke all on function app_private.fits_prefs(uuid, uuid) from public;

-- Me and _other, both ways.
create or replace function app_private.mutual_fit(_other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select app_private.fits_prefs(auth.uid(), _other) and app_private.fits_prefs(_other, auth.uid()); $$;
revoke all on function app_private.mutual_fit(uuid) from public;
grant execute on function app_private.mutual_fit(uuid) to authenticated, service_role;

-- For the swing: which of these people and I fit each other's preferences.
create or replace function app_private.mutual_fits(ids uuid[])
returns setof uuid
language sql stable security definer set search_path = ''
as $$ select id from unnest(ids) as id where app_private.mutual_fit(id); $$;
revoke all on function app_private.mutual_fits(uuid[]) from public;
grant execute on function app_private.mutual_fits(uuid[]) to authenticated, service_role;

create or replace function public.mutual_fits(ids uuid[])
returns setof uuid
language sql stable security invoker set search_path = ''
as $$ select app_private.mutual_fits(ids); $$;
revoke all on function public.mutual_fits(uuid[]) from public, anon;
grant execute on function public.mutual_fits(uuid[]) to authenticated;

drop policy "stories: read active" on public.stories;
create policy "stories: read active" on public.stories
  for select to authenticated
  using (author_id = auth.uid()
         or (expires_at > now()
             and not app_private.blocked_between(auth.uid(), author_id)
             and (case when is_romantic then app_private.dating_on() and app_private.dating_on_for(author_id)
                                            and app_private.mutual_fit(author_id)
                       else event_id is not null and app_private.event_has_room(event_id) end)));
