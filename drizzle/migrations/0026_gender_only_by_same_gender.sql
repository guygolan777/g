-- ============================================================
-- mibale · 0026 — only women can open a women-only event/community (and only men a men-only one)
-- ============================================================

create or replace function app_private.audience_own_gender()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _row jsonb := to_jsonb(new);
  _target text := coalesce(_row ->> 'gender_target', _row ->> 'audience_gender', 'all');
  _owner uuid := coalesce(_row ->> 'organizer_id', _row ->> 'founder_id')::uuid;
begin
  -- user requests only (seeding / server jobs run without a signed-in user)
  if _target <> 'all' and auth.uid() is not null
     and coalesce((select gender::text from public.profiles where id = _owner), '') <> _target
     and not app_private.is_staff(auth.uid()) then
    raise exception 'audience_own_gender' using hint = 'only women can open a women-only group (and only men a men-only one)';
  end if;
  return new;
end;
$$;
revoke all on function app_private.audience_own_gender() from public;

drop trigger if exists events_audience_own_gender on public.events;
create trigger events_audience_own_gender
  before insert or update of gender_target on public.events
  for each row execute function app_private.audience_own_gender();
drop trigger if exists communities_audience_own_gender on public.communities;
create trigger communities_audience_own_gender
  before insert or update of audience_gender on public.communities
  for each row execute function app_private.audience_own_gender();
