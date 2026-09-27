// Fixed tag list (per user decision — not freeform). Single tag per image.
// "All" is a UI-only filter sentinel meaning "no tag filter" — it is never stored on an
// image row, only ASSIGNABLE_TAGS values are.
export const ALL_TAGS_FILTER = "All" as const;

export const ASSIGNABLE_TAGS = [
  "Ads & Product",
  "Brand & Logo",
  "Illustration & 3D",
  "Posters & Visuals",
  "Portraits",
  "Storyboard & Characters",
] as const;

export type AssignableTag = (typeof ASSIGNABLE_TAGS)[number];

// Full list for the gallery filter row, including the "All" sentinel up front.
export const TAG_FILTER_OPTIONS = [ALL_TAGS_FILTER, ...ASSIGNABLE_TAGS] as const;
