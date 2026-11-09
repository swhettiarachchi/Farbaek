"use client";

import { CheckCircleIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";

/** A shell command to run, with a button that copies it exactly. */
export function CommandBlock({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0 overflow-hidden rounded-sm border border-line bg-surface-sunken">
      <div className="flex items-center justify-between gap-3 border-b border-line pl-4">
        <span className="text-xs text-ink-3">Shell</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(command).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1_500);
            });
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium text-ink-2 hover:text-ink"
          aria-label={copied ? `Copied: ${label}` : `Copy: ${label}`}
        >
          {copied ? <CheckCircleIcon size={16} weight="fill" className="text-verified" aria-hidden /> : <CopyIcon size={16} weight="bold" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Never wrapped: a break at a hyphen would read as two words. Long lines scroll inside the block. */}
      <pre className="overflow-x-auto whitespace-pre px-4 py-3.5 font-mono text-[0.8125rem] leading-relaxed text-ink">
        <code>{command}</code>
      </pre>
    </div>
  );
}
