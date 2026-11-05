/**
 * Loads the trust graph (ADR 0132) from the workspace's own records, read
 * as the person under row security: members and their permissions, paired
 * agents and leases, projects, workflows, connected services, agents' pinned
 * tools and the workspace's active rules (ADR 0146). Anything
 * that can't be read is left out and named, never guessed.
 */
import { z } from "zod";
import { buildTrustGraph, type TrustGraph, type TrustInput } from "@/core/trust/trust-graph";
import { PROVIDER_NAMES } from "@/core/launch/providers";
import { readConnections } from "@/server/launch/provider-store";
import { readActiveRules } from "@/server/workspace/workspace-rules";
import { createSupabaseServerClient } from "@/server/supabase/server";
import type { AppContext } from "@/server/workspace/context";

export async function loadTrustGraph(ctx: AppContext, orgId: string): Promise<{ graph: TrustGraph; unread: string[] }> {
  const unread: string[] = [];
  const note = <T>(what: string, fallback: T) => () => (unread.push(what), fallback);
  const user = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const [members, invitations, agents, projects, workflows] = await Promise.all([
    ctx.reader.listMembers(orgId).catch(note("people", [])),
    ctx.reader.listInvitations(orgId).catch(() => []),
    ctx.reader.listAgents(orgId).catch(note("agents", [])),
    ctx.reader.listProjects(orgId).catch(note("projects", [])),
    ctx.reader.listWorkflows(orgId).catch(note("workflows", [])),
  ]);

  // Names: the address each person was invited with, and the signed-in person's own.
  const emailOf = new Map<string, string>(invitations.flatMap((i) => (i.acceptedBy ? [[i.acceptedBy, i.email] as const] : [])));
  emailOf.set(ctx.user.id, ctx.user.email ?? "You");
  const label = (userId: string) => emailOf.get(userId) ?? "Teammate";

  const services: TrustInput["services"] = [];
  const repoLinks: TrustInput["repoLinks"] = [];
  let toolPins: TrustInput["toolPins"] = [];
  let rules: TrustInput["rules"] = null;
  if (user) {
    const [pins, active] = await Promise.all([
      Promise.resolve(user.from("agent_tool_pins").select("agent_id, status, manifest").eq("org_id", orgId)).then((r) => (r.error ? note("agents' tools", [])() : (r.data ?? [])), note("agents' tools", [])),
      readActiveRules(user, orgId).catch(note("the workspace's rules", null)),
    ]);
    toolPins = z
      .array(z.object({ agent_id: z.string(), status: z.string(), manifest: z.array(z.object({ name: z.string() }).loose()).catch([]) }))
      .catch([])
      .parse(pins)
      .map((p) => ({ agentId: p.agent_id, quarantined: p.status === "quarantined", tools: p.manifest.map((t) => t.name) }));
    rules = active ? { version: active.version, rules: active.rules } : null;
    const [github, links, modelKey, connections] = await Promise.all([
      Promise.resolve(user.from("workspace_github").select("login, set_by").eq("org_id", orgId).maybeSingle()).then((r) => (r.error ? note("GitHub", null)() : r.data), note("GitHub", null)),
      Promise.resolve(user.from("project_github_repos").select("project_id, owner, repo").eq("org_id", orgId)).then((r) => (r.error ? note("linked repositories", [])() : (r.data ?? [])), note("linked repositories", [])),
      Promise.resolve(user.from("workspace_model_keys").select("key_hint, base_url, set_by").eq("org_id", orgId).maybeSingle()).then((r) => (r.error ? note("the AI key", null)() : r.data), note("the AI key", null)),
      readConnections(user, orgId).catch(note("hosting connections", {})),
    ]);
    const gh = z.object({ login: z.string(), set_by: z.string().nullable() }).safeParse(github);
    if (gh.success) services.push({ id: "integration:github", label: "GitHub", detail: `Connected as ${gh.data.login}`, setBy: gh.data.set_by });
    for (const l of z.array(z.object({ project_id: z.string(), owner: z.string(), repo: z.string() })).catch([]).parse(links)) repoLinks.push({ projectId: l.project_id, repo: `${l.owner}/${l.repo}` });
    const key = z.object({ key_hint: z.string(), base_url: z.string().nullable(), set_by: z.string().nullable() }).safeParse(modelKey);
    if (key.success) services.push({ id: "integration:model-key", label: "Your own AI key", detail: `Anthropic key ending ${key.data.key_hint}${key.data.base_url ? ", through a gateway" : ""}`, setBy: key.data.set_by });
    for (const [provider, c] of Object.entries(connections)) {
      if (c) services.push({ id: `integration:${provider}`, label: PROVIDER_NAMES[provider as keyof typeof PROVIDER_NAMES] ?? provider, detail: `Connected to ${c.accountName}`, setBy: null });
    }
  }

  const graph = buildTrustGraph({
    members: members.map((m) => ({ userId: m.userId, label: label(m.userId), role: m.role, approveWithheld: m.permissions.approve === false })),
    agents: agents.map((a) => ({ id: a.id, name: a.name, pairedBy: a.pairedBy, revoked: Boolean(a.revokedAt), lease: a.lease })),
    projects: projects.map((p) => ({ id: p.id, name: p.name, archived: Boolean(p.archivedAt) })),
    repoLinks,
    services,
    workflows: workflows.map((w) => ({ id: w.id, title: w.title, projectId: w.projectId, approvedBy: w.approvedBy, status: w.status })),
    toolPins,
    rules,
    now: new Date(),
  });
  return { graph, unread };
}
