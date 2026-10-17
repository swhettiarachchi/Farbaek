// Checks .env.local without printing any value: which settings are present,
// whether each looks like the right kind of key, and whether Supabase (and
// Anthropic, if set) accept them. Run it yourself or with: pnpm check:env
// Only "ok" or a reason is printed. Keys never leave this machine except to
// the service they belong to.
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Sandbox } from "e2b";
import { Sandbox as VercelSandbox } from "@vercel/sandbox";

const FILE = ".env.local";
if (!existsSync(FILE)) {
  console.log(`${FILE} doesn't exist yet. Create it with: node scripts/setup-env.mjs`);
  process.exit(1);
}
process.loadEnvFile(FILE);

const env = (name) => (process.env[name] ?? "").trim();
const url = env("NEXT_PUBLIC_SUPABASE_URL");
const publishable = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const secret = env("SUPABASE_SECRET_KEY");
const anthropic = env("ANTHROPIC_API_KEY");

let failures = 0;
const line = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` - ${detail}` : ""}`);
};

const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url);
line("Supabase project URL", urlOk, urlOk ? "" : url ? "doesn't look like https://<ref>.supabase.co" : "missing");

const pubFormat = /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(publishable);
line("Publishable key format", pubFormat, pubFormat ? "" : publishable ? "should start with sb_publishable_" : "missing");

const secretFormat = /^sb_secret_[A-Za-z0-9_-]{10,}$/.test(secret);
line("Secret key format", secretFormat, secretFormat ? "" : secret ? "should start with sb_secret_" : "missing");

async function probe(label, run) {
  try {
    const result = await run();
    line(label, result.ok, result.detail);
  } catch (error) {
    line(label, false, `couldn't reach the service (${error instanceof Error ? error.name : "error"})`);
  }
}

if (urlOk && pubFormat) {
  // The auth settings endpoint answers 200 only for a valid project API key.
  await probe("Supabase accepts the publishable key", async () => {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishable } });
    return { ok: res.ok, detail: res.ok ? "" : `HTTP ${res.status}` };
  });
}

if (urlOk && secretFormat) {
  // A head-only count needs the secret key's server access; nothing is read or changed.
  await probe("Supabase accepts the secret key (server access)", async () => {
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.from("organizations").select("id", { count: "exact", head: true });
    return { ok: !error, detail: error ? error.message.slice(0, 120) : "" };
  });
}

if (anthropic) {
  const anthropicFormat = /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(anthropic);
  line("Anthropic key format", anthropicFormat, anthropicFormat ? "" : "should start with sk-ant-");
  if (anthropicFormat) {
    // Listing models is free and confirms the key works.
    await probe("Anthropic accepts the key", async () => {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": anthropic, "anthropic-version": "2023-06-01" } });
      return { ok: res.ok, detail: res.ok ? "" : `HTTP ${res.status}` };
    });
  }
} else {
  console.log("--    Anthropic key not set (optional)");
}

const gemini = env("GEMINI_API_KEY");
if (gemini) {
  const geminiFormat = /^[A-Za-z0-9_.-]{30,200}$/.test(gemini);
  line("Gemini key format", geminiFormat, geminiFormat ? "" : "doesn't look like a Gemini API key");
  if (geminiFormat) {
    // Listing one model is free and confirms the key works. The key goes in a header, never the URL.
    await probe("Gemini accepts the key", async () => {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": gemini } });
      return { ok: res.ok, detail: res.ok ? "" : `HTTP ${res.status}` };
    });
  }
} else {
  console.log("--    Gemini key not set (optional)");
}
const aiProvider = env("AI_PROVIDER").toLowerCase();
const activeAi = aiProvider === "anthropic" || aiProvider === "gemini" ? aiProvider : anthropic ? "anthropic" : gemini ? "gemini" : null;
if (aiProvider && aiProvider !== "anthropic" && aiProvider !== "gemini") line("AI provider", false, 'AI_PROVIDER must be "anthropic" or "gemini"');
console.log(activeAi ? `--    AI features use ${activeAi === "anthropic" ? "Claude" : "Gemini"}` : "--    No AI key set: AI drafting and proposals stay off (optional)");

const provider = env("SANDBOX_PROVIDER");
if (!provider) {
  console.log("--    Sandbox runtime not set: project code stays in Review Only (optional; pnpm setup:env, then sandbox)");
} else {
  const known = provider === "e2b" || provider === "vercel";
  line("Sandbox provider", known, known ? provider : `"${provider}" has no adapter; use vercel or e2b`);
  if (provider === "vercel") {
    const token = env("SANDBOX_VERCEL_TOKEN");
    const teamId = env("SANDBOX_VERCEL_TEAM_ID");
    const projectId = env("SANDBOX_VERCEL_PROJECT_ID");
    line("Vercel token", token.length >= 20, token ? "" : "missing");
    line("Vercel team ID format", /^team_[A-Za-z0-9]{8,}$/.test(teamId), teamId ? "" : "missing");
    line("Vercel project ID format", /^prj_[A-Za-z0-9]{8,}$/.test(projectId), projectId ? "" : "missing");
    if (token && teamId && projectId) {
      // Listing at most one sandbox starts nothing and confirms the token, team and project.
      await probe("Vercel Sandbox accepts the token", async () => {
        try {
          await VercelSandbox.list({ token, teamId, projectId, limit: 1 });
          return { ok: true, detail: "" };
        } catch (error) {
          const status = error?.response?.status;
          if (status === 401 || status === 403) return { ok: false, detail: "Vercel refused the token for this team and project" };
          if (status === 404) return { ok: false, detail: "Vercel doesn't know this team or project ID" };
          throw error;
        }
      });
    }
    console.log("--    Previews are off on Vercel Sandbox: it serves ports on public addresses with no sign-in");
  }
  const e2bKey = env("E2B_API_KEY");
  const keyFormat = /^e2b_[A-Za-z0-9]{20,}$/.test(e2bKey);
  if (provider !== "vercel") line("E2B key format", keyFormat, keyFormat ? "" : e2bKey ? "should start with e2b_" : "missing");
  if (provider !== "vercel" && keyFormat) {
    // Listing at most one sandbox is free and confirms the key and the runtime address.
    await probe(`Sandbox runtime accepts the key (${env("E2B_DOMAIN") || (env("E2B_API_URL") ? "self-hosted" : "E2B Cloud")})`, async () => {
      await Sandbox.list({ apiKey: e2bKey, ...(env("E2B_DOMAIN") ? { domain: env("E2B_DOMAIN") } : {}), ...(env("E2B_API_URL") ? { apiUrl: env("E2B_API_URL") } : {}), limit: 1, requestTimeoutMs: 15000 }).nextItems();
      return { ok: true, detail: "" };
    });
  }
  if (provider !== "vercel") {
    line("Preview domain", Boolean(env("SANDBOX_PREVIEW_DOMAIN")), env("SANDBOX_PREVIEW_DOMAIN") ? "" : "missing: previews stay off");
    line("Preview secret length", env("SANDBOX_PREVIEW_SECRET").length >= 32, env("SANDBOX_PREVIEW_SECRET") ? "" : "missing: previews stay off");
  }
  line("Sweeper secret length", env("SANDBOX_CRON_SECRET").length >= 32, env("SANDBOX_CRON_SECRET") ? "" : "missing: the cleanup endpoint stays off");
  const verified = env("SANDBOX_ISOLATION_VERIFIED_AT");
  if (verified) line("Isolation verified on", !Number.isNaN(Date.parse(verified)), Number.isNaN(Date.parse(verified)) ? "not a date" : "");
  else console.log("--    Isolation not verified yet: run pnpm sandbox:smoke, then pnpm setup:env and type verified");
}

console.log(failures === 0 ? "\nAll set." : `\n${failures} problem${failures === 1 ? "" : "s"} found.`);
process.exit(failures === 0 ? 0 : 1);
