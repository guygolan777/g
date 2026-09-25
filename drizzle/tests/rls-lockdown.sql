-- After 0019: private columns can't be read from profiles directly.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000009', true);
do $$ begin
  begin perform bio from public.profiles limit 1; raise exception 'FAIL: bio readable from profiles directly';
  exception when insufficient_privilege then null; end;
  begin perform photos, city, hobbies, traits from public.profiles limit 1; raise exception 'FAIL: private columns readable from profiles';
  exception when insufficient_privilege then null; end;
  perform id, name, avatar_url, birth_year from public.profiles limit 1;
  perform bio, photos, city from public.profile_cards limit 1;
  raise notice 'RLS lockdown tests passed';
end $$;
rollback;
