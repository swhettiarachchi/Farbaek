import { ArrowRightIcon, CaretDownIcon, CheckCircleIcon, InfoIcon, ListChecksIcon, QuestionIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { provenanceLive, type SurveyDocument } from "@/core/survey/document";
import { autoDoubt, doubtContext, drawnWithoutDoubt, exceptionsFor, itemOf, type ExceptionStep, type SurveyException } from "@/core/survey/exceptions";
import type { SurveyPoint } from "@/core/survey/parcel";
import type { Finding } from "@/core/survey/qc";
import { Card, CardTitle } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { ConfirmItem } from "./confirm-item";
import { KeepAsSurveyed } from "./keep-as-surveyed";
import { SketchFix, SketchFixResult } from "./sketch-fix";

const STEP_NAMES: Record<ExceptionStep, string> = { import: "Import", points: "Points", draft: "Draft", boundary: "Lots", plan: "Plan", settings: "Settings" };

const BADGE: Record<SurveyException["group"], { status: Status; label: string }> = {
  fix: { status: "blocked", label: "Must fix" },
  confirm: { status: "approval", label: "For you to confirm" },
  note: { status: "info", label: "For information" },
};

/** A list in a sentence: "a, b and c". */
const sentence = (items: readonly string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

interface Props {
  doc: SurveyDocument;
  points: readonly SurveyPoint[];
  findings: readonly Finding[];
  base: string;
  projectId: string;
  baseVersion: number;
  readOnly: string | null;
  approved: boolean;
}

/**
 * What stands between this version and the surveyor's approval, and only that (stage 224, ADR 0235): what must be fixed, what needs
 * their confirmation, each with what happened, what it holds back, the evidence, the next step and its one-press answer. What
 * Farbaek drew without a doubt is named once, as what approving the plan confirms. Notes for information are folded away.
 */
export function NeedsYou({ doc, points, findings, base, projectId, baseVersion, readOnly, approved }: Props) {
  if (approved) return null;
  const list = exceptionsFor(doc, points, findings);
  const also = drawnWithoutDoubt(doc, points, findings);
  // Items the surveyor confirmed or corrected that would be back on the list if they changed their mind: what they filled in from a
  // description or photo, and drawn items tested code doubts. The assistant's changes were applied by the surveyor, so they aren't here.
  const context = doubtContext(findings);
  const confirmed = Object.entries(doc.provenance)
    .filter(([k, p]) => p.reviewed && provenanceLive(doc, k) && (p.source === "ai_brief" || p.source === "ai_photo" || (p.source === "auto" && autoDoubt(doc, points, k, context) !== null)))
    .map(([k]) => ({ key: k, label: itemOf(doc, k).label }));
  const open = list.fix.length + list.confirm.length;
  const card = (e: SurveyException) => (
    <li key={e.id} className="grid gap-2 rounded-md bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusBadge status={e.group === "note" && e.severity === "warning" ? "attention" : BADGE[e.group].status} label={e.group === "note" && e.severity === "warning" ? "Needs a look" : BADGE[e.group].label} />
        {e.item ? <span className="text-sm text-ink-2">{e.item}</span> : null}
      </div>
      <p className="font-medium text-ink">{e.title}</p>
      {e.sketch ? (
        // What the sketch shows, one point a line; then the open questions, set apart; then the corrections offered in one press.
        <div className="grid gap-2 text-sm">
          <p className="text-ink-2">{e.sketch.lead}</p>
          <ul className="grid list-disc gap-1 pl-5 text-ink-2">
            {e.sketch.evidence.map((x, k) => (
              <li key={k}>{x}</li>
            ))}
          </ul>
          {e.sketch.questions.length > 0 ? (
            <div className="grid gap-1">
              <p className="font-medium text-ink">Open questions</p>
              <ul className="grid gap-1.5">
                {e.sketch.questions.map((q, k) => (
                  <li key={k} className="flex items-start gap-2 text-ink-2">
                    <QuestionIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-approval" aria-hidden />
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {e.sketch.fixes.map((f) => (
            <SketchFix key={`${f.file}:${f.reading}`} projectId={projectId} baseVersion={baseVersion} file={f.file} reading={f.reading} label={f.label} to={f.to} readOnly={readOnly} undo={f.undo === true} />
          ))}
        </div>
      ) : e.evidence ? (
        <p className="text-sm text-ink-2">{e.evidence}</p>
      ) : null}
      <p className="text-sm text-ink-2">{e.next}</p>
      {e.holds ? <p className="text-sm text-ink-3">{e.holds}</p> : null}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {e.confirm ? <ConfirmItem projectId={projectId} baseVersion={baseVersion} keyId={e.confirm} confirmed={false} readOnly={readOnly} /> : null}
        {e.keep ? <KeepAsSurveyed projectId={projectId} baseVersion={baseVersion} keyId={e.keep.key} kept={e.keep.kept} readOnly={readOnly} /> : null}
        {e.step && e.step !== "plan" ? (
          <Link href={`${base}?step=${e.step}`} className="inline-flex min-h-10 items-center text-sm font-medium text-accent underline-offset-2 hover:underline">
            {e.code.startsWith("SKETCH_") ? "See the sketch" : e.group === "fix" ? "Fix it" : e.confirm ? "Correct it" : "Open"} on the {STEP_NAMES[e.step]} step
          </Link>
        ) : null}
      </div>
    </li>
  );
  const alsoLine = also.length > 0 ? <p className="text-sm text-ink-2">Approving the plan also confirms what Farbaek drew from your field data with nothing to doubt: {sentence(also)}. Look over the sheet below before you approve.</p> : null;

  return (
    <Card>
      <CardTitle icon={ListChecksIcon}>{list.fix.length > 0 ? "Needs correction" : list.confirm.length > 0 ? "Needs your confirmation" : "Ready for your review"}</CardTitle>
      <SketchFixResult projectId={projectId} />
      {open === 0 ? (
        <div className="mt-3 grid gap-3">
          {readOnly ? <p className="text-sm text-ink-3">{readOnly}</p> : null}
          <p className="text-sm text-ink-2">Nothing holds this version back. Look over the sheet, then approve it on the Export step: your approval records your review.</p>
          {alsoLine}
          <Link href={`${base}?step=export`} className={buttonClasses("primary", "md", "w-fit")}>
            Go to approval
            <ArrowRightIcon size={16} weight="bold" aria-hidden />
          </Link>
          <Notes notes={list.note} card={card} />
          <Confirmed items={confirmed} projectId={projectId} baseVersion={baseVersion} readOnly={readOnly} />
        </div>
      ) : (
        <FoldOnPhones count={open}>
          <div className="grid gap-5">
            {readOnly ? <p className="text-sm text-ink-3">{readOnly}</p> : null}
            <p className="hidden text-sm text-ink-2 lg:block">
              Only {open === 1 ? "this needs" : `these ${open} need`} you. {list.fix.length > 0 ? "Fix what must be fixed first: the plan can't be exported until then." : ""}
            </p>
            {list.fix.length > 0 ? (
              <section aria-label="Must fix" className="grid gap-2">
                <ul className="grid gap-3">{list.fix.map(card)}</ul>
              </section>
            ) : null}
            {list.confirm.length > 0 ? (
              <section aria-label="For you to confirm" className="grid gap-2">
                <ul className="grid gap-3">{list.confirm.map(card)}</ul>
              </section>
            ) : null}
            {alsoLine}
            <Notes notes={list.note} card={card} />
            <Confirmed items={confirmed} projectId={projectId} baseVersion={baseVersion} readOnly={readOnly} />
          </div>
        </FoldOnPhones>
      )}
    </Card>
  );
}

function Notes({ notes, card }: { notes: SurveyException[]; card: (e: SurveyException) => ReactNode }) {
  if (notes.length === 0) return null;
  return (
    <Disclosure summary={`${notes.length} ${notes.length === 1 ? "note" : "notes"} for information`} hint="They hold nothing back. The Check step lists every check." icon={<InfoIcon size={20} aria-hidden />}>
      <ul className="grid gap-3">{notes.map(card)}</ul>
    </Disclosure>
  );
}

function Confirmed({ items, projectId, baseVersion, readOnly }: { items: { key: string; label: string }[]; projectId: string; baseVersion: number; readOnly: string | null }) {
  if (items.length === 0) return null;
  return (
    <Disclosure summary={`${items.length} ${items.length === 1 ? "item" : "items"} you confirmed or corrected`} hint="Put one back on the list if you want to check it again." icon={<CheckCircleIcon size={20} aria-hidden />}>
      <ul className="grid gap-3">
        {items.map((i) => (
          <li key={i.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-ink">
            <span>{i.label}</span>
            <ConfirmItem projectId={projectId} baseVersion={baseVersion} keyId={i.key} confirmed readOnly={readOnly} />
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

/**
 * On a large screen the list shows as it is. Below that it folds to one line saying how many things are left, so the sheet isn't
 * pushed below the fold on a phone (stage 196); a tap opens it.
 */
function FoldOnPhones({ count, children }: { count: number; children: ReactNode }) {
  return (
    <>
      <details className="group mt-2 lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm text-ink-2 [&::-webkit-details-marker]:hidden">
          <span>
            {count} {count === 1 ? "thing needs" : "things need"} you.
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-ink">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span>
            <CaretDownIcon size={14} weight="bold" className="transition-transform duration-150 group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <div className="pt-2">{children}</div>
      </details>
      <div className="mt-3 hidden lg:block">{children}</div>
    </>
  );
}
