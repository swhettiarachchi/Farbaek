/**
 * LaunchOS to hosts that run a server (ADR 0191), with a workspace's own
 * account and the same authorization, evidence rule and order as Vercel and
 * Netlify (provider-launch.ts).
 *
 * - Render and Railway build from one commit Farbaek writes to the project's
 *   linked GitHub repository, on its own launch branch, holding exactly the
 *   authorized files (launch-commit.ts). Each deploys that commit by its id,
 *   with automatic deploys off, so a later push to the branch deploys nothing.
 * - Fly.io runs Node's own image with the files in the machine's
 *   configuration: only small Node apps with no install or build step.
 *
 * Every address recorded or checked is on the provider's own domain.
 */
import { inspectorAddress, launchAddress, type ServerProvider } from "@/core/launch/providers";
import { LAUNCH_BRANCH, SERVER_NAME, SERVER_PORT, nodeEntry, serverFit, type ServerCommands } from "@/core/launch/servers";
import type { LaunchPlan } from "@/core/launch/planner";
import { shortHash } from "@/core/trust/canonical-json";
import { pushLaunchCommit, type LaunchGitHub } from "@/server/github/launch-commit";
import type { WriteResult } from "@/server/workspace/use-cases";
import { FLY_TOKEN, flyMachineConfig, statusFromFlyMachine, type FlyClient } from "./fly-client";
import { POLL_FOR_MS, POLL_MS, authorizeLaunch, connectProvider, disconnectProvider, failLaunch, launchBytes, openProviderToken, type LaunchDeps, type LaunchFile, type LaunchPerson } from "./provider-launch";
import { statusFromRailwayDeploy, type RailwayClient } from "./railway-client";
import { statusFromRenderDeploy, type RenderClient, type RenderService } from "./render-client";

/** What a repository launch needs beyond LaunchDeps: the linked repository and the launch branch's last commit. */
export interface RepoLaunchDeps {
  link(orgId: string, projectId: string): Promise<{ owner: string; repo: string; gh: LaunchGitHub } | { error: string }>;
  /** The commits Farbaek recorded for this project's launch branch, newest first. */
  recentCommits(projectId: string): Promise<string[]>;
  recordCommit(orderId: string, commit: string): Promise<boolean>;
}

export interface ServerLaunchDeps extends LaunchDeps {
  render(token: string): RenderClient;
  railway(token: string): RailwayClient;
  fly(token: string): FlyClient;
  repo: RepoLaunchDeps;
}

type Run = "ready" | "failed" | "building";

const CONNECT: Record<ServerProvider, { badToken: string; badTeam: string }> = {
  render: {
    badToken: "That doesn't look like a Render API key. Create one in Render under Account settings, API keys, and paste it whole.",
    badTeam: "A Render workspace ID looks like tea- or usr- followed by letters and numbers. Leave it empty to use your first workspace.",
  },
  railway: {
    badToken: "That doesn't look like a Railway token. Create an account token in Railway under Account settings, Tokens, and paste it whole.",
    badTeam: "A Railway workspace ID is the ID in the workspace's settings. Leave it empty to use your personal workspace.",
  },
  flyio: {
    badToken: "That doesn't look like a Fly.io token. Create an organization token with fly tokens create org, and paste it whole.",
    badTeam: "A Fly.io organization slug is lowercase letters, numbers and hyphens, such as personal.",
  },
};

/** Connects (or replaces) the workspace's account with Render, Railway or Fly.io, after the provider confirms the token. */
export function connectServerProvider(
  deps: ServerLaunchDeps,
  person: LaunchPerson,
  provider: ServerProvider,
  input: { token: string; teamId: string | null; limit: number | null },
): Promise<WriteResult<{ accountName: string }>> {
  if (provider === "flyio" && !input.teamId?.trim()) return Promise.resolve({ ok: false, code: "FORBIDDEN", message: "Fly.io needs the organization's slug, such as personal." });
  // Fly.io's organization tokens are "FlyV1 " and a long list; the other hosts use one word.
  const tokenPattern = provider === "flyio" ? FLY_TOKEN : undefined;
  return connectProvider(deps, person, provider, { ...input, ...CONNECT[provider], tokenPattern }, async (token, teamId) => {
    if (provider === "render") return deps.render(token).whoami(teamId);
    if (provider === "railway") {
      const who = await deps.railway(token).whoami();
      if (!who.ok) return who;
      const workspace = teamId ? who.value.workspaces.find((w) => w.id === teamId) : null;
      if (teamId && !workspace) return { ok: false, message: "This Railway token can't reach that workspace." };
      return { ok: true, value: { id: workspace?.id ?? who.value.id, name: workspace?.name ?? who.value.name } };
    }
    return deps.fly(token).whoami(teamId ?? "");
  });
}

export const disconnectServerProvider = (deps: LaunchDeps, person: LaunchPerson, provider: ServerProvider) => disconnectProvider(deps, person, provider);

/** Authorizes one launch to a server host, and starts it in the background. */
export function authorizeServerLaunch(
  deps: ServerLaunchDeps,
  person: LaunchPerson,
  provider: ServerProvider,
  input: {
    projectId: string;
    key: string;
    target: string;
    confirm: string;
    overrideReason: string | null;
    plan: Pick<LaunchPlan, "kind" | "hosting" | "start" | "build">;
    commands: ServerCommands | null;
    project: { pkgText: string | null; paths: readonly string[]; totalBytes: number; linkedRepo: boolean };
  },
): Promise<WriteResult<{ orderId: string }>> {
  return authorizeLaunch(
    deps,
    person,
    {
      ...input,
      provider,
      unfit: serverFit(provider, input.plan, input.project) ?? (input.commands ? null : "package.json needs a start script, so the host knows how to run it."),
      nameProblem: SERVER_NAME.test(input.target) ? null : "Use lowercase letters, numbers and hyphens for the name, at most 63 characters.",
    },
    (run) => {
      const base = { orgId: run.orgId, orderId: run.orderId, projectId: input.projectId, target: input.target, digest: run.digest, files: run.files, commands: input.commands! };
      if (provider === "render") return runRenderLaunch(deps, base);
      if (provider === "railway") return runRailwayLaunch(deps, base);
      return runFlyLaunch(deps, { ...base, entry: nodeEntry(input.project.pkgText, input.project.paths) ?? "" });
    },
  );
}

type RunInput = { orgId: string; orderId: string; projectId: string; target: string; digest: string; files: LaunchFile[]; commands: ServerCommands };

/** Writes the launch commit for Render or Railway, records it on the order, and returns it. */
async function launchCommit(deps: ServerLaunchDeps, input: RunInput): Promise<{ commit: string; repoUrl: string; repo: string } | { error: string }> {
  const link = await deps.repo.link(input.orgId, input.projectId);
  if ("error" in link) return { error: link.error };
  const pushed = await pushLaunchCommit(link.gh, {
    owner: link.owner,
    repo: link.repo,
    files: input.files.map((f) => ({ path: f.path, content: f.content, encoding: f.encoding })),
    message: `Farbaek launch ${shortHash(input.digest)}\n\nExactly the files authorized for this launch. Farbaek only writes this branch for launches.`,
    previous: await deps.repo.recentCommits(input.projectId),
    // Recorded before the branch moves, so a lost answer from GitHub can't strand the branch.
    onCommit: (commit) => deps.repo.recordCommit(input.orderId, commit),
  });
  if (!pushed.ok) return { error: pushed.message };
  return { commit: pushed.commit, repoUrl: `https://github.com/${link.owner}/${link.repo}`, repo: `${link.owner}/${link.repo}` };
}

/** Carries out a Render launch. Exported for tests. */
export async function runRenderLaunch(deps: ServerLaunchDeps, input: RunInput): Promise<Run> {
  const id = input.orderId;
  const opened = await openProviderToken(deps, input.orgId, "render");
  if (!opened) return failLaunch(deps, id, "The Render key can't be opened on this server any more. Connect Render again, then launch.");
  const render = deps.render(opened.token);
  await deps.store.update({ id, status: "uploading" });

  let ownerId = opened.teamId;
  if (!ownerId) {
    const owners = await render.owners();
    if (!owners.ok) return failLaunch(deps, id, owners.message);
    ownerId = owners.value[0]?.id ?? null;
    if (!ownerId) return failLaunch(deps, id, "This Render key has no workspace to create the service in.");
  }
  const commit = await launchCommit(deps, input);
  if ("error" in commit) return failLaunch(deps, id, commit.error);

  // Render's native runtimes need a build command; with nothing to build, an install of nothing is enough.
  const settings = { repo: commit.repoUrl, branch: LAUNCH_BRANCH, buildCommand: input.commands.build ?? "npm install --ignore-scripts --no-audit --no-fund", startCommand: input.commands.start };
  const found = await render.findService(ownerId, input.target);
  if (!found.ok) return failLaunch(deps, id, found.message);
  // Only a service Farbaek set up (this repository, the launch branch) is reused; anything else by that name is left alone.
  if (found.value && (found.value.repo?.toLowerCase() !== commit.repoUrl.toLowerCase() || found.value.branch !== LAUNCH_BRANCH)) {
    return failLaunch(deps, id, `Your Render account already has a service called ${input.target} that runs something else. Choose another name.`);
  }
  let service: RenderService;
  // A new service starts its first deploy itself, from the launch branch's head: that's the commit just written.
  let deployId: string | null = null;
  if (found.value) {
    const updated = await render.updateService(found.value.id, settings);
    if (!updated.ok) return failLaunch(deps, id, updated.message);
    service = updated.value;
  } else {
    const created = await render.createService({ ownerId, name: input.target, ...settings });
    if (!created.ok) return failLaunch(deps, id, created.message);
    service = created.value;
    deployId = created.value.deployId;
  }
  if (!deployId) {
    const deploy = await render.deployCommit(service.id, commit.commit);
    if (!deploy.ok) return failLaunch(deps, id, deploy.message);
    deployId = deploy.value.id;
  }
  const url = launchAddress("render", service.url);
  await deps.store.update({ id, status: "building", deploymentId: `${service.id}/${deployId}`, url, inspectorUrl: inspectorAddress("render", service.dashboardUrl) });
  return followRender(deps, render, { id, serviceId: service.id, deployId, commit: commit.commit, url, until: Date.now() + POLL_FOR_MS });
}

async function followRender(deps: LaunchDeps, render: RenderClient, input: { id: string; serviceId: string; deployId: string; commit: string | null; url: string | null; until: number }): Promise<Run> {
  for (;;) {
    const r = await render.getDeploy(input.serviceId, input.deployId);
    if (r.ok) {
      // The deploy must be of exactly the launch commit, whenever Render says which commit it is.
      if (input.commit && r.value.commitId && r.value.commitId !== input.commit) {
        return failLaunch(deps, input.id, "Render is deploying a different commit from the one Farbaek launched. Launch again.");
      }
      const status = statusFromRenderDeploy(r.value.status);
      if (status === "failed") return failLaunch(deps, input.id, `Render's deploy ended as ${r.value.status.replace(/_/g, " ")}. Its logs on Render say why.`);
      if (status === "ready") return ready(deps, input.id, input.url);
    }
    if (Date.now() >= input.until) return "building";
    await deps.sleep(POLL_MS);
  }
}

/** Carries out a Railway launch. Exported for tests. */
export async function runRailwayLaunch(deps: ServerLaunchDeps, input: RunInput): Promise<Run> {
  const id = input.orderId;
  const opened = await openProviderToken(deps, input.orgId, "railway");
  if (!opened) return failLaunch(deps, id, "The Railway token can't be opened on this server any more. Connect Railway again, then launch.");
  const railway = deps.railway(opened.token);
  await deps.store.update({ id, status: "uploading" });

  const commit = await launchCommit(deps, input);
  if ("error" in commit) return failLaunch(deps, id, commit.error);

  const found = await railway.findProject(input.target, opened.teamId);
  if (!found.ok) return failLaunch(deps, id, found.message);
  const project = found.value ?? (await railway.createProject(input.target, opened.teamId));
  if ("ok" in project && !project.ok) return failLaunch(deps, id, project.message);
  const p = "ok" in project ? project.value : project;
  const existing = p.services.find((s) => s.name === input.target) ?? null;
  // Only a service that builds this very repository is reused; anything else by that name is left alone.
  if (existing && existing.repo?.toLowerCase() !== commit.repo.toLowerCase()) {
    return failLaunch(
      deps,
      id,
      existing.repo
        ? `Your Railway project ${input.target} already has a service called ${input.target} that builds another repository. Choose another name.`
        : `Your Railway project ${input.target} has a service called ${input.target} with no repository, perhaps from a launch that stopped part way. Delete that service in Railway or choose another name.`,
    );
  }
  const ids = { projectId: p.id, environmentId: p.environmentId };
  let serviceId = existing?.id ?? null;
  if (!serviceId) {
    // Made empty, so nothing builds before its variables and commands are set.
    const made = await railway.createService({ projectId: p.id, name: input.target });
    if (!made.ok) return failLaunch(deps, id, made.message);
    serviceId = made.value.id;
  }
  // The port the domain points at, and npm told not to run packages' install scripts.
  const variables = await railway.setVariables({ ...ids, serviceId, variables: { PORT: String(SERVER_PORT), NPM_CONFIG_IGNORE_SCRIPTS: "true" } });
  if (!variables.ok) return failLaunch(deps, id, variables.message);
  const commands = await railway.setCommands({ serviceId, environmentId: p.environmentId, buildCommand: input.commands.build, startCommand: input.commands.start });
  if (!commands.ok) return failLaunch(deps, id, commands.message);
  if (!existing) {
    // The launch branch's head is the commit just written, so a deploy Railway starts on connecting builds those files.
    const connected = await railway.connectRepo({ serviceId, repo: commit.repo, branch: LAUNCH_BRANCH });
    if (!connected.ok) return failLaunch(deps, id, connected.message);
  }
  // Only the deploy Farbaek starts by commit counts; a later push to the branch deploys nothing.
  const manual = await railway.disableAutoDeploys({ ...ids, serviceId });
  if (!manual.ok) return failLaunch(deps, id, manual.message);
  const domain = await railway.ensureDomain({ projectId: p.id, serviceId, environmentId: p.environmentId, targetPort: SERVER_PORT });
  if (!domain.ok) return failLaunch(deps, id, domain.message);
  const url = launchAddress("railway", domain.value);

  const deploy = await railway.deployCommit({ serviceId, environmentId: p.environmentId, commitSha: commit.commit });
  if (!deploy.ok) return failLaunch(deps, id, deploy.message);
  await deps.store.update({ id, status: "building", deploymentId: deploy.value.id, url, inspectorUrl: inspectorAddress("railway", `https://railway.com/project/${p.id}`) });
  return followRailway(deps, railway, { id, deploymentId: deploy.value.id, url, until: Date.now() + POLL_FOR_MS });
}

async function followRailway(deps: LaunchDeps, railway: RailwayClient, input: { id: string; deploymentId: string; url: string | null; until: number }): Promise<Run> {
  for (;;) {
    const r = await railway.getDeployment(input.deploymentId);
    if (r.ok) {
      const status = statusFromRailwayDeploy(r.value.status);
      if (status === "failed") return failLaunch(deps, input.id, `Railway's deploy ended as ${r.value.status.toLowerCase()}. Its logs on Railway say why.`);
      if (status === "ready") return ready(deps, input.id, input.url);
    }
    if (Date.now() >= input.until) return "building";
    await deps.sleep(POLL_MS);
  }
}

/** Carries out a Fly.io launch. Exported for tests. */
export async function runFlyLaunch(deps: ServerLaunchDeps, input: RunInput & { entry: string }): Promise<Run> {
  const id = input.orderId;
  const opened = await openProviderToken(deps, input.orgId, "flyio");
  if (!opened || !opened.teamId) return failLaunch(deps, id, "The Fly.io token can't be opened on this server any more. Connect Fly.io again, then launch.");
  const fly = deps.fly(opened.token);
  await deps.store.update({ id, status: "uploading" });

  const config = flyMachineConfig({ files: input.files.map((f) => ({ path: f.path, bytes: new Uint8Array(launchBytes(f)) })), entry: input.entry });
  if (!config) return failLaunch(deps, id, "This project is larger than a Fly.io launch from here can carry. Use Render or Railway.");

  const app = await fly.getApp(input.target);
  if (!app.ok) return failLaunch(deps, id, app.message);
  if (app.value && app.value.orgSlug && app.value.orgSlug !== opened.teamId) return failLaunch(deps, id, "That app name is in another Fly.io organization. Choose another name.");
  if (!app.value) {
    const made = await fly.createApp(input.target, opened.teamId);
    if (!made.ok) return failLaunch(deps, id, made.message);
  }
  const ips = await fly.ensurePublicIps(input.target);
  if (!ips.ok) return failLaunch(deps, id, ips.message);

  const machines = await fly.listMachines(input.target);
  if (!machines.ok) return failLaunch(deps, id, machines.message);
  // Only machines Farbaek made are replaced; an app that runs anything else stays as it is.
  const ours = machines.value.filter((m) => m.metadata.farbaek === "launch");
  if (ours.length < machines.value.length) return failLaunch(deps, id, "This Fly.io app runs machines Farbaek didn't make. Choose another name, or remove them on Fly.io first.");
  let machine: Awaited<ReturnType<FlyClient["createMachine"]>> | null = null;
  if (ours.length === 0) machine = await fly.createMachine(input.target, config);
  for (const m of ours) {
    const updated = await fly.updateMachine(input.target, m.id, config);
    if (!updated.ok) return failLaunch(deps, id, updated.message);
    machine ??= updated;
  }
  if (!machine || !machine.ok) return failLaunch(deps, id, machine && !machine.ok ? machine.message : "Fly.io didn't start a machine. Launch again.");
  const url = launchAddress("flyio", `https://${input.target}.fly.dev`);
  await deps.store.update({ id, status: "building", deploymentId: `${input.target}/${machine.value.id}`, url, inspectorUrl: inspectorAddress("flyio", `https://fly.io/apps/${input.target}`) });
  return followFly(deps, fly, { id, app: input.target, machineId: machine.value.id, url, until: Date.now() + POLL_FOR_MS });
}

async function followFly(deps: LaunchDeps, fly: FlyClient, input: { id: string; app: string; machineId: string; url: string | null; until: number }): Promise<Run> {
  for (;;) {
    const r = await fly.getMachine(input.app, input.machineId);
    if (r.ok) {
      const status = statusFromFlyMachine(r.value.state);
      if (status === "failed") return failLaunch(deps, input.id, `Fly.io's machine ended as ${r.value.state}. Its logs on Fly.io say why.`);
      if (status === "ready") return ready(deps, input.id, input.url);
    }
    if (Date.now() >= input.until) return "building";
    await deps.sleep(POLL_MS);
  }
}

async function ready(deps: LaunchDeps, id: string, url: string | null): Promise<"ready"> {
  await deps.store.update({ id, status: "ready", url });
  if (url) await deps.store.recordHealth({ id, status: await deps.probe(url).catch(() => 0) });
  return "ready";
}

/** Looks once at a server launch still building, for the page, when the background follow has stopped (a restart). */
export async function refreshServerLaunch(deps: ServerLaunchDeps, orgId: string, orderId: string, provider: ServerProvider): Promise<void> {
  const order = await deps.store.order(orgId, orderId);
  if (!order || order.status !== "building" || !order.deploymentId) return;
  if (Date.now() - Date.parse(order.updatedAt) < 15_000) return;
  const opened = await openProviderToken(deps, orgId, provider);
  if (!opened) return;
  const [first, second] = order.deploymentId.split("/");
  if (provider === "render" && first && second) await followRender(deps, deps.render(opened.token), { id: orderId, serviceId: first, deployId: second, commit: null, url: order.url, until: 0 });
  if (provider === "railway") await followRailway(deps, deps.railway(opened.token), { id: orderId, deploymentId: order.deploymentId, url: order.url, until: 0 });
  if (provider === "flyio" && first && second) await followFly(deps, deps.fly(opened.token), { id: orderId, app: first, machineId: second, url: order.url, until: 0 });
}
