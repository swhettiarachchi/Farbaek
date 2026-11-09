import { ArrowUpRightIcon, CheckCircleIcon, ArrowsClockwiseIcon, MinusCircleIcon, ShieldWarningIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import RUN from "@/content/security-eval-run.json";
import { OWASP_RISKS, RISK_LISTS, coverageFor, runTotals, type EvalRun, type OwaspRisk, type RiskCoverage, type RiskList } from "@/core/security-eval/catalog";

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
    icon: MinusCircleIcon,
    title: "Not a certification, and not complete",
    body: "A tested risk means at least one scenario covers part of it. Every risk lists what isn't tested. This is Farbaek's own suite, not an audit by anyone else.",
  },
];

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
}

/** A risk's state in words and its frame: a check when tested and passing, a cross when failing, and words alone otherwise (ADR 0180). */
function tileState(c: RiskCoverage): { label: string; Icon: Icon | null; tone: string; frame: string } {
  if (c.state === "not_applicable") return { label: "Not applicable", Icon: null, tone: "text-ink-3", frame: "border border-transparent bg-surface-sunken" };
  if (c.state === "not_tested") return { label: "Not tested", Icon: null, tone: "text-ink-3", frame: "border border-dashed border-line-strong" };
  const failing = c.scenarios.filter((s) => s.result?.status === "failed").length;
  if (failing > 0) return { label: `${failing} failing`, Icon: XCircleIcon, tone: "text-failed", frame: "border border-failed/40 bg-surface shadow-e1" };
  const n = c.scenarios.length;
  return { label: `Tested in ${n} ${n === 1 ? "scenario" : "scenarios"}`, Icon: CheckCircleIcon, tone: "text-verified", frame: "border border-line bg-surface shadow-e1" };
}

function RiskTile({ risk }: { risk: OwaspRisk }) {
  const s = tileState(coverageFor(risk.id, run));
  return (
    <li>
      <a
        href={`#${risk.id}`}
        className={`grid h-full min-h-[118px] content-between gap-3 rounded-md p-4 transition-colors duration-150 hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${s.frame}`}
      >
        <span className="text-[0.8125rem] font-medium text-ink-3 tabular">{risk.id}</span>
        <span className="text-[0.9375rem] font-medium leading-snug tracking-[-0.01em] text-ink">{risk.title}</span>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${s.tone}`}>
          {s.Icon ? <s.Icon size={15} weight="bold" aria-hidden /> : null} {s.label}
        </span>
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
        <h4 className="text-[1.0625rem] font-medium tracking-[-0.01em]">
          <span className="mr-2 text-ink-3 tabular">{risk.id}</span>
          {risk.title}
        </h4>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${s.tone}`}>
          {s.Icon ? <s.Icon size={15} weight="bold" aria-hidden /> : null} {s.label}
        </span>
      </header>
      {c.state === "tested" ? (
        <ul className="mt-4 grid gap-3">
          {c.scenarios.map(({ scenario, result }) => (
            <li key={scenario.id} className="grid gap-1 border-l-2 border-line pl-3">
              <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                <span className="text-ink-3 tabular">{scenario.id}</span> {scenario.title}
                {result ? (
                  <span className={`inline-flex items-center gap-1 text-xs ${result.status === "passed" ? "text-verified" : "text-failed"}`}>
                    {result.status === "passed" ? <CheckCircleIcon size={13} weight="bold" aria-hidden /> : <XCircleIcon size={13} weight="bold" aria-hidden />}
                    {result.status === "passed" ? "Passed" : "Failed"}
                  </span>
                ) : (
                  <span className="text-xs text-ink-3">Not in the last run</span>
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
          <h1 className="max-w-[18ch] text-balance text-[2.5rem] font-medium leading-[1.05] tracking-[-0.04em] sm:text-[3.5rem]">Tested against agent risks, in the open.</h1>
          <p className="mt-5 max-w-[60ch] text-[1.0625rem] leading-relaxed text-ink-2">
            Farbaek&apos;s agents read code they didn&apos;t write and run commands, so its boundaries are attacked on purpose. The {totals.scenarios} scenarios here are mapped to
            the OWASP risk lists for agentic and LLM applications. Each one assumes the model has already been fooled, and checks that the boundary holds anyway.
          </p>
          {/* One sentence, not a strip of tiles (ADR 0180). The engineering facts sit behind a fold for anyone checking the run. */}
          <p className={`mt-8 flex items-center gap-2 text-[1.0625rem] font-medium ${totals.failed ? "text-failed" : "text-ink"}`}>
            {totals.failed ? <XCircleIcon size={20} weight="bold" className="shrink-0 text-failed" aria-hidden /> : <CheckCircleIcon size={20} weight="bold" className="shrink-0 text-verified" aria-hidden />}
            <span>
              Last run on {dateLabel(run.ranAt)}: {totals.passed} of {totals.scenarios} scenarios passed.
            </span>
          </p>
          <details className="mt-3 text-sm text-ink-3">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center hover:text-ink [&::-webkit-details-marker]:hidden">Technical details</summary>
            <p className="mt-1">
              {totals.tests} tests across the scenarios, recorded at commit <span className="font-mono">{run.commit.slice(0, 7)}</span>.
            </p>
          </details>
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
                  <h2 id={`${list}-title`} className="text-[1.5rem] font-medium leading-tight tracking-[-0.03em]">
                    {meta.title}
                  </h2>
                  <p className="mt-1 text-sm text-ink-2">
                    {tested} of {risks.length} tested{na ? `, ${na} not applicable` : ""}. Select a risk for its scenarios and what isn&apos;t tested.
                  </p>
                </div>
                <a href={meta.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent hover:underline">
                  The list on owasp.org <ArrowUpRightIcon size={14} aria-hidden />
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
                <m.icon size={24} className="text-accent" aria-hidden />
                <h3 className="text-[1.0625rem] font-medium">{m.title}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-ink-2">{m.body}</p>
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
