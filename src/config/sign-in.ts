/**
 * Limits on asking for a sign-in link (ADR 0067). Keys are hashes of the email
 * address and the network address, and the database deletes every window
 * within a day of it starting (migration v39).
 */
export const SIGN_IN_LIMITS = {
  linksPerEmail: { windowSeconds: 15 * 60, limit: 3 },
  linksPerAddress: { windowSeconds: 60 * 60, limit: 20 },
  // Signing in with a password (ADR 0151): a few tries per account, then a wait.
  passwordsPerEmail: { windowSeconds: 15 * 60, limit: 5 },
  passwordsPerAddress: { windowSeconds: 60 * 60, limit: 20 },
} as const;
