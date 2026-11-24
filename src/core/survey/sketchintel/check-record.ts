/**
 * What's kept of an independent check of the plan against the sketch (stage 263, ADR 0271), with the sketch's record: its own module,
 * with nothing but its schema, so the plan document can hold it without importing the check itself.
 */
import { z } from "zod";

/** The most items one check asks about, and the most missing lines it keeps: far more than a sketch draws. */
export const CHECK_LIMITS = { items: 120, missing: 40, note: 200 } as const;

const text = (max: number) => z.string().max(max);

export const sketchCheckSchema = z.object({
  model: text(80),
  at: text(40),
  items: z
    .array(z.object({ key: text(80), points: z.array(text(32)).max(500), verdict: z.enum(["drawn", "not_drawn", "unsure"]), note: text(CHECK_LIMITS.note) }))
    .max(CHECK_LIMITS.items),
  missing: z.array(z.object({ file: text(200), points: z.array(text(32).pipe(z.string().min(1))).min(2).max(60), label: text(120) })).max(CHECK_LIMITS.missing),
});
export type SketchCheck = z.infer<typeof sketchCheckSchema>;
