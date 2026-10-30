/**
 * The trust graph (ADR 0132, spec §9): who and what can act in a workspace,
 * and on what. Built only from records the workspace keeps (members and
 * their permissions, paired agents and their leases, projects, workflows,
 * connected services), read as the person, so it never shows another
 * workspace. Every edge says which record it came from; nothing is inferred.
 *
 * The rule it rests on is enforced on the server: an agent acts with the
 * role of the person who paired it, read again on every request, and only
 * within its lease. So an agent never has more authority than its person.
 */
import type { AgentCapability } from "../agent/lease";

export type TrustNodeKind = "person" | "agent" | "project" | "integration" | "workflow";

export interface TrustNode {
  id: string;
  kind: TrustNodeKind;
  label: string;
  /** One line about it: a role, a lease, a repository. */
  detail: string;
  /** Not able to act now: an expired or revoked agent, an archived project, a stopped workflow. */
  inactive: boolean;
}

export type TrustEdgeKind = "can_change" | "can_view" | "paired" | "lease" | "pull_requests" | "connected" | "approved" | "works_on";

export interface TrustEdge {
  from: string;
  to: string;
  kind: TrustEdgeKind;
  label: string;
  /** The record the edge comes from, in words. */
  source: string;
  /** True when the edge exists on record but its holder can't use it now. */
  limited: boolean;
}

export interface TrustGraph {
  nodes: TrustNode[];
  edges: TrustEdge[];
}

export interface TrustInput {
  members: { userId: string; label: string; role: "owner" | "admin" | "member" | "viewer"; approveWithheld: boolean }[];
  agents: { id: string; name: string; pairedBy: string; revoked: boolean; lease: { expiresAt: string; projects: string[] | null; capabilities: AgentCapability[] } }[];
  projects: { id: string; name: string; archived: boolean }[];
  repoLinks: { projectId: string; repo: string }[];
  services: { id: string; label: string; detail: string; setBy: string | null }[];
  workflows: { id: string; title: string; projectId: string; approvedBy: string | null; status: string }[];
  now: Date;
}

const CONTRIBUTOR = new Set(["owner", "admin", "member"]);
const CAPABILITY_WORDS: Record<AgentCapability, string> = { read: "read", propose: "propose changes", model: "use AI", mesh: "move folders" };

export const personId = (userId: string) => `person:${userId}`;
export const agentId = (id: string) => `agent:${id}`;
export const projectId = (id: string) => `project:${id}`;
export const workflowId = (id: string) => `workflow:${id}`;

export function buildTrustGraph(input: TrustInput): TrustGraph {
  const nodes: TrustNode[] = [];
  const edges: TrustEdge[] = [];
  const roleOf = new Map(input.members.map((m) => [m.userId, m]));
  const live = input.projects.filter((p) => !p.archived);

  for (const m of input.members) {
    const changes = CONTRIBUTOR.has(m.role);
    nodes.push({ id: personId(m.userId), kind: "person", label: m.label, detail: `${m.role[0]!.toUpperCase()}${m.role.slice(1)}${m.role === "member" && m.approveWithheld ? ", can't approve changes" : ""}`, inactive: false });
    for (const p of live) {
      edges.push({
        from: personId(m.userId),
        to: projectId(p.id),
        kind: changes ? "can_change" : "can_view",
        label: changes ? (m.role === "member" && m.approveWithheld ? "can propose changes" : "can change and approve") : "can view",
        source: `Their role: ${m.role}`,
        limited: false,
      });
    }
  }
  for (const p of input.projects) nodes.push({ id: projectId(p.id), kind: "project", label: p.name, detail: p.archived ? "Archived: nothing in it can change" : "Project", inactive: p.archived });

  for (const a of input.agents) {
    const expired = Date.parse(a.lease.expiresAt) <= input.now.getTime();
    const person = roleOf.get(a.pairedBy);
    const personCanChange = person ? CONTRIBUTOR.has(person.role) : false;
    nodes.push({
      id: agentId(a.id),
      kind: "agent",
      label: a.name,
      detail: a.revoked ? "Revoked" : expired ? "Lease expired" : `May ${a.lease.capabilities.map((c) => CAPABILITY_WORDS[c]).join(", ")}`,
      inactive: a.revoked || expired,
    });
    edges.push({ from: personId(a.pairedBy), to: agentId(a.id), kind: "paired", label: "paired", source: "The agent's pairing", limited: false });
    if (a.revoked || expired) continue;
    const covered = a.lease.projects === null ? live : live.filter((p) => a.lease.projects!.includes(p.id));
    const proposes = a.lease.capabilities.includes("propose");
    for (const p of covered) {
      edges.push({
        from: agentId(a.id),
        to: projectId(p.id),
        kind: "lease",
        label: proposes ? (personCanChange ? "can propose changes" : "lease, but its person can only view") : `can ${a.lease.capabilities.map((c) => CAPABILITY_WORDS[c]).join(", ")}`,
        source: `Its lease, until ${a.lease.expiresAt.slice(0, 10)}`,
        limited: proposes && !personCanChange,
      });
    }
  }

  for (const s of input.services) {
    nodes.push({ id: s.id, kind: "integration", label: s.label, detail: s.detail, inactive: false });
    if (s.setBy && roleOf.has(s.setBy)) edges.push({ from: personId(s.setBy), to: s.id, kind: "connected", label: "connected", source: "Who connected it", limited: false });
  }
  for (const link of input.repoLinks) {
    const github = input.services.find((s) => s.id === "integration:github");
    if (!github || !live.some((p) => p.id === link.projectId)) continue;
    edges.push({ from: projectId(link.projectId), to: github.id, kind: "pull_requests", label: `pull requests to ${link.repo}`, source: "The project's linked repository", limited: false });
  }

  for (const w of input.workflows) {
    const running = ["approved", "running", "waiting"].includes(w.status);
    nodes.push({ id: workflowId(w.id), kind: "workflow", label: w.title, detail: `Workflow, ${w.status}`, inactive: !running });
    if (w.approvedBy && roleOf.has(w.approvedBy)) edges.push({ from: personId(w.approvedBy), to: workflowId(w.id), kind: "approved", label: "approved; its runs start as them", source: "The workflow's approval", limited: false });
    if (running) edges.push({ from: workflowId(w.id), to: projectId(w.projectId), kind: "works_on", label: "runs agents on", source: "The workflow's project", limited: false });
  }
  return { nodes, edges };
}

export interface Answer {
  node: TrustNode;
  /** How it reaches the subject, as edges in order. */
  via: TrustEdge[];
}

/** "Who and what can change this project?": people who can, and agents and workflows that can propose there. */
export function whoCanChange(graph: TrustGraph, project: string): Answer[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const target = projectId(project);
  const out: Answer[] = [];
  for (const e of graph.edges) {
    if (e.to !== target) continue;
    if (e.kind === "can_change" || (e.kind === "lease" && e.label === "can propose changes") || e.kind === "works_on") {
      const via = [e];
      if (e.kind === "lease") {
        const paired = graph.edges.find((x) => x.kind === "paired" && x.to === e.from);
        if (paired) via.unshift(paired);
      }
      if (e.kind === "works_on") {
        const approved = graph.edges.find((x) => x.kind === "approved" && x.to === e.from);
        if (approved) via.unshift(approved);
      }
      out.push({ node: byId.get(e.from)!, via });
    }
  }
  const rank: Record<TrustNodeKind, number> = { person: 0, agent: 1, workflow: 2, project: 3, integration: 4 };
  return out.sort((a, b) => rank[a.node.kind] - rank[b.node.kind] || a.node.label.localeCompare(b.node.label));
}

/** Everything a node reaches, and everything that reaches it, one step away. */
export function neighbours(graph: TrustGraph, id: string): { out: Answer[]; in: Answer[] } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return {
    out: graph.edges.filter((e) => e.from === id && byId.has(e.to)).map((e) => ({ node: byId.get(e.to)!, via: [e] })),
    in: graph.edges.filter((e) => e.to === id && byId.has(e.from)).map((e) => ({ node: byId.get(e.from)!, via: [e] })),
  };
}
