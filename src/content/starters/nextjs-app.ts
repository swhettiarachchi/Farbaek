/**
 * Starter: a Next.js app (App Router, TypeScript, Tailwind CSS v4).
 * Dependencies are pinned to exact versions Farbaek itself uses and has
 * vetted, and there are no install scripts.
 */
import type { StarterFile } from "./types";

export const NEXTJS_DEPENDENCIES = {
  dependencies: { next: "16.4.0", react: "19.3.0", "react-dom": "19.3.0" },
  devDependencies: {
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "24.19.2",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    tailwindcss: "4.3.3",
    typescript: "6.0.3",
  },
} as const;

const PACKAGE = `${JSON.stringify(
  {
    name: "my-app",
    version: "0.1.0",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start" },
    ...NEXTJS_DEPENDENCIES,
  },
  null,
  2,
)}
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2023"],
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`;

const NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
`;

const POSTCSS = `export default {
  plugins: { "@tailwindcss/postcss": {} },
};
`;

const GLOBALS = `@import "tailwindcss";

@theme {
  --color-accent: #1f5bd6;
}

:root {
  color-scheme: light dark;
}

body {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
`;

const LAYOUT = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "[Your app name]",
  description: "[One sentence about what your app does.]",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">{children}</body>
    </html>
  );
}
`;

const PAGE = `export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">[Your app name]</h1>
      <p className="max-w-[55ch] text-lg text-zinc-600 dark:text-zinc-400">
        Edit <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-base dark:bg-zinc-800">app/page.tsx</code> and the preview updates as you save.
      </p>
      <div>
        <a href="https://nextjs.org/docs" className="inline-flex min-h-11 items-center rounded-full bg-accent px-6 font-medium text-white">
          Read the Next.js docs
        </a>
      </div>
    </main>
  );
}
`;

const GITIGNORE = `node_modules/
.next/
out/
*.tsbuildinfo
next-env.d.ts
.env*
!.env.example
`;

const README = `# [Your app name]

A Next.js app with the App Router, TypeScript and Tailwind CSS.

## Run it

In Farbaek, open the project and choose **Preview**. Farbaek starts a sandbox, installs the dependencies, runs the app and opens a private preview.

On your own computer:

\`\`\`bash
npm install --ignore-scripts
npm run dev
\`\`\`

Then open http://localhost:3000.

## Edit

Pages live in \`app/\`. Start with \`app/page.tsx\`; global styles are in \`app/globals.css\`.
`;

export const NEXTJS_APP_FILES: StarterFile[] = [
  { path: "package.json", content: PACKAGE },
  { path: "tsconfig.json", content: TSCONFIG },
  { path: "next.config.ts", content: NEXT_CONFIG },
  { path: "postcss.config.mjs", content: POSTCSS },
  { path: "app/globals.css", content: GLOBALS },
  { path: "app/layout.tsx", content: LAYOUT },
  { path: "app/page.tsx", content: PAGE },
  { path: ".gitignore", content: GITIGNORE },
  { path: "README.md", content: README },
];
