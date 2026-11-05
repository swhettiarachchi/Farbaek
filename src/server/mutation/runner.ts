/**
 * Mutation trials (ADR 0136): how well the tests catch small mistakes in
 * the lines a change waiting for review adds. One disposable sandbox gets
 * the project's files with the proposal's written over them and installs
 * packages without their install scripts. The tests related to the changed
 * files run once clean; when they pass, each mutant is written in, the same
 * tests run with a time limit, and the original is written back. The run
 * stops taking mutants when its time budget is spent, and the sandbox
 * stops. No AI is used, and nothing reaches the project.
 */
import { templateFor } from "@/core/agent/cloud-run";
import { LAB_MANIFESTS, testFramework, type LabFramework } from "@/core/realityloop/failure-futures";
import {
  applyMutant,
  baselineProblem,
  classifyMutantRun,
  mutantTimeoutSeconds,
  mutationCommand,
  planMutants,
  MUTATION_BUDGET_MS,
  MUTATION_MAX,
  type Mutant,
  type MutantOutcome,
} from "@/core/realityloop/mutation";
import { verificationSetup } from "@/core/realityloop/verification";
import type { WithheldPermissions } from "@/core/workspace/permissions";
import type { AgentStore } from "@/server/agent/service";
import type { ArenaSandbox } from "@/server/arena/runner";
import type { ArenaProposal } from "@/server/arena/store";
import { log } from "@/server/observability/log";
import type { SandboxActor } from "@/server/sandbox/service";
import { CONTRIBUTOR_ROLES, type OrgRole } from "@/server/workspace/types";
import { codeFromDatabaseError, fail, requirePermission, type WriteResult } from "@/server/workspace/use-cases";
import type { MutationResultInput, MutationStore } from "./store";

export interface MutationDeps {
  store: MutationStore;
  checks: Pick<AgentStore, "loadTask" | "projectFiles" | "fileContents">;
  sandbox: { service: ArenaSandbox; actor: SandboxActor } | { unavailable: string };
  newKey(): string;
  /** Milliseconds, for the run's time budget. */
  clock?(): number;
}

export interface MutationPerson {
  orgId: string;
  userId: string;
  role: OrgRole;
  permissions: WithheldPermissions;
}

const SESSION_MINUTES = 20;
const SETUP_SECONDS = 300;
const BASELINE_SECONDS = 300;

export const NO_MUTANTS = "This change adds no lines with a comparison, condition, true or false, or arithmetic to mutate.";
export const NO_TEST_RUNNER = "Mutation trials use the project's own test runner: Vitest, Jest or pytest. This project has none.";

/** What a run needs, worked out from the proposal and the project's own files. */
export async function mutationPlanFor(deps: Pick<MutationDeps, "checks">, orgId: string, proposal: ArenaProposal) {
  const files = await deps.checks.projectFiles(orgId, proposal.projectId);
  const changed = new Map(proposal.changes.map((c) => [c.path, c.content]));
  const wanted = files.filter((f) => changed.has(f.path) || (LAB_MANIFESTS as readonly string[]).includes(f.path));
  const current = wanted.length ? await deps.checks.fileContents(orgId, proposal.projectId, wanted) : new Map<string, string>();
  const paths = [...new Set([...files.map((f) => f.path), ...changed.keys()])];
  const read = (p: string) => changed.get(p) ?? current.get(p) ?? null;
  const mutants = planMutants(
    proposal.changes.map((c) => ({ path: c.path, content: c.content, before: c.kind === "edit" ? (current.get(c.path) ?? null) : null })),
    MUTATION_MAX,
  );
  const framework = mutants.length ? testFramework(mutants[0]!.path, read) : null;
  return { mutants, framework, paths, read, changed };
}

export async function startMutationRun(deps: MutationDeps, person: MutationPerson, proposalId: string): Promise<WriteResult<{ runId: string }>> {
  if (!CONTRIBUTOR_ROLES.includes(person.role)) return fail("FORBIDDEN", "Viewers can't run mutation trials. Ask a member, admin or owner.");
  const allowed = requirePermission(person.role, person.permissions, "run_agents");
  if (!allowed.ok) return allowed;
  if ("unavailable" in deps.sandbox) return fail("INVALID_TRANSITION", deps.sandbox.unavailable);
  const proposal = await deps.store.proposal(person.orgId, proposalId);
  if (!proposal) return fail("NOT_FOUND");
  if (proposal.status !== "pending") return fail("INVALID_TRANSITION", "Only a change waiting for review can be tried.");
  const plan = await mutationPlanFor(deps, person.orgId, proposal);
  if (plan.mutants.length === 0) return fail("INVALID_TRANSITION", NO_MUTANTS);
  if (!plan.framework) return fail("INVALID_TRANSITION", NO_TEST_RUNNER);

  const started = await deps.store.start({ orgId: person.orgId, actor: person.userId, proposalId: proposal.id });
  if (!started.ok) return started.error.includes("MUTATION_RUNNING") ? fail("INVALID_TRANSITION", "A mutation trial of this change is already running.") : fail(codeFromDatabaseError(started.error));
  const id = started.value;
  void runMutationRun(deps, person, { id, proposal, mutants: plan.mutants, framework: plan.framework, paths: plan.paths, read: plan.read, changed: plan.changed }).catch((e) => {
    log("error", "mutation.crashed", { run: id, error: e instanceof Error ? e.message : String(e) });
  });
  return { ok: true, value: { runId: id } };
}

/** Runs a started trial in a fresh session. Exported for tests; startMutationRun runs it in the background. */
export async function runMutationRun(
  deps: MutationDeps,
  person: MutationPerson,
  input: { id: string; proposal: ArenaProposal; mutants: Mutant[]; framework: LabFramework; paths: string[]; read: (p: string) => string | null; changed: Map<string, string> },
): Promise<MutationResultInput> {
  const clock = deps.clock ?? Date.now;
  const end = async (result: MutationResultInput) => {
    const r = await deps.store.finish({ id: input.id, actor: person.userId, result });
    if (!r.ok) log("warn", "mutation.finish_failed", { run: input.id, error: r.error });
    return result;
  };
  if ("unavailable" in deps.sandbox) return end({ status: "failed", reason: deps.sandbox.unavailable });
  const { service, actor } = deps.sandbox;
  const command = mutationCommand(input.framework, [...new Set(input.mutants.map((m) => m.path))]);
  let sessionId: string | null = null;
  let computeMs = 0;
  try {
    const setup = verificationSetup(input.paths, input.read);
    const limits = (await service.overview(actor)).limits.limits;
    if (setup?.network && !limits.networkProfiles.includes("package_registries")) {
      return end({ status: "failed", reason: "Test spaces on your subscription can't reach the package registries, so the project's tests couldn't be installed." });
    }
    const task = await deps.checks.loadTask(person.orgId, input.proposal.taskId);
    const created = await service.createSession(
      actor,
      {
        name: `Mutation trial: ${task?.title ?? "Change"}`.slice(0, 80),
        template: templateFor(input.paths),
        size: limits.sizes.includes("standard") ? "standard" : "small",
        network: setup?.network ? "package_registries" : "none",
        minutes: Math.max(5, Math.min(SESSION_MINUTES, limits.maxSessionMinutes)),
        projectId: input.proposal.projectId,
        taskId: null,
        include: [],
      },
      `mutation:${input.id}`,
    );
    if (!created.ok) return end({ status: "failed", reason: `The test space didn't start: ${created.message}` });
    sessionId = created.value.sessionId;
    const attached = await deps.store.attach({ id: input.id, actor: person.userId, sessionId });
    if (!attached.ok) return end({ status: "failed", reason: "The test space started, but the trial couldn't be linked to it." });

    for (const [path, content] of input.changed) {
      const w = await service.writeFile(actor, sessionId, path, content);
      if (!w.ok) return end({ status: "failed", reason: `${path} couldn't be written into the test space: ${w.message.replace(/[.\s]+$/, "")}.` });
    }
    if (setup) {
      const r = await service.runCommand(actor, sessionId, { command: setup.command, timeoutSeconds: SETUP_SECONDS, kind: "setup", label: setup.label }, deps.newKey());
      if (!r.ok || r.value.exitCode !== 0) return end({ status: "failed", reason: `${setup.label} didn't finish, so the tests didn't run.` });
    }

    // The clean run: the tests must run and pass before any mutant can be judged.
    const clean = await service.runCommand(actor, sessionId, { command, timeoutSeconds: BASELINE_SECONDS, kind: "check", label: "Mutation trial: tests without mutants" }, `mutation:${input.id}:clean`);
    if (!clean.ok) return end({ status: "failed", reason: `The tests didn't run: ${clean.message.replace(/[.\s]+$/, "")}.`, command });
    const baselineMs = clean.value.durationMs;
    computeMs += baselineMs ?? 0;
    const problem = baselineProblem({ framework: input.framework, state: clean.value.state, exitCode: clean.value.exitCode, output: `${clean.value.stdout}\n${clean.value.stderr}` });
    if (problem) return end({ status: "failed", reason: problem, command, baselineMs, computeMs });

    const startedAt = clock();
    const outcomes: MutantOutcome[] = [];
    let stopped = false;
    for (const [i, m] of input.mutants.entries()) {
      const original = input.changed.get(m.path);
      const mutated = original === undefined ? null : applyMutant(original, m);
      if (stopped || mutated === null || clock() - startedAt > MUTATION_BUDGET_MS) {
        outcomes.push({ ...m, result: "not_run", durationMs: null, failingTest: null });
        continue;
      }
      const w = await service.writeFile(actor, sessionId, m.path, mutated);
      if (!w.ok) {
        outcomes.push({ ...m, result: "not_run", durationMs: null, failingTest: null });
        continue;
      }
      const run = await service.runCommand(actor, sessionId, { command, timeoutSeconds: mutantTimeoutSeconds(baselineMs), kind: "check", label: `Mutation trial: mutant ${i + 1}` }, `mutation:${input.id}:m${i}`);
      if (run.ok) {
        computeMs += run.value.durationMs ?? 0;
        outcomes.push({ ...m, ...classifyMutantRun({ state: run.value.state, exitCode: run.value.exitCode, output: `${run.value.stdout}\n${run.value.stderr}` }), durationMs: run.value.durationMs });
      } else {
        outcomes.push({ ...m, result: "not_run", durationMs: null, failingTest: null });
      }
      // The original goes back before the next mutant; if it can't, no later result could be trusted.
      const restored = await service.writeFile(actor, sessionId, m.path, original!);
      if (!restored.ok) stopped = true;
    }
    return end({ status: "done", command, baselineMs, computeMs, mutants: outcomes });
  } catch (err) {
    log("error", "mutation.failed", { run: input.id, error: err instanceof Error ? err.message : String(err) });
    return end({ status: "failed", reason: "Something went wrong on Farbaek's side, so the trial didn't finish.", command, computeMs });
  } finally {
    if (sessionId) await service.stopSession(actor, sessionId).catch(() => undefined);
  }
}
