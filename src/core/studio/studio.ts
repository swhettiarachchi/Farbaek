/**
 * The image and video studios' shared rules (stage 201, ADR 0216): framework-free, used by the server and the browser. Shapes are
 * sized to what the image model accepts (edges divisible by 16, 1:3 to 3:1); detail levels map to the model's quality; styles add
 * a photographer's or designer's brief to the person's own words so results read as made in a studio, not by a generator.
 */
import { z } from "zod";

/** Picture shapes, each a size the image model takes as it is. */
export const IMAGE_SHAPES = [
  { id: "1:1", label: "Square", width: 1024, height: 1024 },
  { id: "4:5", label: "Portrait", width: 1024, height: 1280 },
  { id: "2:3", label: "Tall", width: 1024, height: 1536 },
  { id: "9:16", label: "Story", width: 1008, height: 1792 },
  { id: "3:2", label: "Landscape", width: 1536, height: 1024 },
  { id: "16:9", label: "Wide", width: 1792, height: 1008 },
  { id: "21:9", label: "Cinema", width: 2016, height: 864 },
] as const;
export type ImageShape = (typeof IMAGE_SHAPES)[number]["id"];

/** Detail: how hard the model works on a picture, and what it costs. */
export const IMAGE_DETAIL = [
  { id: "draft", label: "Draft", about: "Fast, for trying ideas", quality: "low" },
  { id: "standard", label: "Standard", about: "Good for most pictures", quality: "medium" },
  { id: "high", label: "High", about: "Fine detail and texture", quality: "high" },
  { id: "ultra", label: "Ultra", about: "The most detail, for finals", quality: "xhigh" },
] as const;
export type ImageDetail = (typeof IMAGE_DETAIL)[number]["id"];

export const IMAGE_FORMATS = ["webp", "png", "jpeg"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/**
 * Styles: a brief added after the person's words. The person's words lead; the brief only sets the craft (light, lens, materials,
 * finish) and asks for what generators get wrong to be right.
 */
export const IMAGE_STYLES = [
  { id: "none", label: "Your words only", brief: "" },
  {
    id: "photo",
    label: "Photograph",
    brief:
      "A real photograph, not an illustration. Natural light with soft, believable shadows; true-to-life colour and materials; fine natural texture (skin pores, fabric weave, wood grain) where it shows; correct anatomy and proportions; a full-frame camera with a 50mm lens at f/2.8 and gentle depth of field; balanced composition with room to breathe.",
  },
  {
    id: "product",
    label: "Product shot",
    brief:
      "A commercial studio product photograph. Large softbox key light with a subtle rim light, clean seamless backdrop, accurate reflections and contact shadow, crisp edges and true material finish (glass, metal, fabric, paper), centred hero composition, colour-accurate, retouched to catalogue standard.",
  },
  {
    id: "portrait",
    label: "Portrait",
    brief:
      "An editorial portrait photograph. Soft window light or a large diffused key, natural skin with real texture and no plastic smoothing, natural expression, catchlights in the eyes, an 85mm lens at f/2 with a gently blurred background, true skin tones.",
  },
  {
    id: "interior",
    label: "Architecture",
    brief:
      "Architectural and interior photography. Straight verticals, a wide 24mm tilt-shift look, balanced daylight with warm practical lamps, real materials (stone, timber, linen, plaster) with honest texture, uncluttered styling, magazine finish.",
  },
  {
    id: "food",
    label: "Food",
    brief:
      "Editorial food photography. Soft side light, appetising true colour, real textures (crumb, gloss, steam, char), natural props on a linen or stone surface, a 100mm macro look with shallow depth of field.",
  },
  {
    id: "illustration",
    label: "Illustration",
    brief:
      "A finished editorial illustration by a skilled illustrator: a clear idea, confident shapes, a limited harmonious palette, considered texture, balanced negative space. Clean and intentional, without generic gradients.",
  },
  {
    id: "render",
    label: "3D render",
    brief:
      "A high-end 3D render: physically based materials, soft global illumination, studio area lights, accurate reflections and ambient occlusion, subtle depth of field, crisp detail, product-launch quality.",
  },
  {
    id: "film",
    label: "Film still",
    brief:
      "A still from a feature film: cinematic composition, motivated light with deep but readable shadows, an anamorphic look with gentle lens character, natural colour grade, fine film grain, real locations and wardrobe.",
  },
] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number]["id"];

/** Asked of every picture: what generators most often get wrong. */
const CRAFT = "Make it look professionally made: coherent light and perspective, correct hands, faces and text, no warped details, no watermark or signature.";

/** The words sent to the model: the person's prompt, then the style's brief and the craft line. */
export function imagePrompt(prompt: string, style: ImageStyle): string {
  const brief = IMAGE_STYLES.find((s) => s.id === style)?.brief ?? "";
  return [prompt.trim(), brief, CRAFT].filter(Boolean).join("\n\n");
}

export function shapeOf(id: ImageShape) {
  return IMAGE_SHAPES.find((s) => s.id === id) ?? IMAGE_SHAPES[0];
}

/** Output image tokens per million pixels at each detail level, from OpenAI's price calculator (2026-11-17), with room to spare. */
const TOKENS_PER_MEGAPIXEL: Record<ImageDetail, number> = { draft: 1_000, standard: 1_700, high: 2_100, ultra: 3_600 };

/** Output tokens to reserve for one picture. Settled to the real count the API reports. */
export function imageOutputTokens(shape: ImageShape, detail: ImageDetail): number {
  const s = shapeOf(shape);
  return Math.ceil((s.width * s.height * TOKENS_PER_MEGAPIXEL[detail]) / 1_000_000);
}

export const studioImageRequest = z.object({
  prompt: z.string().trim().min(3, "Describe the picture in a few words.").max(3_000, "Keep the description under 3,000 characters."),
  shape: z.enum(IMAGE_SHAPES.map((s) => s.id) as [ImageShape, ...ImageShape[]]),
  detail: z.enum(IMAGE_DETAIL.map((d) => d.id) as [ImageDetail, ...ImageDetail[]]),
  style: z.enum(IMAGE_STYLES.map((s) => s.id) as [ImageStyle, ...ImageStyle[]]),
  format: z.enum(IMAGE_FORMATS),
  transparent: z.boolean(),
  count: z.number().int().min(1).max(4),
  /** Pictures from the person's own library to work from: an edit, or references for subject and style. */
  references: z.array(z.string().uuid()).max(4),
});
export type StudioImageRequest = z.infer<typeof studioImageRequest>;

/* Video. */

export const VIDEO_SHAPES = [
  { id: "16:9", label: "Wide" },
  { id: "9:16", label: "Vertical" },
] as const;
export type VideoShape = (typeof VIDEO_SHAPES)[number]["id"];

export const VIDEO_LENGTHS = [4, 6, 8, 10] as const;

/** Resolution, with the model's video tokens per second (Google's pricing page, 2026-11-17). */
export const VIDEO_RESOLUTIONS = [
  { id: "360p", label: "Draft", about: "Fast and light, for trying ideas", tokensPerSecond: 1_931 },
  { id: "720p", label: "Standard", about: "Sharp on phones and laptops", tokensPerSecond: 5_792 },
  { id: "1080p", label: "High", about: "Upscaled for big screens", tokensPerSecond: 8_688 },
] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number]["id"];

export const VIDEO_STYLES = [
  { id: "none", label: "Your words only", brief: "" },
  {
    id: "cinematic",
    label: "Cinematic",
    brief: "Shot like a feature film: motivated light, a slow purposeful camera move, shallow depth of field, natural colour grade, fine grain, real locations and believable motion.",
  },
  {
    id: "documentary",
    label: "Documentary",
    brief: "Handheld documentary footage: natural light, real people and places, gentle camera sway, honest colour, ambient sound.",
  },
  {
    id: "product",
    label: "Product film",
    brief: "A premium product film: a seamless studio set, soft key and rim light, a smooth orbiting or push-in camera, crisp reflections and true materials, calm ambient music.",
  },
  {
    id: "animation",
    label: "Animation",
    brief: "A polished animated short: appealing characters, clear shapes, smooth expressive motion, a warm limited palette, soft light.",
  },
  {
    id: "dither",
    label: "Dithered",
    brief: "A stylised dithered look: one or two ink colours on paper white, ordered-dither halftone shading, crisp pixel edges, smooth slow motion, like a living print.",
  },
  {
    id: "conversation",
    label: "Conversation",
    brief: "Two people in a natural conversation, framed over the shoulder and in close-ups, soft practical light, believable lip movement and expressions, clear dialogue with room tone.",
  },
] as const;
export type VideoStyle = (typeof VIDEO_STYLES)[number]["id"];

export function videoPrompt(prompt: string, style: VideoStyle): string {
  const brief = VIDEO_STYLES.find((s) => s.id === style)?.brief ?? "";
  return [prompt.trim(), brief].filter(Boolean).join("\n\n");
}

export function videoTokens(seconds: number, resolution: VideoResolution): number {
  return seconds * (VIDEO_RESOLUTIONS.find((r) => r.id === resolution)?.tokensPerSecond ?? 8_688);
}

export const studioVideoRequest = z.object({
  prompt: z.string().trim().min(3, "Describe the video in a few words.").max(2_000, "Keep the description under 2,000 characters."),
  shape: z.enum(VIDEO_SHAPES.map((s) => s.id) as [VideoShape, ...VideoShape[]]),
  seconds: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]),
  resolution: z.enum(VIDEO_RESOLUTIONS.map((r) => r.id) as [VideoResolution, ...VideoResolution[]]),
  style: z.enum(VIDEO_STYLES.map((s) => s.id) as [VideoStyle, ...VideoStyle[]]),
  /** A picture from the person's library to start from (image to video). */
  still: z.string().uuid().nullable(),
});
export type StudioVideoRequest = z.infer<typeof studioVideoRequest>;

/** A studio item as the browser lists it: never the bytes, which load from their own address. */
export interface StudioItem {
  id: string;
  batchId: string;
  kind: "image" | "video" | "upload";
  status: "working" | "ready" | "failed";
  prompt: string;
  settings: Record<string, unknown>;
  mime: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sizeBytes: number;
  error: string | null;
  parentId: string | null;
  createdAt: string;
}

/** The events of one studio request's stream, in order. */
export type StudioEvent =
  | { type: "start"; batchId: string; count: number }
  /** A first look at picture `index` while it's still being made. */
  | { type: "partial"; index: number; data: string; mime: string }
  | { type: "item"; index: number; item: StudioItem }
  | { type: "failed"; index: number; error: string }
  /** Still working: seconds since it started (videos take a minute or two). */
  | { type: "progress"; seconds: number }
  | { type: "done"; made: number; error: string | null };
