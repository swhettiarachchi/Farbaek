"use client";

import { CheckIcon, ClockUserIcon, XIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion, type Variants } from "motion/react";

export type ThreadStatus = "verified" | "approval" | "unverified" | "failed";

export interface ThreadStage {
  key: string;
  label: string;
  body: string;
  status: ThreadStatus;
  /** Overrides the default status line, e.g. "not required". */
  statusText?: string;
}

/** "in progress" becomes "In progress": status words read as sentences. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const STATUS_TEXT: Record<ThreadStatus, string> = {
  verified: "Verified",
  approval: "Awaiting approval",
  unverified: "Not verified yet",
  failed: "Failed",
};

const SEGMENT: Record<ThreadStatus, string> = {
  verified: "border-solid border-verified",
  approval: "border-solid border-approval",
  unverified: "border-dashed border-unverified",
  failed: "border-solid border-failed",
};

function Node({ status }: { status: ThreadStatus }) {
  const common = "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full";
  switch (status) {
    case "verified":
      return (
        <span className={`${common} bg-verified text-on-accent`}>
          <CheckIcon size={14} weight="bold" aria-hidden />
        </span>
      );
    case "approval":
      return (
        // An open ring with a clock: the step waits for a person, and the words beside it say who (ADR 0183).
        <span className={`${common} border-[1.5px] border-approval bg-canvas text-approval`}>
          <ClockUserIcon size={14} weight="bold" aria-hidden />
        </span>
      );
    case "failed":
      return (
        <span className={`${common} bg-failed text-canvas`}>
          <XIcon size={14} weight="bold" aria-hidden />
        </span>
      );
    case "unverified":
      return <span className={`${common} border-[1.5px] border-dashed border-unverified bg-canvas`} aria-hidden />;
  }
}

const list: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.14 } } };
const item: Variants = { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: 0.22 } } };
const lineX: Variants = { hidden: { scaleX: 0 }, shown: { scaleX: 1, transition: { duration: 0.36, ease: [0.2, 0, 0, 1] } } };
const lineY: Variants = { hidden: { scaleY: 0 }, shown: { scaleY: 1, transition: { duration: 0.36, ease: [0.2, 0, 0, 1] } } };

/**
 * The Proof Thread. Segment style follows the status of the stage it leads to:
 * solid blue when verified or awaiting approval, dashed while
 * unverified, red when failed. Horizontal from lg up, vertical below.
 */
export function ProofThread({ stages, label }: { stages: ThreadStage[]; label: string }) {
  const reduce = useReducedMotion();

  return (
    <motion.ol
      aria-label={label}
      className="grid gap-0 lg:grid-cols-6 lg:gap-0"
      variants={list}
      initial={reduce ? false : "hidden"}
      whileInView="shown"
      viewport={{ once: true, amount: 0.3 }}
    >
      {stages.map((stage, i) => {
        const next = stages[i + 1];
        return (
          <motion.li key={stage.key} variants={item} className="grid min-w-0 grid-cols-[28px_1fr] gap-x-4 lg:flex lg:flex-col lg:gap-0">
            {/* Node and connector */}
            <div className="flex flex-col items-center lg:flex-row lg:items-center">
              <Node status={stage.status} />
              {next ? (
                <>
                  <motion.span
                    aria-hidden
                    variants={lineY}
                    className={`my-1 w-0 flex-1 origin-top border-l-[1.5px] lg:hidden ${SEGMENT[next.status]}`}
                  />
                  <motion.span
                    aria-hidden
                    variants={lineX}
                    className={`mx-2 hidden h-0 flex-1 origin-left border-t-[1.5px] lg:block ${SEGMENT[next.status]}`}
                  />
                </>
              ) : null}
            </div>
            <div className="min-w-0 pb-8 lg:pb-0 lg:pr-4 lg:pt-5">
              {/* Side by side when stacked; label over status in the six-column row, so narrow columns never overlap. */}
              <p className="flex flex-wrap items-baseline gap-x-2 lg:flex-col lg:items-start lg:gap-0.5">
                <span className="text-[1.0625rem] font-medium">{stage.label}</span>
                <span className="text-[0.8125rem] text-ink-3">{sentence(stage.statusText ?? STATUS_TEXT[stage.status])}</span>
              </p>
              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">{stage.body}</p>
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}
