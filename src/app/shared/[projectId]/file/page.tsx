import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Notice, PageHeader } from "@/components/app/primitives";
import { GuestFileEditor } from "@/components/sharing/guest-forms";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { guestDeleteFileAction } from "../../actions";
import { RelativeTime } from "@/components/ui/local-time";
import { formatBytes } from "@/core/workspace/files";
import { imageMime } from "@/core/workspace/images";
import { loadGuestProject } from "@/server/workspace/guest-context";

export const metadata: Metadata = { title: "File" };

/** One file of a shared project: read it, or, with edit access, change it. */
export default async function SharedFilePage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ path?: string; new?: string }> }) {
  const { projectId } = await params;
  const query = await searchParams;
  const guest = await loadGuestProject(projectId);
  if (!guest) notFound();
  const back = (
    <Link href={`/shared/${guest.project.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
      <ArrowLeftIcon size={14} weight="bold" aria-hidden /> {guest.project.name}
    </Link>
  );

  if (query.new === "1") {
    if (!guest.writes.enabled) notFound();
    return (
      <div className="grid gap-6">
        <div>
          {back}
          <div className="mt-3">
            <PageHeader title="New file" description="It's added to the project under your name. Files that hold keys or passwords can't be stored." />
          </div>
        </div>
        <Card>
          <GuestFileEditor projectId={guest.project.id} path={null} content="" revision={0} />
        </Card>
      </div>
    );
  }

  const path = typeof query.path === "string" ? query.path : "";
  const file = path ? await guest.reader.getFile(guest.orgId, guest.project.id, path).catch(() => null) : null;
  if (!file) notFound();
  const mime = file.encoding === "base64" ? imageMime(file.path) : null;

  return (
    <div className="grid gap-6">
      <div>
        {back}
        <div className="mt-3">
          <PageHeader
            title={file.path.split("/").at(-1) ?? file.path}
            description={
              <>
                <span className="block font-mono text-label break-all">{file.path}</span>
                <span className="mt-1 block text-ink-3">
                  {formatBytes(file.sizeBytes)}. Revision {file.revision}, updated <RelativeTime iso={file.updatedAt} />.
                </span>
              </>
            }
          />
        </div>
      </div>
      {mime ? (
        <Card>
          {/* eslint-disable-next-line @next/next/no-img-element -- a project's own image, inline from its stored bytes */}
          <img src={`data:${mime};base64,${file.content}`} alt={`${file.path}, an image in this project`} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-sm" />
        </Card>
      ) : guest.writes.enabled ? (
        <Card>
          <GuestFileEditor projectId={guest.project.id} path={file.path} content={file.content} revision={file.revision} />
        </Card>
      ) : (
        <>
          {guest.access === "edit" ? <Notice>{guest.writes.reason}</Notice> : null}
          <pre className="max-h-[75dvh] overflow-auto rounded-md border border-line bg-surface p-4 font-mono text-sm leading-relaxed shadow-e1">
            <code>{file.content}</code>
          </pre>
        </>
      )}
      {guest.writes.enabled ? (
        <ConfirmAction
          action={guestDeleteFileAction}
          fields={{ projectId: guest.project.id, path: file.path, expectedRevision: file.revision }}
          trigger="Delete this file"
          question={<>Delete {file.path}? Its history keeps every earlier version, so the workspace can bring it back.</>}
          confirmLabel="Delete file"
          pendingLabel="Deleting…"
        />
      ) : null}
    </div>
  );
}
