import { ArrowCounterClockwiseIcon, ArrowLeftIcon, ClockCounterClockwiseIcon, GitPullRequestIcon, HammerIcon, InfoIcon, TerminalWindowIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApproveContractControl, ContractEditor, ReviseContract } from "@/components/app/contract-editor";
import { ContractView, contractIntact } from "@/components/app/contract-view";
import { CancelTaskControl } from "@/components/app/forms";
import { ChecksList, ExecutionModeBadge } from "@/components/app/execution";
import { ProposeChange } from "@/components/proposals/propose-change";
import { StartRun } from "@/components/build/start-run";
import { withheldFor } from "@/core/workspace/permissions";
import { ProofPackCard } from "@/components/proof/proofpack-card";
import { CheckReceiptCard } from "@/components/proof/check-receipt-card";
import { ScopeDriftCard } from "@/components/app/scope-drift-card";
import { scopeDrift } from "@/core/realityloop/scope-drift";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { ProposalReview } from "@/components/proposals/proposal-review";
import { ImpactCard } from "@/components/proposals/impact-card";
import { SecondCheckCard } from "@/components/proposals/second-check-card";
import { secondCheckRecommended } from "@/core/trust/second-check";
import { ArenaPanel } from "@/components/arena/arena-panel";
import { readLatestArenaRun } from "@/server/arena/store";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { RecoveryPanel } from "@/components/recovery/recovery-panel";
import { RecoveryRecordCard } from "@/components/recovery/recovery-record";
import { checkFeature } from "@/core/billing/entitlements";
import { RECOVERABLE_STATES } from "@/core/realityloop/recovery";
import { checksToRun, fallbackChecksWords } from "@/core/realityloop/app-check";
import { RECOVERY_NOT_IN_PLAN, previewRecovery } from "@/server/workspace/recovery";
import { Card, Notice, TaskStateBadge } from "@/components/app/primitives";
import { LiveRefresh } from "@/components/app/live-refresh";
import { VerificationStatus } from "@/components/tasks/verification-status";
import { VerifyNow } from "@/components/tasks/verify-now";
import { verificationState } from "@/core/realityloop/verification";
import { ProofThread } from "@/components/proof/proof-thread";
import { LocalTime } from "@/components/ui/local-time";
import { EMPTY_CONTRACT_FORM, formFromContract } from "@/core/realityloop/contract-form";
import { TASK_STATE_LABELS, lifecycleProgress } from "@/core/realityloop/progress";
import { TERMINAL_STATES, type TaskState } from "@/core/realityloop/task-machine";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";
import { loadAiAvailability } from "@/server/workspace/usage-summary";
import { FixCard, freeRetryWords } from "@/components/tasks/fix-card";
import { ContextReadinessCard } from "@/components/tasks/context-readiness";
import { CostCard, ReversibilityCard } from "@/components/tasks/task-insights";
import { PullRequestCard } from "@/components/github/pull-request-card";
import { TaskModeControl } from "@/components/tasks/task-mode";
import { TaskNotesCard } from "@/components/tasks/task-notes";
import { MODE_INFO, MODE_REFUSALS, noteKindFor } from "@/core/realityloop/modes";
import { readTaskNotes } from "@/server/workspace/task-notes";
import { loadTaskGitHub } from "@/server/github/store";
import { taskCost } from "@/core/insights/cost-brain";
import { reversibilityRadar } from "@/core/insights/reversibility";
import { workspaceGrant } from "@/server/workspace/organizations";
import { loadPassport } from "@/server/workspace/context-readiness";
import { FIXABLE_STATES, fixIsOpen } from "@/server/workspace/fixes";
import { FailureFuturesCard } from "@/components/failure-futures/failure-futures-card";
import { FAILURE_KINDS, LAB_MANIFESTS, labRunner, suggestFailureFutures, testFramework, withIncidents } from "@/core/realityloop/failure-futures";
import { readIncidentMemories } from "@/server/failure-futures/incidents";
import { readFailureTrials } from "@/server/failure-futures/store";
import { MutationCard } from "@/components/mutation/mutation-card";
import { MUTATION_MAX, planMutants } from "@/core/realityloop/mutation";
import { NO_TEST_RUNNER } from "@/server/mutation/runner";
import { readLatestMutationRun } from "@/server/mutation/store";
import { HandoffCard } from "@/components/tasks/handoff-card";
import { readHandoffs } from "@/server/agent/handoffs";

export const metadata: Metadata = { title: "Task" };

const ACTOR: Record<"user" | "agent" | "system", string> = { user: "By a person", agent: "By the agent", system: "By Farbaek" };
const CAN_START_CONTRACT: ReadonlySet<TaskState> = new Set(["RECEIVED", "CONTEXT_ASSEMBLED"]);
const CAN_REVISE: ReadonlySet<TaskState> = new Set(["CONTRACT_DRAFTED", "CONTRACT_APPROVED", "BLOCKED"]);

export default async function TaskPage({ params, searchParams }: { params: Promise<{ taskId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { taskId } = await params;
  const sp = await searchParams;
  const fixError = typeof sp.fix_error === "string" ? sp.fix_error.slice(0, 160) : null;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const found = await ctx.reader.getTask(ctx.current.id, taskId);
  if (!found) notFound();
  const { task, history } = found;
  const orgId = ctx.current.id;
  const [contract, ai, proposal, proofPacks, checkRuns] = await Promise.all([
    ctx.reader.getContract(orgId, task.id),
    loadAiAvailability(ctx, ctx.current),
    ctx.reader.getLatestProposal(orgId, task.id),
    ctx.reader.listProofPacks(orgId, task.id),
    ctx.reader.listCheckReceipts(orgId, task.id),
  ]);
  const canPropose = task.state === "CONTRACT_APPROVED";
  const approvedContract = contract?.status === "approved" && contract.approvedAt ? contract : null;
  const execution = currentExecutionMode();
  // This request's time; a server component renders once per request.
  const renderedAt = new Date().getTime();
  const showVerification = task.state === "VERIFYING" || (proposal?.status === "applied" && !TERMINAL_STATES.has(task.state) && !RECOVERABLE_STATES.has(task.state));
  const showProposal = proposal !== null && (proposal.status !== "discarded" || !canPropose);
  const applied = proposal?.status === "applied" ? proposal : null;
  // Everything below depends only on the reads above, so it loads in one round.
  const [driftEvents, proposeAi, projectFiles, bases, intact, [recoverySource, recoveries], agents, lensSuggestion, lensAi, verification, project, secondCheck, secondCheckAi, usage, sandboxes] = await Promise.all([
    approvedContract && !TERMINAL_STATES.has(task.state) ? ctx.reader.listFileChangesSince(orgId, task.projectId, approvedContract.approvedAt!) : Promise.resolve(null),
    canPropose ? loadAiAvailability(ctx, ctx.current, "change_proposal") : Promise.resolve(null),
    canPropose || task.state === "VERIFYING" || task.state === "APPROVAL_PENDING" ? ctx.reader.listFiles(orgId, task.projectId) : Promise.resolve([]),
    showProposal
      ? Promise.all(
          proposal!.changes
            .filter((c) => c.kind === "edit")
            .map(async (c) => [c.path, (await ctx.reader.getFileRevision(orgId, task.projectId, c.path, c.baseRevision)) ?? ""] as const),
        ).then((entries) => Object.fromEntries(entries))
      : Promise.resolve({} as Record<string, string>),
    contract ? contractIntact(contract) : Promise.resolve(true),
    // Recovery: undoing the applied change, while the task's state allows it.
    applied ? Promise.all([ctx.reader.getRecoverySource(orgId, task.projectId, applied), ctx.reader.listRecoveries(orgId, task.id)]) : Promise.resolve([null, []] as const),
    showProposal && proposal!.agentId ? ctx.reader.listAgents(orgId) : Promise.resolve([]),
    // The Intent Diff Lens's AI mapping on a pending proposal (ADR 0044).
    showProposal && proposal!.status === "pending" ? ctx.reader.getLensSuggestion(orgId, proposal!.id).catch(() => null) : Promise.resolve(null),
    showProposal && proposal!.status === "pending" ? loadAiAvailability(ctx, ctx.current, "lens_mapping") : Promise.resolve(null),
    // The latest one-step check run of the applied change (ADR 0047).
    task.state === "VERIFYING" ? ctx.reader.getLatestVerification(orgId, task.id).catch(() => null) : Promise.resolve(null),
    // An archived project stays readable, but the database refuses any change to it.
    ctx.reader.getProject(orgId, task.projectId).catch(() => null),
    // The second check (ADR 0121): kept after the change is decided, asked for only while it waits.
    showProposal ? ctx.reader.getSecondCheck(orgId, proposal!.id).catch(() => null) : Promise.resolve(null),
    showProposal && proposal!.status === "pending" ? loadAiAvailability(ctx, ctx.current, "second_check") : Promise.resolve(null),
    // The Cost Brain (ADR 0122): this task's usage ledger and sandbox time, read as the person.
    ctx.reader.listTaskUsage(orgId, task.id).catch(() => []),
    ctx.reader.listTaskSandboxes(orgId, task.id).catch(() => []),
  ]);
  const grant = ctx.current.billingUnknown ? null : workspaceGrant(ctx.current, new Date(renderedAt));
  const cost = taskCost(usage, sandboxes, grant?.units ?? null);
  // Fixing what failed checks found (ADR 0101): the fix started for this task, and the task this one fixes.
  const fixable = FIXABLE_STATES.has(task.state) && approvedContract !== null;
  const [fix, fixSource] = await Promise.all([
    fixable ? ctx.reader.getFixFor(orgId, task.id).catch(() => null) : Promise.resolve(null),
    task.fixOf ? ctx.reader.getTask(orgId, task.fixOf).then((r) => r?.task ?? null).catch(() => null) : Promise.resolve(null),
  ]);
  const retryIncluded = (ctx.current.plan.limits.retryUnitsPerMonth ?? 0) > 0;
  // Context Readiness (ADR 0116), while the task's work is still ahead of it.
  const passport = TERMINAL_STATES.has(task.state) ? null : await loadPassport(ctx.reader, orgId, task.id).catch(() => null);
  const drift = approvedContract && driftEvents ? scopeDrift(approvedContract.body, driftEvents) : [];
  const archived = Boolean(project?.archivedAt);
  // Every control that changes the task's work names why it can't; cancelling stays available.
  const writeReason = (ctx.writes.enabled ? null : ctx.writes.reason) ?? (archived ? "This project is archived, so nothing in it can change." : null);

  const recovery = applied && recoverySource && RECOVERABLE_STATES.has(task.state) ? await previewRecovery({ taskId: task.id, proposalId: applied.id, source: recoverySource }) : null;
  const previews: Record<string, { current: string; target: string }> = Object.fromEntries(
    await Promise.all(
      (recovery?.items ?? []).flatMap((i) =>
        i.status === "ready"
          ? [
              Promise.all([
                ctx.reader.getFileRevision(orgId, task.projectId, i.path, i.fromRevision),
                i.action === "restore" ? ctx.reader.getFileRevision(orgId, task.projectId, i.path, i.toRevision) : Promise.resolve(""),
              ]).then(([current, target]) => [i.path, { current: current ?? "", target: target ?? "" }] as const),
            ]
          : [],
      ),
    ),
  );
  // Impact analysis (ADR 0085): Max 2x and up; the demo shows it on its sample files.
  const impactFeature = checkFeature(ctx.current.billingUnknown ? null : ctx.current.plan, "impact_analysis");
  const impactReason = ctx.mode === "demo" || impactFeature.allowed ? null : impactFeature.code === "FEATURE_NOT_IN_PLAN" ? "Impact analysis is included in Max 2x and up." : impactFeature.message;
  const recoveryFeature = checkFeature(ctx.current.billingUnknown ? null : ctx.current.plan, "replay_and_recovery");
  const isManager = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const recoveryReason =
    writeReason ??
    (recoveryFeature.allowed ? null : recoveryFeature.code === "FEATURE_NOT_IN_PLAN" ? RECOVERY_NOT_IN_PLAN : recoveryFeature.message) ??
    (ctx.role === null || !CONTRIBUTOR_ROLES.includes(ctx.role) ? "Viewers can't undo changes. Ask a member, admin or owner." : null) ??
    ((recovery?.policy.outcome === "ESCALATE" || applied?.policy?.outcome === "ESCALATE") && !isManager
      ? "Undoing this change touches sensitive files, so an owner or admin has to approve it."
      : null);
  const appliedNote =
    task.state === "RECOVERED"
      ? "Undone: the files are back at their versions from before this change. See Recovery below."
      : RECOVERABLE_STATES.has(task.state) && task.state !== "VERIFYING"
        ? "Not verified: its checks didn't run before the undo started. See Recovery below."
        : undefined;

  // What a verification runs: the plan's checks, or when it lists none, Farbaek's site check for a static site or the app's own build and tests (ADR 0054, ADR 0058).
  const planChecks = contract?.body.requiredChecks ?? [];
  const manifest =
    (task.state === "VERIFYING" || task.state === "APPROVAL_PENDING") && planChecks.length === 0 && projectFiles.some((f) => f.path === "package.json")
      ? await ctx.reader.getFile(orgId, task.projectId, "package.json")
      : null;
  const checksForRun = checksToRun(planChecks, projectFiles.map((f) => f.path), (p) => (p === "package.json" ? (manifest?.content ?? null) : null));
  const requiredChecks = checksForRun.length;
  const fallback = planChecks.length === 0 && requiredChecks > 0 ? fallbackChecksWords(checksForRun) : null;
  const siteCheck = fallback?.kind === "site";
  const checking = verification !== null && verificationState(verification, new Date(renderedAt)) === "running";
  // The Future-State Arena on a change waiting for review (ADR 0076).
  const trying = showProposal && proposal!.status === "pending";
  const arenaClient = trying && ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const arenaRun = arenaClient ? await readLatestArenaRun(arenaClient, orgId, proposal!.id).catch(() => null) : null;
  const arenaReason =
    (ctx.mode === "demo" ? "The demo workspace is read-only." : null) ??
    writeReason ??
    (execution.mode === "review_only" ? execution.reason : null) ??
    (ctx.role === null || !CONTRIBUTOR_ROLES.includes(ctx.role) ? "Viewers can't try changes. Ask a member, admin or owner." : null) ??
    withheldFor(ctx.role, ctx.permissions, "run_agents") ??
    (checksForRun.length === 0 ? "The contract lists no checks, and Farbaek has none for this kind of project." : null);
  // The Failure Futures Lab (ADR 0135) on the same change: scenarios from the lines it adds.
  const added = trying ? proposal!.changes.map((c) => ({ path: c.path, content: c.content, before: c.kind === "edit" ? (bases[c.path] ?? null) : null })) : [];
  // Past incidents in the project work in the scenarios they name (ADR 0145).
  const incidents = arenaClient && added.length > 0 ? await readIncidentMemories(arenaClient, orgId, task.projectId).catch(() => []) : [];
  const futures = withIncidents(suggestFailureFutures(added, FAILURE_KINDS.length), added, incidents);
  // Mutation trials (ADR 0136) on the same lines.
  const mutants = planMutants(added, MUTATION_MAX);
  const [failureTrials, failureAi, labFiles, mutationRun] =
    futures.length > 0 || mutants.length > 0
      ? await Promise.all([
          arenaClient && futures.length > 0 ? readFailureTrials(arenaClient, orgId, proposal!.id).catch(() => []) : Promise.resolve([]),
          futures.length > 0 ? loadAiAvailability(ctx, ctx.current, "failure_test") : Promise.resolve(null),
          Promise.all(LAB_MANIFESTS.map(async (p) => [p, proposal!.changes.find((c) => c.path === p)?.content ?? (await ctx.reader.getFile(orgId, task.projectId, p).catch(() => null))?.content ?? null] as const)),
          arenaClient && mutants.length > 0 ? readLatestMutationRun(arenaClient, orgId, proposal!.id).catch(() => null) : Promise.resolve(null),
        ])
      : [[], null, [], null];
  const labRead = (p: string) => labFiles.find(([path]) => path === p)?.[1] ?? null;
  const labPaths = [...new Set([...projectFiles.map((f) => f.path), ...(proposal?.changes.map((c) => c.path) ?? [])])];
  const labRun = futures.length > 0 ? labRunner(futures[0]!.kind, futures[0]!.evidence[0]!, labPaths, labRead) : null;
  const mutationReason =
    (ctx.mode === "demo" ? "The demo workspace is read-only." : null) ??
    writeReason ??
    (execution.mode === "review_only" ? execution.reason : null) ??
    (ctx.role === null || !CONTRIBUTOR_ROLES.includes(ctx.role) ? "Viewers can't run mutation trials. Ask a member, admin or owner." : null) ??
    withheldFor(ctx.role, ctx.permissions, "run_agents") ??
    (mutants.length > 0 && !testFramework(mutants[0]!.path, labRead) ? NO_TEST_RUNNER : null);
  const failureReason =
    (ctx.mode === "demo" ? "The demo workspace is read-only." : null) ??
    writeReason ??
    (execution.mode === "review_only" ? execution.reason : null) ??
    (ctx.role === null || !CONTRIBUTOR_ROLES.includes(ctx.role) ? "Viewers can't try failures. Ask a member, admin or owner." : null) ??
    withheldFor(ctx.role, ctx.permissions, "run_agents") ??
    (labRun && !labRun.ok ? labRun.reason : null) ??
    failureAi?.disabledReason ??
    null;
  // Continue on my computer (ADR 0139): any task with an approved contract that isn't finished.
  const handingOff = approvedContract !== null && !TERMINAL_STATES.has(task.state);
  const [computers, handoffs] = handingOff
    ? await Promise.all([
        ctx.reader
          .listAgents(orgId)
          .then((all) => all.filter((a) => !a.revokedAt).map((a) => ({ id: a.id, name: a.name })))
          .catch(() => []),
        ctx.mode === "live" ? createSupabaseServerClient().then((c) => (c ? readHandoffs(c, orgId, task.id) : [])).catch(() => []) : Promise.resolve([]),
      ])
    : [[], []];
  const handoffReason =
    (ctx.mode === "demo" ? "The demo workspace is read-only." : null) ??
    writeReason ??
    (ctx.role === null || !CONTRIBUTOR_ROLES.includes(ctx.role) ? "Viewers can't hand tasks to a computer. Ask a member, admin or owner." : null) ??
    withheldFor(ctx.role, ctx.permissions, "run_agents");
  const verifyReason =
    writeReason ??
    (execution.mode === "review_only" ? execution.reason : null) ??
    (ctx.role === null || !CONTRIBUTOR_ROLES.includes(ctx.role) ? "Viewers can't run checks. Ask a member, admin or owner." : null);

  const fixReason =
    (ctx.mode === "demo" ? "The demo workspace is read-only." : null) ??
    writeReason ??
    (ctx.role === null || !CONTRIBUTOR_ROLES.includes(ctx.role) ? "Viewers can't start a fix. Ask a member, admin or owner." : null) ??
    withheldFor(ctx.role, ctx.permissions, "run_agents");
  // GitHub (ADR 0126): the applied change's pull request, read as the person.
  const githubClient = applied && ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const github = applied && githubClient ? await loadTaskGitHub(githubClient, orgId, task.projectId, applied.id) : null;
  const githubReason =
    (ctx.mode === "demo" ? "The demo workspace isn't connected to GitHub." : null) ??
    writeReason ??
    (ctx.role === null || !CONTRIBUTOR_ROLES.includes(ctx.role) ? "Viewers can't open pull requests." : null) ??
    withheldFor(ctx.role, ctx.permissions, "publish") ??
    (github?.connected ? null : "GitHub isn't connected. An owner or admin can connect it in Settings.") ??
    (github?.pull || github?.link ? null : "This project isn't linked to a repository yet.");
  // Operating modes (ADR 0131): Learn and Audit change nothing; they get notes instead.
  const mode = task.mode ?? "build";
  const noteKind = noteKindFor(mode);
  const modeBlocks = MODE_INFO[mode].changes ? null : MODE_REFUSALS.MODE_NO_CHANGES;
  const modeReason =
    (ctx.mode === "demo" ? "The demo workspace is read-only." : null) ??
    writeReason ??
    (ctx.role === null || !CONTRIBUTOR_ROLES.includes(ctx.role) ? "Viewers can't change a task's mode." : null) ??
    (proposal?.status === "pending" ? "A change is waiting for review. Apply or discard it first." : null);
  const notesClient = noteKind && ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const [notes, noteAi] = noteKind
    ? await Promise.all([notesClient ? readTaskNotes(notesClient, orgId, task.id).catch(() => []) : Promise.resolve([]), loadAiAvailability(ctx, ctx.current, "task_note")])
    : [[], null];
  const stages = lifecycleProgress(task.state, history);
  const finished = TERMINAL_STATES.has(task.state);
  const cancelReason = !ctx.writes.enabled ? ctx.writes.reason : null;

  return (
    <div className="grid gap-8">
      <div>
        <Link href={`/app/projects/${task.projectId}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> {task.projectName ?? "Project"}
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="max-w-[40ch] text-balance text-[1.6rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2rem]">{task.title}</h1>
          <TaskStateBadge state={task.state} />
        </div>
        <p className="mt-2 text-sm text-ink-3">
          Created <LocalTime iso={task.createdAt} />. Version <span className="tabular">{task.version}</span>
        </p>
        {fixSource ? (
          <div className="mt-4">
            <Notice>
              This task fixes what failed in{" "}
              <Link href={`/app/tasks/${fixSource.id}`} className="font-medium text-accent underline-offset-4 hover:underline">
                {fixSource.title}
              </Link>
              . {freeRetryWords(retryIncluded)}
            </Notice>
          </div>
        ) : null}
        {archived ? (
          <div className="mt-4">
            <Notice>This task&apos;s project is archived. Everything here stays readable, and nothing in it can change. You can still cancel the task.</Notice>
          </div>
        ) : null}
      </div>

      <Card>
        <h2 className="text-lg font-medium">Mode</h2>
        <div className="mt-3">
          <TaskModeControl taskId={task.id} mode={mode} disabledReason={modeReason} />
        </div>
      </Card>

      {noteKind ? (
        <Card>
          <h2 className="text-lg font-medium">{noteKind === "explanation" ? "Explanations" : "Audit reports"}</h2>
          <p className="mt-1 mb-4 text-sm text-ink-2">
            {noteKind === "explanation" ? "What this part of the project does, and the decisions and trade-offs behind it." : "What's there, what looks risky, and what a careful reviewer would want to know."}
          </p>
          <TaskNotesCard taskId={task.id} kind={noteKind} notes={notes} disabledReason={(ctx.mode === "demo" ? "The demo workspace is read-only." : null) ?? writeReason ?? noteAi?.disabledReason ?? null} />
        </Card>
      ) : null}

      {fixable ? <FixCard taskId={task.id} fix={fix} open={fixIsOpen(fix)} retryIncluded={retryIncluded} disabledReason={fixReason} error={fixError} /> : null}

      <Card>
        <h2 className="text-lg font-medium">Lifecycle</h2>
        <p className="mt-1 text-sm text-ink-2">A stage turns solid only when the task has actually passed it.</p>
        <div className="mt-6">
          <ProofThread
            label="Task lifecycle"
            stages={stages.map((s) => ({ key: s.key, label: s.label, body: "", status: s.status, statusText: s.note }))}
          />
        </div>
      </Card>

      {passport ? <ContextReadinessCard passport={passport} taskId={task.id} /> : null}

      <Card id="contract" className="scroll-mt-24">
        <h2 className="text-lg font-medium">Intent contract</h2>
        <p className="mt-1 text-sm text-ink-2">
          The agreement this task works against. Each version is validated, hashed and kept. Approval covers one exact version.
        </p>
        <div className="mt-6">
          {contract ? (
            <div className="grid gap-6">
              <ContractView record={contract} />
              {contract.status === "draft" && task.state === "CONTRACT_DRAFTED" ? (
                <ApproveContractControl
                  taskId={task.id}
                  taskVersion={task.version}
                  version={contract.version}
                  sha256={contract.sha256}
                  disabledReason={writeReason ?? (intact ? null : "The stored hash doesn't match, so this version can't be approved.")}
                />
              ) : null}
              {CAN_REVISE.has(task.state) ? (
                <ReviseContract taskId={task.id} taskVersion={task.version} basedOn={contract.version} initial={formFromContract(contract.body)} disabledReason={writeReason} ai={ai} />
              ) : null}
            </div>
          ) : CAN_START_CONTRACT.has(task.state) ? (
            <ContractEditor
              taskId={task.id}
              taskVersion={task.version}
              basedOn={0}
              initial={{ ...EMPTY_CONTRACT_FORM, outcome: task.title }}
              disabledReason={writeReason}
              ai={ai}
              submitLabel="Save contract version 1"
            />
          ) : (
            <p className="text-sm text-ink-3">No contract was recorded for this task.</p>
          )}
        </div>
      </Card>

      {approvedContract && driftEvents ? <ScopeDriftCard approvedAt={approvedContract.approvedAt!} changes={driftEvents.length} findings={drift} /> : null}

      {canPropose || showProposal ? (
        <Card id="change" className="scroll-mt-24">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <GitPullRequestIcon size={20} className="text-ink-3" aria-hidden /> Change
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            The agent proposes targeted edits under the approved contract. You review every file as a diff, and nothing is applied until you approve the exact content.
          </p>
          <div className="mt-6 grid gap-8">
            {showProposal ? (
              <ProposalReview
                projectId={task.projectId}
                proposal={proposal!}
                bases={bases}
                invariants={contract?.body.protectedInvariants.map((i) => i.statement) ?? []}
                disabledReason={writeReason}
                executionReason={execution.mode === "review_only" ? execution.reason : null}
                canApproveEscalated={isManager}
                approvalWithheldReason={withheldFor(ctx.role, ctx.permissions, "approve")}
                appliedNote={appliedNote}
                agentName={proposal!.agentId ? (agents.find((a) => a.id === proposal!.agentId)?.name ?? null) : null}
                contract={contract?.body ?? null}
                serverNow={renderedAt}
                lensSuggestion={lensSuggestion}
                lensAiReason={lensAi?.disabledReason ?? null}
                checksOnApply={checksForRun.length > 0}
              />
            ) : null}
            {showProposal ? (
              <SecondCheckCard
                proposalId={proposal!.id}
                initial={secondCheck}
                pending={proposal!.status === "pending"}
                recommended={secondCheckRecommended(proposal!.policy)}
                disabledReason={ctx.mode === "demo" ? "The demo workspace is read-only." : (secondCheckAi?.disabledReason ?? null)}
              />
            ) : null}
            {showProposal ? <ReversibilityCard {...reversibilityRadar(proposal!.changes, bases)} /> : null}
            {showProposal ? <ImpactCard taskId={task.id} disabledReason={impactReason} /> : null}
            {trying ? <ArenaPanel proposalId={proposal!.id} taskId={task.id} checks={checksForRun} run={arenaRun} disabledReason={arenaReason} /> : null}
            {trying ? <FailureFuturesCard proposalId={proposal!.id} taskId={task.id} futures={futures} trials={failureTrials} disabledReason={failureReason} /> : null}
            {trying ? <MutationCard proposalId={proposal!.id} taskId={task.id} planned={mutants} run={mutationRun} disabledReason={mutationReason} /> : null}
            {handingOff ? <HandoffCard taskId={task.id} computers={computers} handoffs={handoffs} disabledReason={handoffReason} /> : null}
            {canPropose ? (
              <div className={`grid gap-3 rounded-md border border-accent/30 bg-accent/[0.04] p-5 ${showProposal ? "mt-2" : ""}`}>
                <h3 className="flex items-center gap-2 text-base font-medium">
                  <HammerIcon size={18} weight="bold" className="text-accent" aria-hidden /> Let the agent build it
                </h3>
                <p className="text-sm leading-relaxed text-ink-2">
                  The Farbaek Agent works through the whole contract in the cloud: it reads the project, makes the changes and runs the checks, then hands you a proposal to review.
                </p>
                <StartRun taskId={task.id} disabledReason={writeReason ?? modeBlocks ?? withheldFor(ctx.role, ctx.permissions, "run_agents")} />
              </div>
            ) : null}
            {canPropose && proposeAi && !modeBlocks ? (
              <div className={showProposal ? "border-t border-line pt-6" : ""}>
                <h3 className="mb-4 text-base font-medium">{showProposal ? "Propose another change" : "Or propose one change from chosen files"}</h3>
                <ProposeChange taskId={task.id} projectId={task.projectId} files={projectFiles.map((f) => ({ path: f.path, sizeBytes: f.sizeBytes }))} ai={proposeAi} />
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <CostCard cost={cost} period={grant ? (grant.kind === "trial" ? "trial" : "month") : null} />
      </Card>

      {applied ? (
        <PullRequestCard
          projectId={task.projectId}
          proposalId={applied.id}
          pull={github?.pull ?? null}
          repo={github?.link ? `${github.link.owner}/${github.link.repo}` : null}
          openReason={githubReason}
        />
      ) : null}

      {showVerification ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Verification</h2>
            <ExecutionModeBadge mode={execution} />
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {execution.mode === "review_only"
              ? `${execution.reason} The task stays here, not verified, until its checks run and pass.`
              : "The contract's required checks run in the sandbox against the applied revisions."}
          </p>
          <div className="mt-4">
            <ChecksList checks={task.state === "VERIFYING" ? checksForRun : planChecks} mode={execution} />
          </div>
          {task.state === "VERIFYING" && requiredChecks > 0 ? (
            <div className="mt-5 grid gap-4 border-t border-line pt-5">
              {verification ? <VerificationStatus verification={verification} viewerId={ctx.user.id} now={new Date(renderedAt)} /> : null}
              <LiveRefresh active={checking} everyMs={3_000} />
              {checking ? null : (
                <>
                  {siteCheck ? (
                    <p className="max-w-[65ch] text-sm text-ink-2">
                      The plan lists no checks, so Farbaek checks the site itself: every page&apos;s links, scripts, styles and images lead to files in the project, each page
                      has a title, a language and a phone viewport, and images have alt text. It runs in a fresh sandbox against exactly the applied files, and the task is
                      marked verified only if nothing is wrong. It uses sandbox time from your plan.
                    </p>
                  ) : fallback ? (
                    <p className="max-w-[65ch] text-sm text-ink-2">
                      {fallback.text} A fresh sandbox gets exactly the applied files, installs the packages without running their install scripts, runs{" "}
                      {requiredChecks === 1 ? "it" : "them"} and stops. The task is marked verified only when every one passes, and the run leaves a receipt below. It uses
                      sandbox time from your plan.
                    </p>
                  ) : (
                    <p className="max-w-[65ch] text-sm text-ink-2">
                      One step: a sandbox starts with this project&apos;s files, installs its packages if it has any, runs the{" "}
                      {requiredChecks === 1 ? "check" : `${requiredChecks} checks`}, then stops. The task is marked verified only when every check passes, and the run leaves a
                      receipt below. It uses sandbox time from your plan.
                    </p>
                  )}
                  <VerifyNow
                    taskId={task.id}
                    disabledReason={verifyReason}
                    label={siteCheck ? (verification && verification.status !== "running" ? "Check the site again" : "Check the site now") : verification && verification.status !== "running" ? "Run the checks again" : "Run the checks now"}
                  />
                  {verifyReason ? null : (
                    <p className="text-sm text-ink-3">
                      Need to install something by hand first?{" "}
                      <Link href={`/app/sandbox/new?project=${task.projectId}&task=${task.id}`} className="inline-flex min-h-11 items-center gap-1 font-medium text-accent hover:underline sm:min-h-0">
                        <TerminalWindowIcon size={15} aria-hidden /> Open a sandbox yourself
                      </Link>
                    </p>
                  )}
                </>
              )}
            </div>
          ) : task.state === "VERIFYING" ? (
            // No checks to run, and nothing Farbaek can check on its own: say so, and what can be done.
            <div className="mt-5 grid gap-2 border-t border-line pt-5 text-sm text-ink-2">
              <p className="max-w-[65ch]">
                The plan lists no checks, so nothing can verify this change, and it stays not verified. The change itself is applied: its files are in the project.
              </p>
              <p className="max-w-[65ch]">
                To have changes like this verified, describe how to check them when you start the next build (for example &quot;run the tests&quot;), and they go into its
                plan. Or undo this change below.
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {recovery || recoveries.length ? (
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <ArrowCounterClockwiseIcon size={20} className="text-ink-3" aria-hidden /> Recovery
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            Undo the applied change, file by file. Each file goes back to its version from before the change. A file that changed since is left as it is, so newer work is never overwritten.
          </p>
          <div className="mt-6 grid gap-8">
            {recovery && applied ? (
              <RecoveryPanel
                projectId={task.projectId}
                proposalId={applied.id}
                items={recovery.items}
                planSha256={recovery.planSha256}
                policy={{ outcome: recovery.policy.outcome, findings: recovery.policy.findings }}
                previews={previews}
                disabledReason={recoveryReason}
              />
            ) : null}
            {recoveries.length ? (
              <div className={recovery ? "border-t border-line pt-6" : ""}>
                <h3 className="mb-4 text-base font-medium">Recorded recoveries</h3>
                <div className="grid gap-6 divide-y divide-line">
                  {recoveries.map((r) => (
                    <div key={r.id} className="pt-6 first:pt-0">
                      <RecoveryRecordCard record={r} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {proofPacks.length || checkRuns.length ? (
        <Card>
          <h2 className="text-lg font-medium">Evidence</h2>
          <p className="mt-1 text-sm text-ink-2">
            Each applied change is recorded as a ProofPack: an in-toto attestation of what was approved and applied, and what it does and doesn&apos;t prove. Each run of
            the contract&apos;s checks in a sandbox leaves a receipt with the real exit codes.
          </p>
          {checkRuns.length ? (
            <div className="mt-5">
              <h3 className="text-base font-medium">Check runs</h3>
              <div className="mt-4 grid gap-6 divide-y divide-line">
                {checkRuns.map((r) => (
                  <div key={r.digest} className="pt-6 first:pt-0">
                    <CheckReceiptCard receipt={r} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {proofPacks.length ? (
            <div className={checkRuns.length ? "mt-8 border-t border-line pt-6" : "mt-5"}>
              {checkRuns.length ? <h3 className="mb-4 text-base font-medium">ProofPacks</h3> : null}
              <div className="grid gap-6 divide-y divide-line">
                {proofPacks.map((p) => (
                  <div key={p.digest} className="pt-6 first:pt-0">
                    <ProofPackCard pack={p} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <ClockCounterClockwiseIcon size={20} className="text-ink-3" aria-hidden /> History
          </h2>
          <ol className="mt-4 grid gap-0">
            <li className="relative border-l border-line pb-5 pl-5">
              <span aria-hidden className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-line-strong" />
              <p className="text-[15px]">Task received</p>
              <p className="text-xs text-ink-3">
                <LocalTime iso={task.createdAt} />
              </p>
            </li>
            {history.map((h, i) => (
              <li key={h.eventId} className={`relative pl-5 ${i < history.length - 1 ? "border-l border-line pb-5" : "border-l border-transparent"}`}>
                <span aria-hidden className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-accent" />
                <p className="text-[15px]">
                  {TASK_STATE_LABELS[h.from]} <span className="text-ink-3">to</span> {TASK_STATE_LABELS[h.to]}
                </p>
                <p className="text-xs text-ink-3" title={`Event: ${h.eventType}`}>
                  {ACTOR[h.actorKind]}, <LocalTime iso={h.at} />
                </p>
              </li>
            ))}
          </ol>
          {history.length === 0 ? <p className="mt-2 text-sm text-ink-3">No changes yet.</p> : null}
        </Card>

        <div className="grid gap-6">
          <Card>
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <InfoIcon size={20} className="text-info" aria-hidden /> What happens next
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              {CAN_START_CONTRACT.has(task.state) || task.state === "CONTRACT_DRAFTED"
                ? "Write the intent contract, or draft it with AI and review it, then approve the exact version. Once it's approved, you can ask the agent to propose a change."
                : task.state === "CONTRACT_APPROVED"
                  ? "The contract is approved. Choose the files the change needs and ask the agent for a proposal, or edit the files yourself."
                  : task.state === "APPROVAL_PENDING"
                  ? showProposal
                    ? "A proposed change is waiting for your review. Accept or reject each chunk, then approve the exact content, or discard it."
                    : "This task's plan is waiting for a person's approval."
                  : task.state === "BLOCKED"
                  ? showProposal
                    ? "The last proposal broke the contract. Revise the contract, or discard the proposal and try again."
                    : "A check blocked this task's plan. Revise the contract to continue."
                  : task.state === "VERIFYING"
                  ? execution.mode === "sandboxed"
                    ? checking
                      ? "The change is applied and its checks are running in a sandbox now. The task is marked verified only when they all pass. You can also undo the change under Recovery."
                      : "The change is applied. Run its checks from the Verification card; the task is marked verified only when they all pass. You can also undo the change under Recovery."
                    : "The change is applied. Verification needs an isolated runner to run the checks, and none is connected yet, so the task waits here. It is not marked verified. You can undo the change under Recovery."
                  : task.state === "RECOVERY_PENDING"
                  ? "Part of the change is undone. Undo the rest under Recovery, or put the remaining files back yourself and then finish the recovery."
                  : task.state === "INTERRUPTED" || task.state === "FAILED"
                  ? "Verification stopped. Undo the change under Recovery, or stop the task."
                  : task.state === "RECOVERED"
                  ? "The change was undone, and every file was checked against its earlier version. This task is finished. Its history stays as a record."
                  : finished
                  ? "This task is finished. Its history stays as a record."
                  : "This task moves forward only through the lifecycle: each step is checked by the state machine and recorded above."}
            </p>
          </Card>
          {!finished ? (
            <Card>
              <h2 className="text-lg font-medium">Stop this task</h2>
              <p className="mt-1 text-sm text-ink-2">Cancelling stops future steps. Anything already done elsewhere isn&apos;t undone by this.</p>
              <div className="mt-4">
                <CancelTaskControl taskId={task.id} version={task.version} disabledReason={cancelReason} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
