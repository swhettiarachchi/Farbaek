/**
 * The Farbaek Agent's permission modes (spec §7). The mode sets what the
 * agent may do without asking; the permission engine (permissions.ts) and
 * the local runtime enforce it. Nothing here can be widened by the model,
 * the project's files or a tool's output.
 */

export const AGENT_MODES = ["review_only", "controlled", "sandboxed_autopilot"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const AGENT_MODE_LABELS: Record<AgentMode, { title: string; detail: string }> = {
  review_only: {
    title: "Review Only",
    detail: "Reads the project's files and prepares a change as a patch. Nothing on disk changes and no command runs.",
  },
  controlled: {
    title: "Controlled Development",
    detail: "Edits files in the agent's copy of the project, with a checkpoint before each change. Read-only commands run; tests, builds, installs and anything risky wait for your approval. Commands run on this computer and aren't isolated.",
  },
  sandboxed_autopilot: {
    title: "Sandboxed Autopilot",
    detail: "Works and runs builds and tests in an isolated Farbaek sandbox. It still asks before crossing a boundary, such as reaching the network.",
  },
};

export interface ModeContext {
  /** True when the workspace's sandbox runtime is connected and its isolation was verified. */
  sandboxVerified: boolean;
}

/** Whether a mode can be used right now, and why not when it can't. */
export function modeAvailability(mode: AgentMode, ctx: ModeContext): { available: true } | { available: false; reason: string } {
  if (mode === "sandboxed_autopilot" && !ctx.sandboxVerified) {
    return { available: false, reason: "Needs a workspace sandbox whose isolation was verified. Until then, use Review Only or Controlled Development." };
  }
  return { available: true };
}
