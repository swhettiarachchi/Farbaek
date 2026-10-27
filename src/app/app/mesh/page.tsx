import { ArrowDownLeftIcon, ArrowRightIcon, ArrowUpRightIcon, DeviceMobileIcon, DevicesIcon, GlobeSimpleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/app/primitives";
import { CapsuleOpen } from "@/components/mesh/capsule-open";
import { CapsuleSend } from "@/components/mesh/capsule-send";
import { PhoneMesh } from "@/components/mesh/phone/phone-mesh";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBytes } from "@/core/workspace/files";
import { listCapsules } from "@/server/mesh/capsules";
import { relayHub } from "@/server/mesh/relay-http";
import { relayShareToday } from "@/server/mesh/relay-usage";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Mesh" };

/** "a1b2c3d4e5f6a7b8" as "a1b2 c3d4 e5f6 a7b8", as the agent shows it. */
const grouped = (fp: string) => fp.match(/.{1,4}/g)?.join(" ") ?? fp;

const ROUTE = [
  { label: "Pack", body: "Your files, each with a BLAKE3 hash. Credentials, keys and build folders stay behind." },
  { label: "Move", body: "Email it, share it from a drive or carry it on a USB stick. The file is all that travels." },
  { label: "Verify", body: "Every byte is hashed again on arrival, and you decide each file that differs." },
];

export default async function MeshPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const orgId = ctx.current.id;
  const projects = await ctx.reader.listProjects(orgId);
  const client = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const [history, agents, relayShare] = await Promise.all([
    client ? listCapsules(client, orgId) : Promise.resolve([]),
    ctx.reader.listAgents(orgId).catch(() => []),
    client ? relayShareToday(client, orgId).catch(() => null) : Promise.resolve(null),
  ]);
  // Mesh's relay (ADR 0094): agents that turned it on, and whether each is polling this server now.
  const relayAgents = agents.filter((a) => a.revokedAt === null && a.meshReachableAt && a.meshFingerprint);
  const hub = ctx.mode === "live" ? relayHub() : null;
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
            <span className="flex items-center gap-2 text-[13px] font-medium text-accent">
              {step.label}
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

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <DeviceMobileIcon size={20} className="text-ink-3" aria-hidden /> This phone or browser
          </h2>
          <StatusBadge status="info" label="No app to install" />
        </div>
        <p className="mt-2 mb-5 max-w-[68ch] text-sm leading-relaxed text-ink-2">
          Pair this device once with one of your computers, then send it photos and files from here. They go directly between the two when the networks allow it, encrypted end to end, and the computer checks every piece.
        </p>
        <PhoneMesh
          computers={relayAgents.map((a) => ({ id: a.id, name: a.name, fingerprint: a.meshFingerprint!, reachableNow: hub?.isReachable(a.id) ?? false }))}
          unavailable={ctx.mode === "demo" ? "The demo workspace has no computers to reach. Sign in to your own workspace." : null}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <DevicesIcon size={20} className="text-ink-3" aria-hidden /> Your devices
            </h2>
            <StatusBadge status="info" label="In the Farbaek Agent" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            The Farbaek Agent sends a folder straight to your other computer on the same network. Pair the two once with a six-digit code; every piece is then encrypted and checked against its hash as it arrives, and nothing passes through Farbaek. So far it has been checked between two agents on one computer.
          </p>
          <div className="mt-4 grid gap-3 rounded-sm border border-line bg-surface-raised/50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <GlobeSimpleIcon size={16} className="text-accent" aria-hidden /> Between your computers, anywhere
            </p>
            <p className="text-sm leading-relaxed text-ink-2">
              Paired computers on different networks can send over the internet too, while both apps are open. Farbaek helps the two find each other, then the files go directly between them when both networks allow it. When a direct link is blocked, the person sending can choose Farbaek&apos;s relay instead, which passes the bytes along without being able to read them and keeps nothing. Everything is encrypted end to end. Each agent turns it on in Nearby.
            </p>
            {relayAgents.length === 0 ? (
              <p className="text-sm text-ink-3">{ctx.mode === "demo" ? "The demo workspace has no agents." : "No agent in this workspace has it turned on."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {relayAgents.map((a) => {
                  const now = hub?.isReachable(a.id) ?? false;
                  return (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">{a.name}</span>
                        <span className="block font-mono text-xs text-ink-3">{grouped(a.meshFingerprint!)}</span>
                      </span>
                      <StatusBadge status={now ? "verified" : "unverified"} label={now ? "Reachable now" : "App not open"} />
                    </li>
                  );
                })}
              </ul>
            )}
            {relayShare !== null ? (
              <p className="text-xs text-ink-3">
                {relayShare === 0 ? "None of today's relay allowance used." : `${Math.max(1, Math.round(relayShare * 100))}% of today's relay allowance used.`} It renews at midnight UTC.
              </p>
            ) : null}
          </div>
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
