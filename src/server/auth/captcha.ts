/**
 * Turnstile's site key, once the owner has switched the sign-in check on
 * (ADR 0067). It's public by design: the browser needs it to show the check.
 * The secret lives only in Supabase Auth's settings, which verify each token.
 */
export function turnstileSiteKey(): string | null {
  const key = process.env.TURNSTILE_SITE_KEY?.trim();
  return key && /^[0-9A-Za-z_-]{10,100}$/.test(key) ? key : null;
}
