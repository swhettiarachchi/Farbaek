"use client";

import { ArrowUpRightIcon, CheckCircleIcon, CopyIcon, PlusIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { addDomainAction, checkDomainAction, removeDomainAction, type PublishState } from "@/app/app/projects/[projectId]/publish-actions";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { StatusBadge } from "@/components/ui/status-badge";
import { DOMAINS_PER_SITE, type DnsRecord } from "@/core/publish/domains";

const IDLE: PublishState = { status: "idle" };

export interface SiteDomainItem {
  id: string;
  hostname: string;
  status: "pending" | "verified";
  records: DnsRecord[] | null;
}

function Copy({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1_500);
        });
      }}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-raised hover:text-ink"
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
    >
      {copied ? <CheckCircleIcon size={16} weight="fill" className="text-verified" aria-hidden /> : <CopyIcon size={16} weight="bold" aria-hidden />}
    </button>
  );
}

function DomainCard({ projectId, domain, disabledReason }: { projectId: string; domain: SiteDomainItem; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(checkDomainAction, IDLE);
  const verified = domain.status === "verified";
  return (
    <li className="grid min-w-0 gap-3 rounded-sm border border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-all font-mono text-[0.875rem]">{domain.hostname}</span>
        {/* Waiting on DNS is waiting on a system, not on a person here: pending, in steel. */}
        {verified ? <StatusBadge status="verified" /> : <StatusBadge status="pending" label="Waiting for DNS" />}
        {disabledReason ? null : (
          <ConfirmAction
            action={removeDomainAction}
            fields={{ projectId, domainId: domain.id }}
            className="ml-auto"
            triggerClassName="inline-flex size-11 items-center justify-center rounded-full text-ink-3 hover:bg-surface-raised hover:text-failed"
            trigger={
              <>
                <TrashIcon size={16} weight="bold" aria-hidden />
                <span className="sr-only">Remove {domain.hostname}</span>
              </>
            }
            question={<>Remove {domain.hostname}? {verified ? "It stops serving this site, and visitors there see nothing until it's added and checked again." : "You can add it again later."} The site stays live at its Farbaek address.</>}
            confirmLabel="Remove domain"
            pendingLabel="Removing…"
          />
        )}
      </div>

      {verified ? (
        <a href={`https://${domain.hostname}`} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-accent hover:underline">
          Visit https://{domain.hostname} <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
        </a>
      ) : null}

      {domain.records ? (
        <div className="grid gap-2">
          <p className="text-xs leading-relaxed text-ink-2">
            {verified ? "Keep these records in place; the domain stops serving the site if they're removed." : "Add these records where you manage this domain's DNS, then check."}
          </p>
          <ul className="grid gap-2">
            {domain.records.map((r) => (
              <li key={r.type} className="grid gap-1 rounded-sm bg-surface-raised/60 px-3 py-2">
                <span className="text-xs text-ink-3">
                  <span className="font-mono font-medium text-ink-2">{r.type}</span> · {r.purpose}
                </span>
                <span className="flex min-w-0 items-center gap-1">
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-ink-3">Name</span>
                    <span className="block break-all font-mono text-[0.8125rem]">{r.name}</span>
                  </span>
                  <Copy value={r.name} label={`the ${r.type} record's name`} />
                </span>
                <span className="flex min-w-0 items-center gap-1">
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-ink-3">Value</span>
                    <span className="block break-all font-mono text-[0.8125rem]">{r.value}</span>
                  </span>
                  <Copy value={r.value} label={`the ${r.type} record's value`} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="domainId" value={domain.id} />
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses(verified ? "ghost" : "secondary", "sm")}>
          {pending ? "Checking DNS…" : verified ? "Check again" : "Check DNS now"}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </form>
      {state.status === "error" ? (
        // Usually the records just haven't spread yet, which is normal for a while after adding a domain: a look, not a failure.
        <p role="status" className="flex items-start gap-2 text-sm text-ink-2">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden /> {state.message}
        </p>
      ) : state.status === "done" ? (
        <p role="status" className="flex items-start gap-2 text-sm text-verified">
          <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
    </li>
  );
}

/**
 * The site's own domains (ADR 0045): add one, set its DNS records, check
 * them, and it serves the site once verified, with its own certificate.
 */
export function SiteDomains({ projectId, domains, available, disabledReason }: { projectId: string; domains: SiteDomainItem[]; available: boolean; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(addDomainAction, IDLE);
  const full = domains.length >= DOMAINS_PER_SITE;
  const addReason = disabledReason ?? (!available ? "Published sites aren't connected on this server yet, so domains can't be added." : full ? `A site can have ${DOMAINS_PER_SITE} domains. Remove one to add another.` : null);
  return (
    <div className="grid gap-3 border-t border-line pt-4">
      <div className="grid gap-1">
        <h3 className="text-[0.9375rem] font-medium">Your own domain</h3>
        <p className="text-sm leading-relaxed text-ink-2">Serve this site at a domain you own, such as www.yourshop.com. Farbaek checks your DNS records, then makes its certificate on the first visit.</p>
      </div>
      {domains.length ? (
        <ul className="grid gap-2">
          {domains.map((d) => (
            <DomainCard key={d.id} projectId={projectId} domain={d} disabledReason={disabledReason} />
          ))}
        </ul>
      ) : null}
      <form action={action} className="grid gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <label htmlFor="site-domain" className="text-sm font-medium">
          Domain
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="site-domain"
            name="domain"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="www.yourshop.com"
            disabled={pending || Boolean(addReason)}
            className="min-h-11 min-w-0 flex-1 basis-56 rounded-sm border border-line bg-surface px-3.5 font-mono text-base outline-none placeholder:text-ink-3 focus:border-accent/60 disabled:opacity-60 sm:text-[0.875rem]"
          />
          <button type="submit" disabled={pending || Boolean(addReason)} className={buttonClasses("primary", "sm")}>
            <PlusIcon size={16} weight="bold" aria-hidden /> {pending ? "Adding…" : "Add domain"}
          </button>
        </div>
        {addReason ? <p className="text-sm text-ink-3">{addReason}</p> : null}
        {state.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
          </p>
        ) : state.status === "done" ? (
          <p role="status" className="flex items-start gap-2 text-sm text-verified">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
