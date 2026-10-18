// Serves the production build with the read-only demo workspace enabled.
// The demo only switches on when Supabase is NOT configured (see
// src/server/workspace/context.ts), so it can't mix with real data.
// Run: pnpm build && node scripts/start-demo.mjs
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const child = spawn(process.execPath, [nextBin, "start"], {
  stdio: "inherit",
  env: { ...process.env, FARBAEK_DEMO_APP: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
