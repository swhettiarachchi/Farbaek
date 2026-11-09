import { ArrowUpRightIcon, GlobeIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { OfficeActionForm } from "@/components/office/action-form";
import { ReasonField } from "@/components/office/fields";
import { LABEL_CLASSES, textareaClasses } from "@/components/ui/field";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStaff } from "@/server/office/access";
import { listAllSites } from "@/server/office/controls-data";
import { siteDomain } from "@/server/publish/config";
import { blockSiteAction, unblockSiteAction } from "./actions";

export const metadata: Metadata = { title: "Sites" };

/** A site's state as its kind (ADR 0183): taken offline is blocked, live is verified, offline is off. */
function State({ live, blocked }: { live: boolean; blocked: boolean }) {
  if (blocked) return <StatusBadge status="blocked" label="Taken offline by Farbaek" />;
  return live ? <StatusBadge status="verified" label="Live" /> : <StatusBadge status="off" label="Offline" />;
}

export default async function OfficeSites() {
  const staff = await requireStaff();
  const sites = await listAllSites(staff.admin);
  const domain = siteDomain();
  const canBlock = staff.can("site.block");

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Sites"
        description="Every site people have published, newest first. Taking one offline keeps its files and name as evidence; its owner sees your notice and visitors see that it isn't available."
      />
      {!canBlock ? <Notice>Your role can see sites but not take them offline. Admins, owners and trust and safety can.</Notice> : null}
      {sites.length === 0 ? (
        <EmptyState icon={GlobeIcon} title="No published sites yet">
          A site appears here the first time someone publishes a project.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {sites.map((s) => {
            const address = domain ? `${s.name}.${domain}` : s.name;
            return (
              <li key={s.id} className="rounded-md border border-line bg-surface shadow-e1">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:p-5">
                  <div className="min-w-0 flex-1">
                    {domain && s.live ? (
                      <a href={`https://${address}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all font-mono text-body text-accent hover:underline">
                        {address} <ArrowUpRightIcon size={14} weight="bold" className="shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <p className="break-all font-mono text-body text-ink">{address}</p>
                    )}
                    <p className="mt-1 text-xs text-ink-3">
                      <Link href={`/workspaces/${s.orgId}`} className="hover:text-ink hover:underline">
                        {s.workspace}
                      </Link>{" "}
                      · first published <RelativeTime iso={s.createdAt} />
                    </p>
                    {s.blocked ? <p className="mt-2 text-sm text-ink-2">Owner sees: &ldquo;{s.blocked.notice}&rdquo;</p> : null}
                  </div>
                  <State live={s.live} blocked={Boolean(s.blocked)} />
                </div>
                {canBlock ? (
                  <details className="group border-t border-line">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 text-sm text-ink-2 hover:text-ink sm:px-5 [&::-webkit-details-marker]:hidden">
                      {s.blocked ? "Lift the block" : "Take this site offline"}
                    </summary>
                    <div className="px-4 pb-5 sm:px-5">
                      {s.blocked ? (
                        <OfficeActionForm action={unblockSiteAction} submit="Lift the block" tone="secondary" className="grid max-w-xl gap-3">
                          <input type="hidden" name="siteId" value={s.id} />
                          <ReasonField id={`unblock-${s.id}`} />
                        </OfficeActionForm>
                      ) : (
                        <OfficeActionForm action={blockSiteAction} submit={`Take ${s.name} offline`} tone="danger" className="grid max-w-xl gap-3">
                          <input type="hidden" name="siteId" value={s.id} />
                          <label htmlFor={`notice-${s.id}`} className="grid gap-1.5 text-sm">
                            <span className={LABEL_CLASSES}>Notice the owner will see</span>
                            <textarea id={`notice-${s.id}`} name="notice" required minLength={10} maxLength={500} rows={2} className={textareaClasses()} placeholder="What was found and how to appeal" />
                          </label>
                          <ReasonField id={`block-${s.id}`} label="Internal reason, for the audit log" />
                        </OfficeActionForm>
                      )}
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
