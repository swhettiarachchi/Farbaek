import { DownloadSimpleIcon, ShieldWarningIcon, WindowsLogoIcon } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import { AGENT_DOWNLOAD, agentDownloadUrl } from "@/config/agent-download";

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Getting the desktop agent (ADR 0077): the installer on Farbaek's own
 * server, named exactly (version, size, SHA-256), with plain steps for the
 * warning Windows shows while it isn't code-signed.
 */
export function AgentDownload() {
  const d = AGENT_DOWNLOAD;
  return (
    <section aria-labelledby="download-heading" className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
      <div className="grid gap-6 rounded-md bg-surface p-5 shadow-e1 sm:p-7">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <h2 id="download-heading" className="text-xl font-medium tracking-[-0.02em]">
              Get Farbaek Agent
            </h2>
            <p className="mt-1 flex items-start gap-2 text-sm text-ink-2">
              <WindowsLogoIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              <span>
                For Windows 10 and 11, 64-bit. Version {d.version}, {mb(d.bytes)}.
              </span>
            </p>
          </div>
          <a
            href={agentDownloadUrl}
            download
            className="group inline-flex h-12 items-center justify-between gap-3 justify-self-start rounded-full bg-primary pl-5 pr-1.5 text-[15px] font-medium text-on-primary shadow-e1 transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/90 active:scale-[0.98]"
          >
            Download for Windows
            <span className="flex size-9 items-center justify-center rounded-full bg-on-primary/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-y-0.5">
              <DownloadSimpleIcon size={17} weight="bold" aria-hidden />
            </span>
          </a>
        </div>

        <div className="grid gap-4 border-t border-line pt-5">
          <div className="grid gap-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldWarningIcon size={18} weight="bold" className="text-approval" aria-hidden /> Opening it the first time
            </p>
            <p className="max-w-[68ch] text-sm leading-relaxed text-ink-2">
              The installer isn&apos;t code-signed yet, so Windows shows a blue &quot;Windows protected your PC&quot; screen with only Don&apos;t run on it. That&apos;s expected, and it asks only once.
            </p>
          </div>
          <ol className="grid gap-3 lg:grid-cols-3">
            <li className="grid min-w-0 content-start gap-2 rounded-md border border-line p-4">
              <Step n={1}>Check it&apos;s the real file</Step>
              <p className="text-xs leading-relaxed text-ink-3">In PowerShell, in your Downloads folder, run this. The hash it prints must match this one; capital letters don&apos;t matter.</p>
              <code className="block break-all rounded-sm border border-line bg-surface-sunken px-3 py-2 font-mono text-[12px] text-ink-2">Get-FileHash {d.file}</code>
              <p className="break-all rounded-sm border border-line bg-surface-sunken px-3 py-2 font-mono text-[12px] leading-relaxed text-ink">{d.sha256}</p>
            </li>
            <li className="grid min-w-0 content-start gap-2 rounded-md border border-line p-4">
              <Step n={2}>Open it, then choose More info</Step>
              <p className="text-xs leading-relaxed text-ink-3">It&apos;s the underlined link under the warning.</p>
              <ScreenSketch highlight="more" />
            </li>
            <li className="grid min-w-0 content-start gap-2 rounded-md border border-line p-4">
              <Step n={3}>Choose Run anyway</Step>
              <p className="text-xs leading-relaxed text-ink-3">It appears beside Don&apos;t run, under the file&apos;s name and &quot;Unknown publisher&quot;. Then install as usual.</p>
              <ScreenSketch highlight="run" />
            </li>
          </ol>
        </div>

        <p className="text-xs leading-relaxed text-ink-3">
          Mac and Linux versions aren&apos;t available yet: each needs its own build machine, and the Mac version also needs an Apple Developer ID.
        </p>
      </div>
    </section>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 text-sm font-medium text-ink">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent" aria-hidden>
        {n}
      </span>
      {children}
    </p>
  );
}

/** A sketch of the SmartScreen screen, not a copy of it: where to click, marked with the accent. Words for it are in the step. */
function ScreenSketch({ highlight }: { highlight: "more" | "run" }) {
  const mark = "rounded-[6px] ring-2 ring-accent ring-offset-2 ring-offset-surface-sunken";
  return (
    <div aria-hidden className="grid gap-2 rounded-sm border border-line bg-surface-sunken p-3 text-[12px] leading-snug text-ink-2">
      <span className="text-[13px] font-medium text-ink">Windows protected your PC</span>
      {highlight === "more" ? (
        <span>
          Microsoft Defender SmartScreen prevented an unrecognized app from starting.{" "}
          <span className={`px-0.5 text-accent underline ${mark}`}>More info</span>
        </span>
      ) : (
        <span className="grid gap-0.5 font-mono text-[12px] text-ink-3">
          <span>App: Farbaek-Agent-Setup….exe</span>
          <span>Publisher: Unknown publisher</span>
        </span>
      )}
      <span className="flex justify-end gap-2 pt-1">
        {highlight === "run" ? <span className={`border border-line-strong bg-surface px-2.5 py-1 text-ink ${mark}`}>Run anyway</span> : null}
        <span className="rounded-[6px] border border-line-strong bg-surface px-2.5 py-1 text-ink">Don&apos;t run</span>
      </span>
    </div>
  );
}
