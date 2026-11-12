/**
 * Fly.io's Machines API, as LaunchOS uses it to run a Node server: checking
 * that an organization token reaches its organization, finding or making an
 * app, giving it the public addresses <app>.fly.dev needs, and creating,
 * updating and watching one Machine that runs the project's files on Node 22.
 * Only api.machines.dev is called, with a time limit, never following
 * redirects, and Fly.io's errors come back as plain sentences that never
 * include the token. Endpoints and field names are from Fly.io's Machines API
 * OpenAPI (https://docs.fly.io/api/machines/openapi.json), read 2026-11-12.
 */
import { z } from "zod";
import { CONTACT } from "@/config/contact";

const API = "https://api.machines.dev";
const TIMEOUT_MS = 30_000;
/** How long one wait call asks Fly.io to hold the request open, in seconds (Fly.io's own maximum). */
const WAIT_SECONDS = 60;

/** Node 22 on Debian slim from Docker Hub's official library: the project's files are written on top of it. */
export const FLY_NODE_IMAGE = "registry-1.docker.io/library/node:22-slim";
/** Fly.io doesn't document a size limit for a Machine's config, so files are kept well under any likely one. */
export const FLY_FILES_LIMIT_BYTES = 512 * 1024;
/** At most this many files are written into a Machine. */
export const FLY_FILES_LIMIT_COUNT = 200;
const PORT = 8080;
/** Metadata on every Machine Farbaek makes, so they can be told apart from the organization's own. */
export const FLY_MACHINE_METADATA: Readonly<Record<string, string>> = Object.freeze({ farbaek: "launch" });
/**
 * A Fly.io token as the connect form takes it: an organization token from fly tokens create org
 * ("FlyV1 fm2_...,fm2_...", a few hundred to a few thousand characters) or a plain one. Printable ASCII, one line.
 */
export const FLY_TOKEN = /^(?:FlyV1 )?[\x21-\x7e]{20,4000}$/;

const APP_NAME = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;
const ORG_SLUG = /^[a-z0-9-]{1,63}$/;
const MACHINE_ID = /^[a-z0-9]{8,32}$/;

export type FlyResult<T> = { ok: true; value: T } | { ok: false; message: string };
export interface FlyMachine {
  id: string;
  state: string;
  region: string | null;
  /** The Machine config's metadata; {} when Fly.io's answer has none. */
  metadata: Record<string, string>;
}

export type FlyMachineConfig = {
  image: string;
  files: { guest_path: string; raw_value: string }[];
  init: { cmd: string[] };
  env: Record<string, string>;
  services: {
    protocol: "tcp";
    internal_port: number;
    ports: { port: number; handlers: string[]; force_https?: boolean }[];
  }[];
  guest: { cpu_kind: "shared"; cpus: number; memory_mb: number };
  restart: { policy: "always" };
  metadata: Record<string, string>;
};

export interface FlyClient {
  whoami(orgSlug: string): Promise<FlyResult<{ id: string; name: string }>>;
  getApp(name: string): Promise<FlyResult<{ name: string; orgSlug: string | null } | null>>;
  createApp(name: string, orgSlug: string): Promise<FlyResult<{ name: string }>>;
  ensurePublicIps(app: string): Promise<FlyResult<null>>;
  listMachines(app: string): Promise<FlyResult<FlyMachine[]>>;
  createMachine(app: string, config: FlyMachineConfig): Promise<FlyResult<FlyMachine>>;
  updateMachine(app: string, id: string, config: FlyMachineConfig): Promise<FlyResult<FlyMachine>>;
  waitStarted(app: string, id: string): Promise<FlyResult<boolean>>;
  getMachine(app: string, id: string): Promise<FlyResult<FlyMachine>>;
}

const ErrorBody = z.object({ error: z.string().nullable().optional(), status: z.unknown().optional() });
const AppsBody = z.object({ apps: z.array(z.unknown()).nullable().optional(), total_apps: z.number().optional() });
const AppBody = z.object({ name: z.string(), organization: z.object({ slug: z.string().nullable().optional() }).nullable().optional() });
const CreatedAppBody = z.object({ id: z.string().nullable().optional() });
const IpsBody = z.object({
  ips: z
    .array(
      z.object({
        ip: z.string().nullable().optional(),
        shared: z.boolean().nullable().optional(),
        egress: z.boolean().nullable().optional(),
        network: z.unknown().optional(),
      }),
    )
    .nullable()
    .optional(),
});
const ConfigMetadata = z.object({ metadata: z.record(z.string(), z.unknown()).nullable().optional() }).nullable().optional();
const MachineBody = z.object({
  id: z.string(),
  state: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  config: ConfigMetadata,
  // In place of config when the host can't be reached or a summary was asked for.
  incomplete_config: ConfigMetadata,
});
const WaitBody = z.object({ state: z.string().nullable().optional() });

const fail = <T>(message: string): FlyResult<T> => ({ ok: false, message });
const UNREACHABLE = "Farbaek couldn't reach Fly.io. Try again in a few minutes.";
const BAD_APP = "That isn't an app name Fly.io accepts. Use 2 to 63 lowercase letters, numbers and dashes, starting and ending with a letter or number.";
const BAD_ORG = "That isn't a Fly.io organization slug. Use the slug fly orgs list shows, such as personal.";
const BAD_MACHINE = "That isn't a Fly.io Machine id.";
const NO_ADDRESS = "Fly.io wouldn't give this app a public address. Check the organization's billing on Fly.io, then launch again.";

/** Every form the token could appear in (the whole value, and each macaroon in a FlyV1 token), longest first. */
const secretParts = (token: string) =>
  [token, ...token.split(/[\s,]+/)].filter((part) => part.length >= 8).sort((a, b) => b.length - a.length);

/** Provider text made safe to show: no token, no anything that looks like a Fly.io token, one line, 200 characters at most. */
function clean(text: string, token: string): string {
  let out = text;
  for (const part of secretParts(token)) out = out.split(part).join("[token]");
  return out
    .replace(/FlyV1\s+\S+/g, "[token]")
    .replace(/\bfm[12][ar]?_[A-Za-z0-9+/=_-]+/g, "[token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

async function readError(res: Response, token: string): Promise<{ detail: string; status: string | null }> {
  try {
    const body = ErrorBody.safeParse(await res.json());
    if (!body.success) return { detail: "", status: null };
    return { detail: body.data.error ? clean(body.data.error, token) : "", status: typeof body.data.status === "string" ? body.data.status : null };
  } catch {
    // Not JSON: the status says enough.
    return { detail: "", status: null };
  }
}

async function failure<T>(res: Response, token: string): Promise<FlyResult<T>> {
  const { detail, status } = await readError(res, token);
  if (res.status === 401) return fail("Fly.io didn't accept this token. Create an organization token with fly tokens create org, and connect again.");
  if (res.status === 403) return fail("Fly.io says this token can't do that, or can't reach that organization. Create an organization token with fly tokens create org, and connect again.");
  if (res.status === 402) return fail("Fly.io says this organization needs a payment method first. Add one in the organization's billing on Fly.io, then launch again.");
  if (res.status === 404) return fail("Fly.io couldn't find that app or Machine. It may have been deleted on Fly.io. Launch again to make a new one.");
  if (res.status === 429) return fail("Fly.io is limiting requests from this account right now. Try again in a few minutes.");
  if (status === "insufficient_capacity") return fail("Fly.io has no room for this Machine in that region right now. Try again in a few minutes.");
  if (res.status >= 400 && res.status < 500) return fail(detail ? `Fly.io refused it: ${detail}` : `Fly.io refused it (${res.status}).`);
  return fail("Fly.io didn't answer properly. Try again in a few minutes.");
}

const discard = async (res: Response) => {
  await res.body?.cancel().catch(() => undefined);
};

/** A Machine as Fly.io describes it, with only the string values of its config's metadata. */
const toMachine = (m: z.infer<typeof MachineBody>): FlyMachine => {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(m.config?.metadata ?? m.incomplete_config?.metadata ?? {})) {
    if (typeof value === "string") metadata[key] = value;
  }
  return { id: m.id, state: m.state ?? "created", region: m.region ?? null, metadata };
};

const readMachine = (json: unknown): FlyResult<FlyMachine> => {
  const body = MachineBody.safeParse(json);
  if (!body.success) return fail("Fly.io's answer about the Machine couldn't be read.");
  return { ok: true, value: toMachine(body.data) };
};

/** True for a public IPv6 address: not egress-only, not a private Flycast address (fdaa::/16, which has a network). */
const isPublicV6 = (ip: { ip?: string | null; egress?: boolean | null; network?: unknown }) =>
  !ip.egress && !!ip.ip?.includes(":") && !ip.network && !ip.ip.toLowerCase().startsWith("fdaa:");
/** True for an address that answers on IPv4: the shared address, or a dedicated v4 one. */
const isPublicV4 = (ip: { ip?: string | null; shared?: boolean | null; egress?: boolean | null }) =>
  !ip.egress && (!!ip.shared || !!ip.ip?.includes("."));

/** A project path that is safe to write under /app: relative, forward slashes, no empty, "." or ".." parts. */
function safeRelativePath(path: string): boolean {
  if (!path || path.length > 512) return false;
  if (path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) return false;
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/**
 * The Machine config that runs these files on Node 22: each file written at
 * /app/<path>, started with node /app/<entry>, listening on 8080 behind
 * Fly.io's TLS on 443 (and 80 redirected to it). Null when a path isn't a
 * safe relative one, the entry isn't among the files, there are more than
 * FLY_FILES_LIMIT_COUNT files, or they're larger than FLY_FILES_LIMIT_BYTES together.
 */
export function flyMachineConfig(input: { files: { path: string; bytes: Uint8Array }[]; entry: string }): FlyMachineConfig | null {
  const { files, entry } = input;
  if (files.length === 0 || files.length > FLY_FILES_LIMIT_COUNT) return null;
  if (!safeRelativePath(entry)) return null;
  const seen = new Set<string>();
  let total = 0;
  for (const file of files) {
    if (!safeRelativePath(file.path) || seen.has(file.path)) return null;
    seen.add(file.path);
    total += file.bytes.byteLength;
    if (total > FLY_FILES_LIMIT_BYTES) return null;
  }
  if (!seen.has(entry)) return null;
  return {
    image: FLY_NODE_IMAGE,
    files: files.map((file) => ({
      guest_path: `/app/${file.path}`,
      raw_value: Buffer.from(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength).toString("base64"),
    })),
    init: { cmd: ["node", `/app/${entry}`] },
    env: { PORT: String(PORT), NODE_ENV: "production" },
    services: [
      {
        protocol: "tcp",
        internal_port: PORT,
        ports: [
          { port: 443, handlers: ["tls", "http"] },
          { port: 80, handlers: ["http"], force_https: true },
        ],
      },
    ],
    guest: { cpu_kind: "shared", cpus: 1, memory_mb: 256 },
    restart: { policy: "always" },
    metadata: { ...FLY_MACHINE_METADATA },
  };
}

/** A Machine's state as LaunchOS shows it: started is ready, failed or destroyed is failed, anything else is still building. */
export function statusFromFlyMachine(state: string): "building" | "ready" | "failed" {
  if (state === "started") return "ready";
  if (state === "failed" || state === "destroyed") return "failed";
  return "building";
}

export function createFlyClient(token: string, options: { fetcher?: typeof fetch; timeoutMs?: number } = {}): FlyClient {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const url = (path: string, query: Record<string, string> = {}) => {
    const u = new URL(path, API);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    return u.toString();
  };
  const appPath = (app: string) => `/v1/apps/${encodeURIComponent(app)}`;
  // Fly.io's docs: tokens from fly tokens create start with "FlyV1 " and are sent as the whole header value.
  const authorization = token.startsWith("FlyV1 ") ? token : `Bearer ${token}`;

  async function call(target: string, init: RequestInit & { waitMs?: number } = {}): Promise<Response | FlyResult<never>> {
    const { waitMs, ...rest } = init;
    try {
      return await fetcher(target, {
        method: "GET",
        ...rest,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs + (waitMs ?? 0)),
        headers: {
          Authorization: authorization,
          Accept: "application/json",
          "User-Agent": `Farbaek (${CONTACT.support})`,
          ...(rest.body ? { "Content-Type": "application/json" } : {}),
        },
      });
    } catch {
      return fail(UNREACHABLE);
    }
  }
  const post = (target: string, body: unknown) => call(target, { method: "POST", body: JSON.stringify(body) });

  async function machine(res: Response | FlyResult<never>): Promise<FlyResult<FlyMachine>> {
    if (!(res instanceof Response)) return res;
    if (!res.ok) return failure(res, token);
    return readMachine(await res.json().catch(() => null));
  }

  return {
    /** That the token reaches this organization: GET /v1/apps?org_slug=. Fly.io has no "who am I" for organization tokens. */
    async whoami(orgSlug) {
      if (!ORG_SLUG.test(orgSlug)) return fail(BAD_ORG);
      const res = await call(url("/v1/apps", { org_slug: orgSlug, limit: "1" }));
      if (!(res instanceof Response)) return res;
      if (res.status === 404) {
        await discard(res);
        return fail(`This token can't reach a Fly.io organization called ${orgSlug}. Check the slug with fly orgs list, and connect again.`);
      }
      if (!res.ok) return failure(res, token);
      const body = AppsBody.safeParse(await res.json().catch(() => null));
      if (!body.success) return fail("Fly.io's list of apps couldn't be read.");
      return { ok: true, value: { id: orgSlug, name: orgSlug } };
    },

    /** The app with this name, if this token can see it: GET /v1/apps/{app}. Null when Fly.io says there's none. */
    async getApp(name) {
      if (!APP_NAME.test(name)) return fail(BAD_APP);
      const res = await call(url(appPath(name)));
      if (!(res instanceof Response)) return res;
      if (res.status === 404) {
        await discard(res);
        return { ok: true, value: null };
      }
      if (!res.ok) return failure(res, token);
      const body = AppBody.safeParse(await res.json().catch(() => null));
      if (!body.success) return fail("Fly.io's answer about the app couldn't be read.");
      return { ok: true, value: { name: body.data.name, orgSlug: body.data.organization?.slug ?? null } };
    },

    /** A new app in the organization: POST /v1/apps with CreateAppRequest's name and org_slug. */
    async createApp(name, orgSlug) {
      if (!APP_NAME.test(name)) return fail(BAD_APP);
      if (!ORG_SLUG.test(orgSlug)) return fail(BAD_ORG);
      const res = await post(url("/v1/apps"), { name, org_slug: orgSlug });
      if (!(res instanceof Response)) return res;
      if (res.status === 422) {
        const { detail, status } = await readError(res, token);
        if (status === "name_taken" || /taken/i.test(detail)) return fail(`Another Fly.io account already uses the app name ${name}. Choose another name.`);
        return fail(detail ? `Fly.io refused the app: ${detail}` : "Fly.io refused the app name. Choose another name.");
      }
      if (!res.ok) return failure(res, token);
      const body = CreatedAppBody.safeParse(await res.json().catch(() => null));
      return { ok: true, value: { name: body.success && body.data.id ? body.data.id : name } };
    },

    /** A shared IPv4 and a public IPv6 address, each only when the app has none yet: GET then POST /v1/apps/{app}/ip_assignments. */
    async ensurePublicIps(app) {
      if (!APP_NAME.test(app)) return fail(BAD_APP);
      const res = await call(url(`${appPath(app)}/ip_assignments`));
      if (!(res instanceof Response)) return res;
      if (!res.ok) return failure(res, token);
      const body = IpsBody.safeParse(await res.json().catch(() => null));
      if (!body.success) return fail("Fly.io's list of the app's addresses couldn't be read.");
      const ips = body.data.ips ?? [];
      const missing: ("shared_v4" | "v6")[] = [];
      if (!ips.some(isPublicV4)) missing.push("shared_v4");
      if (!ips.some(isPublicV6)) missing.push("v6");
      for (const type of missing) {
        const assigned = await post(url(`${appPath(app)}/ip_assignments`), { type });
        if (!(assigned instanceof Response)) return assigned;
        if (assigned.status === 422) {
          await discard(assigned);
          return fail(NO_ADDRESS);
        }
        if (!assigned.ok) return failure(assigned, token);
        await discard(assigned);
      }
      return { ok: true, value: null };
    },

    /** The app's Machines: GET /v1/apps/{app}/machines. */
    async listMachines(app) {
      if (!APP_NAME.test(app)) return fail(BAD_APP);
      const res = await call(url(`${appPath(app)}/machines`));
      if (!(res instanceof Response)) return res;
      if (!res.ok) return failure(res, token);
      const body = z.array(MachineBody).safeParse(await res.json().catch(() => null));
      if (!body.success) return fail("Fly.io's list of Machines couldn't be read.");
      return { ok: true, value: body.data.map(toMachine) };
    },

    /** A new Machine with this config, started straight away: POST /v1/apps/{app}/machines. */
    async createMachine(app, config) {
      if (!APP_NAME.test(app)) return fail(BAD_APP);
      return machine(await post(url(`${appPath(app)}/machines`), { config }));
    },

    /** The Machine's config replaced with this one, which restarts it: POST /v1/apps/{app}/machines/{id}. */
    async updateMachine(app, id, config) {
      if (!APP_NAME.test(app)) return fail(BAD_APP);
      if (!MACHINE_ID.test(id)) return fail(BAD_MACHINE);
      return machine(await post(url(`${appPath(app)}/machines/${id}`), { config }));
    },

    /** True once the Machine is started; false when it isn't within a minute (Fly.io answers 408). GET .../wait?state=started&timeout=60. */
    async waitStarted(app, id) {
      if (!APP_NAME.test(app)) return fail(BAD_APP);
      if (!MACHINE_ID.test(id)) return fail(BAD_MACHINE);
      const res = await call(url(`${appPath(app)}/machines/${id}/wait`, { state: "started", timeout: String(WAIT_SECONDS) }), { waitMs: WAIT_SECONDS * 1000 });
      if (!(res instanceof Response)) return res;
      if (res.status === 408) {
        await discard(res);
        return { ok: true, value: false };
      }
      if (!res.ok) return failure(res, token);
      const body = WaitBody.safeParse(await res.json().catch(() => null));
      return { ok: true, value: !body.success || !body.data.state || body.data.state === "started" };
    },

    /** One Machine: GET /v1/apps/{app}/machines/{id}. */
    async getMachine(app, id) {
      if (!APP_NAME.test(app)) return fail(BAD_APP);
      if (!MACHINE_ID.test(id)) return fail(BAD_MACHINE);
      return machine(await call(url(`${appPath(app)}/machines/${id}`)));
    },
  };
}
