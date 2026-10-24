import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Supabase Auth's sign-in emails (public/auth-email/, set in
 * deploy/vps/supabase/compose.farbaek.yaml). Office Space signs in with a
 * 6-digit code, so its emails must carry the code and no link that signs
 * anyone in; customers sign in with the link.
 */
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const officeHost = read("deploy/vps/production.env.example").match(/^OFFICE_HOST=(.+)$/m)?.[1]?.trim();
const OFFICE_REDIRECT = `https://${officeHost}/sign-in`;

describe.each(["magic-link", "confirmation"])("the %s email", (name) => {
  const html = read(`public/auth-email/${name}.html`);
  const [office, customer] = html.split("{{ else }}");

  it("branches once, on the Office Space redirect", () => {
    expect(officeHost).toBeTruthy();
    expect(html.match(/\{\{ if /g)).toHaveLength(1);
    expect(html.match(/\{\{ else \}\}/g)).toHaveLength(1);
    expect(html.match(/\{\{ end \}\}/g)).toHaveLength(1);
    expect(office).toContain(`{{ if eq .RedirectTo "${OFFICE_REDIRECT}" }}`);
  });

  it("gives Office Space the code and no link", () => {
    expect(office).toContain("{{ .Token }}");
    expect(office).not.toContain("ConfirmationURL");
    expect(office).not.toContain("href=");
  });

  it("gives customers the link and no code", () => {
    expect(customer).toContain('href="{{ .ConfirmationURL }}"');
    expect(customer).not.toContain(".Token");
  });

  it("is plain in its wording", () => {
    expect(html).not.toContain("—");
  });
});

describe("Auth's settings", () => {
  it("point at templates that exist, on the live site", () => {
    const compose = read("deploy/vps/supabase/compose.farbaek.yaml");
    for (const name of ["magic-link", "confirmation"]) {
      expect(compose).toContain(`https://www.farbaek.com/auth-email/${name}.html`);
      expect(read(`public/auth-email/${name}.html`).length).toBeGreaterThan(100);
    }
  });
});
