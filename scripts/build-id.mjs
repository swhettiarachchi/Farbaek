// The id /api/health shows for a deployed commit (src/server/deployment.ts, publicBuildId).
// Usage: node scripts/build-id.mjs <full commit sha>   (git rev-parse origin/main gives it)
import { createHash } from "node:crypto";

const commit = process.argv[2]?.trim();
if (!commit || !/^[0-9a-f]{40}$/.test(commit)) {
  console.error("Give the full 40-character commit, for example: node scripts/build-id.mjs $(git rev-parse origin/main)");
  process.exit(1);
}
console.log(createHash("sha256").update(`farbaek-build:${commit}`).digest("hex").slice(0, 12));
