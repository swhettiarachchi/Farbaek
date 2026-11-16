"use client";

import { BracketsCurlyIcon, ChatTextIcon, CheckSquareOffsetIcon, ClipboardTextIcon, CloudArrowUpIcon, ListChecksIcon, SealCheckIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Container } from "@/components/ui/container";

// The stages a change goes through, in order, each named under its mark.
const TOOLS: { icon: Icon; label: string }[] = [
  { icon: ChatTextIcon, label: "Your idea" },
  { icon: ClipboardTextIcon, label: "Plan" },
  { icon: BracketsCurlyIcon, label: "Code" },
  { icon: ListChecksIcon, label: "Tests" },
  { icon: CheckSquareOffsetIcon, label: "Approval" },
  { icon: SealCheckIcon, label: "Proof" },
  { icon: CloudArrowUpIcon, label: "Launch" },
];

const STATEMENT =
  "Farbaek is a development platform where every change is planned, checked, approved and proven before it reaches your users.";

function Word({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  const color = useTransform(progress, range, ["var(--ink-3)", "var(--ink)"]);
  return (
    <motion.span style={{ color }} className="statement-word mr-[0.24em] inline-block">
      {children}
    </motion.span>
  );
}

type Rise = "still" | "waiting" | "rising";

/**
 * The stages, as an arc. Each mark carries its name, so a phone reads it too.
 * The rise is CSS (stage-rise in globals.css), so the server and the client
 * render the same markup: both start "still", the finished arc. After
 * hydration a list that's below the screen waits out of sight and rises once
 * it's on screen; one that's already on screen stays as it was painted.
 * Under reduced motion it's always still.
 */
function StageArc() {
  const list = useRef<HTMLUListElement>(null);
  const [rise, setRise] = useState<Rise>("still");
  const mid = (TOOLS.length - 1) / 2;

  useEffect(() => {
    const el = list.current;
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let first = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (first) {
          first = false;
          if (entry.isIntersecting) io.disconnect();
          else setRise("waiting");
        } else if (entry.intersectionRatio >= 0.6) {
          io.disconnect();
          setRise("rising");
        }
      },
      { threshold: [0, 0.6] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <ul ref={list} data-rise={rise} className="mx-auto flex max-w-[860px] items-end justify-center gap-2 sm:gap-4" aria-label="The stages along the way">
      {TOOLS.map(({ icon: ToolIcon, label }, i) => {
        const lift = Math.round((1 - ((i - mid) / mid) ** 2) * 34);
        // The middle mark rises first, then outwards.
        const arc = { "--lift": `${-lift}px`, "--rise-delay": `${Math.abs(i - mid) * 60}ms` } as CSSProperties;
        return (
          <li key={label} className={`stage-mark grid justify-items-center gap-2 ${i === 0 || i === TOOLS.length - 1 ? "hidden sm:grid" : ""}`} style={arc}>
            <span className="flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-e1 sm:size-14">
              <ToolIcon size={20} aria-hidden />
            </span>
            <span className="text-xs text-ink-3">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function StatementSection() {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 45%"] });
  const words = STATEMENT.split(" ");

  return (
    <section aria-labelledby="statement" className="overflow-hidden py-16 lg:py-24">
      <Container>
        <StageArc />

        <p
          id="statement"
          ref={ref}
          className="mx-auto mt-14 max-w-[24ch] text-balance text-center text-2xl font-medium leading-[1.2] tracking-[-0.03em] sm:text-[2.6rem] lg:text-[3.1rem]"
        >
          {/* The same words on the server and the client; under reduced motion CSS holds them at full ink. */}
          {words.map((w, i) => (
            <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>
              {w}
            </Word>
          ))}
        </p>
      </Container>
    </section>
  );
}
