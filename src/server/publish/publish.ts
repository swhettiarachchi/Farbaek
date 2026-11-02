/**
 * Publishing a project's static site (ADR 0029). The gate is checked here
 * so the page can say what's missing, and again in the database, which has
 * the final word: a finished security check of exactly these files with
 * nothing critical. What goes live is the current list of file revisions.
 *
 * The evidence gate (ADR 0050) comes after it: the latest applied change is
 * verified with nothing changed since, or an owner or admin says why they're
 * publishing without that evidence.
 */
import { needsPackageJson } from "@/core/workspace/static-site";
import { runProfile } from "@/content/starters";
import { platformPause } from "@/server/platform/state";
import { overrideReasonProblem, type LaunchEvidence } from "@/core/publish/evidence";
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
  /** package.json's text, read only when it sits beside index.html: a bare one keeps the site static. */
  packageJson?: (orgId: string, projectId: string) => Promise<string | null>;
  latestCheck: (orgId: string, projectId: string) => Promise<PublishCheck | null>;
  evidence: (orgId: string, projectId: string) => Promise<LaunchEvidence>;
  /** Owners and admins can publish without verified evidence, with a reason. */
  canOverride: (orgId: string) => Promise<boolean>;
  publish: (input: { orgId: string; actor: string; projectId: string; name: string; files: PublishedFile[]; digest: string; reportId: string; overrideReason: string | null }) => Promise<{ ok: true; value: string } | { ok: false; error: string }>;
}

export type PublishResult = { ok: true; deploymentId: string; digest: string; overridden: boolean } | { ok: false; code: string; message: string };

// Matched by substring in order, so OVERRIDE_FORBIDDEN comes before FORBIDDEN.
const DATABASE_MESSAGES: Record<string, string> = {
  EVIDENCE_REQUIRED: "The latest change isn't verified, so publishing needs a reason from an owner or admin. Run its checks, or say why.",
  OVERRIDE_FORBIDDEN: "Only an owner or admin can publish without verified evidence. Run the latest change's checks, or ask one of them.",
  REASON_REQUIRED: "Say why in 10 to 500 characters.",
  NAME_TAKEN: "That name is already used by another site. Choose another.",
  INVALID_NAME: SITE_NAME_MESSAGES.characters,
  FILES_CHANGED: "The files changed while publishing. Reload and publish again.",
  CHECK_REQUIRED: "Run a security check first. Publishing needs one that found nothing critical.",
  CHECK_STALE: "The files changed after the last security check. Run it again, then publish.",
  CRITICAL_FINDINGS: "The last security check found critical problems. Fix them first.",
  NO_INDEX: "Add an index.html first: it's the page people see.",
  PROJECT_ARCHIVED: "This project is archived, so it can't be published.",
  PERMISSION_WITHHELD: "An owner or admin turned off publishing and launching for you in this workspace.",
  FORBIDDEN: "Your role can view this project but not publish it.",
  NOT_FOUND: "That project doesn't exist in this workspace.",
};

/** Everything the page needs to say whether a publish can happen, and why not. */
export async function publishReadiness(deps: PublishDeps, orgId: string, projectId: string) {
  const [files, check, evidence] = await Promise.all([deps.files(orgId, projectId), deps.latestCheck(orgId, projectId), deps.evidence(orgId, projectId)]);
  const paths = files.map((f) => f.path);
  const filesChangedAt = files.reduce<string | null>((latest, f) => (!latest || f.updatedAt > latest ? f.updatedAt : latest), null);
  const packageJson = needsPackageJson(paths) && deps.packageJson ? await deps.packageJson(orgId, projectId).catch(() => null) : null;
  const profile = runProfile(paths, packageJson).kind;
  const block: PublishBlock | null = publishGate({ domain: deps.domain, profile, paths, filesChangedAt, check, paused: platformPause("publishing") });
  const published: PublishedFile[] = files.map((f) => ({ path: f.path, revision: f.revision, sha256: f.sha256, size: f.sizeBytes }));
  return { files: published, check, block, evidence, needsOverride: evidence.status !== "verified", digest: files.length ? await deploymentDigest(projectId, published) : null };
}

export async function publishSite(deps: PublishDeps, input: { orgId: string; userId: string; projectId: string; name: string; overrideReason?: string | null }): Promise<PublishResult> {
  const name = input.name.trim().toLowerCase();
  const problem = siteNameProblem(name);
  if (problem) return { ok: false, code: "INVALID_NAME", message: SITE_NAME_MESSAGES[problem] };
  if (!(await deps.canPublish(input.orgId))) return { ok: false, code: "FORBIDDEN", message: DATABASE_MESSAGES.FORBIDDEN! };

  const ready = await publishReadiness(deps, input.orgId, input.projectId);
  if (ready.block) return { ok: false, code: ready.block.code, message: ready.block.message };
  if (!ready.check || !ready.digest) return { ok: false, code: "CHECK_REQUIRED", message: DATABASE_MESSAGES.CHECK_REQUIRED! };

  let overrideReason: string | null = null;
  if (ready.needsOverride) {
    const reason = input.overrideReason?.trim() ?? "";
    if (!reason) return { ok: false, code: "EVIDENCE_REQUIRED", message: DATABASE_MESSAGES.EVIDENCE_REQUIRED! };
    if (!(await deps.canOverride(input.orgId))) return { ok: false, code: "OVERRIDE_FORBIDDEN", message: DATABASE_MESSAGES.OVERRIDE_FORBIDDEN! };
    const reasonProblem = overrideReasonProblem(reason);
    if (reasonProblem) return { ok: false, code: "REASON_REQUIRED", message: reasonProblem };
    overrideReason = reason;
  }

  const r = await deps.publish({ orgId: input.orgId, actor: input.userId, projectId: input.projectId, name, files: ready.files, digest: ready.digest, reportId: ready.check.id, overrideReason });
  if (r.ok) return { ok: true, deploymentId: r.value, digest: ready.digest, overridden: overrideReason !== null };
  const code = Object.keys(DATABASE_MESSAGES).find((c) => r.error.includes(c)) ?? "UNKNOWN";
  return { ok: false, code, message: DATABASE_MESSAGES[code] ?? "Publishing didn't work this time. Try again." };
}
