-- ============================================================
-- mibale · demo data (run after migrations, as postgres / service role)
-- 10 full profiles (5 women, 5 men). Password for all: mibale1234
-- Each profile belongs to communities, organizes 2 events and attends others.
-- ============================================================

-- Local (Israel) wall-clock time N days from today at HH:00.
create or replace function pg_temp.at_il(_days integer, _hour integer)
returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'Asia/Jerusalem') + make_interval(days => _days, hours => _hour))
         at time zone 'Asia/Jerusalem';
$$;

do $$
declare
  _people jsonb := '[
    {"n":1,"email":"noa@mibale.dev","name":"נועה לוי","gender":"female","birth":"1996-04-12","city":"תל אביב","lat":32.0853,"lng":34.7818,"photo":"https://randomuser.me/api/portraits/women/44.jpg","bio":"מעצבת מוצר, רצה בבקרים בפארק הירקון ומחפשת שותפות לסדנאות קרמיקה.","hobbies":["sport.running","creative.ceramics","food.coffee"],"traits":["single","non_smoker","dog_lover","extrovert","creative","secular","bachelor"]},
    {"n":2,"email":"maya@mibale.dev","name":"מאיה כהן","gender":"female","birth":"1993-09-03","city":"רמת גן","lat":32.0684,"lng":34.8248,"photo":"https://randomuser.me/api/portraits/women/68.jpg","bio":"מורה ליוגה ואוהבת טבע. סופ״ש בלי טיול זה לא סופ״ש.","hobbies":["sport.yoga","outdoors.hiking","wellness.meditation"],"traits":["single","vegetarian","cat_lover","calm","optimist","spiritual","master"]},
    {"n":3,"email":"shira@mibale.dev","name":"שירה אברהם","gender":"female","birth":"1999-01-22","city":"תל אביב","lat":32.0735,"lng":34.7925,"photo":"https://randomuser.me/api/portraits/women/65.jpg","bio":"סטודנטית לקולנוע, מכורה להופעות קטנות ולמשחקי קופסה.","hobbies":["culture.cinema","music.concerts","games.board"],"traits":["single","non_smoker","dog_lover","funny","introvert","secular","student"]},
    {"n":4,"email":"tamar@mibale.dev","name":"תמר מזרחי","gender":"female","birth":"1990-06-30","city":"הרצליה","lat":32.1663,"lng":34.8436,"photo":"https://randomuser.me/api/portraits/women/32.jpg","bio":"שפית ביתית ומארחת סדרתית. אם יש אוכל טוב — אני שם.","hobbies":["food.cooking","food.wine","learning.books"],"traits":["divorced","social_drinker","has_pet","extrovert","ambitious","traditional","bachelor"]},
    {"n":5,"email":"yael@mibale.dev","name":"יעל פרץ","gender":"female","birth":"1995-11-15","city":"גבעתיים","lat":32.0722,"lng":34.8125,"photo":"https://randomuser.me/api/portraits/women/21.jpg","bio":"מפתחת בסטארטאפ, מתנדבת בעמותת כלבים ורוקדת סלסה.","hobbies":["tech.ai","volunteering.animals","party.dancing"],"traits":["single","vegan","dog_lover","adventurous","optimist","secular","master"]},
    {"n":6,"email":"daniel@mibale.dev","name":"דניאל שפירא","gender":"male","birth":"1994-02-08","city":"תל אביב","lat":32.0809,"lng":34.7806,"photo":"https://randomuser.me/api/portraits/men/32.jpg","bio":"מהנדס תוכנה, רץ חצי מרתון ומארגן מיטאפים על AI.","hobbies":["sport.running","tech.ai","tech.meetups"],"traits":["single","non_smoker","sporty","ambitious","funny","secular","bachelor"]},
    {"n":7,"email":"omer@mibale.dev","name":"עומר ביטון","gender":"male","birth":"1992-07-19","city":"רמת גן","lat":32.0823,"lng":34.8141,"photo":"https://randomuser.me/api/portraits/men/46.jpg","bio":"גיטריסט בלהקה חובבנית, אוהב ג׳אם סשנים ובירה טובה.","hobbies":["music.jam","music.instruments","food.wine"],"traits":["relationship","social_drinker","cat_lover","creative","calm","traditional","vocational"]},
    {"n":8,"email":"itay@mibale.dev","name":"איתי גולן","gender":"male","birth":"1997-12-01","city":"תל אביב","lat":32.0628,"lng":34.7719,"photo":"https://randomuser.me/api/portraits/men/75.jpg","bio":"צלם ומטייל. אם יש זריחה — אני בדרך אליה עם מצלמה.","hobbies":["creative.photography","outdoors.hiking","outdoors.camping"],"traits":["single","non_smoker","dog_lover","adventurous","introvert","secular","student"]},
    {"n":9,"email":"yoni@mibale.dev","name":"יוני דהן","gender":"male","birth":"1989-03-27","city":"הרצליה","lat":32.1624,"lng":34.8447,"photo":"https://randomuser.me/api/portraits/men/52.jpg","bio":"אבא לשניים, מאמן כדורסל נוער ומארגן ערבי משחקי קופסה.","hobbies":["sport.basketball","games.board","family.kids"],"traits":["parent","non_smoker","has_pet","funny","extrovert","keeps_tradition","bachelor"]},
    {"n":10,"email":"ariel@mibale.dev","name":"אריאל נחום","gender":"male","birth":"1998-08-14","city":"גבעתיים","lat":32.0705,"lng":34.8102,"photo":"https://randomuser.me/api/portraits/men/11.jpg","bio":"סטודנט לפסיכולוגיה, מדיטציה בבוקר, סטנדאפ בערב.","hobbies":["wellness.meditation","culture.standup","learning.lectures"],"traits":["single","vegetarian","cat_lover","romantic","optimist","spiritual","student"]}
  ]'::jsonb;
  _p jsonb;
  _uid uuid;
  _ids uuid[] := '{}';
  _c uuid[] := '{}';
  _e uuid;
  _i integer;
begin
  -- ---------- users + profiles ----------
  for _p in select * from jsonb_array_elements(_people) loop
    _uid := ('00000000-0000-4000-a000-' || lpad((_p ->> 'n'), 12, '0'))::uuid;
    _ids := _ids || _uid;
    -- Token columns must be '' (not NULL) or GoTrue fails to sign the user in.
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', _uid, 'authenticated', 'authenticated', _p ->> 'email',
            extensions.crypt('mibale1234', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('name', _p ->> 'name'), now() - interval '20 days', now(),
            '', '', '', '')
    on conflict (id) do nothing;
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), _uid::text, _uid,
            jsonb_build_object('sub', _uid::text, 'email', _p ->> 'email', 'email_verified', true),
            'email', now(), now(), now())
    on conflict do nothing;

    update public.profiles set
      name = _p ->> 'name',
      gender = (_p ->> 'gender')::public.gender,
      birth_date = (_p ->> 'birth')::date,
      city = _p ->> 'city',
      avatar_url = _p ->> 'photo',
      photos = array[_p ->> 'photo', 'https://picsum.photos/seed/mibale-' || (_p ->> 'n') || 'a/600/800',
                     'https://picsum.photos/seed/mibale-' || (_p ->> 'n') || 'b/600/800'],
      bio = _p ->> 'bio',
      hobbies = array(select jsonb_array_elements_text(_p -> 'hobbies')),
      traits = array(select jsonb_array_elements_text(_p -> 'traits')),
      dating_enabled = (_p -> 'traits') ? 'single',
      pref_gender = case when _p ->> 'gender' = 'female' then 'male'::public.audience_gender else 'female'::public.audience_gender end,
      onboarded = true,
      last_seen_at = now()
    where id = _uid;

    insert into public.profile_locations (profile_id, lat, lng, city)
    values (_uid, (_p ->> 'lat')::float8, (_p ->> 'lng')::float8, _p ->> 'city')
    on conflict (profile_id) do update set lat = excluded.lat, lng = excluded.lng, city = excluded.city;
  end loop;

  -- Noa is the demo admin.
  insert into public.user_roles (user_id, role) values (_ids[1], 'admin') on conflict do nothing;

  -- ---------- communities ----------
  insert into public.communities (id, founder_id, name, description, hobby, city, image_url, audience_gender, min_age, max_age, auto_approve)
  values
    ('10000000-0000-4000-a000-000000000001', _ids[1], 'רצים בירקון', 'ריצות בוקר קבוצתיות בכל הקצבים. מתחילים ומתקדמים.', 'sport.running', 'תל אביב', 'https://picsum.photos/seed/mibale-run/800/500', 'all', 18, 60, true),
    ('10000000-0000-4000-a000-000000000002', _ids[2], 'מטיילות בטבע', 'טיולים רגליים לנשים בלבד — מסלולים קלים ובינוניים.', 'outdoors.hiking', 'רמת גן', 'https://picsum.photos/seed/mibale-hike/800/500', 'female', 21, 55, false),
    ('10000000-0000-4000-a000-000000000003', _ids[9], 'ערבי משחקי קופסה', 'קטאן, קודנמס, דיקסיט ועוד. מביאים חטיפים!', 'games.board', 'הרצליה', 'https://picsum.photos/seed/mibale-board/800/500', 'all', 18, 99, true),
    ('10000000-0000-4000-a000-000000000004', _ids[6], 'AI בתל אביב', 'מיטאפים, הרצאות והאקתונים סביב בינה מלאכותית.', 'tech.ai', 'תל אביב', 'https://picsum.photos/seed/mibale-ai/800/500', 'all', 18, 99, true),
    ('10000000-0000-4000-a000-000000000005', _ids[4], 'בשלנים ביחד', 'סדנאות בישול ביתיות וערבי טעימות.', 'food.cooking', 'הרצליה', 'https://picsum.photos/seed/mibale-cook/800/500', 'all', 25, 99, false)
  on conflict (id) do nothing;
  select array_agg(id order by id) into _c from public.communities
   where id::text like '10000000-0000-4000-a000-%';

  insert into public.community_members (community_id, profile_id, role) values
    (_c[1], _ids[6], 'admin'), (_c[1], _ids[3], 'member'), (_c[1], _ids[8], 'member'), (_c[1], _ids[5], 'member'),
    (_c[2], _ids[1], 'member'), (_c[2], _ids[3], 'member'), (_c[2], _ids[5], 'member'),
    (_c[3], _ids[3], 'member'), (_c[3], _ids[7], 'member'), (_c[3], _ids[10], 'member'), (_c[3], _ids[2], 'member'),
    (_c[4], _ids[5], 'admin'), (_c[4], _ids[1], 'member'), (_c[4], _ids[10], 'member'), (_c[4], _ids[8], 'member'),
    (_c[5], _ids[7], 'member'), (_c[5], _ids[2], 'member'), (_c[5], _ids[9], 'member'), (_c[5], _ids[4], 'founder')
  on conflict do nothing;

  -- ---------- events: 2 per person ----------
  insert into public.events (id, organizer_id, community_id, title, description, category, subcategory, image_url,
                             starts_at, is_online, location_name, city, lat, lng, meeting_url, seats, auto_approve)
  values
    ('20000000-0000-4000-a000-000000000001', _ids[1], _c[1], 'ריצת בוקר בפארק הירקון', 'ריצה של 6 ק״מ בקצב נוח, נפגשים ליד המזרקה.', 'sport', 'sport.running', 'https://picsum.photos/seed/mibale-e1/800/600', pg_temp.at_il(1, 7), false, 'פארק הירקון, גני יהושע', 'תל אביב', 32.0977, 34.8108, null, 9999, true),
    ('20000000-0000-4000-a000-000000000002', _ids[1], null, 'סדנת קרמיקה למתחילים', 'עובדים על האובניים, כל החומרים כלולים.', 'creative', 'creative.ceramics', 'https://picsum.photos/seed/mibale-e2/800/600', pg_temp.at_il(4, 18), false, 'סטודיו חומר, פלורנטין', 'תל אביב', 32.0566, 34.7698, null, 8, false),
    ('20000000-0000-4000-a000-000000000003', _ids[2], _c[2], 'טיול זריחה בנחל כזיב', 'מסלול מעגלי של 8 ק״מ, מתאים לכל אחת.', 'outdoors', 'outdoors.hiking', 'https://picsum.photos/seed/mibale-e3/800/600', pg_temp.at_il(6, 5), false, 'חניון נחל כזיב', 'גליל מערבי', 33.0469, 35.1669, null, 20, false),
    ('20000000-0000-4000-a000-000000000004', _ids[2], null, 'יוגה על הדשא', 'שיעור ויניאסה פתוח לכל הרמות. להביא מזרן.', 'sport', 'sport.yoga', 'https://picsum.photos/seed/mibale-e4/800/600', date_trunc('hour', now()) + interval '3 hours', false, 'פארק הלאומי רמת גן', 'רמת גן', 32.0503, 34.8256, null, 25, true),
    ('20000000-0000-4000-a000-000000000005', _ids[3], null, 'הקרנת סרטי סטודנטים', 'ערב קצרים מבית הספר לקולנוע + שיחה עם היוצרים.', 'culture', 'culture.cinema', 'https://picsum.photos/seed/mibale-e5/800/600', pg_temp.at_il(3, 20), false, 'סינמטק תל אביב', 'תל אביב', 32.0773, 34.7839, null, 60, true),
    ('20000000-0000-4000-a000-000000000006', _ids[3], _c[3], 'טורניר קטאן', 'טורניר ידידותי עם פרסים קטנים.', 'games', 'games.board', 'https://picsum.photos/seed/mibale-e6/800/600', pg_temp.at_il(8, 19), false, 'קפה משחקים, הרצליה', 'הרצליה', 32.1640, 34.8430, null, 16, true),
    ('20000000-0000-4000-a000-000000000007', _ids[4], _c[5], 'ערב בישול איטלקי', 'פסטה טרייה מאפס, טירמיסו וקצת יין.', 'food', 'food.cooking', 'https://picsum.photos/seed/mibale-e7/800/600', pg_temp.at_il(2, 19), false, 'הבית של תמר', 'הרצליה', 32.1663, 34.8436, null, 10, false),
    ('20000000-0000-4000-a000-000000000008', _ids[4], null, 'מועדון ספר — חודש ספטמבר', 'דנים ב"שמונה ימים בשבוע". אונליין.', 'learning', 'learning.books', 'https://picsum.photos/seed/mibale-e8/800/600', pg_temp.at_il(5, 21), true, null, null, null, null, 'https://meet.example.com/mibale-books', 9999, true),
    ('20000000-0000-4000-a000-000000000009', _ids[5], _c[4], 'האקתון AI לטובת עמותות', '24 שעות של בנייה לטובת עמותות בעלי חיים.', 'tech', 'tech.hackathons', 'https://picsum.photos/seed/mibale-e9/800/600', pg_temp.at_il(12, 9), false, 'מתחם השוק, גבעתיים', 'גבעתיים', 32.0722, 34.8125, null, 40, false),
    ('20000000-0000-4000-a000-000000000010', _ids[5], null, 'ערב סלסה למתחילים', 'שיעור של שעה ואז מסיבה. אין צורך בבן/בת זוג.', 'party', 'party.dancing', 'https://picsum.photos/seed/mibale-e10/800/600', pg_temp.at_il(1, 21), false, 'סטודיו לטינו', 'תל אביב', 32.0660, 34.7790, null, 30, true),
    ('20000000-0000-4000-a000-000000000011', _ids[6], _c[4], 'מיטאפ: סוכני AI בפרודקשן', 'שתי הרצאות + פיצה + נטוורקינג.', 'tech', 'tech.meetups', 'https://picsum.photos/seed/mibale-e11/800/600', pg_temp.at_il(2, 18), false, 'WeWork שרונה', 'תל אביב', 32.0719, 34.7874, null, 120, true),
    ('20000000-0000-4000-a000-000000000012', _ids[6], _c[1], 'אינטרוולים על המסלול', 'אימון מהירות קבוצתי, 45 דקות.', 'sport', 'sport.running', 'https://picsum.photos/seed/mibale-e12/800/600', pg_temp.at_il(5, 6), false, 'אצטדיון גבעת רם', 'תל אביב', 32.1101, 34.8047, null, 9999, true),
    ('20000000-0000-4000-a000-000000000013', _ids[7], null, 'ג׳אם סשן פתוח', 'מביאים כלי ומנגנים ביחד. מתופף ובסיסט במקום.', 'music', 'music.jam', 'https://picsum.photos/seed/mibale-e13/800/600', pg_temp.at_il(3, 21), false, 'בר הבלוז, רמת גן', 'רמת גן', 32.0833, 34.8144, null, 25, true),
    ('20000000-0000-4000-a000-000000000014', _ids[7], null, 'טעימות בירה ביתית', 'חמישה סגנונות, הסברים ונשנושים.', 'food', 'food.wine', 'https://picsum.photos/seed/mibale-e14/800/600', pg_temp.at_il(9, 20), false, 'מבשלת הגג', 'רמת גן', 32.0801, 34.8120, null, 15, false),
    ('20000000-0000-4000-a000-000000000015', _ids[8], null, 'צילום זריחה ביפו', 'סדנת צילום שטח קצרה ואז קפה.', 'creative', 'creative.photography', 'https://picsum.photos/seed/mibale-e15/800/600', pg_temp.at_il(1, 5), false, 'גבעת השעון, יפו', 'תל אביב', 32.0546, 34.7521, null, 12, true),
    ('20000000-0000-4000-a000-000000000016', _ids[8], null, 'קמפינג במכתש רמון', 'לילה תחת כוכבים, ארוחה על האש.', 'outdoors', 'outdoors.camping', 'https://picsum.photos/seed/mibale-e16/800/600', pg_temp.at_il(15, 16), false, 'חניון לילה בארות', 'מצפה רמון', 30.6100, 34.8010, null, 20, false),
    ('20000000-0000-4000-a000-000000000017', _ids[9], _c[3], 'ערב קודנמס ודיקסיט', 'משחקים קלילים לקבוצות.', 'games', 'games.board', 'https://picsum.photos/seed/mibale-e17/800/600', pg_temp.at_il(4, 20), false, 'מתנ״ס הרצליה', 'הרצליה', 32.1650, 34.8400, null, 24, true),
    ('20000000-0000-4000-a000-000000000018', _ids[9], null, 'כדורסל 3 על 3', 'משחק שכונתי, כל הרמות.', 'sport', 'sport.basketball', 'https://picsum.photos/seed/mibale-e18/800/600', pg_temp.at_il(7, 18), false, 'מגרש נוף ים', 'הרצליה', 32.1700, 34.8300, null, 12, true),
    ('20000000-0000-4000-a000-000000000019', _ids[10], null, 'מדיטציה בשקיעה', 'תרגול מודרך של 40 דקות על החוף.', 'wellness', 'wellness.meditation', 'https://picsum.photos/seed/mibale-e19/800/600', pg_temp.at_il(1, 19), false, 'חוף גורדון', 'תל אביב', 32.0833, 34.7675, null, 9999, true),
    ('20000000-0000-4000-a000-000000000020', _ids[10], null, 'ערב סטנדאפ פתוח', 'במה פתוחה לקומיקאים מתחילים.', 'culture', 'culture.standup', 'https://picsum.photos/seed/mibale-e20/800/600', pg_temp.at_il(6, 21), false, 'קומדי בר', 'תל אביב', 32.0700, 34.7800, null, 50, true)
  on conflict (id) do nothing;

  -- ---------- participation ----------
  for _i in 1..20 loop
    _e := ('20000000-0000-4000-a000-' || lpad(_i::text, 12, '0'))::uuid;
    insert into public.event_participants (event_id, profile_id, status)
    select _e, _ids[((_i + k) % 10) + 1],
           case when k = 3 then 'pending'::public.participant_status else 'approved'::public.participant_status end
    from generate_series(1, 3) as k
    where _ids[((_i + k) % 10) + 1] <> (select organizer_id from public.events where id = _e)
      and not (_i = 3 and (select gender from public.profiles where id = _ids[((_i + k) % 10) + 1]) = 'male')
    on conflict do nothing;
  end loop;

  -- ---------- follows ----------
  insert into public.follows (follower_id, following_id)
  select a, b from unnest(_ids) a, unnest(_ids) b
  where a <> b and (abs(hashtext(a::text || b::text)) % 3) = 0
  on conflict do nothing;

  -- ---------- stories ----------
  insert into public.stories (author_id, event_id, media_url, media_type, caption) values
    (_ids[1], '20000000-0000-4000-a000-000000000001', 'https://picsum.photos/seed/mibale-s1/720/1280', 'image', 'מחר בבוקר רצים! מי בא?'),
    (_ids[6], '20000000-0000-4000-a000-000000000011', 'https://picsum.photos/seed/mibale-s2/720/1280', 'image', 'נשארו מקומות למיטאפ'),
    (_ids[8], null, 'https://picsum.photos/seed/mibale-s3/720/1280', 'image', 'הזריחה של הבוקר 🌅'),
    (_ids[3], null, 'https://picsum.photos/seed/mibale-s4/720/1280', 'image', 'סט הצילומים של היום');

  -- ---------- a few direct messages ----------
  insert into public.direct_messages (sender_id, recipient_id, body, created_at) values
    (_ids[6], _ids[1], 'היי! ראיתי שאת רצה בירקון, מצטרף מחר 🙂', now() - interval '3 hours'),
    (_ids[1], _ids[6], 'מעולה, נפגשים ב-7 ליד המזרקה', now() - interval '2 hours'),
    (_ids[3], _ids[1], 'יש עוד מקום בסדנת הקרמיקה?', now() - interval '30 minutes');
end;
$$;
