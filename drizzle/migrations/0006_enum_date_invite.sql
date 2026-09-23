-- ============================================================
-- mibale · 0006 — new message kind (own migration: a new enum value
-- cannot be used in the same transaction that adds it).
-- ============================================================
alter type public.message_kind add value if not exists 'date_invite';
