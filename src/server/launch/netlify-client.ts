/**
 * Netlify's API, as LaunchOS uses it (ADR 0093): who a personal access
 * token belongs to, finding or making a site by name, a deploy by file
 * digest (SHA-1 per path), uploading only the files Netlify asks for, and
 * reading the deploy's state. Only api.netlify.com is called, with a time
 * limit, and Netlify's errors come back as plain sentences that never
 * include the token. Endpoints and fields are from Netlify's API docs and
 * OpenAPI reference, read 2026-10-26.
 */
import { z } from "zod";
import { CONTACT } from "@/config/contact";

const API = "https://api.netlify.com";
const TIMEOUT_MS = 30_000;
const UPLOAD_TRIES = 3;

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type NetlifyErrorCode = "AUTH" | "PAYMENT" | "RATE_LIMITED" | "INVALID" | "UNAVAILABLE";
export type NetlifyResult<T> = { ok: true; value: T } | { ok: false; code: NetlifyErrorCode; message: string };

const ErrorBody = z.object({ message: z.string().optional() });
const UserBody = z.object({ id: z.string(), full_name: z.string().nullable().optional() });
const AccountsBody = z.array(z.object({ id: z.string(), name: z.string().nullable().optional(), slug: z.string() }));
const SiteBody = z.object({ id: z.string(), name: z.string(), admin_url: z.string().nullable().optional(), published_deploy: z.object({ id: z.string() }).nullable().optional() });
const DeployBody = z.object({ id: z.string(), site_id: z.string().nullable().optional(), state: z.string().optional(), required: z.array(z.string()).nullable().optional(), error_message: z.string().nullable().optional() });

export type NetlifySite = { id: string; name: string; adminUrl: string | null; publishedDeployId: string | null };
export type NetlifyDeploy = { id: string; siteId: string | null; state: string; required: string[]; errorMessage: string | null };

const clean = (text: string, token: string) => text.split(token).join("[token]").replace(/\s+/g, " ").trim().slice(0, 200);
const unavailable = <T>(message: string): NetlifyResult<T> => ({ ok: false, code: "UNAVAILABLE", message });

async function failure<T>(res: Response, token: string): Promise<NetlifyResult<T>> {
  let detail = "";
  try {
    const body = ErrorBody.safeParse(await res.json());
    if (body.success && body.data.message) detail = clean(body.data.message, token);
  } catch {
    // Not JSON: the status says enough.
  }
  if (res.status === 401) return { ok: false, code: "AUTH", message: "Netlify didn't accept the token. Connect again with a new personal access token." };
  if (res.status === 403) return { ok: false, code: "AUTH", message: "Netlify says this token can't do that, or can't reach that team. Connect again with a token that can." };
  if (res.status === 402) return { ok: false, code: "PAYMENT", message: "Netlify says this account needs to change its plan before it can do that. That's set in your Netlify account." };
  if (res.status === 429) return { ok: false, code: "RATE_LIMITED", message: "Netlify is limiting requests from this account right now. It allows three deploys a minute. Try again in a few minutes." };
  if (res.status >= 400 && res.status < 500) return { ok: false, code: "INVALID", message: detail ? `Netlify refused it: ${detail}` : `Netlify refused it (${res.status}).` };
  return unavailable("Netlify didn't answer properly. Try again in a few minutes.");
}

const readSite = (json: unknown): NetlifyResult<NetlifySite> => {
  const body = SiteBody.safeParse(json);
  if (!body.success) return unavailable("Netlify's answer about the site couldn't be read.");
  return { ok: true, value: { id: body.data.id, name: body.data.name, adminUrl: body.data.admin_url ?? null, publishedDeployId: body.data.published_deploy?.id ?? null } };
};

const readDeploy = (json: unknown): NetlifyResult<NetlifyDeploy> => {
  const body = DeployBody.safeParse(json);
  if (!body.success) return unavailable("Netlify's answer about the deploy couldn't be read.");
  const d = body.data;
  return { ok: true, value: { id: d.id, siteId: d.site_id ?? null, state: d.state ?? "new", required: d.required ?? [], errorMessage: d.error_message ?? null } };
};

/** A project path as Netlify's upload address takes it: each folder and file name escaped on its own. */
export const uploadPath = (path: string) => path.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");

/** `accountSlug` is a Netlify team; without one, sites go to the token owner's default team. */
export function createNetlifyClient(token: string, options: { accountSlug?: string | null; fetcher?: Fetcher } = {}) {
  const fetcher = options.fetcher ?? fetch;
  const slug = options.accountSlug ?? null;
  const url = (path: string, query: Record<string, string> = {}) => {
    const u = new URL(`/api/v1${path}`, API);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    return u.toString();
  };
  async function call(target: string, init: RequestInit): Promise<Response | NetlifyResult<never>> {
    try {
      return await fetcher(target, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Authorization: `Bearer ${token}`, "User-Agent": `Farbaek LaunchOS (${CONTACT.support})`, ...(init.headers ?? {}) },
      });
    } catch {
      return unavailable("Farbaek couldn't reach Netlify. Try again in a few minutes.");
    }
  }
  async function getJson<T>(target: string, read: (json: unknown) => NetlifyResult<T>, init: RequestInit = { method: "GET" }): Promise<NetlifyResult<T>> {
    const res = await call(target, init);
    if (!(res instanceof Response)) return res;
    if (!res.ok) return failure(res, token);
    return read(await res.json().catch(() => null));
  }

  return {
    /** Whose token this is (GET /user), and, for a team, that the token reaches it (GET /accounts). Never the email. */
    async whoami(): Promise<NetlifyResult<{ id: string; name: string }>> {
      const user = await getJson(url("/user"), (json) => {
        const b = UserBody.safeParse(json);
        return b.success ? { ok: true as const, value: b.data } : unavailable<z.infer<typeof UserBody>>("Netlify's answer about the account couldn't be read.");
      });
      if (!user.ok) return user;
      const accounts = await getJson(url("/accounts"), (json) => {
        const b = AccountsBody.safeParse(json);
        return b.success ? { ok: true as const, value: b.data } : unavailable<z.infer<typeof AccountsBody>>("Netlify's answer about the account's teams couldn't be read.");
      });
      if (!accounts.ok) return accounts;
      if (slug) {
        const team = accounts.value.find((a) => a.slug === slug);
        if (!team) return { ok: false, code: "INVALID", message: `This token can't reach a Netlify team called ${slug}. Check the team's slug in its Netlify settings.` };
        return { ok: true, value: { id: team.id, name: team.name?.trim() || team.slug } };
      }
      const name = user.value.full_name?.trim() || accounts.value[0]?.name?.trim() || accounts.value[0]?.slug || "Netlify account";
      return { ok: true, value: { id: user.value.id, name: name.slice(0, 200) } };
    },

    /** The site with exactly this name in the account, if it has one: GET /sites?name= (or the team's sites). */
    async findSite(name: string): Promise<NetlifyResult<NetlifySite | null>> {
      const target = slug ? url(`/${encodeURIComponent(slug)}/sites`, { name, per_page: "100" }) : url("/sites", { name, filter: "all", per_page: "100" });
      return getJson(target, (json) => {
        if (!Array.isArray(json)) return unavailable("Netlify's list of sites couldn't be read.");
        for (const item of json) {
          const site = readSite(item);
          if (site.ok && site.value.name === name) return site;
        }
        return { ok: true, value: null };
      });
    },

    /** A new site with this name: POST /sites (or the team's sites). */
    async createSite(name: string): Promise<NetlifyResult<NetlifySite>> {
      const res = await call(slug ? url(`/${encodeURIComponent(slug)}/sites`) : url("/sites"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!(res instanceof Response)) return res;
      if (res.status === 422) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, code: "INVALID", message: `Netlify refused the site name ${name}. Another Netlify account may already use it: choose another name.` };
      }
      if (!res.ok) return failure(res, token);
      return readSite(await res.json().catch(() => null));
    },

    /** A site, for which deploy it publishes: GET /sites/{id}. */
    getSite: (id: string) => getJson(url(`/sites/${encodeURIComponent(id)}`), readSite),

    /** A production deploy of these files, each named by its SHA-1: POST /sites/{id}/deploys. */
    createDeploy: (siteId: string, files: Record<string, string>, opts: { title: string; async: boolean }) =>
      getJson(url(`/sites/${encodeURIComponent(siteId)}/deploys`, { title: opts.title }), readDeploy, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, async: opts.async, draft: false }),
      }),

    /** A deploy's state: GET /deploys/{id}. */
    getDeploy: (id: string) => getJson(url(`/deploys/${encodeURIComponent(id)}`), readDeploy),

    /** One file Netlify asked for: PUT /deploys/{id}/files/{path}. Tried again if Netlify doesn't answer. */
    async uploadFile(deployId: string, path: string, content: Buffer): Promise<NetlifyResult<null>> {
      let last: NetlifyResult<null> = unavailable("Netlify didn't take the file.");
      for (let attempt = 0; attempt < UPLOAD_TRIES; attempt++) {
        const res = await call(url(`/deploys/${encodeURIComponent(deployId)}/files/${uploadPath(path)}`), {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream", "Content-Length": String(content.length) },
          body: new Uint8Array(content),
        });
        if (res instanceof Response) {
          if (res.ok) {
            await res.body?.cancel().catch(() => undefined);
            return { ok: true, value: null };
          }
          last = await failure(res, token);
        } else {
          last = res;
        }
        if (last.ok || last.code !== "UNAVAILABLE") return last;
      }
      return last;
    },
  };
}

export type NetlifyClient = ReturnType<typeof createNetlifyClient>;
