/**
 * The Failure Futures Lab (ADR 0135): tries one failure scenario against a
 * change waiting for review. The scenario is worked out again here from the
 * proposal itself, never taken from the browser. Claude writes one test that
 * simulates the failure (metered as failure_test, refunded if it fails); one
 * disposable sandbox gets the project's files with the proposal's written
 * over them, installs packages without their install scripts, adds the test
 * and runs it with the project's own runner under a time limit; then the
 * sandbox stops. Nothing reaches the project, and the trial records only
 * what the run observed.
 */
import { templateFor } from "@/core/agent/cloud-run";
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import {
  classifyLabRun,
  failureTestRequest,
  LAB_MANIFESTS,
  labRunner,
  MANUAL_FAILURE_TEST,
  outputTail,
  suggestFailureFutures,
  type FailureFuture,
  type FailureKind,
  type FailureTestRequest,
  type LabRunner,
} from "@/core/realityloop/failure-futures";
import { verificationSetup } from "@/core/realityloop/verification";
import { sha256Hex } from "@/core/trust/canonical-json";
import type { WithheldPermissions } from "@/core/workspace/permissions";
import { FAILURE_TEST_PROMPT, failureTestMessage, type FailureTestWriter } from "@/server/ai/failure-test-writer";
import { routeModel } from "@/server/ai/routing";
import type { AgentStore } from "@/server/agent/service";
import type { ArenaSandbox } from "@/server/arena/runner";
import type { ArenaProposal } from "@/server/arena/store";
import { log } from "@/server/observability/log";
import type { SandboxActor } from "@/server/sandbox/service";
import { refundUsage, reserveUsage, resolvePlan, settleUsage, type AiUsageDeps, type ModelSource, type UsageContext } from "@/server/workspace/ai-usage";
import { CONTRIBUTOR_ROLES, type OrgRole } from "@/server/workspace/types";
import { codeFromDatabaseError, fail, requirePermission, type WriteResult } from "@/server/workspace/use-cases";
import type { FailureStore, FailureTrialResult } from "./store";

export interface FailureDeps {
  store: FailureStore;
  checks: Pick<AgentStore, "loadTask" | "projectFiles" | "fileContents">;
  sandbox: { service: ArenaSandbox; actor: SandboxActor } | { unavailable: string };
  usage: UsageContext & AiUsageDeps;
  writer: ModelSource<FailureTestWriter>;
  newKey(): string;
}

export interface FailurePerson {
  orgId: string;
  userId: string;
  role: OrgRole;
  permissions: WithheldPermissions;
}

const SESSION_MINUTES = 15;
const SETUP_SECONDS = 300;
const TEST_SECONDS = 180;

const AI_FAILURES = {
  REFUSED: "The AI declined to write this test, so it wasn't counted.",
  INCOMPLETE: "The test came back incomplete, so it wasn't counted. Try again.",
  PROVIDER_BUSY: "The AI provider is busy, so it wasn't counted. Try again in a minute.",
  PROVIDER_ERROR: "The test wasn't written, so it wasn't counted. Try again.",
} as const;

/** The proposal's scenarios and what a trial needs, worked out from the proposal and the project's own files. */
export async function failureFuturesFor(deps: Pick<FailureDeps, "checks">, orgId: string, proposal: ArenaProposal) {
  const files = await deps.checks.projectFiles(orgId, proposal.projectId);
  const changed = new Map(proposal.changes.map((c) => [c.path, c.content]));
  const wanted = files.filter((f) => changed.has(f.path) || (LAB_MANIFESTS as readonly string[]).includes(f.path));
  const current = wanted.length ? await deps.checks.fileContents(orgId, proposal.projectId, wanted) : new Map<string, string>();
  const paths = [...new Set([...files.map((f) => f.path), ...changed.keys()])];
  const read = (p: string) => changed.get(p) ?? current.get(p) ?? null;
  const futures = suggestFailureFutures(proposal.changes.map((c) => ({ path: c.path, content: c.content, before: c.kind === "edit" ? (current.get(c.path) ?? null) : null })));
  return { futures, paths, read, current };
}

const packagesIn = (read: (p: string) => string | null): string[] => {
  try {
    const m = JSON.parse(read("package.json") ?? "") as Record<string, Record<string, string> | undefined>;
    return [...Object.keys(m.dependencies ?? {}), ...Object.keys(m.devDependencies ?? {})];
  } catch {
    return (read("requirements.txt") ?? "").split(/\r?\n/).map((l) => l.split(/[=<>~!\s[]/)[0]!.trim()).filter(Boolean);
  }
};

export async function startFailureFuture(deps: FailureDeps, person: FailurePerson, input: { proposalId: string; kind: FailureKind }): Promise<WriteResult<{ trialId: string }>> {
  if (!CONTRIBUTOR_ROLES.includes(person.role)) return fail("FORBIDDEN", "Viewers can't try failures. Ask a member, admin or owner.");
  const allowed = requirePermission(person.role, person.permissions, "run_agents");
  if (!allowed.ok) return allowed;
  if ("unavailable" in deps.sandbox) return fail("INVALID_TRANSITION", deps.sandbox.unavailable);
  const proposal = await deps.store.proposal(person.orgId, input.proposalId);
  if (!proposal) return fail("NOT_FOUND");
  if (proposal.status !== "pending") return fail("INVALID_TRANSITION", "Only a change waiting for review can be tried.");

  const { futures, paths, read } = await failureFuturesFor(deps, person.orgId, proposal);
  const future = futures.find((f) => f.kind === input.kind);
  if (!future) return fail("NOT_FOUND", "This change doesn't suggest that scenario. Reload the page.");
  const runner = labRunner(future.kind, future.evidence[0]!, paths, read);
  if (!runner.ok) return fail("INVALID_TRANSITION", runner.reason);
  const request = failureTestRequest(future, runner.runner, packagesIn(read), proposal.changes);

  const billing = await resolvePlan(deps.usage, person.orgId);
  if (!billing.ok) return billing;
  const writer = deps.writer.create(routeModel({ plan: billing.value.plan, family: deps.writer.family, step: "write", effort: "balanced" }));
  const units = reserveUnits(writer.model, approxTokens(FAILURE_TEST_PROMPT) + approxTokens(failureTestMessage(request)) + 500, writer.maxOutputTokens);
  const reserved = await reserveUsage(deps.usage, { orgId: person.orgId, userId: person.userId, taskId: proposal.taskId, operation: "failure_test", units, manual: MANUAL_FAILURE_TEST, billing: billing.value });
  if (!reserved.ok) return reserved;

  const started = await deps.store.start({ orgId: person.orgId, actor: person.userId, proposalId: proposal.id, kind: future.kind, evidence: future.evidence });
  if (!started.ok) {
    await refundUsage(deps.usage, { orgId: person.orgId, entryId: reserved.value.entryId, usage: null, reason: "stopped" });
    return started.error.includes("FAILURE_TRIAL_RUNNING") ? fail("INVALID_TRANSITION", "A failure trial of this change is already running. Wait for it to finish.") : fail(codeFromDatabaseError(started.error));
  }
  const id = started.value;
  void runFailureFuture(deps, person, { id, proposal, future, runner: runner.runner, request, writer, entryId: reserved.value.entryId, paths, read }).catch((e) => {
    log("error", "failure_future.crashed", { trial: id, error: e instanceof Error ? e.message : String(e) });
  });
  return { ok: true, value: { trialId: id } };
}

/** Writes the test, then runs it in a fresh session. Exported for tests; startFailureFuture runs it in the background. */
export async function runFailureFuture(
  deps: FailureDeps,
  person: FailurePerson,
  input: { id: string; proposal: ArenaProposal; future: FailureFuture; runner: LabRunner; request: FailureTestRequest; writer: FailureTestWriter; entryId: string; paths: string[]; read: (p: string) => string | null },
): Promise<{ status: string; result: FailureTrialResult }> {
  const end = async (status: Parameters<FailureStore["finish"]>[0]["status"], result: FailureTrialResult) => {
    const r = await deps.store.finish({ id: input.id, actor: person.userId, status, result });
    if (!r.ok) log("warn", "failure_future.finish_failed", { trial: input.id, error: r.error });
    return { status, result };
  };

  // 1. The test, written by Claude and metered.
  let written;
  try {
    written = await input.writer.write(input.request);
  } catch {
    written = { ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null };
  }
  if (!written.ok) {
    await refundUsage(deps.usage, { orgId: person.orgId, entryId: input.entryId, usage: written.usage, reason: "failed" });
    return end("failed", { reason: AI_FAILURES[written.failure] });
  }
  await settleUsage(deps.usage, { orgId: person.orgId, entryId: input.entryId, usage: written.usage });
  const model = written.usage.model;
  const test = written.output.test.trim();
  if (written.output.cannotTest || !test) {
    return end("not_testable", { reason: written.output.cannotTest ?? "The AI wrote no test for this scenario.", expects: written.output.expects || null, model });
  }
  const shown: FailureTrialResult = { testPath: input.runner.testPath, test: `${test}\n`, testSha256: await sha256Hex(`${test}\n`), expects: written.output.expects, command: input.runner.command, model, reason: "" };

  // 2. One disposable sandbox with the proposal's files and the test.
  if ("unavailable" in deps.sandbox) return end("failed", { ...shown, reason: deps.sandbox.unavailable });
  const { service, actor } = deps.sandbox;
  let sessionId: string | null = null;
  try {
    const setup = verificationSetup(input.paths, input.read);
    const limits = (await service.overview(actor)).limits.limits;
    if (setup?.network && !limits.networkProfiles.includes("package_registries")) {
      return end("failed", { ...shown, reason: "This plan's sandboxes can't reach the package registries, so the project's test runner couldn't be installed." });
    }
    const task = await deps.checks.loadTask(person.orgId, input.proposal.taskId);
    const created = await service.createSession(
      actor,
      {
        name: `Failure trial: ${task?.title ?? input.future.title}`.slice(0, 80),
        template: templateFor(input.paths),
        size: limits.sizes.includes("standard") ? "standard" : "small",
        network: setup?.network ? "package_registries" : "none",
        minutes: Math.max(5, Math.min(SESSION_MINUTES, limits.maxSessionMinutes)),
        projectId: input.proposal.projectId,
        taskId: null,
        include: [],
      },
      `failure:${input.id}`,
    );
    if (!created.ok) return end("failed", { ...shown, reason: `The sandbox didn't start: ${created.message}` });
    sessionId = created.value.sessionId;
    const attached = await deps.store.attach({ id: input.id, actor: person.userId, sessionId });
    if (!attached.ok) return end("failed", { ...shown, reason: "The sandbox started, but the trial couldn't be linked to it." });

    for (const change of input.proposal.changes) {
      const w = await service.writeFile(actor, sessionId, change.path, change.content);
      if (!w.ok) return end("failed", { ...shown, reason: `${change.path} couldn't be written into the sandbox: ${w.message.replace(/[.\s]+$/, "")}.` });
    }
    if (setup) {
      const r = await service.runCommand(actor, sessionId, { command: setup.command, timeoutSeconds: SETUP_SECONDS, kind: "setup", label: setup.label }, deps.newKey());
      if (!r.ok || r.value.exitCode !== 0) return end("failed", { ...shown, reason: `${setup.label} didn't finish, so the test didn't run.` });
    }
    const t = await service.writeFile(actor, sessionId, input.runner.testPath, shown.test!);
    if (!t.ok) return end("failed", { ...shown, reason: `The test couldn't be written into the sandbox: ${t.message.replace(/[.\s]+$/, "")}.` });

    // 3. The test, once, with the project's own runner.
    const run = await service.runCommand(actor, sessionId, { command: input.runner.command, timeoutSeconds: TEST_SECONDS, kind: "check", label: `Failure trial: ${input.future.title}`.slice(0, 120) }, `failure:${input.id}:test`);
    if (!run.ok) return end("failed", { ...shown, reason: `The test didn't run: ${run.message.replace(/[.\s]+$/, "")}.` });
    const e = run.value;
    const output = outputTail(e.stdout, e.stderr);
    const seen = classifyLabRun({ framework: input.runner.framework, state: e.state, exitCode: e.exitCode, output: `${e.stdout}\n${e.stderr}` });
    return end(seen.outcome, { ...shown, exitCode: e.exitCode, durationMs: e.durationMs, output, reason: seen.reason });
  } catch (err) {
    log("error", "failure_future.failed", { trial: input.id, error: err instanceof Error ? err.message : String(err) });
    return end("failed", { ...shown, reason: "Something went wrong on Farbaek's side, so the trial didn't finish." });
  } finally {
    if (sessionId) await service.stopSession(actor, sessionId).catch(() => undefined);
  }
}
