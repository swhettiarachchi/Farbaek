/**
 * Vercel's REST API, as LaunchOS uses it (ADR 0078): who a token belongs to,
 * uploading files by SHA-1, creating a production deployment from them, and
 * reading its state. Only api.vercel.com is called, with a time limit, and
 * Vercel's errors come back as plain sentences that never include the token.
 * Endpoints and fields are from Vercel's REST reference, read 2026-10-25.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { VercelSettings } from "@/core/launch/vercel";

const API = "https://api.vercel.com";
const TIMEOUT_MS = 30_000;

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type VercelErrorCode = "AUTH" | "PAYMENT" | "RATE_LIMITED" | "INVALID" | "UNAVAILABLE";
export type VercelResult<T> = { ok: true; value: T } | { ok: false; code: VercelErrorCode; message: string };

const ErrorBody = z.object({ error: z.object({ code: z.string().optional(), message: z.string().optional() }) });
const UserBody = z.object({ user: z.object({ id: z.string(), username: z.string() }) });
const DeploymentBody = z.object({
  id: z.string(),
  url: z.string().nullable().optional(),
  inspectorUrl: z.string().nullable().optional(),
  readyState: z.string().optional(),
  errorMessage: z.string().nullable().optional(),
  alias: z.array(z.string()).optional(),
});
/** `aliases` holds the production name (<project>.vercel.app) once Vercel assigns it; the unique `url` may sit behind Vercel's sign-in. */
export type VercelDeployment = { id: string; url: string | null; inspectorUrl: string | null; readyState: string; errorMessage: string | null; aliases: string[] };

const clean = (text: string, token: string) => text.split(token).join("[token]").replace(/\s+/g, " ").trim().slice(0, 200);

async function failure<T>(res: Response, token: string): Promise<VercelResult<T>> {
  let detail = "";
  try {
    const body = ErrorBody.safeParse(await res.json());
    if (body.success && body.data.error.message) detail = clean(body.data.error.message, token);
  } catch {
    // Not JSON: the status says enough.
  }
  if (res.status === 401 || res.status === 403) return { ok: false, code: "AUTH", message: "Vercel didn't accept the token, or it can't reach that team. Connect again with a new token." };
  if (res.status === 402) return { ok: false, code: "PAYMENT", message: "Vercel says this account needs a payment method before it can deploy. That's set in your Vercel account." };
  if (res.status === 429) return { ok: false, code: "RATE_LIMITED", message: "Vercel is limiting requests from this account right now. Try again in a few minutes." };
  if (res.status >= 400 && res.status < 500) return { ok: false, code: "INVALID", message: detail ? `Vercel refused it: ${detail}` : `Vercel refused it (${res.status}).` };
  return { ok: false, code: "UNAVAILABLE", message: "Vercel didn't answer properly. Try again in a few minutes." };
}

export function createVercelClient(token: string, options: { teamId?: string | null; fetcher?: Fetcher } = {}) {
  const fetcher = options.fetcher ?? fetch;
  const url = (path: string, query: Record<string, string> = {}) => {
    const u = new URL(path, API);
    if (options.teamId) u.searchParams.set("teamId", options.teamId);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    return u.toString();
  };
  async function call(target: string, init: RequestInit): Promise<Response | VercelResult<never>> {
    try {
      return await fetcher(target, { ...init, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
    } catch {
      return { ok: false, code: "UNAVAILABLE", message: "Farbaek couldn't reach Vercel. Try again in a few minutes." };
    }
  }

  return {
    /** Whose token this is: GET /v2/user. */
    async whoami(): Promise<VercelResult<{ id: string; username: string }>> {
      const res = await call(url("/v2/user"), { method: "GET" });
      if (!(res instanceof Response)) return res;
      if (!res.ok) return failure(res, token);
      const body = UserBody.safeParse(await res.json().catch(() => null));
      return body.success ? { ok: true, value: body.data.user } : { ok: false, code: "UNAVAILABLE", message: "Vercel's answer about the account couldn't be read." };
    },

    /** One file's bytes, named by their SHA-1: POST /v2/files. */
    async uploadFile(content: Buffer): Promise<VercelResult<{ sha: string; size: number }>> {
      const sha = createHash("sha1").update(content).digest("hex");
      const res = await call(url("/v2/files"), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "x-vercel-digest": sha, "Content-Length": String(content.length) },
        body: new Uint8Array(content),
      });
      if (!(res instanceof Response)) return res;
      await res.body?.cancel().catch(() => undefined);
      return res.ok ? { ok: true, value: { sha, size: content.length } } : failure(res, token);
    },

    /** A production deployment of uploaded files: POST /v13/deployments. */
    async createDeployment(input: { name: string; files: { file: string; sha: string; size: number }[]; settings: VercelSettings }): Promise<VercelResult<VercelDeployment>> {
      const projectSettings: Record<string, string | null> = { framework: input.settings.framework };
      if (input.settings.buildCommand) projectSettings.buildCommand = input.settings.buildCommand;
      if (input.settings.outputDirectory) projectSettings.outputDirectory = input.settings.outputDirectory;
      const res = await call(url("/v13/deployments", { skipAutoDetectionConfirmation: "1" }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.name, files: input.files, target: "production", projectSettings }),
      });
      if (!(res instanceof Response)) return res;
      if (!res.ok) return failure(res, token);
      return readDeployment(await res.json().catch(() => null));
    },

    /** A deployment's state: GET /v13/deployments/{id}. */
    async getDeployment(id: string): Promise<VercelResult<VercelDeployment>> {
      const res = await call(url(`/v13/deployments/${encodeURIComponent(id)}`), { method: "GET" });
      if (!(res instanceof Response)) return res;
      if (!res.ok) return failure(res, token);
      return readDeployment(await res.json().catch(() => null));
    },
  };
}

function readDeployment(json: unknown): VercelResult<VercelDeployment> {
  const body = DeploymentBody.safeParse(json);
  if (!body.success) return { ok: false, code: "UNAVAILABLE", message: "Vercel's answer about the deployment couldn't be read." };
  const d = body.data;
  return { ok: true, value: { id: d.id, url: d.url ?? null, inspectorUrl: d.inspectorUrl ?? null, readyState: d.readyState ?? "QUEUED", errorMessage: d.errorMessage ?? null, aliases: d.alias ?? [] } };
}

export type VercelClient = ReturnType<typeof createVercelClient>;
