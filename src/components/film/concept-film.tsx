"use client";

/**
 * The concept film: a cinematic, real-time motion sequence of the intended
 * Farbaek workflow, rendered in the browser from sample data (spec 16.7).
 * Hashes shown are real digests of that sample data, computed on the server.
 * It is labelled "Concept film, sample data" in the frame and below it.
 *
 * Plays only while visible; never autoplays under reduced motion; every
 * chapter can be reached with the keyboard; a full transcript sits below.
 */
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleDashedIcon,
  FingerprintIcon,
  PauseIcon,
  PlayIcon,
  RocketLaunchIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ProofPackSeal } from "@/components/proof/proofpack-seal";
import type { DiffLine } from "@/content/samples";

export interface FilmData {
  proofDigest: string;
  bindingHash: string;
  diff: DiffLine[];
  diffPath: string;
}

export const FILM_SCENES = [
  { key: "intent", label: "Intent", caption: "A plain request: rewrite 100 product descriptions and leave prices alone." },
  { key: "contract", label: "Contract", caption: "Farbaek turns it into a contract you can read, edit and approve." },
  { key: "code", label: "Code", caption: "The agent proposes a targeted diff instead of rewriting the project." },
  { key: "test", label: "Test", caption: "Real checks run. Exit codes decide, and anything not run says so." },
  { key: "approval", label: "Approval", caption: "You approve one exact change, bound to the hash of what you saw." },
  { key: "proof", label: "Proof", caption: "A ProofPack seals what ran, against which state, and its limits." },
  { key: "launch", label: "Launch", caption: "A deploy needs that proof, then reports real health checks." },
] as const;

const SCENE_MS = 4600;
const EASE = [0.16, 1, 0.3, 1] as const;

const short = (hex: string) => `sha256:${hex.slice(0, 10)}…${hex.slice(-6)}`;

function useStagger(reduce: boolean | null): { list: Variants; item: Variants } {
  return {
    list: { hidden: {}, shown: { transition: { staggerChildren: reduce ? 0 : 0.18, delayChildren: reduce ? 0 : 0.15 } } },
    item: reduce
      ? { hidden: { opacity: 0 }, shown: { opacity: 1 } }
      : { hidden: { opacity: 0, y: 14, filter: "blur(6px)" }, shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: EASE } } },
  };
}

function SceneIntent({ reduce }: { reduce: boolean | null }) {
  const words = "Rewrite the descriptions of 100 products.".split(" ");
  const { list, item } = useStagger(reduce);
  return (
    <div className="mx-auto max-w-[30ch] text-center">
      <p className="font-mono text-xs text-media-ink-3 sm:text-sm">{"// you"}</p>
      <motion.p variants={list} initial="hidden" animate="shown" className="mt-4 text-2xl font-medium leading-tight tracking-[-0.03em] text-media-ink sm:text-4xl">
        {words.map((w, i) => (
          <motion.span key={i} variants={item} className="mr-[0.25em] inline-block">
            {w}
          </motion.span>
        ))}
      </motion.p>
      <motion.p
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduce ? 0 : 1.6, duration: 0.6 }}
        className="mt-3 text-lg text-media-ink-2 sm:text-2xl"
      >
        Don&apos;t change prices, stock or orders.
      </motion.p>
    </div>
  );
}

function SceneContract({ reduce }: { reduce: boolean | null }) {
  const { list, item } = useStagger(reduce);
  const clauses = [
    ["Allowed", "products.update"],
    ["Protected", "price, stock, published"],
    ["Limit", "100 records"],
    ["Verify", "read back every description"],
  ];
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.94, rotateX: 18 }}
      animate={{ opacity: 1, scale: 1, rotateX: 0 }}
      transition={{ duration: 0.8, ease: EASE }}
      style={{ transformPerspective: 900 }}
      className="mx-auto w-full max-w-md rounded-[20px] border border-white/10 bg-white/[0.04] p-5 sm:p-6"
    >
      <p className="font-mono text-xs text-media-ink-3">intent-contract.json</p>
      <p className="mt-1 text-lg font-medium text-media-ink">Contract v3</p>
      <motion.ul variants={list} initial="hidden" animate="shown" className="mt-4 grid gap-2.5">
        {clauses.map(([k, v]) => (
          <motion.li key={k} variants={item} className="flex items-baseline gap-3 rounded-[12px] bg-white/[0.04] px-3 py-2.5 text-sm">
            <CheckIcon size={14} weight="bold" className="shrink-0 translate-y-0.5 text-media-accent" aria-hidden />
            <span className="w-20 shrink-0 text-media-ink-3">{k}</span>
            <span className="font-mono text-[13px] text-media-ink">{v}</span>
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>
  );
}

function SceneCode({ reduce, diff, path }: { reduce: boolean | null; diff: DiffLine[]; path: string }) {
  const { list, item } = useStagger(reduce);
  const tone: Record<DiffLine["kind"], string> = {
    context: "border-transparent text-media-ink-2",
    removed: "border-media-red bg-media-red/10 text-media-ink",
    added: "border-media-green bg-media-green/10 text-media-ink",
  };
  return (
    <div className="mx-auto w-full max-w-xl overflow-hidden rounded-[20px] border border-white/10 bg-black/30">
      <p className="border-b border-white/10 px-4 py-2.5 font-mono text-xs text-media-ink-3">{path}</p>
      <motion.pre variants={list} initial="hidden" animate="shown" className="py-2 font-mono text-[11.5px] leading-[1.7] sm:text-[13px]">
        {diff.map((line, i) => (
          <motion.span key={i} variants={item} className={`block border-l-2 px-4 whitespace-pre-wrap break-words ${tone[line.kind]}`}>
            <span aria-hidden className="mr-3 text-media-ink-3">
              {line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}
            </span>
            {line.text}
          </motion.span>
        ))}
      </motion.pre>
    </div>
  );
}

function SceneTest({ reduce }: { reduce: boolean | null }) {
  const { list, item } = useStagger(reduce);
  const rows = [
    { cmd: "pnpm typecheck", ok: true, result: "exit 0" },
    { cmd: "pnpm test", ok: true, result: "exit 0" },
    { cmd: "read back 100 descriptions", ok: true, result: "passed" },
    { cmd: "storefront on real devices", ok: false, result: "not run" },
  ];
  return (
    <motion.ul variants={list} initial="hidden" animate="shown" className="mx-auto grid w-full max-w-md gap-2.5">
      {rows.map((r) => (
        <motion.li
          key={r.cmd}
          variants={item}
          className={`flex items-center justify-between gap-4 rounded-[12px] border px-4 py-3 ${r.ok ? "border-white/10 bg-white/[0.04]" : "border-dashed border-white/20"}`}
        >
          <span className="font-mono text-[12.5px] text-media-ink sm:text-sm">{r.cmd}</span>
          <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium sm:text-sm ${r.ok ? "text-media-green" : "text-media-ink-3"}`}>
            {r.ok ? <CheckCircleIcon size={16} weight="fill" aria-hidden /> : <CircleDashedIcon size={16} aria-hidden />}
            {r.result}
          </span>
        </motion.li>
      ))}
    </motion.ul>
  );
}

function SceneApproval({ reduce, bindingHash }: { reduce: boolean | null; bindingHash: string }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-[20px] border border-white/10 bg-white/[0.04] p-5 text-center sm:p-7">
      <p className="text-lg font-medium leading-snug text-media-ink sm:text-xl">Approve 100 product description updates?</p>
      <p className="mt-3 font-mono text-xs break-all text-media-ink-2 sm:text-[13px]">{short(bindingHash)}</p>
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 1.25 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: reduce ? 0 : 1.4, type: "spring", stiffness: 260, damping: 18 }}
        className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-media-green/15 px-4 py-2 text-sm font-medium text-media-green"
      >
        <FingerprintIcon size={18} weight="bold" aria-hidden /> Approved this exact payload
      </motion.div>
    </div>
  );
}

function SceneProof({ reduce, digest }: { reduce: boolean | null; digest: string }) {
  return (
    <div className="flex flex-col items-center">
      <motion.div
        initial={reduce ? false : { opacity: 0, rotate: -24, scale: 0.86, clipPath: "circle(0% at 50% 50%)" }}
        animate={{ opacity: 1, rotate: 0, scale: 1, clipPath: "circle(75% at 50% 50%)" }}
        transition={{ duration: 1.6, ease: EASE }}
        className="w-40 sm:w-52"
      >
        <ProofPackSeal hash={digest} caption="Sample ProofPack" tone="media" idSuffix="-film" />
      </motion.div>
      <motion.p
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduce ? 0 : 1.2 }}
        className="mt-4 font-mono text-xs text-media-ink-2 sm:text-sm"
      >
        verified · {short(digest)}
      </motion.p>
    </div>
  );
}

function SceneLaunch({ reduce, digest }: { reduce: boolean | null; digest: string }) {
  const { list, item } = useStagger(reduce);
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5">
        <RocketLaunchIcon size={16} className="text-media-accent" aria-hidden />
        <span className="truncate font-mono text-[12.5px] text-media-ink sm:text-sm">https://preview.example.dev</span>
        <ArrowSquareOutIcon size={14} className="ml-auto shrink-0 text-media-ink-3" aria-hidden />
      </div>
      <motion.ul variants={list} initial="hidden" animate="shown" className="mt-4 grid gap-2 text-sm">
        {[`Deploying the commit sealed by ${short(digest)}`, "Certificate issued", "Health check passed"].map((t) => (
          <motion.li key={t} variants={item} className="flex items-center gap-2.5 text-media-ink-2">
            <CheckCircleIcon size={16} weight="fill" className="shrink-0 text-media-green" aria-hidden />
            <span className="truncate">{t}</span>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}

export function ConceptFilm({ data }: { data: FilmData }) {
  const reduce = useReducedMotion();
  const frame = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [run, setRun] = useState(0); // bumps to restart the current chapter's timer and bar
  const playing = !userPaused && !reduce;
  const advancing = playing && visible;

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting) && !document.hidden), { threshold: 0.35 });
    io.observe(el);
    const onVis = () => setVisible(!document.hidden && el.getBoundingClientRect().top < window.innerHeight);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (!advancing) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % FILM_SCENES.length), SCENE_MS);
    return () => window.clearTimeout(t);
  }, [advancing, index, run]);

  const scene = FILM_SCENES[index]!;
  const go = (i: number) => {
    setIndex(i);
    setRun((r) => r + 1);
  };

  return (
    <figure className="m-0">
      <div
        ref={frame}
        role="region"
        aria-roledescription="concept film"
        aria-label="Farbaek concept film, sample data"
        className="relative overflow-hidden rounded-[28px] bg-media shadow-e3"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, rgb(127 156 255 / 0.16), transparent 70%), radial-gradient(40% 40% at 90% 100%, rgb(95 211 232 / 0.10), transparent 70%)",
          }}
        />
        <p className="absolute left-5 top-4 z-10 font-mono text-[11px] text-media-ink-3 sm:left-7 sm:top-6 sm:text-xs">Concept film · sample data</p>

        <div className="relative flex aspect-[4/5] items-center justify-center px-5 py-16 sm:aspect-[16/10] sm:px-10 lg:aspect-[16/8.5]">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${scene.key}-${run}`}
              className="w-full"
              initial={reduce ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.02, filter: "blur(8px)", transition: { duration: 0.35 } }}
              transition={{ duration: 0.5, ease: EASE }}
            >
              {scene.key === "intent" && <SceneIntent reduce={reduce} />}
              {scene.key === "contract" && <SceneContract reduce={reduce} />}
              {scene.key === "code" && <SceneCode reduce={reduce} diff={data.diff} path={data.diffPath} />}
              {scene.key === "test" && <SceneTest reduce={reduce} />}
              {scene.key === "approval" && <SceneApproval reduce={reduce} bindingHash={data.bindingHash} />}
              {scene.key === "proof" && <SceneProof reduce={reduce} digest={data.proofDigest} />}
              {scene.key === "launch" && <SceneLaunch reduce={reduce} digest={data.proofDigest} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Controls: play/pause, caption and chapter thread. */}
        <div className="relative z-10 border-t border-white/[0.06] bg-black/20 px-4 pb-4 pt-3 sm:px-7 sm:pb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setUserPaused((p) => !p);
                setRun((r) => r + 1);
              }}
              disabled={Boolean(reduce)}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-media-ink transition-colors hover:bg-white/20 disabled:opacity-40"
              aria-label={playing ? "Pause film" : "Play film"}
              title={reduce ? "Autoplay is off because your system asks for reduced motion. Use the chapters." : undefined}
            >
              {playing ? <PauseIcon size={16} weight="fill" aria-hidden /> : <PlayIcon size={16} weight="fill" aria-hidden />}
            </button>
            <p className="min-h-[2.5rem] flex-1 text-[13px] leading-snug text-media-ink-2 sm:text-[15px]">{scene.caption}</p>
          </div>

          <ol className="mt-3 grid grid-cols-7 gap-1.5" aria-label="Chapters">
            {FILM_SCENES.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === index ? "step" : undefined}
                  className="group block w-full rounded-full py-2 text-left"
                >
                  <span className="relative block h-[3px] overflow-hidden rounded-full bg-white/15">
                    {i < index ? <span className="absolute inset-0 bg-media-accent" /> : null}
                    {i === index ? (
                      <motion.span
                        key={`bar-${index}-${run}-${advancing}`}
                        className="absolute inset-0 origin-left bg-media-accent"
                        initial={{ scaleX: advancing ? 0 : 1 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: advancing ? SCENE_MS / 1000 : 0, ease: "linear" }}
                      />
                    ) : null}
                  </span>
                  <span
                    className={`mt-1.5 hidden text-[11px] sm:block ${i === index ? "text-media-ink" : "text-media-ink-3 group-hover:text-media-ink-2"}`}
                  >
                    {s.label}
                  </span>
                  <span className="sr-only sm:hidden">{s.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <figcaption className="mt-4 flex flex-col gap-2 text-sm text-ink-3 sm:flex-row sm:items-start sm:justify-between">
        <span>The intended workflow, played in real time from sample data. Farbaek is in development.</span>
        <details className="group sm:text-right">
          <summary className="cursor-pointer list-none text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">Read the transcript</summary>
          <ol className="mt-3 grid gap-1.5 text-left text-ink-2">
            {FILM_SCENES.map((s) => (
              <li key={s.key}>
                <span className="font-medium text-ink">{s.label}.</span> {s.caption}
              </li>
            ))}
          </ol>
        </details>
      </figcaption>
    </figure>
  );
}
