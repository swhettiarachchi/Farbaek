/**
 * The Future-State Arena (ADR 0076): tries a change before anyone approves
 * it. One disposable sandbox gets the project's current files and installs
 * its packages (never running their install scripts); the contract's checks
 * run once on those files, then again with the proposal's files written over
 * them; then the sandbox stops. Nothing reaches the project, and a trial never
 * writes a receipt, a ProofPack or a task transition: only its record here.
 */
import { templateFor } from "@/core/agent/cloud-run";
import { checksToRun } from "@/core/realityloop/app-check";
import { touchesDependencies, type ArenaCheck } from "@/core/realityloop/arena";
import { verificationSetup } from "@/core/realityloop/verification";
import type { AgentStore } from "@/server/agent/service";
import { log } from "@/server/observability/log";
import type { SandboxActor, SandboxService } from "@/server/sandbox/service";
import { CONTRIBUTOR_ROLES, type OrgRole } from "@/server/workspace/types";
import { codeFromDatabaseError, fail, requirePermission, type WriteResult } from "@/server/workspace/use-cases";
import type { WithheldPermissions } from "@/core/workspace/permissions";
import type { ArenaProposal, ArenaStore } from "./store";

export type ArenaSandbox = Pick<SandboxService, "overview" | "createSession" | "runCommand" | "trialChecks" | "stopSession" | "writeFile">;

export interface ArenaDeps {
  store: ArenaStore;
  checks: Pick<AgentStore, "loadTask" | "approvedContract" | "projectFiles" | "fileContents">;
  sandbox: { service: ArenaSandbox; actor: SandboxActor } | { unavailable: string };
  newKey(): string;
}

export interface ArenaPerson {
  orgId: string;
  userId: string;
  role: OrgRole;
  /** What an owner or admin turned off for them (ADR 0087). */
  permissions: WithheldPermissions;
}

/** Room for setup twice and two check passes; the database closes a trial left running after 30 minutes. */
const SESSION_MINUTES = 20;
const SETUP_SECONDS = 300;

/** The checks a trial runs: the contract's own, or Farbaek's fallback for the kind of project (ADR 0054, ADR 0058). */
export async function trialChecksFor(deps: Pick<ArenaDeps, "checks">, orgId: string, proposal: Pick<ArenaProposal, "taskId" | "projectId">): Promise<string[]> {
  const contract = await deps.checks.approvedContract(orgId, proposal.taskId);
  if (!contract) return [];
  if (contract.body.requiredChecks.length > 0) return [...contract.body.requiredChecks];
  const files = await deps.checks.projectFiles(orgId, proposal.projectId);
  const manifests = files.filter((f) => f.path === "package.json");
  const contents = manifests.length ? await deps.checks.fileContents(orgId, proposal.projectId, manifests) : new Map<string, string>();
  return checksToRun([], files.map((f) => f.path), (p) => contents.get(p) ?? null);
}

export async function startArena(deps: ArenaDeps, person: ArenaPerson, proposalId: string): Promise<WriteResult<{ trialId: string }>> {
  if (!CONTRIBUTOR_ROLES.includes(person.role)) return fail("FORBIDDEN", "Viewers can't try changes. Ask a member, admin or owner.");
  const allowed = requirePermission(person.role, person.permissions, "run_agents");
  if (!allowed.ok) return allowed;
  if ("unavailable" in deps.sandbox) return fail("INVALID_TRANSITION", deps.sandbox.unavailable);
  const proposal = await deps.store.proposal(person.orgId, proposalId);
  if (!proposal) return fail("NOT_FOUND");
  if (proposal.status !== "pending") return fail("INVALID_TRANSITION", "Only a change waiting for review can be tried.");
  const checks = await trialChecksFor(deps, person.orgId, proposal);
  if (checks.length === 0) return fail("INVALID_TRANSITION", "The contract lists no checks, and Farbaek has none for this kind of project, so there's nothing to try.");

  const started = await deps.store.start({ orgId: person.orgId, actor: person.userId, proposalId });
  if (!started.ok) return started.error.includes("ARENA_RUNNING") ? fail("INVALID_TRANSITION", "A trial of this change is already running.") : fail(codeFromDatabaseError(started.error));
  const id = started.value;
  const task = await deps.checks.loadTask(person.orgId, proposal.taskId);
  void runArena(deps, person, { id, proposal, checks, title: task?.title ?? "Change" }).catch((e) => {
    log("error", "arena.crashed", { trial: id, error: e instanceof Error ? e.message : String(e) });
  });
  return { ok: true, value: { trialId: id } };
}

const toArena = (c: { name: string; exitCode: number | null; durationMs: number | null; failure: string | null }): ArenaCheck => ({ name: c.name, exitCode: c.exitCode, durationMs: c.durationMs, failure: c.failure });

/** Runs a started trial in a fresh session. Exported for tests; startArena runs it in the background. */
export async function runArena(deps: ArenaDeps, person: ArenaPerson, input: { id: string; proposal: ArenaProposal; checks: string[]; title: string }): Promise<{ ok: true; baseline: ArenaCheck[]; candidate: ArenaCheck[] } | { ok: false; reason: string }> {
  let baseline: ArenaCheck[] | null = null;
  const failed = async (reason: string) => {
    const r = await deps.store.finish({ id: input.id, actor: person.userId, status: "failed", baseline, failure: reason });
    if (!r.ok) log("warn", "arena.finish_failed", { trial: input.id, error: r.error });
    return { ok: false as const, reason };
  };
  if ("unavailable" in deps.sandbox) return failed(deps.sandbox.unavailable);
  const { service, actor } = deps.sandbox;
  const { proposal } = input;
  let sessionId: string | null = null;
  try {
    const files = await deps.checks.projectFiles(person.orgId, proposal.projectId);
    const paths = files.map((f) => f.path);
    const manifests = files.filter((f) => f.path === "package.json");
    const contents = manifests.length ? await deps.checks.fileContents(person.orgId, proposal.projectId, manifests) : new Map<string, string>();
    const setup = verificationSetup(paths, (p) => contents.get(p) ?? null);
    // With the change written in, the project may need its packages again, from its own manifest.
    const changed = new Map(proposal.changes.map((c) => [c.path, c.content]));
    const candidatePaths = [...new Set([...paths, ...changed.keys()])];
    const candidateSetup = touchesDependencies([...changed.keys()]) ? verificationSetup(candidatePaths, (p) => changed.get(p) ?? contents.get(p) ?? null) : null;

    const limits = (await service.overview(actor)).limits.limits;
    if ((setup?.network || candidateSetup?.network) && !limits.networkProfiles.includes("package_registries")) {
      return failed("This plan's sandboxes can't reach the package registries, so the project's packages couldn't be installed for a trial.");
    }
    const created = await service.createSession(
      actor,
      {
        name: `Trial: ${input.title}`.slice(0, 80),
        template: templateFor(candidatePaths),
        size: limits.sizes.includes("standard") ? "standard" : "small",
        network: setup?.network || candidateSetup?.network ? "package_registries" : "none",
        minutes: Math.max(5, Math.min(SESSION_MINUTES, limits.maxSessionMinutes)),
        projectId: proposal.projectId,
        taskId: null,
        include: [],
      },
      `arena:${input.id}`,
    );
    if (!created.ok) return failed(`The sandbox didn't start: ${created.message}`);
    sessionId = created.value.sessionId;
    const attached = await deps.store.attach({ id: input.id, actor: person.userId, sessionId });
    if (!attached.ok) return failed("The sandbox started, but the trial couldn't be linked to it.");

    const install = async (s: NonNullable<typeof setup>, when: string) => {
      const r = await service.runCommand(actor, sessionId!, { command: s.command, timeoutSeconds: SETUP_SECONDS, kind: "setup", label: s.label }, deps.newKey());
      if (!r.ok) return `${when}, ${s.label} didn't run: ${r.message.replace(/[.\s]+$/, "")}.`;
      if (r.value.exitCode !== 0) return `${when}, ${s.label} failed (${r.value.state === "timed_out" ? "it timed out" : r.value.exitCode === null ? "it stopped" : `exit ${r.value.exitCode}`}).`;
      return null;
    };

    if (setup) {
      const problem = await install(setup, "On the current files");
      if (problem) return failed(`${problem} Neither run happened.`);
    }
    const before = await service.trialChecks(actor, sessionId, input.checks, `arena:${input.id}:before`);
    if (!before.ok) return failed(`The checks didn't run on the current files: ${before.message.replace(/[.\s]+$/, "")}.`);
    baseline = before.value.map(toArena);

    for (const [path, content] of changed) {
      const written = await service.writeFile(actor, sessionId, path, content);
      if (!written.ok) return failed(`${path} couldn't be written into the sandbox: ${written.message.replace(/[.\s]+$/, "")}. The change wasn't tried.`);
    }
    if (candidateSetup) {
      const problem = await install(candidateSetup, "With this change");
      if (problem) return failed(`${problem} Its checks didn't run, so look at its dependency changes first.`);
    }
    const after = await service.trialChecks(actor, sessionId, input.checks, `arena:${input.id}:after`);
    if (!after.ok) return failed(`The checks didn't run with this change: ${after.message.replace(/[.\s]+$/, "")}.`);
    const candidate = after.value.map(toArena);

    const finished = await deps.store.finish({ id: input.id, actor: person.userId, status: "done", baseline, candidate });
    if (!finished.ok) log("warn", "arena.finish_failed", { trial: input.id, error: finished.error });
    return { ok: true, baseline, candidate };
  } catch (e) {
    log("error", "arena.failed", { trial: input.id, error: e instanceof Error ? e.message : String(e) });
    return failed("Something went wrong on Farbaek's side, so the trial didn't finish.");
  } finally {
    if (sessionId) await service.stopSession(actor, sessionId).catch(() => undefined);
  }
}
