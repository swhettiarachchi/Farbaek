/**
 * Opening a read-only link (ADR 0188): a per-address limit, then the link's
 * state from the database, which checks it again on every call. Nothing here
 * trusts the token beyond its hash lookup.
 */
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { openShareLink, openSharedFile, openSharedFiles, type ShareLookup } from "./sharing";
import { createSupabaseSharingDeps } from "./sharing-wiring";

/** Opens per network address an hour: plenty to read a project, too few to scrape many links. */
export const SHARE_VIEWS_PER_HOUR = 600;
export const SHARE_DOWNLOADS_PER_HOUR = 10;

export type ShareOpen = { kind: "ok"; lookup: ShareLookup } | { kind: "limited" } | { kind: "unavailable" };

async function addressKey(kind: string): Promise<string> {
  const h = await headers();
  const address = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  return `share-${kind}:${createHash("sha256").update(`share-${kind}:${address}`).digest("hex").slice(0, 32)}`;
}

/** Counts one open against the address's limit; fails closed when the limiter can't answer. */
export async function countShareOpen(kind: "view" | "download"): Promise<"ok" | "limited" | "unavailable"> {
  const admin = createSupabaseAdminClient();
  if (!admin) return "unavailable";
  const limit = kind === "view" ? SHARE_VIEWS_PER_HOUR : SHARE_DOWNLOADS_PER_HOUR;
  const r = await admin.rpc("app_rate_limit", { p_key: await addressKey(kind), p_window_seconds: 3600, p_limit: limit });
  if (r.error) return "unavailable";
  return r.data === true ? "ok" : "limited";
}

export async function openShare(token: string, kind: "view" | "download" = "view"): Promise<ShareOpen> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { kind: "unavailable" };
  const counted = await countShareOpen(kind);
  if (counted !== "ok") return { kind: counted };
  return { kind: "ok", lookup: await openShareLink(createSupabaseSharingDeps(admin), token) };
}

export async function readSharedFile(token: string, path: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  return openSharedFile(createSupabaseSharingDeps(admin), token, path);
}

export async function readSharedFiles(token: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  return openSharedFiles(createSupabaseSharingDeps(admin), token);
}
