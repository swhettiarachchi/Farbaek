import { CheckIcon, PlayIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { space, type Space } from "@/components/site/spaces";

/**
 * The cards floating beside the hero on wide screens (stage 201, ADR 0217): one for each of Farbaek AI's main spaces, in its
 * colour, tilted a few degrees like things laid on a desk, after the playful props around ChatGPT's headline. Each is a real
 * link to its space. They drift a little against the pointer (the hero sets --lean-x and --lean-y), straighten when hovered,
 * and are hidden below 1280px, where the chips under the message box do the same job.
 */
export const SPACE_TONE: Record<Space["id"], string> = {
  chat: "var(--color-accent)",
  images: "var(--color-spark-rose)",
  video: "var(--color-spark-aqua)",
  build: "var(--color-spark-leaf)",
  survey: "var(--color-ink-2)",
  proof: "var(--color-ink-2)",
};

function Prop({ id, className, tilt, depth, children }: { id: Space["id"]; className: string; tilt: number; depth: number; children: ReactNode }) {
  const s = space(id);
  const SpaceIcon = s.icon;
  const style = {
    "--tone": SPACE_TONE[id],
    "--tilt": `${tilt}deg`,
    translate: `calc(var(--lean-x, 0) * ${-depth}px) calc(var(--lean-y, 0) * ${-depth}px)`,
  } as CSSProperties;
  return (
    <Link
      href={s.page}
      style={style}
      className={`hero-prop group absolute hidden w-[9.75rem] rotate-[var(--tilt)] flex-col gap-2.5 rounded-[1.125rem] border border-line bg-surface p-3 text-left shadow-e2 transition-[rotate,translate,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:z-10 hover:rotate-0 hover:shadow-e3 xl:flex ${className}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--tone)" }}>
        <span className="flex size-6 items-center justify-center rounded-full" style={{ background: "color-mix(in oklab, var(--tone) 12%, var(--color-surface))" }}>
          <SpaceIcon size={14} weight="fill" aria-hidden />
        </span>
        {s.name}
      </span>
      {children}
    </Link>
  );
}

const bar = (w: string, tone = "var(--color-line-strong)") => <span aria-hidden className="block h-1.5 rounded-full" style={{ width: w, background: tone }} />;

export function HeroProps() {
  return (
    <>
      <Prop id="chat" tilt={-6} depth={14} className="left-[calc(50%-38.5rem)] top-[7.5rem]">
        <span className="ml-auto rounded-[0.75rem] rounded-br-[0.25rem] bg-canvas-2 px-2.5 py-1.5 text-xs leading-snug text-ink">Explain it simply</span>
        <span aria-hidden className="grid gap-1.5">
          {bar("92%")}
          {bar("74%")}
          {bar("48%", "color-mix(in oklab, var(--tone) 55%, var(--color-surface))")}
        </span>
      </Prop>

      <Prop id="images" tilt={5} depth={22} className="left-[calc(50%-34rem)] top-[21.5rem]">
        <span aria-hidden className="relative block aspect-[4/3] overflow-hidden rounded-[0.625rem]" style={{ background: "linear-gradient(180deg, color-mix(in oklab, var(--tone) 16%, var(--color-surface)) 0%, color-mix(in oklab, var(--tone) 6%, var(--color-surface)) 62%, color-mix(in oklab, var(--tone) 30%, var(--color-surface)) 62.5%, color-mix(in oklab, var(--tone) 22%, var(--color-surface)) 100%)" }}>
          {/* A still life: a vase on a table, in the space's colour. */}
          <span className="absolute bottom-[34%] left-1/2 h-[38%] w-[20%] -translate-x-1/2 rounded-b-[45%] rounded-t-[30%]" style={{ background: "linear-gradient(100deg, color-mix(in oklab, var(--tone) 80%, var(--color-ink)), color-mix(in oklab, var(--tone) 55%, var(--color-surface)) 45%, var(--tone))" }} />
          <span className="absolute bottom-[70%] left-[53%] h-[16%] w-[3%] -rotate-12 rounded-full" style={{ background: "var(--color-spark-leaf)" }} />
          <span className="absolute bottom-[80%] left-[52%] size-[11%] rounded-full" style={{ background: "var(--color-spark-ember)" }} />
        </span>
        <span className="text-xs leading-snug text-ink-2">Product shot, soft light</span>
      </Prop>

      <Prop id="video" tilt={6} depth={18} className="right-[calc(50%-38.5rem)] top-[8.5rem]">
        <span aria-hidden className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[0.625rem] bg-media">
          <span className="absolute inset-0" style={{ background: "radial-gradient(70% 90% at 30% 80%, color-mix(in oklab, var(--tone) 70%, transparent), transparent 70%)" }} />
          <span className="relative flex size-7 items-center justify-center rounded-full bg-surface/90 text-ink">
            <PlayIcon size={14} weight="fill" />
          </span>
        </span>
        <span aria-hidden className="block h-1 rounded-full bg-line">
          <span className="block h-1 w-2/5 rounded-full" style={{ background: "var(--tone)" }} />
        </span>
      </Prop>

      <Prop id="build" tilt={-5} depth={24} className="right-[calc(50%-34rem)] top-[22rem]">
        <span aria-hidden className="grid gap-1.5 rounded-[0.625rem] bg-canvas-2 p-2">
          {bar("70%")}
          {bar("88%", "color-mix(in oklab, var(--tone) 45%, var(--color-surface))")}
          {bar("56%", "color-mix(in oklab, var(--tone) 45%, var(--color-surface))")}
          {bar("40%")}
        </span>
        <span className="flex items-center gap-1.5 text-xs leading-snug text-ink-2">
          <CheckIcon size={14} weight="bold" aria-hidden style={{ color: "var(--tone)" }} />
          Checked, waiting for you
        </span>
      </Prop>
    </>
  );
}
