export type Gender = "female" | "male" | "other";
export type AudienceGender = "all" | "female" | "male";
export type ParticipantStatus = "pending" | "approved" | "declined";
export type MessageKind = "text" | "voice" | "image" | "story_reply" | "system" | "date_invite";
export type Recurrence = "none" | "daily" | "weekly" | "biweekly" | "monthly";

export type Profile = {
  id: string;
  name: string;
  avatar_url: string | null;
  photos?: string[];
  bio?: string;
  gender?: Gender | null;
  birth_year?: number | null;
  city?: string | null;
  hobbies?: string[];
  traits?: string[];
  dating_enabled?: boolean;
  /** Private profile: strangers see only name, main photo and age. */
  is_private?: boolean;
  /** From profile_cards: may I see the whole profile (false → the private fields come back empty). */
  full_access?: boolean;
  onboarded?: boolean;
  banned_at?: string | null;
  created_at?: string;
};

export type ProfileSettings = {
  birth_date: string | null;
  show_online: boolean;
  pref_min_age: number;
  pref_max_age: number;
  pref_gender: AudienceGender;
  pref_distance_km: number;
  /** When romantic preferences were first set (null → ask before opening the heart). */
  dating_prefs_at: string | null;
  notify_messages: boolean;
  notify_events: boolean;
  notify_social: boolean;
  is_admin: boolean;
  is_moderator: boolean;
};

export type EventRow = {
  id: string;
  organizer_id?: string;
  community_id?: string | null;
  title: string;
  description?: string;
  category: string;
  subcategory: string | null;
  image_url: string | null;
  video_url?: string | null;
  starts_at: string;
  ends_at: string | null;
  is_online?: boolean;
  location_name?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  seats?: number;
  auto_approve?: boolean;
  recurrence?: Recurrence;
  recurrence_parent_id?: string | null;
  min_age?: number | null;
  max_age?: number | null;
  gender_target?: AudienceGender;
  price?: number;
  max_distance_km?: number | null;
  created_at?: string;
};

export type Participant = {
  event_id: string;
  profile_id: string;
  status: ParticipantStatus;
  created_at?: string;
};

export type Community = {
  id: string;
  founder_id: string;
  name: string;
  description: string;
  hobby: string;
  city: string | null;
  image_url: string | null;
  audience_gender: AudienceGender;
  min_age: number;
  max_age: number;
  auto_approve: boolean;
  created_at: string;
};

export type Story = {
  id: string;
  author_id: string;
  event_id: string | null;
  media_url: string | null;
  media_type: "image" | "video";
  caption: string;
  is_romantic?: boolean;
  created_at: string;
  expires_at: string;
};

export type DirectMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  kind: MessageKind;
  body: string;
  media_url: string | null;
  story_id: string | null;
  date_invite_id?: string | null;
  read_at: string | null;
  created_at: string;
};

export type GroupMessage = {
  id: string;
  sender_id: string;
  kind: MessageKind;
  body: string;
  media_url: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type Report = {
  id: string;
  reporter_id: string;
  target_type: "profile" | "event" | "community" | "story" | "message" | "post";
  target_id: string;
  reason: string;
  details: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
};

export type DateInvite = {
  id: string;
  sender_id: string;
  recipient_id: string;
  title: string;
  location: string | null;
  starts_at: string;
  note: string;
  status: "pending" | "approved" | "declined";
  created_at: string;
};
