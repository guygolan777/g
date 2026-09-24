-- The quick "new event" screen (since 2026-09-23) sent the full form's hidden default end time —
-- 21:00 two days after the form opened — so events started "now" looked like they ran for days
-- (and counted as "happening now" on the map until then). Repair those: end = start + 2 hours,
-- the same default the insert trigger uses when no end is given.
update public.events
set ends_at = starts_at + interval '2 hours'
where created_at >= '2026-09-23'
  and ends_at - starts_at > interval '24 hours'
  and to_char(ends_at at time zone 'Asia/Jerusalem', 'HH24:MI') = '21:00';
