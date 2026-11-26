"use client";

/**
 * The drafting assistant's cards (stage 195): what will change, with every value large beside its role and a tick to leave any one out;
 * the engine's answers; a question with answers to tap; a hand-over to a tool; and plain notes. Each card rises from the bar it answers,
 * and stays put under reduced motion.
 */
import { ArrowSquareOutIcon, CheckIcon, EyeIcon, EyeSlashIcon, PencilSimpleIcon, WarningCircleIcon, XIcon } from "@/components/icons";
import type { ReactNode } from "react";
import type { Answer } from "@/core/survey/assistant/answer";
import type { Described } from "@/core/survey/assistant/describe";
import { tierOf, type AssistQuestion, type PlanOp } from "@/core/survey/assistant/ops";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

/** The surface every card shares: solid (content never sits on glass), a 20px card, and a short rise in. */
export function CardShell({ children, label, live = "polite" }: { children: ReactNode; label: string; live?: "polite" | "off" }) {
  return (
    <section aria-label={label} aria-live={live} className="pointer-events-auto w-full max-w-3xl overflow-y-auto rounded-md bg-surface p-3 shadow-e2 ring-1 ring-line max-h-[min(60vh,34rem)] sm:p-4 lg:ml-auto lg:max-h-[min(46vh,30rem)] lg:max-w-[26rem] motion-safe:animate-[usage-in_220ms_cubic-bezier(0.16,1,0.3,1)_both]">
      {children}
    </section>
  );
}

/** The instruction, with the words each change came from marked, so the surveyor sees where every value was read. */
export function Words({ words, quotes }: { words: string; quotes: readonly string[] }) {
  const spans: [number, number][] = [];
  const lower = words.toLowerCase();
  for (const q of quotes) {
    const at = q.trim() ? lower.indexOf(q.trim().toLowerCase()) : -1;
    if (at >= 0) spans.push([at, at + q.trim().length]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const parts: ReactNode[] = [];
  let i = 0;
  spans.forEach(([a, b], k) => {
    if (a < i) return;
    if (a > i) parts.push(words.slice(i, a));
    parts.push(
      <mark key={k} className="rounded-sm bg-accent/10 px-0.5 text-ink [box-decoration-break:clone]">
        {words.slice(a, b)}
      </mark>,
    );
    i = b;
  });
  if (i < words.length) parts.push(words.slice(i));
  return <p className="text-label leading-relaxed text-ink-2">&ldquo;{parts}&rdquo;</p>;
}

function Values({ values }: { values: Described["values"] }) {
  if (values.length === 0) return null;
  return (
    <dl className="mt-1 grid gap-x-5 gap-y-1 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
      {values.map((v, i) => (
        <div key={i} className="grid min-w-0">
          {v.role ? <dt className="text-xs text-ink-3">{v.role}</dt> : null}
          <dd className={`break-words font-medium leading-snug text-ink tabular ${v.mono ? "font-mono text-sm" : "text-body"}`}>{v.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LeftOut({ dropped }: { dropped: readonly { what: string; why: string }[] }) {
  if (dropped.length === 0) return null;
  return (
    <div className="mt-4 grid gap-1.5">
      <h4 className="text-sm font-medium text-ink">Left out</h4>
      <ul className="grid gap-1.5 text-sm text-ink-2">
        {dropped.slice(0, 8).map((d, i) => (
          <li key={i} className="flex items-start gap-2">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
            <span>
              <span className="text-ink">{d.what}.</span> {d.why}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChangeCard(props: {
  words: string;
  say: string;
  ops: readonly PlanOp[];
  described: readonly Described[];
  ticked: readonly boolean[];
  onTick(i: number, on: boolean): void;
  dropped: readonly { what: string; why: string }[];
  approvedVersion: boolean;
  comparing: boolean;
  onCompare(on: boolean): void;
  onApply(): void;
  onEdit(): void;
  onDiscard(): void;
  readOnly: string | null;
}) {
  const count = props.ticked.filter(Boolean).length;
  return (
    <CardShell label="The change to check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status="approval" label="Check, then apply" />
        <button type="button" aria-pressed={props.comparing} onClick={() => props.onCompare(!props.comparing)} className={buttonClasses("ghost", "sm", "!px-3 text-xs")}>
          {props.comparing ? <EyeIcon size={14} weight="bold" aria-hidden /> : <EyeSlashIcon size={14} weight="bold" aria-hidden />}
          {props.comparing ? "Show the change" : "Show the plan without it"}
        </button>
      </div>
      <div className="mt-2 grid gap-1.5">
        <Words words={props.words} quotes={props.ops.map((o) => o.quote)} />
        {props.say ? <p className="text-label text-ink">{props.say}</p> : null}
      </div>
      <ul className="mt-3 grid gap-1.5">
        {props.ops.map((op, i) => {
          const d = props.described[i]!;
          const caution = tierOf(op) === "caution";
          return (
            <li key={i} className={`rounded-sm px-3 py-2 ring-1 ${caution ? "bg-surface ring-caution/40" : "bg-canvas-2 ring-line"}`}>
              <label className="flex min-h-11 cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={props.ticked[i] ?? true} onChange={(e) => props.onTick(i, e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-1.5 text-label font-medium text-ink-2">
                    {caution ? <WarningCircleIcon size={14} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden /> : null}
                    {d.text}
                  </span>
                  <Values values={d.values} />
                  {d.warnings?.length ? (
                    <span className="mt-1.5 grid gap-1">
                      {d.warnings.map((w, k) => (
                        <span key={k} className="flex items-start gap-1.5 text-label text-ink">
                          <WarningCircleIcon size={14} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
                          {w}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <LeftOut dropped={props.dropped} />
      {props.approvedVersion ? <p className="mt-4 text-sm text-ink-2">This version is approved. Applying a change makes a new version that needs approving again.</p> : null}
      {/* The actions stay in view at the card's foot however many changes it lists, so Apply never needs a scroll to find. */}
      {props.readOnly ? <p className="mt-3 text-label text-ink-3">{props.readOnly}</p> : null}
      {/* On phones one row: Apply takes the width, and the other two keep their names for screen readers as 44 px icon buttons, so
          the values above stay in view. */}
      <div className="sticky -bottom-3 -mx-3 -mb-3 mt-3 flex items-center gap-2 border-t border-line bg-surface px-3 py-2 max-[18em]:!flex-nowrap sm:-bottom-4 sm:-mx-4 sm:-mb-4 sm:flex-wrap sm:px-4">
        <button type="button" onClick={props.onApply} disabled={count === 0 || Boolean(props.readOnly)} className={buttonClasses("primary", "sm", "max-sm:flex-1 max-[18em]:min-w-0 max-[18em]:!min-h-[48px] max-[18em]:!gap-[6px] max-[18em]:!px-[12px]")}>
          <CheckIcon size={14} weight="bold" aria-hidden />
          {/* At the largest text sizes the button says "Apply"; the ticks above say which. */}
          <span>
            Apply
            <span className="max-[18em]:sr-only">{count === props.ops.length ? ` ${count === 1 ? "the change" : `${count} changes`}` : ` ${count} of ${props.ops.length}`}</span>
          </span>
        </button>
        <button type="button" onClick={props.onEdit} className={buttonClasses("secondary", "sm", "max-sm:size-[40px] max-sm:!min-h-[40px] max-sm:!shrink-0 max-sm:!px-0")}>
          <PencilSimpleIcon size={14} weight="bold" aria-hidden />
          <span className="max-sm:sr-only">Change the words</span>
        </button>
        <button type="button" onClick={props.onDiscard} className={buttonClasses("ghost", "sm", "max-sm:size-[40px] max-sm:!min-h-[40px] max-sm:!shrink-0 max-sm:!px-0")}>
          <XIcon size={14} weight="bold" aria-hidden />
          <span className="max-sm:sr-only">Discard</span>
        </button>
      </div>
    </CardShell>
  );
}

export function AnswerCard({ words, answers, onDone }: { words: string; answers: readonly Answer[]; onDone(): void }) {
  return (
    <CardShell label="The answer">
      <Words words={words} quotes={[]} />
      {answers.map((a, k) => (
        <div key={k} className="mt-4 grid gap-2">
          <h4 className="text-base font-medium text-ink">{a.title}</h4>
          {a.rows.length > 0 ? (
            <dl className="grid gap-2">
              {a.rows.map(([role, value], i) => (
                <div key={i} className="grid gap-0.5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-baseline sm:gap-4">
                  <dt className="text-xs text-ink-3">{role}</dt>
                  <dd className="break-words text-body font-medium text-ink tabular">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {a.note ? <p className="text-label text-ink-2">{a.note}</p> : null}
        </div>
      ))}
      <p className="mt-3 text-xs text-ink-3">Worked out by Farbaek&apos;s survey engine from the plan, not by the AI.</p>
      <div className="sticky -bottom-3 -mx-3 -mb-3 mt-3 border-t border-line bg-surface px-3 py-2 sm:-bottom-4 sm:-mx-4 sm:-mb-4 sm:px-4">
        <button type="button" onClick={onDone} className={buttonClasses("secondary", "sm")}>
          <CheckIcon size={16} weight="bold" aria-hidden />
          Done
        </button>
      </div>
    </CardShell>
  );
}

export function QuestionCard({ question, onChoose, onDismiss }: { question: AssistQuestion; onChoose(choice: string): void; onDismiss(): void }) {
  return (
    <CardShell label="A question">
      <StatusBadge status="approval" label="Your answer" />
      <p className="mt-2 text-sm text-ink">{question.text}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {question.choices.map((c) => (
          <button key={c} type="button" onClick={() => onChoose(c)} className={buttonClasses("secondary", "sm")}>
            {c}
          </button>
        ))}
        <button type="button" onClick={onDismiss} className={buttonClasses("ghost", "sm")}>
          <XIcon size={16} weight="bold" aria-hidden />
          Leave it
        </button>
      </div>
      <p className="mt-3 text-sm text-ink-3">{question.choices.length ? "Or say or type the answer." : "Say or type the answer."}</p>
    </CardShell>
  );
}

export function HandoffCard(props: { words: string; described: Described; action: string; why: string; onOpen(): void; onDismiss(): void }) {
  return (
    <CardShell label="Hand over to a tool">
      <Words words={props.words} quotes={[]} />
      <p className="mt-2 text-label font-medium text-ink">{props.described.text}</p>
      <Values values={props.described.values} />
      <p className="mt-2 text-label text-ink-2">{props.why}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={props.onOpen} className={buttonClasses("primary", "sm")}>
          <ArrowSquareOutIcon size={14} weight="bold" aria-hidden />
          {props.action}
        </button>
        <button type="button" onClick={props.onDismiss} className={buttonClasses("ghost", "sm")}>
          <XIcon size={14} weight="bold" aria-hidden />
          Not now
        </button>
      </div>
    </CardShell>
  );
}

export function NoteCard({ tone, title, children, actions }: { tone: "info" | "attention" | "failed"; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <CardShell label={title}>
      <StatusBadge status={tone} label={title} />
      <div className="mt-3 grid gap-2 text-sm text-ink-2">{children}</div>
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </CardShell>
  );
}
