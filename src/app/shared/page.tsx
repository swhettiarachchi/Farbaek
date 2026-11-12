import { ArrowRightIcon, UsersThreeIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { GUEST_ACCESS_LABELS } from "@/core/workspace/sharing";
import { loadSharedWithMe } from "@/server/workspace/guest-context";

export const metadata: Metadata = { title: "Shared with you" };

export default async function SharedWithYouPage() {
  const shared = await loadSharedWithMe();
  if (!shared) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Shared with you" />
        <Notice>Shared projects aren&apos;t available on this server. Try www.farbaek.com.</Notice>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Shared with you"
        description={`Projects other workspaces invited ${shared.user.email} to. You see each project on its own, never the rest of its workspace.`}
      />
      {shared.projects.length === 0 ? (
        <EmptyState icon={UsersThreeIcon} title="Nothing is shared with you yet">
          When someone invites you to a project, open the link they send you and it appears here.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {shared.projects.map((p) => (
            <li key={p.projectId}>
              <Link
                href={`/shared/${p.projectId}`}
                className="group grid h-full gap-2 rounded-md border border-line bg-surface p-5 shadow-e1 transition-colors duration-150 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-lg font-medium tracking-[-0.02em]">{p.projectName}</span>
                  <ArrowRightIcon size={16} weight="bold" className="mt-1.5 shrink-0 text-ink-3 transition-transform duration-150 motion-safe:group-hover:translate-x-0.5" aria-hidden />
                </span>
                {p.projectDescription ? <span className="line-clamp-2 text-sm text-ink-2">{p.projectDescription}</span> : null}
                <span className="text-sm text-ink-3">
                  From {p.orgName}. {GUEST_ACCESS_LABELS[p.access].title}, since <LocalTime iso={p.since} date />.
                </span>
                {p.archived ? <span className="text-sm text-ink-3">Archived: it can be read, not changed.</span> : null}
                {p.suspended ? <span className="text-sm text-ink-3">Paused by Farbaek for now.</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
