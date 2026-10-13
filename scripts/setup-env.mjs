// Creates .env.local for Farbaek. Run it yourself in a terminal:
//   node scripts/setup-env.mjs
// It asks for the Supabase keys (the secret key is hidden as you type),
// checks their format and writes .env.local with owner-only permissions.
// Nothing is printed, logged or sent anywhere.
import { existsSync, writeFileSync } from "node:fs";
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

console.log("\nFarbaek environment setup");
console.log("Find the keys in Supabase: Project Settings > API Keys.\n");

if (existsSync(FILE)) {
  const answer = await ask(`${FILE} already exists. Replace it? (yes/no) `);
  if (answer.toLowerCase() !== "yes") {
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

const contents = `# Created by scripts/setup-env.mjs. Never commit this file.
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=${url}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}
SUPABASE_SECRET_KEY=${secret}
`;
writeFileSync(FILE, contents, { encoding: "utf8", mode: 0o600 });
console.log(`\nWrote ${FILE}. Start the app with: pnpm build, then pnpm start, and open http://localhost:3000/sign-in\n`);
