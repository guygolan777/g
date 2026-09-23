-- In-app account deletion (required by Google Play and the App Store).
-- Deleting the auth user cascades to profiles and everything that references it
-- (events, memberships, messages, likes, stories…); moderation references are set null.
-- Media files under media/{uid}/ are removed by the client right before this call.
create or replace function app_private.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = _uid;
end;
$$;

revoke all on function app_private.delete_my_account() from public, anon;
grant execute on function app_private.delete_my_account() to authenticated;

create or replace function public.delete_my_account()
returns void
language sql security invoker set search_path = ''
as $$
  select app_private.delete_my_account();
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
