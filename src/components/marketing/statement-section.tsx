"use client";

import { BracketsCurlyIcon, ChatTextIcon, CheckSquareOffsetIcon, ClipboardTextIcon, CloudArrowUpIcon, ListChecksIcon, SealCheckIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
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

export function StatementSection() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 45%"] });
  const words = STATEMENT.split(" ");
  const mid = (TOOLS.length - 1) / 2;

  return (
    <section aria-labelledby="statement" className="overflow-hidden py-16 lg:py-24">
      <Container>
        {/* The stages, as an arc. Each mark carries its name, so a phone reads it too. */}
        <ul className="mx-auto flex max-w-[860px] items-end justify-center gap-2 sm:gap-4" aria-label="The stages along the way">
          {TOOLS.map(({ icon: ToolIcon, label }, i) => {
            const lift = Math.round((1 - ((i - mid) / mid) ** 2) * 34);
            return (
              <motion.li
                key={label}
                className={`grid justify-items-center gap-2 ${i === 0 || i === TOOLS.length - 1 ? "hidden sm:grid" : ""}`}
                initial={reduce ? false : { opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: -lift }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ type: "spring", stiffness: 120, damping: 18, delay: reduce ? 0 : Math.abs(i - mid) * 0.06 }}
                style={reduce ? { transform: `translateY(${-lift}px)` } : undefined}
              >
                <span className="flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-e1 sm:size-14">
                  <ToolIcon size={20} aria-hidden />
                </span>
                <span className="text-xs text-ink-3">{label}</span>
              </motion.li>
            );
          })}
        </ul>

        <p
          id="statement"
          ref={ref}
          className="mx-auto mt-14 max-w-[24ch] text-balance text-center text-[1.75rem] font-medium leading-[1.2] tracking-[-0.03em] sm:text-[2.6rem] lg:text-[3.1rem]"
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
