import { ArrowUpRightIcon, ArrowsClockwiseIcon, SealWarningIcon, ShieldWarningIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { STATUS_KINDS, StatusGlyph, type Status } from "@/components/ui/status-badge";
import RUN from "@/content/security-eval-run.json";
import { OWASP_RISKS, RISK_LISTS, coverageFor, runTotals, type EvalRun, type OwaspRisk, type RiskCoverage, type RiskList } from "@/core/security-eval/catalog";
import { PUBLIC_TITLE } from "@/components/ui/titles";

export const metadata: Metadata = {
  title: "Security tests",
  description: "How Farbaek tests its own boundaries against the OWASP risk lists for agentic and LLM applications: every scenario, its latest result, and what isn't tested.",
};

const run = RUN as EvalRun;
const LISTS: RiskList[] = ["agentic-2026", "llm-2025"];

const MEANING = [
  {
    icon: ArrowsClockwiseIcon,
    title: "Deterministic, and run on every change",
    body: "Each scenario drives Farbaek's real permission engine, command broker, sandbox guard, approvals and database with attack-shaped input, and asserts what must be refused. They run with every test run, not once for a report.",
  },
  {
    icon: ShieldWarningIcon,
    title: "They assume the model was fooled",
    body: "The scenarios don't measure whether an AI model resists manipulation. They script a model that obeys planted instructions, and check that the boundaries hold anyway.",
  },
  {
    icon: SealWarningIcon,
    title: "Not a certification, and not complete",
    body: "A tested risk means at least one scenario covers part of it. Every risk lists what isn't tested. This is Farbaek's own suite, not an audit by anyone else.",
  },
];

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
}

/** The text colour of a kind, for words that sit beside its glyph. */
const toneOf = (kind: Status) => STATUS_KINDS[kind].className.split(" ").find((c) => c.startsWith("text-")) ?? "text-ink-3";

/** A risk's state as its kind (ADR 0183): tested, failing, not applicable or not tested, each with its words, icon and colour. */
function tileState(c: RiskCoverage): { label: string; kind: Status; frame: string } {
  if (c.state === "not_applicable") return { label: "Not applicable", kind: "off", frame: "border border-transparent bg-surface-sunken" };
  if (c.state === "not_tested") return { label: "Not tested", kind: "unverified", frame: "border border-line-2 bg-surface" };
  const failing = c.scenarios.filter((s) => s.result?.status === "failed").length;
  if (failing > 0) return { label: `${failing} failing`, kind: "failed", frame: "border border-failed/40 bg-surface shadow-e1" };
  const n = c.scenarios.length;
  return { label: `Tested in ${n} ${n === 1 ? "scenario" : "scenarios"}`, kind: "verified", frame: "border border-line bg-surface shadow-e1" };
}

function TileStatus({ label, kind }: { label: string; kind: Status }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium ${toneOf(kind)}`}>
      <StatusGlyph status={kind} size={14} /> {label}
    </span>
  );
}

function RiskTile({ risk }: { risk: OwaspRisk }) {
  const s = tileState(coverageFor(risk.id, run));
  return (
    <li>
      <a
        href={`#${risk.id}`}
        className={`grid h-full min-h-[118px] content-between gap-3 rounded-md p-4 transition-colors duration-150 hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${s.frame}`}
      >
        <span className="text-label font-medium text-ink-3 tabular">{risk.id}</span>
        <span className="text-body font-medium leading-snug tracking-[-0.01em] text-ink">{risk.title}</span>
        <TileStatus label={s.label} kind={s.kind} />
      </a>
    </li>
  );
}

function RiskDetail({ risk }: { risk: OwaspRisk }) {
  const c = coverageFor(risk.id, run);
  const s = tileState(c);
  return (
    <article id={risk.id} className="scroll-mt-24 rounded-md border border-line bg-surface p-5 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h4 className="text-title-4 font-medium tracking-[-0.01em]">
          <span className="mr-2 text-ink-3 tabular">{risk.id}</span>
          {risk.title}
        </h4>
        <TileStatus label={s.label} kind={s.kind} />
      </header>
      {c.state === "tested" ? (
        <ul className="mt-4 grid gap-3">
          {c.scenarios.map(({ scenario, result }) => (
            <li key={scenario.id} className="grid gap-1 border-l-2 border-line pl-3">
              <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                <span className="text-ink-3 tabular">{scenario.id}</span> {scenario.title}
                {result ? (
                  <span className={`inline-flex items-center gap-1 text-xs ${result.status === "passed" ? "text-verified" : "text-failed"}`}>
                    <StatusGlyph status={result.status === "passed" ? "verified" : "failed"} size={14} />
                    {result.status === "passed" ? "Passed" : "Failed"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-unverified">
                    <StatusGlyph status="unverified" size={14} />
                    Not in the last run
                  </span>
                )}
              </p>
              <p className="text-sm leading-relaxed text-ink-2">{scenario.asserts}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-4 text-sm leading-relaxed text-ink-3">
        <span className="font-medium text-ink-2">{c.state === "not_applicable" ? "Why it doesn't apply: " : "Not tested: "}</span>
        {c.state === "not_applicable" ? c.reason : c.untested}
      </p>
    </article>
  );
}

export default function SecurityTestsPage() {
  const totals = runTotals(run);
  return (
    <>
      <section className="pt-14 pb-12 sm:pt-20 lg:pt-24">
        <Container>
          <h1 className={`max-w-[18ch] ${PUBLIC_TITLE}`}>Tested against agent risks, in the open.</h1>
          <p className="mt-5 max-w-[60ch] text-title-4 leading-relaxed text-ink-2">
            Farbaek&apos;s agents read code they didn&apos;t write and run commands, so its boundaries are attacked on purpose. The {totals.scenarios} scenarios here are mapped to
            the OWASP risk lists for agentic and LLM applications. Each one assumes the model has already been fooled, and checks that the boundary holds anyway.
          </p>
          {/* One sentence, not a strip of tiles (ADR 0180). The engineering facts sit behind a fold for anyone checking the run. */}
          <p className={`mt-8 flex items-center gap-2 text-title-4 font-medium ${totals.failed ? "text-failed" : "text-ink"}`}>
            <StatusGlyph status={totals.failed ? "failed" : "verified"} size={20} />
            <span>
              Last run on {dateLabel(run.ranAt)}: {totals.passed} of {totals.scenarios} scenarios passed.
            </span>
          </p>
        </Container>
      </section>

      {LISTS.map((list) => {
        const risks = OWASP_RISKS.filter((r) => r.list === list);
        const states = risks.map((r) => coverageFor(r.id, run).state);
        const tested = states.filter((s) => s === "tested").length;
        const na = states.filter((s) => s === "not_applicable").length;
        const meta = RISK_LISTS[list];
        return (
          <section key={list} aria-labelledby={`${list}-title`} className="pb-14">
            <Container>
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-t border-line pt-8">
                <div>
                  <h2 id={`${list}-title`} className="text-2xl font-medium leading-tight tracking-[-0.03em]">
                    {meta.title}
                  </h2>
                  <p className="mt-1 text-sm text-ink-2">
                    {tested} of {risks.length} tested{na ? `, ${na} not applicable` : ""}. Select a risk for its scenarios and what isn&apos;t tested.
                  </p>
                </div>
                <a href={meta.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent hover:underline">
                  The list on owasp.org <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
                </a>
              </div>
              <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                {risks.map((r) => (
                  <RiskTile key={r.id} risk={r} />
                ))}
              </ul>
            </Container>
          </section>
        );
      })}

      <section aria-labelledby="details-title" className="border-t border-line bg-canvas-2 py-16 lg:py-20">
        <Container>
          <h2 id="details-title" className="max-w-[26ch] text-balance text-[1.75rem] font-medium leading-tight tracking-[-0.03em]">
            Every risk: what&apos;s tested, and what isn&apos;t.
          </h2>
          {LISTS.map((list) => (
            <div key={list} className="mt-10">
              <h3 className="text-base font-medium text-ink-2">{RISK_LISTS[list].short}</h3>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {OWASP_RISKS.filter((r) => r.list === list).map((r) => (
                  <RiskDetail key={r.id} risk={r} />
                ))}
              </div>
            </div>
          ))}
        </Container>
      </section>

      <section aria-labelledby="meaning-title" className="border-t border-line bg-surface py-16 lg:py-20">
        <Container>
          <h2 id="meaning-title" className="max-w-[24ch] text-balance text-[1.75rem] font-medium leading-tight tracking-[-0.03em]">
            What these tests are, and aren&apos;t.
          </h2>
          <ul className="mt-10 grid gap-8 sm:grid-cols-3">
            {MEANING.map((m) => (
              <li key={m.title} className="grid content-start gap-3">
                <m.icon size={24} className="text-ink-2" aria-hidden />
                <h3 className="text-title-4 font-medium">{m.title}</h3>
                <p className="text-body leading-relaxed text-ink-2">{m.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-10 max-w-[70ch] text-sm leading-relaxed text-ink-3">
            The risk titles are OWASP&apos;s. They come from the {RISK_LISTS["agentic-2026"].title} (published {dateLabel(RISK_LISTS["agentic-2026"].published)}) and the{" "}
            {RISK_LISTS["llm-2025"].title}. The results above come from the suite&apos;s latest recorded run. Found something it misses? Write to us from the address below.
          </p>
        </Container>
      </section>
    </>
  );
}
