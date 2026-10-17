#!/usr/bin/env node
/**
 * Builds Farbaek's sandbox runtime images on your E2B runtime (self-hosted
 * E2B Embed or E2B Cloud): Node.js and Python, each in two sizes.
 *
 *   pnpm sandbox:templates            build all four
 *   pnpm sandbox:templates --dry-run  print the plan without building
 *
 * Reads E2B_API_KEY, and E2B_DOMAIN or E2B_API_URL for a self-hosted
 * runtime, from the environment (the package script loads .env.local).
 * The key is never printed. Building uses your runtime's build capacity,
 * which may be billed on E2B Cloud.
 *
 * Image contents are deliberately small: the official Node.js 22 and
 * Python 3.12 base images, Corepack for pnpm and Yarn, and nothing else.
 * Projects install their own dependencies inside each session.
 */
import { Template, defaultBuildLogger } from "e2b";

const SIZES = {
  small: { cpuCount: 1, memoryMB: 1024, minFreeDiskMb: 4096 },
  standard: { cpuCount: 2, memoryMB: 2048, minFreeDiskMb: 8192 },
};

const TEMPLATES = {
  node: () => Template().fromNodeImage("22").runCmd("corepack enable", { user: "root" }).setWorkdir("/home/user/project"),
  python: () => Template().fromPythonImage("3.12").setWorkdir("/home/user/project"),
};

const dryRun = process.argv.includes("--dry-run");
const apiKey = process.env.E2B_API_KEY?.trim();
const domain = process.env.E2B_DOMAIN?.trim() || undefined;
const apiUrl = process.env.E2B_API_URL?.trim() || undefined;

function imageName(kind, size) {
  const override = process.env[`SANDBOX_IMAGE_${kind.toUpperCase()}_${size.toUpperCase()}`]?.trim();
  return override || `farbaek-${kind}-${size}`;
}

const plan = [];
for (const kind of Object.keys(TEMPLATES)) {
  for (const size of Object.keys(SIZES)) plan.push({ kind, size, name: imageName(kind, size), ...SIZES[size] });
}

console.log(`Runtime: ${domain ? `self-hosted (${domain})` : apiUrl ? `self-hosted (${new URL(apiUrl).host})` : "E2B Cloud"}`);
for (const p of plan) console.log(`  ${p.name}: ${p.kind}, ${p.cpuCount} vCPU, ${p.memoryMB} MiB, at least ${p.minFreeDiskMb} MiB free disk`);

if (dryRun) process.exit(0);
if (!apiKey) {
  console.error("E2B_API_KEY isn't set. Run pnpm setup:env and choose sandbox, then try again.");
  process.exit(1);
}

let failed = 0;
for (const p of plan) {
  console.log(`\nBuilding ${p.name}…`);
  try {
    const info = await Template.build(TEMPLATES[p.kind](), p.name, {
      apiKey,
      ...(domain ? { domain } : {}),
      ...(apiUrl ? { apiUrl } : {}),
      cpuCount: p.cpuCount,
      memoryMB: p.memoryMB,
      minFreeDiskMb: p.minFreeDiskMb,
      onBuildLogs: defaultBuildLogger(),
    });
    console.log(`Built ${p.name} (template ${info.templateId}).`);
  } catch (e) {
    failed += 1;
    console.error(`Building ${p.name} failed: ${e instanceof Error ? e.message.replace(/e2b_[A-Za-z0-9]+/g, "[redacted]") : String(e)}`);
  }
}
if (failed) {
  console.error(`\n${failed} of ${plan.length} images failed to build.`);
  process.exit(1);
}
console.log("\nAll images built. Next: pnpm sandbox:smoke");
