"use client";

/**
 * "Proof before anything ships" (ADR 0034, shot in the studio of ADR 0164):
 * review a proposed change, approve exactly what you saw, run the checks in
 * a sandbox, seal a ProofPack, pass the launch gate, and see that an applied
 * change can be undone. Each step is a real part of Farbaek; the project and
 * its numbers are a sample.
 */
import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  FingerprintIcon,
  HourglassMediumIcon,
  MinusIcon,
  TerminalWindowIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ProofPackSeal } from "@/components/proof/proofpack-seal";
import { mix, progress, typed } from "../timeline";
import { AppShell, LiveView, MobileShell, SAMPLE, type NavKey } from "./app-ui";
import { AppWindow } from "./primitives";
import { FilmLabel, LANDSCAPE_STUDIO, PORTRAIT_STUDIO, StudioFilm, type Head, type Lift } from "./studio";

const SCENES = { review: [0, 6500], approve: [6500, 14000], checks: [14000, 22500], proof: [22500, 29000], gate: [29000, 35500], undo: [35500, 43000] } as const;
type SceneKey = keyof typeof SCENES;
const NAV: Record<SceneKey, NavKey> = { review: "approvals", approve: "approvals", checks: "build", proof: "projects", gate: "projects", undo: "projects" };
const sceneAt = (t: number): SceneKey => (Object.keys(SCENES) as SceneKey[]).find((k) => t < SCENES[k][1]) ?? "undo";

const AT = { reject: 4650, apply: 10_300, edit: 11_400, checks: 16_300, proof: 24_800, gate: 30_900, gateChecked: 34_300, undoFrom: 35_500, undo: 38_750 } as const;

const BOUND = "7c1e94b2a05d3f6e8b9c2d417a60e5f3c8b1d94a2e7f06c35b8d1e4a9f2c07b6";
const DRIFTED = "e40b7a19c63f2d58a1e09b7c4d2f6a83b5e17c9d0a4f28b63e1c5d7a9b02f4e8";
const short = (hex: string) => `sha256:${hex.slice(0, 8)}…${hex.slice(-4)}`;

const HEADS: Head[] = [
  { from: -150, to: 2600, text: "Review every change.", accent: "change", sub: "File by file. Keep what you want, reject the rest." },
  { from: 6500, to: 9000, text: "Approve exactly what you saw.", accent: "exactly", sub: "The approval binds to a hash. Change one character and it stops matching." },
  { from: 14_000, to: 16_500, text: "Checks that really ran.", accent: "ran", sub: "In a test space, against the applied files. Exit codes decide." },
  { from: 22_500, to: 25_000, text: "Sealed as a ProofPack.", accent: "ProofPack", sub: "What ran, on which files, and what it doesn't prove." },
  { from: 29_000, to: 31_400, text: "A gate before launch.", accent: "gate", sub: "Publishing needs a clean check of these exact files." },
  { from: 35_500, to: 37_700, text: "Every change can be undone.", accent: "undone", sub: "And the undo is recorded too." },
  { from: 40_500, to: 45_000, text: "Proof before anything ships.", accent: "Proof", sub: "A sample change, reviewed, approved, checked and sealed." },
];

const LIFTS: Lift[] = [
  { scene: "review", target: "hunks", from: 2700, to: 6300, pad: 16, clicks: [{ at: AT.reject - 50, target: "reject" }] },
  { scene: "approve", target: "approve", from: 9200, to: 13_700, pad: 18, clicks: [{ at: AT.apply - 50, target: "apply" }] },
  { scene: "checks", target: "checks", from: 16_600, to: 22_200, pad: 16 },
  { scene: "proof", target: "proof", from: 25_000, to: 28_700, pad: 20 },
  { scene: "gate", target: "chain", from: 31_500, to: 35_200, pad: 20 },
  { scene: "undo", target: "undo", from: 37_700, to: 40_300, pad: 18, clicks: [{ at: AT.undo - 50, target: "undo" }] },
];

// ------------------------------------------------------------------ review

const HUNKS = [
  { file: "index.html", lines: [["-", '<span id="status-text">Open every day from 6.30 am</span>'], ["+", '<span id="status-text">Open every day, 6.30 am to 7 pm</span>']] },
  { file: "index.html", lines: [["+", '<a class="fs-link" href="#visit">How to find us</a>']] },
  { file: "styles.css", lines: [["-", ".status { font-size: 0.9rem; }"], ["+", ".status { font-size: 1.05rem; font-weight: 600; }"]] },
] as const;

function ReviewView({ t, from, rejectAt }: { t: number; from: number; rejectAt: number }) {
  const rejected = t >= rejectAt;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-ink-3">{SAMPLE.project}</p>
          <h1 className="text-[1.5rem] font-medium tracking-[-0.03em] max-sm:text-[1.2rem]">Change to review</h1>
        </div>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-approval/30 bg-approval/[0.06] px-3 text-xs font-medium text-approval">
          <HourglassMediumIcon size={14} weight="bold" aria-hidden /> Waiting for your approval
        </span>
      </div>
      <div data-lift="hunks" className="grid gap-4">
        {HUNKS.map((h, i) => {
          const off = i === 1 && rejected;
          return (
            <section key={i} className="grid gap-2" style={{ opacity: progress(t, from + 200 + i * 300, from + 800 + i * 300) }}>
              {i !== 1 ? (
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-mono text-[13px] font-medium">{h.file}</p>
                  <p className="text-xs text-ink-3">Edit of revision 3</p>
                </div>
              ) : null}
              <div className={`overflow-hidden rounded-sm border border-line bg-surface ${off ? "opacity-45" : ""}`}>
                {h.lines.map(([sign, code], j) => (
                  <p key={j} className={`flex gap-3 px-3 py-1 font-mono text-[12.5px] ${off ? "text-ink-3 line-through" : sign === "+" ? "bg-verified/[0.08] text-ink" : "bg-failed/[0.07] text-ink-2"}`}>
                    <span className={sign === "+" ? "text-verified" : "text-failed"}>{sign}</span>
                    <span className="min-w-0 truncate">{code}</span>
                  </p>
                ))}
                <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-1.5 text-xs">
                  <span className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 ${off ? "border-line text-ink-3" : "border-verified/40 text-verified"}`}>
                    <CheckCircleIcon size={13} weight="bold" aria-hidden /> Accept
                  </span>
                  <span data-film-click={i === 1 ? "reject" : undefined} className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 ${off ? "border-failed/40 bg-failed/[0.06] text-failed" : "border-line text-ink-2"}`}>
                    <XCircleIcon size={13} weight="bold" aria-hidden /> {off ? "Rejected" : "Reject"}
                  </span>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ approve

function ApproveView({ t, appliedAt, editAt }: { t: number; appliedAt: number; editAt: number }) {
  const applied = t >= appliedAt;
  const edited = t >= editAt;
  const editText = typed("7.30 pm", t, editAt, 12);
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs text-ink-3">{SAMPLE.project}</p>
        <h1 className="text-[1.5rem] font-medium tracking-[-0.03em] max-sm:text-[1.2rem]">Approve exactly this</h1>
      </div>
      <p className="text-sm">
        You are approving <span className="font-medium">2 of 2 files</span> exactly as shown above, after your accept and reject decisions.
      </p>
      <div data-lift="approve" className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span data-film-click="apply" className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium ${applied ? "border border-verified/40 text-verified" : "bg-primary text-on-primary shadow-e1"}`}>
            {applied ? <CheckCircleIcon size={16} weight="bold" aria-hidden /> : <FingerprintIcon size={16} weight="bold" aria-hidden />}
            {applied ? "Applied" : "Approve and apply 2 files"}
          </span>
        </div>
        <div className="grid gap-3 rounded-md border border-line bg-surface p-4 shadow-e1" style={{ opacity: progress(t, appliedAt, appliedAt + 500) }}>
          <p className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-2">Approval bound to</span>
            <code className="font-mono text-[13px] text-ink">{short(BOUND)}</code>
          </p>
          <p className="rounded-sm bg-surface-raised px-3 py-2 font-mono text-[12.5px] text-ink">
            {'<span id="status-text">Open every day, 6.30 am to '}
            {edited ? <span className="rounded-[4px] bg-approval/20 px-0.5">{editText || "7 pm"}</span> : "7 pm"}
            {"</span>"}
          </p>
          {edited ? (
            <p className="flex items-start gap-2 rounded-sm border border-approval/40 bg-approval/[0.06] px-3 py-2 text-sm" style={{ opacity: progress(t, editAt + 900, editAt + 1300) }}>
              <WarningCircleIcon size={17} className="mt-px shrink-0 text-approval" aria-hidden />
              <span>
                Now <code className="font-mono text-[12.5px]">{short(DRIFTED)}</code>. It no longer matches what you approved, so it can&apos;t be applied without approving again.
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-verified">
              <CheckCircleIcon size={16} weight="bold" aria-hidden /> Matches what you saw
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ checks

const COMMANDS = [
  { cmd: "node --check script.js", at: 900, result: "pass" },
  { cmd: "npx html-validate index.html", at: 2100, result: "pass" },
  { cmd: "review_site index.html", at: 3300, result: "pass" },
  { cmd: "npm test", at: 4400, result: "skip" },
] as const;

function ChecksView({ t, from }: { t: number; from: number }) {
  const local = t - from;
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs text-ink-3">{SAMPLE.project}</p>
        <h1 className="text-[1.5rem] font-medium tracking-[-0.03em] max-sm:text-[1.2rem]">Checks in a test space</h1>
        <p className="mt-1 text-sm text-ink-2">Run on Farbaek&apos;s side, in an isolated test space, against exactly the applied files.</p>
      </div>
      <div data-lift="checks" className="grid gap-3">
        <ol className="grid min-h-[132px] content-start gap-2 rounded-md bg-media p-4 font-mono text-[12.5px] text-media-ink shadow-e2">
          {COMMANDS.map((c) => {
            const started = local >= c.at;
            const done = local >= c.at + 800;
            if (!started) return null;
            return (
              <li key={c.cmd} className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <TerminalWindowIcon size={14} className="shrink-0 text-media-ink-3" aria-hidden />
                  <span className="truncate">{c.cmd}</span>
                </span>
                {!done ? (
                  <span className="text-media-ink-3">running…</span>
                ) : c.result === "pass" ? (
                  <span className="inline-flex items-center gap-1 text-media-green">
                    <CheckCircleIcon size={13} weight="bold" aria-hidden /> Passed · exit 0
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-media-ink-2">
                    <CircleDashedIcon size={13} aria-hidden /> Didn&apos;t run: no test script
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-ink-3" style={{ opacity: progress(local, 5300, 5700) }}>
          3 passed, 1 didn&apos;t run. A check that didn&apos;t run is never counted as passed.
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ proof

function ProofView({ t, from }: { t: number; from: number }) {
  const local = t - from;
  const seal = progress(local, 300, 1800);
  return (
    <div data-lift="proof" className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      <div className="justify-self-center" style={{ opacity: seal, transform: `perspective(900px) rotateX(${mix(38, 0, seal)}deg) rotateZ(${mix(-30, 0, seal)}deg) scale(${mix(0.8, 1, seal)})` }}>
        <ProofPackSeal hash={SAMPLE.digest} caption="Sample ProofPack" size={200} className="w-52 max-sm:w-40" />
      </div>
      <div className="grid gap-4">
        <div>
          <p className="text-xs text-ink-3">{SAMPLE.project}</p>
          <h1 className="text-[1.5rem] font-medium tracking-[-0.03em] max-sm:text-[1.2rem]">ProofPack recorded</h1>
          <p className="mt-1 font-mono text-xs text-ink-3">{short(SAMPLE.digest)} · in-toto attestation</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div style={{ opacity: progress(local, 1600, 2200) }}>
            <p className="text-sm font-medium">What it proves</p>
            <ul className="mt-2 grid gap-1.5 text-[13.5px] text-ink-2">
              {["Which exact files were checked", "Which commands ran, and their exit codes", "Which plan and approval it ran under"].map((l) => (
                <li key={l} className="flex gap-2">
                  <CheckCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden /> {l}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ opacity: progress(local, 2400, 3000) }}>
            <p className="text-sm font-medium">What it doesn&apos;t</p>
            <ul className="mt-2 grid gap-1.5 text-[13.5px] text-ink-2">
              {["That there are no other defects", "Anything a check didn't cover"].map((l) => (
                <li key={l} className="flex gap-2">
                  <MinusIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden /> {l}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ undo

function UndoView({ t, from, undoAt }: { t: number; from: number; undoAt: number }) {
  const done = t >= undoAt + 500;
  return (
    <div className="grid gap-4" style={{ opacity: progress(t, from, from + 400) }}>
      <div>
        <p className="text-xs text-ink-3">{SAMPLE.project}</p>
        <h1 className="text-[1.5rem] font-medium tracking-[-0.03em] max-sm:text-[1.2rem]">Undo this change</h1>
      </div>
      <div data-lift="undo" className="grid gap-4">
        <ul className="grid gap-2">
          {["index.html", "styles.css"].map((f) => (
            <li key={f} className="flex items-center justify-between gap-3 rounded-sm border border-line bg-surface px-4 py-2.5 text-sm">
              <span className="font-mono text-[13px]">{f}</span>
              <span className={done ? "text-verified" : "text-ink-3"}>{done ? "Back to revision 3" : "Revision 4, back to 3"}</span>
            </li>
          ))}
        </ul>
        <span data-film-click="undo" className={`inline-flex h-11 w-fit items-center gap-2 rounded-full px-5 text-sm font-medium ${done ? "border border-verified/40 text-verified" : "bg-primary text-on-primary shadow-e1"}`}>
          {done ? <CheckCircleIcon size={16} weight="bold" aria-hidden /> : <ArrowCounterClockwiseIcon size={17} aria-hidden />}
          {done ? "Undone, and recorded" : "Undo 2 files"}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the film

function content(scene: string, t: number): ReactNode {
  switch (scene as SceneKey) {
    case "review":
      return <ReviewView t={t} from={0} rejectAt={AT.reject} />;
    case "approve":
      return <ApproveView t={t} appliedAt={AT.apply} editAt={AT.edit} />;
    case "checks":
      return <ChecksView t={t} from={AT.checks} />;
    case "proof":
      return <ProofView t={t} from={AT.proof} />;
    case "gate":
      return <LiveView t={t} from={AT.gate} checkedAt={AT.gateChecked} />;
    case "undo":
      return <UndoView t={t} from={AT.undoFrom} undoAt={AT.undo} />;
  }
}

export function ProofFilm({ t, format }: { t: number; format: "landscape" | "portrait" }) {
  if (format === "portrait") {
    return (
      <StudioFilm
        t={t}
        layout={PORTRAIT_STUDIO}
        scenes={SCENES}
        content={content}
        pad="px-4 py-5"
        frame={(scenes) => <MobileShell active={NAV[sceneAt(t)]}>{scenes}</MobileShell>}
        heads={HEADS}
        lifts={LIFTS}
        label={<FilmLabel place="center" />}
      />
    );
  }
  return (
    <StudioFilm
      t={t}
      layout={LANDSCAPE_STUDIO}
      scenes={SCENES}
      content={content}
      pad="px-8 py-7"
      frame={(scenes) => (
        <AppWindow width={1120} height={700}>
          <AppShell active={NAV[sceneAt(t)]}>{scenes}</AppShell>
        </AppWindow>
      )}
      heads={HEADS}
      lifts={LIFTS}
      label={<FilmLabel place="left" />}
    />
  );
}
