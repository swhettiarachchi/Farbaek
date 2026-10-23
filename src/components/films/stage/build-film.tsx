"use client";

/**
 * "One build, start to finish" (ADR 0034), and the four feature clips cut
 * from it. Every position here is a function of film time: scenes cross
 * over, the camera dollies, the pointer moves and clicks.
 */
import type { ReactNode } from "react";
import { easeInOut, keys, mix, progress } from "../timeline";
import { AppShell, CheckView, DescribeView, LiveView, MobileShell, PlanView, PublishView, RunView, SITE_ADDRESS, SITE_FILES, type NavKey } from "./app-ui";
import { AppWindow, PhoneFrame, Pointer, Rig, SiteFrame, SiteWindow, Stage, cameraAt, presence } from "./primitives";

// Scene windows in film time (ms). Each scene fades over the boundary.
const SCENES = {
  describe: [0, 8000],
  plan: [8000, 17000],
  build: [17000, 31000],
  check: [31000, 39000],
  publish: [39000, 46000],
  live: [46000, 54000],
} as const;
type SceneKey = keyof typeof SCENES;

const NAV: Record<SceneKey, NavKey> = { describe: "build", plan: "build", build: "build", check: "projects", publish: "projects", live: "projects" };

/** How far the page has scrolled inside the window, per scene. */
function scrollFor(scene: SceneKey, t: number, portrait: boolean): number {
  if (scene === "plan") return keys(t, portrait ? [[9500, 0], [12000, 330], [13600, 600], [14800, 800]] : [[10500, 0], [13200, 330], [14600, 500]]);
  if (scene === "publish") return portrait ? keys(t, [[40000, 0], [41000, 90]]) : 0;
  return 0;
}

function sceneContent(scene: SceneKey, t: number, portrait: boolean): ReactNode {
  switch (scene) {
    case "describe":
      return <DescribeView t={t} typeFrom={1400} submitAt={6200} />;
    case "plan":
      return <PlanView t={t} from={8000} approvedAt={15800} compact={portrait} />;
    case "build":
      return <RunView t={t} from={17600} layout={portrait ? (t < 23400 ? "preview" : t < 28600 ? "steps" : "preview") : "wide"} />;
    case "check":
      return <CheckView t={t} from={31400} />;
    case "publish":
      return <PublishView t={t} from={39000} publishAt={42200} />;
    case "live":
      return <LiveView t={t} from={46200} checkedAt={50600} />;
  }
}

/** The main area: the scenes playing now, cross-dissolving with a little depth blur at the joins. */
function Scenes({ t, portrait }: { t: number; portrait: boolean }) {
  return (
    <>
      {(Object.keys(SCENES) as SceneKey[]).map((key) => {
        const [from, to] = SCENES[key];
        const p = presence(t, from, to, 420);
        if (p <= 0) return null;
        return (
          <div key={key} className="absolute inset-0" style={{ opacity: p, filter: p < 1 ? `blur(${(1 - p) * 6}px)` : undefined }}>
            <div className={portrait ? "px-4 py-5" : "px-8 py-7"} style={{ transform: `translateY(${-scrollFor(key, t, portrait)}px)` }}>
              {sceneContent(key, t, portrait)}
            </div>
          </div>
        );
      })}
    </>
  );
}

const sceneAt = (t: number): SceneKey => (Object.keys(SCENES) as SceneKey[]).find((k) => t < SCENES[k][1]) ?? "live";
const coreAt = (t: number) => (t >= 17000 && t < 27800 ? "working" : t >= 27800 && t < 31000 ? "done" : "idle");

// ------------------------------------------------------------------ landscape

const SET = { w: 1120, h: 700 };

const LANDSCAPE_CAMERA = {
  x: [[0, 560], [2200, 560], [3200, 640], [5800, 640], [7400, 560], [11000, 560], [13000, 560], [14400, 470], [16400, 470], [17800, 560], [19800, 560], [21000, 860], [23000, 860], [24000, 430], [26600, 430], [27600, 860], [29400, 860], [30600, 560], [32800, 600], [33800, 674], [36600, 674], [37800, 560], [39600, 560], [40600, 640], [44600, 640], [45600, 560], [47600, 480], [50800, 480], [51800, 560]] as [number, number][],
  y: [[0, 350], [2200, 350], [3200, 330], [5800, 330], [7400, 350], [11000, 350], [13000, 380], [14400, 400], [16400, 400], [17800, 350], [21000, 380], [23000, 380], [24000, 470], [26600, 470], [27600, 380], [29400, 380], [30600, 350], [32800, 340], [33800, 310], [36600, 310], [37800, 350], [39600, 350], [40600, 320], [44600, 320], [45600, 350], [47600, 380], [50800, 400], [51800, 350]] as [number, number][],
  s: [[0, 0.82], [2200, 1], [3200, 1.22], [5800, 1.22], [7400, 1], [11000, 1], [13000, 1.04], [14400, 1.35], [16400, 1.35], [17800, 1], [19800, 1], [21000, 1.34], [23000, 1.34], [24000, 1.38], [26600, 1.38], [27600, 1.3], [29400, 1.3], [30600, 1], [32800, 1.05], [33800, 1.3], [36600, 1.32], [37800, 1], [39600, 1], [40600, 1.28], [44600, 1.28], [45600, 1], [47600, 1.16], [50800, 1.2], [51800, 0.9]] as [number, number][],
  rx: [[0, 12], [2600, 3], [46000, 3], [51800, 10], [54000, 8]] as [number, number][],
  ry: [[0, -16], [2600, -4], [8000, 2], [17000, -3], [31000, 3], [39000, -2], [46000, 2], [51800, -10], [54000, -8]] as [number, number][],
};

/** The pointer's path [time, x, y] in set pixels, and its clicks. */
const LANDSCAPE_POINTER: { path: [number, number, number][]; clicks: number[] } = {
  path: [
    [4400, 760, 560],
    [6000, 929, 267],
    [7200, 929, 267],
    [13800, 640, 560],
    [15500, 360, 311],
    [16600, 360, 311],
    [40800, 700, 560],
    [42000, 343, 360],
    [43000, 343, 360],
  ],
  clicks: [6100, 15600, 42100],
};
const LANDSCAPE_SHOWS: [number, number][] = [[4400, 7000], [13800, 16600], [40800, 43200]];

function LandscapeBuild({ t }: { t: number }) {
  const cam = cameraAt(t, LANDSCAPE_CAMERA);
  // The finished site rises in front of the app, with a phone showing the same site at phone width.
  const reveal = progress(t, 51200, 53000);
  const phone = progress(t, 51800, 53600);
  return (
    <Stage t={t} width={1280} height={800}>
      <Rig cam={cam} width={1280} height={800} setWidth={SET.w} setHeight={SET.h} opacity={1 - reveal * 0.45} blur={reveal * 3}>
        <AppWindow width={SET.w} height={SET.h}>
          <AppShell active={NAV[sceneAt(t)]} core={coreAt(t)}>
            <Scenes t={t} portrait={false} />
          </AppShell>
          <Pointer t={t} path={LANDSCAPE_POINTER.path} clicks={LANDSCAPE_POINTER.clicks} shows={LANDSCAPE_SHOWS} />
        </AppWindow>
      </Rig>
      {reveal > 0 ? (
        <div
          className="absolute left-[45%] top-1/2"
          style={{
            transform: `translate(-50%, calc(-50% + ${(1 - reveal) * 120}px)) perspective(2000px) rotateX(${mix(18, 5, reveal)}deg) rotateY(${mix(-14, -8, reveal)}deg) scale(${mix(0.86, 1, reveal)})`,
            opacity: reveal,
          }}
        >
          <SiteWindow width={820} height={540} address={SITE_ADDRESS}>
            <SiteFrame files={SITE_FILES} height={500} scrollY={keys(t, [[52400, 0], [54000, 80]], easeInOut)} />
          </SiteWindow>
        </div>
      ) : null}
      {phone > 0 ? (
        <div
          className="absolute left-[76%] top-[54%]"
          style={{
            transform: `translate(-50%, calc(-50% + ${(1 - phone) * 160}px)) perspective(1600px) rotateX(${mix(14, 6, phone)}deg) rotateY(${mix(-22, -14, phone)}deg)`,
            opacity: phone,
          }}
        >
          <PhoneFrame width={212} height={436}>
            <div className="pt-8">
              <SiteFrame files={SITE_FILES} height={390} phone={{ width: 194 }} scrollY={keys(t, [[52800, 0], [54000, 140]], easeInOut)} />
            </div>
          </PhoneFrame>
        </div>
      ) : null}
    </Stage>
  );
}

// ------------------------------------------------------------------ portrait

const SCREEN = { w: 384, h: 500 };

const PORTRAIT_CAMERA = {
  x: [[0, 192], [54000, 192]] as [number, number][],
  y: [[0, 250], [2200, 250], [3400, 230], [6000, 230], [7400, 250], [33600, 250], [34400, 210], [36600, 210], [37400, 250]] as [number, number][],
  s: [[0, 0.86], [2200, 1], [3400, 1.12], [6000, 1.12], [7400, 1], [33600, 1], [34400, 1.18], [36600, 1.18], [37400, 1]] as [number, number][],
  rx: [[0, 10], [2600, 2], [51800, 2], [54000, 6]] as [number, number][],
  ry: [[0, -12], [2600, -2], [17000, 2], [31000, -2], [51800, 0], [54000, -6]] as [number, number][],
};

const PORTRAIT_POINTER: { path: [number, number, number][]; clicks: number[] } = {
  path: [
    [4600, 250, 420],
    [6000, 312, 330],
    [7200, 312, 330],
    [14400, 260, 470],
    [15500, 116, 300],
    [16600, 116, 300],
    [41000, 260, 470],
    [42000, 100, 372],
    [43000, 100, 372],
  ],
  clicks: [6100, 15600, 42100],
};

function PortraitBuild({ t }: { t: number }) {
  const cam = cameraAt(t, PORTRAIT_CAMERA);
  const reveal = progress(t, 51200, 53000);
  return (
    <Stage t={t} width={432} height={540} label={false}>
      <Rig cam={cam} width={432} height={524} setWidth={SCREEN.w} setHeight={SCREEN.h} opacity={1 - reveal} blur={reveal * 4}>
        <div
          className="relative overflow-hidden rounded-[30px] ring-1 ring-line"
          style={{ width: SCREEN.w, height: SCREEN.h, boxShadow: "0 40px 80px -34px color-mix(in oklab, var(--color-ink) 36%, transparent), 0 20px 50px -24px color-mix(in oklab, var(--color-accent) 32%, transparent)" }}
        >
          <MobileShell active={NAV[sceneAt(t)]} core={coreAt(t)}>
            <Scenes t={t} portrait />
          </MobileShell>
          <Pointer t={t} path={PORTRAIT_POINTER.path} clicks={PORTRAIT_POINTER.clicks} shows={LANDSCAPE_SHOWS} />
        </div>
      </Rig>
      {reveal > 0 ? (
        <div className="absolute left-1/2 top-[48%]" style={{ transform: `translate(-50%, calc(-50% + ${(1 - reveal) * 60}px)) scale(${mix(0.9, 1, reveal)})`, opacity: reveal }}>
          <PhoneFrame width={236} height={486}>
            <div className="pt-8">
              <SiteFrame files={SITE_FILES} height={440} phone={{ width: 218 }} scrollY={keys(t, [[52400, 0], [54000, 160]], easeInOut)} />
            </div>
          </PhoneFrame>
        </div>
      ) : null}
      <p className="absolute bottom-[1.4%] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface/85 px-2 py-0.5 text-[8px] text-ink-3 ring-1 ring-line">Sample project, recorded from Farbaek&apos;s interface.</p>
    </Stage>
  );
}

export function BuildFilm({ t, format }: { t: number; format: "landscape" | "portrait" }) {
  return format === "portrait" ? <PortraitBuild t={t} /> : <LandscapeBuild t={t} />;
}

// ------------------------------------------------------------------ clips (4:3, 10 s loops)

const CLIP_SET = { w: 1000, h: 680 };
type CamTrack = { x: [number, number][]; y: [number, number][]; s: [number, number][]; rx?: [number, number][]; ry?: [number, number][] };

/** A clip: one part of the build, shot closer, fading through the stage at the loop point. */
function ClipFrame({ t, cam, children, nav, core = "idle", extra, dim = 0 }: { t: number; cam: CamTrack; children: ReactNode; nav: NavKey; core?: "idle" | "working" | "done"; extra?: ReactNode; dim?: number }) {
  const fade = Math.min(progress(t, 0, 500), 1 - progress(t, 9500, 10_000));
  return (
    <Stage t={t + 20_000} width={1024} height={768}>
      <Rig cam={cameraAt(t, cam)} width={1024} height={768} setWidth={CLIP_SET.w} setHeight={CLIP_SET.h} opacity={fade * (1 - dim * 0.3)} blur={dim * 2.5}>
        <AppWindow width={CLIP_SET.w} height={CLIP_SET.h}>
          <AppShell active={nav} core={core}>
            <div className="absolute inset-0 px-8 py-7">{children}</div>
          </AppShell>
        </AppWindow>
      </Rig>
      {extra ? <div style={{ opacity: fade }}>{extra}</div> : null}
    </Stage>
  );
}

export type ClipId = "clip-plan" | "clip-agent" | "clip-check" | "clip-live";

export function ClipFilm({ id, t }: { id: ClipId; t: number }) {
  if (id === "clip-plan") {
    // The plan assembles, then the camera settles on the skills and Approve and build.
    const scroll = keys(t, [[3200, 0], [5600, 430]]);
    return (
      <ClipFrame t={t} nav="build" cam={{ x: [[0, 520], [7000, 560]], y: [[0, 330], [5000, 340], [7000, 340]], s: [[0, 1.02], [5000, 1.08], [7000, 1.18]], rx: [[0, 6], [3000, 2]], ry: [[0, -6], [10_000, 2]] }}>
        <div style={{ transform: `translateY(${-scroll}px)` }}>
          <PlanView t={t + 8000} from={8000} approvedAt={8000 + 9200} />
        </div>
      </ClipFrame>
    );
  }
  if (id === "clip-agent") {
    return (
      <ClipFrame t={t} nav="build" core={t < 8800 ? "working" : "done"} cam={{ x: [[0, 560], [10_000, 560]], y: [[0, 340], [10_000, 360]], s: [[0, 1.0], [10_000, 1.1]], rx: [[0, 4], [10_000, 2]], ry: [[0, -5], [10_000, 3]] }}>
        <RunView t={t + 1800} from={0} layout="wide" />
      </ClipFrame>
    );
  }
  if (id === "clip-check") {
    return (
      <ClipFrame t={t} nav="projects" cam={{ x: [[0, 560], [2600, 560], [4200, 600], [10_000, 610]], y: [[0, 330], [2600, 320], [4200, 300], [10_000, 300]], s: [[0, 1.0], [2600, 1.05], [4200, 1.24], [10_000, 1.28]], rx: [[0, 5], [10_000, 2]], ry: [[0, -4], [10_000, 3]] }}>
        <CheckView t={t + 600} from={0} />
      </ClipFrame>
    );
  }
  // The live check, then the phone shows the site people now reach.
  const phone = progress(t, 6200, 7800);
  return (
    <ClipFrame
      t={t}
      nav="projects"
      dim={phone}
      cam={{ x: [[0, 520], [6000, 500], [8000, 470]], y: [[0, 330], [10_000, 360]], s: [[0, 1.08], [6000, 1.18], [8000, 1.05]], rx: [[0, 4], [10_000, 2]], ry: [[0, -4], [10_000, 3]] }}
      extra={
        phone > 0 ? (
          <div className="absolute left-[74%] top-[52%]" style={{ transform: `translate(-50%, calc(-50% + ${(1 - phone) * 140}px)) perspective(1600px) rotateY(-16deg) rotateX(6deg)`, opacity: phone }}>
            <PhoneFrame width={200} height={412}>
              <div className="pt-8">
                <SiteFrame files={SITE_FILES} height={366} phone={{ width: 182 }} scrollY={keys(t, [[7600, 0], [9400, 120]], easeInOut)} />
              </div>
            </PhoneFrame>
          </div>
        ) : null
      }
    >
      <LiveView t={t + 200} from={0} checkedAt={5200} />
    </ClipFrame>
  );
}
