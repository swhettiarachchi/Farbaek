/**
 * Skill pinning (ADR 0043), the spec's Tool Definition Pinning. A project's
 * own skills go into the agent's instructions, so each applies only in the
 * version a person approved: the pin holds that file's revision and SHA-256.
 * A new or changed skill file is held back until someone reviews it.
 */
import { isProjectSkillPath } from "./skills";

export interface SkillPin {
  revision: number;
  sha256: string;
}

export type SkillPinStatus = "approved" | "changed" | "new";

export const SKILL_PIN_LABELS: Record<SkillPinStatus, string> = {
  approved: "Approved",
  changed: "Changed since it was approved",
  new: "New, not approved yet",
};

/** Approved only when the file is byte for byte the version that was pinned. */
export function skillPinStatus(file: { sha256: string }, pin: SkillPin | undefined): SkillPinStatus {
  if (!pin) return "new";
  return pin.sha256 === file.sha256 ? "approved" : "changed";
}

/**
 * Splits a project's files for a run: everything that isn't a skill, plus
 * the skills in their approved version, are used; other skill files are held.
 */
export function splitByPins<F extends { path: string; sha256: string }>(files: readonly F[], pins: ReadonlyMap<string, SkillPin>): { use: F[]; held: { path: string; status: Exclude<SkillPinStatus, "approved"> }[] } {
  const use: F[] = [];
  const held: { path: string; status: Exclude<SkillPinStatus, "approved"> }[] = [];
  for (const f of files) {
    if (!isProjectSkillPath(f.path)) {
      use.push(f);
      continue;
    }
    const status = skillPinStatus(f, pins.get(f.path));
    if (status === "approved") use.push(f);
    else held.push({ path: f.path, status });
  }
  return { use, held };
}

/** "house-style (changed since it was approved)", for a run's notes. */
export function heldSkillsNote(held: readonly { path: string; status: Exclude<SkillPinStatus, "approved"> }[]): string | null {
  if (held.length === 0) return null;
  const names = held.map((h) => `${h.path.split("/")[2] ?? h.path} (${h.status === "changed" ? "changed since it was approved" : "new, not approved yet"})`);
  return `Left out until someone reviews ${held.length === 1 ? "it" : "them"} on the project page: ${names.join(", ")}.`;
}
