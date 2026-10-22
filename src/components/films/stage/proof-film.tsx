"use client";

/**
 * "Proof before anything ships" (ADR 0034): review a proposed change, approve
 * exactly what you saw, run the checks in a sandbox, seal a ProofPack, pass
 * the launch gate, and see that an applied change can be undone. Each step
 * is a real part of Farbaek; the project and its numbers are a sample.
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
import { AppWindow, Pointer, Rig, Stage, cameraAt, presence } from "./primitives";

const SCENES = { review: [0, 6000], approve: [6000, 12000], checks: [12000, 19000], proof: [19000, 25000], gate: [25000, 29000], undo: [29000, 32000] } as const;
type SceneKey = keyof typeof SCENES;
const NAV: Record<SceneKey, NavKey> = { review: "approvals", approve: "approvals", checks: "build", proof: "projects", gate: "projects", undo: "projects" };

const BOUND = "7c1e94b2a05d3f6e8b9c2d417a60e5f3c8b1d94a2e7f06c35b8d1e4a9f2c07b6";
const DRIFTED = "e40b7a19c63f2d58a1e09b7c4d2f6a83b5e17c9d0a4f28b63e1c5d7a9b02f4e8";
const short = (hex: string) => `sha256:${hex.slice(0, 8)}…${hex.slice(-4)}`;

// ------------------------------------------------------------------ review

const HUNKS = [
  { file: "index.html", lines: [["-", '<p class="hours">Open daily</p>'], ["+", '<p class="hours">Open 7:00 to 15:00, every day</p>']] },
  { file: "index.html", lines: [["+", '<a class="directions" href="#find-us">How to find us</a>']] },
  { file: "styles.css", lines: [["-", ".hours { font-size: 0.9rem; }"], ["+", ".hours { font-size: 1.05rem; font-weight: 600; }"]] },
] as const;

function ReviewView({ t, from, rejectAt }: { t: number; from: number; rejectAt: number }) {
  const rejected = t >= rejectAt;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-ink-3">{SAMPLE.project}</p>
          <h1 className="text-[1.5rem] font-medium tracking-[-0.03em] max-sm:text-[1.2rem]">Proposed change</h1>
        </div>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-approval/30 bg-approval/[0.06] px-3 text-xs font-medium text-approval">
          <HourglassMediumIcon size={14} weight="bold" aria-hidden /> Waiting for your approval
        </span>
      </div>
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
                <span className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 ${off ? "border-failed/40 bg-failed/[0.06] text-failed" : "border-line text-ink-2"}`}>
                  <XCircleIcon size={13} weight="bold" aria-hidden /> {off ? "Rejected" : "Reject"}
                </span>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ approve

function ApproveView({ t, appliedAt, editAt }: { t: number; appliedAt: number; editAt: number }) {
  const applied = t >= appliedAt;
  const edited = t >= editAt;
  const editText = typed("7:00 to 15:30", t, editAt, 16);
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs text-ink-3">{SAMPLE.project}</p>
        <h1 className="text-[1.5rem] font-medium tracking-[-0.03em] max-sm:text-[1.2rem]">Approve exactly this</h1>
      </div>
      <p className="text-sm">
        You are approving <span className="font-medium">2 of 2 files</span> exactly as shown above, after your accept and reject decisions.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium ${applied ? "border border-verified/40 text-verified" : "bg-primary text-on-primary shadow-e1"}`}>
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
          {'<p class="hours">Open '}
          {edited ? <span className="rounded-[4px] bg-approval/20 px-0.5">{editText || "7:00 to 15:00"}</span> : "7:00 to 15:00"}
          {", every day</p>"}
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
  );
}

// ------------------------------------------------------------------ checks

const COMMANDS = [
  { cmd: "node --check script.js", at: 900, result: "pass" },
  { cmd: "npx html-validate index.html", at: 2100, result: "pass" },
  { cmd: "review_site index.html", at: 3400, result: "pass" },
  { cmd: "npm test", at: 4600, result: "skip" },
] as const;

function ChecksView({ t, from }: { t: number; from: number }) {
  const local = t - from;
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs text-ink-3">{SAMPLE.project}</p>
        <h1 className="text-[1.5rem] font-medium tracking-[-0.03em] max-sm:text-[1.2rem]">Checks in a sandbox</h1>
        <p className="mt-1 text-sm text-ink-2">Run on Farbaek&apos;s side, in an isolated sandbox, against exactly the applied files.</p>
      </div>
      <ol className="grid gap-2 rounded-md bg-media p-4 font-mono text-[12.5px] text-media-ink shadow-e2">
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
      <p className="text-xs text-ink-3" style={{ opacity: progress(local, 5600, 6000) }}>
        3 passed, 1 didn&apos;t run. A check that didn&apos;t run is never counted as passed.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ proof

function ProofView({ t, from }: { t: number; from: number }) {
  const local = t - from;
  const seal = progress(local, 300, 1800);
  return (
    <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      <div className="justify-self-center" style={{ opacity: seal, transform: `perspective(900px) rotateX(${mix(38, 0, seal)}deg) scale(${mix(0.8, 1, seal)})` }}>
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
      <ul className="grid gap-2">
        {["index.html", "styles.css"].map((f) => (
          <li key={f} className="flex items-center justify-between gap-3 rounded-sm border border-line bg-surface px-4 py-2.5 text-sm">
            <span className="font-mono text-[13px]">{f}</span>
            <span className={done ? "text-verified" : "text-ink-3"}>{done ? "Back to revision 3" : "Revision 4, back to 3"}</span>
          </li>
        ))}
      </ul>
      <span className={`inline-flex h-11 w-fit items-center gap-2 rounded-full px-5 text-sm font-medium ${done ? "border border-verified/40 text-verified" : "bg-primary text-on-primary shadow-e1"}`}>
        {done ? <CheckCircleIcon size={16} weight="bold" aria-hidden /> : <ArrowCounterClockwiseIcon size={17} aria-hidden />}
        {done ? "Undone, and recorded" : "Undo 2 files"}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ the film

function sceneContent(key: SceneKey, t: number): ReactNode {
  switch (key) {
    case "review":
      return <ReviewView t={t} from={0} rejectAt={3700} />;
    case "approve":
      return <ApproveView t={t} appliedAt={6900} editAt={9200} />;
    case "checks":
      return <ChecksView t={t} from={12000} />;
    case "proof":
      return <ProofView t={t} from={19000} />;
    case "gate":
      return <LiveView t={t} from={24600} checkedAt={27400} />;
    case "undo":
      return <UndoView t={t} from={29000} undoAt={30700} />;
  }
}

function Scenes({ t, portrait }: { t: number; portrait: boolean }) {
  return (
    <>
      {(Object.keys(SCENES) as SceneKey[]).map((key) => {
        const [from, to] = SCENES[key];
        const p = presence(t, from, to, 400);
        if (p <= 0) return null;
        return (
          <div key={key} className="absolute inset-0" style={{ opacity: p, filter: p < 1 ? `blur(${(1 - p) * 6}px)` : undefined }}>
            <div className={portrait ? "px-4 py-5" : "px-8 py-7"}>{sceneContent(key, t)}</div>
          </div>
        );
      })}
    </>
  );
}

const sceneAt = (t: number): SceneKey => (Object.keys(SCENES) as SceneKey[]).find((k) => t < SCENES[k][1]) ?? "undo";

const SET = { w: 1120, h: 700 };
const CAMERA = {
  x: [[0, 560], [1600, 560], [2800, 660], [5400, 660], [6400, 640], [11800, 640], [12800, 660], [18400, 660], [19400, 640], [24400, 640], [25400, 520], [28600, 520], [29400, 640], [32000, 640]] as [number, number][],
  y: [[0, 350], [1600, 350], [2800, 340], [5400, 340], [6400, 300], [11800, 300], [12800, 300], [18400, 300], [19400, 270], [24400, 270], [25400, 380], [28600, 400], [29400, 300], [32000, 300]] as [number, number][],
  s: [[0, 0.84], [1600, 1], [2800, 1.12], [5400, 1.12], [6400, 1.2], [9400, 1.26], [11800, 1.2], [12800, 1.16], [18400, 1.2], [19400, 1.22], [24400, 1.28], [25400, 1.16], [28600, 1.2], [29400, 1.14], [32000, 1.18]] as [number, number][],
  rx: [[0, 12], [2400, 3], [32000, 3]] as [number, number][],
  ry: [[0, -16], [2400, -4], [12000, 2], [19000, -3], [25000, 2], [32000, -2]] as [number, number][],
};
// The pointer moves in the window's content area, below the address bar.
const POINTER = {
  path: [
    [2200, 860, 520],
    [3600, 1031, 283],
    [4400, 1031, 283],
    [6000, 560, 300],
    [6800, 312, 150],
    [7600, 312, 150],
    [29800, 600, 420],
    [30600, 330, 230],
    [31400, 330, 230],
  ] as [number, number, number][],
  clicks: [3700, 6850, 30650],
};

const P_CAMERA = {
  x: [[0, 192], [32000, 192]] as [number, number][],
  y: [[0, 250], [32000, 250]] as [number, number][],
  s: [[0, 0.86], [2200, 1], [32000, 1.02]] as [number, number][],
  rx: [[0, 10], [2400, 2]] as [number, number][],
  ry: [[0, -12], [2400, -2], [16000, 2], [32000, -2]] as [number, number][],
};

export function ProofFilm({ t, format }: { t: number; format: "landscape" | "portrait" }) {
  if (format === "portrait") {
    return (
      <Stage t={t} width={432} height={540} label={false}>
        <Rig cam={cameraAt(t, P_CAMERA)} width={432} height={524} setWidth={384} setHeight={500}>
          <div
            className="relative overflow-hidden rounded-[30px] ring-1 ring-line"
            style={{ width: 384, height: 500, boxShadow: "0 40px 80px -34px color-mix(in oklab, var(--color-ink) 36%, transparent), 0 20px 50px -24px color-mix(in oklab, var(--color-accent) 32%, transparent)" }}
          >
            <MobileShell active={NAV[sceneAt(t)]}>
              <Scenes t={t} portrait />
            </MobileShell>
          </div>
        </Rig>
        <p className="absolute bottom-[1.4%] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface/85 px-2 py-0.5 font-mono text-[8px] text-ink-3 ring-1 ring-line">Sample project, recorded from Farbaek&apos;s interface.</p>
      </Stage>
    );
  }
  return (
    <Stage t={t} width={1280} height={800}>
      <Rig cam={cameraAt(t, CAMERA)} width={1280} height={800} setWidth={SET.w} setHeight={SET.h}>
        <AppWindow width={SET.w} height={SET.h}>
          <AppShell active={NAV[sceneAt(t)]}>
            <Scenes t={t} portrait={false} />
          </AppShell>
          <Pointer t={t} path={POINTER.path} clicks={POINTER.clicks} shows={[[2200, 4400], [6000, 7600], [29800, 31400]]} />
        </AppWindow>
      </Rig>
    </Stage>
  );
}

