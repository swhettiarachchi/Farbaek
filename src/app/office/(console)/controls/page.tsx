import { SlidersHorizontalIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { CardTitle, Notice, PageHeader } from "@/components/app/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { OfficeActionForm } from "@/components/office/action-form";
import { officeInputClass, ReasonField, StepUpField } from "@/components/office/fields";
import { RelativeTime } from "@/components/ui/local-time";
import { FLAG_DETAILS } from "@/core/office/flags";
import { requireStaff } from "@/server/office/access";
import { listFlags } from "@/server/office/controls-data";
import { setFlagAction } from "./actions";

export const metadata: Metadata = { title: "Controls" };

/**
 * The platform's pause switches. Each one is enforced by the database; the
 * app explains it to customers in the place they'd otherwise hit it.
 */
export default async function OfficeControls() {
  const staff = await requireStaff();
  const flags = await listFlags(staff.admin);
  const owner = staff.can("flags.set");

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Controls"
        description="Pause part of Farbaek for everyone during an incident. Each switch needs a reason and a fresh authenticator code, both ways, and customers see your message where they'd otherwise hit the pause."
      />
      {!owner ? <Notice>Only owners can flip these. You can see where things stand.</Notice> : null}

      <ul className="grid gap-4 lg:grid-cols-2">
        {flags.map((f) => {
          const d = FLAG_DETAILS[f.key];
          return (
            <li
              key={f.key}
              // A paused switch says so in its chip and a burnt-orange edge; no hazard stripe (ADR 0183).
              className={`grid content-start gap-4 rounded-lg bg-surface-raised/60 p-2 ring-1 ${f.paused ? "ring-caution/35" : "ring-line"}`}
            >
              <div className="grid gap-4 rounded-md bg-surface p-5 shadow-e1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle icon={SlidersHorizontalIcon}>{d.label}</CardTitle>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{d.pauses}</p>
                  </div>
                  {f.paused ? <StatusBadge status="paused" label="Paused" /> : <StatusBadge status="verified" label="Running" />}
                </div>
                {f.paused && f.message ? <p className="rounded-sm bg-surface-raised px-3 py-2 text-sm text-ink">Customers see: &ldquo;{f.message}&rdquo;</p> : null}
                {f.updatedAt ? (
                  <p className="text-xs text-ink-3">
                    Last changed <RelativeTime iso={f.updatedAt} />
                  </p>
                ) : null}
                {owner ? (
                  <details className="text-sm">
                    <summary className="flex min-h-11 cursor-pointer items-center font-medium text-ink-2 hover:text-ink">{f.paused ? `Turn ${d.label.toLowerCase()} back on` : `Pause ${d.label.toLowerCase()}`}</summary>
                    <OfficeActionForm action={setFlagAction} submit={f.paused ? "Turn it back on" : "Pause it now"} tone={f.paused ? "secondary" : "danger"} className="mt-2 grid gap-3">
                      <input type="hidden" name="key" value={f.key} />
                      <input type="hidden" name="paused" value={f.paused ? "false" : "true"} />
                      {!f.paused ? (
                        <label htmlFor={`message-${f.key}`} className="grid gap-1.5">
                          <span className="font-medium text-ink">Message customers will see</span>
                          <textarea id={`message-${f.key}`} name="message" required minLength={10} maxLength={280} rows={2} defaultValue={d.fallback} className={`${officeInputClass} h-auto min-h-20 py-3`} />
                        </label>
                      ) : null}
                      <ReasonField id={`reason-${f.key}`} />
                      <StepUpField id={`totp-${f.key}`} />
                    </OfficeActionForm>
                  </details>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
