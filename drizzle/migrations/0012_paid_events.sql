-- Paid events: joining never grants a seat by itself.
-- • join_event(): price > 0 → always 'pending' (awaiting payment), even with auto-approve;
--   the organizer approves once paid (review_event_join), which issues the ticket as before.
-- • events.payment_link: where to pay (Bit / PayBox / payment page). Not selectable directly —
--   only the organizer and people who asked to join get it, via event_payment_link().

alter table public.events
  add column payment_link text
  check (payment_link is null or (payment_link ~ '^https://' and char_length(payment_link) <= 500));

grant insert (payment_link), update (payment_link) on public.events to authenticated;

create or replace function app_private.join_event(_event_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  _ev public.events;
  _me public.profiles;
  _approved integer;
  _status public.participant_status;
  _age integer;
begin
  if not app_private.can_write() then
    raise exception 'not allowed';
  end if;
  select * into _ev from public.events where id = _event_id;
  if not found then raise exception 'event not found'; end if;
  if _ev.organizer_id = auth.uid() then return 'approved'; end if;
  if app_private.blocked_between(auth.uid(), _ev.organizer_id) then raise exception 'blocked'; end if;
  if _ev.ends_at < now() then raise exception 'event ended'; end if;

  select * into _me from public.profiles where id = auth.uid();
  if _ev.gender_target <> 'all' and _me.gender::text is distinct from _ev.gender_target::text then
    raise exception 'audience mismatch';
  end if;
  if _me.birth_date is not null then
    _age := extract(year from age(_me.birth_date))::integer;
    if (_ev.min_age is not null and _age < _ev.min_age) or (_ev.max_age is not null and _age > _ev.max_age) then
      raise exception 'age mismatch';
    end if;
  end if;

  select status into _status from public.event_participants
  where event_id = _event_id and profile_id = auth.uid();
  if found and _status in ('approved', 'pending') then
    return _status::text;
  end if;

  select count(*) into _approved from public.event_participants
  where event_id = _event_id and status = 'approved';
  if _ev.seats < 9999 and _approved >= _ev.seats then
    raise exception 'event full';
  end if;

  -- Paid events are never auto-approved: the seat is held as "awaiting payment" until the organizer confirms.
  _status := case when _ev.auto_approve and coalesce(_ev.price, 0) = 0 then 'approved' else 'pending' end;
  insert into public.event_participants (event_id, profile_id, status)
  values (_event_id, auth.uid(), _status)
  on conflict (event_id, profile_id) do update set status = excluded.status, updated_at = now();
  return _status::text;
end;
$$;

create or replace function app_private.event_payment_link(_event_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select e.payment_link from public.events e
  where e.id = _event_id
    and (e.organizer_id = auth.uid()
         or exists (select 1 from public.event_participants p
                    where p.event_id = e.id and p.profile_id = auth.uid() and p.status in ('pending', 'approved')));
$$;
revoke all on function app_private.event_payment_link(uuid) from public, anon;
grant execute on function app_private.event_payment_link(uuid) to authenticated;

create or replace function public.event_payment_link(_event_id uuid)
returns text language sql stable security invoker set search_path = ''
as $$ select app_private.event_payment_link(_event_id); $$;
revoke all on function public.event_payment_link(uuid) from public, anon;
grant execute on function public.event_payment_link(uuid) to authenticated;
