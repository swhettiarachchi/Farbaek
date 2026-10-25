import { DownloadSimpleIcon, ShieldWarningIcon, WindowsLogoIcon } from "@phosphor-icons/react/ssr";
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

        <div className="grid gap-4 border-t border-line pt-5 md:grid-cols-2">
          <div className="grid content-start gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldWarningIcon size={18} weight="bold" className="text-approval" aria-hidden /> Not code-signed yet
            </p>
            <p className="text-sm leading-relaxed text-ink-2">
              Windows SmartScreen shows &quot;Windows protected your PC&quot; the first time. Check the file&apos;s fingerprint first, then choose More info and Run anyway.
            </p>
          </div>
          <div className="grid min-w-0 content-start gap-2">
            <p className="text-sm font-medium">Its SHA-256 fingerprint</p>
            <p className="break-all rounded-sm border border-line bg-surface-sunken px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink">{d.sha256}</p>
            <p className="text-xs leading-relaxed text-ink-3">In PowerShell, in your Downloads folder, run this. The two must match.</p>
            <code className="block overflow-x-auto whitespace-nowrap rounded-sm border border-line bg-surface-sunken px-3 py-2 font-mono text-[12px] text-ink-2">Get-FileHash {d.file}</code>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-ink-3">
          Mac and Linux versions aren&apos;t available yet: each needs its own build machine, and the Mac version also needs an Apple Developer ID.
        </p>
      </div>
    </section>
  );
}
