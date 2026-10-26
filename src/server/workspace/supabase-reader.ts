import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { IntentContractSchema } from "@/core/realityloop/contract";
import { parsePermissions } from "@/core/workspace/permissions";
import { ORGANIZATION_SELECT, summarizeOrganizations } from "./organizations";
import { readSkillPins } from "./skill-pins";
import { GRANT_COLUMNS, UsageGrantRowSchema, grantFromRow } from "./usage-store";
import { readAutonomy } from "./autonomy";
import { readRuleVersions } from "./workspace-rules";
import { listIncidents, readIncident, readIncidentChanges } from "./incidents";
import type { RehearsalRow } from "@/core/trust/rehearsal";
import { VERIFICATION_SELECT, VerificationRow, verificationFromRow } from "@/server/verification/store";
import {
  MemberRow,
  ProjectRowSchema,
  TaskRowSchema,
  TransitionRowSchema,
  type Project,
  type Task,
  type Transition,
  type WorkspaceReader,
  ProposalRowSchema,
  ShadowSchema,
  proposalFromRow,
} from "./types";

const RECOVERY_SELECT = "id, status, restored, digest, statement, created_at";
const RecoveryRow = z.object({ id: z.string(), status: z.enum(["recovered", "partially_recovered"]), restored: z.number().int(), digest: z.string(), statement: z.unknown(), created_at: z.string() });
const toRecovery = (r: z.infer<typeof RecoveryRow>) => ({ id: r.id, status: r.status, restored: r.restored, digest: r.digest, statement: r.statement, createdAt: r.created_at });

/**
 * Reads with the signed-in user's session. Row Level Security limits every
 * query to organizations the user belongs to; the explicit org_id filters
 * are for correctness, not for security.
 */
export function createSupabaseReader(client: SupabaseClient): WorkspaceReader {
  const toProject = (r: z.infer<typeof ProjectRowSchema>): Project => ({
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
    archivedAt: r.archived_at ?? null,
  });

  const TaskWithProject = TaskRowSchema.extend({
    projects: z.union([z.object({ name: z.string() }), z.array(z.object({ name: z.string() }))]).nullable().optional(),
  });
  const toTask = (r: z.infer<typeof TaskWithProject>): Task => {
    const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    return {
      id: r.id,
      title: r.title,
      state: r.state,
      version: r.version,
      projectId: r.project_id,
      projectName: project?.name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  };
  const TASK_SELECT = "id, title, state, version, project_id, created_at, updated_at, projects(name)";

  function fail(what: string, error: { message: string } | null): never {
    throw new Error(`Couldn't load ${what}: ${error?.message ?? "unknown error"}`);
  }

  const self: WorkspaceReader = {
    mode: "live",

    async listWorkspaces() {
      const { data, error } = await client.from("organizations").select(ORGANIZATION_SELECT).order("created_at");
      if (error) fail("workspaces", error);
      return summarizeOrganizations(data, new Date());
    },

    async listMembers(orgId) {
      const { data, error } = await client.from("organization_members").select("user_id, role, created_at, permissions").eq("org_id", orgId).order("created_at");
      if (error) fail("members", error);
      return z
        .array(MemberRow)
        .parse(data)
        .map((m) => ({ userId: m.user_id, role: m.role, joinedAt: m.created_at, permissions: parsePermissions(m.permissions) }));
    },

    async listProjects(orgId) {
      const { data, error } = await client
        .from("projects")
        .select("id, name, description, created_at")
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) fail("projects", error);
      return z.array(ProjectRowSchema).parse(data).map(toProject);
    },

    async getProject(orgId, projectId) {
      if (!z.uuid().safeParse(projectId).success) return null;
      const { data, error } = await client
        .from("projects")
        .select("id, name, description, created_at, archived_at")
        .eq("org_id", orgId)
        .eq("id", projectId)
        .maybeSingle();
      if (error) fail("the project", error);
      return data ? toProject(ProjectRowSchema.parse(data)) : null;
    },

    async listTasks(orgId, options = {}) {
      let query = client.from("tasks").select(TASK_SELECT).eq("org_id", orgId);
      if (options.projectId) query = query.eq("project_id", options.projectId);
      const { data, error } = await query.order("updated_at", { ascending: false }).limit(options.limit ?? 200);
      if (error) fail("tasks", error);
      return z.array(TaskWithProject).parse(data).map(toTask);
    },

    async getTask(orgId, taskId) {
      if (!z.uuid().safeParse(taskId).success) return null;
      const [{ data: row, error }, { data: rows, error: historyError }] = await Promise.all([
        client.from("tasks").select(TASK_SELECT).eq("org_id", orgId).eq("id", taskId).maybeSingle(),
        client
          .from("task_transitions")
          .select("event_id, event_type, from_state, to_state, actor_kind, actor_id, occurred_at")
          .eq("org_id", orgId)
          .eq("task_id", taskId)
          .order("occurred_at"),
      ]);
      if (error) fail("the task", error);
      if (historyError) fail("the task history", historyError);
      if (!row) return null;
      const history: Transition[] = z
        .array(TransitionRowSchema)
        .parse(rows)
        .map((t) => ({
          eventId: t.event_id,
          eventType: t.event_type,
          from: t.from_state,
          to: t.to_state,
          actorKind: t.actor_kind,
          actorId: t.actor_id,
          at: t.occurred_at,
        }));
      return { task: toTask(TaskWithProject.parse(row)), history };
    },

    async getContract(orgId, taskId) {
      if (!z.uuid().safeParse(taskId).success) return null;
      const { data, error } = await client
        .from("intent_contracts")
        .select("version, status, sha256, body, created_at, approved_at")
        .eq("org_id", orgId)
        .eq("task_id", taskId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail("the contract", error);
      if (!data) return null;
      const row = z
        .object({
          version: z.number().int(),
          status: z.enum(["draft", "approved", "superseded"]),
          sha256: z.string(),
          body: IntentContractSchema,
          created_at: z.string(),
          approved_at: z.string().nullable(),
        })
        .parse(data);
      return { version: row.version, status: row.status, sha256: row.sha256, body: row.body, createdAt: row.created_at, approvedAt: row.approved_at };
    },

    async countEvaluations(orgId, from, to) {
      const { count, error } = await client
        .from("evaluation_events")
        .select("org_id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .gte("occurred_at", from.toISOString())
        .lt("occurred_at", to.toISOString());
      if (error) fail("usage", error);
      return count ?? 0;
    },

    async listFiles(orgId, projectId) {
      if (!z.uuid().safeParse(projectId).success) return [];
      const Row = z.object({ path: z.string(), revision: z.number().int(), size_bytes: z.number().int(), sha256: z.string(), updated_at: z.string() });
      // PostgREST returns at most 1,000 rows per request, so read in pages.
      const PAGE = 1000;
      const rows: z.infer<typeof Row>[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client
          .from("project_files")
          .select("path, revision, size_bytes, sha256, updated_at")
          .eq("org_id", orgId)
          .eq("project_id", projectId)
          .order("path")
          .range(from, from + PAGE - 1);
        if (error) fail("files", error);
        const page = z.array(Row).parse(data);
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      return rows.map((r) => ({ path: r.path, revision: r.revision, sizeBytes: r.size_bytes, sha256: r.sha256, updatedAt: r.updated_at }));
    },

    async getProjectContents(orgId, projectId) {
      const files = await self.listFiles(orgId, projectId);
      const out: { path: string; content: string }[] = [];
      // Current revisions only, read in chunks so each request stays small.
      for (let i = 0; i < files.length; i += 150) {
        const chunk = files.slice(i, i + 150);
        const { data, error } = await client
          .from("project_file_revisions")
          .select("path, revision, content")
          .eq("org_id", orgId)
          .eq("project_id", projectId)
          .in(
            "path",
            chunk.map((f) => f.path),
          )
          .not("content", "is", null);
        if (error) fail("file contents", error);
        const byKey = new Map(z.array(z.object({ path: z.string(), revision: z.number().int(), content: z.string() })).parse(data ?? []).map((r) => [`${r.path}@${r.revision}`, r.content]));
        for (const f of chunk) {
          const content = byKey.get(`${f.path}@${f.revision}`);
          if (content !== undefined) out.push({ path: f.path, content });
        }
      }
      return out;
    },

    async getFile(orgId, projectId, path) {
      if (!z.uuid().safeParse(projectId).success) return null;
      const project = await client.from("projects").select("id").eq("org_id", orgId).eq("id", projectId).maybeSingle();
      if (project.error) fail("project", project.error);
      if (!project.data) return null;
      const { data, error } = await client.rpc("get_project_file", { p_project: projectId, p_path: path });
      if (error) fail("file", error);
      const Row = z.object({ path: z.string(), revision: z.number().int(), size_bytes: z.number().int(), sha256: z.string(), content: z.string(), updated_at: z.string() });
      const row = z.array(Row).parse(data)[0];
      return row ? { path: row.path, revision: row.revision, sizeBytes: row.size_bytes, sha256: row.sha256, content: row.content, updatedAt: row.updated_at } : null;
    },

    async listProofPacks(orgId, taskId) {
      if (!z.uuid().safeParse(taskId).success) return [];
      const { data, error } = await client
        .from("proofpacks")
        .select("digest, status, statement, previous, created_at")
        .eq("org_id", orgId)
        .eq("task_id", taskId)
        .order("seq", { ascending: false })
        .limit(20);
      if (error) fail("ProofPacks", error);
      return z
        .array(z.object({ digest: z.string(), status: z.enum(["unverified", "partially_verified", "verified", "failed"]), statement: z.unknown(), previous: z.string().nullable(), created_at: z.string() }))
        .parse(data)
        .map((r) => ({ digest: r.digest, status: r.status, statement: r.statement, previous: r.previous, createdAt: r.created_at }));
    },

    async getProofPack(orgId, digest) {
      if (!/^[0-9a-f]{64}$/.test(digest)) return null;
      const { data, error } = await client
        .from("proofpacks")
        .select("digest, status, statement, previous, created_at, proofpack_signatures(keyid, sig)")
        .eq("org_id", orgId)
        .eq("digest", digest)
        .maybeSingle();
      if (error) fail("ProofPack", error);
      if (!data) return null;
      const Signature = z.object({ keyid: z.string(), sig: z.string() });
      const r = z
        .object({
          digest: z.string(),
          status: z.enum(["unverified", "partially_verified", "verified", "failed"]),
          statement: z.unknown(),
          previous: z.string().nullable(),
          created_at: z.string(),
          // One signature at most: PostgREST embeds it as an object, or a one-item list.
          proofpack_signatures: z.union([Signature, z.array(Signature), z.null()]).optional(),
        })
        .parse(data);
      const signed = Array.isArray(r.proofpack_signatures) ? (r.proofpack_signatures[0] ?? null) : (r.proofpack_signatures ?? null);
      return { digest: r.digest, status: r.status, statement: r.statement, previous: r.previous, createdAt: r.created_at, signature: signed };
    },

    async listRecentProofPacks(orgId, limit) {
      const { data, error } = await client
        .from("proofpacks")
        .select("digest, status, statement, previous, created_at, task_id")
        .eq("org_id", orgId)
        .order("seq", { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 50));
      if (error) fail("ProofPacks", error);
      return z
        .array(
          z.object({
            digest: z.string(),
            status: z.enum(["unverified", "partially_verified", "verified", "failed"]),
            statement: z.unknown(),
            previous: z.string().nullable(),
            created_at: z.string(),
            task_id: z.string(),
          }),
        )
        .parse(data)
        .map((r) => ({ digest: r.digest, status: r.status, statement: r.statement, previous: r.previous, createdAt: r.created_at, taskId: r.task_id }));
    },

    async listRehearsal(orgId, since) {
      const { data, error } = await client
        .from("change_proposals")
        .select("id, task_id, status, created_at, shadow:policy->shadow")
        .eq("org_id", orgId)
        .gte("created_at", since)
        .not("policy->shadow", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) fail("rehearsal", error);
      const rows = z
        .array(z.object({ id: z.string(), task_id: z.string(), status: z.enum(["pending", "blocked", "applied", "discarded"]), created_at: z.string(), shadow: z.unknown() }))
        .parse(data)
        .flatMap((r) => {
          const shadow = ShadowSchema.safeParse(r.shadow);
          return shadow.success ? [{ ...r, shadow: shadow.data }] : [];
        });
      if (rows.length === 0) return [];
      const { data: packs, error: packError } = await client
        .from("proofpacks")
        .select("proposal_id, status")
        .eq("org_id", orgId)
        .in("proposal_id", rows.map((r) => r.id))
        .order("seq", { ascending: false });
      if (packError) fail("ProofPacks", packError);
      // The newest ProofPack of each proposal says how its checks ended.
      const evidence = new Map<string, RehearsalRow["evidence"]>();
      for (const p of z.array(z.object({ proposal_id: z.string(), status: z.enum(["unverified", "partially_verified", "verified", "failed"]) })).parse(packs)) {
        if (!evidence.has(p.proposal_id)) evidence.set(p.proposal_id, p.status);
      }
      return rows.map((r) => ({
        proposalId: r.id,
        taskId: r.task_id,
        createdAt: r.created_at,
        status: r.status,
        evidence: evidence.get(r.id) ?? null,
        shadow: { outcome: r.shadow.outcome, reasons: r.shadow.reasons },
      }));
    },

    async getFirstStepRecords(orgId) {
      const [latest, verified, site] = await Promise.all([
        client.from("proofpacks").select("task_id, status").eq("org_id", orgId).order("seq", { ascending: false }).limit(1).maybeSingle(),
        client.from("proofpacks").select("task_id").eq("org_id", orgId).eq("status", "verified").order("seq", { ascending: false }).limit(1).maybeSingle(),
        client.from("sites").select("project_id, name").eq("org_id", orgId).not("live_deployment_id", "is", null).is("blocked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (latest.error) fail("ProofPacks", latest.error);
      if (verified.error) fail("ProofPacks", verified.error);
      if (site.error) fail("sites", site.error);
      const pack = z.object({ task_id: z.string(), status: z.enum(["unverified", "partially_verified", "verified", "failed"]) }).nullable().parse(latest.data);
      const proven = z.object({ task_id: z.string() }).nullable().parse(verified.data);
      const live = z.object({ project_id: z.string(), name: z.string() }).nullable().parse(site.data);
      return {
        latestProofPack: pack ? { taskId: pack.task_id, status: pack.status } : null,
        verifiedTaskId: proven?.task_id ?? null,
        liveSite: live ? { projectId: live.project_id, name: live.name } : null,
      };
    },

    async listFileChangesSince(orgId, projectId, since) {
      if (!z.uuid().safeParse(projectId).success || Number.isNaN(Date.parse(since))) return [];
      const { data, error } = await client
        .from("project_file_revisions")
        .select("path, change, revision, created_at, proposal_id")
        .eq("org_id", orgId)
        .eq("project_id", projectId)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) fail("file changes", error);
      return z
        .array(z.object({ path: z.string(), change: z.enum(["import", "edit", "delete"]), revision: z.number().int(), created_at: z.string(), proposal_id: z.string().nullable() }))
        .parse(data)
        .map((r) => ({ path: r.path, change: r.change, revision: r.revision, at: r.created_at, proposalId: r.proposal_id }));
    },

    async getLensSuggestion(orgId, proposalId) {
      if (!z.uuid().safeParse(proposalId).success) return null;
      const { data, error } = await client.from("proposal_lens_suggestions").select("suggestion, model, created_at").eq("org_id", orgId).eq("proposal_id", proposalId).maybeSingle();
      if (error) fail("lens suggestion", error);
      const row = z
        .object({ suggestion: z.object({ mappings: z.array(z.object({ hunk: z.string(), clause: z.string(), reason: z.string() })) }), model: z.string(), created_at: z.string() })
        .nullable()
        .parse(data);
      return row ? { mappings: row.suggestion.mappings, model: row.model, createdAt: row.created_at } : null;
    },

    async getLatestProposal(orgId, taskId) {
      if (!z.uuid().safeParse(taskId).success) return null;
      const { data, error } = await client
        .from("change_proposals")
        .select("id, task_id, project_id, status, contract_version, plan, changes, dropped, violations, sha256, model, created_at, expires_at, decided_at, applied_sha256, policy, agent_id")
        .eq("org_id", orgId)
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail("change proposal", error);
      return data ? proposalFromRow(ProposalRowSchema.parse(data)) : null;
    },

    async listFileRevisions(orgId, projectId, path) {
      if (!z.uuid().safeParse(projectId).success) return [];
      const { data, error } = await client
        .from("project_file_revisions")
        .select("revision, change, size_bytes, sha256, created_at")
        .eq("org_id", orgId)
        .eq("project_id", projectId)
        .eq("path", path)
        .order("revision", { ascending: false })
        .limit(200);
      if (error) fail("file history", error);
      return z
        .array(z.object({ revision: z.number().int(), change: z.enum(["import", "edit", "delete"]), size_bytes: z.number().int().nullable(), sha256: z.string().nullable(), created_at: z.string() }))
        .parse(data)
        .map((r) => ({ revision: r.revision, change: r.change, sizeBytes: r.size_bytes, sha256: r.sha256, createdAt: r.created_at }));
    },

    async getRecoverySource(orgId, projectId, proposal) {
      if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(proposal.id).success) return null;
      const paths = [...new Set(proposal.changes.map((c) => c.path))];
      if (paths.length === 0) return null;
      const Revision = z.object({ path: z.string(), revision: z.number().int(), sha256: z.string().nullable() });
      const baseRevisions = [...new Set(proposal.changes.map((c) => c.baseRevision).filter((r) => r > 0))];
      const [written, earlier, current, pack] = await Promise.all([
        client.from("project_file_revisions").select("path, revision, sha256").eq("org_id", orgId).eq("project_id", projectId).eq("proposal_id", proposal.id),
        baseRevisions.length
          ? client.from("project_file_revisions").select("path, revision, sha256").eq("org_id", orgId).eq("project_id", projectId).in("path", paths).in("revision", baseRevisions)
          : Promise.resolve({ data: [], error: null }),
        client.from("project_files").select("path, revision, sha256").eq("org_id", orgId).eq("project_id", projectId).in("path", paths),
        client.from("proofpacks").select("digest").eq("org_id", orgId).eq("proposal_id", proposal.id).order("seq", { ascending: false }).limit(1).maybeSingle(),
      ]);
      for (const r of [written, earlier, current, pack]) if (r.error) fail("recovery details", r.error);
      const wrote = new Map(z.array(Revision).parse(written.data).map((r) => [r.path, r]));
      const bases = z.array(Revision).parse(earlier.data);
      const applied = proposal.changes.flatMap((c) => {
        const w = wrote.get(c.path);
        if (!w?.sha256) return [];
        const base = c.kind === "edit" ? bases.find((b) => b.path === c.path && b.revision === c.baseRevision) : undefined;
        return [{ path: c.path, kind: c.kind, baseRevision: c.baseRevision, baseSha256: base?.sha256 ?? null, appliedRevision: w.revision, appliedSha256: w.sha256 }];
      });
      if (applied.length === 0) return null;
      const now = z.array(z.object({ path: z.string(), revision: z.number().int(), sha256: z.string() })).parse(current.data);
      return {
        applied,
        current: Object.fromEntries(now.map((f) => [f.path, { revision: f.revision, sha256: f.sha256 }])),
        proofPackDigest: pack.data ? z.object({ digest: z.string() }).parse(pack.data).digest : null,
      };
    },

    async listRecoveries(orgId, taskId) {
      if (!z.uuid().safeParse(taskId).success) return [];
      const { data, error } = await client
        .from("recovery_operations")
        .select(RECOVERY_SELECT)
        .eq("org_id", orgId)
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) fail("recoveries", error);
      return z.array(RecoveryRow).parse(data).map(toRecovery);
    },

    async listInvitations(orgId) {
      const { data, error } = await client
        .from("organization_invitations")
        .select("id, email, role, created_at, expires_at, accepted_at, accepted_by, revoked_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) fail("invitations", error);
      return z
        .array(
          z.object({
            id: z.string(),
            email: z.string(),
            role: z.enum(["admin", "member", "viewer"]),
            created_at: z.string(),
            expires_at: z.string(),
            accepted_at: z.string().nullable(),
            accepted_by: z.string().nullable(),
            revoked_at: z.string().nullable(),
          }),
        )
        .parse(data)
        .map((r) => ({ id: r.id, email: r.email, role: r.role, createdAt: r.created_at, expiresAt: r.expires_at, acceptedAt: r.accepted_at, acceptedBy: r.accepted_by, revokedAt: r.revoked_at, open: !r.accepted_at && !r.revoked_at && Date.parse(r.expires_at) > Date.now() }));
    },

    async listAgents(orgId) {
      const { data, error } = await client
        .from("agents")
        .select("id, name, platform, app_version, paired_by, created_at, last_seen_at, revoked_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) fail("agents", error);
      return z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            platform: z.enum(["windows", "macos", "linux"]),
            app_version: z.string().nullable(),
            paired_by: z.string(),
            created_at: z.string(),
            last_seen_at: z.string().nullable(),
            revoked_at: z.string().nullable(),
          }),
        )
        .parse(data)
        .map((r) => ({ id: r.id, name: r.name, platform: r.platform, appVersion: r.app_version, pairedBy: r.paired_by, createdAt: r.created_at, lastSeenAt: r.last_seen_at, revokedAt: r.revoked_at }));
    },

    async listCheckReceipts(orgId, taskId) {
      if (!z.uuid().safeParse(taskId).success) return [];
      const { data, error } = await client
        .from("sandbox_receipts")
        .select("digest, session_id, status, statement, created_at")
        .eq("org_id", orgId)
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) fail("check runs", error);
      return z
        .array(z.object({ digest: z.string(), session_id: z.string(), status: z.enum(["verified", "partially_verified", "failed", "unverified"]), statement: z.unknown(), created_at: z.string() }))
        .parse(data)
        .map((r) => ({ digest: r.digest, sessionId: r.session_id, status: r.status, statement: r.statement, createdAt: r.created_at }));
    },

    async getLatestVerification(orgId, taskId) {
      if (!z.uuid().safeParse(taskId).success) return null;
      const { data, error } = await client.from("task_verifications").select(VERIFICATION_SELECT).eq("org_id", orgId).eq("task_id", taskId).order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (error) fail("verification", error);
      return data ? verificationFromRow(VerificationRow.parse(data)) : null;
    },

    async getRecovery(orgId, digest) {
      if (!/^[0-9a-f]{64}$/.test(digest)) return null;
      const { data, error } = await client.from("recovery_operations").select(RECOVERY_SELECT).eq("org_id", orgId).eq("digest", digest).maybeSingle();
      if (error) fail("recovery", error);
      return data ? toRecovery(RecoveryRow.parse(data)) : null;
    },

    listSkillPins: (orgId, projectId) => readSkillPins(client, orgId, projectId),
    getAutonomy: (orgId) => readAutonomy(client, orgId),
    getRuleVersions: (orgId) => readRuleVersions(client, orgId),
    listIncidents: (orgId) => listIncidents(client, orgId),
    getIncident: (orgId, number) => readIncident(client, orgId, number),
    getIncidentChanges: (orgId, number) => readIncidentChanges(client, orgId, number),

    async listProjectPaths(orgId) {
      const LIMIT = 2_000;
      const { data, error, count } = await client.from("project_files").select("project_id, path", { count: "exact" }).eq("org_id", orgId).order("path").range(0, LIMIT - 1);
      if (error) fail("project paths", error);
      const files = z
        .array(z.object({ project_id: z.string(), path: z.string() }))
        .parse(data ?? [])
        .map((r) => ({ projectId: r.project_id, path: r.path }));
      return { files, complete: (count ?? files.length) <= files.length };
    },

    async getEmailPreferences() {
      // Row Level Security returns only the signed-in person's own row.
      const { data, error } = await client.from("email_preferences").select("work_updates, trial_reminders").maybeSingle();
      if (error) fail("email preferences", error);
      const row = data as { work_updates: boolean; trial_reminders: boolean } | null;
      return { workUpdates: row?.work_updates ?? true, trialReminders: row?.trial_reminders ?? true };
    },

    async getFileRevision(orgId, projectId, path, revision) {
      if (!z.uuid().safeParse(projectId).success || !Number.isInteger(revision) || revision < 1) return null;
      const { data, error } = await client
        .from("project_file_revisions")
        .select("content")
        .eq("org_id", orgId)
        .eq("project_id", projectId)
        .eq("path", path)
        .eq("revision", revision)
        .maybeSingle();
      if (error) fail("file revision", error);
      return z.object({ content: z.string().nullable() }).nullable().parse(data)?.content ?? null;
    },

    async searchFiles(orgId, projectId, query) {
      const q = query.trim();
      if (!q || q.length > 200 || !z.uuid().safeParse(projectId).success) return [];
      const project = await client.from("projects").select("id").eq("org_id", orgId).eq("id", projectId).maybeSingle();
      if (project.error) fail("project", project.error);
      if (!project.data) return [];
      const { data, error } = await client.rpc("search_project_files", { p_project: projectId, p_query: q });
      if (error) fail("search results", error);
      return z.array(z.object({ path: z.string(), line: z.number().int(), text: z.string() })).parse(data);
    },

    async listUsageGrants(orgId) {
      const { data, error } = await client
        .from("usage_grants")
        .select(GRANT_COLUMNS)
        .eq("org_id", orgId)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at");
      if (error) fail("AI usage", error);
      return z.array(UsageGrantRowSchema).parse(data).map(grantFromRow);
    },
  };
  return self;
}
