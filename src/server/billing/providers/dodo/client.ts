/**
 * Dodo Payments over its REST API (ADR 0100), shapes verified against
 * docs.dodopayments.com on 2026-10-27. The only place Farbaek talks to Dodo.
 * Responses are parsed before use, errors become codes, and nothing here ever
 * logs or returns the API key.
 */
import { z } from "zod";
import { PROVIDER_STATUSES, type CheckoutInput, type NormalizedSubscription, type PaymentProvider, type PlanChangeTiming, type ProviderErrorCode, type ProviderMode, type ProviderResult } from "@/core/billing/provider";

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export const DODO_TIMEOUT_MS = 15_000;

const Subscription = z.object({
  subscription_id: z.string().min(1).max(200),
  status: z.enum(PROVIDER_STATUSES),
  product_id: z.string().min(1).max(200),
  created_at: z.string(),
  next_billing_date: z.string().nullable().optional(),
  cancel_at_next_billing_date: z.boolean().optional(),
  customer: z.object({ customer_id: z.string().min(1).max(200) }),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const Checkout = z.object({ session_id: z.string().min(1).max(200), checkout_url: z.string().url().nullable().optional() });
const Portal = z.object({ link: z.string().url() });
const Product = z.object({ product_id: z.string().min(1).max(200) });
const ProductPrice = z.object({
  product_id: z.string(),
  is_recurring: z.boolean(),
  price: z.object({ price: z.number().int(), currency: z.string(), trial_period_days: z.number().int().nullable().optional() }).passthrough(),
});
const Preview = z.object({ immediate_charge: z.object({ summary: z.object({ total_amount: z.number().int(), currency: z.string() }).passthrough() }).passthrough() });

const date = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

export function normalizeSubscription(raw: unknown): NormalizedSubscription | null {
  const parsed = Subscription.safeParse(raw);
  if (!parsed.success) return null;
  const s = parsed.data;
  const created = date(s.created_at);
  if (!created) return null;
  const org = s.metadata?.farbaek_org;
  return {
    provider: "dodo",
    id: s.subscription_id,
    customerId: s.customer.customer_id,
    productId: s.product_id,
    status: s.status,
    cancelAtPeriodEnd: s.cancel_at_next_billing_date === true,
    nextBillingDate: date(s.next_billing_date),
    createdAt: created,
    orgId: typeof org === "string" && org.length === 36 ? org : null,
  };
}

function codeFor(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 400 || status === 422) return "REJECTED";
  return "UNAVAILABLE";
}

const ID = /^[A-Za-z0-9_-]{1,200}$/;

export function createDodoClient(opts: { apiKey: string; baseUrl: string; mode: ProviderMode; fetch?: Fetch }): PaymentProvider {
  const doFetch: Fetch = opts.fetch ?? ((input, init) => fetch(input, init));

  async function call<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<ProviderResult<T>> {
    let res: Response;
    try {
      res = await doFetch(`${opts.baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${opts.apiKey}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(DODO_TIMEOUT_MS),
        redirect: "error",
        cache: "no-store",
      });
    } catch {
      return { ok: false, code: "UNAVAILABLE" };
    }
    if (!res.ok) return { ok: false, code: codeFor(res.status), status: res.status };
    let json: unknown = null;
    try {
      const text = await res.text();
      json = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, code: "BAD_RESPONSE", status: res.status };
    }
    const parsed = schema.safeParse(json);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, code: "BAD_RESPONSE", status: res.status };
  }

  const subscriptionPath = (id: string) => (ID.test(id) ? `/subscriptions/${id}` : null);

  async function subscription(method: "GET" | "PATCH", id: string, body?: unknown): Promise<ProviderResult<NormalizedSubscription>> {
    const path = subscriptionPath(id);
    if (!path) return { ok: false, code: "REJECTED" };
    const r = await call(method, path, z.unknown(), body);
    if (!r.ok) return r;
    const sub = normalizeSubscription(r.value);
    return sub ? { ok: true, value: sub } : { ok: false, code: "BAD_RESPONSE" };
  }

  function planChangeBody(productId: string, timing: PlanChangeTiming) {
    // Upgrades charge the prorated difference now and wait for the payment; downgrades wait for the period's end and bill nothing extra.
    return timing === "now"
      ? { product_id: productId, quantity: 1, proration_billing_mode: "prorated_immediately", effective_at: "immediately", on_payment_failure: "prevent_change" }
      : { product_id: productId, quantity: 1, proration_billing_mode: "do_not_bill", effective_at: "next_billing_date" };
  }

  return {
    id: "dodo",
    mode: opts.mode,

    async createCheckoutSession(input: CheckoutInput) {
      // No subscription_data and no trial days: Farbaek's trial is its own, never the provider's (spec §15).
      const body = {
        product_cart: [{ product_id: input.productId, quantity: 1 }],
        customer: { email: input.customer.email, ...(input.customer.name ? { name: input.customer.name } : {}) },
        return_url: input.returnUrl,
        metadata: { farbaek_org: input.orgId, farbaek_plan: input.planId },
      };
      // People agree to a price in US dollars, so checkout charges in US dollars. Dodo accepts a fixed currency only
      // while adaptive pricing is on (otherwise it charges the product's own currency, also USD), so a refusal retries without it.
      let r = await call("POST", "/checkouts", Checkout, { ...body, billing_currency: "USD", feature_flags: { allow_currency_selection: false } });
      if (!r.ok && r.code === "REJECTED") r = await call("POST", "/checkouts", Checkout, body);
      if (!r.ok) return r;
      return r.value.checkout_url ? { ok: true, value: { url: r.value.checkout_url, sessionId: r.value.session_id } } : { ok: false, code: "BAD_RESPONSE" };
    },

    async createPortalSession(customerId, returnUrl) {
      if (!ID.test(customerId)) return { ok: false, code: "REJECTED" };
      const r = await call("POST", `/customers/${customerId}/customer-portal/session?return_url=${encodeURIComponent(returnUrl)}`, Portal);
      return r.ok ? { ok: true, value: { url: r.value.link } } : r;
    },

    setCancelAtPeriodEnd: (id, cancel) => subscription("PATCH", id, { cancel_at_next_billing_date: cancel }),

    async previewPlanChange(id, productId) {
      const path = subscriptionPath(id);
      if (!path) return { ok: false, code: "REJECTED" };
      const r = await call("POST", `${path}/change-plan/preview`, Preview, planChangeBody(productId, "now"));
      if (!r.ok) return r;
      return { ok: true, value: { amountCents: r.value.immediate_charge.summary.total_amount, currency: r.value.immediate_charge.summary.currency } };
    },

    async changePlan(id, productId, timing) {
      const path = subscriptionPath(id);
      if (!path) return { ok: false, code: "REJECTED" };
      const r = await call("POST", `${path}/change-plan`, z.unknown(), planChangeBody(productId, timing));
      return r.ok ? { ok: true, value: undefined } : r;
    },

    getSubscription: (id) => subscription("GET", id),

    async createProduct(input) {
      // Twenty years with monthly charges is Dodo's documented setting for "renews until cancelled".
      const r = await call("POST", "/products", Product, {
        name: input.name,
        description: input.description,
        tax_category: "saas",
        price: {
          type: "recurring_price",
          price: input.amountCents,
          currency: input.currency,
          payment_frequency_count: 1,
          payment_frequency_interval: "Month",
          subscription_period_count: 20,
          subscription_period_interval: "Year",
          tax_inclusive: false,
          trial_period_days: 0,
        },
        metadata: { farbaek_plan: input.planId },
      });
      return r.ok ? { ok: true, value: { productId: r.value.product_id } } : r;
    },

    async getProductPrice(productId) {
      if (!ID.test(productId)) return { ok: false, code: "REJECTED" };
      const r = await call("GET", `/products/${productId}`, ProductPrice);
      if (!r.ok) return r;
      return { ok: true, value: { amountCents: r.value.price.price, currency: r.value.price.currency, recurring: r.value.is_recurring, trialDays: r.value.price.trial_period_days ?? 0 } };
    },
  };
}
