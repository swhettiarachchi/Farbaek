/**
 * Who is on the admin console's list (FARBAEK_ADMIN_EMAILS: comma separated,
 * case-insensitive; unset or empty means nobody). On its own, without the
 * console's server imports, so src/proxy.ts can turn everyone else away
 * before any of the console's code is sent (stage 171).
 */
type Env = Record<string, string | undefined>;

export function adminEmails(env: Env = process.env): Set<string> {
  return new Set(
    (env.FARBAEK_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  );
}

export function isAdminEmail(email: string | null | undefined, env: Env = process.env): boolean {
  return Boolean(email) && adminEmails(env).has(email!.trim().toLowerCase());
}
