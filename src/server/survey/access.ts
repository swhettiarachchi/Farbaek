import "server-only";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import type { AppContext } from "@/server/workspace/context";

/** Why this person can't change survey projects here, in words, or null when they can. */
export function surveyReadOnlyReason(ctx: AppContext, sample = false): string | null {
  if (sample) return "This is the Sample project: explore it, but nothing here is saved.";
  if (ctx.mode === "demo") return "The demo workspace is read-only, so nothing here is saved.";
  if (!ctx.writes.enabled) return ctx.writes.reason;
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return "Viewers can look at survey projects but not change them.";
  return null;
}
