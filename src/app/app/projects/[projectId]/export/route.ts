import { EXPORT_HISTORY_LIMIT, buildExport, type ExportTask } from "@/core/workspace/export";
import { zipFiles } from "@/core/workspace/zip";
import { loadAppContext } from "@/server/workspace/context";

/** Tasks read for one export; a project with more says so in its README through the task count. */
const MAX_TASKS = 1_000;

/**
 * Exports everything Farbaek holds about a project (Eject Anytime, ADR 0039):
 * its files, and a `.farbaek/` folder with the tasks, contracts, ProofPacks,
 * recovery and check receipts, file history and an index. Read through Row
 * Level Security, so only members of the project's workspace get it, in
 * every billing state, like the plain download.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) return new Response("Not found", { status: 404 });
  const orgId = ctx.current.id;
  const project = await ctx.reader.getProject(orgId, projectId);
  if (!project) return new Response("Not found", { status: 404 });

  const [text, images, taskList, events] = await Promise.all([
    ctx.reader.getProjectContents(orgId, project.id),
    ctx.reader.getProjectImages(orgId, project.id),
    ctx.reader.listTasks(orgId, { projectId: project.id, limit: MAX_TASKS }),
    ctx.reader.listFileChangesSince(orgId, project.id, project.createdAt),
  ]);

  // Images go in as their bytes (ADR 0108), so an exported site is whole.
  const files = [...text, ...images.map((i) => ({ path: i.path, content: new Uint8Array(Buffer.from(i.base64, "base64")) }))].sort((a, b) => a.path.localeCompare(b.path));
  const tasks: ExportTask[] = [];
  for (const t of taskList) {
    const [detail, contract, proofPacks, recoveries, checks] = await Promise.all([
      ctx.reader.getTask(orgId, t.id),
      ctx.reader.getContract(orgId, t.id),
      ctx.reader.listProofPacks(orgId, t.id),
      ctx.reader.listRecoveries(orgId, t.id),
      ctx.reader.listCheckReceipts(orgId, t.id),
    ]);
    tasks.push({
      id: t.id,
      title: t.title,
      state: t.state,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      transitions: (detail?.history ?? []).map((h) => ({ eventType: h.eventType, from: h.from, to: h.to, actorKind: h.actorKind, at: h.at })),
      contract: contract ? { version: contract.version, status: contract.status, sha256: contract.sha256, body: contract.body, createdAt: contract.createdAt, approvedAt: contract.approvedAt } : null,
      proofPacks: proofPacks.map((p) => ({ digest: p.digest, status: p.status, statement: p.statement, createdAt: p.createdAt })),
      recoveries: recoveries.map((r) => ({ digest: r.digest, status: r.status, statement: r.statement, createdAt: r.createdAt })),
      checks: checks.map((c) => ({ digest: c.digest, status: c.status, statement: c.statement, createdAt: c.createdAt })),
    });
  }

  const { files: out } = buildExport({
    project: { id: project.id, name: project.name, description: project.description, createdAt: project.createdAt },
    exportedAt: new Date().toISOString(),
    files,
    tasks,
    history: { events, truncated: events.length >= EXPORT_HISTORY_LIMIT },
  });
  const name = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
  return new Response(zipFiles(out), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${name}-farbaek-export.zip"`,
      "cache-control": "private, no-store",
    },
  });
}
