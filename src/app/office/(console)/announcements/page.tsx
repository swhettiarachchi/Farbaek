import { InfoIcon, MegaphoneIcon, PencilSimpleLineIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { CardTitle, EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { OfficeActionForm } from "@/components/office/action-form";
import { officeInputClass, ReasonField } from "@/components/office/fields";
import { RelativeTime } from "@/components/ui/local-time";
import { requireStaff } from "@/server/office/access";
import { isLiveAnnouncement, listAnnouncements } from "@/server/office/controls-data";
import { endAnnouncementAction, publishAnnouncementAction } from "./actions";

export const metadata: Metadata = { title: "Announcements" };

export default async function OfficeAnnouncements() {
  const staff = await requireStaff();
  const all = await listAnnouncements(staff.admin);
  const live = all.filter((a) => isLiveAnnouncement(a));
  const past = all.filter((a) => !isLiveAnnouncement(a));
  const can = staff.can("announcements.manage");

  return (
    <div className="grid gap-8">
      <PageHeader title="Announcements" description="A message across the top of everyone's Farbaek app. A notice can be closed; an incident stays until you end it." />
      {!can ? <Notice>Only admins and owners post announcements.</Notice> : null}

      {can ? (
        <section aria-labelledby="new-title" className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
          <div className="grid gap-4 rounded-md bg-surface p-5 shadow-e1 sm:p-6">
            <CardTitle id="new-title" icon={PencilSimpleLineIcon}>
              Post a message
            </CardTitle>
            <OfficeActionForm action={publishAnnouncementAction} submit="Post it" className="grid gap-4">
              <label htmlFor="announce-message" className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">Message</span>
                <textarea id="announce-message" name="message" required minLength={10} maxLength={280} rows={2} className={`${officeInputClass} h-auto min-h-20 py-3`} placeholder="Plain words: what's happening and what people should do" />
              </label>
              <fieldset className="grid gap-2 text-sm">
                <legend className="mb-1 font-medium text-ink">Kind</legend>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="tone" value="info" defaultChecked className="size-4 accent-[var(--color-accent)]" /> Notice, can be closed
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="tone" value="incident" className="size-4 accent-[var(--color-accent)]" /> Incident, stays until ended
                </label>
              </fieldset>
              <label htmlFor="announce-hours" className="grid gap-1.5 text-sm sm:max-w-xs">
                <span className="font-medium text-ink">Ends by itself after</span>
                <select id="announce-hours" name="hours" defaultValue="0" className={officeInputClass}>
                  <option value="0">Only when ended here</option>
                  <option value="2">2 hours</option>
                  <option value="24">1 day</option>
                  <option value="168">1 week</option>
                </select>
              </label>
              <ReasonField id="announce-reason" />
            </OfficeActionForm>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="live-title" className="grid gap-3">
        <CardTitle id="live-title" icon={MegaphoneIcon}>
          Showing now
        </CardTitle>
        {live.length === 0 ? (
          <EmptyState icon={MegaphoneIcon} title="Nothing showing">
            Everyone sees the app without a message from Farbaek.
          </EmptyState>
        ) : (
          <ul className="grid gap-3">
            {live.map((a) => (
              <li key={a.id} className="grid gap-3 rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
                <p className="flex items-start gap-2 text-sm text-ink">
                  {a.tone === "incident" ? <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden /> : <InfoIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-info" aria-hidden />}
                  <span>
                    <span className="font-medium">{a.tone === "incident" ? "Incident: " : "Notice: "}</span>
                    {a.message}
                  </span>
                </p>
                <p className="text-xs text-ink-3">
                  Since <RelativeTime iso={a.startsAt} />
                  {a.endsAt ? (
                    <>
                      , ends <RelativeTime iso={a.endsAt} />
                    </>
                  ) : null}
                </p>
                {can ? (
                  <OfficeActionForm action={endAnnouncementAction} submit="End it now" tone="secondary" className="grid max-w-xl gap-3">
                    <input type="hidden" name="id" value={a.id} />
                    <ReasonField id={`end-${a.id}`} />
                  </OfficeActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <details className="rounded-md border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm text-ink-2">Earlier messages ({past.length})</summary>
          <ul className="grid gap-2 px-4 pb-4 text-sm text-ink-2">
            {past.map((a) => (
              <li key={a.id}>
                <span className="text-ink">{a.message}</span> <span className="text-xs text-ink-3">· <RelativeTime iso={a.startsAt} /></span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
