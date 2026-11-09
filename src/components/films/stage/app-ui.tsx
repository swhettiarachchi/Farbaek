"use client";

/**
 * Farbaek's interface on the film stage (ADR 0034). Real components are
 * used where they render on their own (ApproveBuild, EventRow, ScoreRing,
 * PublishPanel, LiveCheck, RunStatusBadge, the static preview builder);
 * where a part is wired to the server, its markup and copy are mirrored
 * here class for class. The project is a sample: Farbaek's own bakery
 * template, the way a build from it looks.
 */
import {
  ArrowUpIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  CubeIcon,
  FilePlusIcon,
  SealCheckIcon,
  GlobeIcon,
  HammerIcon,
  HouseSimpleIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  DotsThreeOutlineIcon,
  CheckSquareOffsetIcon,
  FolderSimpleIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { APP_PAGES } from "@/components/app/app-nav";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ApproveBuild } from "@/components/build/approve-build";
import { CoreMark, type CoreMarkState } from "@/components/build/core-mark";
import { EventRow } from "@/components/build/run-live";
import { RunStatusBadge } from "@/components/build/run-status";
import { LiveCheck } from "@/components/launch/live-check";
import { PublishPanel } from "@/components/publish/publish-panel";
import { ScoreRing } from "@/components/security/score-ring";
import { TEMPLATES } from "@/content/starters/templates";
import { FARBAEK_SKILLS } from "@/content/skills";
import { TRIAL, getPlan } from "@/core/billing/catalog";
import { modelName } from "@/core/billing/rate-card";
import { CHECK_LABELS } from "@/core/security/report";
import { scoreOf } from "@/core/security/findings";
import type { RunEventView } from "@/server/cloud-agent/store";
import type { PublishPanelData } from "@/server/publish/panel";
import { mix, progress, typed } from "../timeline";
import { SiteFrame } from "./primitives";

// ------------------------------------------------------------------ sample project

export const SAMPLE = {
  prompt: "A site for Kiln & Crumb, our bakery and coffee shop in Kandy, with the menu and opening hours.",
  outcome: "A one-page site for Kiln & Crumb with the menu, opening hours and directions.",
  project: "Kiln & Crumb",
  site: "kiln-and-crumb",
  domain: "farbaek.si",
  projectId: "00000000-0000-4000-8000-0000000000f1",
  taskId: "00000000-0000-4000-8000-0000000000f2",
  digest: "9c41e07b2d5f8a63c1e9047db6a25f3e8b0c7d1a94e2f6503b8c7a1d2e4f9b60",
  proofPack: "3fb81d0c6e2a945d7c1f08b3e6a2d4957c0e1b8f3a6d29e4b7c05f1a8d3e6b20",
  planHash: "3f9a2c71e8b04d5a9c6e1f20b7d3a8e5c4f1092b6d7e3a80c5f1b2d4e6a8c0f2",
};

const template = TEMPLATES.find((t) => t.id === "local-business")!;
export const SITE_FILES: Record<string, string> = Object.fromEntries(template.files.map((f) => [f.path, f.content]));

/** "Just now" for the product's own relative times, however long a recording takes. */
const recently = () => new Date(Date.now() - 4000).toISOString();

// ------------------------------------------------------------------ the app's frame

export type NavKey = "home" | "build" | "projects" | "approvals";
const NAV_HREF: Record<NavKey, string> = { home: "/app", build: "/app/build", projects: "/app/projects", approvals: "/app/approvals" };

/** The signed-in app's sidebar, as on a laptop. */
export function AppShell({ active, core = "idle", children }: { active: NavKey; core?: CoreMarkState; children: ReactNode }) {
  const trial = `${getPlan(TRIAL.basePlan).name} trial`;
  return (
    <div className="grid h-full grid-cols-[228px_minmax(0,1fr)]">
      <aside className="flex h-full flex-col gap-4 border-r border-line bg-canvas-2 px-4 py-5">
        <div className="flex items-center gap-2 px-1.5">
          <BrandLogo height={26} />
          <span className="text-[16px] font-semibold tracking-[-0.02em]">Farbaek</span>
        </div>
        <span className="flex h-10 items-center gap-2.5 rounded-full border border-line bg-surface px-3.5 text-[13px] text-ink-3 shadow-e1">
          <MagnifyingGlassIcon size={15} className="shrink-0" aria-hidden /> <span className="flex-1 truncate whitespace-nowrap">Search or jump to</span>
          <span className="rounded-full border border-line px-1.5 font-mono text-[10px]">Ctrl K</span>
        </span>
        <span className="flex h-10 items-center justify-between rounded-full border border-line bg-surface px-3.5 text-[13.5px] font-medium shadow-e1">
          {SAMPLE.project} <CaretDownIcon size={13} className="text-ink-3" aria-hidden />
        </span>
        <span className="flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-on-primary shadow-e1">
          <PlusIcon size={16} weight="bold" aria-hidden /> New build
        </span>
        <span className="flex items-center gap-2.5 rounded-full px-2 text-[13px] text-ink-2">
          <CoreMark state={core} size="sm" /> {core === "working" ? "1 agent working" : core === "waiting" ? "An agent is waiting for you" : "No agents running"}
        </span>
        <ul className="grid gap-0.5">
          {APP_PAGES.slice(0, 7).map((item) => {
            const on = item.href === NAV_HREF[active];
            return (
              <li key={item.href}>
                <span className={`flex h-10 items-center gap-3 rounded-full px-3.5 text-[14px] ${on ? "bg-surface font-medium text-ink shadow-e1" : "text-ink-2"}`}>
                  <item.icon size={18} weight={on ? "fill" : "regular"} className={on ? "text-accent" : ""} aria-hidden />
                  {item.label}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto rounded-md border border-line bg-surface p-3 text-xs text-ink-2 shadow-e1">
          <p className="font-medium text-ink">{trial}</p>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <span className="block h-full w-[22%] rounded-full bg-accent" />
          </span>
          <p className="mt-1.5 text-ink-3">AI usage this period</p>
        </div>
      </aside>
      <main className="relative min-w-0 overflow-hidden px-8 py-7">{children}</main>
    </div>
  );
}

const TAB_ICONS: { key: NavKey | "more"; label: string; icon: Icon }[] = [
  { key: "home", label: "Home", icon: HouseSimpleIcon },
  { key: "build", label: "Build", icon: HammerIcon },
  { key: "projects", label: "Projects", icon: FolderSimpleIcon },
  { key: "approvals", label: "Approvals", icon: CheckSquareOffsetIcon },
  { key: "more", label: "More", icon: DotsThreeOutlineIcon },
];

/** The same app on a phone: the header, the page and the tab bar. */
export function MobileShell({ active, core = "idle", children }: { active: NavKey; core?: CoreMarkState; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-canvas/90 px-4">
        <span className="flex items-center gap-2">
          <BrandLogo height={24} />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Farbaek</span>
        </span>
        <CoreMark state={core} size="sm" />
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden px-4 py-5">{children}</div>
      <nav className="grid h-16 shrink-0 grid-cols-5 border-t border-line bg-surface/95">
        {TAB_ICONS.map((tab) => {
          const on = tab.key === active;
          return (
            <span key={tab.key} className={`flex flex-col items-center justify-center gap-1 text-[11px] ${on ? "font-medium text-accent" : "text-ink-2"}`}>
              <tab.icon size={21} weight={on ? "fill" : "regular"} aria-hidden />
              {tab.label}
            </span>
          );
        })}
      </nav>
    </div>
  );
}

// ------------------------------------------------------------------ describe

/** The build box, mirroring PromptComposer in the app: the sentence types in, then "Plan it" shows the planning stages. */
export function DescribeView({ t, typeFrom, submitAt }: { t: number; typeFrom: number; submitAt: number }) {
  const text = typed(SAMPLE.prompt, t, typeFrom, 30);
  const submitted = t >= submitAt;
  const stages = ["Setting up your project", "Adding a starter that fits", "Drafting the plan with AI", "Checking the plan"];
  const stage = stages[Math.min(stages.length - 1, Math.floor(Math.max(0, t - submitAt) / 900))]!;
  return (
    <div className="mx-auto grid max-w-[640px] gap-6 pt-6 max-sm:pt-0">
      <div>
        <h1 className="text-balance text-[2.1rem] font-medium leading-[1.05] tracking-[-0.035em] max-sm:text-[1.7rem]">What do you want to build?</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2 max-sm:text-sm">Describe it and Farbaek drafts a plan. Nothing is built until you approve it.</p>
      </div>
      <div data-lift="composer" className={`relative rounded-lg border bg-surface shadow-e2 ${text && !submitted ? "border-accent/60 shadow-e3" : "border-line"}`}>
        <p className="min-h-32 px-5 pb-16 pt-4 text-base leading-relaxed text-ink max-sm:min-h-40">
          {text || <span className="text-ink-3">Describe what you want to build. For example: a one-page site for my bakery with the menu, opening hours and a map.</span>}
          {text && !submitted && Math.floor(t / 530) % 2 === 0 ? <span className="ml-px inline-block h-5 w-px translate-y-1 bg-ink" /> : null}
        </p>
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 truncate pl-2 text-xs text-ink-3">
            {submitted ? (
              <>
                <CircleNotchIcon size={14} weight="bold" className="shrink-0 text-accent" style={{ transform: `rotate(${(t * 0.36) % 360}deg)` }} aria-hidden />
                <span className="truncate">{stage}…</span>
              </>
            ) : (
              <span className="truncate max-sm:hidden">You approve the plan before anything is built.</span>
            )}
          </p>
          <span data-film-click="plan-it" className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-on-primary ${text.length < 12 ? "opacity-40" : ""}`}>
            Plan it <ArrowUpIcon size={16} weight="bold" aria-hidden />
          </span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ plan

function PlanSection({ title, icon, children, shown }: { title: string; icon: ReactNode; children: ReactNode; shown: number }) {
  return (
    <section className="grid content-start gap-2.5 rounded-md border border-line bg-canvas-2/60 p-4" style={{ opacity: shown, transform: `translateY(${(1 - shown) * 14}px)` }}>
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

const chip = "rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-[12px] text-ink-2";

/** The plan page: the contract read back in plain words, then the real ApproveBuild card. */
export function PlanView({ t, from, approvedAt, compact = false }: { t: number; from: number; approvedAt: number; compact?: boolean }) {
  const s = (i: number) => progress(t, from + 250 + i * 260, from + 900 + i * 260);
  const approved = t >= approvedAt;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ opacity: s(0) }}>
        <p className="text-[13px] font-medium text-ink-3">Your plan, version 1</p>
        {approved ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-verified/40 px-3 text-xs font-medium text-verified">
            <CheckCircleIcon size={14} weight="bold" aria-hidden /> Approved
          </span>
        ) : (
          <span className="inline-flex h-7 items-center rounded-full border border-approval/40 px-3 text-xs font-medium text-approval">Waiting for your approval</span>
        )}
      </div>
      <div className="grid gap-1.5" style={{ opacity: s(0) }}>
        <h1 className="text-balance text-[1.7rem] font-medium leading-tight tracking-[-0.03em] max-sm:text-[1.35rem]">{SAMPLE.outcome}</h1>
        <p className="text-sm text-ink-3">
          In <span className="text-ink-2">{SAMPLE.project}</span>. You asked: &ldquo;{SAMPLE.prompt}&rdquo;
        </p>
      </div>
      <div data-lift="plan-grid" className={`grid gap-3 ${compact ? "" : "md:grid-cols-2"}`}>
        <PlanSection title="What will change" icon={<FilePlusIcon size={16} weight="bold" className="text-accent" aria-hidden />} shown={s(1)}>
          <p className="text-sm text-ink-2">Create files, edit files</p>
          <ul className="flex flex-wrap gap-1.5">
            {["index.html", "styles.css", "script.js", "DESIGN.md"].map((f) => (
              <li key={f} className={chip}>
                {f}
              </li>
            ))}
          </ul>
        </PlanSection>
        <PlanSection title="How it will be checked" icon={<CheckCircleIcon size={16} weight="bold" className="text-verified" aria-hidden />} shown={s(2)}>
          <ul className="grid gap-1.5 text-sm text-ink">
            {["The menu lists coffee, breakfast and bakes with prices", "Opening hours are on the first screen", "The page reads well on a phone"].map((a) => (
              <li key={a} className="flex gap-2">
                <CheckCircleIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                {a}
              </li>
            ))}
          </ul>
        </PlanSection>
        {compact ? null : (
          <>
            <PlanSection title="What stays untouched" icon={<LockSimpleIcon size={16} weight="bold" className="text-ink-2" aria-hidden />} shown={s(3)}>
              <ul className="grid gap-1 text-sm text-ink-2">
                <li>Files outside this project</li>
                <li>Payments and accounts</li>
              </ul>
            </PlanSection>
            <PlanSection title="If something goes wrong" icon={<ShieldCheckIcon size={16} weight="bold" className="text-ink-2" aria-hidden />} shown={s(4)}>
              <p className="text-sm text-ink-2">Each change waits for your review, and an applied change can be undone.</p>
            </PlanSection>
          </>
        )}
      </div>
      <div className="border-t border-line pt-5" style={{ opacity: s(5), pointerEvents: "none" }}>
        <ApproveBuild
          taskId={SAMPLE.taskId}
          version={1}
          expectedTaskVersion={1}
          sha256={SAMPLE.planHash}
          estimates={{ fast: { low: 2, high: 4, model: "claude-sonnet-5-5" }, balanced: { low: 4, high: 7, model: "claude-opus-5-5" }, deep: { low: 7, high: 12, model: "claude-opus-5-5" } }}
          disabledReason={null}
          skills={FARBAEK_SKILLS.map((k) => ({ id: k.id, label: k.label, description: k.description })).slice(0, compact ? 4 : 8)}
          suggested={FARBAEK_SKILLS.slice(0, 3).map((k) => k.id)}
          projectSkills={[]}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ build

const RUN_STEPS: { at: number; kind: RunEventView["kind"]; payload: Record<string, unknown> }[] = [
  { at: 0, kind: "model", payload: { text: "I'll write the design plan first, then build the page from the bakery template." } },
  { at: 1100, kind: "tool", payload: { tool: "read_file", target: "DESIGN.md", status: "done" } },
  { at: 2000, kind: "tool", payload: { tool: "write_file", target: "DESIGN.md", status: "done" } },
  { at: 3200, kind: "tool", payload: { tool: "edit_file", target: "index.html", status: "done" } },
  { at: 4300, kind: "tool", payload: { tool: "edit_file", target: "styles.css", status: "done" } },
  { at: 5600, kind: "note", payload: { from: "person", text: "Put the opening hours near the top, please." } },
  { at: 6600, kind: "model", payload: { text: "Moving the opening hours into the first screen." } },
  { at: 7600, kind: "tool", payload: { tool: "edit_file", target: "index.html", status: "done" } },
  { at: 8800, kind: "tool", payload: { tool: "review_site", target: "index.html", status: "done" } },
  { at: 10_200, kind: "tool", payload: { tool: "finish", target: "Ready for your review", status: "done" } },
];

const PHASES: [number, string][] = [
  [0, "Thinking"],
  [1100, "Reading DESIGN.md"],
  [2000, "Writing DESIGN.md"],
  [3200, "Writing index.html"],
  [4300, "Writing styles.css"],
  [5600, "Reading your message"],
  [7600, "Writing index.html"],
  [8800, "Reviewing the site"],
  [10_200, "Done"],
];

/** The core, drawn like the product's still Agent Core, its orbits turning with film time. */
export function FilmCore({ t, size = 120, done = false }: { t: number; size?: number; done?: boolean }) {
  const a = (t / 1000) * 38;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={done ? "text-verified" : "text-accent"} aria-hidden>
      <defs>
        <radialGradient id="film-core-rim" cx="50%" cy="50%" r="50%">
          <stop offset="62%" stopColor="currentColor" stopOpacity="0.05" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <g transform={`rotate(${-12 + a * 0.4} 100 100)`}>
        <ellipse cx="100" cy="100" rx="88" ry="30" fill="none" stroke="var(--color-accent-2)" strokeOpacity="0.75" strokeWidth="1.3" />
        <circle cx={100 + 88 * Math.cos((a * Math.PI) / 90)} cy={100 + 30 * Math.sin((a * Math.PI) / 90)} r="3.2" fill="var(--color-accent-2)" />
      </g>
      <g transform={`rotate(${20 - a * 0.25} 100 100)`}>
        <ellipse cx="100" cy="100" rx="96" ry="44" fill="none" stroke="var(--color-ink)" strokeOpacity="0.14" strokeWidth="0.9" />
      </g>
      <circle cx="100" cy="100" r="54" fill="url(#film-core-rim)" />
      <circle cx="100" cy="100" r="54" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      <polygon points="100,64 131,82 131,118 100,136 69,118 69,82" fill="none" stroke="currentColor" strokeOpacity="0.32" strokeWidth="1" transform={`rotate(${a * 0.6} 100 100)`} />
      <circle cx="100" cy="100" r={12 + Math.sin(t / 420) * 1.2} fill="currentColor" />
    </svg>
  );
}

/** The run workspace: the core and its phase, the steps as EventRow draws them, and the live preview. */
export function RunView({ t, from, layout = "wide" }: { t: number; from: number; layout?: "wide" | "steps" | "preview" }) {
  const local = t - from;
  const shown = RUN_STEPS.filter((s) => local >= s.at);
  const events: RunEventView[] = shown.map((s, i) => ({ id: i + 1, kind: s.kind, payload: s.payload, at: "2026-10-21T09:00:00Z" }));
  const phase = [...PHASES].reverse().find(([at]) => local >= at)?.[1] ?? "Starting";
  const done = local >= 10_200;
  // The preview builds up: the page appears as index.html is written, and settles when it's reviewed.
  const reveal = progress(local, 3000, 4600);
  const settle = progress(local, 7600, 8600);
  const scroll = mix(0, 0, settle);
  const steps = (
    <div data-lift="steps" className="grid content-start gap-4">
      <div className="flex items-center gap-4 rounded-md border border-line bg-surface p-4 shadow-e1">
        <FilmCore t={t} size={72} done={done} />
        <div className="min-w-0">
          <p className="text-xs text-ink-3">{done ? "Finished" : "Working"}</p>
          <p className="truncate text-[17px] font-medium tracking-[-0.01em]">{phase}</p>
          <p className="mt-0.5 text-xs text-ink-3">
            {done ? `${shown.length} steps in a` : `Step ${Math.max(1, shown.length)} of a`} balanced run on {modelName("claude-opus-5-5")}.
          </p>
        </div>
      </div>
      <ol className="relative before:absolute before:bottom-6 before:left-[13px] before:top-2 before:w-px before:bg-line">
        {events.slice(-6).map((e, i, arr) => (
          <div key={e.id} style={{ opacity: progress(local, RUN_STEPS[e.id - 1]!.at, RUN_STEPS[e.id - 1]!.at + 350) }}>
            <EventRow e={e} latest={i === arr.length - 1 && !done} />
          </div>
        ))}
      </ol>
    </div>
  );
  const preview = (
    <div className="grid content-start gap-2">
      <p className="flex items-center justify-between text-xs text-ink-3">
        <span className="font-medium text-ink-2">Preview</span>
        <span className="font-mono">index.html</span>
      </p>
      <div data-lift="preview" className="relative overflow-hidden rounded-md border border-line bg-surface shadow-e1">
        <div style={{ opacity: reveal, filter: `blur(${(1 - reveal) * 10}px) saturate(${mix(0.4, 1, reveal)})` }}>
          <SiteFrame files={SITE_FILES} scrollY={scroll} height={layout === "preview" ? 560 : 470} />
        </div>
        {reveal < 1 ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-ink-3" style={{ opacity: 1 - reveal }}>
            The preview appears as the agent writes the page.
          </div>
        ) : null}
      </div>
    </div>
  );
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-3">{SAMPLE.project}</p>
          <h1 className="truncate text-[1.35rem] font-medium tracking-[-0.025em] max-sm:text-[1.1rem]">A site for Kiln &amp; Crumb</h1>
        </div>
        <RunStatusBadge status={done ? "finished" : "working"} />
      </div>
      {layout === "wide" ? (
        <div className="grid grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)] gap-5">
          {steps}
          {preview}
        </div>
      ) : layout === "steps" ? (
        steps
      ) : (
        preview
      )}
    </div>
  );
}

// ------------------------------------------------------------------ check

/** The security page's score card: the real ScoreRing filling as the check finishes. */
export function CheckView({ t, from }: { t: number; from: number }) {
  const local = t - from;
  const running = local < 2200;
  const { score, grade } = scoreOf([]);
  const shownScore = Math.round(score * progress(local, 2200, 3600));
  return (
    <div className="grid gap-5">
      <div>
        <p className="text-xs text-ink-3">{SAMPLE.project}</p>
        <h1 className="text-[1.6rem] font-medium tracking-[-0.03em] max-sm:text-[1.25rem]">Security</h1>
        <p className="mt-1 text-sm text-ink-2">Farbaek&apos;s rules over every file, a package audit and an AI review of the riskiest files.</p>
      </div>
      <div data-lift="score" className="grid gap-5">
      {running ? (
        <div className="rounded-md border border-line bg-surface p-5 shadow-e1">
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <CircleNotchIcon size={16} weight="bold" className="shrink-0 text-accent" style={{ transform: `rotate(${(local / 3) % 360}deg)` }} aria-hidden /> Checking the project. This takes a minute or two.
          </p>
          <span className="mt-4 block h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${progress(local, 0, 2200) * 100}%` }} />
          </span>
        </div>
      ) : (
        <section className="grid gap-6 rounded-md border border-line bg-surface p-5 shadow-e1 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-6">
          <div className="max-sm:justify-self-center">
            <ScoreRing score={shownScore} grade={grade} />
          </div>
          <div className="grid gap-4">
            <div className="grid gap-1">
              <p className="text-sm font-medium">Security check</p>
              <p className="text-sm text-ink-2">It found nothing critical, high, medium or low.</p>
            </div>
            <ul className="grid gap-1.5 text-sm">
              {[
                { name: "rules" as const, ran: true, note: "0 found" },
                { name: "dependencies" as const, ran: false, note: "skipped. This project has no npm packages." },
                { name: "ai_review" as const, ran: true, note: "0 found" },
              ].map((c, i) => (
                <li key={c.name} className="flex items-start gap-2" style={{ opacity: progress(local, 2600 + i * 250, 3100 + i * 250) }}>
                  {c.ran ? <CheckCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden /> : <span className="size-4 shrink-0" aria-hidden />}
                  <span>
                    <span className="text-ink">{CHECK_LABELS[c.name]}</span>
                    <span className="text-ink-3">: {c.note}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-3">Checked just now, 5 files.</p>
          </div>
        </section>
      )}
      {!running ? (
        <div className="rounded-md border border-line bg-surface p-4 shadow-e1" style={{ opacity: progress(local, 3600, 4200) }}>
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <CheckCircleIcon size={18} weight="bold" className="text-verified" aria-hidden /> Nothing to fix in what was checked.
          </p>
        </div>
      ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ publish

/** The real publish panel, before and after the site goes live. */
export function PublishView({ t, from, publishAt }: { t: number; from: number; publishAt: number }) {
  const name = typed(SAMPLE.site, t, from + 900, 14) || "";
  const live = t >= publishAt + 700;
  // The sample change was verified, as the Launch scene shows next.
  const evidence = { status: "verified" as const, proofPack: SAMPLE.proofPack, taskId: null };
  const deployment = {
    id: "dep-1",
    number: 1,
    fileCount: 5,
    totalBytes: 41_230,
    digest: SAMPLE.digest,
    securityScore: 100,
    createdBy: "you",
    createdAt: recently(),
    evidence: evidence.status,
    evidenceProofPack: evidence.proofPack,
    overrideReason: null,
  };
  const data: PublishPanelData = {
    domain: SAMPLE.domain,
    site: live ? { id: "site-1", name: SAMPLE.site, liveDeploymentId: "dep-1", createdAt: recently(), blocked: null } : null,
    address: live ? `https://${SAMPLE.site}.${SAMPLE.domain}` : null,
    suggestedName: name || "kiln",
    live: live ? deployment : null,
    deployments: live ? [deployment] : [],
    block: null,
    check: { id: "chk-1", status: "done", startedAt: recently(), critical: 0 },
    evidence,
    needsOverride: false,
    canOverride: true,
    unpublishedChanges: false,
    domains: [],
    domainsAvailable: false,
  };
  return (
    <div className="grid gap-5">
      <div>
        <p className="text-xs text-ink-3">Projects</p>
        <h1 className="text-[1.6rem] font-medium tracking-[-0.03em] max-sm:text-[1.25rem]">{SAMPLE.project}</h1>
      </div>
      <div style={{ pointerEvents: "none" }} key={`${name}-${live}`}>
        <PublishPanel projectId={SAMPLE.projectId} data={data} disabledReason={null} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ live

type StepState = "done" | "now" | "todo";
const CHAIN: { title: string; icon: Icon; text: string }[] = [
  { title: "Security check of these files", icon: ShieldCheckIcon, text: "The last check of exactly these files found nothing critical." },
  { title: "Proof for the latest change", icon: SealCheckIcon, text: "The change's checks ran against exactly what was applied." },
  { title: "The version that's live", icon: CubeIcon, text: "Version 1 is live with 5 files, recorded exactly as they went out." },
];

/** The Launch page's evidence chain, ticking in, then the real LiveCheck with its result. */
export function LiveView({ t, from, checkedAt }: { t: number; from: number; checkedAt: number }) {
  const state = (i: number): StepState => (t >= from + 500 + i * 900 ? "done" : t >= from + i * 900 ? "now" : "todo");
  const checking = t >= from + 2700 && t < checkedAt;
  const checked = t >= checkedAt;
  return (
    <div className="grid gap-5">
      <div>
        <p className="text-xs text-ink-3">{SAMPLE.project}</p>
        <h1 className="text-[1.6rem] font-medium tracking-[-0.03em] max-sm:text-[1.25rem]">Launch</h1>
        <p className="mt-1 text-sm text-ink-2">A static website, live on Farbaek Sites.</p>
      </div>
      <ol data-lift="chain" className="grid">
        {CHAIN.map((s, i) => {
          const st = state(i);
          const ring = st === "done" ? "border-verified/45 bg-verified/[0.08] text-verified" : st === "now" ? "border-accent/50 bg-accent/[0.06] text-accent" : "border-dashed border-line-strong/60 bg-surface text-ink-3";
          return (
            <li key={s.title} className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-4 pb-6">
              <span aria-hidden className="absolute bottom-0 left-[21px] top-11 w-px bg-line" />
              <span className={`relative z-10 flex size-11 items-center justify-center rounded-full border ${ring}`}>
                <s.icon size={20} weight={st === "done" ? "fill" : "regular"} aria-hidden />
              </span>
              <div className="grid gap-1 pt-1">
                <p className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium text-ink">{s.title}</span>
                  {st === "done" ? <span className="text-xs font-medium text-verified">Done</span> : null}
                </p>
                <p className="text-sm leading-relaxed text-ink-2">{s.text}</p>
              </div>
            </li>
          );
        })}
        <li className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-4">
          <span className={`relative z-10 flex size-11 items-center justify-center rounded-full border ${checked ? "border-verified/45 bg-verified/[0.08] text-verified" : "border-accent/50 bg-accent/[0.06] text-accent"}`}>
            <GlobeIcon size={20} weight={checked ? "fill" : "regular"} aria-hidden />
          </span>
          <div className="grid gap-2 pt-1">
            <p className="font-medium text-ink">The live address answers with it</p>
            {checking ? (
              <p className="flex items-start gap-3 text-sm">
                <CircleNotchIcon size={18} weight="bold" className="mt-0.5 shrink-0 text-accent" style={{ transform: `rotate(${(t / 3) % 360}deg)` }} aria-hidden />
                <span>
                  <span className="font-medium text-ink">Checking your live site</span>
                  <span className="block text-ink-2">Farbaek is opening the address and comparing what answers with this version.</span>
                </span>
              </p>
            ) : checked ? (
              <div style={{ pointerEvents: "none" }}>
                <LiveCheck projectId={SAMPLE.projectId} autoRun={false} last={{ verdict: "live", detail: "Answered 200 in 142 ms with exactly these files.", checkedAt: recently() }} />
              </div>
            ) : (
              <p className="text-sm text-ink-2">Once a version is live, Farbaek opens its address and confirms exactly these files answer.</p>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}

export const SITE_ADDRESS = `${SAMPLE.site}.${SAMPLE.domain}`;
