/**
 * What Office Space's Payments page shows (ADR 0100), read with the server
 * key: the products checkout charges for, and the latest webhook events
 * without their payloads (which hold customers' names and addresses).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export interface BillingProductRow {
  mode: "test" | "live";
  planId: string;
  productId: string;
  amountCents: number;
  currency: string;
  catalogVersion: string;
  createdAt: string;
}

export interface TopupProductRow {
  mode: "test" | "live";
  packCents: number;
  productId: string;
  catalogVersion: string;
  createdAt: string;
}

export interface WebhookEventRow {
  id: string;
  mode: "test" | "live";
  webhookId: string;
  type: string;
  status: "received" | "processing" | "processed" | "ignored" | "failed" | "dead";
  attempts: number;
  orgId: string | null;
  lastError: string | null;
  receivedAt: string;
  processedAt: string | null;
}

const Product = z.object({
  mode: z.enum(["test", "live"]),
  plan_id: z.string(),
  product_id: z.string(),
  amount_cents: z.number().int(),
  currency: z.string(),
  catalog_version: z.string(),
  created_at: z.string(),
});

const Event = z.object({
  id: z.string(),
  mode: z.enum(["test", "live"]),
  webhook_id: z.string(),
  type: z.string(),
  status: z.enum(["received", "processing", "processed", "ignored", "failed", "dead"]),
  attempts: z.number().int(),
  org_id: z.string().nullable(),
  last_error: z.string().nullable(),
  received_at: z.string(),
  processed_at: z.string().nullable(),
});

export async function readPaymentsPage(admin: SupabaseClient): Promise<{ products: BillingProductRow[]; topups: TopupProductRow[]; events: WebhookEventRow[] } | null> {
  const [products, topups, events] = await Promise.all([
    admin.from("billing_products").select("mode, plan_id, product_id, amount_cents, currency, catalog_version, created_at").eq("provider", "dodo").order("created_at", { ascending: false }),
    admin.from("billing_topup_products").select("mode, pack_cents, product_id, catalog_version, created_at").eq("provider", "dodo").order("created_at", { ascending: false }),
    admin
      .from("provider_webhook_events")
      .select("id, mode, webhook_id, type, status, attempts, org_id, last_error, received_at, processed_at")
      .eq("provider", "dodo")
      .order("received_at", { ascending: false })
      .limit(50),
  ]);
  if (products.error || events.error) return null;
  // Before migration v64 the top-up table doesn't exist; the rest of the page still works.
  const topupRows = topups.error ? [] : ((topups.data ?? []) as { mode: "test" | "live"; pack_cents: number; product_id: string; catalog_version: string; created_at: string }[]);
  return {
    products: z.array(Product).parse(products.data ?? []).map((p) => ({
      mode: p.mode,
      planId: p.plan_id,
      productId: p.product_id,
      amountCents: p.amount_cents,
      currency: p.currency,
      catalogVersion: p.catalog_version,
      createdAt: p.created_at,
    })),
    topups: topupRows.map((t) => ({ mode: t.mode, packCents: t.pack_cents, productId: t.product_id, catalogVersion: t.catalog_version, createdAt: t.created_at })),
    events: z.array(Event).parse(events.data ?? []).map((e) => ({
      id: e.id,
      mode: e.mode,
      webhookId: e.webhook_id,
      type: e.type,
      status: e.status,
      attempts: e.attempts,
      orgId: e.org_id,
      lastError: e.last_error,
      receivedAt: e.received_at,
      processedAt: e.processed_at,
    })),
  };
}
