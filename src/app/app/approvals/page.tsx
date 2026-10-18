import { ArrowRightIcon, CheckSquareOffsetIcon, ShieldWarningIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { RelativeTime } from "@/components/ui/local-time";
import { OUTCOME_LABELS } from "@/core/trust/policy";
import type { PolicyOutcome } from "@/core/billing/usage";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const orgId = ctx.current.id;
  const waiting = (await ctx.reader.listTasks(orgId)).filter((t) => t.state === "APPROVAL_PENDING");
  const proposals = await Promise.all(waiting.map((t) => ctx.reader.getLatestProposal(orgId, t.id)));
  const canApproveEscalated = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Approvals"
        description="Changes waiting for a person. Open one to review each file as a diff, then approve the exact content or discard it."
      />
      {waiting.length === 0 ? (
        <EmptyState icon={CheckSquareOffsetIcon} title="Nothing waiting for you">
          Approvals appear when the agent proposes a change under an approved contract. Every change needs a person at autonomy level 0.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {waiting.map((t, i) => {
            const p = proposals[i];
            const outcome = p?.policy?.outcome as PolicyOutcome | undefined;
            const escalated = outcome === "ESCALATE";
            return (
              <li key={t.id}>
                <Link href={`/app/tasks/${t.id}`} className="group flex flex-col gap-2 rounded-md border border-line bg-surface p-4 shadow-e1 hover:shadow-e2 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium group-hover:text-accent">{t.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {t.projectName ?? "Project"} · {p ? `${p.changes.length} ${p.changes.length === 1 ? "file" : "files"}` : "no proposal on record"} · waiting since{" "}
                      <RelativeTime iso={t.updatedAt} />
                    </span>
                  </span>
                  {outcome ? (
                    <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs ${escalated ? "text-approval" : "text-ink-2"}`}>
                      {escalated ? <ShieldWarningIcon size={14} aria-hidden /> : null}
                      {OUTCOME_LABELS[outcome] ?? outcome}
                      {escalated && !canApproveEscalated ? " (you can review, not approve)" : ""}
                    </span>
                  ) : null}
                  <ArrowRightIcon size={14} className="hidden shrink-0 text-ink-3 sm:block" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
