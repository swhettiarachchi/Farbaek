/**
 * LaunchOS with Netlify (ADR 0093): connecting a workspace's own Netlify
 * account, and carrying out an authorized launch of a static project. Name
 * every file by its SHA-1, find or make the site, create a production deploy
 * from that digest, upload only the files Netlify asks for, follow its state,
 * confirm the site now publishes this deploy, then check the live address.
 * Netlify's API deploy runs no build, so only finished files go.
 */
import { createHash } from "node:crypto";
import { NETLIFY_NAME, diffReady, netlifyFit, netlifyPathProblem, statusFromNetlifyState } from "@/core/launch/netlify";
import { inspectorAddress, launchAddress } from "@/core/launch/providers";
import type { LaunchPlan } from "@/core/launch/planner";
import { shortHash } from "@/core/trust/canonical-json";
import { log } from "@/server/observability/log";
import type { WriteResult } from "@/server/workspace/use-cases";
import type { NetlifyClient, NetlifyDeploy } from "./netlify-client";
import { POLL_FOR_MS, POLL_MS, authorizeLaunch, connectProvider, disconnectProvider, failLaunch, launchBytes, mapLimit, openProviderToken, type LaunchDeps, type LaunchPerson } from "./provider-launch";

const UPLOADS_AT_ONCE = 5;
/** Netlify's own client compares the files in the background above this many. */
const ASYNC_ABOVE = 100;

/** Connects (or replaces) the workspace's Netlify account, after Netlify confirms whose token it is. */
export function connectNetlify(deps: LaunchDeps, person: LaunchPerson, input: { token: string; teamId: string | null; limit: number | null }): Promise<WriteResult<{ accountName: string }>> {
  return connectProvider(
    deps,
    person,
    "netlify",
    {
      ...input,
      badToken: "That doesn't look like a Netlify token. Create a personal access token in Netlify under User settings, then Applications, and paste it whole.",
      badTeam: "A Netlify team slug is lowercase letters, numbers and hyphens, as in the team's Netlify address.",
    },
    (token, slug) => deps.netlify(token, slug).whoami(),
  );
}

export const disconnectNetlify = (deps: LaunchDeps, person: LaunchPerson) => disconnectProvider(deps, person, "netlify");

/** Authorizes one launch to Netlify, and starts it in the background. */
export function authorizeNetlifyLaunch(
  deps: LaunchDeps,
  person: LaunchPerson,
  input: { projectId: string; key: string; target: string; confirm: string; overrideReason: string | null; plan: Pick<LaunchPlan, "kind"> },
): Promise<WriteResult<{ orderId: string }>> {
  return authorizeLaunch(
    deps,
    person,
    {
      ...input,
      provider: "netlify",
      unfit: netlifyFit(input.plan),
      nameProblem: NETLIFY_NAME.test(input.target) ? null : "Use lowercase letters, numbers and hyphens for the Netlify site name, at most 63 characters.",
      filesProblem: netlifyPathProblem,
    },
    (run) => runNetlifyLaunch(deps, { orgId: run.orgId, orderId: run.orderId, target: input.target, digest: run.digest, files: run.files }),
  );
}

const sha1 = (content: Buffer) => createHash("sha1").update(content).digest("hex");

const deployFailure = (d: NetlifyDeploy) =>
  d.errorMessage ? `Netlify stopped the deploy: ${d.errorMessage.replace(/\s+/g, " ").slice(0, 200)}` : `Netlify's deploy ended as ${d.state}. The deploy on Netlify says why.`;

/** Carries out an authorized launch. Exported for tests; authorizeNetlifyLaunch runs it in the background. */
export async function runNetlifyLaunch(
  deps: LaunchDeps,
  input: { orgId: string; orderId: string; target: string; digest: string; files: { path: string; content: string; encoding?: "base64" }[] },
): Promise<"ready" | "failed" | "building"> {
  const id = input.orderId;
  const opened = await openProviderToken(deps, input.orgId, "netlify");
  if (!opened) return failLaunch(deps, id, "The Netlify token can't be opened on this server any more. Connect Netlify again, then launch.");
  const netlify = deps.netlify(opened.token, opened.teamId);
  await deps.store.update({ id, status: "uploading" });

  // Each path named by its SHA-1. Files with the same bytes go up once.
  const digests: Record<string, string> = {};
  const bySha = new Map<string, { path: string; content: Buffer }>();
  for (const f of input.files) {
    const content = launchBytes(f);
    const sha = sha1(content);
    digests[`/${f.path}`] = sha;
    if (!bySha.has(sha)) bySha.set(sha, { path: f.path, content });
  }

  const found = await netlify.findSite(input.target);
  if (!found.ok) return failLaunch(deps, id, found.message);
  let site = found.value;
  if (!site) {
    const made = await netlify.createSite(input.target);
    if (!made.ok) return failLaunch(deps, id, made.message);
    site = made.value;
  }

  const created = await netlify.createDeploy(site.id, digests, { title: `Farbaek launch ${shortHash(input.digest)}`, async: input.files.length > ASYNC_ABOVE });
  if (!created.ok) return failLaunch(deps, id, created.message);
  let deploy = created.value;
  const inspector = site.adminUrl ? inspectorAddress("netlify", `${site.adminUrl.replace(/\/+$/, "")}/deploys/${encodeURIComponent(deploy.id)}`) : null;
  await deps.store.update({ id, status: "uploading", deploymentId: deploy.id, inspectorUrl: inspector });

  // In the background, Netlify compares the files first; its list of what it still needs is final after that.
  const until = Date.now() + POLL_FOR_MS;
  while (!diffReady(deploy.state)) {
    if (statusFromNetlifyState(deploy.state) === "failed") return failLaunch(deps, id, deployFailure(deploy));
    if (Date.now() >= until) return failLaunch(deps, id, "Netlify didn't finish comparing the files within 20 minutes. Check the deploy on Netlify, then launch again.");
    await deps.sleep(POLL_MS);
    const r = await netlify.getDeploy(deploy.id);
    if (r.ok) deploy = r.value;
  }

  const required = [...new Set(deploy.required)];
  if (required.some((sha) => !bySha.has(sha))) return failLaunch(deps, id, "Netlify asked for a file Farbaek didn't send. Launch again.");
  try {
    const results = await mapLimit(required, UPLOADS_AT_ONCE, async (sha) => {
      const f = bySha.get(sha)!;
      return { path: f.path, r: await netlify.uploadFile(deploy.id, f.path, f.content) };
    });
    const bad = results.find((x) => !x.r.ok);
    if (bad && !bad.r.ok) return failLaunch(deps, id, `${bad.path} didn't upload: ${bad.r.message}`);
  } catch (e) {
    log("error", "launch.upload_crashed", { order: id, provider: "netlify", error: e instanceof Error ? e.message : String(e) });
    return failLaunch(deps, id, "The files couldn't be sent to Netlify. Try again.");
  }
  await deps.store.update({ id, status: "building", deploymentId: deploy.id });

  return followNetlifyLaunch(deps, netlify, { id, deployId: deploy.id, target: input.target, until: Date.now() + POLL_FOR_MS });
}

async function followNetlifyLaunch(deps: LaunchDeps, netlify: NetlifyClient, input: { id: string; deployId: string; target: string; until: number }): Promise<"ready" | "failed" | "building"> {
  for (;;) {
    const r = await netlify.getDeploy(input.deployId);
    if (r.ok) {
      const status = statusFromNetlifyState(r.value.state);
      if (status === "failed") return failLaunch(deps, input.id, deployFailure(r.value));
      if (status === "ready") {
        // A site whose publishing is locked keeps serving the deploy it had: this one is ready, not live.
        const site = r.value.siteId ? await netlify.getSite(r.value.siteId) : null;
        if (site?.ok && site.value.publishedDeployId !== input.deployId) {
          return failLaunch(deps, input.id, "Netlify has it ready, but publishing is locked for this site in Netlify, so it isn't live. Publish this deploy from Netlify, or unlock publishing and launch again.");
        }
        const url = launchAddress("netlify", `https://${input.target}.netlify.app`);
        const done = await deps.store.update({ id: input.id, status: "ready", url });
        if (!done.ok) log("warn", "launch.update_failed", { order: input.id, error: done.error });
        if (url) await deps.store.recordHealth({ id: input.id, status: await deps.probe(url).catch(() => 0) });
        return "ready";
      }
    }
    // Still publishing, or Netlify didn't answer this time: keep following until the limit. The page follows it after that.
    if (Date.now() >= input.until) return "building";
    await deps.sleep(POLL_MS);
  }
}

/** Looks once at a Netlify launch still publishing, for the page, when the background follow has stopped (a restart). */
export async function refreshNetlifyLaunch(deps: LaunchDeps, orgId: string, orderId: string): Promise<void> {
  const order = await deps.store.order(orgId, orderId);
  if (!order || order.status !== "building" || !order.deploymentId) return;
  if (Date.now() - Date.parse(order.updatedAt) < 15_000) return;
  const opened = await openProviderToken(deps, orgId, "netlify");
  if (!opened) return;
  await followNetlifyLaunch(deps, deps.netlify(opened.token, opened.teamId), { id: orderId, deployId: order.deploymentId, target: order.targetName, until: 0 });
}
