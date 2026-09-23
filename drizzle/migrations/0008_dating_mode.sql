-- ============================================================
-- mibale · 0008 — dating mode ("the heart") enforced server-side
-- Heart on:  you see the swing and others can see/like you.
-- Heart off: swing is locked, nobody can see or like you there;
--            only "חיבבת" (your likes) and "התאמות" (matches) remain.
-- ============================================================

create or replace function app_private.dating_on_for(_profile uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select dating_enabled from public.profiles where id = _profile), false); $$;
revoke all on function app_private.dating_on_for(uuid) from public;
grant execute on function app_private.dating_on_for(uuid) to authenticated, service_role;

-- Swiping (like/pass) requires the heart to be on for both sides.
drop policy "romantic_likes: swipe" on public.romantic_likes;
create policy "romantic_likes: swipe" on public.romantic_likes
  for insert to authenticated
  with check (liker_id = auth.uid() and app_private.can_write()
              and app_private.dating_on() and app_private.dating_on_for(liked_id)
              and not app_private.blocked_between(liker_id, liked_id));

drop policy "romantic_likes: change swipe" on public.romantic_likes;
create policy "romantic_likes: change swipe" on public.romantic_likes
  for update to authenticated
  using (liker_id = auth.uid())
  with check (liker_id = auth.uid() and app_private.dating_on() and app_private.dating_on_for(liked_id));

-- Romantic stories: visible only when both the viewer's and the author's hearts are on.
drop policy "stories: read active" on public.stories;
create policy "stories: read active" on public.stories
  for select to authenticated
  using (author_id = auth.uid()
         or (expires_at > now()
             and not app_private.blocked_between(auth.uid(), author_id)
             and (not is_romantic or (app_private.dating_on() and app_private.dating_on_for(author_id)))));

drop policy "stories: create own" on public.stories;
create policy "stories: create own" on public.stories
  for insert to authenticated
  with check (author_id = auth.uid() and app_private.can_write()
              and (not is_romantic or app_private.dating_on())
              and (event_id is null or app_private.is_event_organizer(event_id) or app_private.is_event_member(event_id)));
