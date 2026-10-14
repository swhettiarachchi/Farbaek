/**
 * Product areas that are not built yet. Shown honestly, never as links.
 * Studio (files, editor, proposals, diffs) and Trust (policy, approvals,
 * ProofPacks) exist; what's listed here is what's still missing from them.
 */
export const ROADMAP = [
  { label: "Previews and test runs", stage: 2 },
  { label: "Simulations and recovery", stage: 3 },
  { label: "Agent", stage: 4 },
  { label: "Mesh devices", stage: 5 },
  { label: "LaunchOS", stage: 6 },
] as const;
