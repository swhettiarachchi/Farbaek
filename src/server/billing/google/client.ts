/**
 * The three Google Play Developer API calls Farbaek makes (ADR 0154): read a
 * subscription purchase (purchases.subscriptionsv2.get), acknowledge it
 * (purchases.subscriptions.acknowledge, which Google needs within 3 days or
 * it refunds the purchase), and list refunded or revoked subscriptions
 * (purchases.voidedpurchases, type 1), since Farbaek gets no push from Google.
 */
import type { GooglePlaySubscription } from "@/core/billing/google-play";

export class GooglePlayApiError extends Error {
  constructor(readonly status: number | null) {
    super(status === null ? "Google Play couldn't be reached." : `Google Play answered ${status}.`);
    this.name = "GooglePlayApiError";
  }
}

export interface VoidedPurchase {
  purchaseToken: string;
  orderId: string | null;
  voidedAt: Date;
}

export interface GooglePlayClient {
  /** The purchase, or null when Google doesn't know the token. */
  getSubscription(purchaseToken: string): Promise<GooglePlaySubscription | null>;
  acknowledge(productId: string, purchaseToken: string): Promise<void>;
  /** Subscriptions refunded or revoked since then; Google keeps 30 days. */
  voidedSince(since: Date): Promise<VoidedPurchase[]>;
}

const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

export function createGooglePlayClient(input: { packageName: string; accessToken: () => Promise<string>; fetcher?: typeof fetch }): GooglePlayClient {
  const fetcher = input.fetcher ?? fetch;
  const base = `${API}/${encodeURIComponent(input.packageName)}`;
  const call = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const token = await input.accessToken();
    try {
      return await fetcher(`${base}/${path}`, {
        ...init,
        headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GooglePlayApiError(null);
    }
  };
  return {
    async getSubscription(purchaseToken) {
      const res = await call(`purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
      // Google answers 400 or 404 (and 410 for an old one) for a token it doesn't know.
      if (res.status === 400 || res.status === 404 || res.status === 410) return null;
      if (!res.ok) throw new GooglePlayApiError(res.status);
      return (await res.json()) as GooglePlaySubscription;
    },
    async acknowledge(productId, purchaseToken) {
      const res = await call(`purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, { method: "POST", body: "{}" });
      if (!res.ok) throw new GooglePlayApiError(res.status);
    },
    async voidedSince(since) {
      const out: VoidedPurchase[] = [];
      let page: string | null = null;
      for (let i = 0; i < 5; i++) {
        const q = new URLSearchParams({ type: "1", startTime: String(since.getTime()), maxResults: "1000", ...(page ? { token: page } : {}) });
        const res = await call(`purchases/voidedpurchases?${q}`);
        if (!res.ok) throw new GooglePlayApiError(res.status);
        const body = (await res.json()) as { voidedPurchases?: { purchaseToken?: unknown; orderId?: unknown; voidedTimeMillis?: unknown }[]; tokenPagination?: { nextPageToken?: unknown } };
        for (const v of body.voidedPurchases ?? []) {
          if (typeof v.purchaseToken !== "string") continue;
          const at = Number(v.voidedTimeMillis);
          out.push({ purchaseToken: v.purchaseToken, orderId: typeof v.orderId === "string" ? v.orderId : null, voidedAt: new Date(Number.isFinite(at) ? at : Date.now()) });
        }
        page = typeof body.tokenPagination?.nextPageToken === "string" ? body.tokenPagination.nextPageToken : null;
        if (!page) break;
      }
      return out;
    },
  };
}
