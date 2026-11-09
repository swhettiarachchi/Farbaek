/**
 * Sandbox settings from the server environment. Values are read here and
 * nowhere else; secrets are only ever passed to the runtime SDK, never to a
 * sandbox and never to a browser. See .env.example and docs/sandbox/.
 */
import { defaultImageName, SIZE_IDS, TEMPLATE_IDS, type SizeId, type TemplateId } from "@/core/sandbox/templates";

export type SandboxProviderId = "e2b" | "vercel";

export interface SandboxServerConfig {
  provider: SandboxProviderId | null;
  /** Set but unknown provider names are reported, not guessed at. */
  unknownProvider: string | null;
  e2b: { apiKey: string | null; domain: string | null; apiUrl: string | null; previewProtocol: "http" | "https" };
  /**
   * Vercel Sandbox (ADR 0016). An access token with the team and project it
   * belongs to, or, when Farbaek itself runs on Vercel, the platform's OIDC
   * token (read by the SDK, never by Farbaek).
   */
  vercel: { token: string | null; teamId: string | null; projectId: string | null; oidc: boolean; region: string | null };
  /** ISO date when the isolation smoke test passed on this deployment, or null. */
  isolationVerifiedAt: string | null;
  /** The runtime's own ceiling for one session (E2B: 60 minutes on Hobby; Vercel Sandbox: 45 minutes on Hobby; both 24 hours on Pro). */
  runtimeMaxSessionMinutes: number;
  images: Record<TemplateId, Record<SizeId, string>>;
  preview: { domain: string | null; secret: string | null; protocol: "http" | "https" };
  cronSecret: string | null;
  /** Labels this deployment's sandboxes, so cleanup never touches another environment's. */
  deploymentId: string;
  /** The Egress Ledger's proxy (ADR 0127); on unless SANDBOX_EGRESS_LEDGER is "off". */
  egressLedger?: boolean;
}

function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

const IMAGE_ENV: Record<TemplateId, string> = { "node-ts": "NODE", python: "PYTHON" };

export function readSandboxConfig(): SandboxServerConfig {
  const raw = (env("SANDBOX_PROVIDER") ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  const provider: SandboxProviderId | null = raw === "e2b" || raw === "vercel" ? raw : null;
  const apiUrl = env("E2B_API_URL");
  const defaultMinutes = provider === "vercel" ? 45 : 60;
  const minutes = Number(env("SANDBOX_RUNTIME_MAX_SESSION_MINUTES") ?? String(defaultMinutes));

  const images = {} as Record<TemplateId, Record<SizeId, string>>;
  for (const t of TEMPLATE_IDS) {
    images[t] = {} as Record<SizeId, string>;
    for (const s of SIZE_IDS) {
      const override = env(`SANDBOX_IMAGE_${IMAGE_ENV[t]}_${s.toUpperCase()}`);
      images[t][s] = override && /^[A-Za-z0-9._/:@-]{1,160}$/.test(override) ? override : defaultImageName(t, s, provider ?? "e2b");
    }
  }

  const previewDomain = env("SANDBOX_PREVIEW_DOMAIN")?.toLowerCase() ?? null;
  const previewSecret = env("SANDBOX_PREVIEW_SECRET");
  const verified = env("SANDBOX_ISOLATION_VERIFIED_AT");

  return {
    provider,
    unknownProvider: raw && !provider ? raw : null,
    e2b: {
      apiKey: env("E2B_API_KEY"),
      domain: env("E2B_DOMAIN"),
      apiUrl,
      previewProtocol: apiUrl?.startsWith("http://") ? "http" : "https",
    },
    vercel: {
      token: env("SANDBOX_VERCEL_TOKEN"),
      teamId: env("SANDBOX_VERCEL_TEAM_ID"),
      projectId: env("SANDBOX_VERCEL_PROJECT_ID"),
      oidc: env("VERCEL_OIDC_TOKEN") !== null,
      region: (() => {
        const r = env("SANDBOX_VERCEL_REGION")?.toLowerCase() ?? null;
        return r && /^[a-z]{3}\d$/.test(r) ? r : null;
      })(),
    },
    isolationVerifiedAt: verified && !Number.isNaN(Date.parse(verified)) ? verified : null,
    runtimeMaxSessionMinutes: Number.isFinite(minutes) && minutes >= 5 ? Math.min(Math.floor(minutes), 24 * 60) : defaultMinutes,
    images,
    preview: {
      domain: previewDomain && /^[a-z0-9.-]+(:\d{2,5})?$/.test(previewDomain) ? previewDomain : null,
      secret: previewSecret && previewSecret.length >= 32 ? previewSecret : null,
      protocol: previewDomain?.includes("localhost") ? "http" : "https",
    },
    egressLedger: env("SANDBOX_EGRESS_LEDGER") !== "off",
    deploymentId: (env("SANDBOX_DEPLOYMENT_ID") ?? "farbaek").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "farbaek",
    cronSecret: (() => {
      const s = env("SANDBOX_CRON_SECRET");
      return s && s.length >= 32 ? s : null;
    })(),
  };
}

/** What a person reads whenever previews are off here, whatever the server-side cause. */
export const PREVIEWS_UNAVAILABLE = "Previews aren't available on this server yet.";

/**
 * Why previews are off, as people read it, or null when they're configured.
 * Which setting is the cause is for staff: previewSetupProblem, below.
 */
export function previewUnavailableReason(config: SandboxServerConfig): string | null {
  return config.preview.domain && config.preview.secret ? null : PREVIEWS_UNAVAILABLE;
}

/**
 * For staff only (Office Space's connections): which preview setting is
 * missing or refused, by the same rules readSandboxConfig applies, or null
 * when previews are configured. Never shown to customers.
 */
export function previewSetupProblem(read: (name: string) => string | null = env): string | null {
  const domain = read("SANDBOX_PREVIEW_DOMAIN")?.trim().toLowerCase() || null;
  const secret = read("SANDBOX_PREVIEW_SECRET")?.trim() || null;
  if (!domain) return "SANDBOX_PREVIEW_DOMAIN isn't set";
  if (!/^[a-z0-9.-]+(:\d{2,5})?$/.test(domain)) return "SANDBOX_PREVIEW_DOMAIN isn't a plain host name";
  if (!secret) return "SANDBOX_PREVIEW_SECRET isn't set";
  if (secret.length < 32) return "SANDBOX_PREVIEW_SECRET is shorter than 32 characters";
  return null;
}
