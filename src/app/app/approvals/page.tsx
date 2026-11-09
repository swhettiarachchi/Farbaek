import { approvalsOrder } from "@/core/realityloop/needs-you";
import { ArrowRightIcon, CheckSquareOffsetIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { WalletCard, type WalletCardData } from "@/components/approvals/wallet-card";
import { ButtonLink } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusGlyph } from "@/components/ui/status-badge";
import { lensForChange, lensSummary } from "@/core/realityloop/intent-lens";
import { walletRisk } from "@/core/trust/approval-wallet";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Approvals" };

/** Cards read in full on one page. More than this waits for the next approvals. */
const MAX_CARDS = 25;

export default async function ApprovalsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const orgId = ctx.current.id;
  const waiting = (await ctx.reader.listTasks(orgId)).filter((t) => t.state === "APPROVAL_PENDING");
  const shown = waiting.slice(0, MAX_CARDS);
  const canApproveEscalated = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const execution = currentExecutionMode();

  const read = await Promise.all(
    shown.map(async (t): Promise<WalletCardData | null> => {
      const [proposal, contract] = await Promise.all([ctx.reader.getLatestProposal(orgId, t.id), ctx.reader.getContract(orgId, t.id)]);
      if (!proposal || proposal.status !== "pending") return null;
      // The same reading as the review: each hunk against the contract (ADR 0041).
      const bases = Object.fromEntries(
        await Promise.all(
          proposal.changes.filter((c) => c.kind === "edit").map(async (c) => [c.path, (await ctx.reader.getFileRevision(orgId, t.projectId, c.path, c.baseRevision)) ?? ""] as const),
        ),
      );
      const lens = contract ? lensSummary(proposal.changes.map((c) => lensForChange(contract.body, c, bases[c.path] ?? ""))) : null;
      const escalated = proposal.policy?.outcome === "ESCALATE";
      return {
        taskId: t.id,
        title: t.title,
        projectName: t.projectName ?? "Project",
        sha256: proposal.sha256,
        createdAt: proposal.createdAt,
        expiresAt: proposal.expiresAt,
        byAgent: proposal.agentId !== null,
        facts: walletRisk({ policyOutcome: proposal.policy?.outcome ?? null, lens, changes: proposal.changes }),
        checks: contract?.body.requiredChecks ?? [],
        checksReason: execution.mode === "review_only" ? execution.reason : null,
        canApprove: !escalated || canApproveEscalated,
      };
    }),
  );
  const cards = read.filter((c): c is WalletCardData => c !== null);
  // Waiting with no open proposal on record: still listed, so the count in the menu adds up.
  const unread = shown.filter((_, i) => read[i] === null);
  // This request's time; a server component renders once per request.
  const serverNow = new Date().getTime();
  const ordered = approvalsOrder(cards, new Date(serverNow));

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Approvals"
        description="Changes waiting for your yes or no. Open one to see exactly what changes, then approve it or discard it. Each one stays open for 72 hours."
      />
      {cards.length === 0 && unread.length === 0 ? (
        <EmptyState icon={CheckSquareOffsetIcon} title="Nothing waiting for you" action={<ButtonLink href="/app/new" size="sm">Describe what you want to build</ButtonLink>}>
          When the agent finishes a change, it waits here for you. Nothing goes into your project until you approve it.
        </EmptyState>
      ) : (
        <ul className="grid gap-4">
          {ordered.map((card, i) => (
            <li key={card.taskId} className="motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]" style={{ animationDelay: `${i * 40}ms` }}>
              <WalletCard card={card} serverNow={serverNow} />
            </li>
          ))}
          {unread.map((t) => (
            <li key={t.id}>
              <Link href={`/app/tasks/${t.id}`} className="group flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 hover:border-line-strong/60">
                {/* Waiting with nothing to approve needs a look, not a decision (ADR 0183). */}
                <StatusGlyph status="attention" className="mt-0.5 self-start" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[0.9375rem] font-medium group-hover:text-accent">{t.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-3">
                    In {t.projectName ?? "its project"}, it started waiting <RelativeTime iso={t.updatedAt} />. There&apos;s no open change on record, so there&apos;s nothing to approve
                    here. Open the task to see why.
                  </span>
                </span>
                <ArrowRightIcon size={14} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {waiting.length > MAX_CARDS ? (
        <p className="text-sm text-ink-3">
          Showing the first {MAX_CARDS} of {waiting.length}. The rest are on their tasks, and appear here as these are decided.
        </p>
      ) : null}
    </div>
  );
}
