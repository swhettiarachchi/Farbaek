"use client";

/**
 * Home's first thing (stage 212, ADR 0228): one box that asks or builds. The study of ChatGPT, Claude and the others
 * found the same first screen in all of them: a box to type in. Farbaek had two doors, a build box on Home and Chat
 * somewhere else, so Home now starts with one box and a switch:
 *
 * - **Ask** takes the words to Chat, where they wait in its box, ready to send. They travel in this browser's storage,
 *   never in the address, exactly as a question typed on the public homepage does.
 * - **Build** is the build box Home always had, passed in whole from the server.
 *
 * The switch remembers the person's last choice in this browser. Ask leads, since most first questions are questions;
 * for a workspace that hasn't built anything yet, Home asks for Build to lead (`lead`), since its first step is a build.
 */
import { ArrowUpIcon, ChatCircleTextIcon, HammerIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { HOME_QUESTION_KEY } from "@/core/chat/protocol";

type Start = "ask" | "build";
const START_KEY = "farbaek.home-start";
const START_EVENT = "farbaek-home-start";
/** Set only when the browser refused to remember, so the switch still works for this visit. */
let thisVisit: Start | null = null;

/** The person's own last choice, or null when they never chose. */
function readStart(): Start | null {
  if (thisVisit) return thisVisit;
  try {
    const saved = window.localStorage.getItem(START_KEY);
    return saved === "build" || saved === "ask" ? saved : null;
  } catch {
    return null;
  }
}

function writeStart(start: Start) {
  try {
    window.localStorage.setItem(START_KEY, start);
  } catch {
    thisVisit = start;
  }
  window.dispatchEvent(new Event(START_EVENT));
}

function subscribeStart(onChange: () => void) {
  window.addEventListener(START_EVENT, onChange);
  return () => window.removeEventListener(START_EVENT, onChange);
}

const CHOICES: [Start, typeof HammerIcon, string][] = [
  ["ask", ChatCircleTextIcon, "Ask"],
  ["build", HammerIcon, "Build"],
];

export function StartBox({ build, lead = "ask" }: { build: ReactNode; /** Which side shows until the person chooses. */ lead?: Start }) {
  const router = useRouter();
  const chosen = useSyncExternalStore(subscribeStart, readStart, () => null);
  const start = chosen ?? lead;
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  const ask = () => {
    const question = text.trim();
    if (!question) {
      box.current?.focus();
      return;
    }
    try {
      window.localStorage.setItem(HOME_QUESTION_KEY, question.slice(0, 8_000));
    } catch {
      // Storage refused: Chat opens with an empty box instead.
    }
    router.push("/app/chat?ask=1");
  };

  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label="What to start" className="mx-auto inline-grid w-fit grid-cols-2 rounded-full bg-canvas-2 p-0.5 ring-1 ring-line">
        {CHOICES.map(([value, Glyph, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={start === value}
            onClick={() => writeStart(value)}
            className="tap inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm text-ink-2 aria-checked:bg-surface aria-checked:font-medium aria-checked:text-ink aria-checked:shadow-e1"
          >
            <Glyph size={16} weight={start === value ? "fill" : "bold"} aria-hidden className={start === value ? (value === "ask" ? "text-accent" : "text-spark-leaf") : ""} /> {label}
          </button>
        ))}
      </div>

      {start === "ask" ? (
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
            className="flex items-end gap-2 rounded-[1.5rem] border border-line bg-surface p-2 pl-5 shadow-e1 transition-[box-shadow,border-color] duration-200 focus-within:border-line-strong focus-within:shadow-e2"
          >
            <label htmlFor={id} className="sr-only">
              Ask Farbaek AI
            </label>
            <textarea
              id={id}
              ref={box}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask();
                }
              }}
              rows={2}
              maxLength={8_000}
              placeholder="Ask Farbaek AI anything"
              className="block max-h-40 min-h-[4.5rem] w-full flex-1 resize-none bg-transparent py-2.5 text-base leading-relaxed text-ink outline-none [field-sizing:content] placeholder:text-ink-3"
            />
            <button type="submit" aria-label="Ask in Chat" className="tap inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-[transform,background-color] duration-200 hover:bg-primary-hover active:scale-95">
              <ArrowUpIcon size={16} weight="bold" aria-hidden />
            </button>
          </form>
          <p className="mt-2 px-1 text-center text-label text-ink-3">Your question opens in Chat, ready to send.</p>
        </div>
      ) : (
        build
      )}
    </div>
  );
}
