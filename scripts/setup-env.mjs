// Creates .env.local for Farbaek. Run it yourself in a terminal:
//   node scripts/setup-env.mjs
// It asks for the Supabase keys and, optionally, an Anthropic key for AI
// drafting (secret keys are hidden as you type), checks their format and
// writes .env.local with owner-only permissions. Nothing is printed, logged
// or sent anywhere. Run it again and type "ai" to add the Claude (Anthropic) and Gemini keys,
// "sandbox" to connect a sandbox runtime (Vercel Sandbox or E2B), or "verified" once
// pnpm sandbox:smoke has passed on that runtime.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const FILE = ".env.local";
const DEFAULT_URL = "https://kzcximuvvnnakmrttgzn.supabase.co";

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Echo the prompt, mask everything typed after it.
      rl._writeToOutput = (text) => rl.output.write(text.includes(question) ? question : "*");
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function askUntil(question, valid, hint, options) {
  for (;;) {
    const answer = await ask(question, options);
    if (valid(answer)) return answer;
    console.log(`  ${hint}`);
  }
}

function askGemini() {
  console.log("  Gemini note: on Google's free tier, prompts and responses may be used to improve Google's products; on the paid tier they aren't.");
  return askUntil(
    "Gemini API key from aistudio.google.com (hidden, Enter to skip): ",
    (v) => v === "" || /^[A-Za-z0-9_.-]{30,200}$/.test(v),
    "That doesn't look like a Gemini API key. Copy it from Google AI Studio > API Keys, or press Enter to skip.",
    { hidden: true },
  );
}

function askAnthropic() {
  return askUntil(
    "Anthropic API key for AI drafting (sk-ant-..., hidden, Enter to skip): ",
    (v) => v === "" || /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v),
    "It should start with sk-ant-. Create one at console.anthropic.com, or press Enter to skip.",
    { hidden: true },
  );
}

/** Sets or replaces NAME=value lines in .env.local, keeping everything else. */
function upsert(values) {
  let current = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}=${value}`;
    const pattern = new RegExp(`^${name}=.*$`, "m");
    current = pattern.test(current) ? current.replace(pattern, () => line) : `${current.replace(/\n?$/, "\n")}${line}\n`;
  }
  writeFileSync(FILE, current, { encoding: "utf8", mode: 0o600 });
}

/** The value after --name on the command line, or "". */
function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 1 ? (process.argv[i + 1] ?? "").trim() : "";
}

async function setupVercelSandbox() {
  console.log("\nVercel Sandbox (ADR 0016). You need a Vercel account (Hobby is free and hard-capped), a project, and an access token.");
  console.log("  Token: vercel.com/account/settings/tokens. Scope it to your team and give it an expiry.");
  console.log("  Team ID: team Settings > General. Project ID: the project's Settings > General.");
  const token = await askUntil(
    "Vercel access token (hidden): ",
    (v) => /^[A-Za-z0-9_.-]{20,300}$/.test(v),
    "That doesn't look like a Vercel access token. Create one under Account Settings > Tokens.",
    { hidden: true },
  );
  // IDs aren't secrets, so they can come on the command line: --team team_... --project prj_...
  const validTeam = (v) => /^team_[A-Za-z0-9]{8,}$/.test(v);
  const validProject = (v) => /^prj_[A-Za-z0-9]{8,}$/.test(v);
  const teamId = validTeam(flag("team")) ? flag("team") : await askUntil("Team ID (team_...): ", validTeam, "It should start with team_.");
  const projectId = validProject(flag("project")) ? flag("project") : await askUntil("Project ID (prj_...): ", validProject, "It should start with prj_.");
  if (flag("team")) console.log(`  Team ID: ${teamId}. Project ID: ${projectId}.`);
  const plan = (flag("plan") || (await ask("Vercel plan: hobby or pro [hobby]: "))).toLowerCase();
  upsert({
    SANDBOX_PROVIDER: "vercel",
    SANDBOX_VERCEL_TOKEN: token,
    SANDBOX_VERCEL_TEAM_ID: teamId,
    SANDBOX_VERCEL_PROJECT_ID: projectId,
    // Vercel's own session ceiling: 45 minutes on Hobby, 24 hours on Pro.
    SANDBOX_RUNTIME_MAX_SESSION_MINUTES: plan === "pro" ? "1440" : "45",
    SANDBOX_CRON_SECRET: randomBytes(32).toString("hex"),
    SANDBOX_DEPLOYMENT_ID: "farbaek-local",
  });
  console.log(`\nSaved the Vercel Sandbox settings in ${FILE} (a new cleanup secret was generated).`);
  console.log("Previews stay off on Vercel Sandbox: it serves ports on public addresses with no sign-in.");
  console.log("Next: restart the server, then pnpm sandbox:smoke. When it passes, run this again and type verified.\n");
}

async function setupSandbox() {
  console.log("\nSandbox runtime (docs/sandbox/README.md). Code runs on this runtime, never on this server.");
  const which = flag("team") ? "vercel" : (await ask("Runtime: vercel or e2b [vercel]: ")).toLowerCase();
  if (which !== "e2b") return setupVercelSandbox();
  const key = await askUntil(
    "E2B API key (e2b_..., hidden): ",
    (v) => /^e2b_[A-Za-z0-9]{20,}$/.test(v),
    "It should start with e2b_. Create it in your E2B dashboard, or on your self-hosted E2B (Embed) deployment.",
    { hidden: true },
  );
  const domain = await askUntil(
    "Self-hosted E2B domain (for example e2b.internal.example.com), or Enter for E2B Cloud: ",
    (v) => v === "" || /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$/i.test(v),
    "Use a host name such as e2b.example.com, or press Enter for E2B Cloud.",
  );
  const previewDomain = await askUntil(
    "Preview domain [preview.localhost:3000]: ",
    (v) => v === "" || /^[a-z0-9.-]+(:\d{2,5})?$/i.test(v),
    "Use a host such as preview.localhost:3000 locally, or a separate domain you own in production.",
  );
  upsert({
    SANDBOX_PROVIDER: "e2b",
    E2B_API_KEY: key,
    ...(domain ? { E2B_DOMAIN: domain } : {}),
    SANDBOX_PREVIEW_DOMAIN: previewDomain || "preview.localhost:3000",
    SANDBOX_PREVIEW_SECRET: randomBytes(32).toString("hex"),
    SANDBOX_CRON_SECRET: randomBytes(32).toString("hex"),
    SANDBOX_DEPLOYMENT_ID: "farbaek-local",
  });
  console.log(`\nSaved the sandbox settings in ${FILE} (new preview and cron secrets were generated).`);
  console.log("Next: pnpm sandbox:templates, then pnpm sandbox:smoke. When it passes, run this again and type verified.\n");
}

console.log("\nFarbaek environment setup");
console.log("Find the keys in Supabase: Project Settings > API Keys.\n");

if (existsSync(FILE)) {
  // `node scripts/setup-env.mjs ai` (or sandbox, verified) goes straight to that step, with no menu to miss.
  const direct = (process.argv[2] ?? "").toLowerCase();
  const answer = ["ai", "sandbox", "verified"].includes(direct)
    ? direct
    : (
        await ask(`${FILE} already exists. Type "ai" for the Claude and Gemini keys, "sandbox" to connect a sandbox runtime, "verified" after the smoke test passed, "replace" to start over, or press Enter to keep it: `)
      ).toLowerCase();
  if (answer === "sandbox") {
    await setupSandbox();
    process.exit(0);
  }
  if (answer === "verified") {
    const sure = (await ask("Did pnpm sandbox:smoke pass on this deployment's runtime just now? Type yes to record it: ")).toLowerCase();
    if (sure !== "yes") {
      console.log("Nothing recorded. Project code keeps running in Review Only until the smoke test passes.");
      process.exit(0);
    }
    upsert({ SANDBOX_ISOLATION_VERIFIED_AT: new Date().toISOString().slice(0, 10) });
    console.log(`\nRecorded the verification date in ${FILE}. Rebuild or restart the server to turn on sandboxed execution.\n`);
    process.exit(0);
  }
  if (answer === "ai") {
    const anthropicKey = await askAnthropic();
    const geminiKey = await askGemini();
    if (!anthropicKey && !geminiKey) {
      console.log("No key entered. Left the existing file unchanged.");
      process.exit(0);
    }
    upsert({ ...(anthropicKey ? { ANTHROPIC_API_KEY: anthropicKey } : {}), ...(geminiKey ? { GEMINI_API_KEY: geminiKey } : {}) });
    const saved = [anthropicKey ? "Anthropic" : null, geminiKey ? "Gemini" : null].filter(Boolean).join(" and ");
    console.log(`\nSaved the ${saved} key${anthropicKey && geminiKey ? "s" : ""} in ${FILE}. Claude is used when its key is set, otherwise Gemini (set AI_PROVIDER to choose).`);
    console.log("Rebuild or restart the server, then check with: pnpm check:env\n");
    process.exit(0);
  }
  if (answer !== "replace" && answer !== "yes") {
    console.log("Left the existing file unchanged.");
    process.exit(0);
  }
}

const urlAnswer = await ask(`Project URL [${DEFAULT_URL}]: `);
const url = urlAnswer || DEFAULT_URL;
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
  console.log("That doesn't look like a Supabase project URL (https://<ref>.supabase.co). Nothing was written.");
  process.exit(1);
}

const publishable = await askUntil(
  "Publishable key (sb_publishable_...): ",
  (v) => /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(v),
  "It should start with sb_publishable_. Copy it from the Publishable key row.",
);
const secret = await askUntil(
  "Secret key (sb_secret_..., hidden): ",
  (v) => /^sb_secret_[A-Za-z0-9_-]{10,}$/.test(v),
  "It should start with sb_secret_. Reveal and copy it from the Secret keys row.",
  { hidden: true },
);

const anthropic = await askAnthropic();
const gemini = await askGemini();

const contents = `# Created by scripts/setup-env.mjs. Never commit this file.
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=${url}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}
SUPABASE_SECRET_KEY=${secret}
${anthropic ? `ANTHROPIC_API_KEY=${anthropic}\n` : ""}${gemini ? `GEMINI_API_KEY=${gemini}\n` : ""}`;
writeFileSync(FILE, contents, { encoding: "utf8", mode: 0o600 });
console.log(`\nWrote ${FILE}. Start the app with: pnpm build, then pnpm start, and open http://localhost:3000/sign-in\n`);
