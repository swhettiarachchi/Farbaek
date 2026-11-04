import { describe, expect, it } from "vitest";
import { adminEmails, checkAdmin, isAdminEmail } from "./access";

const env = { FARBAEK_ADMIN_EMAILS: " Hello@Farbaek.com , ops@farbaek.com,not-an-email" };
const confirmed = async () => ({ email: "hello@farbaek.com", confirmedAt: "2026-10-18T10:00:00Z" });

describe("the admin allowlist", () => {
  it("is empty when unset or blank, so nobody is an admin", () => {
    expect(adminEmails({}).size).toBe(0);
    expect(adminEmails({ FARBAEK_ADMIN_EMAILS: " , " }).size).toBe(0);
    expect(isAdminEmail("hello@farbaek.com", {})).toBe(false);
  });

  it("trims, lowercases and drops entries that aren't emails", () => {
    expect([...adminEmails(env)]).toEqual(["hello@farbaek.com", "ops@farbaek.com"]);
    expect(isAdminEmail("HELLO@farbaek.com", env)).toBe(true);
    expect(isAdminEmail("support@farbaek.com", env)).toBe(false);
    expect(isAdminEmail(null, env)).toBe(false);
  });
});

describe("checkAdmin", () => {
  it("lets in a listed, confirmed person with a session", async () => {
    const r = await checkAdmin({ claims: { sub: "u1", email: "hello@farbaek.com", aal: "aal2" }, lookup: confirmed, env });
    expect(r).toEqual({ ok: true, user: { id: "u1", email: "hello@farbaek.com" } });
  });

  it("refuses a listed, confirmed admin whose session hasn't passed a second factor", async () => {
    expect(await checkAdmin({ claims: { sub: "u1", email: "hello@farbaek.com" }, lookup: confirmed, env })).toEqual({ ok: false, reason: "needs_second_factor" });
    expect(await checkAdmin({ claims: { sub: "u1", email: "hello@farbaek.com", aal: "aal1" }, lookup: confirmed, env })).toEqual({ ok: false, reason: "needs_second_factor" });
  });

  it("refuses without a session", async () => {
    expect(await checkAdmin({ claims: null, lookup: confirmed, env })).toEqual({ ok: false, reason: "no_session" });
    expect(await checkAdmin({ claims: { email: "hello@farbaek.com" }, lookup: confirmed, env })).toEqual({ ok: false, reason: "no_session" });
  });

  it("refuses an email that isn't listed, and everyone when the list is empty", async () => {
    expect(await checkAdmin({ claims: { sub: "u2", email: "someone@gmail.com" }, lookup: confirmed, env })).toEqual({ ok: false, reason: "not_listed" });
    expect(await checkAdmin({ claims: { sub: "u1", email: "hello@farbaek.com" }, lookup: confirmed, env: {} })).toEqual({ ok: false, reason: "not_listed" });
  });

  it("refuses when the server key isn't set", async () => {
    expect(await checkAdmin({ claims: { sub: "u1", email: "hello@farbaek.com" }, lookup: null, env })).toEqual({ ok: false, reason: "no_server_key" });
  });

  it("refuses an unconfirmed email, a changed email, a missing user or a failed lookup", async () => {
    const claims = { sub: "u1", email: "hello@farbaek.com" };
    const cases = [
      async () => ({ email: "hello@farbaek.com", confirmedAt: null }),
      async () => ({ email: "someone@gmail.com", confirmedAt: "2026-10-18T10:00:00Z" }),
      async () => null,
      async () => {
        throw new Error("network");
      },
    ];
    for (const lookup of cases) expect(await checkAdmin({ claims, lookup, env })).toEqual({ ok: false, reason: "not_confirmed" });
  });
});
