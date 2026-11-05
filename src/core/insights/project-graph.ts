/**
 * A project's intent-to-proof graph (ADR 0089): one lane per task, from
 * what was asked to what's live, built only from records the workspace
 * already keeps. Every node points at the record it came from; nothing is
 * inferred that a record doesn't say.
 */

export interface GraphTask {
  id: string;
  title: string;
  state: string;
  createdAt: string;
}

export interface GraphContract {
  taskId: string;
  version: number;
  status: string;
  createdAt: string;
  approvedAt: string | null;
}

export interface GraphProposal {
  id: string;
  taskId: string;
  status: "pending" | "blocked" | "applied" | "discarded";
  /** The policy's outcome, such as REQUIRE_APPROVAL or ALLOW_WITHIN_LIMITS; null before policies were recorded. */
  outcome: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export type ProofStatus = "unverified" | "partially_verified" | "verified" | "failed";

export interface GraphProofPack {
  digest: string;
  taskId: string;
  proposalId: string | null;
  status: ProofStatus;
  createdAt: string;
  seq: number;
}

/** A file revision written by applying a proposal. */
export interface GraphFileChange {
  path: string;
  proposalId: string;
}

export interface GraphDeployment {
  number: number;
  createdAt: string;
  /** The evidence the version went out with (ADR 0050); null before evidence was recorded. */
  evidence: string | null;
  evidenceProofPack: string | null;
  overrideReason: string | null;
  live: boolean;
}

export interface GraphLaunch {
  id: string;
  status: "authorized" | "uploading" | "building" | "ready" | "failed";
  authorizedAt: string;
  evidenceProofPack: string | null;
}

export interface GraphIncident {
  number: number;
  title: string;
  severity: string;
  status: string;
  proposalId: string | null;
  openedAt: string;
}

export interface ProjectGraphRecords {
  projectId: string;
  tasks: GraphTask[];
  contracts: GraphContract[];
  proposals: GraphProposal[];
  proofpacks: GraphProofPack[];
  fileChanges: GraphFileChange[];
  deployments: GraphDeployment[];
  launches: GraphLaunch[];
  incidents: GraphIncident[];
  /** Some records were left out to keep the page fast: only the newest are shown. */
  truncated: boolean;
}

export const STAGES = ["intent", "contract", "change", "proof", "live"] as const;
export type StageKey = (typeof STAGES)[number];

export const STAGE_TITLES: Record<StageKey, string> = {
  intent: "Intent",
  contract: "Plan",
  change: "Change",
  proof: "Proof",
  live: "Live",
};

/**
 * reached: done. waiting: on someone or something. stopped: ended there by
 * a decision (blocked, discarded, cancelled). failed: checks or a launch
 * failed. not_yet: nothing to show.
 */
export type StageState = "reached" | "waiting" | "stopped" | "failed" | "not_yet";

export interface StageNode {
  key: StageKey;
  state: StageState;
  label: string;
  detail: string | null;
  at: string | null;
  href: string | null;
}

export interface Lane {
  taskId: string;
  title: string;
  createdAt: string;
  stages: StageNode[];
  incidents: { number: number; title: string; severity: string; status: string }[];
}

/** A version that went out without verified evidence, with the reason an owner or admin gave. */
export interface UnverifiedRelease {
  number: number;
  createdAt: string;
  evidence: string | null;
  reason: string | null;
  live: boolean;
}

const time = (iso: string) => Date.parse(iso);
const newest = <T>(items: T[], at: (t: T) => number): T | null => items.reduce<T | null>((best, t) => (best === null || at(t) > at(best) ? t : best), null);

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

const PROOF_NODE: Record<ProofStatus, { state: StageState; label: string; detail: string | null }> = {
  verified: { state: "reached", label: "Verified", detail: null },
  partially_verified: { state: "failed", label: "Partial", detail: "Partly verified" },
  failed: { state: "failed", label: "Failed", detail: "Checks failed" },
  unverified: { state: "waiting", label: "Unchecked", detail: "Not checked yet" },
};

const CLOSED_TASK = new Set(["CANCELLED", "REJECTED", "EXPIRED"]);

// Without a ProofPack or a proposal record, the task's own state is the record to read.
const PROOF_FROM_STATE: Record<string, { state: StageState; label: string; detail: string | null }> = {
  VERIFYING: { state: "waiting", label: "Running", detail: "Checks running" },
  VERIFIED: { state: "reached", label: "Verified", detail: null },
  PARTIALLY_VERIFIED: { state: "failed", label: "Partial", detail: "Partly verified" },
  FAILED: { state: "failed", label: "Failed", detail: "Checks failed" },
};
const APPLIED_STATES = new Set(["EXECUTION_AUTHORIZED", "EXECUTING", "VERIFYING", "VERIFIED", "PARTIALLY_VERIFIED", "FAILED", "REVIEW_REQUIRED", "RECOVERY_PENDING"]);

function changeFromState(t: GraphTask): StageNode {
  const href = `/app/tasks/${t.id}#change`;
  if (APPLIED_STATES.has(t.state)) return { key: "change", state: "reached", label: "Applied", detail: null, at: null, href };
  if (t.state === "APPROVAL_PENDING") return { key: "change", state: "waiting", label: "In review", detail: null, at: null, href };
  if (t.state === "PLAN_PROPOSED" || t.state === "POLICY_EVALUATED") return { key: "change", state: "waiting", label: "Suggested", detail: null, at: null, href };
  if (t.state === "BLOCKED") return { key: "change", state: "stopped", label: "Blocked", detail: "By the rules", at: null, href };
  return { key: "change", state: "not_yet", label: "Not yet", detail: null, at: null, href: null };
}

export function buildLanes(records: ProjectGraphRecords): { lanes: Lane[]; unverifiedReleases: UnverifiedRelease[] } {
  const task = (id: string) => `/app/tasks/${id}`;
  const byTask = <T extends { taskId: string }>(items: T[]) => {
    const map = new Map<string, T[]>();
    for (const item of items) map.set(item.taskId, [...(map.get(item.taskId) ?? []), item]);
    return map;
  };
  const contracts = byTask(records.contracts);
  const proposals = byTask(records.proposals);
  const proofpacks = byTask(records.proofpacks);
  const filesFor = new Map<string, Set<string>>();
  for (const f of records.fileChanges) filesFor.set(f.proposalId, (filesFor.get(f.proposalId) ?? new Set()).add(f.path));
  const proposalTask = new Map(records.proposals.map((p) => [p.id, p.taskId]));

  const lanes = [...records.tasks]
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))
    .map((t): Lane => {
      const closed = CLOSED_TASK.has(t.state);
      const intent: StageNode = {
        key: "intent",
        state: closed ? "stopped" : "reached",
        label: t.state === "CANCELLED" ? "Cancelled" : closed ? "Closed" : "Asked",
        detail: null,
        // The lane's heading already says when.
        at: null,
        href: task(t.id),
      };

      const c = newest(contracts.get(t.id) ?? [], (x) => x.version);
      const contract: StageNode = c
        ? c.status === "approved"
          ? { key: "contract", state: "reached", label: "Approved", detail: `Version ${c.version}`, at: c.approvedAt, href: `${task(t.id)}#contract` }
          : { key: "contract", state: closed ? "stopped" : "waiting", label: "Draft", detail: closed ? `Version ${c.version}` : `Version ${c.version}, waiting for approval`, at: c.createdAt, href: `${task(t.id)}#contract` }
        : { key: "contract", state: "not_yet", label: "Not yet", detail: null, at: null, href: null };

      const tried = proposals.get(t.id) ?? [];
      // What got through matters most: the newest applied change, or else the newest attempt.
      const p = newest(tried.filter((x) => x.status === "applied"), (x) => time(x.decidedAt ?? x.createdAt)) ?? newest(tried, (x) => time(x.createdAt));
      const attempts = tried.length > 1 ? `${plural(tried.length, "try", "tries")} in all` : null;
      let change: StageNode;
      if (!p) change = changeFromState(t);
      else if (p.status === "applied") {
        const files = filesFor.get(p.id)?.size ?? 0;
        change = {
          key: "change",
          state: "reached",
          label: "Applied",
          detail: [p.outcome === "ALLOW_WITHIN_LIMITS" ? "On its own" : null, files ? plural(files, "file") : null, attempts].filter(Boolean).join(". ") || null,
          at: p.decidedAt,
          href: `${task(t.id)}#change`,
        };
      } else if (p.status === "pending") {
        change = {
          key: "change",
          state: closed ? "stopped" : "waiting",
          label: "In review",
          detail: p.outcome === "ESCALATE" ? "An owner or admin approves" : attempts,
          at: p.createdAt,
          href: `${task(t.id)}#change`,
        };
      } else {
        change = {
          key: "change",
          state: "stopped",
          label: p.status === "blocked" ? "Blocked" : "Discarded",
          detail: [p.status === "blocked" ? "By the rules" : null, attempts].filter(Boolean).join(". ") || null,
          at: p.decidedAt ?? p.createdAt,
          href: `${task(t.id)}#change`,
        };
      }

      const packs = proofpacks.get(t.id) ?? [];
      const pack = newest(packs, (x) => x.seq);
      let proof: StageNode;
      if (pack) {
        const node = PROOF_NODE[pack.status];
        proof = { key: "proof", ...node, at: pack.createdAt, href: `/app/proofpacks/${pack.digest}` };
      } else {
        const node = PROOF_FROM_STATE[t.state];
        proof = node ? { key: "proof", ...node, at: null, href: task(t.id) } : { key: "proof", state: "not_yet", label: "Not yet", detail: null, at: null, href: null };
      }

      // Versions and launches that went out with one of this task's ProofPacks as their evidence.
      const digests = new Set(packs.map((x) => x.digest));
      const released = records.deployments.filter((d) => d.evidenceProofPack && digests.has(d.evidenceProofPack));
      const launched = records.launches.filter((l) => l.evidenceProofPack && digests.has(l.evidenceProofPack));
      const version = newest(released, (d) => d.number);
      const launch = newest(launched, (l) => time(l.authorizedAt));
      const launchWords = launch ? (launch.status === "ready" ? "Launched to Vercel" : launch.status === "failed" ? "The Vercel launch failed" : "Launching to Vercel") : null;
      const launchLabel = launch ? (launch.status === "ready" ? "Launched" : launch.status === "failed" ? "Failed" : "Launching") : "";
      let live: StageNode;
      if (version) {
        live = {
          key: "live",
          state: "reached",
          label: version.live ? "Live" : "Published",
          detail: [`Version ${version.number}`, version.live ? null : "a later version is live now", launchWords].filter(Boolean).join(". ") || null,
          at: version.createdAt,
          href: `/app/projects/${records.projectId}/launch#version-${version.number}`,
        };
      } else if (launch) {
        live = {
          key: "live",
          state: launch.status === "ready" ? "reached" : launch.status === "failed" ? "failed" : "waiting",
          label: launchLabel,
          detail: launchWords,
          at: launch.authorizedAt,
          href: `/app/projects/${records.projectId}/launch`,
        };
      } else {
        live = { key: "live", state: "not_yet", label: "Not yet", detail: null, at: null, href: null };
      }

      const incidents = records.incidents
        .filter((i) => i.proposalId && proposalTask.get(i.proposalId) === t.id)
        .sort((a, b) => b.number - a.number)
        .map(({ number, title, severity, status }) => ({ number, title, severity, status }));

      return { taskId: t.id, title: t.title, createdAt: t.createdAt, stages: [intent, contract, change, proof, live], incidents };
    });

  // Including versions published before evidence was recorded (evidence null).
  const unverifiedReleases = records.deployments
    .filter((d) => d.evidence !== "verified")
    .sort((a, b) => b.number - a.number)
    .map((d) => ({ number: d.number, createdAt: d.createdAt, evidence: d.evidence, reason: d.overrideReason, live: d.live }));

  return { lanes, unverifiedReleases };
}

export interface Median {
  /** Milliseconds, or null when nothing has been measured yet. */
  ms: number | null;
  count: number;
}

export interface GraphAnalytics {
  askToApplied: Median;
  askToVerified: Median;
  approvalWait: Median;
  /** The newest ProofPack of each applied change. */
  proof: Record<ProofStatus, number>;
  /** Proposals by the policy's outcome, most common first. */
  outcomes: { outcome: string; count: number }[];
  releases: { total: number; verified: number; override: number };
  rework: { tasks: number; of: number };
  hotFiles: { path: string; changes: number; failed: number }[];
  incidents: number;
}

function median(values: number[]): Median {
  const sorted = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return { ms: null, count: 0 };
  const mid = Math.floor(sorted.length / 2);
  return { ms: sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2, count: sorted.length };
}

export function graphAnalytics(records: ProjectGraphRecords): GraphAnalytics {
  const created = new Map(records.tasks.map((t) => [t.id, time(t.createdAt)]));
  const applied = records.proposals.filter((p) => p.status === "applied" && p.decidedAt);

  const firstApplied = new Map<string, number>();
  for (const p of applied) {
    const at = time(p.decidedAt!);
    if (!firstApplied.has(p.taskId) || at < firstApplied.get(p.taskId)!) firstApplied.set(p.taskId, at);
  }
  const firstVerified = new Map<string, number>();
  for (const pack of records.proofpacks.filter((x) => x.status === "verified")) {
    const at = time(pack.createdAt);
    if (!firstVerified.has(pack.taskId) || at < firstVerified.get(pack.taskId)!) firstVerified.set(pack.taskId, at);
  }
  const since = (m: Map<string, number>) => [...m].flatMap(([taskId, at]) => (created.has(taskId) ? [at - created.get(taskId)!] : []));

  // The newest ProofPack of each applied change decides how it ended.
  const latestPack = new Map<string, GraphProofPack>();
  for (const pack of records.proofpacks) {
    if (!pack.proposalId) continue;
    const seen = latestPack.get(pack.proposalId);
    if (!seen || pack.seq > seen.seq) latestPack.set(pack.proposalId, pack);
  }
  const proof: Record<ProofStatus, number> = { verified: 0, partially_verified: 0, failed: 0, unverified: 0 };
  for (const p of applied) {
    const pack = latestPack.get(p.id);
    if (pack) proof[pack.status] += 1;
  }

  const outcomeCounts = new Map<string, number>();
  for (const p of records.proposals) if (p.outcome) outcomeCounts.set(p.outcome, (outcomeCounts.get(p.outcome) ?? 0) + 1);

  const perTask = new Map<string, number>();
  for (const p of records.proposals) perTask.set(p.taskId, (perTask.get(p.taskId) ?? 0) + 1);

  const ended = (proposalId: string) => {
    const status = latestPack.get(proposalId)?.status;
    return status === "failed" || status === "partially_verified";
  };
  const files = new Map<string, { changes: Set<string>; failed: Set<string> }>();
  for (const f of records.fileChanges) {
    const entry = files.get(f.path) ?? { changes: new Set<string>(), failed: new Set<string>() };
    entry.changes.add(f.proposalId);
    if (ended(f.proposalId)) entry.failed.add(f.proposalId);
    files.set(f.path, entry);
  }

  const proposalIds = new Set(records.proposals.map((p) => p.id));
  return {
    askToApplied: median(since(firstApplied)),
    askToVerified: median(since(firstVerified)),
    approvalWait: median(applied.filter((p) => p.outcome !== "ALLOW_WITHIN_LIMITS").map((p) => time(p.decidedAt!) - time(p.createdAt))),
    proof,
    outcomes: [...outcomeCounts].map(([outcome, count]) => ({ outcome, count })).sort((a, b) => b.count - a.count || a.outcome.localeCompare(b.outcome)),
    releases: {
      total: records.deployments.length,
      verified: records.deployments.filter((d) => d.evidence === "verified").length,
      override: records.deployments.filter((d) => d.evidence !== null && d.evidence !== "verified").length,
    },
    rework: { tasks: [...perTask.values()].filter((n) => n > 1).length, of: perTask.size },
    hotFiles: [...files]
      .map(([path, e]) => ({ path, changes: e.changes.size, failed: e.failed.size }))
      .sort((a, b) => b.changes - a.changes || b.failed - a.failed || a.path.localeCompare(b.path))
      .slice(0, 8),
    incidents: records.incidents.filter((i) => i.proposalId && proposalIds.has(i.proposalId)).length,
  };
}

/** "45 min", "6 h", "3 days". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

export const OUTCOME_WORDS: Record<string, string> = {
  ALLOW: "Allowed",
  ALLOW_WITHIN_LIMITS: "Applied on its own",
  SIMULATE_FIRST: "Practice mode",
  REQUIRE_APPROVAL: "A person approves",
  ESCALATE: "An owner or admin approves",
  BLOCK: "Blocked",
};

export const PROOF_WORDS: Record<ProofStatus, string> = {
  verified: "Verified",
  partially_verified: "Partly verified",
  failed: "Failed",
  unverified: "Not checked yet",
};
