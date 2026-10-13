import { z } from "zod";

/**
 * Public Supabase settings. The publishable key is designed to be used in
 * browsers; Row Level Security protects the data. The secret key is never
 * read here.
 */
const PublicConfig = z.object({
  url: z.url().refine((u) => u.startsWith("https://") || u.startsWith("http://localhost"), "Supabase URL must use https"),
  publishableKey: z.string().min(20),
});

export type SupabasePublicConfig = z.infer<typeof PublicConfig>;

export function readSupabaseConfig(): SupabasePublicConfig | null {
  const parsed = PublicConfig.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The public origin used in email links. Taken from configuration, never from
 * the request's Host header, so a forged host can't redirect sign-in links.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_SITE_URL must be set in production");
  return "http://localhost:3000";
}

/** Only same-site relative paths are allowed as post-sign-in destinations. */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
