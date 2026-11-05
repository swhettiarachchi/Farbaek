/**
 * The trust graph (ADR 0132, spec §9): who and what can act in a workspace,
 * and on what. Built only from records the workspace keeps (members and
 * their permissions, paired agents and their leases, projects, workflows,
 * connected services, and since ADR 0146 agents' pinned tools and the
 * workspace's rules), read as the person, so it never shows another
 * workspace. Every edge says which record it came from; nothing is inferred.
 *
 * The rule it rests on is enforced on the server: an agent acts with the
 * role of the person who paired it, read again on every request, and only
 * within its lease. So an agent never has more authority than its person.
 */
import type { AgentCapability } from "../agent/lease";
import { EFFECTS, type WorkspaceRule } from "./workspace-rules";

/** An agent that can change a project, by way of suggesting changes for its person to approve. */
const AGENT_CAN_SUGGEST = "can suggest changes";

export type TrustNodeKind = "person" | "agent" | "project" | "integration" | "workflow" | "tool" | "rule";

export interface TrustNode {
  id: string;
  kind: TrustNodeKind;
  label: string;
  /** One line about it: a role, a lease, a repository. */
  detail: string;
  /** Not able to act now: an expired or revoked agent, an archived project, a stopped workflow. */
  inactive: boolean;
}

export type TrustEdgeKind = "can_change" | "can_view" | "paired" | "lease" | "pull_requests" | "connected" | "approved" | "works_on" | "uses_tool" | "governs";

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
  /** Each agent's pinned tools (ADR 0133), by name; quarantined when its tools changed and wait for review. */
  toolPins?: { agentId: string; quarantined: boolean; tools: string[] }[];
  /** The workspace's active rules (ADR 0082), with their version. */
  rules?: { version: number; rules: WorkspaceRule[] } | null;
  now: Date;
}

const CONTRIBUTOR = new Set(["owner", "admin", "member"]);
const CAPABILITY_WORDS: Record<AgentCapability, string> = { read: "read", propose: "suggest changes", model: "use AI", mesh: "move folders" };

export const personId = (userId: string) => `person:${userId}`;
export const agentId = (id: string) => `agent:${id}`;
export const projectId = (id: string) => `project:${id}`;
export const workflowId = (id: string) => `workflow:${id}`;
export const toolId = (name: string) => `tool:${name}`;
export const ruleId = (id: string) => `rule:${id}`;

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
        label: changes ? (m.role === "member" && m.approveWithheld ? "can suggest changes" : "can change and approve") : "can view",
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
      detail: a.revoked ? "Revoked" : expired ? "Its access has ended" : `May ${a.lease.capabilities.map((c) => CAPABILITY_WORDS[c]).join(", ")}`,
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
        label: proposes ? (personCanChange ? AGENT_CAN_SUGGEST : "has access, but its person can only view") : `can ${a.lease.capabilities.map((c) => CAPABILITY_WORDS[c]).join(", ")}`,
        source: `Its access, until ${a.lease.expiresAt.slice(0, 10)}`,
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
    if (w.approvedBy && roleOf.has(w.approvedBy)) edges.push({ from: personId(w.approvedBy), to: workflowId(w.id), kind: "approved", label: "approved it; its runs use their access", source: "The workflow's approval", limited: false });
    if (running) edges.push({ from: workflowId(w.id), to: projectId(w.projectId), kind: "works_on", label: "runs agents on this project", source: "The workflow's project", limited: false });
  }

  // Tools an agent may call through Farbaek's model gateway: its pin (ADR 0133). A quarantined agent's steps are all refused.
  const activeAgents = new Set(nodes.filter((n) => n.kind === "agent" && !n.inactive).map((n) => n.id));
  const pinnedOn = new Map<string, number>();
  const changedOn = new Set<string>();
  for (const pin of input.toolPins ?? []) {
    if (!activeAgents.has(agentId(pin.agentId))) continue;
    for (const name of [...new Set(pin.tools)]) {
      pinnedOn.set(name, (pinnedOn.get(name) ?? 0) + 1);
      if (pin.quarantined) changedOn.add(name);
      edges.push({
        from: agentId(pin.agentId),
        to: toolId(name),
        kind: "uses_tool",
        label: pin.quarantined ? "its tools changed: refused until reviewed" : "may call",
        source: pin.quarantined ? "Its tool pin, quarantined" : "Its tool pin",
        limited: pin.quarantined,
      });
    }
  }
  for (const [name, count] of [...pinnedOn].sort(([a], [b]) => a.localeCompare(b))) {
    nodes.push({ id: toolId(name), kind: "tool", label: name, detail: `Tool pinned on ${count} ${count === 1 ? "agent" : "agents"}${changedOn.has(name) ? ", on one waiting for review" : ""}`, inactive: false });
  }

  // Workspace rules govern every project's changes to the files they name (ADR 0082).
  for (const rule of input.rules?.rules ?? []) {
    const effect = EFFECTS[rule.effect];
    const where = rule.paths.join(", ");
    nodes.push({ id: ruleId(rule.id), kind: "rule", label: where, detail: `${effect.label}. ${rule.reason}`, inactive: false });
    for (const p of live) {
      edges.push({ from: ruleId(rule.id), to: projectId(p.id), kind: "governs", label: `a change to ${where} ${effect.sentence}`, source: `Workspace rules, version ${input.rules!.version}`, limited: false });
    }
  }
  return { nodes, edges };
}

/** The workspace rules that govern changes in a project, in the order they're written. */
export function rulesOn(graph: TrustGraph, project: string): Answer[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return graph.edges.filter((e) => e.kind === "governs" && e.to === projectId(project) && byId.has(e.from)).map((e) => ({ node: byId.get(e.from)!, via: [e] }));
}

export interface Answer {
  node: TrustNode;
  /** How it reaches the subject, as edges in order. */
  via: TrustEdge[];
}

/** "Who and what can change this project?": people who can, and agents and workflows that can suggest changes there. */
export function whoCanChange(graph: TrustGraph, project: string): Answer[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const target = projectId(project);
  const out: Answer[] = [];
  for (const e of graph.edges) {
    if (e.to !== target) continue;
    if (e.kind === "can_change" || (e.kind === "lease" && e.label === AGENT_CAN_SUGGEST) || e.kind === "works_on") {
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
  const rank: Record<TrustNodeKind, number> = { person: 0, agent: 1, workflow: 2, project: 3, integration: 4, tool: 5, rule: 6 };
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
