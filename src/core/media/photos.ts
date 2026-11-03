/**
 * Real photographs the agent and Studio can use as stand-ins (ADR 0156),
 * sorted by subject so a café gets a café and an architect gets buildings,
 * not a random landscape. They're Unsplash photos served by Lorem Picsum by
 * a fixed id (free to use under the Unsplash License, no attribution
 * needed); each was looked at and sorted by hand. They stay marked as
 * placeholders until the person puts their own photo in.
 */

export const PHOTO_SUBJECTS = {
  workspace: { words: "laptops, desks and notebooks", ids: [0, 1, 2, 3, 5, 20, 60, 201] },
  "food-and-drink": { words: "coffee, cafés, fruit and grapes", ids: [30, 42, 63, 75, 192, 395, 513, 517] },
  people: { words: "portraits and people outdoors", ids: [22, 64, 65, 91, 129, 389, 390] },
  city: { words: "skylines, streets and traffic", ids: [43, 61, 84, 214, 259, 274, 382, 391, 522] },
  "architecture-and-interiors": { words: "doors, facades, old towns and halls", ids: [78, 142, 164, 188, 193, 195, 208, 288, 514] },
  nature: { words: "mountains, forests, waterfalls and fields", ids: [11, 15, 62, 66, 287, 381, 509, 510, 518] },
  "sea-and-coast": { words: "beaches, piers, boats and calm water", ids: [10, 13, 74, 124, 199, 218, 385, 521] },
  "travel-and-roads": { words: "railways, roads and open country", ids: [69, 85, 204, 254, 278, 387, 519] },
  "fashion-and-detail": { words: "shoes, books, blossom, tools and objects", ids: [21, 24, 25, 35, 45, 252, 284] },
  "music-and-night": { words: "concert light, city nights and neon", ids: [96, 158, 195, 274, 84] },
  "calm-and-texture": { words: "water drops, sky, fog and wood", ids: [41, 53, 123, 143, 194, 279] },
} as const satisfies Record<string, { words: string; ids: readonly number[] }>;

export type PhotoSubject = keyof typeof PHOTO_SUBJECTS;

/** A photo at the size a layout needs (the service crops it to fill). */
export function photoUrl(id: number, width: number, height: number): string {
  return `https://picsum.photos/id/${id}/${Math.round(width)}/${Math.round(height)}`;
}

/** Whether an address is one of these photos. */
export function isPhotoUrl(url: string): boolean {
  return /^https:\/\/picsum\.photos\/id\/\d{1,4}\/\d{2,4}\/\d{2,4}(?:\.(?:jpg|webp))?$/.test(url);
}

/** The photos as the agent reads them. */
export function photosForPrompt(): string {
  return (Object.entries(PHOTO_SUBJECTS) as [PhotoSubject, (typeof PHOTO_SUBJECTS)[PhotoSubject]][])
    .map(([subject, s]) => `- ${subject} (${s.words}): ${s.ids.join(", ")}`)
    .join("\n");
}
