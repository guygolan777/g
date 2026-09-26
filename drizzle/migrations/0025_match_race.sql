-- ============================================================
-- mibale · 0025 — no lost matches when two people like each other at the same moment
-- Found by the 500-user simulation: two likes committed ~5 ms apart; each trigger looked for the
-- other like before it was committed, so neither created the match. A per-pair lock makes the
-- second trigger wait for the first transaction, then see its like (READ COMMITTED re-reads).
-- ============================================================

create or replace function app_private.romantic_likes_after_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _a uuid := least(new.liker_id, new.liked_id);
  _b uuid := greatest(new.liker_id, new.liked_id);
  _inserted uuid;
begin
  if new.action <> 'like' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('match:' || _a::text || ':' || _b::text, 0));
  if exists (
    select 1 from public.romantic_likes r
    where r.liker_id = new.liked_id and r.liked_id = new.liker_id and r.action = 'like'
  ) then
    insert into public.dates (profile_a, profile_b) values (_a, _b)
    on conflict do nothing returning id into _inserted;
    if _inserted is not null then
      perform app_private.create_notification(new.liker_id, new.liked_id, 'match',
        '💘 יש לכם התאמה!', 'אפשר להתחיל לדבר', '/chat/' || new.liked_id, '{}'::jsonb);
      perform app_private.create_notification(new.liked_id, new.liker_id, 'match',
        '💘 יש לכם התאמה!', 'אפשר להתחיל לדבר', '/chat/' || new.liker_id, '{}'::jsonb);
    end if;
  end if;
  return new;
end;
$$;

-- Repair: matches that were lost this way before the fix.
insert into public.dates (profile_a, profile_b)
select a.liker_id, a.liked_id
  from public.romantic_likes a
  join public.romantic_likes b on b.liker_id = a.liked_id and b.liked_id = a.liker_id
 where a.action = 'like' and b.action = 'like' and a.liker_id < a.liked_id
on conflict do nothing;
