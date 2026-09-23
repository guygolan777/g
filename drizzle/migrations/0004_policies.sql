-- ============================================================
-- mibale · 0004 row level security policies
-- ============================================================

-- ---------- profiles ----------
-- Guests: rows are readable, but column grants limit them to id, name, avatar_url.
create policy "profiles: guests read basic" on public.profiles
  for select to anon using (banned_at is null);
-- Blocked pairs cannot see each other, except the blocker's own "blocked users" list.
create policy "profiles: members read unblocked" on public.profiles
  for select to authenticated
  using (id = auth.uid()
         or not app_private.blocked_between(auth.uid(), id)
         or exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = profiles.id));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- profile_locations ----------
create policy "profile_locations: own" on public.profile_locations
  for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- communities ----------
create policy "communities: public read" on public.communities
  for select to anon, authenticated using (true);
create policy "communities: create" on public.communities
  for insert to authenticated
  with check (founder_id = auth.uid() and app_private.can_write());
create policy "communities: admins update" on public.communities
  for update to authenticated
  using (app_private.is_community_admin(id)) with check (app_private.is_community_admin(id));
create policy "communities: founder or staff delete" on public.communities
  for delete to authenticated
  using (founder_id = auth.uid() or app_private.is_staff(auth.uid()));

create policy "community_members: read" on public.community_members
  for select to authenticated using (true);
create policy "community_members: leave or remove" on public.community_members
  for delete to authenticated
  using ((profile_id = auth.uid() and role <> 'founder') or app_private.is_community_admin(community_id));
create policy "community_members: founder sets roles" on public.community_members
  for update to authenticated
  using (exists (select 1 from public.communities c where c.id = community_id and c.founder_id = auth.uid()))
  with check (role <> 'founder');

create policy "community_join_requests: own or admins" on public.community_join_requests
  for select to authenticated
  using (profile_id = auth.uid() or app_private.is_community_admin(community_id));
create policy "community_join_requests: withdraw own" on public.community_join_requests
  for delete to authenticated using (profile_id = auth.uid());

create policy "community_messages: members read" on public.community_messages
  for select to authenticated using (app_private.is_community_member(community_id));
create policy "community_messages: members write" on public.community_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and app_private.can_write()
              and app_private.is_community_member(community_id)
              and kind in ('text', 'voice', 'image'));
create policy "community_messages: delete own" on public.community_messages
  for delete to authenticated
  using (sender_id = auth.uid() or app_private.is_community_admin(community_id));

-- ---------- events ----------
create policy "events: guests read limited columns" on public.events
  for select to anon using (true);
create policy "events: members read" on public.events
  for select to authenticated
  using (organizer_id = auth.uid() or not app_private.blocked_between(auth.uid(), organizer_id));
create policy "events: create own" on public.events
  for insert to authenticated
  with check (organizer_id = auth.uid() and app_private.can_write()
              and (community_id is null or app_private.is_community_member(community_id)));
create policy "events: organizer update" on public.events
  for update to authenticated
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy "events: organizer or staff delete" on public.events
  for delete to authenticated
  using (organizer_id = auth.uid() or app_private.is_staff(auth.uid()));

create policy "event_participants: read" on public.event_participants
  for select to authenticated
  using (
    profile_id = auth.uid()
    or app_private.is_event_organizer(event_id)
    or (status = 'approved' and not app_private.blocked_between(auth.uid(), profile_id))
  );
create policy "event_participants: leave or remove" on public.event_participants
  for delete to authenticated
  using (profile_id = auth.uid() or app_private.is_event_organizer(event_id));

create policy "event_tickets: own" on public.event_tickets
  for select to authenticated using (profile_id = auth.uid());

create policy "event_checkins: own or organizer" on public.event_checkins
  for select to authenticated
  using (profile_id = auth.uid() or app_private.is_event_organizer(event_id));

create policy "event_messages: attendees read" on public.event_messages
  for select to authenticated
  using (app_private.is_event_member(event_id) or app_private.is_event_organizer(event_id));
create policy "event_messages: attendees write" on public.event_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and app_private.can_write()
              and (app_private.is_event_member(event_id) or app_private.is_event_organizer(event_id))
              and kind in ('text', 'voice', 'image'));
create policy "event_messages: delete own" on public.event_messages
  for delete to authenticated
  using (sender_id = auth.uid() or app_private.is_event_organizer(event_id));

create policy "event_invites: parties read" on public.event_invites
  for select to authenticated using (inviter_id = auth.uid() or invitee_id = auth.uid());
create policy "event_invites: attendees invite" on public.event_invites
  for insert to authenticated
  with check (inviter_id = auth.uid() and app_private.can_write()
              and (app_private.is_event_member(event_id) or app_private.is_event_organizer(event_id))
              and not app_private.blocked_between(auth.uid(), invitee_id));
create policy "event_invites: delete own" on public.event_invites
  for delete to authenticated using (inviter_id = auth.uid() or invitee_id = auth.uid());

create policy "event_reviews: read" on public.event_reviews
  for select to authenticated using (true);
create policy "event_reviews: attendees write" on public.event_reviews
  for insert to authenticated
  with check (profile_id = auth.uid() and app_private.can_write() and app_private.is_event_member(event_id)
              and not app_private.is_event_organizer(event_id));
create policy "event_reviews: update own" on public.event_reviews
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "event_reviews: delete own" on public.event_reviews
  for delete to authenticated using (profile_id = auth.uid() or app_private.is_staff(auth.uid()));

-- Views are visible only to the viewer and the organizer.
create policy "event_views: viewer or organizer" on public.event_views
  for select to authenticated
  using (viewer_id = auth.uid() or app_private.is_event_organizer(event_id));
create policy "event_views: record own" on public.event_views
  for insert to authenticated with check (viewer_id = auth.uid());
create policy "event_views: refresh own" on public.event_views
  for update to authenticated using (viewer_id = auth.uid()) with check (viewer_id = auth.uid());

create policy "event_saves: own" on public.event_saves
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- stories ----------
create policy "stories: read active" on public.stories
  for select to authenticated
  using (author_id = auth.uid()
         or (expires_at > now() and not app_private.blocked_between(auth.uid(), author_id)));
create policy "stories: create own" on public.stories
  for insert to authenticated
  with check (author_id = auth.uid() and app_private.can_write()
              and (event_id is null or app_private.is_event_organizer(event_id) or app_private.is_event_member(event_id)));
create policy "stories: delete own" on public.stories
  for delete to authenticated using (author_id = auth.uid() or app_private.is_staff(auth.uid()));

create policy "story_views: own or author" on public.story_views
  for select to authenticated
  using (viewer_id = auth.uid()
         or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid()));
create policy "story_views: record own" on public.story_views
  for insert to authenticated with check (viewer_id = auth.uid());

create policy "story_likes: own or author" on public.story_likes
  for select to authenticated
  using (profile_id = auth.uid()
         or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid()));
create policy "story_likes: like" on public.story_likes
  for insert to authenticated
  with check (profile_id = auth.uid() and app_private.can_write()
              and not exists (select 1 from public.stories s
                              where s.id = story_id and app_private.blocked_between(auth.uid(), s.author_id)));
create policy "story_likes: unlike" on public.story_likes
  for delete to authenticated using (profile_id = auth.uid());

create policy "story_replies: parties read" on public.story_replies
  for select to authenticated
  using (author_id = auth.uid()
         or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid()));
create policy "story_replies: reply" on public.story_replies
  for insert to authenticated
  with check (author_id = auth.uid() and app_private.can_write()
              and not exists (select 1 from public.stories s
                              where s.id = story_id and app_private.blocked_between(auth.uid(), s.author_id)));

-- ---------- posts ----------
create policy "posts: read" on public.posts
  for select to authenticated
  using (author_id = auth.uid() or not app_private.blocked_between(auth.uid(), author_id));
create policy "posts: create own" on public.posts
  for insert to authenticated
  with check (author_id = auth.uid() and app_private.can_write()
              and (community_id is null or app_private.is_community_member(community_id)));
create policy "posts: update own" on public.posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "posts: delete own" on public.posts
  for delete to authenticated using (author_id = auth.uid() or app_private.is_staff(auth.uid()));

create policy "post_likes: read" on public.post_likes for select to authenticated using (true);
create policy "post_likes: like" on public.post_likes
  for insert to authenticated with check (profile_id = auth.uid() and app_private.can_write());
create policy "post_likes: unlike" on public.post_likes
  for delete to authenticated using (profile_id = auth.uid());

create policy "post_comments: read" on public.post_comments
  for select to authenticated
  using (not app_private.blocked_between(auth.uid(), author_id));
create policy "post_comments: comment" on public.post_comments
  for insert to authenticated with check (author_id = auth.uid() and app_private.can_write());
create policy "post_comments: delete" on public.post_comments
  for delete to authenticated
  using (author_id = auth.uid()
         or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

-- ---------- follows ----------
create policy "follows: read unblocked" on public.follows
  for select to authenticated
  using (not app_private.blocked_between(auth.uid(), follower_id)
         and not app_private.blocked_between(auth.uid(), following_id));
create policy "follows: follow" on public.follows
  for insert to authenticated
  with check (follower_id = auth.uid() and app_private.can_write()
              and not app_private.blocked_between(follower_id, following_id));
create policy "follows: unfollow or remove follower" on public.follows
  for delete to authenticated using (follower_id = auth.uid() or following_id = auth.uid());

-- ---------- direct messages ----------
create policy "direct_messages: parties read" on public.direct_messages
  for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy "direct_messages: send" on public.direct_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and app_private.can_write()
              and kind in ('text', 'voice', 'image')
              and not app_private.blocked_between(sender_id, recipient_id));
create policy "direct_messages: mark read" on public.direct_messages
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy "direct_messages: delete own" on public.direct_messages
  for delete to authenticated using (sender_id = auth.uid());

-- ---------- dating ----------
-- Nobody can see who liked them: rows are visible to the liker only.
create policy "romantic_likes: own" on public.romantic_likes
  for select to authenticated using (liker_id = auth.uid());
create policy "romantic_likes: swipe" on public.romantic_likes
  for insert to authenticated
  with check (liker_id = auth.uid() and app_private.can_write()
              and not app_private.blocked_between(liker_id, liked_id));
create policy "romantic_likes: change swipe" on public.romantic_likes
  for update to authenticated using (liker_id = auth.uid()) with check (liker_id = auth.uid());
create policy "romantic_likes: undo" on public.romantic_likes
  for delete to authenticated using (liker_id = auth.uid());

create policy "dates: parties read" on public.dates
  for select to authenticated using (profile_a = auth.uid() or profile_b = auth.uid());
create policy "dates: unmatch" on public.dates
  for delete to authenticated using (profile_a = auth.uid() or profile_b = auth.uid());

-- ---------- safety ----------
create policy "blocks: own" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy "blocks: block" on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());
create policy "blocks: unblock" on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

create policy "reports: own or staff" on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or app_private.is_staff(auth.uid()));
create policy "reports: file" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');
create policy "reports: staff resolve" on public.reports
  for update to authenticated
  using (app_private.is_staff(auth.uid())) with check (app_private.is_staff(auth.uid()));

-- ---------- notifications (no insert policy: server-side only) ----------
create policy "notifications: own read" on public.notifications
  for select to authenticated using (recipient_id = auth.uid());
create policy "notifications: own mark read" on public.notifications
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy "notifications: own delete" on public.notifications
  for delete to authenticated using (recipient_id = auth.uid());

create policy "push_tokens: own" on public.push_tokens
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
