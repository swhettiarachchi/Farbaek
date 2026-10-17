import { ArrowCounterClockwiseIcon, ArrowLeftIcon, ClockCounterClockwiseIcon, GitPullRequestIcon, InfoIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApproveContractControl, ContractEditor, ReviseContract } from "@/components/app/contract-editor";
import { ContractView, contractIntact } from "@/components/app/contract-view";
import { CancelTaskControl } from "@/components/app/forms";
import { ChecksList, ExecutionModeBadge } from "@/components/app/execution";
import { ProposeChange } from "@/components/proposals/propose-change";
import { ProofPackCard } from "@/components/proof/proofpack-card";
import { ScopeDriftCard } from "@/components/app/scope-drift-card";
import { scopeDrift } from "@/core/realityloop/scope-drift";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { ProposalReview } from "@/components/proposals/proposal-review";
import { RecoveryPanel } from "@/components/recovery/recovery-panel";
import { RecoveryRecordCard } from "@/components/recovery/recovery-record";
import { checkFeature } from "@/core/billing/entitlements";
import { RECOVERABLE_STATES } from "@/core/realityloop/recovery";
import { RECOVERY_NOT_IN_PLAN, previewRecovery } from "@/server/workspace/recovery";
import { Card, TaskStateBadge } from "@/components/app/primitives";
import { ProofThread } from "@/components/proof/proof-thread";
import { LocalTime } from "@/components/ui/local-time";
import { EMPTY_CONTRACT_FORM, formFromContract } from "@/core/realityloop/contract-form";
import { TASK_STATE_LABELS, lifecycleProgress } from "@/core/realityloop/progress";
import { TERMINAL_STATES, type TaskState } from "@/core/realityloop/task-machine";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";
import { loadAiAvailability } from "@/server/workspace/usage-summary";

export const metadata: Metadata = { title: "Task" };

const ACTOR: Record<"user" | "agent" | "system", string> = { user: "Person", agent: "Agent", system: "Farbaek" };
const CAN_START_CONTRACT: ReadonlySet<TaskState> = new Set(["RECEIVED", "CONTEXT_ASSEMBLED"]);
const CAN_REVISE: ReadonlySet<TaskState> = new Set(["CONTRACT_DRAFTED", "CONTRACT_APPROVED", "BLOCKED"]);

export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const found = await ctx.reader.getTask(ctx.current.id, taskId);
  if (!found) notFound();
  const { task, history } = found;
  const orgId = ctx.current.id;
  const [contract, ai, proposal, proofPacks] = await Promise.all([
    ctx.reader.getContract(orgId, task.id),
    loadAiAvailability(ctx, ctx.current),
    ctx.reader.getLatestProposal(orgId, task.id),
    ctx.reader.listProofPacks(orgId, task.id),
  ]);
  const canPropose = task.state === "CONTRACT_APPROVED";
  const approvedContract = contract?.status === "approved" && contract.approvedAt ? contract : null;
  const driftEvents = approvedContract && !TERMINAL_STATES.has(task.state) ? await ctx.reader.listFileChangesSince(orgId, task.projectId, approvedContract.approvedAt!) : null;
  const drift = approvedContract && driftEvents ? scopeDrift(approvedContract.body, driftEvents) : [];
  const execution = currentExecutionMode();
  const showVerification = task.state === "VERIFYING" || (proposal?.status === "applied" && !TERMINAL_STATES.has(task.state) && !RECOVERABLE_STATES.has(task.state));
  const showProposal = proposal !== null && (proposal.status !== "discarded" || !canPropose);
  const [proposeAi, projectFiles, bases] = await Promise.all([
    canPropose ? loadAiAvailability(ctx, ctx.current, "change_proposal") : Promise.resolve(null),
    canPropose ? ctx.reader.listFiles(orgId, task.projectId) : Promise.resolve([]),
    showProposal
      ? Promise.all(
          proposal!.changes
            .filter((c) => c.kind === "edit")
            .map(async (c) => [c.path, (await ctx.reader.getFileRevision(orgId, task.projectId, c.path, c.baseRevision)) ?? ""] as const),
        ).then((entries) => Object.fromEntries(entries))
      : Promise.resolve({} as Record<string, string>),
  ]);
  const intact = contract ? await contractIntact(contract) : true;
  const writeReason = ctx.writes.enabled ? null : ctx.writes.reason;

  // Recovery: undoing the applied change, while the task's state allows it.
  const applied = proposal?.status === "applied" ? proposal : null;
  const [recoverySource, recoveries] = applied
    ? await Promise.all([ctx.reader.getRecoverySource(orgId, task.projectId, applied), ctx.reader.listRecoveries(orgId, task.id)])
    : [null, []];
  const recovery = applied && recoverySource && RECOVERABLE_STATES.has(task.state) ? await previewRecovery({ taskId: task.id, proposalId: applied.id, source: recoverySource }) : null;
  const previews: Record<string, { current: string; target: string }> = {};
  for (const i of recovery?.items ?? []) {
    if (i.status !== "ready") continue;
    const current = (await ctx.reader.getFileRevision(orgId, task.projectId, i.path, i.fromRevision)) ?? "";
    const target = i.action === "restore" ? ((await ctx.reader.getFileRevision(orgId, task.projectId, i.path, i.toRevision)) ?? "") : "";
    previews[i.path] = { current, target };
  }
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

  const stages = lifecycleProgress(task.state, history);
  const finished = TERMINAL_STATES.has(task.state);
  const cancelReason = !ctx.writes.enabled ? ctx.writes.reason : null;

  return (
    <div className="grid gap-8">
      <div>
        <Link href={`/app/projects/${task.projectId}`} className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> {task.projectName ?? "Project"}
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="max-w-[40ch] text-balance text-[1.6rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2rem]">{task.title}</h1>
          <TaskStateBadge state={task.state} />
        </div>
        <p className="mt-2 text-sm text-ink-3">
          Created <LocalTime iso={task.createdAt} /> · version <span className="tabular">{task.version}</span>
        </p>
      </div>

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

      <Card>
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
        <Card>
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
                appliedNote={appliedNote}
              />
            ) : null}
            {canPropose && proposeAi ? (
              <div className={showProposal ? "border-t border-line pt-6" : ""}>
                {showProposal ? <h3 className="mb-4 text-base font-medium">Propose another change</h3> : null}
                <ProposeChange taskId={task.id} projectId={task.projectId} files={projectFiles.map((f) => ({ path: f.path, sizeBytes: f.sizeBytes }))} ai={proposeAi} />
              </div>
            ) : null}
          </div>
        </Card>
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
            <ChecksList checks={contract?.body.requiredChecks ?? []} mode={execution} />
          </div>
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

      {proofPacks.length ? (
        <Card>
          <h2 className="text-lg font-medium">Evidence</h2>
          <p className="mt-1 text-sm text-ink-2">
            Each applied change is recorded as a ProofPack: an in-toto attestation of what was approved and applied, and what it does and doesn&apos;t prove.
          </p>
          <div className="mt-5 grid gap-6 divide-y divide-line">
            {proofPacks.map((p) => (
              <div key={p.digest} className="pt-6 first:pt-0">
                <ProofPackCard pack={p} />
              </div>
            ))}
          </div>
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
                <p className="text-xs text-ink-3">
                  {ACTOR[h.actorKind]} · <span className="font-mono">{h.eventType}</span> · <LocalTime iso={h.at} />
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
                  ? "The change is applied. Verification needs an isolated runner to run the checks, and none is connected yet, so the task waits here. It is not marked verified. You can undo the change under Recovery."
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
