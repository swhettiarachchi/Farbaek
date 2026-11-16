"use client";

/**
 * The homepage's message box (stage 201, ADR 0216): the first thing a visitor can do is ask Farbaek AI something. The question
 * waits in this browser while they sign in (never in the address), then appears in Chat's message box, ready to send. Quick
 * starts below fill it, or open the studio or the build box.
 */
import { ArrowUpIcon, FilmSlateIcon, HammerIcon, ImageSquareIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { HOME_QUESTION_KEY } from "@/core/chat/protocol";

const STARTS = ["Summarise a long PDF in five points", "Write a kind reminder to a late client", "Explain this error in my code", "Plan a week of healthy dinners"];

const MAKE = [
  { href: "/sign-in?next=/app/images", label: "Make a picture", icon: ImageSquareIcon },
  { href: "/sign-in?next=/app/video", label: "Make a video", icon: FilmSlateIcon },
  { href: "/sign-in?next=/app/new", label: "Build a website", icon: HammerIcon },
];

export function HomeAsk() {
  const router = useRouter();
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  const ask = () => {
    const q = text.trim();
    if (!q) {
      box.current?.focus();
      return;
    }
    try {
      window.localStorage.setItem(HOME_QUESTION_KEY, q.slice(0, 8_000));
    } catch {
      // Storage refused: Chat opens with an empty box instead.
    }
    router.push(`/sign-in?next=${encodeURIComponent("/app/chat?ask=1")}`);
  };

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="rounded-[1.75rem] border border-line bg-surface p-2 text-left shadow-e3 transition-shadow duration-200 focus-within:ring-2 focus-within:ring-accent/40"
      >
        <label htmlFor="home-ask" className="sr-only">
          Ask Farbaek AI
        </label>
        <textarea
          id="home-ask"
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
          className="block max-h-40 min-h-16 w-full resize-none bg-transparent px-4 py-3 text-base leading-relaxed text-ink outline-none placeholder:text-ink-3 lg:text-lg"
        />
        <div className="flex items-center justify-between gap-3 pl-4 pr-1 pb-1">
          <p className="text-sm text-ink-3">Free to start. Sign in, and your question is waiting.</p>
          <button type="submit" aria-label="Ask" className="tap inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-e1 transition-[transform,background-color] duration-200 hover:bg-primary-hover active:scale-95">
            <ArrowUpIcon size={20} weight="bold" aria-hidden />
          </button>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {STARTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setText(s);
              box.current?.focus();
            }}
            className="inline-flex min-h-10 items-center rounded-full border border-line bg-surface/80 px-4 text-sm text-ink-2 transition-colors duration-200 hover:border-line-strong hover:text-ink pointer-coarse:min-h-11"
          >
            {s}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-2 gap-y-1">
        {MAKE.map(({ href, label, icon: MakeIcon }) => (
          <Link key={href} href={href} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-2 hover:text-ink">
            <MakeIcon size={16} weight="bold" aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
