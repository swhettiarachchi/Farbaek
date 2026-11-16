import { SPACES } from "./spaces";

/** The header's links: the four spaces by name, then pricing (ADR 0214). */
export const NAV_LINKS: readonly { href: string; label: string }[] = [...SPACES.map((s) => ({ href: s.page, label: s.name })), { href: "/pricing", label: "Pricing" }];
