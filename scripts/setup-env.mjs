// Creates .env.local for Farbaek. Run it yourself in a terminal:
//   node scripts/setup-env.mjs
// It asks for the Supabase keys and, optionally, an Anthropic key for AI
// drafting (secret keys are hidden as you type), checks their format and
// writes .env.local with owner-only permissions. Nothing is printed, logged
// or sent anywhere. Run it again and type "ai" to add only the Anthropic key.
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

function askAnthropic() {
  return askUntil(
    "Anthropic API key for AI drafting (sk-ant-..., hidden, Enter to skip): ",
    (v) => v === "" || /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v),
    "It should start with sk-ant-. Create one at console.anthropic.com, or press Enter to skip.",
    { hidden: true },
  );
}

console.log("\nFarbaek environment setup");
console.log("Find the keys in Supabase: Project Settings > API Keys.\n");

if (existsSync(FILE)) {
  const answer = (await ask(`${FILE} already exists. Type "ai" to add or change only the Anthropic key, "replace" to start over, or press Enter to keep it: `)).toLowerCase();
  if (answer === "ai") {
    const key = await askAnthropic();
    if (!key) {
      console.log("No key entered. Left the existing file unchanged.");
      process.exit(0);
    }
    const line = `ANTHROPIC_API_KEY=${key}`;
    const current = readFileSync(FILE, "utf8");
    const next = /^ANTHROPIC_API_KEY=.*$/m.test(current) ? current.replace(/^ANTHROPIC_API_KEY=.*$/m, () => line) : `${current.replace(/\n?$/, "\n")}${line}\n`;
    writeFileSync(FILE, next, { encoding: "utf8", mode: 0o600 });
    console.log(`\nSaved the Anthropic key in ${FILE}. Rebuild or restart the server to turn on AI drafting.\n`);
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

const contents = `# Created by scripts/setup-env.mjs. Never commit this file.
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=${url}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}
SUPABASE_SECRET_KEY=${secret}
${anthropic ? `ANTHROPIC_API_KEY=${anthropic}\n` : ""}`;
writeFileSync(FILE, contents, { encoding: "utf8", mode: 0o600 });
console.log(`\nWrote ${FILE}. Start the app with: pnpm build, then pnpm start, and open http://localhost:3000/sign-in\n`);
