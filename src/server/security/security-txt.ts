import { CONTACT } from "@/config/contact";

/**
 * How to report a security problem (RFC 9116). The contact is Farbaek's
 * support inbox, which is read every day; the policy page says what Farbaek
 * tests and what it doesn't. Expires within a year, as the RFC asks, so it
 * has to be renewed on purpose (security-txt.test.ts fails 30 days before).
 */
export const SECURITY_TXT_EXPIRES = "2027-10-26T00:00:00.000Z";

export function securityTxt(origin = "https://www.farbaek.com"): string {
  return [
    `Contact: mailto:${CONTACT.support}`,
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    "Preferred-Languages: en",
    `Canonical: ${origin}/.well-known/security.txt`,
    `Policy: ${origin}/security`,
    "",
  ].join("\n");
}
