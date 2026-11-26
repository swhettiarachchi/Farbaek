import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { LINK_MIN_SECONDS, LINK_SECRET_PATTERN, LINK_SECRET_PREFIX, cleanPayload, type LinkFired } from "@/core/automation/links";
import type { Person, StoreResult } from "./store";

/**
 * A task's link (stage 277, ADR 0284): made and stopped by its owner, and called by another app. The secret is made here, given
 * back once to the person who asked for it, and kept nowhere: the database holds its hash. A call's secret is hashed here and the
 * hash compared in the database, so nothing that is stored can start a run.
 */

const refusal = (error: { message?: string; code?: string }): { ok: false; code: string } => {
  const word = /^[A-Z_]{3,40}$/.exec((error.message ?? "").trim())?.[0];
  return { ok: false, code: word ?? (error.code === "42501" ? "FORBIDDEN" : "UNAVAILABLE") };
};

/** The hash of a secret, as the database keeps it. */
export const hashLinkSecret = (secret: string): string => createHash("sha256").update(secret).digest("hex");

/** A new secret: the prefix and 32 random bytes. */
export const newLinkSecret = (): string => `${LINK_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;

/** Makes the task's link, stopping the one it had. The secret in the answer is the only copy there will ever be. */
export async function createLink(admin: SupabaseClient, who: Person, taskId: string, waitSeconds: number, secret: string = newLinkSecret()): Promise<StoreResult<{ id: string; secret: string }>> {
  const { data, error } = await admin.rpc("app_scheduled_link_create", { p_org: who.orgId, p_actor: who.userId, p_task: taskId, p_secret_hash: hashLinkSecret(secret), p_min_seconds: waitSeconds });
  if (error) return refusal(error);
  const id = z.uuid().safeParse(data);
  return id.success ? { ok: true, value: { id: id.data, secret } } : { ok: false, code: "UNAVAILABLE" };
}

/** Stops the task's link. True when there was one to stop. */
export async function revokeLink(admin: SupabaseClient, who: Person, taskId: string): Promise<StoreResult<boolean>> {
  const { data, error } = await admin.rpc("app_scheduled_link_revoke", { p_org: who.orgId, p_actor: who.userId, p_task: taskId });
  return error ? refusal(error) : { ok: true, value: data === true };
}

const fired = z.enum(["queued", "unknown", "too_soon", "busy", "off"]);

/**
 * A call to a link. A secret that isn't shaped as Farbaek makes them is refused here, without asking the database. "error" when
 * the database couldn't be asked: the caller is told to try again, never that the link is wrong.
 */
export async function fireLink(admin: SupabaseClient, linkId: string, secret: string, body: string | null): Promise<LinkFired | "error"> {
  if (!z.uuid().safeParse(linkId).success || !LINK_SECRET_PATTERN.test(secret)) return "unknown";
  const { data, error } = await admin.rpc("app_scheduled_link_fire", { p_link: linkId, p_secret_hash: hashLinkSecret(secret), p_payload: cleanPayload(body), p_min_seconds: LINK_MIN_SECONDS });
  if (error) return "error";
  const answer = fired.safeParse(data);
  return answer.success ? answer.data : "error";
}

/**
 * What a page is given of its tasks' links: each task's live link by the task's id; "off" when the database has none to offer
 * (before v109), and the page then shows nothing about links; null when they couldn't be read, and the page says so and offers
 * nothing that would stop a link nobody can see.
 */
export type PageLinks = Record<string, TaskLink> | "off" | null;

/** The links for a page, read as the person. The demo has none, and its controls say why they are off. */
export async function pageLinks(client: SupabaseClient | null, orgId: string, demo: boolean): Promise<PageLinks> {
  if (demo) return {};
  if (!client) return "off";
  const links = await listLinks(client, orgId);
  return links instanceof Map ? Object.fromEntries(links) : links;
}

/** A link as its owner sees it: when it was made and used. Never its secret, which isn't kept, nor its hash. */
export interface TaskLink {
  id: string;
  taskId: string;
  createdAt: string;
  lastUsedAt: string | null;
  uses: number;
  /** The least time between two runs it starts, in seconds: its plan's when it was made. */
  waitSeconds: number;
}

const linkRow = z.object({ id: z.uuid(), task_id: z.uuid(), created_at: z.string(), last_used_at: z.string().nullable(), uses: z.number().int(), min_seconds: z.number().int() });

/**
 * The person's live links in this workspace, by task, read as them. Null when they couldn't be read, which a page says as that.
 * "off" for a database that doesn't have links yet (before v109): a page then offers none, since making one couldn't work.
 */
export async function listLinks(client: SupabaseClient, orgId: string): Promise<Map<string, TaskLink> | "off" | null> {
  const { data, error } = await client.from("scheduled_task_links").select("id, task_id, created_at, last_used_at, uses, min_seconds").eq("org_id", orgId).is("revoked_at", null).limit(300);
  if (error) return error.code === "PGRST205" || error.code === "42P01" ? "off" : null;
  const rows = z.array(linkRow).safeParse(data ?? []);
  if (!rows.success) return null;
  return new Map(rows.data.map((r) => [r.task_id, { id: r.id, taskId: r.task_id, createdAt: r.created_at, lastUsedAt: r.last_used_at, uses: r.uses, waitSeconds: Math.max(r.min_seconds, LINK_MIN_SECONDS) }]));
}
