-- ============================================================
-- mibale · 0019 — private profiles, step 2: lock the private columns
-- Applied once the site and the APK read profiles through public.profile_cards (0018):
-- from here on the private columns are readable only through that view.
-- ============================================================
revoke select (photos, bio, city, hobbies, traits) on public.profiles from authenticated;
