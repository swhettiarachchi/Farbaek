import { ArrowUpRightIcon, DownloadSimpleIcon, EyeSlashIcon, FileIcon, ImageIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { formatBytes } from "@/core/workspace/files";
import { isImagePath } from "@/core/workspace/images";
import { LINK_CLOSED, shareContentVisible, sharePathVisible } from "@/core/workspace/sharing";
import { siteAddress } from "@/server/publish/config";
import { openShare, readSharedFile } from "@/server/workspace/share-access";

export const metadata: Metadata = { title: "Shared project" };

function Closed({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto grid max-w-[520px] gap-4 py-10">
      <h1 className={FOCUSED_TITLE}>{title}</h1>
      <p className="text-body leading-relaxed text-ink-2">{detail}</p>
      <div>
        <Link href="/" className={buttonClasses("secondary", "sm")}>
          What Farbaek is
        </Link>
      </div>
    </div>
  );
}

/**
 * A read-only link (ADR 0188). Anyone with it reads the project's current
 * files: never older versions, never its tasks, never credentials files or
 * text that looks like a key. Text is shown inside this page, escaped; it is
 * never served on its own as a page of this site.
 */
export default async function SharedLinkPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ path?: string }> }) {
  const { token } = await params;
  const { path } = await searchParams;
  const opened = await openShare(token);
  if (opened.kind === "limited") return <Closed title="Too many opens from your network" detail="Wait a while, then open the link again." />;
  if (opened.kind === "unavailable") return <Closed title="Shared links aren't available right now" detail="Try again in a few minutes." />;
  const view = opened.lookup;
  if (view.state !== "live") return <Closed {...LINK_CLOSED[view.state]} />;

  const shown = view.files.filter((f) => sharePathVisible(f.path).visible);
  const hidden = view.files.length - shown.length;
  const selected = typeof path === "string" ? shown.find((f) => f.path === path) ?? null : null;
  const file = selected ? await readSharedFile(token, selected.path) : null;
  const text = file && file.encoding === "utf8" ? file.content : null;
  const textVisible = text !== null && file ? shareContentVisible(file.path, text) : null;
  const site = view.site ? siteAddress(view.site.name) : null;
  const base = `/share/${token}`;

  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <h1 className={FOCUSED_TITLE}>{view.project.name}</h1>
        {view.project.description ? <p className="max-w-[65ch] text-body leading-relaxed text-ink-2">{view.project.description}</p> : null}
        <p className="max-w-[70ch] text-sm text-ink-3">
          A read-only copy of this project&apos;s current files, shared through Farbaek.{" "}
          {view.expiresAt ? (
            <>
              The link works until <LocalTime iso={view.expiresAt} />.
            </>
          ) : null}
        </p>
        {view.verified ? (
          <p className="flex items-start gap-2 text-sm text-ink-2">
            <SealCheckIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            <span>Its latest change passed Farbaek&apos;s checks, and no file has changed since.</span>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {site ? (
            <a href={site} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "sm")}>
              Open the live site <ArrowUpRightIcon size={16} weight="bold" aria-hidden />
            </a>
          ) : null}
          {view.allowDownload ? (
            <a href={`${base}/download`} download className={buttonClasses("secondary", "sm")}>
              <DownloadSimpleIcon size={16} weight="bold" aria-hidden /> Download .zip
            </a>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Files" className="rounded-md border border-line bg-surface p-3 shadow-e1">
          <p className="px-2 pb-2 text-xs font-medium text-ink-3">
            {shown.length.toLocaleString("en-US")} {shown.length === 1 ? "file" : "files"}
          </p>
          <ul className="max-h-[60dvh] overflow-y-auto">
            {shown.map((f) => (
              <li key={f.path}>
                <Link
                  href={`${base}?path=${encodeURIComponent(f.path)}`}
                  aria-current={selected?.path === f.path ? "page" : undefined}
                  className="flex min-h-11 items-center gap-2 rounded-sm px-2 text-sm hover:bg-surface-raised aria-[current=page]:bg-surface-raised aria-[current=page]:font-medium"
                >
                  {f.encoding === "base64" ? <ImageIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden /> : <FileIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />}
                  <span className="truncate font-mono text-label">{f.path}</span>
                </Link>
              </li>
            ))}
          </ul>
          {hidden > 0 ? (
            <p className="mt-2 flex items-start gap-2 px-2 text-xs text-ink-3">
              <EyeSlashIcon size={14} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {hidden} {hidden === 1 ? "file is" : "files are"} hidden: credentials files and dependency folders are never shared.
              </span>
            </p>
          ) : null}
        </nav>

        <section aria-label="File" className="min-w-0">
          {!selected ? (
            <div className="rounded-md border border-dashed border-line-strong p-8 text-center text-sm text-ink-3">Choose a file to read it.</div>
          ) : !file ? (
            <p className="text-sm text-ink-2">This file couldn&apos;t be read just now. Reload the page to try again.</p>
          ) : isImagePath(file.path) && file.encoding === "base64" ? (
            <figure className="grid gap-2 rounded-md border border-line bg-surface p-4 shadow-e1">
              {/* eslint-disable-next-line @next/next/no-img-element -- the project's own image, served with its exact type */}
              <img src={`${base}/raw?path=${encodeURIComponent(file.path)}`} alt={`${file.path}, an image in this project`} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-sm" />
              <figcaption className="text-xs text-ink-3">
                <span className="font-mono">{file.path}</span>, {formatBytes(file.sizeBytes)}
              </figcaption>
            </figure>
          ) : textVisible && !textVisible.visible ? (
            <p className="flex items-start gap-2 rounded-md border border-line bg-surface p-4 text-sm text-ink-2">
              <EyeSlashIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              <span>{textVisible.reason}</span>
            </p>
          ) : (
            <div className="grid gap-2">
              <p className="text-xs text-ink-3">
                <span className="font-mono">{file.path}</span>, {formatBytes(file.sizeBytes)}
              </p>
              <pre className="max-h-[75dvh] overflow-auto rounded-md border border-line bg-surface p-4 font-mono text-sm leading-relaxed shadow-e1">
                <code>{text}</code>
              </pre>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
