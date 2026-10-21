import { CheckCircleIcon, PauseCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { Notice, PageHeader } from "@/components/app/primitives";
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
              className={`relative grid content-start gap-4 overflow-hidden rounded-lg p-2 ring-1 ${f.paused ? "bg-approval/[0.06] ring-approval/35" : "bg-surface-raised/60 ring-line"}`}
            >
              {f.paused ? <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-[repeating-linear-gradient(135deg,var(--color-approval)_0_4px,transparent_4px_8px)]" /> : null}
              <div className="grid gap-4 rounded-md bg-surface p-5 shadow-e1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[17px] font-medium tracking-[-0.01em]">{d.label}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{d.pauses}</p>
                  </div>
                  {f.paused ? (
                    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-approval/40 bg-approval/[0.08] px-3 text-xs font-medium text-ink">
                      <PauseCircleIcon size={16} weight="fill" className="text-approval" aria-hidden /> Paused
                    </span>
                  ) : (
                    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-verified/35 px-3 text-xs font-medium text-ink">
                      <CheckCircleIcon size={16} weight="fill" className="text-verified" aria-hidden /> Running
                    </span>
                  )}
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
