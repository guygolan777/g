-- ============================================================
-- mibale · 20 demo users (run after migrations, as postgres / service role)
-- 10 women + 10 men across Israel. Password for all: mibale1234
-- Every user founds one community and opens one event in it;
-- 14 of them have dating mode (the heart) on, with likes, matches and romantic stories.
-- Safe to run more than once (fixed ids, on conflict do nothing).
-- ============================================================

create or replace function pg_temp.at_il(_days integer, _hour integer)
returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'Asia/Jerusalem') + make_interval(days => _days, hours => _hour))
         at time zone 'Asia/Jerusalem';
$$;

do $$
declare
  _people jsonb := '[
    {"n":1,"email":"adi@mibale.dev","name":"עדי כהן","gender":"female","birth":"1995-03-14","city":"תל אביב","lat":32.0809,"lng":34.7697,"photo":"https://randomuser.me/api/portraits/women/12.jpg","bio":"מדריכת פילאטיס, מכורה לקפה טוב ולשקיעות בחוף.","hobbies":["fitness.pilates","meet.coffee","fun.workshop"],"traits":["single","non_smoker","sporty","optimist","secular","bachelor"],"dating":true,
     "community":{"name":"פילאטיס על החוף","desc":"אימוני פילאטיס פתוחים על החול, לכל הרמות.","hobby":"fitness.pilates"},
     "event":{"title":"פילאטיס בשקיעה בחוף בוגרשוב","desc":"אימון של 50 דקות מול הים. להביא מגבת ומים.","sub":"fitness.pilates","day":1,"hour":18,"place":"חוף בוגרשוב","price":0,"seats":20}},
    {"n":2,"email":"lior@mibale.dev","name":"ליאור מזרחי","gender":"female","birth":"1992-07-02","city":"חיפה","lat":32.7940,"lng":34.9896,"photo":"https://randomuser.me/api/portraits/women/21.jpg","bio":"מהנדסת ביום, מטיילת בסופ״ש. תמיד עם תרמוס.","hobbies":["offroad.hiking","offroad.nature","meet.picnic"],"traits":["single","nature_lover","adventurous","calm","secular","master"],"dating":true,
     "community":{"name":"מטיילים בכרמל","desc":"טיולי יום בכרמל ובגליל, מסלולים קלים ובינוניים.","hobby":"offroad.hiking"},
     "event":{"title":"מסלול נחל כלח","desc":"מסלול מעגלי של 7 ק״מ עם עצירת קפה בתצפית.","sub":"offroad.hiking","day":3,"hour":8,"place":"חניון נחל כלח","price":0,"seats":25}},
    {"n":3,"email":"roni@mibale.dev","name":"רוני אברהם","gender":"female","birth":"1998-11-20","city":"ירושלים","lat":31.7683,"lng":35.2137,"photo":"https://randomuser.me/api/portraits/women/33.jpg","bio":"סטודנטית לפסיכולוגיה, פותרת חידות מהר מדי.","hobbies":["board.escape","board.trivia","fun.bar"],"traits":["single","funny","extrovert","student","traditional"],"dating":true,
     "community":{"name":"חדרי בריחה ירושלים","desc":"בונים צוותים ובורחים מחדר חדש כל שבועיים.","hobby":"board.escape"},
     "event":{"title":"חדר בריחה: המעבדה הסודית","desc":"צוות של 6, רמת קושי בינונית. אחרי זה בירה.","sub":"board.escape","day":2,"hour":20,"place":"אסקייפ רום, תלפיות","price":90,"seats":6}},
    {"n":4,"email":"hila@mibale.dev","name":"הילה פרץ","gender":"female","birth":"1989-01-09","city":"רמת גן","lat":32.0823,"lng":34.8106,"photo":"https://randomuser.me/api/portraits/women/45.jpg","bio":"עורכת ספרים, קוראת שלושה ספרים במקביל.","hobbies":["meet.bookclub","meet.coffee","fun.cinema"],"traits":["married","introvert","creative","movie_lover","secular","master"],"dating":false,
     "community":{"name":"מועדון קריאה רמת גן","desc":"ספר אחד בחודש, מפגש אחד — לפעמים בבית קפה, לפעמים בזום.","hobby":"meet.bookclub"},
     "event":{"title":"מועדון ספר: ״סיפור על אהבה וחושך״","desc":"מפגש אונליין של שעה וחצי. לא חייבים לסיים את הספר.","sub":"meet.bookclub","day":5,"hour":20,"online":true,"price":0,"seats":9999}},
    {"n":5,"email":"eden@mibale.dev","name":"עדן ביטון","gender":"female","birth":"1996-05-28","city":"ראשון לציון","lat":31.9730,"lng":34.7925,"photo":"https://randomuser.me/api/portraits/women/52.jpg","bio":"רוקדת מגיל 6. מלמדת בצ׳אטה ומחפשת פרטנר לחיים ולרחבה.","hobbies":["fun.party","fun.bar","meet.dinner"],"traits":["single","extrovert","romantic","social_drinker","traditional","high_school"],"dating":true,
     "community":{"name":"רוקדים סלסה בראשון","desc":"שיעורים ומסיבות סלסה ובצ׳אטה, מגיעים לבד או בזוג.","hobby":"fun.party"},
     "event":{"title":"ערב בצ׳אטה למתחילים","desc":"שיעור של שעה ואז מסיבה. אין צורך בפרטנר.","sub":"fun.party","day":4,"hour":21,"place":"סטודיו לטינו, ראשון","price":50,"seats":40}},
    {"n":6,"email":"michal@mibale.dev","name":"מיכל שפירא","gender":"female","birth":"1993-09-17","city":"הרצליה","lat":32.1663,"lng":34.8436,"photo":"https://randomuser.me/api/portraits/women/63.jpg","bio":"וטרינרית, גרה עם שלושה כלבים וחתול אחד שמנהל את הבית.","hobbies":["volunteering.animals","offroad.nature","meet.walk"],"traits":["relationship","dog_lover","has_pet","calm","secular","phd"],"dating":false,
     "community":{"name":"מתנדבים למען כלבים","desc":"הליכות עם כלבי מקלט, ימי אימוץ ועזרה בעמותות.","hobby":"volunteering.animals"},
     "event":{"title":"יום אימוץ והליכה עם כלבים","desc":"מוציאים כלבים מהמקלט לטיול ומכירים משפחות מאמצות.","sub":"volunteering.animals","day":6,"hour":10,"place":"פארק הרצליה","price":0,"seats":30}},
    {"n":7,"email":"noya@mibale.dev","name":"נויה דהן","gender":"female","birth":"1999-02-03","city":"באר שבע","lat":31.2520,"lng":34.7915,"photo":"https://randomuser.me/api/portraits/women/68.jpg","bio":"רצה חצי מרתון ראשון בחורף. בדרך למלא.","hobbies":["fitness.running","fitness.gym","meet.coffee"],"traits":["single","sporty","ambitious","non_smoker","student","secular"],"dating":true,
     "community":{"name":"רצות באר שבע","desc":"קבוצת ריצה לנשים בלבד — שלוש ריצות בשבוע.","hobby":"fitness.running","audience":"female"},
     "event":{"title":"ריצת ערב בפארק הנחל","desc":"6 ק״מ בקצב שיחה, לנשים בלבד.","sub":"fitness.running","day":2,"hour":19,"place":"פארק נחל באר שבע","price":0,"seats":30,"audience":"female"}},
    {"n":8,"email":"shani@mibale.dev","name":"שני גולדברג","gender":"female","birth":"1994-12-11","city":"כפר סבא","lat":32.1750,"lng":34.9070,"photo":"https://randomuser.me/api/portraits/women/74.jpg","bio":"מעצבת פנים. אוהבת צמחים, קרמיקה וארוחות ארוכות.","hobbies":["fun.workshop","meet.dinner","fun.restaurant"],"traits":["single","creative","vegetarian","romantic","secular","bachelor"],"dating":true,
     "community":{"name":"סדנאות יצירה בשרון","desc":"קרמיקה, טרריום, רקמה — סדנה חדשה בכל חודש.","hobby":"fun.workshop"},
     "event":{"title":"סדנת טרריום","desc":"בונים גן זכוכית קטן והולכים איתו הביתה. כל החומרים כלולים.","sub":"fun.workshop","day":7,"hour":18,"place":"סטודיו ירוק, כפר סבא","price":140,"seats":10}},
    {"n":9,"email":"tal@mibale.dev","name":"טל רוזן","gender":"female","birth":"1987-06-22","city":"מודיעין","lat":31.8980,"lng":35.0104,"photo":"https://randomuser.me/api/portraits/women/81.jpg","bio":"אמא לשניים, מארגנת כל פיקניק בשכונה.","hobbies":["meet.picnic","meet.walk","religion.holiday"],"traits":["married","parent","optimist","keeps_tradition","bachelor"],"dating":false,
     "community":{"name":"הורים ופיקניקים במודיעין","desc":"מפגשי משפחות בפארקים — הילדים משחקים, ההורים מכירים.","hobby":"meet.picnic"},
     "event":{"title":"פיקניק משפחות בפארק ענבה","desc":"כל אחד מביא משהו קטן. יש צל ומתקנים לילדים.","sub":"meet.picnic","day":9,"hour":16,"place":"פארק ענבה","price":0,"seats":60}},
    {"n":10,"email":"avigail@mibale.dev","name":"אביגיל נחום","gender":"female","birth":"1997-08-30","city":"ירושלים","lat":31.7780,"lng":35.2240,"photo":"https://randomuser.me/api/portraits/women/90.jpg","bio":"מורה לתנ״ך, אוהבת שיעורים טובים ושולחן שבת מלא.","hobbies":["religion.torah","religion.shabbat","meet.coffee"],"traits":["single","religious","calm","romantic","bachelor"],"dating":true,
     "community":{"name":"שיעורי תורה לצעירים","desc":"שיעור שבועי פתוח בפרשת השבוע, עם כיבוד ושיחה.","hobby":"religion.torah"},
     "event":{"title":"שיעור פרשת שבוע + כיבוד","desc":"שיעור של 45 דקות ואז שיחה פתוחה.","sub":"religion.torah","day":3,"hour":20,"place":"בית הכנסת נחלאות","price":0,"seats":40}},
    {"n":11,"email":"uri@mibale.dev","name":"אורי ברק","gender":"male","birth":"1994-04-04","city":"תל אביב","lat":32.0900,"lng":34.7800,"photo":"https://randomuser.me/api/portraits/men/12.jpg","bio":"מפתח בסטארטאפ, שוער בשישי בבוקר.","hobbies":["ball.football","meet.beer","fun.bar"],"traits":["single","sporty","funny","social_drinker","secular","bachelor"],"dating":true,
     "community":{"name":"כדורגל שישי בבוקר","desc":"משחקים קבועים בגני יהושע, קבוצות מתחלפות.","hobby":"ball.football"},
     "event":{"title":"משחק 7 על 7 בגני יהושע","desc":"מגיעים ב-8:45, מחלקים קבוצות, משחקים עד 11.","sub":"ball.football","day":3,"hour":9,"place":"מגרש גני יהושע","price":0,"seats":14}},
    {"n":12,"email":"guy@mibale.dev","name":"גיא אלמוג","gender":"male","birth":"1991-10-19","city":"גבעתיים","lat":32.0722,"lng":34.8125,"photo":"https://randomuser.me/api/portraits/men/22.jpg","bio":"רואה חשבון עם פוקר פייס מושלם.","hobbies":["poker.holdem","board.strategy","meet.beer"],"traits":["single","calm","ambitious","non_smoker","secular","master"],"dating":true,
     "community":{"name":"פוקר חברים גבעתיים","desc":"ערבי טקסס הולדם על צ׳יפים, בלי כסף אמיתי.","hobby":"poker.holdem"},
     "event":{"title":"ערב טקסס הולדם ידידותי","desc":"שולחן של 9, מלמדים מתחילים. הכניסה כוללת פיצה.","sub":"poker.holdem","day":4,"hour":21,"place":"הבית של גיא","price":50,"seats":9}},
    {"n":13,"email":"nadav@mibale.dev","name":"נדב שגיא","gender":"male","birth":"1996-03-08","city":"חיפה","lat":32.8000,"lng":34.9900,"photo":"https://randomuser.me/api/portraits/men/32.jpg","bio":"רוכב שטח, מכונאי אופניים חובב.","hobbies":["offroad.mtb","offroad.camping","fitness.cycling"],"traits":["single","adventurous","nature_lover","sporty","secular","student"],"dating":true,
     "community":{"name":"אופני שטח בכרמל","desc":"רכיבות בוקר בסינגלים של הכרמל, רמה בינונית ומעלה.","hobby":"offroad.mtb"},
     "event":{"title":"רכיבת שטח: סינגל אורן","desc":"22 ק״מ, 450 מטר טיפוס. קסדה חובה.","sub":"offroad.mtb","day":5,"hour":7,"place":"חניון נחל אורן","price":0,"seats":15}},
    {"n":14,"email":"roy@mibale.dev","name":"רועי חדד","gender":"male","birth":"1988-12-01","city":"פתח תקווה","lat":32.0840,"lng":34.8878,"photo":"https://randomuser.me/api/portraits/men/41.jpg","bio":"מורה למתמטיקה, שחמטאי מדורג.","hobbies":["board.chess","board.strategy","meet.coffee"],"traits":["married","parent","introvert","calm","traditional","master"],"dating":false,
     "community":{"name":"שחמט פתח תקווה","desc":"ערבי שחמט שבועיים, טורנירי בליץ ושיעורים למתחילים.","hobby":"board.chess"},
     "event":{"title":"טורניר בליץ פתוח","desc":"5+3, שבעה סבבים שוויצריים. לוחות במקום.","sub":"board.chess","day":6,"hour":19,"place":"מתנ״ס כפר גנים","price":20,"seats":32}},
    {"n":15,"email":"alon@mibale.dev","name":"אלון קפלן","gender":"male","birth":"1993-06-15","city":"נתניה","lat":32.3215,"lng":34.8532,"photo":"https://randomuser.me/api/portraits/men/47.jpg","bio":"מציל בקיץ, שחקן כדורעף כל השנה.","hobbies":["ball.volleyball","fitness.swimming","meet.beer"],"traits":["single","sporty","extrovert","traveler","secular","high_school"],"dating":true,
     "community":{"name":"כדורעף חופים נתניה","desc":"משחקים בחוף פולג ובחוף סירונית, מתחילים מוזמנים.","hobby":"ball.volleyball"},
     "event":{"title":"כדורעף חופים בשקיעה","desc":"2 על 2 ו-4 על 4, מחליפים כל משחקון.","sub":"ball.volleyball","day":1,"hour":18,"place":"חוף סירונית","price":0,"seats":12}},
    {"n":16,"email":"ido@mibale.dev","name":"עידו מלכה","gender":"male","birth":"1997-01-27","city":"באר שבע","lat":31.2600,"lng":34.8000,"photo":"https://randomuser.me/api/portraits/men/55.jpg","bio":"מבשל בירה במרפסת, סטודנט להנדסה.","hobbies":["meet.beer","fun.standup","board.party"],"traits":["single","funny","creative","social_drinker","student","secular"],"dating":true,
     "community":{"name":"בירה ומשחקים בב״ש","desc":"טעימות בירה, משחקי מסיבה וסטנדאפ בעיר העתיקה.","hobby":"meet.beer"},
     "event":{"title":"טעימות בירה מקומית","desc":"חמש בירות של מבשלות מהנגב, עם נשנושים.","sub":"meet.beer","day":8,"hour":20,"place":"בר העיר העתיקה","price":70,"seats":20}},
    {"n":17,"email":"matan@mibale.dev","name":"מתן וייס","gender":"male","birth":"1990-09-09","city":"רעננה","lat":32.1848,"lng":34.8713,"photo":"https://randomuser.me/api/portraits/men/61.jpg","bio":"אבא לשלושה, מתנדב בבית אבות כבר חמש שנים.","hobbies":["volunteering.elderly","volunteering.community","board.trivia"],"traits":["married","parent","optimist","keeps_tradition","bachelor"],"dating":false,
     "community":{"name":"מתנדבים עם גיל הזהב","desc":"ביקורים, משחקים וסיפורים עם דיירי בתי אבות בשרון.","hobby":"volunteering.elderly"},
     "event":{"title":"בוקר משחקים בבית אבות","desc":"שש־בש, טריוויה ושירה בציבור. שעה וחצי של שמחה.","sub":"volunteering.elderly","day":10,"hour":10,"place":"בית אבות נווה רעננה","price":0,"seats":15}},
    {"n":18,"email":"aviv@mibale.dev","name":"אביב סלע","gender":"male","birth":"1995-02-14","city":"תל אביב","lat":32.0700,"lng":34.7750,"photo":"https://randomuser.me/api/portraits/men/68.jpg","bio":"גיטריסט, מלמד מוזיקה ומנגן בגגות.","hobbies":["fun.concert","fun.bar","meet.beer"],"traits":["single","musician","romantic","creative","secular","bachelor"],"dating":true,
     "community":{"name":"ג׳אם סשנים","desc":"מנגנים ביחד — מביאים כלי או רק קול.","hobby":"fun.concert"},
     "event":{"title":"ג׳אם אקוסטי על הגג","desc":"גיטרות, קחון ושירים שכולם מכירים. להביא משהו לשתות.","sub":"fun.concert","day":2,"hour":21,"place":"גג בפלורנטין","price":0,"seats":25}},
    {"n":19,"email":"ben@mibale.dev","name":"בן עזרא","gender":"male","birth":"1992-05-05","city":"רחובות","lat":31.8928,"lng":34.8113,"photo":"https://randomuser.me/api/portraits/men/76.jpg","bio":"חוקר במכון ויצמן, נוהג בג׳יפ ישן ואהוב.","hobbies":["offroad.jeep","offroad.camping","offroad.nature"],"traits":["single","adventurous","traveler","calm","secular","phd"],"dating":true,
     "community":{"name":"ג׳יפים בנגב","desc":"טיולי שטח בנגב ובערבה, יוצאים בשיירה.","hobby":"offroad.jeep"},
     "event":{"title":"טיול ג׳יפים למכתש הגדול","desc":"יום שלם בשטח, ארוחת צהריים על האש. מקומות ברכבים.","sub":"offroad.jeep","day":12,"hour":7,"place":"צומת הערבה","price":200,"seats":8}},
    {"n":20,"email":"tomer@mibale.dev","name":"תומר נגר","gender":"male","birth":"1999-07-21","city":"חולון","lat":32.0158,"lng":34.7874,"photo":"https://randomuser.me/api/portraits/men/83.jpg","bio":"מאמן כושר אישי, קם ב-5 ונהנה מזה.","hobbies":["fitness.gym","fitness.running","ball.basketball"],"traits":["relationship","sporty","ambitious","non_smoker","secular","high_school"],"dating":false,
     "community":{"name":"אימוני כוח בחולון","desc":"אימונים פונקציונליים בפארקים, בחינם.","hobby":"fitness.gym"},
     "event":{"title":"אימון פונקציונלי בפארק","desc":"45 דקות, משקל גוף וגומיות. מתאים לכולם.","sub":"fitness.gym","day":1,"hour":7,"place":"פארק פרס, חולון","price":0,"seats":25}}
  ]'::jsonb;
  _p jsonb;
  _uid uuid;
  _cid uuid;
  _eid uuid;
  _ids uuid[] := '{}';
  _female boolean[] := '{}';
  _i integer;
  _k integer;
  _j integer;
begin
  -- ---------- users + profiles ----------
  for _p in select * from jsonb_array_elements(_people) loop
    _uid := ('00000000-0000-4000-b000-' || lpad(_p ->> 'n', 12, '0'))::uuid;
    _ids := _ids || _uid;
    _female := _female || (_p ->> 'gender' = 'female');
    -- Token columns must be '' (not NULL) or GoTrue fails to sign the user in.
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', _uid, 'authenticated', 'authenticated', _p ->> 'email',
            extensions.crypt('mibale1234', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('name', _p ->> 'name'), now() - make_interval(days => 30 - (_p ->> 'n')::int), now(),
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
      photos = array[_p ->> 'photo',
                     'https://picsum.photos/seed/mibale-d' || (_p ->> 'n') || 'a/600/800',
                     'https://picsum.photos/seed/mibale-d' || (_p ->> 'n') || 'b/600/800'],
      bio = _p ->> 'bio',
      hobbies = array(select jsonb_array_elements_text(_p -> 'hobbies')),
      traits = array(select jsonb_array_elements_text(_p -> 'traits')),
      dating_enabled = (_p ->> 'dating')::boolean,
      pref_gender = case when _p ->> 'gender' = 'female' then 'male'::public.audience_gender else 'female'::public.audience_gender end,
      pref_min_age = 21,
      pref_max_age = 45,
      pref_distance_km = 150,
      onboarded = true,
      last_seen_at = now() - make_interval(mins => (_p ->> 'n')::int * 7)
    where id = _uid;

    insert into public.profile_locations (profile_id, lat, lng, city)
    values (_uid, (_p ->> 'lat')::float8, (_p ->> 'lng')::float8, _p ->> 'city')
    on conflict (profile_id) do update set lat = excluded.lat, lng = excluded.lng, city = excluded.city;

    -- ---------- one community per user (founder membership is added by trigger) ----------
    _cid := ('10000000-0000-4000-b000-' || lpad(_p ->> 'n', 12, '0'))::uuid;
    insert into public.communities (id, founder_id, name, description, hobby, city, image_url, audience_gender, auto_approve)
    values (_cid, _uid, _p -> 'community' ->> 'name', _p -> 'community' ->> 'desc', _p -> 'community' ->> 'hobby',
            _p ->> 'city', 'https://picsum.photos/seed/mibale-dc' || (_p ->> 'n') || '/800/500',
            coalesce(_p -> 'community' ->> 'audience', 'all')::public.audience_gender, true)
    on conflict (id) do nothing;

    -- ---------- one event per user, in their community ----------
    _eid := ('20000000-0000-4000-b000-' || lpad(_p ->> 'n', 12, '0'))::uuid;
    insert into public.events (id, organizer_id, community_id, title, description, category, subcategory, image_url,
                               starts_at, ends_at, is_online, location_name, city, lat, lng, meeting_url,
                               seats, auto_approve, price, gender_target)
    values (_eid, _uid, _cid, _p -> 'event' ->> 'title', _p -> 'event' ->> 'desc',
            split_part(_p -> 'event' ->> 'sub', '.', 1), _p -> 'event' ->> 'sub',
            'https://picsum.photos/seed/mibale-de' || (_p ->> 'n') || '/800/600',
            pg_temp.at_il((_p -> 'event' ->> 'day')::int, (_p -> 'event' ->> 'hour')::int),
            pg_temp.at_il((_p -> 'event' ->> 'day')::int, (_p -> 'event' ->> 'hour')::int) + interval '2 hours',
            coalesce((_p -> 'event' ->> 'online')::boolean, false),
            _p -> 'event' ->> 'place',
            case when coalesce((_p -> 'event' ->> 'online')::boolean, false) then null else _p ->> 'city' end,
            case when coalesce((_p -> 'event' ->> 'online')::boolean, false) then null else (_p ->> 'lat')::float8 end,
            case when coalesce((_p -> 'event' ->> 'online')::boolean, false) then null else (_p ->> 'lng')::float8 end,
            case when coalesce((_p -> 'event' ->> 'online')::boolean, false) then 'https://meet.example.com/mibale-' || (_p ->> 'n') end,
            (_p -> 'event' ->> 'seats')::int, true, (_p -> 'event' ->> 'price')::numeric,
            coalesce(_p -> 'event' ->> 'audience', 'all')::public.audience_gender)
    on conflict (id) do nothing;
  end loop;

  -- ---------- community members: 5 others per community ----------
  for _i in 1..20 loop
    _cid := ('10000000-0000-4000-b000-' || lpad(_i::text, 12, '0'))::uuid;
    for _k in 1..6 loop
      _j := ((_i - 1 + _k * 3) % 20) + 1;
      continue when _j = _i;
      -- women-only community (#7) takes women only
      continue when _i = 7 and not _female[_j];
      insert into public.community_members (community_id, profile_id, role)
      values (_cid, _ids[_j], case when _k = 1 then 'admin'::public.community_role else 'member'::public.community_role end)
      on conflict do nothing;
    end loop;
  end loop;

  -- ---------- event participants: 4 approved + 1 pending ----------
  for _i in 1..20 loop
    _eid := ('20000000-0000-4000-b000-' || lpad(_i::text, 12, '0'))::uuid;
    for _k in 1..5 loop
      _j := ((_i - 1 + _k * 7) % 20) + 1;
      continue when _j = _i;
      continue when _i = 7 and not _female[_j];
      insert into public.event_participants (event_id, profile_id, status)
      values (_eid, _ids[_j], case when _k = 5 then 'pending'::public.participant_status else 'approved'::public.participant_status end)
      on conflict do nothing;
    end loop;
  end loop;

  -- ---------- follows ----------
  insert into public.follows (follower_id, following_id)
  select a, b from unnest(_ids) a, unnest(_ids) b
  where a <> b and (abs(hashtext(a::text || '>' || b::text)) % 4) = 0
  on conflict do nothing;

  -- ---------- dating: likes between users whose heart is on ----------
  -- Women with the heart on: 1,2,3,5,7,8,10 · men: 11,12,13,15,16,18,19.
  -- Mutual likes become matches (trigger); one-sided likes show up under "חיבבו אותך".
  insert into public.romantic_likes (liker_id, liked_id, action) values
    (_ids[11], _ids[1], 'like'), (_ids[1], _ids[11], 'like'),   -- match: Uri & Adi
    (_ids[18], _ids[5], 'like'), (_ids[5], _ids[18], 'like'),   -- match: Aviv & Eden
    (_ids[13], _ids[2], 'like'), (_ids[2], _ids[13], 'like'),   -- match: Nadav & Lior
    (_ids[12], _ids[8], 'like'),
    (_ids[15], _ids[1], 'like'),
    (_ids[16], _ids[7], 'like'),
    (_ids[19], _ids[3], 'like'),
    (_ids[3], _ids[12], 'like'),
    (_ids[10], _ids[19], 'like'),
    (_ids[8], _ids[18], 'like'),
    (_ids[7], _ids[15], 'pass')
  on conflict do nothing;
end;
$$;

-- ---------- stories (kept for a week so the demo stays lively) ----------
insert into public.stories (author_id, event_id, media_url, media_type, caption, is_romantic, expires_at)
select v.author::uuid, v.event::uuid, v.media, 'image', v.caption, v.romantic, now() + interval '7 days'
from (values
  ('00000000-0000-4000-b000-000000000001', '20000000-0000-4000-b000-000000000001', 'https://picsum.photos/seed/mibale-ds1/720/1280', 'מחר פילאטיס בשקיעה, מי בא? 🌅', false),
  ('00000000-0000-4000-b000-000000000011', '20000000-0000-4000-b000-000000000011', 'https://picsum.photos/seed/mibale-ds2/720/1280', 'חסרים שני שחקנים לשישי ⚽', false),
  ('00000000-0000-4000-b000-000000000002', null, 'https://picsum.photos/seed/mibale-ds3/720/1280', 'הנוף מהכרמל הבוקר', false),
  ('00000000-0000-4000-b000-000000000018', '20000000-0000-4000-b000-000000000018', 'https://picsum.photos/seed/mibale-ds4/720/1280', 'מכוונים גיטרות לג׳אם 🎸', false),
  ('00000000-0000-4000-b000-000000000008', '20000000-0000-4000-b000-000000000008', 'https://picsum.photos/seed/mibale-ds5/720/1280', 'הטרריומים מוכנים לסדנה', false),
  ('00000000-0000-4000-b000-000000000019', null, 'https://picsum.photos/seed/mibale-ds6/720/1280', 'הג׳יפ חזר מהמוסך, יוצאים לשטח', false),
  ('00000000-0000-4000-b000-000000000006', '20000000-0000-4000-b000-000000000006', 'https://picsum.photos/seed/mibale-ds7/720/1280', 'הכלבים האלה מחכים למשפחה 🐶', false),
  ('00000000-0000-4000-b000-000000000005', null, 'https://picsum.photos/seed/mibale-dr1/720/1280', 'מחפשת פרטנר לבצ׳אטה… ולקפה אחרי 💃', true),
  ('00000000-0000-4000-b000-000000000013', null, 'https://picsum.photos/seed/mibale-dr2/720/1280', 'מי מצטרפת לזריחה בכרמל? ☕', true),
  ('00000000-0000-4000-b000-000000000003', null, 'https://picsum.photos/seed/mibale-dr3/720/1280', 'מחפשת מישהו שיפתור איתי חידות 🧩', true),
  ('00000000-0000-4000-b000-000000000015', null, 'https://picsum.photos/seed/mibale-dr4/720/1280', 'שקיעה בסירונית, חסרה רק את 🌊', true),
  ('00000000-0000-4000-b000-000000000010', null, 'https://picsum.photos/seed/mibale-dr5/720/1280', 'שולחן שבת מחכה לאורחים 🕯️', true)
) as v(author, event, media, caption, romantic)
where not exists (select 1 from public.stories s where s.author_id = v.author::uuid and s.caption = v.caption);

-- ---------- a few conversations ----------
insert into public.direct_messages (sender_id, recipient_id, body, created_at)
select v.s::uuid, v.r::uuid, v.body, now() - make_interval(mins => v.ago)
from (values
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000001', 'היי עדי! ראיתי שגם את אוהבת שקיעות 🙂', 180),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b000-000000000011', 'היי אורי! בוא לפילאטיס מחר ונראה אם תשרוד 😄', 170),
  ('00000000-0000-4000-b000-000000000018', '00000000-0000-4000-b000-000000000005', 'את באה לג׳אם ביום שני? אני מבטיח לנגן בצ׳אטה', 90),
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-b000-000000000018', 'רק אם תבוא לשיעור שלי אחר כך 💃', 80),
  ('00000000-0000-4000-b000-000000000013', '00000000-0000-4000-b000-000000000002', 'איזה מסלול בכרמל את הכי אוהבת?', 45)
) as v(s, r, body, ago)
where not exists (select 1 from public.direct_messages m where m.sender_id = v.s::uuid and m.body = v.body);
