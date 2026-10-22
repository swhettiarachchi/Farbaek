import { ArrowDownLeftIcon, ArrowRightIcon, ArrowUpRightIcon, DevicesIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/app/primitives";
import { CapsuleOpen } from "@/components/mesh/capsule-open";
import { CapsuleSend } from "@/components/mesh/capsule-send";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBytes } from "@/core/workspace/files";
import { listCapsules } from "@/server/mesh/capsules";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Mesh" };

const ROUTE = [
  { label: "pack", body: "Your files, each with a BLAKE3 hash. Credentials, keys and build folders stay behind." },
  { label: "move", body: "Email it, share it from a drive or carry it on a USB stick. The file is all that travels." },
  { label: "verify", body: "Every byte is hashed again on arrival, and you decide each file that differs." },
];

export default async function MeshPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const orgId = ctx.current.id;
  const projects = await ctx.reader.listProjects(orgId);
  const client = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const history = client ? await listCapsules(client, orgId) : [];
  const known = new Set(projects.map((p) => p.id));
  const canImport = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const importReason =
    ctx.mode === "demo"
      ? "The demo workspace is read-only. You can still open a Capsule here to check it."
      : !ctx.writes.enabled
        ? ctx.writes.reason
        : !canImport
          ? "Your role can view projects but not add files to them."
          : null;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Mesh"
        description="Move a project between workspaces and computers as a Workspace Capsule: one file that's checked byte by byte when it arrives, so nothing changes on the way without you knowing."
      />

      <ol className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
        {ROUTE.map((step, i) => (
          <li key={step.label} className="grid content-start gap-1.5 bg-surface px-5 py-4">
            <span className="flex items-center gap-2 font-mono text-xs text-accent">
              {`// ${step.label}`}
              {i < ROUTE.length - 1 ? <ArrowRightIcon size={12} className="hidden text-ink-3 sm:inline" aria-hidden /> : null}
            </span>
            <span className="text-sm leading-relaxed text-ink-2">{step.body}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <Card>
          <h2 className="text-lg font-medium">Send a Capsule</h2>
          <p className="mt-1 mb-5 text-sm leading-relaxed text-ink-2">Pack a project&apos;s current files into one download.</p>
          <CapsuleSend projects={projects.map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null }))} />
        </Card>

        <Card>
          <h2 className="text-lg font-medium">Open a Capsule</h2>
          <p className="mt-1 mb-5 text-sm leading-relaxed text-ink-2">Check one you were sent, then bring it in as a new project or into one you have.</p>
          <CapsuleOpen destinations={projects.filter((p) => p.archivedAt === null).map((p) => ({ id: p.id, name: p.name }))} disabledReason={importReason} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <DevicesIcon size={20} className="text-ink-3" aria-hidden /> Your devices
            </h2>
            <StatusBadge status="unverified" label="Not available yet" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            Sending a Capsule straight to your other computer, over your own network and paired with a short code, comes next with the Farbaek Agent. Until then, download a Capsule and move the file yourself.
          </p>
          <Link href="/app/agents" className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:underline">
            About the Farbaek Agent <ArrowRightIcon size={14} aria-hidden />
          </Link>
        </Card>

        <Card>
          <h2 className="text-lg font-medium">History</h2>
          {history.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              {ctx.mode === "demo"
                ? "History is kept for real workspaces. The demo doesn't record Capsules."
                : "No Capsules yet. Each one downloaded or opened in this workspace is listed here with its digest."}
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {history.map((h) => (
                <li key={h.id} className="flex items-start gap-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/[0.08] text-accent">
                    {h.direction === "export" ? <ArrowUpRightIcon size={16} weight="bold" aria-hidden /> : <ArrowDownLeftIcon size={16} weight="bold" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{h.direction === "export" ? "Packed" : "Opened"}</span>{" "}
                      {h.projectId && known.has(h.projectId) ? (
                        <Link href={`/app/projects/${h.projectId}`} className="break-words text-ink hover:text-accent hover:underline">
                          {h.projectName}
                        </Link>
                      ) : (
                        <span className="break-words">{h.projectName}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {h.files.toLocaleString("en-US")} {h.files === 1 ? "file" : "files"}, {formatBytes(h.bytes)}
                      {h.excluded > 0 ? `, ${h.excluded.toLocaleString("en-US")} left out` : ""}
                      <span className="block truncate font-mono sm:inline sm:before:content-['_·_']" title={`blake3:${h.digest}`}>
                        blake3:{h.digest.slice(0, 8)}…{h.digest.slice(-6)}
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-3">
                    <RelativeTime iso={h.createdAt} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
