/**
 * What a phone can change (ADR 0110), through the same use cases and
 * database functions as the web app's server actions. The phone's own
 * session is the user client, so Row Level Security and every role,
 * permission, version and hash check apply exactly as they do on the web.
 *
 * Approving from the phone applies the proposal exactly as proposed: the
 * phone shows the whole change and has no editor, and the hash it showed
 * must still be the proposal's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAiProvider } from "@/server/ai/config";
import { createContractDrafter } from "@/server/ai/providers";
import { answerRunApproval, cancelCloudRun, sendRunMessage, startCloudRun } from "@/server/cloud-agent/executor";
import { cloudRunDeps } from "@/server/cloud-agent/wiring";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { log } from "@/server/observability/log";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { startTaskVerification } from "@/server/verification/runner";
import { verificationDeps } from "@/server/verification/wiring";
import { runCapUnits } from "@/server/workspace/plan-card-data";
import { applyProposal, discardProposal } from "@/server/workspace/proposals";
import { startFromPrompt } from "@/server/workspace/start-from-prompt";
import { mapCreateOrganizationError } from "@/server/workspace/organizations";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { approveContract, type WriteErrorCode, type WriteResult } from "@/server/workspace/use-cases";
import { claimAppleTransaction } from "@/server/billing/apple/service";
import { appleDeps, appleIapOn } from "@/server/billing/apple/wiring";
import type { PhoneOutcome, PhonePerson, PhoneWrites } from "./api";
import type { PhoneStore } from "./auth";

const STATUS: Partial<Record<WriteErrorCode, number>> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  APPROVER_ROLE_REQUIRED: 403,
  BILLING_SUSPENDED: 402,
  QUOTA_EXCEEDED: 402,
  TRIAL_CAP_REACHED: 402,
  FEATURE_NOT_IN_PLAN: 402,
  VERSION_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  CONTRACT_CHANGED: 409,
  FILE_CHANGED: 409,
  PROPOSAL_CLOSED: 409,
  PROPOSAL_CHANGED: 409,
  PROPOSAL_EXPIRED: 409,
  PROJECT_ARCHIVED: 409,
};

function fromWrite<T>(r: WriteResult<T>): PhoneOutcome<T> {
  return r.ok ? r : { ok: false, status: STATUS[r.code] ?? 422, code: r.code, message: r.message };
}

const refuse = (status: number, code: string, message: string): PhoneOutcome<never> => ({ ok: false, status, code, message });

function runPerson(p: PhonePerson) {
  return p.ctx.role ? { orgId: p.orgId, userId: p.caller.userId, role: p.ctx.role, permissions: p.ctx.permissions } : null;
}

export function createPhoneWrites(options: { userClient: (accessToken: string) => SupabaseClient; store: PhoneStore }): PhoneWrites {
  function writeDeps(p: PhonePerson) {
    const admin = createSupabaseAdminClient();
    return admin ? createSupabaseWriteDeps(options.userClient(p.caller.accessToken), admin, p.caller.userId) : null;
  }
  const notConfigured = refuse(503, "NOT_CONFIGURED", "The server isn't configured for writes.");

  return {
    async approve(p, input) {
      const deps = writeDeps(p);
      if (!deps) return notConfigured;
      const proposal = await p.ctx.reader.getLatestProposal(p.orgId, input.taskId);
      if (!proposal || proposal.id !== input.proposalId) return refuse(409, "PROPOSAL_CHANGED", "This change was replaced by a newer one. Open it again to review it.");
      const applied = await applyProposal(deps, {
        orgId: p.orgId,
        userId: p.caller.userId,
        proposalId: proposal.id,
        reviewedSha256: input.sha256,
        files: proposal.changes.map((c) => ({ path: c.path, content: c.content })),
        execution: currentExecutionMode(),
      });
      if (!applied.ok) return fromWrite(applied);
      // As on the web (ADR 0059): approving starts the change's checks straight away.
      let checking = false;
      const person = runPerson(p);
      if (person) {
        const wiring = await verificationDeps(person, { accessToken: p.caller.accessToken });
        const started = wiring.ok ? await startTaskVerification(wiring.deps, person, applied.value.taskId, "person") : null;
        checking = started?.ok === true;
        if (started && !started.ok) log("info", "verification.after_apply_not_started", { task: applied.value.taskId, code: started.code });
      }
      return { ok: true, value: { written: applied.value.written, checking } };
    },

    async discard(p, input) {
      const deps = writeDeps(p);
      if (!deps) return notConfigured;
      const proposal = await p.ctx.reader.getLatestProposal(p.orgId, input.taskId);
      if (!proposal || proposal.id !== input.proposalId) return refuse(409, "PROPOSAL_CHANGED", "This change was replaced by a newer one. Open it again to review it.");
      return fromWrite(await discardProposal(deps, { orgId: p.orgId, userId: p.caller.userId, proposalId: proposal.id }));
    },

    async build(p, input) {
      const deps = writeDeps(p);
      if (!deps) return notConfigured;
      const ai = resolveAiProvider();
      const provider = ai.provider;
      const drafter = provider ? { family: provider, create: (s: Parameters<typeof createContractDrafter>[1]) => createContractDrafter(provider, s) } : { unavailable: `${ai.reason} You can write the plan on the web.` };
      let existing: { id: string; name: string; description: string | null; paths: string[] } | undefined;
      if (input.projectId) {
        const project = await p.ctx.reader.getProject(p.orgId, input.projectId);
        if (!project) return refuse(404, "NOT_FOUND", "That project doesn't exist in this workspace.");
        if (project.archivedAt) return refuse(409, "PROJECT_ARCHIVED", "This project is archived, so it can't take new work.");
        const files = await p.ctx.reader.listFiles(p.orgId, project.id).catch(() => []);
        existing = { id: project.id, name: project.name, description: project.description, paths: files.map((f) => f.path) };
      }
      const result = await startFromPrompt(deps, drafter, { orgId: p.orgId, userId: p.caller.userId, prompt: input.prompt, effort: input.effort, existing });
      if (!result.ok) return fromWrite(result);
      return { ok: true, value: { taskId: result.value.taskId, projectId: result.value.projectId, planned: result.value.planned, planNote: result.value.planNote } };
    },

    async approvePlan(p, input) {
      const deps = writeDeps(p);
      if (!deps || !p.ctx.current) return notConfigured;
      const approved = await approveContract(deps, { orgId: p.orgId, userId: p.caller.userId, taskId: input.taskId, expectedTaskVersion: input.expectedTaskVersion, version: input.version, sha256: input.sha256 });
      if (!approved.ok) return fromWrite(approved);
      const person = runPerson(p);
      if (!person) return { ok: true, value: { runId: null, startNote: "The plan is approved. You're not a member of this workspace, so the agent can't start for you." } };
      const wiring = await cloudRunDeps(person, { accessToken: p.caller.accessToken });
      if (!wiring.ok) return { ok: true, value: { runId: null, startNote: `The plan is approved. The agent couldn't start: ${wiring.reason}` } };
      const started = await startCloudRun(wiring.deps, { person, taskId: input.taskId, effort: input.effort, capUnits: runCapUnits(p.ctx.current, input.effort, input.cap) });
      if (!started.ok) return { ok: true, value: { runId: null, startNote: `The plan is approved. The agent couldn't start: ${started.message}` } };
      return { ok: true, value: { runId: started.value.runId, startNote: null } };
    },

    answerRun(p, input) {
      const person = runPerson(p);
      return person ? fromWrite(answerRunApproval(person, input)) : refuse(403, "FORBIDDEN", "You're not a member of this workspace.");
    },
    stopRun(p, runId) {
      const person = runPerson(p);
      return person ? fromWrite(cancelCloudRun(person, runId)) : refuse(403, "FORBIDDEN", "You're not a member of this workspace.");
    },
    messageRun(p, input) {
      const person = runPerson(p);
      return person ? fromWrite(sendRunMessage(person, input)) : refuse(403, "FORBIDDEN", "You're not a member of this workspace.");
    },

    async appleTransaction(p, jws) {
      if (!appleIapOn()) return refuse(503, "NOT_OPEN", "App Store purchases aren't open yet.");
      const deps = appleDeps();
      if (!deps) return notConfigured;
      const r = await claimAppleTransaction(deps, { orgId: p.orgId, role: p.ctx.role, jws });
      return r.ok ? r : refuse(r.status, r.code, r.message);
    },

    async createWorkspace(caller) {
      const { data, error } = await options.userClient(caller.accessToken).rpc("create_organization", { p_name: "My workspace" });
      if (error) {
        const mapped = mapCreateOrganizationError(error.message);
        return refuse(mapped.code === "NOT_AUTHENTICATED" ? 401 : mapped.code === "PAUSED" ? 503 : 422, mapped.code, mapped.message);
      }
      return typeof data === "string" ? { ok: true, value: { workspaceId: data } } : refuse(422, "UNKNOWN", mapCreateOrganizationError(undefined).message);
    },

    setPush: (caller, token, environment) => options.store.setPush(caller.sessionId, token, environment),
    signOut: (caller) => options.store.revoke(caller.userId, caller.deviceId),
  };
}
