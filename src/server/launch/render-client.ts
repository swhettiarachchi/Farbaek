/**
 * Render's API, as LaunchOS uses it: which workspaces (owners) an API key
 * reaches, finding or making a free Node web service by name, pointing it at
 * a repository and branch, deploying one commit and reading that deploy's
 * status. Only api.render.com is called, with a time limit and no redirects,
 * and Render's errors come back as plain sentences that never include the
 * key. Ids are checked before they go into a path. Endpoints and fields are
 * from Render's API reference (api-docs.render.com), read 2026-11-12.
 */
import { z } from "zod";
import { CONTACT } from "@/config/contact";

const API = "https://api.render.com";
const TIMEOUT_MS = 30_000;
/** Render ids: srv-..., dep-..., usr-..., tea-... */
const ID = /^[a-z]{3}-[a-z0-9]{6,40}$/i;
/** A Git commit SHA, short or full (SHA-1 or SHA-256). */
const COMMIT = /^[0-9a-f]{7,64}$/i;

export interface RenderService {
  id: string;
  name: string;
  url: string | null;
  dashboardUrl: string | null;
  /** The repository and branch the service builds from, as Render reports them. */
  repo: string | null;
  branch: string | null;
}
export type RenderDeploy = { id: string; status: RenderDeployStatus | "unknown"; commitId: string | null };
export type RenderDeployStatus =
  | "created"
  | "queued"
  | "build_in_progress"
  | "update_in_progress"
  | "live"
  | "deactivated"
  | "build_failed"
  | "update_failed"
  | "canceled"
  | "pre_deploy_in_progress"
  | "pre_deploy_failed";
export type RenderResult<T> = { ok: true; value: T } | { ok: false; message: string };

export interface RenderClient {
  /** The owners (workspaces) this key can use; the first is the default. */
  owners(): Promise<RenderResult<{ id: string; name: string }[]>>;
  /** The account behind the key, for connecting: the owner whose id is `ownerId` when given, else the first. */
  whoami(ownerId: string | null): Promise<RenderResult<{ id: string; name: string }>>;
  findService(ownerId: string, name: string): Promise<RenderResult<RenderService | null>>;
  /** A new service; `deployId` is the first deploy Render starts on create, when it names one. */
  createService(input: { ownerId: string; name: string; repo: string; branch: string; buildCommand: string; startCommand: string }): Promise<RenderResult<RenderService & { deployId: string | null }>>;
  updateService(id: string, input: { repo: string; branch: string; buildCommand: string; startCommand: string }): Promise<RenderResult<RenderService>>;
  deployCommit(serviceId: string, commitId: string): Promise<RenderResult<{ id: string; status: RenderDeployStatus | "unknown" }>>;
  getDeploy(serviceId: string, deployId: string): Promise<RenderResult<RenderDeploy>>;
  /** The service's latest deploys (up to 20), for finding the one a queued (202) deploy became. */
  listDeploys(serviceId: string): Promise<RenderResult<RenderDeploy[]>>;
}

const STATUSES: readonly RenderDeployStatus[] = [
  "created",
  "queued",
  "build_in_progress",
  "update_in_progress",
  "live",
  "deactivated",
  "build_failed",
  "update_failed",
  "canceled",
  "pre_deploy_in_progress",
  "pre_deploy_failed",
];
const FAILED: ReadonlySet<string> = new Set(["build_failed", "update_failed", "pre_deploy_failed", "canceled", "deactivated"]);

/**
 * Maps a Render deploy status to a launch order status. `deactivated` counts
 * as failed: that deploy no longer serves the site. A status Render adds
 * later reads as failed when its name says so, and otherwise as still building.
 */
export function statusFromRenderDeploy(status: string): "building" | "ready" | "failed" {
  if (status === "live") return "ready";
  if (FAILED.has(status) || /fail|cancel/i.test(status)) return "failed";
  return "building";
}

const deployStatus = (status: string | undefined): RenderDeployStatus | "unknown" =>
  STATUSES.find((s) => s === status) ?? "unknown";

const ErrorBody = z.object({ message: z.string().optional() });
const OwnerBody = z.object({ id: z.string().regex(ID), name: z.string().nullable().optional() });
const ServiceBody = z.object({
  id: z.string().regex(ID),
  name: z.string(),
  ownerId: z.string().nullable().optional(),
  repo: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  dashboardUrl: z.string().nullable().optional(),
  serviceDetails: z.object({ url: z.string().nullable().optional() }).nullable().optional(),
});
const CreatedBody = z.object({ deployId: z.string().regex(ID).nullable().optional() });
const DeployBody = z.object({
  id: z.string().regex(ID),
  status: z.string().nullable().optional(),
  commit: z.object({ id: z.string().nullable().optional() }).nullable().optional(),
});

/** Takes the key (and anything shaped like a Render key) out of provider text, and keeps it short. */
const clean = (text: string, token: string) => {
  const scrubbed = token ? text.split(token).join("[token]") : text;
  return scrubbed.replace(/rnd_[A-Za-z0-9_-]{8,}/g, "[token]").replace(/\s+/g, " ").trim().slice(0, 200);
};
const unavailable = <T>(message: string): RenderResult<T> => ({ ok: false, message });

async function failure<T>(res: Response, token: string, doing = "does that"): Promise<RenderResult<T>> {
  let detail = "";
  try {
    const body = ErrorBody.safeParse(await res.json());
    if (body.success && body.data.message) detail = clean(body.data.message, token);
  } catch {
    // Not JSON: the status says enough.
  }
  if (res.status === 401) return { ok: false, message: "Render didn't accept this API key. Create one in Render under Account settings, API keys, and connect again." };
  if (res.status === 403) return { ok: false, message: "Render says this API key can't do that, or can't reach that workspace. Connect again with a key that can." };
  if (res.status === 402) return { ok: false, message: `Render wants payment details on this account before it ${doing}. They're added in your Render account's billing settings.` };
  if (res.status === 404) return { ok: false, message: "Render couldn't find that. It may have been deleted in your Render account." };
  if (res.status === 429) return { ok: false, message: "Render is limiting requests from this account right now. Try again in a few minutes." };
  if (res.status >= 400 && res.status < 500) return { ok: false, message: detail ? `Render refused it: ${detail}` : `Render refused it (${res.status}).` };
  return unavailable("Render didn't answer properly. Try again in a few minutes.");
}

/** Only an https address on onrender.com is shown as the service's public address. */
function publicUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || !u.hostname.endsWith(".onrender.com") || u.username || u.password) return null;
    return u.pathname === "/" && !u.search && !u.hash ? u.origin : u.href;
  } catch {
    return null;
  }
}

/** Only a link into Render's own dashboard is kept. */
function dashboardLink(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "dashboard.render.com" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A service, whether Render sends it bare or as `{ service }`. */
function readService(json: unknown): RenderResult<RenderService> {
  const inner = json && typeof json === "object" && "service" in json ? (json as { service: unknown }).service : json;
  const body = ServiceBody.safeParse(inner);
  if (!body.success) return unavailable("Render's answer about the service couldn't be read.");
  const s = body.data;
  const text = (value: string | null | undefined) => (value?.trim() ? value.trim().slice(0, 500) : null);
  return {
    ok: true,
    value: { id: s.id, name: s.name, url: publicUrl(s.serviceDetails?.url), dashboardUrl: dashboardLink(s.dashboardUrl), repo: text(s.repo), branch: text(s.branch) },
  };
}

/** A new service and the first deploy Render started for it: `{ service, deployId }`. */
function readCreated(json: unknown): RenderResult<RenderService & { deployId: string | null }> {
  const service = readService(json);
  if (!service.ok) return service;
  const created = CreatedBody.safeParse(json);
  // A deploy id that isn't Render's shape is left out rather than followed.
  return { ok: true, value: { ...service.value, deployId: created.success ? (created.data.deployId ?? null) : null } };
}

function readDeploy(json: unknown, fallback: RenderDeployStatus | "unknown"): RenderResult<RenderDeploy> {
  const body = DeployBody.safeParse(json);
  if (!body.success) return unavailable("Render's answer about the deploy couldn't be read.");
  const d = body.data;
  return { ok: true, value: { id: d.id, status: d.status ? deployStatus(d.status) : fallback, commitId: d.commit?.id ?? null } };
}

const badId = <T>(what: string): RenderResult<T> => ({ ok: false, message: `That isn't a Render ${what} id, so Farbaek didn't send it.` });
const blank = (value: string) => value.trim().length === 0;

function isHttpsRepo(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

function checkBuild(input: { repo: string; branch: string; buildCommand: string; startCommand: string }): string | null {
  if (!isHttpsRepo(input.repo)) return "Render needs the repository as an https address, like https://github.com/you/your-app.";
  if (blank(input.branch)) return "Render needs a branch to build from.";
  if (blank(input.startCommand)) return "Render needs a start command for the service.";
  return null;
}

export function createRenderClient(token: string, options: { fetcher?: typeof fetch; timeoutMs?: number } = {}): RenderClient {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const url = (path: string, query: Record<string, string> = {}) => {
    const u = new URL(`/v1${path}`, API);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    return u.toString();
  };
  async function call(target: string, init: RequestInit): Promise<Response | RenderResult<never>> {
    try {
      return await fetcher(target, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": `Farbaek (${CONTACT.support})`, ...(init.headers ?? {}) },
      });
    } catch {
      return unavailable("Farbaek couldn't reach Render. Try again in a few minutes.");
    }
  }
  async function getJson<T>(target: string, read: (json: unknown) => RenderResult<T>, init: RequestInit = { method: "GET" }, doing?: string): Promise<RenderResult<T>> {
    const res = await call(target, init);
    if (!(res instanceof Response)) return res;
    if (!res.ok) return failure(res, token, doing);
    return read(await res.json().catch(() => null));
  }
  const sendJson = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function owners(): Promise<RenderResult<{ id: string; name: string }[]>> {
    return getJson(url("/owners", { limit: "20" }), (json) => {
      if (!Array.isArray(json)) return unavailable("Render's list of workspaces couldn't be read.");
      const list: { id: string; name: string }[] = [];
      for (const item of json) {
        const inner = item && typeof item === "object" && "owner" in item ? (item as { owner: unknown }).owner : item;
        const owner = OwnerBody.safeParse(inner);
        // Never the email: only the id and the workspace's name.
        if (owner.success) list.push({ id: owner.data.id, name: (owner.data.name?.trim() || "Render workspace").slice(0, 200) });
      }
      return { ok: true, value: list };
    });
  }

  /** GET /services/{id}/deploys?limit=20: Render lists `{ deploy, cursor }`, newest first. */
  async function listDeploys(serviceId: string): Promise<RenderResult<RenderDeploy[]>> {
    if (!ID.test(serviceId)) return badId("service");
    return getJson(url(`/services/${encodeURIComponent(serviceId)}/deploys`, { limit: "20" }), (json) => {
      if (!Array.isArray(json)) return unavailable("Render's list of deploys couldn't be read.");
      const list: RenderDeploy[] = [];
      for (const item of json) {
        const inner = item && typeof item === "object" && "deploy" in item ? (item as { deploy: unknown }).deploy : item;
        const deploy = readDeploy(inner, "unknown");
        if (deploy.ok) list.push(deploy.value);
      }
      return { ok: true, value: list };
    });
  }

  return {
    owners,

    async whoami(ownerId) {
      if (ownerId !== null && !ID.test(ownerId)) return badId("workspace");
      const list = await owners();
      if (!list.ok) return list;
      if (ownerId !== null) {
        const match = list.value.find((o) => o.id === ownerId);
        return match ? { ok: true, value: match } : { ok: false, message: "This API key can't reach that Render workspace. Check the workspace in Render, or connect with a key from it." };
      }
      const first = list.value[0];
      return first ? { ok: true, value: first } : { ok: false, message: "This API key doesn't reach any Render workspace. Create the key in the workspace you want to deploy to." };
    },

    async findService(ownerId, name) {
      if (!ID.test(ownerId)) return badId("workspace");
      if (blank(name)) return { ok: false, message: "A Render service needs a name." };
      return getJson(url("/services", { name, ownerId, limit: "20" }), (json) => {
        if (!Array.isArray(json)) return unavailable("Render's list of services couldn't be read.");
        for (const item of json) {
          const inner = item && typeof item === "object" && "service" in item ? (item as { service: unknown }).service : item;
          const parsed = ServiceBody.safeParse(inner);
          if (!parsed.success || parsed.data.name !== name) continue;
          if (parsed.data.ownerId && parsed.data.ownerId !== ownerId) continue;
          return readService(inner);
        }
        return { ok: true, value: null };
      });
    },

    async createService(input) {
      if (!ID.test(input.ownerId)) return badId("workspace");
      if (blank(input.name)) return { ok: false, message: "A Render service needs a name." };
      const problem = checkBuild(input);
      if (problem) return { ok: false, message: problem };
      // Without `plan`, Render picks a paid plan: always ask for the free one.
      const body = {
        type: "web_service",
        name: input.name,
        ownerId: input.ownerId,
        repo: input.repo,
        branch: input.branch,
        autoDeployTrigger: "off",
        // npm's install scripts stay off on Render's own install too, and the app listens on 8080.
        envVars: [
          { key: "NPM_CONFIG_IGNORE_SCRIPTS", value: "true" },
          { key: "PORT", value: "8080" },
        ],
        serviceDetails: { runtime: "node", plan: "free", envSpecificDetails: { buildCommand: input.buildCommand, startCommand: input.startCommand } },
      };
      return getJson(url("/services"), readCreated, sendJson("POST", body), "creates the service");
    },

    async updateService(id, input) {
      if (!ID.test(id)) return badId("service");
      const problem = checkBuild(input);
      if (problem) return { ok: false, message: problem };
      const body = {
        repo: input.repo,
        branch: input.branch,
        autoDeployTrigger: "off",
        serviceDetails: { envSpecificDetails: { buildCommand: input.buildCommand, startCommand: input.startCommand } },
      };
      return getJson(url(`/services/${encodeURIComponent(id)}`), readService, sendJson("PATCH", body), "changes the service");
    },

    async deployCommit(serviceId, commitId) {
      if (!ID.test(serviceId)) return badId("service");
      if (!COMMIT.test(commitId)) return { ok: false, message: "That isn't a Git commit id, so Farbaek didn't ask Render to deploy it." };
      const res = await call(url(`/services/${encodeURIComponent(serviceId)}/deploys`), sendJson("POST", { commitId }));
      if (!(res instanceof Response)) return res;
      if (!res.ok) return failure(res, token, "deploys");
      const queued = res.status === 202;
      const deploy = readDeploy(await res.json().catch(() => null), queued ? "queued" : "created");
      if (deploy.ok) return { ok: true, value: { id: deploy.value.id, status: deploy.value.status } };
      if (!queued) return deploy;
      // 202 has no body in Render's reference: the deploy waits behind another one, so find it by its commit.
      const recent = await listDeploys(serviceId);
      const sha = commitId.toLowerCase();
      const sameCommit = (d: RenderDeploy) => {
        const other = d.commitId?.toLowerCase() ?? "";
        return COMMIT.test(other) && (other.startsWith(sha) || sha.startsWith(other));
      };
      const matches = recent.ok ? recent.value.filter(sameCommit) : [];
      // Newest first; a waiting deploy of this commit is the one just queued, ahead of older ones.
      const match = matches.find((d) => d.status === "queued" || d.status === "created") ?? matches[0];
      if (match) return { ok: true, value: { id: match.id, status: match.status } };
      return { ok: false, message: "Render queued this deploy behind one that's still running but didn't say which deploy it is, so Farbaek can't follow it. It still runs: check it in your Render dashboard." };
    },

    async getDeploy(serviceId, deployId) {
      if (!ID.test(serviceId)) return badId("service");
      if (!ID.test(deployId)) return badId("deploy");
      return getJson(url(`/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}`), (json) => readDeploy(json, "unknown"));
    },

    listDeploys,
  };
}
