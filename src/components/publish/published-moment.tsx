"use client";

import { ArrowSquareOutIcon, CheckCircleIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { SiteThumb } from "@/components/app/site-thumb";
import { buttonClasses } from "@/components/ui/button";

/**
 * The biggest moment in the product (ADR 0172): someone's site just went on the internet. It shows only as the
 * answer to pressing Publish, so a reload can't replay it. The picture is the real site, and the card rises into
 * place once in CSS 3D. Under reduced motion it's simply there, with the same words and buttons.
 */
export function PublishedMoment({ projectId, address, message }: { projectId: string; address: string; message: string }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const copyAddress = () => {
    const show = (state: "copied" | "failed") => {
      setCopy(state);
      window.setTimeout(() => setCopy("idle"), 2500);
    };
    // Not every browser offers the clipboard. The address is on the card to select by hand.
    const writing = navigator.clipboard?.writeText(address);
    if (!writing) return show("failed");
    writing.then(() => show("copied")).catch(() => show("failed"));
  };
  return (
    <div role="status" className="moment-rise grid gap-4 rounded-md border border-verified/30 bg-surface p-4 shadow-e2 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center sm:p-5">
      <SiteThumb src={`/app/projects/${projectId}/thumbnail`} name="Your site" className="ring-1 ring-line/80" />
      <div className="grid min-w-0 gap-3">
        <div>
          <p className="flex items-center gap-2 text-[1.25rem] font-medium leading-snug tracking-[-0.02em]">
            <CheckCircleIcon size={24} weight="fill" className="moment-pop shrink-0 text-verified" aria-hidden /> Your site is live
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{message}</p>
        </div>
        <p className="break-all font-mono text-[0.8125rem] text-ink-2">{address.replace(/^https?:\/\//, "")}</p>
        <div className="flex flex-wrap gap-2">
          <a href={address} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "sm")}>
            Open your site <ArrowSquareOutIcon size={16} weight="bold" aria-hidden />
          </a>
          <button type="button" onClick={copyAddress} className={buttonClasses("secondary", "sm")}>
            <CopyIcon size={16} aria-hidden /> {copy === "copied" ? "Copied" : copy === "failed" ? "Couldn't copy" : "Copy address"}
          </button>
        </div>
      </div>
    </div>
  );
}
