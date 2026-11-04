"use client";

/**
 * "One build, start to finish" (ADR 0034, shot in the studio of ADR 0164),
 * and the four feature clips cut from the same build. Each chapter opens on
 * a headline beside the window, then the card that matters lifts out of it.
 */
import type { ReactNode } from "react";
import { easeInOut, keys, mix, progress } from "../timeline";
import { AppShell, CheckView, DescribeView, LiveView, MobileShell, PlanView, PublishView, RunView, SITE_ADDRESS, SITE_FILES, type NavKey } from "./app-ui";
import { AppWindow, PhoneFrame, SiteFrame, SiteWindow } from "./primitives";
import { CLIP_STUDIO, FilmLabel, LANDSCAPE_STUDIO, PORTRAIT_STUDIO, StudioFilm, byText, looped, type Head, type Lift } from "./studio";

// Scene windows in film time (ms). Each scene dissolves into the next over the boundary.
const SCENES = {
  describe: [0, 8500],
  plan: [8500, 18500],
  build: [18500, 32500],
  check: [32500, 40500],
  publish: [40500, 48000],
  live: [48000, 58000],
} as const;
type SceneKey = keyof typeof SCENES;

const NAV: Record<SceneKey, NavKey> = { describe: "build", plan: "build", build: "build", check: "projects", publish: "projects", live: "projects" };
const sceneAt = (t: number): SceneKey => (Object.keys(SCENES) as SceneKey[]).find((k) => t < SCENES[k][1]) ?? "live";

// When each part of the interface acts.
const AT = {
  typeFrom: 3500,
  submit: 6650,
  plan: 8600,
  approve: 16750,
  run: 20800,
  check: 34900,
  publish: 41400,
  publishClick: 45000,
  live: 50400,
  liveChecked: 53900,
} as const;

const coreAt = (t: number) => (t >= AT.run && t < AT.run + 10_200 ? "working" : t >= AT.run + 10_200 && t < SCENES.build[1] ? "done" : "idle");

const HEADS: Head[] = [
  { from: -150, to: 2700, text: "Say it in one sentence.", accent: "sentence", sub: "Farbaek starts a project and drafts a plan." },
  { from: 8500, to: 11100, text: "You approve the plan.", accent: "plan", sub: "The goal, the limits and the checks, in plain words. Nothing is built until you say yes." },
  { from: 18500, to: 21100, text: "Watch it build.", accent: "build", sub: "Every step in the open, with a live preview." },
  { from: 32500, to: 35100, text: "Checked before it ships.", accent: "Checked", sub: "Security rules read exactly these files." },
  { from: 40500, to: 43100, text: "Publish this exact version.", accent: "version", sub: "At its own address. Every version is kept." },
  { from: 48000, to: 50600, text: "Then one last check.", accent: "check", sub: "Farbaek opens the address and confirms these exact files answer." },
  { from: 55300, to: 60_000, text: "From one sentence to a live site.", accent: "live", sub: "A sample project, start to finish." },
];

const approveButton = byText("button", "Approve and build");
const itself = (el: HTMLElement) => el;

function lifts(portrait: boolean): Lift[] {
  return [
    { scene: "describe", target: "composer", from: 2900, to: 7900, clicks: [{ at: AT.submit, target: "plan-it" }] },
    { scene: "plan", target: "plan-grid", from: 11300, to: 14300, pad: 16 },
    { scene: "plan", target: approveButton, from: 14900, to: 18200, pad: 28, maxScale: portrait ? 1.6 : 1.9, clicks: [{ at: AT.approve - 50, target: itself }] },
    { scene: "build", target: "preview", from: 21300, to: 26300 },
    { scene: "build", target: "steps", from: 26700, to: 32100, pad: 18 },
    { scene: "check", target: "score", from: 35300, to: 40200, pad: 16 },
    { scene: "publish", target: (s) => s.querySelector<HTMLElement>("section#publish"), from: 43300, to: 47700, clicks: [{ at: AT.publishClick, target: byText("button", "Publish") }] },
    { scene: "live", target: "chain", from: 50600, to: 55000, pad: 20 },
  ];
}

/** How far the page has scrolled inside the window: the plan scrolls down to its Approve and build. */
function scrollFor(scene: string, t: number, portrait: boolean): number {
  if (scene === "plan") return keys(t, [[14300, 0], [15000, portrait ? 820 : 520]]);
  if (scene === "publish" && portrait) return keys(t, [[42800, 0], [43200, 60]]);
  return 0;
}

function content(portrait: boolean) {
  return function sceneContent(scene: string, t: number): ReactNode {
    switch (scene as SceneKey) {
      case "describe":
        return <DescribeView t={t} typeFrom={AT.typeFrom} submitAt={AT.submit} />;
      case "plan":
        return <PlanView t={t} from={AT.plan} approvedAt={AT.approve} compact={portrait} />;
      case "build":
        return <RunView t={t} from={AT.run} layout={portrait ? (t < 26500 ? "preview" : "steps") : "wide"} />;
      case "check":
        return <CheckView t={t} from={AT.check} />;
      case "publish":
        return <PublishView t={t} from={AT.publish} publishAt={AT.publishClick} />;
      case "live":
        return <LiveView t={t} from={AT.live} checkedAt={AT.liveChecked} />;
    }
  };
}

// ------------------------------------------------------------------ landscape

function LandscapeBuild({ t }: { t: number }) {
  // The finished site rises where the app was, with a phone showing it at phone width.
  const reveal = progress(t, 55100, 56800);
  const phone = progress(t, 55700, 57400);
  return (
    <StudioFilm
      t={t}
      layout={LANDSCAPE_STUDIO}
      scenes={SCENES}
      content={content(false)}
      pad="px-8 py-7"
      scroll={(s, tt) => scrollFor(s, tt, false)}
      frame={(scenes) => (
        <AppWindow width={1120} height={700}>
          <AppShell active={NAV[sceneAt(t)]} core={coreAt(t)}>
            {scenes}
          </AppShell>
        </AppWindow>
      )}
      heads={HEADS}
      lifts={lifts(false)}
      exit={{ from: 54800, to: 56600, pose: { x: 720, y: 380, s: 0.5, rx: 10, ry: -2 }, fade: 1, blur: 8 }}
      overlay={
        <>
          {reveal > 0 ? (
            <div
              className="absolute left-[61%] top-[50%] z-20"
              style={{ transform: `translate(-50%, calc(-50% + ${(1 - reveal) * 120}px)) perspective(2000px) rotateX(${mix(16, 5, reveal)}deg) rotateY(${mix(-16, -9, reveal)}deg) scale(${mix(0.66, 0.78, reveal)})`, opacity: reveal }}
            >
              <SiteWindow width={820} height={540} address={SITE_ADDRESS}>
                <SiteFrame files={SITE_FILES} height={500} scrollY={keys(t, [[56200, 0], [58000, 90]], easeInOut)} />
              </SiteWindow>
            </div>
          ) : null}
          {phone > 0 ? (
            <div
              className="absolute left-[87%] top-[56%] z-20"
              style={{ transform: `translate(-50%, calc(-50% + ${(1 - phone) * 150}px)) perspective(1600px) rotateX(${mix(14, 6, phone)}deg) rotateY(${mix(-22, -14, phone)}deg)`, opacity: phone }}
            >
              <PhoneFrame width={212} height={436}>
                <div className="pt-8">
                  <SiteFrame files={SITE_FILES} height={390} phone={{ width: 194 }} scrollY={keys(t, [[56600, 0], [58000, 140]], easeInOut)} />
                </div>
              </PhoneFrame>
            </div>
          ) : null}
        </>
      }
      label={<FilmLabel place="left" />}
    />
  );
}

// ------------------------------------------------------------------ portrait

function PortraitBuild({ t }: { t: number }) {
  const reveal = progress(t, 55300, 57000);
  return (
    <StudioFilm
      t={t}
      layout={PORTRAIT_STUDIO}
      scenes={SCENES}
      content={content(true)}
      pad="px-4 py-5"
      scroll={(s, tt) => scrollFor(s, tt, true)}
      frame={(scenes) => (
        <MobileShell active={NAV[sceneAt(t)]} core={coreAt(t)}>
          {scenes}
        </MobileShell>
      )}
      heads={HEADS}
      lifts={lifts(true)}
      exit={{ from: 54800, to: 56600, pose: { x: 216, y: 330, s: 0.5, rx: 10, ry: 0 }, fade: 1, blur: 6 }}
      overlay={
        reveal > 0 ? (
          <div className="absolute left-1/2 top-[60%] z-20" style={{ transform: `translate(-50%, calc(-50% + ${(1 - reveal) * 60}px)) scale(${mix(0.64, 0.71, reveal)})`, opacity: reveal }}>
            <PhoneFrame width={236} height={486}>
              <div className="pt-8">
                <SiteFrame files={SITE_FILES} height={440} phone={{ width: 218 }} scrollY={keys(t, [[56400, 0], [58000, 160]], easeInOut)} />
              </div>
            </PhoneFrame>
          </div>
        ) : null
      }
      label={<FilmLabel place="center" />}
    />
  );
}

export function BuildFilm({ t, format }: { t: number; format: "landscape" | "portrait" }) {
  return format === "portrait" ? <PortraitBuild t={t} /> : <LandscapeBuild t={t} />;
}

// ------------------------------------------------------------------ clips (4:3, 10 s loops)

export type ClipId = "clip-plan" | "clip-agent" | "clip-check" | "clip-live";
const LOOP = 10_000;
const CLIP_SCENES = { clip: [-1000, LOOP + 1000] } as const;

function Clip({ t, nav, core = "idle", base, lifts: clipLifts, scroll, overlay }: { t: number; nav: NavKey; core?: "idle" | "working" | "done"; base: (t: number) => ReactNode; lifts: Lift[]; scroll?: (t: number) => number; overlay?: ReactNode }) {
  return (
    <StudioFilm
      t={t}
      layout={CLIP_STUDIO}
      scenes={CLIP_SCENES}
      content={looped(base, LOOP)}
      pad="px-8 py-7"
      scroll={scroll ? (_s, tt) => scroll(tt) : undefined}
      frame={(scenes) => (
        <AppWindow width={1000} height={680}>
          <AppShell active={nav} core={core}>
            {scenes}
          </AppShell>
        </AppWindow>
      )}
      lifts={clipLifts}
      overlay={overlay}
      label={<FilmLabel place="right" />}
    />
  );
}

export function ClipFilm({ id, t }: { id: ClipId; t: number }) {
  if (id === "clip-plan") {
    // The plan in plain words, then down to Approve and build, and back up for the loop.
    return (
      <Clip
        t={t}
        nav="build"
        base={(ct) => <PlanView t={ct + 12_000} from={8000} approvedAt={12_000 + 7000} />}
        scroll={(ct) => keys(ct, [[4300, 0], [4900, 560], [9200, 560], [9900, 0]])}
        lifts={[
          { scene: "clip", target: "plan-grid", from: 700, to: 4300, pad: 16 },
          { scene: "clip", target: approveButton, from: 4900, to: 9200, pad: 28, maxScale: 1.9, clicks: [{ at: 6950, target: itself }] },
        ]}
      />
    );
  }
  if (id === "clip-agent") {
    return (
      <Clip
        t={t}
        nav="build"
        core={t + 1200 < 10_200 ? "working" : "done"}
        base={(ct) => <RunView t={ct + 1200} from={0} layout="wide" />}
        lifts={[
          { scene: "clip", target: "preview", from: 600, to: 5000 },
          { scene: "clip", target: "steps", from: 5400, to: 9300, pad: 18 },
        ]}
      />
    );
  }
  if (id === "clip-check") {
    return <Clip t={t} nav="projects" base={(ct) => <CheckView t={ct + 400} from={0} />} lifts={[{ scene: "clip", target: "score", from: 800, to: 9100, pad: 16 }]} />;
  }
  // The live check, then the phone shows the site people now reach.
  const phone = Math.min(progress(t, 6500, 7900), 1 - progress(t, 9000, 9700));
  return (
    <Clip
      t={t}
      nav="projects"
      base={(ct) => <LiveView t={ct + 200} from={0} checkedAt={5200} />}
      lifts={[{ scene: "clip", target: "chain", from: 600, to: 6600, pad: 20 }]}
      overlay={
        phone > 0 ? (
          <div className="absolute left-[76%] top-[52%] z-20" style={{ transform: `translate(-50%, calc(-50% + ${(1 - phone) * 140}px)) perspective(1600px) rotateY(-16deg) rotateX(6deg)`, opacity: phone }}>
            <PhoneFrame width={200} height={412}>
              <div className="pt-8">
                <SiteFrame files={SITE_FILES} height={366} phone={{ width: 182 }} scrollY={keys(t, [[7400, 0], [9400, 120]], easeInOut)} />
              </div>
            </PhoneFrame>
          </div>
        ) : null
      }
    />
  );
}
