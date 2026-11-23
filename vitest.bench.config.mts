import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** The AutoSurvey benchmark (stage 232) only: `pnpm bench:survey`. Kept out of `pnpm test`, whose include never matches `.bench.ts`. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/bench/**/*.bench.ts"],
    environment: "node",
    // One file, one worker: timings aren't shared with another test run.
    maxWorkers: 1,
    testTimeout: 300_000,
  },
});
