/**
 * Publishing a project's static site (ADR 0029). The gate is checked here
 * so the page can say what's missing, and again in the database, which has
 * the final word: a finished security check of exactly these files with
 * nothing critical. What goes live is the current list of file revisions.
 */
import { runProfile } from "@/content/starters";
import { deploymentDigest, publishGate, siteNameProblem, SITE_NAME_MESSAGES, type PublishBlock, type PublishedFile } from "@/core/publish/site";

export interface PublishCheck {
  id: string;
  status: "running" | "done" | "failed";
  startedAt: string;
  critical: number;
}

export interface PublishDeps {
  /** The site domain, or null when it isn't connected. */
  domain: string | null;
  canPublish: (orgId: string) => Promise<boolean>;
  files: (orgId: string, projectId: string) => Promise<{ path: string; revision: number; sha256: string; sizeBytes: number; updatedAt: string }[]>;
  latestCheck: (orgId: string, projectId: string) => Promise<PublishCheck | null>;
  publish: (input: { orgId: string; actor: string; projectId: string; name: string; files: PublishedFile[]; digest: string; reportId: string }) => Promise<{ ok: true; value: string } | { ok: false; error: string }>;
}

export type PublishResult = { ok: true; deploymentId: string; digest: string } | { ok: false; code: string; message: string };

const DATABASE_MESSAGES: Record<string, string> = {
  NAME_TAKEN: "That name is already used by another site. Choose another.",
  INVALID_NAME: SITE_NAME_MESSAGES.characters,
  FILES_CHANGED: "The files changed while publishing. Reload and publish again.",
  CHECK_REQUIRED: "Run a security check first. Publishing needs one that found nothing critical.",
  CHECK_STALE: "The files changed after the last security check. Run it again, then publish.",
  CRITICAL_FINDINGS: "The last security check found critical problems. Fix them first.",
  NO_INDEX: "Add an index.html first: it's the page people see.",
  PROJECT_ARCHIVED: "This project is archived, so it can't be published.",
  FORBIDDEN: "Your role can view this project but not publish it.",
  NOT_FOUND: "That project doesn't exist in this workspace.",
};

/** Everything the page needs to say whether a publish can happen, and why not. */
export async function publishReadiness(deps: PublishDeps, orgId: string, projectId: string) {
  const [files, check] = await Promise.all([deps.files(orgId, projectId), deps.latestCheck(orgId, projectId)]);
  const paths = files.map((f) => f.path);
  const filesChangedAt = files.reduce<string | null>((latest, f) => (!latest || f.updatedAt > latest ? f.updatedAt : latest), null);
  const profile = runProfile(paths).kind;
  const block: PublishBlock | null = publishGate({ domain: deps.domain, profile, paths, filesChangedAt, check });
  const published: PublishedFile[] = files.map((f) => ({ path: f.path, revision: f.revision, sha256: f.sha256, size: f.sizeBytes }));
  return { files: published, check, block, digest: files.length ? await deploymentDigest(projectId, published) : null };
}

export async function publishSite(deps: PublishDeps, input: { orgId: string; userId: string; projectId: string; name: string }): Promise<PublishResult> {
  const name = input.name.trim().toLowerCase();
  const problem = siteNameProblem(name);
  if (problem) return { ok: false, code: "INVALID_NAME", message: SITE_NAME_MESSAGES[problem] };
  if (!(await deps.canPublish(input.orgId))) return { ok: false, code: "FORBIDDEN", message: DATABASE_MESSAGES.FORBIDDEN! };

  const ready = await publishReadiness(deps, input.orgId, input.projectId);
  if (ready.block) return { ok: false, code: ready.block.code, message: ready.block.message };
  if (!ready.check || !ready.digest) return { ok: false, code: "CHECK_REQUIRED", message: DATABASE_MESSAGES.CHECK_REQUIRED! };

  const r = await deps.publish({ orgId: input.orgId, actor: input.userId, projectId: input.projectId, name, files: ready.files, digest: ready.digest, reportId: ready.check.id });
  if (r.ok) return { ok: true, deploymentId: r.value, digest: ready.digest };
  const code = Object.keys(DATABASE_MESSAGES).find((c) => r.error.includes(c)) ?? "UNKNOWN";
  return { ok: false, code, message: DATABASE_MESSAGES[code] ?? "Publishing didn't work this time. Try again." };
}
