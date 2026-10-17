// Checks .env.local without printing any value: which settings are present,
// whether each looks like the right kind of key, and whether Supabase (and
// Anthropic, if set) accept them. Run it yourself or with: pnpm check:env
// Only "ok" or a reason is printed. Keys never leave this machine except to
// the service they belong to.
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Sandbox } from "e2b";

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
  console.log("--    Anthropic key not set: AI drafting and proposals stay off (optional)");
}

const provider = env("SANDBOX_PROVIDER");
if (!provider) {
  console.log("--    Sandbox runtime not set: project code stays in Review Only (optional; pnpm setup:env, then sandbox)");
} else {
  line("Sandbox provider", provider === "e2b", provider === "e2b" ? "" : `"${provider}" has no adapter; use e2b`);
  const e2bKey = env("E2B_API_KEY");
  const keyFormat = /^e2b_[A-Za-z0-9]{20,}$/.test(e2bKey);
  line("E2B key format", keyFormat, keyFormat ? "" : e2bKey ? "should start with e2b_" : "missing");
  if (keyFormat) {
    // Listing at most one sandbox is free and confirms the key and the runtime address.
    await probe(`Sandbox runtime accepts the key (${env("E2B_DOMAIN") || (env("E2B_API_URL") ? "self-hosted" : "E2B Cloud")})`, async () => {
      await Sandbox.list({ apiKey: e2bKey, ...(env("E2B_DOMAIN") ? { domain: env("E2B_DOMAIN") } : {}), ...(env("E2B_API_URL") ? { apiUrl: env("E2B_API_URL") } : {}), limit: 1, requestTimeoutMs: 15000 }).nextItems();
      return { ok: true, detail: "" };
    });
  }
  line("Preview domain", Boolean(env("SANDBOX_PREVIEW_DOMAIN")), env("SANDBOX_PREVIEW_DOMAIN") ? "" : "missing: previews stay off");
  line("Preview secret length", env("SANDBOX_PREVIEW_SECRET").length >= 32, env("SANDBOX_PREVIEW_SECRET") ? "" : "missing: previews stay off");
  line("Sweeper secret length", env("SANDBOX_CRON_SECRET").length >= 32, env("SANDBOX_CRON_SECRET") ? "" : "missing: the cleanup endpoint stays off");
  const verified = env("SANDBOX_ISOLATION_VERIFIED_AT");
  if (verified) line("Isolation verified on", !Number.isNaN(Date.parse(verified)), Number.isNaN(Date.parse(verified)) ? "not a date" : "");
  else console.log("--    Isolation not verified yet: run pnpm sandbox:smoke, then pnpm setup:env and type verified");
}

console.log(failures === 0 ? "\nAll set." : `\n${failures} problem${failures === 1 ? "" : "s"} found.`);
process.exit(failures === 0 ? 0 : 1);
