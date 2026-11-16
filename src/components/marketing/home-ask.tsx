"use client";

/**
 * The homepage's message box (stage 201, ADR 0216): the first thing a visitor can do is ask Farbaek AI something. The question
 * waits in this browser while they sign in (never in the address), then appears in Chat's box, ready to send. Quiet on
 * purpose: a hairline, the lightest shadow and one row of starters, measured against ChatGPT's and Claude's boxes.
 */
import { ArrowUpIcon, ChatCircleTextIcon, FilmSlateIcon, HammerIcon, ImageSquareIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { HOME_QUESTION_KEY } from "@/core/chat/protocol";

const START = "Summarise a long PDF in five points";

/** The other spaces, one press away, each in its colour (ADR 0217). */
const MAKE = [
  { href: "/sign-in?next=/app/images", label: "Make a picture", icon: ImageSquareIcon, tone: "text-spark-rose" },
  { href: "/sign-in?next=/app/video", label: "Make a video", icon: FilmSlateIcon, tone: "text-spark-aqua" },
  { href: "/sign-in?next=/app/new", label: "Build a website", icon: HammerIcon, tone: "text-spark-leaf" },
];

const CHIP = "inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-3 text-sm text-ink-2 transition-[border-color,color,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px hover:border-line-strong hover:text-ink pointer-coarse:min-h-11";

export function HomeAsk({ id = "home-ask", starters = true }: { id?: string; starters?: boolean }) {
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
        className="flex items-end gap-2 rounded-[1.5rem] border border-line bg-surface p-2 pl-5 text-left shadow-e1 transition-[box-shadow,border-color] duration-200 focus-within:border-line-strong focus-within:shadow-e2"
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
          rows={1}
          maxLength={8_000}
          placeholder="Ask Farbaek AI anything"
          className="block max-h-40 min-h-11 w-full flex-1 resize-none bg-transparent py-2.5 text-base leading-relaxed text-ink outline-none [field-sizing:content] placeholder:text-ink-3"
        />
        <button type="submit" aria-label="Ask" className="tap inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-[transform,background-color] duration-200 hover:bg-primary-hover active:scale-95">
          <ArrowUpIcon size={16} weight="bold" aria-hidden />
        </button>
      </form>
      {starters ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:flex sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={() => {
              setText(START);
              box.current?.focus();
            }}
            className={CHIP}
          >
            <ChatCircleTextIcon size={16} weight="fill" aria-hidden className="text-accent" />
            Summarise a PDF
          </button>
          {MAKE.map(({ href, label, icon: MakeIcon, tone }) => (
            <Link key={href} href={href} className={CHIP}>
              <MakeIcon size={16} weight="fill" aria-hidden className={tone} />
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
