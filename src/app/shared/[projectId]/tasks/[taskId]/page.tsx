import { ArrowLeftIcon, ClipboardTextIcon, FileTextIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, PageHeader, TaskStateBadge } from "@/components/app/primitives";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadGuestProject } from "@/server/workspace/guest-context";

export const metadata: Metadata = { title: "Task" };

const CHANGE_STATUS = {
  pending: { status: "approval", label: "Waiting for the workspace to review" },
  applied: { status: "done", label: "Applied" },
  discarded: { status: "off", label: "Discarded" },
  blocked: { status: "blocked", label: "Stopped by the workspace's rules" },
} as const;

const PROOF_STATUS = {
  verified: { status: "verified", label: "Checks passed" },
  partially_verified: { status: "attention", label: "Some checks passed" },
  failed: { status: "failed", label: "Checks failed" },
  unverified: { status: "unverified", label: "Not checked yet" },
} as const;

/** A task of a shared project, read-only: its plan, its latest change and whether it was checked. */
export default async function SharedTaskPage({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { projectId, taskId } = await params;
  const guest = await loadGuestProject(projectId);
  if (!guest) notFound();
  const { reader, orgId, project } = guest;
  const loaded = await reader.getTask(orgId, taskId).catch(() => null);
  if (!loaded || loaded.task.projectId !== project.id) notFound();
  const [contract, proposal, proofs] = await Promise.all([
    reader.getContract(orgId, taskId).catch(() => null),
    reader.getLatestProposal(orgId, taskId).catch(() => null),
    reader.listProofPacks(orgId, taskId).catch(() => []),
  ]);
  const proof = proofs[0] ?? null;

  return (
    <div className="grid gap-6">
      <div>
        <Link href={`/shared/${project.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} weight="bold" aria-hidden /> {project.name}
        </Link>
        <div className="mt-3">
          <PageHeader
            title={loaded.task.title}
            description={
              <span className="flex flex-wrap items-center gap-2">
                <TaskStateBadge state={loaded.task.state} /> <span className="text-ink-3">Updated <RelativeTime iso={loaded.task.updatedAt} />.</span>
              </span>
            }
          />
        </div>
      </div>

      <Card>
        <CardTitle icon={ClipboardTextIcon}>Plan</CardTitle>
        {contract ? (
          <div className="mt-3 grid gap-4 text-sm">
            <p className="text-ink">{contract.body.outcome}</p>
            <div>
              <p className="text-xs font-medium text-ink-3">Done when</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
                {contract.body.acceptanceCriteria.map((c) => (
                  <li key={c.id}>{c.statement}</li>
                ))}
              </ul>
            </div>
            {contract.body.protectedInvariants.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-ink-3">Must stay true</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
                  {contract.body.protectedInvariants.map((c) => (
                    <li key={c.id}>{c.statement}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-ink-3">{contract.approvedAt ? <>Approved <RelativeTime iso={contract.approvedAt} />.</> : "Not approved yet."}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-2">No plan yet. The workspace&apos;s people draft and approve one.</p>
        )}
      </Card>

      <Card>
        <CardTitle icon={FileTextIcon}>Latest change</CardTitle>
        {proposal ? (
          <div className="mt-3 grid gap-3 text-sm">
            <StatusBadge status={CHANGE_STATUS[proposal.status].status} label={CHANGE_STATUS[proposal.status].label} />
            <p className="text-ink-2">{proposal.plan.summary}</p>
            {proposal.changes.length > 0 ? (
              <ul className="grid gap-1">
                {proposal.changes.map((c) => (
                  <li key={c.path} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-label break-all">{c.path}</span>
                    <span className="text-xs text-ink-3">{c.kind === "create" ? "new file" : "edited"}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-2">No change has been made for this task yet.</p>
        )}
      </Card>

      <Card>
        <CardTitle icon={SealCheckIcon}>Proof</CardTitle>
        {proof ? (
          <div className="mt-3 grid gap-2 text-sm">
            <StatusBadge status={PROOF_STATUS[proof.status].status} label={PROOF_STATUS[proof.status].label} />
            <p className="text-ink-3">
              Recorded <RelativeTime iso={proof.createdAt} />. Farbaek keeps a ProofPack for each applied change and each check.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-2">Nothing has been checked for this task yet.</p>
        )}
      </Card>
    </div>
  );
}
