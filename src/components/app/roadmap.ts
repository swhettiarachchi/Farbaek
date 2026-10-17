/**
 * Product areas that are not built yet. Shown honestly, never as links.
 * Studio (files, editor, proposals, diffs), Trust (policy, approvals,
 * ProofPacks) and Sandbox (isolated runs, once a runtime is connected)
 * exist; what's listed here is what's still missing.
 */
export const ROADMAP = [
  { label: "Recovery", stage: 3 },
  { label: "Agent", stage: 4 },
  { label: "Mesh devices", stage: 5 },
  { label: "LaunchOS", stage: 6 },
] as const;
