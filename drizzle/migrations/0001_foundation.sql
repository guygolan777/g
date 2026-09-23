-- ============================================================
-- mibale · 0001 foundation
-- Extensions, private schema, enums, roles (user_roles + has_role)
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- Private schema for SECURITY DEFINER functions. Not exposed by PostgREST.
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, service_role, anon;

-- Supabase grants everything in public to anon/authenticated by default.
-- mibale grants explicitly per table/function instead.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app_private revoke execute on functions from public, anon, authenticated;

-- ---------- enums ----------
create type public.app_role as enum ('admin', 'moderator', 'user');
create type public.gender as enum ('female', 'male', 'other');
create type public.audience_gender as enum ('all', 'female', 'male');
create type public.participant_status as enum ('pending', 'approved', 'declined');
create type public.request_status as enum ('pending', 'approved', 'declined');
create type public.community_role as enum ('founder', 'admin', 'member');
create type public.report_status as enum ('open', 'resolved', 'dismissed');
create type public.report_target as enum ('profile', 'event', 'community', 'story', 'message', 'post');
create type public.message_kind as enum ('text', 'voice', 'image', 'story_reply', 'system');
create type public.media_kind as enum ('image', 'video');
create type public.swipe_action as enum ('like', 'pass');
create type public.recurrence as enum ('none', 'daily', 'weekly', 'biweekly', 'monthly');

-- ---------- user_roles ----------
-- Roles NEVER live on profiles.
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- SECURITY DEFINER: bypasses RLS on user_roles to avoid recursive policies.
create or replace function app_private.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id and ur.role = _role
  );
$$;

create or replace function app_private.is_staff(_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id and ur.role in ('admin', 'moderator')
  );
$$;

revoke all on function app_private.has_role(uuid, public.app_role) from public;
revoke all on function app_private.is_staff(uuid) from public;
grant execute on function app_private.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function app_private.is_staff(uuid) to authenticated, service_role;

-- Public SECURITY INVOKER wrapper (the one clients call via RPC).
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.has_role(_user_id, _role);
$$;
revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

create policy "user_roles: read own" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or app_private.has_role(auth.uid(), 'admin'));
