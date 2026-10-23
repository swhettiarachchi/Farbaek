/**
 * Verifies an applied change in one step (ADR 0047). A person presses one
 * button, or the workspace's autonomy starts it right after a change applied
 * on its own: a sandbox starts with the project's files, linked to the task,
 * installs the project's packages (never running their install scripts),
 * runs the contract's checks through the sandbox service's own check run,
 * and stops. The check run writes the receipt and verification ProofPack and
 * moves the task, exactly as when a person runs the checks by hand; this
 * only records the attempt, and why it couldn't run when it couldn't.
 *
 * A cloud run that applied a change on its own checks it in its own sandbox
 * instead, before the sandbox stops (verifyInRunSession).
 */
import { templateFor } from "@/core/agent/cloud-run";
import { verificationSetup, type VerificationResult, type VerificationTrigger } from "@/core/realityloop/verification";
import type { AgentStore } from "@/server/agent/service";
import { log } from "@/server/observability/log";
import type { SandboxActor, SandboxService } from "@/server/sandbox/service";
import { CONTRIBUTOR_ROLES, type OrgRole } from "@/server/workspace/types";
import { codeFromDatabaseError, fail, type WriteResult } from "@/server/workspace/use-cases";
import type { VerificationStore } from "./store";

export type VerificationSandbox = Pick<SandboxService, "overview" | "createSession" | "runCommand" | "runChecks" | "stopSession" | "writeFile">;

export interface VerificationDeps {
  store: VerificationStore;
  checks: Pick<AgentStore, "loadTask" | "approvedContract" | "projectFiles" | "fileContents">;
  /** The sandbox service acting as the person, or why there's none. */
  sandbox: { service: VerificationSandbox; actor: SandboxActor } | { unavailable: string };
  newKey(): string;
}

export interface VerifyPerson {
  orgId: string;
  userId: string;
  role: OrgRole;
}

export type VerificationOutcome = { ok: true; result: VerificationResult; receiptDigest: string } | { ok: false; reason: string };

/** A short-lived session: setup and checks, then it stops. */
const SESSION_MINUTES = 15;
const SETUP_SECONDS = 300;

const RUNNING = "The checks are already running for this change.";

export async function startTaskVerification(deps: VerificationDeps, person: VerifyPerson, taskId: string, trigger: VerificationTrigger): Promise<WriteResult<{ verificationId: string }>> {
  if (!CONTRIBUTOR_ROLES.includes(person.role)) return fail("FORBIDDEN", "Viewers can't run checks. Ask a member, admin or owner.");
  if ("unavailable" in deps.sandbox) return fail("INVALID_TRANSITION", deps.sandbox.unavailable);
  const task = await deps.checks.loadTask(person.orgId, taskId);
  if (!task) return fail("NOT_FOUND");
  if (task.state !== "VERIFYING") return fail("INVALID_TRANSITION", "Only an applied change that's waiting for its checks can be verified.");
  const contract = await deps.checks.approvedContract(person.orgId, taskId);
  if (!contract || contract.body.requiredChecks.length === 0) return fail("INVALID_TRANSITION", "The approved contract lists no checks to run.");

  const started = await deps.store.start({ orgId: person.orgId, actor: person.userId, taskId, trigger });
  if (!started.ok) return started.error.includes("VERIFICATION_RUNNING") ? fail("INVALID_TRANSITION", RUNNING) : fail(codeFromDatabaseError(started.error));
  const id = started.value;
  void runTaskVerification(deps, person, { id, task: { id: task.id, title: task.title, projectId: task.projectId } }).catch((e) => {
    log("error", "verification.crashed", { verification: id, error: e instanceof Error ? e.message : String(e) });
  });
  return { ok: true, value: { verificationId: id } };
}

/** Runs a started attempt in a fresh session. Exported for tests; startTaskVerification runs it in the background. */
export async function runTaskVerification(deps: VerificationDeps, person: VerifyPerson, input: { id: string; task: { id: string; title: string; projectId: string } }): Promise<VerificationOutcome> {
  const failed = (reason: string) => recordFailure(deps.store, person, input.id, reason);
  if ("unavailable" in deps.sandbox) return failed(deps.sandbox.unavailable);
  const { service, actor } = deps.sandbox;
  const { task } = input;
  let sessionId: string | null = null;
  try {
    const files = await deps.checks.projectFiles(person.orgId, task.projectId);
    const paths = files.map((f) => f.path);
    const manifests = files.filter((f) => f.path === "package.json");
    const contents = manifests.length ? await deps.checks.fileContents(person.orgId, task.projectId, manifests) : new Map<string, string>();
    const setup = verificationSetup(paths, (p) => contents.get(p) ?? null);

    const limits = (await service.overview(actor)).limits.limits;
    if (setup?.network && !limits.networkProfiles.includes("package_registries")) {
      return failed("This plan's sandboxes can't reach the package registries, so the project's packages couldn't be installed for its checks.");
    }
    const created = await service.createSession(
      actor,
      {
        name: `Checks: ${task.title}`.slice(0, 80),
        template: templateFor(paths),
        size: limits.sizes.includes("standard") ? "standard" : "small",
        network: setup?.network ? "package_registries" : "none",
        minutes: Math.max(5, Math.min(SESSION_MINUTES, limits.maxSessionMinutes)),
        projectId: task.projectId,
        taskId: task.id,
        include: [],
      },
      `verify:${input.id}`,
    );
    if (!created.ok) return failed(`The sandbox didn't start: ${created.message}`);
    sessionId = created.value.sessionId;
    const attached = await deps.store.attach({ id: input.id, actor: person.userId, sessionId });
    if (!attached.ok) return failed("The sandbox started, but the attempt couldn't be linked to it.");

    if (setup) {
      const r = await service.runCommand(actor, sessionId, { command: setup.command, timeoutSeconds: SETUP_SECONDS, kind: "setup", label: setup.label }, deps.newKey());
      if (!r.ok) return failed(`${setup.label} didn't run: ${r.message.replace(/[.\s]+$/, "")}. The checks didn't run.`);
      if (r.value.exitCode !== 0) {
        const how = r.value.state === "timed_out" ? "it timed out" : r.value.exitCode === null ? "it stopped" : `exit ${r.value.exitCode}`;
        return failed(`${setup.label} failed (${how}), so the checks didn't run.`);
      }
    }
    return await checkAndFinish(deps.store, service, actor, person, input.id, sessionId);
  } catch (e) {
    log("error", "verification.failed", { verification: input.id, error: e instanceof Error ? e.message : String(e) });
    return failed("Something went wrong on Farbaek's side, so the checks didn't finish.");
  } finally {
    if (sessionId) await service.stopSession(actor, sessionId).catch(() => undefined);
  }
}

/**
 * Checks a change a cloud run just applied on its own, in the run's own
 * sandbox: exactly the applied files are written in first, so the check run
 * sees what was applied and nothing else the agent left unsynced.
 */
export async function verifyInRunSession(
  deps: { store: VerificationStore; service: Pick<SandboxService, "runChecks" | "writeFile">; actor: SandboxActor },
  person: VerifyPerson,
  input: { taskId: string; sessionId: string; files: { path: string; content: string }[] },
): Promise<VerificationOutcome> {
  const started = await deps.store.start({ orgId: person.orgId, actor: person.userId, taskId: input.taskId, trigger: "autonomy" });
  if (!started.ok) return { ok: false, reason: started.error.includes("VERIFICATION_RUNNING") ? RUNNING : "The attempt couldn't be recorded." };
  const id = started.value;
  try {
    const attached = await deps.store.attach({ id, actor: person.userId, sessionId: input.sessionId });
    if (!attached.ok) return recordFailure(deps.store, person, id, "The attempt couldn't be linked to this run's sandbox.");
    for (const f of input.files) {
      const written = await deps.service.writeFile(deps.actor, input.sessionId, f.path, f.content);
      if (!written.ok) return recordFailure(deps.store, person, id, `${f.path} couldn't be copied into the sandbox: ${written.message.replace(/[.\s]+$/, "")}.`);
    }
    return await checkAndFinish(deps.store, deps.service, deps.actor, person, id, input.sessionId);
  } catch (e) {
    log("error", "verification.failed", { verification: id, error: e instanceof Error ? e.message : String(e) });
    return recordFailure(deps.store, person, id, "Something went wrong on Farbaek's side, so the checks didn't finish.");
  }
}

async function checkAndFinish(store: VerificationStore, service: Pick<SandboxService, "runChecks">, actor: SandboxActor, person: VerifyPerson, id: string, sessionId: string): Promise<VerificationOutcome> {
  const r = await service.runChecks(actor, sessionId, `verify:${id}`);
  if (!r.ok) return recordFailure(store, person, id, `The checks didn't run: ${r.message.replace(/[.\s]+$/, "")}.`);
  const finished = await store.finish({ id, actor: person.userId, status: "done", receiptDigest: r.value.digest });
  if (!finished.ok) log("warn", "verification.finish_failed", { verification: id, error: finished.error });
  return { ok: true, result: r.value.status as VerificationResult, receiptDigest: r.value.digest };
}

async function recordFailure(store: VerificationStore, person: VerifyPerson, id: string, reason: string): Promise<VerificationOutcome> {
  const r = await store.finish({ id, actor: person.userId, status: "failed", failure: reason.slice(0, 300) });
  if (!r.ok) log("warn", "verification.finish_failed", { verification: id, error: r.error });
  return { ok: false, reason };
}
