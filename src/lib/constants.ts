export const UNLIMITED_SEATS = 9999;
export const MAX_PROFILE_PHOTOS = 6;
export const APP_NAME = "mibale";
export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) ?? "https://mibale.app";

/** Columns other members may read (sensitive columns are not granted). */
export const PROFILE_COLUMNS =
  "id, name, avatar_url, photos, bio, gender, birth_year, city, hobbies, traits, dating_enabled, onboarded, banned_at, created_at";
/** Columns guests (anon) may read. */
export const PROFILE_GUEST_COLUMNS = "id, name, avatar_url";
export const PROFILE_MINI = "id, name, avatar_url";

/** Event columns for members (meeting_url is only reachable through event_meeting_url()). */
export const EVENT_COLUMNS =
  "id, organizer_id, community_id, title, description, category, subcategory, image_url, starts_at, ends_at, is_online, location_name, city, lat, lng, seats, auto_approve, recurrence, recurrence_parent_id, min_age, max_age, gender_target, price, max_distance_km, created_at";
/** Event columns for guests: name, image, date and time only. */
export const EVENT_GUEST_COLUMNS = "id, community_id, title, image_url, starts_at, ends_at, category, subcategory, price";
