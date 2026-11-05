/**
 * Autonomy level 3 (ADR 0086): earned from a clean record and bounded by a
 * daily budget. The database enforces the same numbers (migration v54);
 * these are what people read.
 */

export const LEVEL_3 = {
  /** Changes applied on their own that passed their checks, within `days`. */
  minVerified: 10,
  days: 30,
  maxFiles: 10,
  dailyLimits: [5, 10, 20, 50] as const,
} as const;

export interface AutonomyRecord {
  verified: number;
  failed: number;
}

export type LevelThreeStatus = { earned: true } | { earned: false; reason: string };

/** Whether the workspace's record lets it turn level 3 on, and if not, why, in words. */
export function levelThreeStatus(record: AutonomyRecord | null): LevelThreeStatus {
  if (!record) return { earned: false, reason: "The record of changes applied on their own couldn't be read just now." };
  if (record.failed > 0) {
    return {
      earned: false,
      reason: `A change applied on its own ${record.failed === 1 ? "failed or only partly passed its checks" : `failed or only partly passed its checks ${record.failed} times`} in the last ${LEVEL_3.days} days. Bigger changes unlock again once a full ${LEVEL_3.days} days pass without one.`,
    };
  }
  if (record.verified < LEVEL_3.minVerified) {
    return {
      earned: false,
      reason: `Unlocks after ${LEVEL_3.minVerified} changes applied on their own passed their checks in the last ${LEVEL_3.days} days, with none failing. So far: ${record.verified}.`,
    };
  }
  return { earned: true };
}
