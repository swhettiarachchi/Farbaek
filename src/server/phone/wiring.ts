/**
 * The phone API on this server (ADR 0110): Supabase Auth makes and refreshes
 * the phones' sessions, the database keeps their records, and reads go
 * through the person's own session.
 *
 * A phone's new session is made the way Supabase recommends for signing a
 * person in from the server: the admin API generates a sign-in link's hashed
 * token (no email is sent) and it's verified at once, which creates a fresh
 * session separate from every browser's.
 */
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_USER } from "@/content/demo-workspace";
import { clientKey } from "@/server/agent/http";
import { getRun, listRunEvents, listRuns } from "@/server/cloud-agent/store";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { apnsConfig } from "@/server/push/apns";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { readSupabaseConfig, siteUrl } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { liveContext, type AppContext } from "@/server/workspace/context";
import { createDemoReader } from "@/server/workspace/demo-reader";
import { createSupabaseReader } from "@/server/workspace/supabase-reader";
import type { PhoneApiDeps } from "./api";
import type { PhoneSession, SessionAuth } from "./auth";
import { createSupabasePhoneStore } from "./store";
import { NO_RUNS, type RunReader } from "./views";
import { createPhoneWrites } from "./writes";

type Config = { url: string; publishableKey: string };
const NO_PERSISTENCE = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

/** A client that acts as the person behind an access token, for Row Level Security. */
export function bearerClient(config: Config, accessToken: string): SupabaseClient {
  return createClient(config.url, config.publishableKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: NO_PERSISTENCE });
}

export function createSupabaseSessionAuth(admin: SupabaseClient, config: Config): SessionAuth {
  const anon = () => createClient(config.url, config.publishableKey, { auth: NO_PERSISTENCE });

  async function verify(accessToken: string) {
    // A malformed token makes getClaims throw rather than return an error; either way it's not valid.
    const { data } = await anon()
      .auth.getClaims(accessToken)
      .catch(() => ({ data: null }));
    const c = data?.claims as Record<string, unknown> | undefined;
    if (!c || typeof c.sub !== "string" || typeof c.session_id !== "string" || typeof c.exp !== "number") return null;
    return { userId: c.sub, email: typeof c.email === "string" ? c.email : "", sessionId: c.session_id, expiresAt: c.exp };
  }

  async function toPhoneSession(s: Session | null): Promise<PhoneSession | null> {
    if (!s?.access_token || !s.refresh_token) return null;
    const claims = await verify(s.access_token);
    return claims ? { accessToken: s.access_token, refreshToken: s.refresh_token, expiresAt: s.expires_at ?? claims.expiresAt, sessionId: claims.sessionId } : null;
  }

  return {
    verify,
    async newSession(userId) {
      const { data: found } = await admin.auth.admin.getUserById(userId);
      const email = found?.user?.email;
      if (!email) return null;
      const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      const tokenHash = link?.properties?.hashed_token;
      if (error || !tokenHash) return null;
      // Auth versions name this "magiclink" or "email"; a failed try doesn't use the token up.
      for (const type of ["magiclink", "email"] as const) {
        const { data } = await anon().auth.verifyOtp({ token_hash: tokenHash, type });
        if (data.session) return toPhoneSession(data.session);
      }
      return null;
    },
    async refresh(refreshToken) {
      const { data } = await anon()
        .auth.refreshSession({ refresh_token: refreshToken })
        .catch(() => ({ data: { session: null } }));
      return toPhoneSession(data.session);
    },
  };
}

function supabaseRuns(client: SupabaseClient, orgId: string): RunReader {
  return {
    list: (o) => listRuns(client, orgId, o),
    get: (id) => getRun(client, orgId, id),
    events: (id, after) => listRunEvents(client, orgId, id, after, 200),
  };
}

async function sampleContext(): Promise<{ ctx: AppContext; runs: RunReader }> {
  const reader = createDemoReader();
  const workspaces = await reader.listWorkspaces();
  return {
    ctx: {
      mode: "demo",
      user: { ...DEMO_USER },
      reader,
      workspaces,
      current: workspaces[0] ?? null,
      role: "owner",
      permissions: {},
      writes: { enabled: false, reason: "This is sample data, so nothing here can change. Sign in to approve and build for real." },
    },
    runs: NO_RUNS,
  };
}

export function phoneApiDeps(): PhoneApiDeps {
  const admin = createSupabaseAdminClient();
  const config = readSupabaseConfig();
  const store = admin ? createSupabasePhoneStore(admin) : null;
  const auth = admin && config && store ? { store, auth: createSupabaseSessionAuth(admin, config) } : null;
  return {
    auth,
    siteOrigin: new URL(siteUrl()).origin,
    async browserUser() {
      const client = await createSupabaseServerClient();
      if (!client) return null;
      const { data } = await client.auth.getClaims();
      return typeof data?.claims?.sub === "string" ? data.claims.sub : null;
    },
    async live(caller, workspaceId) {
      const client = bearerClient(config!, caller.accessToken);
      const ctx = await liveContext(createSupabaseReader(client), { id: caller.userId, email: caller.email }, workspaceId ?? undefined);
      return { ctx, runs: ctx.current ? supabaseRuns(client, ctx.current.id) : NO_RUNS };
    },
    sample: sampleContext,
    execution: () => currentExecutionMode(),
    writes: createPhoneWrites({ userClient: (token) => bearerClient(config!, token), store: store! }),
    pushAvailable: () => apnsConfig() !== null,
    clientKey,
    now: () => new Date(),
  };
}
