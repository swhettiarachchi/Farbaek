import {
  ArrowUpIcon,
  ChatCircleTextIcon,
  CheckIcon,
  FilePdfIcon,
  MagnifyingGlassIcon,
  MicrophoneIcon,
  PaperclipIcon,
  PencilSimpleIcon,
  PushPinIcon,
} from "@phosphor-icons/react/ssr";
import type { CSSProperties, ReactNode } from "react";
import { DiffView } from "@/components/code/diff-view";
import { ProofPackSeal } from "@/components/proof/proofpack-seal";
import { samplePlan } from "@/components/survey/sample-plan";
import { SheetSvg } from "@/components/survey/sheet-svg";
import { StatusGlyph, type Status } from "@/components/ui/status-badge";
import { SAMPLE_CHANGED_FILE, SAMPLE_DIFF, buildSampleProofPack } from "@/content/samples";
import { modelName } from "@/core/billing/model-names";
import { canonicalHash } from "@/core/trust/canonical-json";

/**
 * A glimpse of each space's interface for the homepage window (ADR 0214): drawn from tokens with sample content, so
 * nothing loads and nothing pretends to be live. Pieces marked `glimpse-rise` rise in, one after another, when their
 * tab opens (globals.css); still under reduced motion.
 */

function rise(i: number): CSSProperties {
  return { "--rise": `${80 + i * 70}ms` } as CSSProperties;
}

function Rise({ i, className = "", children }: { i: number; className?: string; children: ReactNode }) {
  return (
    <div className={`glimpse-rise ${className}`} style={rise(i)}>
      {children}
    </div>
  );
}

function Step({ status, children }: { status: Status; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 py-2 text-sm leading-snug text-ink-2">
      <StatusGlyph status={status} size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

/** Build: the plan and the agent's steps beside the site taking shape. */
export function BuildGlimpse() {
  return (
    <div className="grid h-full gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6">
      <Rise i={0} className="flex flex-col self-start rounded-md border border-line bg-surface p-4 shadow-e1">
        <p className="text-xs text-ink-3">Sample project</p>
        <p className="mt-1 text-body font-medium tracking-[-0.01em] text-ink">A website for a small bakery</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">Menu, opening hours and orders for collection. Keep it warm and quick on phones.</p>
        <ul className="mt-3 divide-y divide-line border-t border-line">
          <Step status="done">Plan approved</Step>
          <Step status="done">Wrote six files and the menu page</Step>
          <Step status="verified">Security check found nothing critical</Step>
          <Step status="approval">Waiting for you to publish</Step>
        </ul>
      </Rise>
      <Rise i={1} className="hidden min-h-0 flex-col overflow-hidden rounded-md border border-line bg-canvas-2 sm:flex">
        <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <span className="truncate rounded-full bg-canvas-2 px-3 py-1 text-xs text-ink-3">Preview</span>
        </div>
        {/* The sample site, drawn in blocks: its look is the bakery's, its colours are Farbaek's tokens. */}
        <div aria-hidden className="grid flex-1 content-start gap-4 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium tracking-[-0.02em] text-ink">Rosemary &amp; Rye</span>
            <span className="flex gap-2">
              <span className="h-1.5 w-8 rounded-full bg-line-strong" />
              <span className="h-1.5 w-8 rounded-full bg-line-strong" />
              <span className="h-1.5 w-8 rounded-full bg-line-strong" />
            </span>
          </div>
          <p className="max-w-[16ch] text-[1.625rem] font-medium leading-[1.05] tracking-[-0.04em] text-ink">Bread worth getting up for.</p>
          <span className="h-8 w-28 rounded-full bg-primary" />
          <div className="grid grid-cols-3 gap-2">
            {[18, 10, 26].map((tint) => (
              <span
                key={tint}
                className="aspect-[4/5] rounded-sm"
                style={{ background: `linear-gradient(160deg, color-mix(in oklab, var(--color-accent) ${tint}%, var(--color-surface)), var(--color-surface-sunken))` }}
              />
            ))}
          </div>
        </div>
      </Rise>
    </div>
  );
}

const CHATS = [
  { title: "Launch plan for the bakery", pinned: true },
  { title: "Summarise the tenancy agreement", active: true },
  { title: "Explain this SQL query" },
  { title: "Ideas for the menu page" },
];

/** Chat: the sidebar, a question with a file, and the answer as it arrives. */
export function ChatGlimpse() {
  return (
    <div className="grid h-full lg:grid-cols-[15rem_minmax(0,1fr)]">
      <Rise i={0} className="hidden flex-col gap-3 border-r border-line bg-canvas-2 p-4 lg:flex">
        <span className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-medium text-ink shadow-e1">
          <PencilSimpleIcon size={16} weight="bold" aria-hidden />
          New chat
        </span>
        <span className="flex h-10 items-center gap-2 rounded-sm border border-line bg-surface px-3 text-sm text-ink-3">
          <MagnifyingGlassIcon size={16} weight="bold" aria-hidden />
          Search chats
        </span>
        <ul className="grid gap-0.5 text-sm">
          {CHATS.map((c) => (
            <li key={c.title} className={`flex items-center gap-2 truncate rounded-full px-3 py-2 ${c.active ? "bg-surface font-medium text-ink shadow-e1" : "text-ink-2"}`}>
              {c.pinned ? <PushPinIcon size={14} weight="bold" aria-hidden className="shrink-0 text-ink-3" /> : null}
              <span className="truncate">{c.title}</span>
            </li>
          ))}
        </ul>
      </Rise>
      <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
        <Rise i={1} className="ml-auto grid max-w-[30rem] justify-items-end gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-2">
            <FilePdfIcon size={16} weight="bold" aria-hidden className="text-ink-3" />
            Tenancy agreement, PDF
          </span>
          <div className="rounded-[1.25rem] rounded-br-md bg-canvas-2 px-4 py-2.5 text-sm leading-relaxed text-ink">
            Summarise this tenancy agreement in a few points, and flag anything unusual.
          </div>
        </Rise>
        <Rise i={2} className="flex max-w-[34rem] gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <ChatCircleTextIcon size={16} weight="bold" aria-hidden />
          </span>
          <div className="min-w-0 text-sm leading-relaxed text-ink">
            <p>Here is the agreement in brief:</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-ink-2">
              <li>Three years from 1 March, with one renewal.</li>
              <li>Rent is reviewed once a year.</li>
              <li className="glimpse-caret">Unusual: you pay for repairs to the roof</li>
            </ol>
            <p className="mt-2 text-xs text-ink-3">{modelName("claude-sonnet-5-5")}</p>
          </div>
        </Rise>
        <Rise i={3} className="mt-auto">
          <div className="flex items-center gap-2 rounded-[1.5rem] border border-line bg-surface p-2 pl-4 shadow-e1">
            <span className="min-w-0 flex-1 truncate text-sm text-ink-3">Ask anything</span>
            <span className="hidden h-8 items-center rounded-full bg-canvas-2 px-3 text-xs text-ink-2 sm:inline-flex">Auto</span>
            <span className="flex size-8 items-center justify-center rounded-full text-ink-2">
              <PaperclipIcon size={16} weight="bold" aria-hidden />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full text-ink-2">
              <MicrophoneIcon size={16} weight="bold" aria-hidden />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-on-primary">
              <ArrowUpIcon size={16} weight="bold" aria-hidden />
            </span>
          </div>
        </Rise>
      </div>
    </div>
  );
}

const SURVEY_STEPS: { label: string; status: Status | null }[] = [
  { label: "Import", status: "done" },
  { label: "Points", status: "done" },
  { label: "Draft", status: "done" },
  { label: "Boundary", status: "done" },
  { label: "Plan", status: null },
  { label: "Check", status: "pending" },
  { label: "Export", status: "pending" },
];

/** Survey Studio: the steps, and the sample sheet drawn by the real plan code, with its areas from the survey engine. */
export function SurveyGlimpse() {
  const plan = samplePlan();
  return (
    <div className="grid h-full gap-4 p-4 sm:p-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
      <Rise i={0} className="hidden lg:block">
        <ol className="grid gap-0.5">
          {SURVEY_STEPS.map((s) => (
            <li key={s.label} className={`flex items-center gap-2.5 rounded-full px-3 py-2 text-sm ${s.status === null ? "bg-surface font-medium text-ink shadow-e1 ring-1 ring-line" : "text-ink-2"}`}>
              {s.status ? <StatusGlyph status={s.status} size={16} /> : <PencilSimpleIcon size={16} weight="bold" aria-hidden className="text-accent" />}
              {s.label}
            </li>
          ))}
        </ol>
      </Rise>
      <Rise i={1} className="grid min-w-0 content-start gap-3">
        <div className="overflow-hidden rounded-md border border-line bg-surface shadow-e1">
          <SheetSvg
            page={plan.detailPage}
            viewBox={plan.detail}
            label="Close-up of a sample survey plan: three lots, a road with its width and the corner marks. Synthetic sample data."
            className="h-auto max-h-[17rem] w-full"
          />
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
          {plan.lots.slice(0, 3).map((lot) => (
            <li key={lot.name}>
              Lot {lot.name} <span className="tabular font-medium text-ink">{lot.arp}</span>
            </li>
          ))}
        </ul>
      </Rise>
    </div>
  );
}

/** Proof: a change waiting for approval, and the sample ProofPack's Seal, from its real digest. */
export async function ProofGlimpse() {
  const digest = await canonicalHash(await buildSampleProofPack());
  return (
    <div className="grid h-full gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-6">
      <Rise i={0} className="flex min-w-0 flex-col self-start rounded-md border border-line bg-surface p-4 shadow-e1">
        <p className="text-xs text-ink-3">Sample change</p>
        <p className="mt-1 text-body font-medium tracking-[-0.01em] text-ink">Better product descriptions</p>
        <div className="mt-3 min-w-0">
          <DiffView lines={SAMPLE_DIFF.slice(0, 5)} path={SAMPLE_CHANGED_FILE.path} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-on-primary">
            <CheckIcon size={16} weight="bold" aria-hidden />
            Approve exactly this
          </span>
          <span className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-medium text-ink-2">Reject</span>
        </div>
      </Rise>
      <Rise i={1} className="hidden content-start justify-items-center gap-4 rounded-md border border-line bg-canvas-2 p-4 sm:grid">
        <ProofPackSeal hash={digest} caption="Sample ProofPack" className="w-36 max-w-full lg:w-44" idSuffix="-glimpse" />
        <ul className="grid w-full gap-1 text-sm text-ink-2">
          <Step status="verified">Checks ran in a test space</Step>
          <Step status="done">Approved by you, exactly as shown</Step>
        </ul>
      </Rise>
    </div>
  );
}
