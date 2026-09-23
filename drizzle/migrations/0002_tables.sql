-- ============================================================
-- mibale · 0002 tables
-- Pattern for every table: CREATE TABLE → GRANT → ENABLE RLS.
-- Policies live in 0004_policies.sql.
-- ============================================================

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  avatar_url text,
  photos text[] not null default '{}',
  bio text not null default '',
  gender public.gender,
  birth_date date,                       -- sensitive
  birth_year smallint,                   -- derived by trigger, public (for age matching)
  city text,
  hobbies text[] not null default '{}',  -- category ids and "category.sub" ids
  traits text[] not null default '{}',   -- personality trait ids
  dating_enabled boolean not null default false,
  onboarded boolean not null default false,
  show_online boolean not null default true,       -- sensitive
  last_seen_at timestamptz,                        -- sensitive (exposed via online_status())
  pref_min_age smallint not null default 18,       -- sensitive
  pref_max_age smallint not null default 99,       -- sensitive
  pref_gender public.audience_gender not null default 'all', -- sensitive
  pref_distance_km smallint not null default 50,   -- sensitive
  notify_messages boolean not null default true,   -- sensitive
  notify_events boolean not null default true,     -- sensitive
  notify_social boolean not null default true,     -- sensitive
  banned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photos_max check (coalesce(array_length(photos, 1), 0) <= 6),
  constraint pref_age_range check (pref_min_age >= 18 and pref_max_age >= pref_min_age)
);

-- Column-level grants: guests see only id/name/avatar_url; other users never see
-- birth_date / pref_* / show_online / notify_* / last_seen_at.
revoke all on public.profiles from anon, authenticated;
grant select (id, name, avatar_url) on public.profiles to anon;
grant select (id, name, avatar_url, photos, bio, gender, birth_year, city, hobbies, traits,
              dating_enabled, onboarded, banned_at, created_at)
  on public.profiles to authenticated;
grant update (name, avatar_url, photos, bio, gender, birth_date, city, hobbies, traits,
              dating_enabled, onboarded, show_online, last_seen_at, pref_min_age, pref_max_age,
              pref_gender, pref_distance_km, notify_messages, notify_events, notify_social)
  on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- ---------- profile_locations (private: owner only) ----------
create table public.profile_locations (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  city text,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profile_locations to authenticated;
grant all on public.profile_locations to service_role;
alter table public.profile_locations enable row level security;

-- ---------- communities ----------
create table public.communities (
  id uuid primary key default gen_random_uuid(),
  founder_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '',
  hobby text not null,
  city text,
  image_url text,
  audience_gender public.audience_gender not null default 'all',
  min_age smallint not null default 18,
  max_age smallint not null default 99,
  auto_approve boolean not null default true,
  created_at timestamptz not null default now(),
  constraint community_age check (max_age >= min_age)
);
create index communities_hobby_idx on public.communities (hobby);
grant select on public.communities to anon;
grant select, insert, update, delete on public.communities to authenticated;
grant all on public.communities to service_role;
alter table public.communities enable row level security;

create table public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.community_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (community_id, profile_id)
);
create index community_members_profile_idx on public.community_members (profile_id);
grant select, delete on public.community_members to authenticated;
grant update (role) on public.community_members to authenticated;
grant all on public.community_members to service_role;
alter table public.community_members enable row level security;

create table public.community_join_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.request_status not null default 'pending',
  message text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (community_id, profile_id)
);
grant select, delete on public.community_join_requests to authenticated;
grant all on public.community_join_requests to service_role;
alter table public.community_join_requests enable row level security;

create table public.community_messages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind public.message_kind not null default 'text',
  body text not null default '',
  media_url text,
  created_at timestamptz not null default now()
);
create index community_messages_idx on public.community_messages (community_id, created_at desc);
grant select, insert, delete on public.community_messages to authenticated;
grant all on public.community_messages to service_role;
alter table public.community_messages enable row level security;

-- ---------- events ----------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid references public.communities (id) on delete set null,
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '',
  category text not null,
  subcategory text,
  image_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_online boolean not null default false,
  location_name text,
  city text,
  lat double precision,
  lng double precision,
  meeting_url text,                      -- protected: approved participants only, via RPC
  seats integer not null default 9999 check (seats > 0), -- 9999 = UNLIMITED_SEATS
  auto_approve boolean not null default true,
  recurrence public.recurrence not null default 'none',
  recurrence_parent_id uuid references public.events (id) on delete cascade,
  min_age smallint,
  max_age smallint,
  gender_target public.audience_gender not null default 'all',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_times check (ends_at is null or ends_at >= starts_at)
);
create index events_starts_idx on public.events (starts_at);
create index events_organizer_idx on public.events (organizer_id);
create index events_community_idx on public.events (community_id);
create index events_category_idx on public.events (category, subcategory);

revoke all on public.events from anon, authenticated;
-- Guests: only title, image, date/time (plus id, category and community for filtering and counts).
grant select (id, community_id, title, image_url, starts_at, ends_at, category, subcategory) on public.events to anon;
grant select (id, organizer_id, community_id, title, description, category, subcategory, image_url,
              starts_at, ends_at, is_online, location_name, city, lat, lng, seats, auto_approve,
              recurrence, recurrence_parent_id, min_age, max_age, gender_target, created_at, updated_at)
  on public.events to authenticated;
grant insert (organizer_id, community_id, title, description, category, subcategory, image_url,
              starts_at, ends_at, is_online, location_name, city, lat, lng, meeting_url, seats,
              auto_approve, recurrence, min_age, max_age, gender_target)
  on public.events to authenticated;
grant update (community_id, title, description, category, subcategory, image_url, starts_at, ends_at,
              is_online, location_name, city, lat, lng, meeting_url, seats, auto_approve,
              min_age, max_age, gender_target)
  on public.events to authenticated;
grant delete on public.events to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;

create table public.event_participants (
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.participant_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
create index event_participants_profile_idx on public.event_participants (profile_id);
-- Writes go through RPCs (join_event / review_event_join); users may only leave.
grant select, delete on public.event_participants to authenticated;
grant all on public.event_participants to service_role;
alter table public.event_participants enable row level security;
alter table public.event_participants replica identity full;

-- Personal ticket codes live apart from participants so they are never
-- broadcast via realtime or visible to other attendees.
create table public.event_tickets (
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
grant select on public.event_tickets to authenticated;
grant all on public.event_tickets to service_role;
alter table public.event_tickets enable row level security;

create table public.event_checkins (
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  checked_in_by uuid references public.profiles (id) on delete set null,
  checked_in_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
grant select on public.event_checkins to authenticated;
grant all on public.event_checkins to service_role;
alter table public.event_checkins enable row level security;

create table public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind public.message_kind not null default 'text',
  body text not null default '',
  media_url text,
  created_at timestamptz not null default now()
);
create index event_messages_idx on public.event_messages (event_id, created_at desc);
grant select, insert, delete on public.event_messages to authenticated;
grant all on public.event_messages to service_role;
alter table public.event_messages enable row level security;

create table public.event_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, invitee_id)
);
grant select, insert, delete on public.event_invites to authenticated;
grant all on public.event_invites to service_role;
alter table public.event_invites enable row level security;

create table public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '',
  created_at timestamptz not null default now(),
  unique (event_id, profile_id)
);
grant select, insert, update, delete on public.event_reviews to authenticated;
grant all on public.event_reviews to service_role;
alter table public.event_reviews enable row level security;

create table public.event_views (
  event_id uuid not null references public.events (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (event_id, viewer_id)
);
grant select, insert, update on public.event_views to authenticated;
grant all on public.event_views to service_role;
alter table public.event_views enable row level security;

create table public.event_saves (
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
grant select, insert, delete on public.event_saves to authenticated;
grant all on public.event_saves to service_role;
alter table public.event_saves enable row level security;

-- ---------- stories ----------
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  media_url text not null,
  media_type public.media_kind not null default 'image',
  caption text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index stories_active_idx on public.stories (expires_at desc);
grant select, insert, delete on public.stories to authenticated;
grant all on public.stories to service_role;
alter table public.stories enable row level security;

create table public.story_views (
  story_id uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
grant select, insert on public.story_views to authenticated;
grant all on public.story_views to service_role;
alter table public.story_views enable row level security;

create table public.story_likes (
  story_id uuid not null references public.stories (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, profile_id)
);
grant select, insert, delete on public.story_likes to authenticated;
grant all on public.story_likes to service_role;
alter table public.story_likes enable row level security;

create table public.story_replies (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
grant select, insert on public.story_replies to authenticated;
grant all on public.story_replies to service_role;
alter table public.story_replies enable row level security;

-- ---------- posts ----------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid references public.communities (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  body text not null default '',
  image_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.posts to authenticated;
grant all on public.posts to service_role;
alter table public.posts enable row level security;

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
grant select, insert, delete on public.post_likes to authenticated;
grant all on public.post_likes to service_role;
alter table public.post_likes enable row level security;

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.post_comments to authenticated;
grant all on public.post_comments to service_role;
alter table public.post_comments enable row level security;

-- ---------- social graph ----------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id);
grant select, insert, delete on public.follows to authenticated;
grant all on public.follows to service_role;
alter table public.follows enable row level security;

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind public.message_kind not null default 'text',
  body text not null default '',
  media_url text,
  story_id uuid references public.stories (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint no_self_dm check (sender_id <> recipient_id)
);
create index direct_messages_pair_idx on public.direct_messages (sender_id, recipient_id, created_at desc);
create index direct_messages_recipient_idx on public.direct_messages (recipient_id, read_at);
grant select, insert, delete on public.direct_messages to authenticated;
grant update (read_at) on public.direct_messages to authenticated;
grant all on public.direct_messages to service_role;
alter table public.direct_messages enable row level security;

-- ---------- dating ----------
create table public.romantic_likes (
  liker_id uuid not null references public.profiles (id) on delete cascade,
  liked_id uuid not null references public.profiles (id) on delete cascade,
  action public.swipe_action not null default 'like',
  created_at timestamptz not null default now(),
  primary key (liker_id, liked_id),
  constraint no_self_like check (liker_id <> liked_id)
);
grant select, insert, update, delete on public.romantic_likes to authenticated;
grant all on public.romantic_likes to service_role;
alter table public.romantic_likes enable row level security;

-- A "date" is a mutual match (profile_a < profile_b).
create table public.dates (
  id uuid primary key default gen_random_uuid(),
  profile_a uuid not null references public.profiles (id) on delete cascade,
  profile_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_a, profile_b),
  constraint ordered_pair check (profile_a < profile_b)
);
grant select, delete on public.dates to authenticated;
grant all on public.dates to service_role;
alter table public.dates enable row level security;

-- ---------- safety ----------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);
grant select, insert, delete on public.blocks to authenticated;
grant all on public.blocks to service_role;
alter table public.blocks enable row level security;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target not null,
  target_id uuid not null,
  reason text not null,
  details text not null default '',
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at desc);
grant select, insert on public.reports to authenticated;
grant update (status, resolved_by, resolved_at) on public.reports to authenticated;
grant all on public.reports to service_role;
alter table public.reports enable row level security;

-- ---------- notifications (server-written only) ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null,
  title text not null,
  body text not null default '',
  link text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
alter table public.notifications replica identity full;

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.push_tokens to authenticated;
grant all on public.push_tokens to service_role;
alter table public.push_tokens enable row level security;
