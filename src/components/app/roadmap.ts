/**
 * Product areas that are not built yet. Shown honestly, never as links.
 * Studio (files, editor, proposals, diffs), Trust (policy, approvals,
 * ProofPacks, recovery), Sandbox (isolated runs, once a runtime is
 * connected), Agent (the paired desktop app, with Mesh nearby transfer), the
 * Launch Planner and Mesh Capsules exist; what's listed here is still missing.
 */
// LaunchOS launches to Vercel and Netlify today (ADR 0078); other hosts are still to come. The phone apps are built; they aren't in the stores yet.
export const ROADMAP = [{ label: "More hosting providers" }, { label: "Phone apps in the stores" }] as const;
