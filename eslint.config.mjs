import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // src/core is shared by the server, the browser and (later) the native apps.
    // It must stay framework-free so every surface runs the same rules.
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["next", "next/*", "react", "react-dom", "motion/*"], message: "src/core must not depend on UI frameworks." },
            { group: ["@/components/*", "@/app/*"], message: "src/core must not import UI code." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts", "docs/**"]),
]);
