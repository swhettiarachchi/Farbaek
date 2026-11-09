import { AppleLogoIcon, ArrowUpRightIcon, CaretRightIcon, DesktopIcon, DownloadSimpleIcon, LinuxLogoIcon, SealCheckIcon, ShieldWarningIcon, WindowsLogoIcon } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import { AGENT_DOWNLOAD, AGENT_LINUX, AGENT_MAC, AGENT_STORE_URL, agentDownloadUrl } from "@/config/agent-download";

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Getting the desktop agent (ADR 0077, ADR 0098). Windows from the Microsoft
 * Store once it's listed there (Microsoft signs it, so there's no warning),
 * with the installer on Farbaek's own server as the other way, named exactly
 * (version, size, SHA-256) with plain steps for the warning it shows. Mac
 * once a build signed with the Developer ID and notarized by Apple is up.
 * Checking a file by its fingerprint is there for whoever wants it, folded
 * away, so it's never the first thing a newcomer is asked to do (ADR 0174).
 */
export function AgentDownload() {
  const d = AGENT_DOWNLOAD;
  const storeUrl = AGENT_STORE_URL;
  const fromStore = storeUrl !== null;
  return (
    <section aria-labelledby="download-heading" className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
      <div className="grid gap-6 rounded-md bg-surface p-4 shadow-e1 min-[400px]:p-5 sm:p-7">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <h2 id="download-heading" className="text-xl font-medium tracking-[-0.02em]">
              Get Farbaek Agent
            </h2>
            <p className="mt-2 hidden items-start gap-2 rounded-sm bg-surface-raised/60 px-3 py-2 text-sm text-ink-2 pointer-coarse:flex">
              <DesktopIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              <span>This runs on a computer, so open this page on one to download it.</span>
            </p>
            <p className="mt-1 flex items-start gap-2 text-sm text-ink-2">
              <WindowsLogoIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              <span>
                For Windows 10 and 11, 64-bit. Version {d.version}, {mb(d.bytes)}.
              </span>
            </p>
          </div>
          {storeUrl !== null ? (
            <div className="grid justify-items-start gap-2">
              <PrimaryLink href={storeUrl} icon={<ArrowUpRightIcon size={17} weight="bold" aria-hidden />}>
                Get it from the Microsoft Store
              </PrimaryLink>
              <a href={agentDownloadUrl} download className="inline-flex min-h-11 items-center px-1 text-sm text-ink-2 underline underline-offset-4 hover:text-ink">
                Or download the installer ({mb(d.bytes)})
              </a>
            </div>
          ) : (
            <PrimaryLink href={agentDownloadUrl} download icon={<DownloadSimpleIcon size={17} weight="bold" aria-hidden />}>
              Download for Windows
            </PrimaryLink>
          )}
        </div>
        {fromStore ? (
          <p className="-mt-2 flex items-start gap-2 text-sm text-ink-2">
            <SealCheckIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            <span>From the Microsoft Store it installs with no warning, and keeps itself up to date.</span>
          </p>
        ) : null}

        <Fold open={!fromStore}>
        <div className="grid gap-4 border-t border-line pt-5">
          <div className="grid gap-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldWarningIcon size={18} weight="bold" className="text-approval" aria-hidden /> Opening it the first time
            </p>
            <p className="max-w-[68ch] text-sm leading-relaxed text-ink-2">
              The installer isn&apos;t code-signed yet, so Windows shows a blue &quot;Windows protected your PC&quot; screen with only Don&apos;t run on it. That&apos;s expected, and it asks only once.
            </p>
          </div>
          <CheckTheFile how="In PowerShell, in your Downloads folder, run this. What it prints must match the line under it; capital letters don't matter." command={`Get-FileHash ${d.file}`} fingerprint={d.sha256} />
          <ol className="grid gap-3 lg:grid-cols-2">
            <li className="grid min-w-0 content-start gap-2 rounded-md border border-line p-4">
              <Step>Open it, then choose More info</Step>
              <p className="text-xs leading-relaxed text-ink-3">It&apos;s the underlined link under the warning.</p>
              <ScreenSketch highlight="more" />
            </li>
            <li className="grid min-w-0 content-start gap-2 rounded-md border border-line p-4">
              <Step>Then choose Run anyway</Step>
              <p className="text-xs leading-relaxed text-ink-3">It appears beside Don&apos;t run, under the file&apos;s name and &quot;Unknown publisher&quot;. Then install as usual.</p>
              <ScreenSketch highlight="run" />
            </li>
          </ol>
        </div>
        </Fold>

        {AGENT_MAC ? (
          <div className="grid gap-4 border-t border-line pt-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="grid min-w-0 gap-2">
              <p className="flex items-start gap-2 text-sm text-ink-2">
                <AppleLogoIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                <span>
                  For macOS 12 or later, Apple silicon and Intel. Version {AGENT_MAC.version}, {mb(AGENT_MAC.bytes)}. Notarized by Apple, so it opens without a warning.
                </span>
              </p>
              <CheckTheFile how="Run this in Terminal, in your Downloads folder. What it prints must match the line under it." command={`shasum -a 256 ${AGENT_MAC.file}`} fingerprint={AGENT_MAC.sha256} />
            </div>
            <PrimaryLink href={`/downloads/${AGENT_MAC.file}`} download icon={<DownloadSimpleIcon size={17} weight="bold" aria-hidden />}>
              Download for Mac
            </PrimaryLink>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-ink-3">The Mac version is on its way, signed and notarized by Apple so it opens without a warning.</p>
        )}

        {AGENT_LINUX ? (
          <div className="grid gap-4 border-t border-line pt-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="grid min-w-0 gap-2">
              <p className="flex items-start gap-2 text-sm text-ink-2">
                <LinuxLogoIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                <span>
                  For 64-bit Linux with a desktop keyring (GNOME Keyring or KWallet), which keeps the agent&apos;s sign-in safe. Version {AGENT_LINUX.version}, {mb(AGENT_LINUX.bytes)}. An
                  AppImage: allow it to run as a program, then open it.
                </span>
              </p>
              <CheckTheFile how="Run this in a terminal, in your Downloads folder. What it prints must match the line under it." command={`sha256sum ${AGENT_LINUX.file}`} fingerprint={AGENT_LINUX.sha256} />
            </div>
            <PrimaryLink href={`/downloads/${AGENT_LINUX.file}`} download icon={<DownloadSimpleIcon size={17} weight="bold" aria-hidden />}>
              Download for Linux
            </PrimaryLink>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-ink-3">The Linux version is on its way, as an AppImage for 64-bit Linux.</p>
        )}
      </div>
    </section>
  );
}

function PrimaryLink({ href, download, icon, children }: { href: string; download?: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <a
      href={href}
      download={download}
      {...(download ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      // It grows rather than spills when the label is long or the phone's text is large.
      className="group inline-flex min-h-12 max-w-full items-center justify-between gap-2 justify-self-start rounded-full bg-primary py-1.5 pl-5 pr-1.5 text-left text-[0.9375rem] font-medium leading-snug text-on-primary shadow-e1 transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/90 active:scale-[0.98] sm:gap-3"
    >
      <span className="min-w-0">{children}</span>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-on-primary/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-y-0.5">{icon}</span>
    </a>
  );
}

/** The direct installer's steps: shown while it's the only way, folded away once the Store is. */
function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  if (open) return <>{children}</>;
  return (
    <details>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-ink-2">Installing the direct download instead</summary>
      {children}
    </details>
  );
}

/** For whoever wants to be sure of the download. Nobody has to do this to install it. */
function CheckTheFile({ how, command, fingerprint }: { how: string; command: string; fingerprint: string }) {
  return (
    <details className="group min-w-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <CaretRightIcon size={14} weight="bold" aria-hidden className="shrink-0 text-ink-3 group-open:rotate-90" /> Before you open it, check it&apos;s the real file (optional)
      </summary>
      <div className="grid gap-2 pb-1">
        <p className="text-xs leading-relaxed text-ink-3">{how}</p>
        <code className="block break-all rounded-sm border border-line bg-surface-sunken px-3 py-2 font-mono text-[0.75rem] text-ink-2">{command}</code>
        <p className="break-all rounded-sm border border-line bg-surface-sunken px-3 py-2 font-mono text-[0.75rem] leading-relaxed text-ink">{fingerprint}</p>
      </div>
    </details>
  );
}

/** A step's instruction in words; the list keeps the order, so there's no number badge. */
function Step({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium text-ink">{children}</p>;
}

/** A sketch of the SmartScreen screen, not a copy of it: where to click, marked with the accent. Words for it are in the step. */
function ScreenSketch({ highlight }: { highlight: "more" | "run" }) {
  const mark = "rounded-[6px] ring-2 ring-accent ring-offset-2 ring-offset-surface-sunken";
  return (
    <div aria-hidden className="grid gap-2 rounded-sm border border-line bg-surface-sunken p-3 text-[0.75rem] leading-snug text-ink-2">
      <span className="text-[0.8125rem] font-medium text-ink">Windows protected your PC</span>
      {highlight === "more" ? (
        <span>
          Microsoft Defender SmartScreen prevented an unrecognized app from starting.{" "}
          <span className={`px-0.5 text-accent underline ${mark}`}>More info</span>
        </span>
      ) : (
        <span className="grid gap-0.5 text-ink-3">
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
