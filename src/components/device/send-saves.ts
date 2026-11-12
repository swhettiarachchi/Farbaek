/**
 * Sends the saves waiting on this device, one at a time, oldest first
 * (ADR 0192). The network call is passed in, so this runs in tests as it
 * runs in the browser. It stops at the first sign that nothing else can get
 * through (offline, signed out); a refusal or a conflict only holds back its
 * own file.
 */
import { settle, type QueuedSave, type ServerFile } from "@/core/workspace/device-copy";

export type PostSave = (projectId: string, body: { owner: string; orgId: string; path: string; content: string; expectedRevision: number }) => Promise<{ status: number; body: unknown }>;

export type SendResult =
  /** On Farbaek as this revision; the copy moves to it. */
  | { kind: "saved"; save: QueuedSave; revision: number }
  /** Farbaek already had exactly these words. */
  | { kind: "same"; save: QueuedSave; revision: number }
  /** Changed or deleted on Farbaek since the edit began: the person chooses. */
  | { kind: "conflict"; save: QueuedSave; server: ServerFile }
  /** Farbaek said no, in its own words. The save stays here. */
  | { kind: "refused"; save: QueuedSave; message: string };

export type SendStop = { kind: "offline" } | { kind: "signed_out"; message: string } | { kind: "other_account"; message: string } | null;

const message = (body: unknown, fallback: string) =>
  body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string" ? (body as { message: string }).message : fallback;

function serverFile(body: unknown): ServerFile | null {
  const server = body && typeof body === "object" ? (body as { server?: unknown }).server : null;
  if (!server || typeof server !== "object") return null;
  const { revision, content } = server as { revision?: unknown; content?: unknown };
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) return null;
  if (content !== null && typeof content !== "string") return null;
  return { revision, content };
}

/**
 * One save, as the account that made it on this device, to the workspace its
 * copy came from, with the revision to expect (its own, or Farbaek's when
 * the person chose to keep theirs).
 */
export async function sendOne(post: PostSave, owner: string, save: QueuedSave, expectedRevision = save.baseRevision): Promise<SendResult | Exclude<SendStop, null>> {
  let answer: { status: number; body: unknown };
  try {
    answer = await post(save.projectId, { owner, orgId: save.orgId, path: save.path, content: save.content, expectedRevision });
  } catch {
    return { kind: "offline" };
  }
  const { status, body } = answer;
  if (status === 200) {
    const revision = body && typeof body === "object" ? (body as { revision?: unknown }).revision : null;
    if (typeof revision === "number" && Number.isInteger(revision) && revision > 0) return { kind: "saved", save, revision };
    return { kind: "refused", save, message: "Farbaek's answer couldn't be read. The change is still here; send it again." };
  }
  if (status === 401) return { kind: "signed_out", message: message(body, "Sign in to Farbaek again, then send your changes.") };
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : null;
  if (status === 409 && code === "OTHER_ACCOUNT") return { kind: "other_account", message: message(body, "These changes were saved on this device by another account.") };
  if (status === 409 && code === "FILE_CHANGED") {
    const server = serverFile(body);
    if (server) {
      const settled = settle(save, server);
      return settled.kind === "same" ? { kind: "same", save, revision: settled.revision } : { kind: "conflict", save, server };
    }
  }
  if (status >= 500 || status === 0) return { kind: "refused", save, message: message(body, "Farbaek couldn't take this change just now. It's still here; try again in a few minutes.") };
  return { kind: "refused", save, message: message(body, "Farbaek didn't take this change. It's still here, and you can share a copy of it.") };
}

/** Sends every save in order, reporting each result as it lands. */
export async function sendSaves(post: PostSave, owner: string, saves: readonly QueuedSave[], onResult: (r: SendResult) => Promise<void> | void): Promise<SendStop> {
  for (const save of saves) {
    const r = await sendOne(post, owner, save);
    if (r.kind === "offline" || r.kind === "signed_out" || r.kind === "other_account") return r;
    await onResult(r);
  }
  return null;
}

/** The browser's own network call to the device save route. */
export const fetchPost: PostSave = async (projectId, body) => {
  const res = await fetch(`/app/projects/${encodeURIComponent(projectId)}/device/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
