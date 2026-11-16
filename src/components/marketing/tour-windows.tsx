import { FilmSlateIcon, PaintBrushIcon, PenNibIcon } from "@phosphor-icons/react/ssr";
import Image from "next/image";
import type { ReactNode } from "react";
import { StatusGlyph } from "@/components/ui/status-badge";
import { ChatGlimpse } from "./glimpses";

/**
 * The windows the homepage's tour crossfades between (stage 201): each space as it looks, in one frame. Chat is its own
 * interface; Images and Video show the studio at work, with the brief and the shots Farbaek AI writes; Build is a frame from
 * the real recording of the agent building a sample site. Sample content, said so under each.
 */
function Frame({ title, children, note, tone }: { title: string; children: ReactNode; note: string; tone: string }) {
  const glow = (at: string, size: string, strength: number) => `radial-gradient(${size} at ${at}, color-mix(in oklab, ${tone} ${strength}%, transparent), transparent 72%)`;
  return (
    <figure className="relative flex h-full flex-col">
      {/* The space's light, from behind the window's edges (ADR 0217, after Antigravity's product panels). */}
      <div aria-hidden className="pointer-events-none absolute -inset-3 bottom-4 rounded-[2rem] sm:-inset-4 sm:bottom-3" style={{ background: [glow("50% 3%", "56% 30%", 34), glow("2% 70%", "18% 44%", 26), glow("98% 40%", "18% 44%", 26)].join(", ") }} />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_60px_-28px_rgb(18_24_40/0.2)]">
        <div className="flex h-10 shrink-0 items-center border-b border-line px-4">
          <span className="truncate text-xs font-medium text-ink-2">{title}</span>
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
      <figcaption className="relative mt-2.5 text-center text-xs text-ink-3">{note}</figcaption>
    </figure>
  );
}

export function ChatWindow() {
  return (
    <Frame title="Farbaek AI" note="A sample conversation." tone="var(--color-accent)">
      <div className="absolute inset-0 overflow-hidden">
        <ChatGlimpse />
      </div>
    </Frame>
  );
}

/** A blue cup on grey stone, as a first look comes back: soft, before the detail arrives. Drawn from tokens. */
function FirstLook() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden" style={{ background: "linear-gradient(172deg, var(--color-surface) 0%, var(--color-canvas-2) 58%, var(--color-line) 58.2%, var(--color-surface-sunken) 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 50% at 18% 12%, color-mix(in oklab, var(--color-surface) 90%, transparent), transparent 70%)" }} />
      <div className="absolute bottom-[30%] left-1/2 h-[6%] w-[44%] -translate-x-1/2 rounded-[50%]" style={{ background: "radial-gradient(50% 50% at 50% 50%, color-mix(in oklab, var(--color-ink) 22%, transparent), transparent 75%)" }} />
      <div
        className="absolute bottom-[32%] left-1/2 h-[30%] w-[30%] -translate-x-1/2 rounded-b-[44%] rounded-t-[10%]"
        style={{ background: "linear-gradient(100deg, color-mix(in oklab, var(--color-accent) 46%, var(--color-ink-2)) 0%, color-mix(in oklab, var(--color-accent) 30%, var(--color-surface)) 38%, color-mix(in oklab, var(--color-accent) 55%, var(--color-ink-2)) 100%)" }}
      />
      <div className="absolute bottom-[56%] left-1/2 h-[4%] w-[30%] -translate-x-1/2 rounded-[50%]" style={{ background: "radial-gradient(50% 50% at 50% 50%, color-mix(in oklab, var(--color-ink) 30%, transparent), color-mix(in oklab, var(--color-accent) 25%, transparent) 70%)" }} />
      <div className="absolute bottom-[41%] left-[63%] h-[12%] w-[9%] rounded-r-[50%] border-[0.45rem] border-l-0" style={{ borderColor: "color-mix(in oklab, var(--color-accent) 46%, var(--color-ink-2))" }} />
    </div>
  );
}

export function ImagesWindow() {
  return (
    <Frame title="Image studio" note="The studio with a sample description; the picture is shown as its first look arrives." tone="var(--color-spark-rose)">
      <div className="grid h-full gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] sm:p-5">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm leading-relaxed text-ink">A blue ceramic cup on a grey stone table, soft window light</p>
          <div className="rounded-md bg-canvas-2 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
              <PenNibIcon size={14} weight="bold" aria-hidden />
              Refined by Farbaek AI
            </p>
            <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-ink-2">
              A matte cobalt cup on honed grey stone, morning light from a tall window on the left, a soft shadow falling right, steam just visible, shot at 85mm with a shallow depth of field.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["Product shot", "Portrait", "High detail"].map((c, i) => (
              <span key={c} className={`rounded-full px-2.5 py-1 text-xs font-medium ${i === 0 ? "bg-spark-rose/10 text-spark-rose" : "bg-canvas-2 text-ink-2"}`}>
                {c}
              </span>
            ))}
          </div>
          <span className="mt-auto inline-flex h-9 items-center gap-1.5 self-start rounded-full bg-primary px-3.5 text-xs font-medium text-on-primary">
            <PaintBrushIcon size={14} weight="bold" aria-hidden />
            Make
          </span>
        </div>
        <div className="relative hidden overflow-hidden rounded-md ring-1 ring-line sm:block">
          <FirstLook />
          <p className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-surface/85 px-3 py-2 text-xs text-ink-2">
            <StatusGlyph status="working" size={14} />
            First look, adding detail
          </p>
        </div>
      </div>
    </Frame>
  );
}

const SHOTS = [
  { label: "Wide on the lighthouse", tint: 18 },
  { label: "A slow push in", tint: 28 },
  { label: "Waves on the rocks", tint: 38 },
];

export function VideoWindow() {
  return (
    <Frame title="Video studio" note="The studio with a sample description and the shots Farbaek AI planned." tone="var(--color-spark-aqua)">
      <div className="flex h-full flex-col gap-3 p-4 sm:p-5">
        <p className="text-sm leading-relaxed text-ink">A slow push-in on a lighthouse at dawn as waves roll against the rocks</p>
        <div className="flex flex-wrap gap-1.5">
          {["Wide", "8 seconds", "With sound", "Cinematic"].map((c, i) => (
            <span key={c} className={`rounded-full px-2.5 py-1 text-xs font-medium ${i === 3 ? "bg-spark-aqua/10 text-spark-aqua" : "bg-canvas-2 text-ink-2"}`}>
              {c}
            </span>
          ))}
        </div>
        <p className="mt-1 text-xs font-medium text-ink-2">The shots Farbaek AI planned</p>
        <ol className="grid grid-cols-3 gap-2">
          {SHOTS.map((s) => (
            <li key={s.label} className="grid gap-1.5">
              <span
                aria-hidden
                className="relative block aspect-video overflow-hidden rounded-sm ring-1 ring-line"
                style={{ background: `linear-gradient(180deg, color-mix(in oklab, var(--color-spark-aqua) ${s.tint + 10}%, var(--color-media)) 0%, color-mix(in oklab, var(--color-spark-ember) ${s.tint + 6}%, var(--color-media)) 55%, var(--color-media) 56%, var(--color-media) 100%)` }}
              >
                {/* The lighthouse, nearer in each shot. */}
                <span className="absolute bottom-[44%] block rounded-t-[2px] bg-media-ink-2" style={{ left: `${38 + s.tint / 4}%`, width: `${4 + s.tint / 8}%`, height: `${18 + s.tint / 2}%` }} />
                <span className="absolute bottom-[44%] block h-[44%] w-full" style={{ background: "radial-gradient(30% 40% at 45% 0%, color-mix(in oklab, var(--color-surface) 35%, transparent), transparent 70%)" }} />
              </span>
              <span className="text-xs leading-snug text-ink-3">{s.label}</span>
            </li>
          ))}
        </ol>
        <div className="mt-auto flex items-center justify-between gap-3 rounded-md bg-canvas-2 px-3 py-2.5">
          <span className="flex items-center gap-2 text-xs text-ink-2">
            <StatusGlyph status="working" size={14} />
            Rendering with sound
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
            <FilmSlateIcon size={14} weight="bold" aria-hidden />
            Keeps going if you leave
          </span>
        </div>
      </div>
    </Frame>
  );
}

export function BuildWindow() {
  return (
    <Frame title="Build" note="Recorded from Farbaek's interface: the agent building a sample bakery site." tone="var(--color-spark-leaf)">
      <Image src="/films/clip-agent/clip.jpg" alt="Farbaek's build screen: the agent's steps on the left, the sample bakery site taking shape in the preview on the right." fill sizes="(min-width: 1024px) 46rem, 92vw" className="object-cover object-top" />
    </Frame>
  );
}
