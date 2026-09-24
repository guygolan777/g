-- ============================================================
-- mibale · 0019 — private profiles, step 2: lock the private columns
-- Apps from before 0018 read these columns straight from profiles. Once the site is redeployed
-- and the new APK is out, move this file to drizzle/migrations/ and run the setup workflow:
-- from then on the columns are readable only through public.profile_cards.
-- ============================================================
revoke select (photos, bio, city, hobbies, traits) on public.profiles from authenticated;
