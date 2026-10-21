/**
 * Office Space policy (ADR 0032). Migration v20 repeats these numbers in
 * SQL, where they're enforced; tests/db/office-permissions.test.ts keeps the
 * two equal.
 */
export const OFFICE_POLICY = {
  /** A staff session ends after this long without a request. */
  idleMinutes: 30,
  /** And this long after the email code, whatever happens. */
  maxSessionHours: 12,
  /** An invite to the office lasts at most this long. */
  inviteMaxDays: 7,
  /** A reason for a consequential action, in characters. */
  reasonMin: 10,
  reasonMax: 500,
  /** The idle warning shows this long before the session ends. */
  idleWarningSeconds: 60,
} as const;

/** Sign-in limits: email codes per address and per network, and wrong codes per address. */
export const OFFICE_SIGN_IN_LIMITS = {
  codesPerEmail: { windowSeconds: 15 * 60, limit: 3 },
  codesPerIp: { windowSeconds: 60 * 60, limit: 20 },
  wrongCodesPerEmail: { windowSeconds: 15 * 60, limit: 5 },
} as const;
