import { APP_NAME } from "./constants";

type SeoInput = { title: string; description: string; type?: string; image?: string | null };

/** Unique head() content for a route: title, description, OG and Twitter tags. */
export function seo({ title, description, type = "website", image }: SeoInput) {
  const full = title.includes(APP_NAME) ? title : `${title} · ${APP_NAME}`;
  const meta: Array<Record<string, string>> = [
    { title: full },
    { name: "description", content: description },
    { property: "og:title", content: full },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:site_name", content: APP_NAME },
    { property: "og:locale", content: "he_IL" },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: full },
    { name: "twitter:description", content: description },
  ];
  if (image) {
    meta.push({ property: "og:image", content: image }, { name: "twitter:image", content: image });
  }
  return { meta };
}
