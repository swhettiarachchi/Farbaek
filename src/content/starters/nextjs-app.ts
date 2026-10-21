/**
 * Starter: a Next.js app (App Router, TypeScript, Tailwind CSS v4).
 * Dependencies are pinned to exact versions Farbaek itself uses and has
 * vetted, and there are no install scripts. Like the static starter, it
 * comes with a blank DESIGN.md to write first, named design tokens as
 * Tailwind utilities, a skip link, visible focus and reduced motion.
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

/*
  The design tokens. DESIGN.md names each one: change the plan first, then
  these values. One accent, one theme, one corner-radius system. Each token
  is also a utility: bg-paper, text-muted, rounded-card, font-display.
*/
@theme {
  --color-paper: #f6f7f9;
  --color-surface: #ffffff;
  --color-ink: #12151b;
  --color-muted: #555c69;
  --color-line: #dfe3e9;
  --color-accent: #2348c9;
  --color-on-accent: #ffffff;

  --font-display: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-body: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;

  --radius-input: 12px;
  --radius-card: 20px;
  --radius-panel: 28px;

  --ease-soft: cubic-bezier(0.22, 1, 0.36, 1);
  --animate-rise: rise 600ms var(--ease-soft) both;

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
}

body {
  font-family: var(--font-body);
}

:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

/* The still app is complete: motion stops when the person asks for less. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
`;

const LAYOUT = `import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "[Your app name]",
  description: "[One sentence about what your app does and who it's for.]",
};

export const viewport: Viewport = { themeColor: "#f6f7f9" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
`;

const PAGE = `/**
 * The app's first screen. Replace it with what people see when they open the
 * app; DESIGN.md says how it should look.
 */
const STEPS = [
  { title: "Write the design plan", body: "DESIGN.md: who the app is for, its colours and type, and the one thing people will remember." },
  { title: "Build the first screen", body: "Replace this page in app/page.tsx with the screen people see first." },
  { title: "Add the next screens", body: "Each folder in app/ with a page.tsx becomes a page of the app." },
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="font-display text-lg font-semibold tracking-tight">[Your app name]</span>
          <nav aria-label="Main">
            <a href="#main" aria-current="page" className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-medium ring-1 ring-line">
              Overview
            </a>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="animate-rise">
          <h1 className="max-w-[18ch] font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            [What your app helps people do]
          </h1>
          <p className="mt-5 max-w-[48ch] text-lg text-muted">[One sentence, under 20 words, for the people who will use it.]</p>
        </div>

        <section aria-labelledby="empty-title" className="mt-12 animate-rise rounded-panel bg-surface/60 p-2 ring-1 ring-line [animation-delay:90ms]">
          <div className="rounded-card bg-surface px-6 py-14 text-center ring-1 ring-line">
            <h2 id="empty-title" className="font-display text-xl font-semibold tracking-tight">Nothing here yet</h2>
            <p className="mx-auto mt-2 max-w-[44ch] text-muted">[What people will see here once they start, and the first thing they do.]</p>
          </div>
        </section>

        <section aria-labelledby="build-title" className="mt-12 animate-rise [animation-delay:180ms]">
          <h2 id="build-title" className="font-display text-xl font-semibold tracking-tight">Building this app</h2>
          <ol className="mt-4 divide-y divide-line border-y border-line">
            {STEPS.map((step, i) => (
              <li key={step.title} className="grid gap-1 py-5 sm:grid-cols-[3rem_14rem_1fr] sm:gap-6">
                <span className="font-mono text-sm text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
`;

const DESIGN = `# Design plan (write this first)

This plan isn't written yet. Before building screens, replace each section below with decisions for this app: who uses it, how it should feel, and the one thing people will remember. Then build to the plan, and keep it current when the design changes.

The app already does what every app needs: a skip link, visible focus, named design tokens as Tailwind utilities, and motion that stops under reduced motion. Keep those; change the look.

Design read: [one line: the kind of app, who uses it and the feeling it should have]

## Palette (the @theme block in app/globals.css)

Four to six named colours with one accent. The starter's neutral set is \`paper\`, \`surface\`, \`ink\`, \`muted\`, \`line\` and \`accent\`, used as \`bg-paper\`, \`text-muted\` and so on. Rename them for the brand and check that text meets WCAG AA contrast.

## Type

A characterful display face used with restraint (\`font-display\`) and a readable body face (\`font-body\`). Not Inter by default, and no Fraunces or Instrument Serif. Load fonts with next/font. The starter uses the system sans for both.

## Layout

[The screens and how people move between them: navigation, the first screen, empty states.] The starter has a top bar, a page heading, an empty state and a short list.

## Signature

[The one element this app will be remembered by, and why it fits.]

## Motion

[What moves, why and for how long.] The starter: blocks rise in once on load (600 ms, eased, staggered). All of it stops under prefers-reduced-motion.

## Shape

Pills for buttons and chips, 12px for inputs, 20px for cards and 28px for large panels (\`rounded-input\`, \`rounded-card\`, \`rounded-panel\`). Keep one system.

## Avoid

[What this design deliberately doesn't do.]
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

1. Write \`DESIGN.md\` first: the palette, type, layout, signature and motion for this app.
2. Put the plan's colours and fonts in the \`@theme\` block of \`app/globals.css\`. Each one becomes a Tailwind utility, such as \`bg-paper\` or \`rounded-card\`.
3. Pages live in \`app/\`. Start with \`app/page.tsx\`, and replace the text in [square brackets].
`;

export const NEXTJS_APP_FILES: StarterFile[] = [
  { path: "DESIGN.md", content: DESIGN },
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
