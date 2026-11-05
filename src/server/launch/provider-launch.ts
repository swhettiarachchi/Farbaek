/**
 * LaunchOS with a workspace's own hosting account (ADR 0078, ADR 0093):
 * connecting it, authorizing one launch of exactly the project's current
 * files, and carrying it out. The steps every provider shares live here;
 * Vercel's run (upload each file by SHA-1, create a production deployment,
 * follow Vercel's state, check the live address) is here too, and Netlify's
 * is in netlify-launch.ts. The database decides who may do what and under
 * which evidence; this decides nothing it doesn't also check there.
 */
import { createHash } from "node:crypto";
import { PROVIDER_NAMES, type LaunchProvider } from "@/core/launch/providers";
import { VERCEL_NAME, deployDigest, publicAddress, statusFromReadyState, vercelFit, type VercelSettings } from "@/core/launch/vercel";
import { overrideReasonProblem } from "@/core/publish/evidence";
import { log } from "@/server/observability/log";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES, type OrgRole } from "@/server/workspace/types";
import { fail, requirePermission, type WriteResult } from "@/server/workspace/use-cases";
import type { WithheldPermissions } from "@/core/workspace/permissions";
import type { LaunchPlan } from "@/core/launch/planner";
import type { NetlifyClient } from "./netlify-client";
import type { LaunchStore } from "./provider-store";
import { openToken, sealToken, type VaultKey } from "./token-vault";
import type { VercelClient } from "./vercel-client";

export interface LaunchDeps {
  store: LaunchStore;
  /** The vault key, or null when this server can't keep tokens. */
  key: VaultKey | null;
  vercel(token: string, teamId: string | null): VercelClient;
  /** `accountSlug` is the Netlify team the connection was made for, if any. */
  netlify(token: string, accountSlug: string | null): NetlifyClient;
  /** The project's current files, with their SHA-256s. */
  files(orgId: string, projectId: string): Promise<{ path: string; content: string; sha256: string }[]>;
  /** Fetches the live address once, for the check after it's ready. Returns the HTTP status, or 0 for no answer. */
  probe(url: string): Promise<number>;
  sleep(ms: number): Promise<void>;
}

export interface LaunchPerson {
  orgId: string;
  userId: string;
  role: OrgRole;
  /** What an owner or admin turned off for them (ADR 0087). */
  permissions: WithheldPermissions;
}

/** One file a launch sends: text, or an image as base64 (ADR 0108). `sha256` is over the bytes sent. */
export type LaunchFile = { path: string; content: string; sha256: string; encoding?: "base64" };

/** The bytes a launch sends for a file: UTF-8 for text, the decoded bytes for an image. */
export function launchBytes(f: { content: string; encoding?: "base64" }): Buffer {
  return f.encoding === "base64" ? Buffer.from(f.content, "base64") : Buffer.from(f.content, "utf8");
}

export const NO_VAULT = "Connecting hosting accounts isn't set up on this server yet.";
const MAX_FILES = 3_000;
const MAX_BYTES = 25 * 1024 * 1024;
const UPLOADS_AT_ONCE = 6;
export const POLL_MS = 5_000;
export const POLL_FOR_MS = 20 * 60_000;

/**
 * Connects (or replaces) the workspace's account with a provider, after the
 * provider confirms whose token it is. The token is sealed to the workspace
 * and the provider, and never shown again.
 */
export async function connectProvider(
  deps: LaunchDeps,
  person: LaunchPerson,
  provider: LaunchProvider,
  input: { token: string; teamId: string | null; limit: number | null; badToken: string; badTeam: string },
  whoami: (token: string, teamId: string | null) => Promise<{ ok: true; value: { id: string; name: string } } | { ok: false; message: string }>,
): Promise<WriteResult<{ accountName: string }>> {
  if (!MANAGER_ROLES.includes(person.role)) return fail("FORBIDDEN", "Only an owner or admin can connect a hosting account.");
  if (!deps.key) return fail("FORBIDDEN", NO_VAULT);
  const token = input.token.trim();
  if (token.length < 20 || token.length > 400 || /\s/.test(token)) return fail("FORBIDDEN", input.badToken);
  const teamId = input.teamId?.trim() || null;
  if (teamId && !/^[A-Za-z0-9_-]{1,100}$/.test(teamId)) return fail("FORBIDDEN", input.badTeam);
  const who = await whoami(token, teamId);
  if (!who.ok) return fail("FORBIDDEN", who.message);
  const sealed = sealToken(token, deps.key, { orgId: person.orgId, provider });
  const r = await deps.store.connect({ orgId: person.orgId, actor: person.userId, provider, accountId: who.value.id, accountName: who.value.name, teamId, sealed, limit: input.limit });
  if (!r.ok) return r.error.includes("QUOTA_EXCEEDED") ? fail("QUOTA_EXCEEDED", "Your plan's integrations are all in use. Disconnect one, or move to a plan with more.") : fail("FORBIDDEN", "The connection couldn't be saved. Try again.");
  return { ok: true, value: { accountName: who.value.name } };
}

export async function disconnectProvider(deps: LaunchDeps, person: LaunchPerson, provider: LaunchProvider): Promise<WriteResult<null>> {
  if (!MANAGER_ROLES.includes(person.role)) return fail("FORBIDDEN", "Only an owner or admin can disconnect a hosting account.");
  const r = await deps.store.disconnect({ orgId: person.orgId, actor: person.userId, provider });
  return r.ok ? r : fail("NOT_FOUND", `${PROVIDER_NAMES[provider]} isn't connected to this workspace.`);
}

/** Connects (or replaces) the workspace's Vercel account, after Vercel confirms whose token it is. */
export function connectVercel(deps: LaunchDeps, person: LaunchPerson, input: { token: string; teamId: string | null; limit: number | null }): Promise<WriteResult<{ accountName: string }>> {
  return connectProvider(
    deps,
    person,
    "vercel",
    {
      ...input,
      badToken: "That doesn't look like a Vercel token. Create one in Vercel under Account settings, then Tokens, and paste it whole.",
      badTeam: "A Vercel team ID looks like team_ followed by letters and numbers.",
    },
    async (token, teamId) => {
      const who = await deps.vercel(token, teamId).whoami();
      return who.ok ? { ok: true, value: { id: who.value.id, name: who.value.username } } : who;
    },
  );
}

export const disconnectVercel = (deps: LaunchDeps, person: LaunchPerson) => disconnectProvider(deps, person, "vercel");

const authorizeErrors = (provider: LaunchProvider): [string, string][] => [
  ["EVIDENCE_REQUIRED", "The latest change isn't verified, so an owner or admin has to say why it should go live anyway."],
  ["OVERRIDE_FORBIDDEN", "Only an owner or admin can launch without passed checks."],
  ["LAUNCH_RUNNING", "A launch of this project is already under way. Wait for it to finish."],
  ["NOT_CONNECTED", `Connect ${PROVIDER_NAMES[provider]} first.`],
  ["NOT_FOUND", "That project doesn't exist, or it's archived."],
];

/**
 * Authorizes one launch of exactly the project's current files, and starts
 * it in the background. The same key returns the same order, so pressing
 * twice can't launch twice. `unfit`, `nameProblem` and `filesProblem` are
 * the provider's own reasons it can't take this launch.
 */
export async function authorizeLaunch(
  deps: LaunchDeps,
  person: LaunchPerson,
  input: {
    provider: LaunchProvider;
    projectId: string;
    key: string;
    target: string;
    confirm: string;
    overrideReason: string | null;
    unfit: string | null;
    nameProblem: string | null;
    filesProblem?: (paths: string[]) => string | null;
  },
  start: (run: { orgId: string; orderId: string; files: LaunchFile[]; digest: string }) => Promise<unknown>,
): Promise<WriteResult<{ orderId: string }>> {
  if (!CONTRIBUTOR_ROLES.includes(person.role)) return fail("FORBIDDEN", "Viewers can't launch projects.");
  const allowed = requirePermission(person.role, person.permissions, "publish");
  if (!allowed.ok) return allowed;
  if (!deps.key) return fail("FORBIDDEN", NO_VAULT);
  if (input.unfit) return fail("FORBIDDEN", input.unfit);
  if (input.nameProblem) return fail("INVALID_NAME", input.nameProblem);
  if (input.confirm.trim() !== input.target) return fail("FORBIDDEN", `Type ${input.target} to confirm.`);
  const reason = input.overrideReason?.trim() || null;
  if (reason) {
    const problem = overrideReasonProblem(reason);
    if (problem) return fail("FORBIDDEN", problem);
  }

  const files = await deps.files(person.orgId, input.projectId);
  if (files.length === 0) return fail("NOTHING_TO_IMPORT", "This project has no files to launch.");
  const bytes = files.reduce((n, f) => n + launchBytes(f).length, 0);
  if (files.length > MAX_FILES || bytes > MAX_BYTES) return fail("PROJECT_TOO_LARGE", "This project is larger than a launch can send (3,000 files or 25 MB).");
  const filesProblem = input.filesProblem?.(files.map((f) => f.path)) ?? null;
  if (filesProblem) return fail("FORBIDDEN", filesProblem);
  const digest = await deployDigest(files);

  const r = await deps.store.authorize({ orgId: person.orgId, actor: person.userId, projectId: input.projectId, provider: input.provider, key: input.key, target: input.target, digest, fileCount: files.length, bytes, overrideReason: reason });
  if (!r.ok) {
    const known = authorizeErrors(input.provider).find(([code]) => r.error.includes(code));
    return fail("FORBIDDEN", known ? known[1] : "The launch couldn't be authorized. Try again.");
  }
  const orderId = r.value;
  const order = await deps.store.order(person.orgId, orderId);
  // A repeated press finds the order already under way: it isn't started twice.
  if (order && order.status === "authorized" && order.filesDigest === digest) {
    void start({ orgId: person.orgId, orderId, files, digest }).catch((e) => {
      log("error", "launch.crashed", { order: orderId, provider: input.provider, error: e instanceof Error ? e.message : String(e) });
    });
  }
  return { ok: true, value: { orderId } };
}

/** Authorizes one launch to Vercel, and starts it in the background. */
export function authorizeVercelLaunch(
  deps: LaunchDeps,
  person: LaunchPerson,
  input: { projectId: string; key: string; target: string; confirm: string; overrideReason: string | null; plan: Pick<LaunchPlan, "kind" | "build" | "output">; settings: VercelSettings },
): Promise<WriteResult<{ orderId: string }>> {
  return authorizeLaunch(
    deps,
    person,
    {
      ...input,
      provider: "vercel",
      unfit: vercelFit(input.plan),
      nameProblem: VERCEL_NAME.test(input.target) ? null : "Use lowercase letters, numbers and hyphens for the Vercel project name.",
    },
    (run) => runVercelLaunch(deps, { orgId: run.orgId, orderId: run.orderId, target: input.target, settings: input.settings, files: run.files }),
  );
}

export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/** The provider's token and team for this workspace, opened on this server, or null when it can't be. */
export async function openProviderToken(deps: LaunchDeps, orgId: string, provider: LaunchProvider): Promise<{ token: string; teamId: string | null } | null> {
  const connection = await deps.store.sealedToken(orgId, provider);
  const token = connection && deps.key ? openToken(connection.sealed, deps.key, { orgId, provider }) : null;
  return connection && token ? { token, teamId: connection.teamId } : null;
}

/** Records a failed launch in words, and says so if even that couldn't be recorded. */
export async function failLaunch(deps: LaunchDeps, id: string, message: string): Promise<"failed"> {
  const r = await deps.store.update({ id, status: "failed", failure: message });
  if (!r.ok) log("warn", "launch.update_failed", { order: id, error: r.error });
  return "failed";
}

/** Carries out an authorized launch. Exported for tests; authorizeVercelLaunch runs it in the background. */
export async function runVercelLaunch(
  deps: LaunchDeps,
  input: { orgId: string; orderId: string; target: string; settings: VercelSettings; files: { path: string; content: string; encoding?: "base64" }[] },
): Promise<"ready" | "failed" | "building"> {
  const id = input.orderId;
  const opened = await openProviderToken(deps, input.orgId, "vercel");
  if (!opened) return failLaunch(deps, id, "The Vercel token can't be opened on this server any more. Connect Vercel again, then launch.");
  const vercel = deps.vercel(opened.token, opened.teamId);

  await deps.store.update({ id, status: "uploading" });
  let uploaded: { file: string; sha: string; size: number }[];
  try {
    const results = await mapLimit(input.files, UPLOADS_AT_ONCE, async (f) => ({ path: f.path, r: await vercel.uploadFile(launchBytes(f)) }));
    const bad = results.find((x) => !x.r.ok);
    if (bad && !bad.r.ok) return failLaunch(deps, id, `${bad.path} didn't upload: ${bad.r.message}`);
    uploaded = results.map((x) => ({ file: x.path, ...(x.r as { ok: true; value: { sha: string; size: number } }).value }));
  } catch (e) {
    log("error", "launch.upload_crashed", { order: id, error: e instanceof Error ? e.message : String(e) });
    return failLaunch(deps, id, "The files couldn't be sent to Vercel. Try again.");
  }

  const created = await vercel.createDeployment({ name: input.target, files: uploaded, settings: input.settings });
  if (!created.ok) return failLaunch(deps, id, created.message);
  const inspector = created.value.inspectorUrl?.startsWith("https://vercel.com/") ? created.value.inspectorUrl : null;
  await deps.store.update({ id, status: "building", deploymentId: created.value.id, url: publicAddress(created.value), inspectorUrl: inspector });

  return followVercelLaunch(deps, vercel, { id, deploymentId: created.value.id, until: Date.now() + POLL_FOR_MS });
}

async function followVercelLaunch(deps: LaunchDeps, vercel: VercelClient, input: { id: string; deploymentId: string; until: number }): Promise<"ready" | "failed" | "building"> {
  for (;;) {
    const r = await vercel.getDeployment(input.deploymentId);
    if (r.ok) {
      const status = statusFromReadyState(r.value.readyState);
      if (status === "ready") {
        const url = publicAddress(r.value);
        const done = await deps.store.update({ id: input.id, status: "ready", url });
        if (!done.ok) log("warn", "launch.update_failed", { order: input.id, error: done.error });
        if (url) await deps.store.recordHealth({ id: input.id, status: await deps.probe(url).catch(() => 0) });
        return "ready";
      }
      if (status === "failed") {
        const why = r.value.errorMessage ? `Vercel's build stopped: ${r.value.errorMessage.replace(/\s+/g, " ").slice(0, 200)}` : `Vercel's build ended as ${r.value.readyState.toLowerCase()}. Its build log on Vercel says why.`;
        const done = await deps.store.update({ id: input.id, status: "failed", failure: why });
        if (!done.ok) log("warn", "launch.update_failed", { order: input.id, error: done.error });
        return "failed";
      }
    }
    // Still building, or Vercel didn't answer this time: keep following until the limit. The page follows it after that.
    if (Date.now() >= input.until) return "building";
    await deps.sleep(POLL_MS);
  }
}

/** Looks once at a Vercel launch still building, for the page, when the background follow has stopped (a restart). */
export async function refreshVercelLaunch(deps: LaunchDeps, orgId: string, orderId: string): Promise<void> {
  const order = await deps.store.order(orgId, orderId);
  if (!order || order.status !== "building" || !order.deploymentId) return;
  if (Date.now() - Date.parse(order.updatedAt) < 15_000) return;
  const opened = await openProviderToken(deps, orgId, "vercel");
  if (!opened) return;
  await followVercelLaunch(deps, deps.vercel(opened.token, opened.teamId), { id: orderId, deploymentId: order.deploymentId, until: 0 });
}

/** SHA-256 of a file's text, as the launch digest names it. */
export const fileSha256 = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");
