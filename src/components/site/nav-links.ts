import { MAIN_SPACES } from "./spaces";

/** The header's links: Farbaek AI's four main spaces by name, then pricing (ADR 0214, ADR 0216). */
export const NAV_LINKS: readonly { href: string; label: string }[] = [...MAIN_SPACES.map((s) => ({ href: s.page, label: s.name })), { href: "/pricing", label: "Pricing" }];
