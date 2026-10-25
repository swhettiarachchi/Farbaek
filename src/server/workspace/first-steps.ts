/**
 * Hiding the first steps (ADR 0073): a person can put them away per
 * workspace. The choice lives in one cookie of workspace ids, so it holds on
 * this browser only, and the steps themselves still come from records.
 */
import { z } from "zod";

export const FIRST_STEPS_COOKIE = "fb_steps";
const MAX_HIDDEN = 20;

/** The workspaces whose first steps are hidden, from the cookie's value. */
export function hiddenWorkspaces(value: string | undefined): string[] {
  return (value ?? "")
    .split(".")
    .filter((id) => z.uuid().safeParse(id).success)
    .slice(0, MAX_HIDDEN);
}

/** The cookie's next value with one workspace hidden or shown again; the newest choices are kept. */
export function withHidden(value: string | undefined, orgId: string, hidden: boolean): string {
  const rest = hiddenWorkspaces(value).filter((id) => id !== orgId);
  return (hidden ? [orgId, ...rest] : rest).slice(0, MAX_HIDDEN).join(".");
}
