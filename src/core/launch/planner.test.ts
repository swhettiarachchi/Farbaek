import { describe, expect, it } from "vitest";
import { runProfile } from "@/content/starters";
import { envExampleNames, envNamesInCode, filesToRead, planLaunch, type PlannerInput } from "./planner";

const plan = (files: Record<string, string>, extraPaths: string[] = []): ReturnType<typeof planLaunch> =>
  planLaunch({ paths: [...Object.keys(files), ...extraPaths], texts: files } satisfies PlannerInput);
const pkg = (body: object) => JSON.stringify(body);

describe("the Launch Planner", () => {
  it("reads a plain static site as ready for Farbaek Sites", () => {
    const p = plan({ "index.html": "<h1>Hi</h1>" }, ["styles.css", "DESIGN.md"]);
    expect(p).toMatchObject({ kind: "static", hosting: "static", evidence: ["index.html without package.json"], build: null, start: null, fileCount: 3 });
    expect(p.destinations[0]).toMatchObject({ id: "farbaek_sites", available: true });
    expect(p.destinations.slice(1).every((d) => !d.available)).toBe(true);
  });

  it("reads index.html with a package.json that installs and runs nothing as a static site, like the runner", () => {
    const files = { "index.html": "<h1>Tips</h1>", "package.json": pkg({ name: "tip-calculator", version: "1.0.0" }) };
    const p = plan(files, ["src/app.js"]);
    expect(p).toMatchObject({ kind: "static", hosting: "static", evidence: ["index.html, and a package.json that installs and runs nothing"] });
    expect(p.destinations[0]).toMatchObject({ id: "farbaek_sites", available: true });
    expect(runProfile(["index.html", "package.json", "src/app.js"], files["package.json"]).kind).toBe("static");
    // One that installs something isn't, and the reason doesn't ask for an index.html it already has.
    const busy = plan({ "index.html": "", "package.json": pkg({ devDependencies: { "live-server": "1.2.2" } }) });
    expect(busy.kind).toBe("unknown");
    expect(busy.destinations[0]!.reason).toContain("it has an index.html, but its package.json installs or runs something");
  });

  it("reads a Next.js app with its own scripts, or the framework's defaults marked as assumed", () => {
    const withScripts = plan({ "package.json": pkg({ scripts: { build: "next build", start: "next start" }, dependencies: { next: "16.4.0" } }), "next.config.ts": "export default {}" });
    expect(withScripts).toMatchObject({ kind: "nextjs", hosting: "server", build: { command: "npm run build", source: "found" }, start: { command: "npm run start", source: "found" } });
    const bare = plan({ "package.json": pkg({ dependencies: { next: "16.4.0" } }) });
    expect(bare).toMatchObject({ kind: "nextjs", evidence: ["next in package.json"], build: { command: "next build", source: "assumed" } });
    expect(bare.destinations[0]!.available).toBe(false);
  });

  it("tells Vite and Astro apart and says they need a build first", () => {
    expect(plan({ "package.json": pkg({ scripts: { build: "vite build" }, devDependencies: { vite: "7.0.0" } }), "vite.config.ts": "" })).toMatchObject({ kind: "vite", hosting: "static", output: { command: "dist", source: "assumed" } });
    const astro = plan({ "package.json": pkg({ dependencies: { astro: "5.0.0" } }) });
    expect(astro).toMatchObject({ kind: "astro", build: { command: "astro build", source: "assumed" } });
    expect(astro.notes.join(" ")).toMatch(/build step first/);
    expect(astro.destinations[0]!.reason).toMatch(/build step/);
  });

  it("reads a Node server and a Python app, and an unknown project honestly", () => {
    const node = plan({ "package.json": pkg({ main: "server.js", dependencies: { express: "5.0.0" } }) });
    expect(node).toMatchObject({ kind: "node_server", evidence: ["express in package.json"], start: { command: "node server.js", source: "assumed" } });
    expect(node.notes.join(" ")).toMatch(/doesn't say which Node.js version/);
    const py = plan({ "requirements.txt": "fastapi==0.115\nuvicorn\npsycopg[binary]\n", Procfile: "web: uvicorn api:app --port $PORT\n" });
    expect(py).toMatchObject({ kind: "python", hosting: "server", start: { command: "uvicorn api:app --port $PORT", source: "found" } });
    expect(py.services).toEqual([{ kind: "database", via: "psycopg" }]);
    expect(plan({ "README.md": "# Notes" })).toMatchObject({ kind: "unknown", hosting: "unknown", notes: [expect.stringMatching(/no index.html or package.json/)] });
  });

  it("collects setting names from the example file and the code, flags public ones, and skips built-ins", () => {
    const p = plan({
      "package.json": pkg({ dependencies: { next: "16.4.0", "@supabase/supabase-js": "2.0.0", stripe: "18.0.0" } }),
      ".env.example": "# Database\nDATABASE_URL=postgres://user:hunter2@db/app\nexport STRIPE_SECRET_KEY=sk_live_abc\nlowercase=no\n",
      "src/app/page.tsx": 'const url = process.env.NEXT_PUBLIC_SUPABASE_URL; if (process.env.NODE_ENV === "x") {}',
      "src/server/pay.ts": 'const key = process.env["STRIPE_SECRET_KEY"]; const leak = process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY;',
    });
    expect(p.envNames).toEqual([
      { name: "DATABASE_URL", public: false, seenIn: ["example"] },
      { name: "STRIPE_SECRET_KEY", public: false, seenIn: ["code", "example"] },
      { name: "NEXT_PUBLIC_SERVICE_ROLE_KEY", public: true, seenIn: ["code"] },
      { name: "NEXT_PUBLIC_SUPABASE_URL", public: true, seenIn: ["code"] },
    ]);
    expect(p.services.map((s) => s.kind)).toEqual(["database", "payments"]);
    expect(p.notes.join(" ")).toMatch(/NEXT_PUBLIC_SERVICE_ROLE_KEY looks like a secret/);
    // Values never survive planning.
    expect(JSON.stringify(p)).not.toMatch(/hunter2|sk_live/);
  });

  it("reads env names the ways each language writes them", () => {
    expect(envNamesInCode('import.meta.env.VITE_API; Deno.env.get("TOKEN_A"); os.environ["DB_URL"]; os.getenv("SECRET_B"); os.environ.get("C_KEY")')).toEqual([
      "VITE_API",
      "TOKEN_A",
      "DB_URL",
      "C_KEY",
      "SECRET_B",
    ]);
    // One-letter names are too short to be settings; comments aren't read.
    expect(envExampleNames("A=1\n  B_C = 2\n#D=3\nexport E_F=\n")).toEqual(["B_C", "E_F"]);
  });

  it("agrees with the starters' run profile on static and Next.js projects", () => {
    expect(runProfile(["index.html", "styles.css"]).kind).toBe("static");
    expect(plan({ "index.html": "" }, ["styles.css"]).kind).toBe("static");
    expect(runProfile(["package.json", "next.config.ts"]).kind).toBe("node");
    expect(plan({ "package.json": pkg({ dependencies: { next: "1" } }), "next.config.ts": "" }).hosting).toBe("server");
  });

  it("reads the key files and a capped set of source files, never node_modules or hidden folders", () => {
    const paths = ["package.json", ".env.example", "src/a.ts", "node_modules/x/index.js", ".farbaek/skills/s.md", ".github/x.js", "README.md", ...Array.from({ length: 250 }, (_, i) => `src/f${i}.ts`)];
    const read = filesToRead(paths);
    expect(read.slice(0, 2)).toEqual(["package.json", ".env.example"]);
    expect(read).not.toContain("node_modules/x/index.js");
    expect(read).not.toContain(".github/x.js");
    expect(read.length).toBe(202);
  });
});
