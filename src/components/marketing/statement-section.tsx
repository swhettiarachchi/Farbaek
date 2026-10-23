"use client";

import {
  ArrowCounterClockwiseIcon,
  ArrowsLeftRightIcon,
  BracketsCurlyIcon,
  ChatTextIcon,
  FileTextIcon,
  FingerprintIcon,
  FlaskIcon,
  GitDiffIcon,
  RocketLaunchIcon,
  SealCheckIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { Container } from "@/components/ui/container";

const TOOLS: { icon: Icon; label: string }[] = [
  { icon: ChatTextIcon, label: "Intent" },
  { icon: FileTextIcon, label: "Contract" },
  { icon: BracketsCurlyIcon, label: "Code" },
  { icon: GitDiffIcon, label: "Diff review" },
  { icon: FlaskIcon, label: "Tests" },
  { icon: ShieldCheckIcon, label: "Policy" },
  { icon: FingerprintIcon, label: "Approval" },
  { icon: SealCheckIcon, label: "ProofPack" },
  { icon: ArrowsLeftRightIcon, label: "Mesh handoff" },
  { icon: RocketLaunchIcon, label: "Launch" },
  { icon: ArrowCounterClockwiseIcon, label: "Recovery" },
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
        {/* The lifecycle, as an arc of tools. Each chip names its stage. */}
        <ul className="mx-auto flex max-w-[860px] items-end justify-center gap-2 sm:gap-3" aria-label="Lifecycle tools">
          {TOOLS.map(({ icon: ToolIcon, label }, i) => {
            const lift = Math.round((1 - ((i - mid) / mid) ** 2) * 34);
            return (
              <motion.li
                key={label}
                className={i === 0 || i === TOOLS.length - 1 ? "hidden sm:block" : i === 1 || i === TOOLS.length - 2 ? "hidden md:block" : ""}
                initial={reduce ? false : { opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: -lift }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ type: "spring", stiffness: 120, damping: 18, delay: reduce ? 0 : Math.abs(i - mid) * 0.06 }}
                style={reduce ? { transform: `translateY(${-lift}px)` } : undefined}
              >
                <span
                  title={label}
                  className="group flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-e1 transition-[transform,color,box-shadow] duration-200 hover:-translate-y-1 hover:text-accent hover:shadow-e2 sm:size-14"
                >
                  <ToolIcon size={22} aria-hidden />
                  <span className="sr-only">{label}</span>
                </span>
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
