import type { Status } from "@/components/ui/status-badge";

/**
 * Product areas that are not built yet. Shown honestly, never as links.
 * Studio (files, editor, proposals, diffs), Trust (policy, approvals,
 * ProofPacks, recovery), Sandbox (isolated runs, once a runtime is
 * connected), Agent (the paired desktop app, with Mesh nearby transfer), the
 * Launch Planner and Mesh Capsules exist; what's listed here is still missing.
 */
// LaunchOS launches to Vercel and Netlify (ADR 0078, ADR 0093) and to Render, Railway and Fly.io (ADR 0191). The phone apps are built and with Apple and Google's reviews.
// Each says where it stands as a status kind (ADR 0183): planned is "not yet", in review waits on Apple and Google.
export const ROADMAP: readonly { label: string; status: string; kind: Status }[] = [
  { label: "Phone apps in the stores", status: "In review", kind: "pending" },
];
