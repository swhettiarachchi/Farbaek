/**
 * Assembles a task's Context Passport (ADR 0116) from what the person can
 * see: the reader goes through Row Level Security, so a passport never holds
 * a file, plan or check the person couldn't open themselves. Only the
 * manifests and README are read as text, and only to find scripts and
 * variable names; the passport itself carries references, not contents.
 */
import { assemblePassport, type ContextPassport } from "@/core/realityloop/context-passport";
import type { WorkspaceReader } from "./types";

const READ_AS_TEXT = ["package.json", "README.md", ".env.example", ".env.sample", ".env.template"];

export async function loadPassport(reader: WorkspaceReader, orgId: string, taskId: string, now: Date = new Date()): Promise<ContextPassport | null> {
  const found = await reader.getTask(orgId, taskId);
  if (!found) return null;
  const { task } = found;
  const [files, plan, checks] = await Promise.all([
    reader.listFiles(orgId, task.projectId).catch(() => []),
    reader.getContract(orgId, task.id).catch(() => null),
    reader.getLatestVerification(orgId, task.id).catch(() => null),
  ]);
  const present = new Set(files.map((f) => f.path));
  const texts = new Map<string, string>();
  await Promise.all(
    READ_AS_TEXT.filter((p) => present.has(p)).map(async (p) => {
      const file = await reader.getFile(orgId, task.projectId, p).catch(() => null);
      if (file && file.encoding !== "base64") texts.set(p, file.content.slice(0, 200_000));
    }),
  );

  return assemblePassport({
    taskId: task.id,
    projectId: task.projectId,
    goal: task.title,
    now,
    files,
    read: (p) => texts.get(p) ?? null,
    plan: plan ? { version: plan.version, sha256: plan.sha256, approved: plan.status === "approved", approvedAt: plan.approvedAt, contract: plan.body } : null,
    lastChecks: checks ? { result: checks.result, finishedAt: checks.finishedAt } : null,
  });
}
