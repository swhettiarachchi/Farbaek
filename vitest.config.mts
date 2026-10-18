import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "desktop/src/**/*.test.ts"],
    environment: "node",
    // The dev PC has 3.8 GB of RAM; keep the worker pool small.
    maxWorkers: 2,
  },
});
