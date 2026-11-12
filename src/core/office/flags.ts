/**
 * Platform pause switches (ADR 0032, migration v21). Farbaek's owners flip
 * them from Office Space during an incident. The database refuses the
 * matching inserts while a switch is on; the app reads the same switches to
 * explain the pause before anyone hits that refusal.
 */
export const PLATFORM_FLAGS = ["ai_runs", "sandboxes", "publishing", "serve_published_sites", "new_workspaces", "share_links"] as const;
export type PlatformFlag = (typeof PLATFORM_FLAGS)[number];

export const FLAG_DETAILS: Record<PlatformFlag, { label: string; pauses: string; fallback: string }> = {
  ai_runs: {
    label: "AI and agent runs",
    pauses: "Every AI call: plan drafts, agent runs, change proposals and AI security reviews. Live runs stop at once.",
    fallback: "Farbaek has paused AI for a short while. Your work is safe; try again soon.",
  },
  sandboxes: {
    label: "Sandboxes",
    pauses: "New sandbox sessions and commands, so no app previews or contract checks start.",
    fallback: "Farbaek has paused test spaces for a short while. Try again soon.",
  },
  publishing: {
    label: "Publishing",
    pauses: "New publishes and putting a site live again. Sites already live keep serving.",
    fallback: "Farbaek has paused publishing for a short while. Sites already live keep working.",
  },
  serve_published_sites: {
    label: "Serving published sites",
    pauses: "Every published site shows a neutral \"temporarily unavailable\" page.",
    fallback: "Published sites are paused for a short while.",
  },
  new_workspaces: {
    label: "New workspaces",
    pauses: "Creating workspaces, so no new sign-ups get a workspace or a trial.",
    fallback: "Farbaek has paused new workspaces for a short while. Try again soon.",
  },
  share_links: {
    label: "Shared links",
    pauses: "Every read-only project link shows a neutral \"paused\" page, and no new links are made. Guests invited to a project keep their access.",
    fallback: "Farbaek has paused shared links for a short while. Try again soon.",
  },
};

export function isPlatformFlag(value: unknown): value is PlatformFlag {
  return typeof value === "string" && (PLATFORM_FLAGS as readonly string[]).includes(value);
}
