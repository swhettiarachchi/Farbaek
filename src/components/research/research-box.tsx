"use client";

import { ArrowUpIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { HOME_QUESTION_KEY } from "@/core/chat/protocol";

/**
 * The Research page's box (stage 288, ADR 0296). It hands the question to Chat, where research is done: the question
 * waits in Chat's box for the person to send, and sent as it is, that message asks for the live web even where the
 * person's web switch is off. The text is kept in this browser only, never in the address, as Home's own box does.
 */
export function ResearchBox() {
  const router = useRouter();
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  const hand = () => {
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
    router.push("/app/chat?ask=1&research=1");
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          hand();
        }}
        className="flex items-end gap-2 rounded-[1.5rem] border border-line bg-surface p-2 pl-5 shadow-e1 transition-[box-shadow,border-color] duration-200 focus-within:border-line-strong focus-within:shadow-e2"
      >
        <label htmlFor={id} className="sr-only">
          What to research
        </label>
        <textarea
          id={id}
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              hand();
            }
          }}
          rows={2}
          maxLength={8_000}
          placeholder="What do you want to find out?"
          className="block max-h-40 min-h-[4.5rem] w-full flex-1 resize-none bg-transparent py-2.5 text-base leading-relaxed text-ink outline-none [field-sizing:content] placeholder:text-ink-3"
        />
        <button type="submit" aria-label="Research it in Chat" className="tap inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-[transform,background-color] duration-200 hover:bg-primary-hover active:scale-95">
          <ArrowUpIcon size={16} weight="bold" aria-hidden />
        </button>
      </form>
      <p className="mt-2 px-1 text-center text-label text-ink-3">Your question opens in Chat, ready to send. It checks the live web and lists its sources.</p>
    </div>
  );
}
