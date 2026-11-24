import { EyeSlashIcon, HashIcon, LineSegmentsIcon, QuestionIcon, RulerIcon, TextTIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { Card, CardTitle } from "@/components/app/primitives";
import { Disclosure } from "@/components/ui/disclosure";
import { LocalTime } from "@/components/ui/local-time";
import { StatusGlyph, type Status } from "@/components/ui/status-badge";
import type { ReadingStatus } from "@/core/survey/autosurvey/sketch";
import { CONFIDENCE_RULE, CONFIDENCE_WORDS, HOW_MATCHED, STATUS_WORDS, photoWords, type ReportEntry, type ReportSide, type SketchReport, type UnclearItem } from "@/core/survey/sketchintel/report";

const GLYPH: Record<ReadingStatus, Status> = { agrees: "done", close: "info", differs: "attention", unmatched: "attention", not_checked: "off" };

/** Where on which photo, as a link to the photo when it's kept, with the place in words. */
function Where({ file, photo, url }: { file: string; photo: { x: number; y: number } | null; url: string | null }) {
  const place = photoWords(photo);
  return (
    <span className="text-ink-3">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
          {file}
        </a>
      ) : (
        file
      )}
      {place ? `, ${place}` : ""}
    </span>
  );
}

/** The photo, small, with a ring where the writing is: so the surveyor can see what was read, and where. */
function Marked({ url, photo, label }: { url: string; photo: { x: number; y: number }; label: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="relative block w-32 shrink-0 overflow-hidden rounded-sm ring-1 ring-line hover:ring-line-strong sm:w-40">
      {/* eslint-disable-next-line @next/next/no-img-element -- a private photo from Farbaek's own route, read with the person's session */}
      <img src={url} alt={`The sketch photo, with ${label} ringed`} loading="lazy" className="block h-auto w-full" />
      <span aria-hidden className="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-accent" style={{ left: `${photo.x / 10}%`, top: `${photo.y / 10}%` }} />
    </a>
  );
}

function Entry({ e, url }: { e: ReportEntry; url: string | null }) {
  return (
    <li className="grid gap-0.5 text-sm">
      <span className="text-ink">
        <span className="font-medium">{e.text}</span> <span className="text-ink-2">{e.meaning.charAt(0).toLowerCase() + e.meaning.slice(1)}</span>
      </span>
      <span className="flex items-start gap-1.5 text-ink-2">
        <StatusGlyph status={GLYPH[e.status]} size={14} className="mt-0.5" />
        <span>
          {STATUS_WORDS[e.status]}. {e.read === "clear" ? "Read clearly" : `Read with doubt${e.doubt ? `: ${e.doubt}` : ""}`}. How sure: {CONFIDENCE_WORDS[e.confidence].toLowerCase()}.
        </span>
      </span>
      <Where file={e.file} photo={e.photo} url={url} />
    </li>
  );
}

/** Uncertain items, each with its photo and a ring where it's written, and why it's here. */
function Unclear({ items, photoUrl }: { items: readonly UnclearItem[]; photoUrl: (file: string) => string | null }) {
  return (
    <ul className="mt-4 grid gap-4">
      {items.map((u, i) => {
        const url = photoUrl(u.file);
        return (
          <li key={`${u.id ?? "x"}-${i}`} className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
            {url && u.photo ? <Marked url={url} photo={u.photo} label={u.what} /> : null}
            <span className="grid min-w-0 gap-0.5 text-sm">
              <span className="flex items-start gap-1.5 font-medium text-ink">
                <WarningCircleIcon size={16} weight="fill" className={`mt-0.5 shrink-0 ${u.quiet ? "text-ink-3" : "text-caution"}`} aria-hidden />
                {u.what}
              </span>
              <span className="text-ink-2">{u.reasons.join(" ")}</span>
              <Where file={u.file} photo={u.photo} url={url} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Side({ s, urlOf }: { s: ReportSide; urlOf: (file: string) => string | null }) {
  return (
    <li className="grid gap-1 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <span className="text-sm text-ink">
        <span className="font-medium">
          {s.from} to {s.to}
        </span>
        <span className="text-ink-2">
          {" "}
          {s.drawn}
          {s.label ? `, "${s.label}" written along it` : ", nothing written along it"}
          {s.lineRead === "doubt" ? ", read with doubt" : ""}.
        </span>
      </span>
      <span className="text-sm text-ink-2">{s.gridM !== null ? `The survey gives ${s.gridM.toFixed(3)} m on the grid.` : "Its two ends aren't both points in the survey."}</span>
      {s.entries.length > 0 ? (
        <ul className="mt-1 grid gap-2">
          {s.entries.map((e) => (
            <Entry key={e.id} e={e} url={urlOf(e.file)} />
          ))}
        </ul>
      ) : (
        <span className="text-sm text-ink-3">No measurement written beside it.</span>
      )}
    </li>
  );
}

/**
 * The sketch interpretation report (stage 245, ADR 0253): what needs the surveyor first, then each side drawn with the numbers beside it,
 * the point numbers, the other measurements and the writing. Everything here is text from the sketch, shown as text.
 */
export function SketchReportView({ report: r, photoUrl }: { report: SketchReport; photoUrl: (file: string) => string | null }) {
  const measured = r.sides.reduce((n, s) => n + s.entries.length, 0) + r.between.length;
  const [needs, quiet] = [r.unclear.filter((u) => !u.quiet), r.unclear.filter((u) => u.quiet)];
  return (
    <div className="grid gap-6">
      <Card>
        <p className="text-sm text-ink-2">
          {r.reader} read {r.files.length === 1 ? "one photo" : `${r.files.length} photos`} on <LocalTime iso={r.readAt} date />: {r.sides.length} {r.sides.length === 1 ? "side" : "sides"} drawn, {r.points.length} point {r.points.length === 1 ? "number" : "numbers"} and {measured} {measured === 1 ? "measurement" : "measurements"}.{" "}
          {needs.length === 0 ? "Nothing read from the sketch needs you." : `${needs.length} ${needs.length === 1 ? "thing read from the sketch needs" : "things read from the sketch need"} you, listed first.`}
          {r.questions.length > 0 ? ` The engine also asks ${r.questions.length === 1 ? "one question" : `${r.questions.length} questions`}, listed after them.` : ""}
          {quiet.length > 0 ? ` ${quiet.length} more ${quiet.length === 1 ? "was" : "were"} read with doubt: labels and notes, and measurements the survey agrees with exactly as read.` : ""}
        </p>
        <p className="mt-2 text-sm text-ink-3">{CONFIDENCE_RULE}</p>
        <p className="mt-2 text-sm text-ink-3">Places on a photo are approximate, as the photo was taken, and only for finding the writing again. Nothing here moved a point or gave a position: every position on the plan is the survey&apos;s own.</p>
        {r.compared ? null : <p className="mt-2 text-sm text-ink">The coordinate system isn&apos;t confirmed yet, so measurements aren&apos;t compared with the survey.</p>}
      </Card>

      {r.unclear.length > 0 ? (
        <Card>
          <CardTitle icon={QuestionIcon}>For you to decide</CardTitle>
          <p className="mt-1 text-sm text-ink-2">What the survey disagrees with comes first, then what was read with doubt. None of these was used as a fact.</p>
          {needs.length > 0 ? <Unclear items={needs} photoUrl={photoUrl} /> : <p className="mt-3 text-sm text-ink-2">Nothing needs you here.</p>}
          {quiet.length > 0 ? (
            <div className="mt-4">
              <Disclosure summary={`Also read with doubt (${quiet.length})`} hint="Labels and notes, and measurements the survey agrees with exactly as read. Not used as facts either.">
                <Unclear items={quiet} photoUrl={photoUrl} />
              </Disclosure>
            </div>
          ) : null}
        </Card>
      ) : null}

      {r.questions.length > 0 ? (
        <Card>
          <CardTitle icon={QuestionIcon}>What the engine asks</CardTitle>
          <p className="mt-1 text-sm text-ink-2">The same questions the plan&apos;s checks ask, answered on the Lots step.</p>
          <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-sm text-ink-2">
            {r.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardTitle icon={LineSegmentsIcon}>Each side of the sketch</CardTitle>
        {r.sides.length === 0 ? (
          <p className="mt-1 text-sm text-ink-2">The sketch&apos;s lines weren&apos;t read, only what&apos;s written on it.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {r.sides.map((s) => (
              <Side key={`${s.line}-${s.from}-${s.to}`} s={s} urlOf={photoUrl} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={HashIcon}>Point numbers</CardTitle>
        {r.points.length === 0 ? (
          <p className="mt-1 text-sm text-ink-2">No point numbers were read.</p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {r.points.map((p) => (
              <li key={p.label} className="grid gap-0.5 text-sm">
                <span className="flex items-start gap-1.5 text-ink">
                  <StatusGlyph status={p.pointId ? (p.entries.some((e) => e.read === "doubt") ? "info" : "done") : "attention"} size={14} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{p.label}</span>
                    <span className="text-ink-2"> {p.pointId ? `is point ${p.pointId}: ${HOW_MATCHED[p.how].toLowerCase()}` : HOW_MATCHED[p.how].toLowerCase()}.</span>
                  </span>
                </span>
                {p.entries.map((e) => (
                  <span key={e.id} className="pl-5 text-ink-3">
                    {e.read === "doubt" ? `Read with doubt${e.doubt ? `: ${e.doubt}` : ""}. ` : ""}
                    <Where file={e.file} photo={e.photo} url={photoUrl(e.file)} />
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {r.between.length > 0 ? (
        <Card>
          <CardTitle icon={RulerIcon}>Measurements not along one drawn side</CardTitle>
          <ul className="mt-4 grid gap-3">
            {r.between.map((e) => (
              <Entry key={e.id} e={{ ...e, meaning: e.side ? `${e.meaning}, ${e.side.from} to ${e.side.to}` : e.meaning }} url={photoUrl(e.file)} />
            ))}
          </ul>
        </Card>
      ) : null}

      {r.other.length > 0 ? (
        <Card>
          <CardTitle icon={TextTIcon}>Other writing</CardTitle>
          <ul className="mt-4 grid gap-3">
            {r.other.map((e) => (
              <Entry key={e.id} e={{ ...e, meaning: e.near ? `${e.meaning}, near ${e.near}` : e.meaning }} url={photoUrl(e.file)} />
            ))}
          </ul>
        </Card>
      ) : null}

      {r.unreadable.length > 0 ? (
        <Card>
          <CardTitle icon={EyeSlashIcon}>Seen but not read</CardTitle>
          <ul className="mt-3 grid list-disc gap-1 pl-5 text-sm text-ink-2">
            {r.unreadable.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
