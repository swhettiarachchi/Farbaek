import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import MANIFEST from "@/content/media-library.json";
import { COLOURWAYS, KIT_URL, LIBRARY_FILES, MEDIA_BASE, MEDIA_LIBRARY, isLibraryUrl, libraryForPrompt, mediaUrl } from "./library";
import { PHOTO_SUBJECTS, isPhotoUrl, photoUrl, photosForPrompt } from "./photos";

const PUBLIC = join(process.cwd(), "public");
const BUDGET: Record<string, number> = { "loop.mp4": 1_650_000, "still-16x9.webp": 240_000, "still-4x5.webp": 240_000 };

describe("the Farbaek media library", () => {
  it("is served from Farbaek under a versioned path", () => {
    expect(KIT_URL).toBe("https://www.farbaek.com/kit/scenes/v1/scenes.js");
    expect(MEDIA_BASE).toBe("https://www.farbaek.com/media/v1");
    expect(existsSync(join(PUBLIC, "kit/scenes/v1/scenes.js"))).toBe(true);
  });

  it("has every file it lists, recorded and within its budget", () => {
    const manifest = MANIFEST as Record<string, Record<string, { bytes: number; sha: string }>>;
    expect(Object.keys(manifest).sort()).toEqual(MEDIA_LIBRARY.map((i) => i.id).sort());
    for (const item of MEDIA_LIBRARY) {
      for (const file of LIBRARY_FILES) {
        const path = join(PUBLIC, "media/v1", item.id, file);
        expect(existsSync(path), path).toBe(true);
        expect(statSync(path).size, path).toBeLessThanOrEqual(BUDGET[file]!);
        expect(manifest[item.id]?.[file]?.bytes, `${item.id}/${file}`).toBe(statSync(path).size);
      }
    }
  });

  it("matches the recorder's colourways", () => {
    const script = readFileSync(join(process.cwd(), "scripts/media/record.mjs"), "utf8");
    for (const [name, c] of Object.entries(COLOURWAYS)) {
      expect(script, name).toContain(`${name}: { tone: "${c.tone}", base: "${c.base}", palette: "${c.colors.join(",")}" }`);
    }
  });

  it("knows its own addresses", () => {
    expect(isLibraryUrl(mediaUrl("aurora-signal", "loop.mp4"))).toBe(true);
    expect(isLibraryUrl(`${MEDIA_BASE}/aurora-signal/other.mp4`)).toBe(false);
    expect(isLibraryUrl(`${MEDIA_BASE}/nope-signal/loop.mp4`)).toBe(false);
    expect(isLibraryUrl("https://evil.test/media/v1/aurora-signal/loop.mp4")).toBe(false);
    expect(libraryForPrompt().split("\n")).toHaveLength(MEDIA_LIBRARY.length + 1);
  });
});

describe("real stand-in photos", () => {
  it("are sorted by subject with valid, unique ids, and the businesses come first", () => {
    const all: (string | number)[] = [];
    for (const [subject, s] of Object.entries(PHOTO_SUBJECTS)) {
      expect(s.ids.length, subject).toBeGreaterThanOrEqual(5);
      expect(new Set<string | number>(s.ids).size, subject).toBe(s.ids.length);
      for (const id of s.ids) {
        if (typeof id === "number") expect(Number.isInteger(id) && id >= 0, `${subject} ${id}`).toBe(true);
        else expect(id, subject).toMatch(/^\d{10,13}-[0-9a-f]{12}$/);
        all.push(id);
        expect(isPhotoUrl(photoUrl(id, 1200, 800)), `${subject} ${id}`).toBe(true);
      }
    }
    // A Picsum number can sit in two place subjects; an Unsplash photo belongs to one business subject.
    const unsplash = all.filter((id) => typeof id === "string");
    expect(new Set(unsplash).size).toBe(unsplash.length);
    expect(Object.keys(PHOTO_SUBJECTS).slice(0, 3)).toEqual(["bakery", "cafe", "restaurant"]);
    expect(photosForPrompt().split("\n")).toHaveLength(Object.keys(PHOTO_SUBJECTS).length + 1);
  });

  it("have stable addresses", () => {
    expect(photoUrl(42, 1600, 900)).toBe("https://picsum.photos/id/42/1600/900");
    expect(photoUrl("1509440159596-0249088772ff", 1600, 900)).toBe("https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1600&h=900&q=80");
    expect(isPhotoUrl(photoUrl(42, 1600, 900))).toBe(true);
    expect(isPhotoUrl("https://picsum.photos/seed/x/800/600")).toBe(false);
    expect(isPhotoUrl("https://evil.test/id/42/1600/900")).toBe(false);
    expect(isPhotoUrl("https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1600&h=900&q=80&x=<script>")).toBe(false);
    expect(isPhotoUrl("https://plus.unsplash.com/premium_photo-1509440159596-0249088772ff")).toBe(false);
  });
});
