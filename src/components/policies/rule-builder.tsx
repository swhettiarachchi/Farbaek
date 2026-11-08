"use client";

import {
  CheckCircleIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  InfoIcon,
  PenNibIcon,
  PlusIcon,
  ProhibitIcon,
  ScalesIcon,
  ShieldCheckIcon,
  ShieldWarningIcon,
  TrashIcon,
  UserCheckIcon,
  WarningCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { activateRulesAction, draftRulesAction, testRulesAction } from "@/app/app/policies/actions";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { canonicalize } from "@/core/trust/canonical-json";
import { compilePattern, normalizePattern } from "@/core/trust/path-pattern";
import { MAX_REQUEST } from "@/core/trust/rule-draft";
import { ruleExamples, ruleFlags, type ProjectPath, type RuleExamples, type RuleFlag } from "@/core/trust/rule-review";
import { TEST_OUTCOMES, TEST_OUTCOME_WORDS, type RulesTestSummary, type TestOutcome } from "@/core/trust/rules-test";
import {
  EFFECTS,
  MAX_REASON,
  MAX_RULES,
  RULE_EFFECTS,
  RULES_SCHEMA,
  explainRule,
  nextRuleId,
  parseRuleSet,
  ruleSetHash,
  type RuleEffect,
  type RuleError,
  type WorkspaceRule,
} from "@/core/trust/workspace-rules";

interface DraftRule {
  id: string;
  effect: RuleEffect;
  /** One pattern per line, as typed. */
  paths: string;
  reason: string;
}

interface VersionItem {
  version: number;
  rules: WorkspaceRule[];
  active: boolean;
  createdAt: string;
  byYou: boolean;
  tested: { changes: number; stricter: number; looser: number } | null;
}

interface Reasons {
  readOnly: string | null;
  contributor: string | null;
  manager: string | null;
  plan: string | null;
  ai: string | null;
}

interface AiNotes {
  drafted: number;
  ambiguities: string[];
  unsupported: string[];
  dropped: string[];
}

const EFFECT_ICON: Record<RuleEffect, { icon: Icon; className: string }> = {
  block: { icon: ProhibitIcon, className: "text-failed" },
  owner_approval: { icon: ShieldWarningIcon, className: "text-approval" },
  person_approval: { icon: UserCheckIcon, className: "text-accent" },
};

const SHORT: Record<TestOutcome, string> = { stopped: "Stopped", owner: "Owner or admin", person: "A person", own: "On its own" };

const toDraft = (r: WorkspaceRule): DraftRule => ({ id: r.id, effect: r.effect, paths: r.paths.join("\n"), reason: r.reason });
const documentOf = (rules: readonly DraftRule[]) => ({ schema: RULES_SCHEMA, rules: rules.map((r) => ({ id: r.id, effect: r.effect, paths: r.paths.split("\n"), reason: r.reason })) });
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The policy builder (ADR 0082): describe a rule for AI to draft, or add one
 * by hand; read Farbaek's own sentence for each, its flags and the files it
 * matches; test the whole set against the last 90 days of real changes; then
 * activate the exact set that was tested. The server and the database check
 * every step again.
 */
export function RuleBuilder({
  active,
  versions,
  files,
  filesComplete,
  reasons,
  suggested = null,
}: {
  active: { version: number; rules: WorkspaceRule[] } | null;
  /** A rule suggested by an incident's replay (ADR 0083), added to the builder to be tested and activated. */
  suggested?: { incident: number; rule: { effect: RuleEffect; paths: string[]; reason: string } } | null;
  versions: VersionItem[];
  files: ProjectPath[];
  filesComplete: boolean;
  reasons: Reasons;
}) {
  const requestId = useId();
  const [rules, setRules] = useState<DraftRule[]>(() => {
    const start = (active?.rules ?? []).map(toDraft);
    return suggested ? [...start, { id: nextRuleId(start), effect: suggested.rule.effect, paths: suggested.rule.paths.join("\n"), reason: suggested.rule.reason }] : start;
  });
  const [request, setRequest] = useState("");
  const [notes, setNotes] = useState<AiNotes | null>(null);
  const [test, setTest] = useState<{ canon: string; summary: RulesTestSummary } | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "done"; text: string } | null>(null);
  const [drafting, startDraft] = useTransition();
  const [testing, startTest] = useTransition();
  const [activating, startActivate] = useTransition();

  const parsed = parseRuleSet(documentOf(rules));
  const canon = parsed.ok ? canonicalize(parsed.set) : null;
  const activeCanon = useMemo(() => canonicalize({ schema: RULES_SCHEMA, rules: active?.rules ?? [] }), [active]);
  const preview = useMemo<WorkspaceRule[]>(() => rules.map((r) => ({ id: r.id, effect: r.effect, paths: r.paths.split("\n").map(normalizePattern).filter(Boolean), reason: r.reason })), [rules]);
  // "Matches no file" is only said when every file was read.
  const flags = useMemo(() => ruleFlags(preview, files).filter((f) => filesComplete || f.kind !== "no_match"), [preview, files, filesComplete]);
  const examples = useMemo(() => ruleExamples(preview, files), [preview, files]);

  const hasRules = rules.length > 0;
  const activeHasRules = (active?.rules.length ?? 0) > 0;
  const tested = test !== null && canon !== null && test.canon === canon;
  const same = canon !== null && canon === activeCanon;
  const invalid = parsed.ok ? null : "Fix the marked fields first.";
  const draftReason = reasons.readOnly ?? reasons.contributor ?? reasons.plan ?? reasons.ai;
  const testReason = reasons.readOnly ?? reasons.contributor ?? (hasRules ? reasons.plan : null) ?? invalid ?? (!hasRules && !activeHasRules ? "Add a rule first." : null);
  const activateReason =
    reasons.readOnly ??
    reasons.manager ??
    (hasRules ? reasons.plan : null) ??
    invalid ??
    (!hasRules && !activeHasRules ? "Add a rule first." : null) ??
    (same ? "These are the active rules already." : null) ??
    (tested ? null : "Test these rules against past changes first.");
  const nextVersion = Math.max(0, ...versions.map((v) => v.version)) + 1;

  const update = (i: number, patch: Partial<DraftRule>) => {
    setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setMessage(null);
  };
  const add = () => setRules((rs) => [...rs, { id: nextRuleId(rs), effect: "owner_approval", paths: "", reason: "" }]);
  const remove = (i: number) => setRules((rs) => rs.filter((_, j) => j !== i));
  const load = (v: VersionItem) => {
    setRules(v.rules.map(toDraft));
    setTest(null);
    setNotes(null);
    setMessage({ tone: "done", text: `Version ${v.version} is in the builder. Test it, then activate it to use it again.` });
    document.getElementById("rule-builder")?.scrollIntoView({ block: "start" });
  };

  const draft = () =>
    startDraft(async () => {
      const r = await draftRulesAction({ request });
      if (r.status === "error") {
        setMessage({ tone: "error", text: r.message });
        return;
      }
      setRules((rs) => {
        const next = [...rs];
        for (const d of r.rules) {
          if (next.length >= MAX_RULES) break;
          next.push({ id: nextRuleId(next), effect: d.effect, paths: d.paths.join("\n"), reason: d.reason });
        }
        return next;
      });
      setNotes({ drafted: r.rules.length, ambiguities: r.ambiguities, unsupported: r.unsupported, dropped: r.dropped });
      setMessage(null);
    });

  const runTest = () => {
    if (!parsed.ok || canon === null) return;
    const set = parsed.set;
    const at = canon;
    startTest(async () => {
      const r = await testRulesAction({ document: set });
      if (r.status === "error") setMessage({ tone: "error", text: r.message });
      else setTest({ canon: at, summary: r.summary });
    });
  };

  const activate = () => {
    if (!parsed.ok) return;
    const set = parsed.set;
    startActivate(async () => {
      const r = await activateRulesAction({ document: set, sha256: await ruleSetHash(set), incident: suggested?.incident });
      if (r.status === "error") setMessage({ tone: "error", text: r.message });
      else {
        setTest(null);
        setMessage({ tone: "done", text: set.rules.length ? `Version ${r.version} is active. Every new change follows it.` : `Version ${r.version} is active: every workspace rule is off.` });
      }
    });
  };

  return (
    <div id="rule-builder" className="grid scroll-mt-24 gap-6">
      <div>
        <h3 className="text-base font-medium">Change the rules</h3>
        <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-ink-2">
          Start from the active rules, describe a new one for AI to draft, or add one by hand. Nothing applies until you test the set against past changes and activate it.
        </p>
      </div>

      <div className="grid gap-2 rounded-sm bg-surface-raised/60 p-4">
        <label htmlFor={requestId} className="text-sm font-medium">
          Describe a rule
        </label>
        <textarea
          id={requestId}
          rows={2}
          value={request}
          maxLength={MAX_REQUEST}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="For example: billing code needs an owner to approve, and nobody changes the migrations folder."
          className="min-h-11 rounded-sm border border-line bg-surface px-3 py-2 text-base sm:text-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={draft} disabled={drafting || Boolean(draftReason) || request.trim().length < 5} className={buttonClasses("secondary", "sm")}>
            <PenNibIcon size={16} aria-hidden /> {drafting ? "Drafting…" : "Draft with AI"}
          </button>
          <span className="text-xs text-ink-3">{draftReason ?? "AI only fills in the rules below. You check, test and activate them."}</span>
        </div>
      </div>

      {suggested ? (
        <p className="flex items-start gap-2.5 rounded-sm border border-accent/30 bg-accent/[0.04] px-4 py-3 text-sm leading-relaxed">
          <ScalesIcon size={18} className="mt-px shrink-0 text-accent" aria-hidden />
          <span>
            The rule suggested by{" "}
            <Link href={`/app/incidents/${suggested.incident}`} className="font-medium text-accent hover:underline">
              problem #{suggested.incident}
            </Link>{" "}
            is added below. Test the set against past changes, then activate it, and the problem will record it.
          </span>
        </p>
      ) : null}

      {notes ? <AiNotesPanel notes={notes} /> : null}

      {hasRules ? (
        <ol className="grid gap-4">
          {rules.map((r, i) => (
            <RuleCard
              key={r.id}
              index={i}
              rule={r}
              errors={parsed.ok ? [] : parsed.errors.filter((e) => e.rule === i)}
              flags={flags.filter((f) => f.rule === r.id)}
              examples={examples.find((x) => x.rule === r.id) ?? null}
              filesKnown={files.length > 0}
              filesComplete={filesComplete}
              onChange={(patch) => update(i, patch)}
              onRemove={() => remove(i)}
            />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-2">{activeHasRules ? "No rules in the builder. Activating this turns every workspace rule off." : "No rules in the builder yet."}</p>
      )}

      <div>
        <button type="button" onClick={add} disabled={rules.length >= MAX_RULES} className={buttonClasses("secondary", "sm")}>
          <PlusIcon size={16} aria-hidden /> Add a rule
        </button>
      </div>

      <div className="grid gap-3 border-t border-line pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={runTest} disabled={testing || Boolean(testReason)} className={buttonClasses("secondary", "sm")}>
            <ClockCounterClockwiseIcon size={16} aria-hidden /> {testing ? "Testing…" : "Test against the last 90 days"}
          </button>
          <span className="text-xs text-ink-3">{testReason ?? "See what these rules would have done with your real changes. Nothing is applied."}</span>
        </div>
        {test ? <TestResult summary={test.summary} stale={!tested} /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={activate} disabled={activating || Boolean(activateReason)} className={buttonClasses("primary", "sm")}>
          <ShieldCheckIcon size={16} aria-hidden /> {activating ? "Activating…" : !hasRules && activeHasRules ? "Turn every rule off" : `Activate as version ${nextVersion}`}
        </button>
        <span className="text-sm text-ink-3">{activateReason ?? "Every new change follows it from then on. Earlier changes keep the decision they had."}</span>
      </div>
      {message ? (
        message.tone === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {message.text}
          </p>
        ) : (
          <p role="status" className="flex items-start gap-2 text-sm text-verified">
            <CheckCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {message.text}
          </p>
        )
      ) : null}

      {versions.length > 0 ? <VersionHistory versions={versions} onLoad={load} /> : null}
    </div>
  );
}

function RuleCard({
  index,
  rule,
  errors,
  flags,
  examples,
  filesKnown,
  filesComplete,
  onChange,
  onRemove,
}: {
  index: number;
  rule: DraftRule;
  errors: RuleError[];
  flags: RuleFlag[];
  examples: RuleExamples | null;
  filesKnown: boolean;
  filesComplete: boolean;
  onChange: (patch: Partial<DraftRule>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const pathErrors = errors.filter((e) => e.field === "paths");
  const reasonErrors = errors.filter((e) => e.field === "reason");
  const valid = rule.paths
    .split("\n")
    .map(normalizePattern)
    .filter((p) => p && compilePattern(p).ok);

  return (
    <li className="grid gap-4 rounded-md border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Rule {index + 1}</p>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove rule ${index + 1}`}
          className="inline-flex size-11 items-center justify-center rounded-full text-ink-3 transition-colors duration-150 hover:bg-surface-raised hover:text-failed"
        >
          <TrashIcon size={18} aria-hidden />
        </button>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">What a change to these files needs</legend>
        <div className="flex flex-wrap gap-2">
          {RULE_EFFECTS.map((e) => {
            const { icon: EffectIcon, className } = EFFECT_ICON[e];
            const on = rule.effect === e;
            return (
              <label
                key={e}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm text-ink-2 transition-colors duration-150 has-checked:border-accent has-checked:bg-accent/[0.06] has-checked:font-medium has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-accent"
              >
                <input type="radio" name={`${id}-effect`} value={e} checked={on} onChange={() => onChange({ effect: e })} className="sr-only" />
                {on ? <CheckIcon size={16} weight="bold" className="text-accent" aria-hidden /> : <EffectIcon size={16} weight="bold" className={className} aria-hidden />}
                {EFFECTS[e].label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-paths`} className="text-sm font-medium">
          Files
        </label>
        <textarea
          id={`${id}-paths`}
          rows={Math.min(6, Math.max(2, rule.paths.split("\n").length))}
          value={rule.paths}
          onChange={(e) => onChange({ paths: e.target.value })}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-invalid={pathErrors.length > 0}
          aria-describedby={`${id}-paths-hint`}
          placeholder={"src/billing/\n*.sql"}
          className="rounded-sm border border-line bg-surface px-3 py-2 font-mono text-base sm:text-sm"
        />
        <p id={`${id}-paths-hint`} className="text-xs leading-relaxed text-ink-3">
          One pattern per line, from the project&apos;s root. <span className="font-mono">src/billing/</span> is everything in that folder, <span className="font-mono">*.sql</span> is those
          files in any folder, and <span className="font-mono">**</span> is any number of folders.
        </p>
        <FieldErrors errors={pathErrors} />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-reason`} className="text-sm font-medium">
          Why
        </label>
        <input
          id={`${id}-reason`}
          value={rule.reason}
          maxLength={MAX_REASON}
          onChange={(e) => onChange({ reason: e.target.value })}
          aria-invalid={reasonErrors.length > 0}
          placeholder="Billing changes need an owner's eye."
          className="min-h-11 rounded-sm border border-line bg-surface px-3 text-base sm:text-sm"
        />
        <FieldErrors errors={reasonErrors} />
      </div>

      {valid.length > 0 ? (
        <p className="flex items-start gap-2 rounded-sm bg-surface-raised/60 px-3 py-2.5 text-sm leading-relaxed">
          <ScalesIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
          <span>
            <span className="font-medium">Reads as: </span>
            {explainRule({ paths: valid, effect: rule.effect })}
          </span>
        </p>
      ) : null}

      {examples && filesKnown ? (
        examples.count > 0 ? (
          <div className="text-sm text-ink-2">
            <p>
              Matches {plural(examples.count, "file", "files")}
              {filesComplete ? "" : " among the files read"}
              {examples.count > examples.files.length ? ", including:" : ":"}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {examples.files.map((f) => (
                <li key={f} className="max-w-full truncate rounded-full border border-line bg-surface-raised/60 px-2 py-0.5 font-mono text-xs">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ) : null
      ) : null}

      {flags.length > 0 ? (
        <ul className="grid gap-1.5">
          {flags.map((f, i) => (
            <li key={`${f.kind}-${i}`} className={`flex items-start gap-2 text-sm ${f.tone === "warning" ? "text-ink" : "text-ink-2"}`}>
              {f.tone === "warning" ? (
                <WarningIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-approval" aria-hidden />
              ) : (
                <InfoIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              )}
              <span>
                <span className="sr-only">{f.tone === "warning" ? "Check: " : "Note: "}</span>
                {f.text}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function FieldErrors({ errors }: { errors: RuleError[] }) {
  if (errors.length === 0) return null;
  return (
    <ul className="grid gap-1">
      {errors.map((e, i) => (
        <li key={i} className="flex items-start gap-1.5 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {e.message}
        </li>
      ))}
    </ul>
  );
}

function AiNotesPanel({ notes }: { notes: AiNotes }) {
  const groups = [
    { title: "What it assumed", items: notes.ambiguities, mono: false },
    { title: "What rules can't express, so it left out", items: notes.unsupported, mono: false },
    { title: "Patterns it left out because they weren't valid", items: notes.dropped, mono: true },
  ].filter((g) => g.items.length > 0);
  return (
    <div className="grid gap-3 rounded-sm border border-dashed border-line-strong/60 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <PenNibIcon size={16} className="text-accent" aria-hidden /> AI noted
      </p>
      <p className="text-ink-2">
        {notes.drafted === 0 ? "It couldn't draft a rule from that description. Try different words, or add a rule by hand." : `It added ${plural(notes.drafted, "rule", "rules")} below. Check each one.`}
      </p>
      {groups.map((g) => (
        <div key={g.title}>
          <p className="text-ink-2">{g.title}:</p>
          <ul className="mt-1 grid list-disc gap-1 pl-5">
            {g.items.map((item) => (
              <li key={item} className={g.mono ? "break-all font-mono text-xs" : ""}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TestResult({ summary, stale }: { summary: RulesTestSummary; stale: boolean }) {
  const id = useId();
  const differ = summary.stricter + summary.looser;
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-md border border-dashed border-simulated/40 bg-simulated/[0.03] p-4 sm:p-5">
      <h4 id={id} className="text-base font-medium">
        Tested against the last {summary.days} days
      </h4>
      {stale ? (
        <p role="status" className="flex items-start gap-2 text-sm">
          <WarningIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-approval" aria-hidden /> These rules changed after this test. Test them again before activating.
        </p>
      ) : null}

      {summary.changes === 0 ? (
        <p className="text-[0.9375rem]">There were no changes in the last {summary.days} days to test against. The rules still apply to every new change.</p>
      ) : (
        <>
          <p className="text-[0.9375rem]">
            {differ === 0
              ? `None of the ${plural(summary.changes, "change", "changes")} would have been decided differently.`
              : `Of ${plural(summary.changes, "change", "changes")}, ${summary.stricter.toLocaleString("en-US")} would have needed more and ${summary.looser.toLocaleString("en-US")} less than under today's rules.`}
          </p>
          <table className="w-full text-sm">
            <caption className="sr-only">What the changes would have needed</caption>
            <thead>
              <tr className="text-xs text-ink-3">
                <th scope="col" className="pb-1.5 text-left font-normal">
                  Would have
                </th>
                <th scope="col" className="pb-1.5 text-right font-normal">
                  Today
                </th>
                <th scope="col" className="pb-1.5 text-right font-normal">
                  With these rules
                </th>
              </tr>
            </thead>
            <tbody>
              {TEST_OUTCOMES.map((o) => (
                <tr key={o} className="border-t border-line">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {capital(TEST_OUTCOME_WORDS[o])}
                  </th>
                  <td className="py-1.5 text-right tabular">{summary.before[o].toLocaleString("en-US")}</td>
                  <td className="py-1.5 text-right font-medium tabular">{summary.after[o].toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.changed.length > 0 ? (
            <div>
              <p className="text-sm font-medium">Changes decided differently</p>
              <ul className="mt-1 grid">
                {summary.changed.map((c) => (
                  <li key={c.proposalId}>
                    <Link href={`/app/tasks/${c.taskId}`} className="inline-flex min-h-11 flex-wrap items-center gap-x-2 text-sm hover:underline">
                      <span className="font-mono text-xs text-accent">{c.paths[0] ?? "A change"}</span>
                      {c.paths.length > 1 ? <span className="text-ink-3">and {plural(c.paths.length - 1, "other", "others")}</span> : null}
                      <span className="text-ink-2">
                        {SHORT[c.from]} <span aria-hidden>→</span>
                        <span className="sr-only"> would become </span> {SHORT[c.to]}
                      </span>
                      <span className="text-xs text-ink-3">
                        <LocalTime iso={c.createdAt} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {differ > summary.changed.length ? <p className="text-xs text-ink-3">And {plural(differ - summary.changed.length, "more", "more")} not listed.</p> : null}
            </div>
          ) : null}
        </>
      )}
      <p className="text-xs leading-relaxed text-ink-3">Judged with today&apos;s settings. Nothing was applied or changed: these are predictions from past changes.</p>
    </section>
  );
}

function VersionHistory({ versions, onLoad }: { versions: VersionItem[]; onLoad: (v: VersionItem) => void }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-3 border-t border-line pt-5">
      <h3 id={id} className="text-base font-medium">
        Versions
      </h3>
      <ol className="grid gap-2">
        {versions.map((v) => (
          <li key={v.version} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line px-4 py-3">
            <div className="grid gap-0.5">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                Version {v.version}
                {v.active ? (
                  <span className="inline-flex items-center rounded-full border border-accent/40 px-2.5 py-0.5 text-xs font-medium text-accent">Active</span>
                ) : null}
              </p>
              <p className="text-xs leading-relaxed text-ink-3">
                {v.rules.length === 0 ? "Every rule off" : plural(v.rules.length, "rule", "rules")}, activated <RelativeTime iso={v.createdAt} /> by {v.byYou ? "you" : "another owner or admin"}.
                {v.tested ? ` Tested over ${plural(v.tested.changes, "change", "changes")}: ${v.tested.stricter} stricter, ${v.tested.looser} looser.` : ""}
              </p>
            </div>
            <button type="button" onClick={() => onLoad(v)} className={buttonClasses("ghost", "sm")}>
              Open in the builder
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
