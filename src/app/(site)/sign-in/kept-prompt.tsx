"use client";

import { QuotesIcon } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { PROMPT_STORAGE_KEY } from "@/components/build/prompt-composer";

function read(): string {
  try {
    return window.localStorage.getItem(PROMPT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

const noSubscribe = () => () => {};

/**
 * When the visitor described a build before signing in, the sentence waits
 * in this browser (never in a URL). Saying so here keeps the thread: it's
 * picked up by the build box after sign-in.
 */
export function KeptPrompt() {
  const prompt = useSyncExternalStore(noSubscribe, read, () => "");
  if (!prompt.trim()) return null;
  return (
    <div className="mb-6 rounded-sm border border-line bg-surface-raised/70 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
        <QuotesIcon size={14} weight="bold" className="text-ink-3" aria-hidden /> Your build starts with
      </p>
      <p className="mt-1 line-clamp-3 text-body leading-relaxed text-ink">&ldquo;{prompt}&rdquo;</p>
      <p className="mt-1.5 text-xs text-ink-3">It&apos;s kept in this browser and waits in the build box after you sign in.</p>
    </div>
  );
}
