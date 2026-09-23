# mibale — מי בא?

אפליקציה חברתית בעברית (RTL, מובייל-first) לאירועים, קהילות, סטוריז, צ׳אט והיכרויות.
PWA לדפדפן + אפליקציות Android/iOS דרך Capacitor.

**Stack:** React 19 · TypeScript · Vite 7 · TanStack Start v1 (file-based routing, server functions) ·
Tailwind CSS v4 · shadcn/ui · lucide-react · sonner · TanStack Query · Supabase (DB, Auth, Storage, Realtime) · Capacitor 8.

---

## התחלה מהירה

```bash
npm install
cp .env.example .env.local        # למלא VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                       # http://localhost:3000
```

### מסד הנתונים (Supabase)

כל הסכימה נמצאת ב-`drizzle/migrations` (SQL טהור, לפי הסדר):

| קובץ | תוכן |
| --- | --- |
| `0001_foundation.sql` | סכימה פרטית `app_private`, enums, `user_roles` + `has_role()` |
| `0002_tables.sql` | כל הטבלאות: `CREATE TABLE → GRANT → ENABLE RLS` (כולל הרשאות ברמת עמודה) |
| `0003_functions.sql` | פונקציות SECURITY DEFINER ב-`app_private` + עטיפות SECURITY INVOKER ב-`public`, טריגרים |
| `0004_policies.sql` | כל מדיניות ה-RLS |
| `0005_realtime_storage.sql` | Realtime (`event_participants`, `notifications`, הודעות) + bucket `media` |
| `0006_enum_date_invite.sql` | סוג הודעה `date_invite` (מיגרציה נפרדת — ערך enum חדש לא נצרך באותה טרנזקציה) |
| `0007_pricing_audience_dating.sql` | מחיר ומרחק מקסימלי לאירוע, נראות לפי קהל יעד (מגדר/גיל/מרחק), סטוריז רומנטיים, `date_invites` |
| `0008_dating_mode.sql` | מצב היכרויות (לב פתוח/סגור) נאכף בשרת |
| `0009_guest_mode.sql` | מצב אורח: אורחים לא רואים פרופילים; מונים מצרפיים בלבד |
| `0010_account_deletion.sql` | `delete_my_account()` — מחיקת חשבון מתוך האפליקציה (דרישת החנויות) |

**הדרך הקלה — GitHub Actions:** להוסיף secret בשם `SUPABASE_DB_URL` (Supabase → Connect → Session pooler)
ולהריץ Actions → "Supabase database setup" (עם/בלי נתוני דמה). מיגרציות שכבר רצו מדולגות.

הרצה על פרויקט Supabase:

```bash
for f in drizzle/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
psql "$DATABASE_URL" -f drizzle/seed.sql      # נתוני דמה (אופציונלי)
```

או עם ה-CLI של Supabase: להעתיק את הקבצים ל-`supabase/migrations/` ולהריץ `supabase db push`.

**נתוני דמה:** 10 פרופילים מלאים (5 נשים, 5 גברים), 5 קהילות, 20 אירועים (כל אחד מארגן 2 ומשתתף באחרים),
סטוריז והודעות. סיסמה לכולם: `mibale1234`. `noa@mibale.dev` היא מנהלת מערכת.
שאר המשתמשים: `maya`, `shira`, `tamar`, `yael`, `daniel`, `omer`, `itay`, `yoni`, `ariel` (`@mibale.dev`).

### בדיקות

```bash
npm test                          # בדיקות יחידה (דירוג אירועים, טקסטים, קטלוגים)
npm run typecheck
PGUSER=postgres npm run db:test   # מריץ את כל המיגרציות + seed על Postgres מקומי ובודק RLS
```

---

## אבטחה — איך זה בנוי

- **GRANT מפורש לכל טבלה.** ברירות המחדל של Supabase (`GRANT ALL` ל-anon/authenticated) מבוטלות ב-0001,
  וכל טבלה מקבלת רק את ההרשאות שהיא צריכה.
- **הרשאות ברמת עמודה:** אורחים (`anon`) רואים מ-`profiles` רק `id, name, avatar_url`, ומ-`events` רק שם, תמונה ותאריך.
  משתמשים אחרים לעולם לא רואים `birth_date`, `pref_*`, `show_online`, `last_seen_at`, `notify_*` —
  הבעלים קורא אותם דרך `my_profile_settings()` בלבד. `meeting_url` נחשף רק דרך `event_meeting_url()` למשתתפים מאושרים.
- **תפקידים** ב-`user_roles` (enum `app_role`) עם `has_role()` — אף פעם לא על `profiles`.
- **SECURITY DEFINER** רק ב-`app_private` (לא נחשף ב-PostgREST); הלקוח קורא לעטיפות INVOKER ב-`public`.
- **התראות** נכתבות רק בצד השרת (`app_private.create_notification` מטריגרים/RPC); אין מדיניות INSERT ללקוח.
- **כרטיסי QR** בטבלה נפרדת `event_tickets` (נראית רק לבעלים) — כך הקוד לא דולף דרך Realtime של `event_participants`.
- **חסימות** דו-כיווניות: `blocks_with()`, `blocked_profile_ids()`, טריגר שמנתק עוקבים/לייקים/התאמות, ובלקוח
  `fetchBlockedIds()` + `withoutBlocked()`.
- **קהל יעד:** אירוע עם מגדר/גילאים/מרחק מקסימלי גלוי רק למי שמתאים (`event_visible()` ב-RLS); המארגן והמשתתפים תמיד רואים.
- **סטוריז רומנטיים** גלויים רק למי שמצב ההיכרויות שלו פתוח; **הזמנה לדייט** נשלחת מהצ׳אט ורק הנמען יכול לאשר.
- **השהיית משתמש:** `admin_set_banned()`; כל מדיניות כתיבה בודקת `can_write()`, ו-`<BannedGate>` חוסם את הממשק.

---

## Auth

- אימייל+סיסמה, Google ו-Sign in with Apple (Supabase → Authentication → Providers). Apple חובה ב-App Store כשיש התחברות חברתית אחרת.
- הכפתורים מוצגים רק לספקים שמופיעים ב-`VITE_AUTH_PROVIDERS` (למשל `google,apple`); ריק = אימייל בלבד.
- Redirect URLs: `https://<domain>/`, `https://<domain>/reset-password`, `https://<domain>/onboarding/profile`, `mibale://auth-callback`.
- באפליקציה (נייטיב) ההתחברות עם Google/Apple נפתחת בדפדפן המערכת (Google חוסמת WebView) וחוזרת דרך `mibale://auth-callback`.

## Push (FCM)

1. Firebase project → הורדת `google-services.json` ל-`android/app/` ו-`GoogleService-Info.plist` ל-`ios/App/App/`.
2. Service account → למלא `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` בשרת.
3. Supabase → Database Webhooks → INSERT על `public.notifications` → `POST https://<domain>/api/push`
   עם header `x-webhook-secret: $PUSH_WEBHOOK_SECRET`.
4. האפליקציה רושמת טוקן אחרי התחברות (`register_push_token`) ומנווטת ל-`data.link` בלחיצה.

## Capacitor (Android / iOS)

```bash
npm run build:native     # CAP_BUILD=1 → בנייה סטטית (SPA) ל-dist/client + cap sync
npm run cap:android      # פתיחה ב-Android Studio
npm run cap:ios          # פתיחה ב-Xcode (דורש macOS + CocoaPods)
```

- תוספים: push-notifications, geolocation (מיון "קרוב אליך"), share, haptics (לייק ואישור הצטרפות), app (deep links).
- Deep links: `https://mibale.app/e/{id}` ו-`mibale://e/{id}` (מוגדרים ב-`AndroidManifest.xml` וב-`Info.plist`).
  ל-App Links מאומתים יש לפרסם `/.well-known/assetlinks.json` ו-`apple-app-site-association` בדומיין.
- בנייה רגילה (`npm run build`) נשארת SSR כדי ש-`/e/{id}` יחזיר תגיות OG דינמיות.
- אייקונים ומסכי פתיחה: מקור ב-`assets/`, יצירה מחדש עם `npx @capacitor/assets generate`.

## הדגמה ופרסום לחנויות

- **הדגמה בלי שרת:** `npm run build:demo` → `dist-demo/` (נתוני דוגמה מוקלטים ב-`demo/public/demo-fixtures.json`,
  הקלטה מחדש: `scripts/record-demo.mjs`). ה-workflow "Android demo APK" בונה APK הדגמה לכל push.
- **Google Play:** workflow "Android release (Google Play)" בונה AAB + APK חתומים מול Supabase האמיתי
  (ה-secrets הנדרשים מפורטים בראש הקובץ). `versionCode` = מספר ההרצה.
- **דרישות חנות שמכוסות באפליקציה:** מחיקת חשבון (הגדרות + `/delete-account`), `/privacy`, `/terms`,
  דיווח וחסימה, Sign in with Apple, 18+.

---

## מבנה

```
src/
  routes/            כל מסך = קובץ route (TanStack Start), כולל /api/push
  components/        רכיבי UI משותפים (ui/ = shadcn)
  hooks/             use-auth, use-event-feed
  lib/
    event-ranking.ts     אלגוריתם הדירוג והקרוסלות
    event-title.ts       whoComesTitle() — "מי בא ל…"
    message-text.ts      ניסוח הודעות מערכת/סטורי
    hobby-categories.ts  9 קטגוריות + תתי-קטגוריות עם אימוג'י וצבע לכל קטגוריה
    traits.ts            39 מאפייני אישיות
    blocks.ts            fetchBlockedIds / withoutBlocked
    hidden-events.ts     "הסר" — mibale-hidden-events:{profileId}
    server/              server functions (OG, FCM)
  styles.css         מערכת העיצוב — טוקנים ב-oklch בלבד, מצב לילה
drizzle/
  migrations/        SQL
  seed.sql           נתוני דמה
  tests/             בדיקות RLS
```
