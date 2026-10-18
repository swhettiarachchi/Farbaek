/**
 * The desktop agent's client for /api/v1/agent. The agent token is sent only
 * to the Farbaek server it was paired with, and only over HTTPS (plain HTTP
 * is allowed for localhost, for development). Responses are parsed with
 * Zod; anything unexpected is an error, never a partial result.
 */
import { z } from "zod";
import { IntentContractSchema } from "@/core/realityloop/contract";
import type { ProposedChange } from "@/core/realityloop/change-proposal";
import type { AgentMode } from "@/core/agent/modes";

export class FarbaekApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FarbaekApiError";
  }
}

/** The server's origin, or an error when tokens can't be sent to it safely. */
export function checkServerUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FarbaekApiError(0, "INVALID_SERVER", "Enter the Farbaek address, like https://farbaek.com.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new FarbaekApiError(0, "INVALID_SERVER", "Farbaek must be reached over HTTPS.");
  if (url.username || url.password) throw new FarbaekApiError(0, "INVALID_SERVER", "The address can't contain a user name or password.");
  return url.origin;
}

const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const Profile = z.object({
  agent: z.object({ id: z.string(), name: z.string() }),
  workspace: z.object({ id: z.string(), name: z.string() }),
  role: z.enum(["owner", "admin", "member", "viewer"]),
  canPropose: z.boolean(),
  sandbox: z.union([z.object({ mode: z.literal("sandboxed"), provider: z.string() }), z.object({ mode: z.literal("review_only"), reason: z.string() })]),
});
export type AgentProfile = z.infer<typeof Profile>;

const TaskSummary = z.object({ id: z.string(), title: z.string(), projectId: z.string(), projectName: z.string(), updatedAt: z.string() });
export type AgentTaskSummary = z.infer<typeof TaskSummary>;

const RemoteFile = z.object({ path: z.string(), revision: z.number().int(), sha256: z.string(), sizeBytes: z.number().int() });
const TaskDetail = z.object({
  task: z.object({ id: z.string(), title: z.string(), state: z.string(), version: z.number().int(), readyForChange: z.boolean() }),
  project: z.object({ id: z.string(), name: z.string(), archived: z.boolean() }),
  contract: z.object({ version: z.number().int(), sha256: z.string(), body: IntentContractSchema }).nullable(),
  files: z.array(RemoteFile),
});
export type AgentTaskDetail = z.infer<typeof TaskDetail>;

const FilePage = z.object({ files: z.array(z.object({ path: z.string(), revision: z.number().int(), sha256: z.string(), content: z.string() })), next: z.string().nullable(), total: z.number().int() });
export type SnapshotFile = z.infer<typeof FilePage>["files"][number];

const Paired = z.object({ token: z.string().regex(/^fa_[A-Za-z0-9_-]{43}$/), agentId: z.string(), workspace: z.object({ id: z.string(), name: z.string() }) });
const ProposalResult = z.object({
  proposalId: z.string(),
  status: z.enum(["pending", "blocked"]),
  violations: z.array(z.object({ kind: z.string(), detail: z.string() })),
  policy: z.object({ outcome: z.string(), findings: z.array(z.object({ rule: z.string(), outcome: z.string(), detail: z.string() })) }),
});
export type AgentProposalResult = z.infer<typeof ProposalResult>;

export interface ProposalSubmission {
  contractVersion: number;
  contractSha256: string;
  plan: { summary: string; steps: string[]; risks: string[]; checks: string[] };
  changes: Pick<ProposedChange, "path" | "kind" | "baseRevision" | "content" | "reason">[];
  notProposed: { path: string; reason: string }[];
  usage: { model: string; inputTokens: number; outputTokens: number };
  mode: AgentMode;
}

async function call<T>(doFetch: typeof fetch, url: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await doFetch(url, { ...init, redirect: "error", signal: init.signal ?? AbortSignal.timeout(60_000) });
  } catch {
    throw new FarbaekApiError(0, "NETWORK", "Couldn't reach Farbaek. Check the internet connection and the address.");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new FarbaekApiError(res.status, "BAD_RESPONSE", `Farbaek answered with something that isn't JSON (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    const err = ErrorBody.safeParse(body);
    throw err.success ? new FarbaekApiError(res.status, err.data.error.code, err.data.error.message) : new FarbaekApiError(res.status, "HTTP_ERROR", `Farbaek returned HTTP ${res.status}.`);
  }
  const parsed = z.object({ data: schema }).safeParse(body);
  if (!parsed.success) throw new FarbaekApiError(res.status, "BAD_RESPONSE", "Farbaek's answer didn't have the expected shape. The app may need an update.");
  return parsed.data.data;
}

export async function pairWithFarbaek(
  server: string,
  input: { code: string; name: string; platform: "windows" | "macos" | "linux"; appVersion?: string },
  doFetch: typeof fetch = fetch,
): Promise<z.infer<typeof Paired>> {
  const origin = checkServerUrl(server);
  return call(doFetch, `${origin}/api/v1/agent/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }, Paired);
}

export class FarbaekAgentClient {
  private readonly origin: string;

  constructor(
    server: string,
    private readonly token: string,
    private readonly doFetch: typeof fetch = fetch,
  ) {
    this.origin = checkServerUrl(server);
  }

  private get<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    return call(this.doFetch, `${this.origin}${path}`, { headers: { authorization: `Bearer ${this.token}` }, signal }, schema);
  }

  private post<T>(path: string, body: unknown, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    return call(this.doFetch, `${this.origin}${path}`, { method: "POST", headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal }, schema);
  }

  me(signal?: AbortSignal): Promise<AgentProfile> {
    return this.get("/api/v1/agent/me", Profile, signal);
  }

  tasks(signal?: AbortSignal): Promise<AgentTaskSummary[]> {
    return this.get("/api/v1/agent/tasks", z.array(TaskSummary), signal);
  }

  task(id: string, signal?: AbortSignal): Promise<AgentTaskDetail> {
    return this.get(`/api/v1/agent/tasks/${encodeURIComponent(id)}`, TaskDetail, signal);
  }

  /** Every file of the task's project, with content, page by page. */
  async snapshot(taskId: string, signal?: AbortSignal): Promise<SnapshotFile[]> {
    const out: SnapshotFile[] = [];
    let after: string | null = null;
    for (let pages = 0; pages < 1_000; pages += 1) {
      const query: string = after === null ? "" : `?after=${encodeURIComponent(after)}`;
      const page: z.infer<typeof FilePage> = await this.get(`/api/v1/agent/tasks/${encodeURIComponent(taskId)}/files${query}`, FilePage, signal);
      out.push(...page.files);
      if (page.next === null) return out;
      after = page.next;
    }
    throw new FarbaekApiError(0, "TOO_MANY_PAGES", "The project has more files than the agent can download.");
  }

  submitProposal(taskId: string, proposal: ProposalSubmission, signal?: AbortSignal): Promise<AgentProposalResult> {
    return this.post(`/api/v1/agent/tasks/${encodeURIComponent(taskId)}/proposals`, proposal, ProposalResult, signal);
  }

  async unpair(): Promise<void> {
    await this.post("/api/v1/agent/unpair", {}, z.null());
  }
}
