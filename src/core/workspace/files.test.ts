import { describe, expect, it } from "vitest";
import { buildTree, checkPath, containsSecret, languageOf, screenFile, screenPath, stripRootFolder } from "./files";

// Fake credentials are assembled at runtime so this file never contains one literally.
const fake = (...parts: string[]) => parts.join("");

describe("checkPath", () => {
  it("accepts ordinary relative paths and drops a leading ./", () => {
    expect(checkPath("src/app/page.tsx")).toEqual({ ok: true, path: "src/app/page.tsx" });
    expect(checkPath("./README.md")).toEqual({ ok: true, path: "README.md" });
    expect(checkPath(".github/workflows/ci.yml")).toMatchObject({ ok: true });
  });

  it.each([
    ["", "empty"],
    ["/etc/passwd", "relative"],
    ["../outside.txt", '".."'],
    ["src/../../x", '".."'],
    ["src/./a.ts", '"."'],
    ["src//a.ts", "empty folder"],
    ["src/", "empty folder"],
    ["src\\a.ts", "backslash"],
    ["src/a\u0000.ts", "control"],
    ["a/".repeat(30) + "x", "deep"],
    ["x".repeat(301), "longer"],
  ])("rejects %j", (path, reason) => {
    const result = checkPath(path);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(reason);
  });
});

describe("screening an import", () => {
  const LIMIT = 1024;
  const screen = (path: string, content = "export {};") => screenFile(path, content, new TextEncoder().encode(content).length, LIMIT);

  it("accepts source files", () => {
    expect(screen("src/index.ts")).toEqual({ ok: true, path: "src/index.ts" });
    expect(screen(".env.example", "API_URL=")).toMatchObject({ ok: true });
    expect(screen("keys/id_ed25519.pub", "ssh-ed25519 AAAA")).toMatchObject({ ok: true });
  });

  it("skips dependency, VCS and build folders anywhere in the path", () => {
    // On Windows and macOS, .GIT is the real .git.
    for (const p of ["node_modules/react/index.js", ".git/config", ".GIT/config", ".Git/hooks/pre-commit", "NODE_MODULES/x.js", "apps/web/.next/server.js", "packages/ui/dist/index.js", ".DS_Store"]) {
      expect(screenPath(p)).toEqual({ ok: false, reason: "ignored_folder" });
    }
  });

  it("skips credential files by name", () => {
    for (const p of [".env", ".env.local", "config/.env.production", "certs/server.pem", "deploy.key", "id_rsa", ".npmrc"]) {
      expect(screenPath(p), p).toEqual({ ok: false, reason: "secret_file" });
    }
  });

  it("skips files whose content looks like a credential", () => {
    const samples = [
      fake("-----BEGIN ", "RSA PRIVATE KEY-----\nabc"),
      fake("const k = 'AKIA", "ABCDEFGHIJKLMNOP';"),
      fake("ANTHROPIC=sk-ant-", "api03-", "x".repeat(30)),
      fake("token: gh", "p_", "a".repeat(36)),
      fake("SUPABASE_SECRET_KEY=sb_secret_", "abcdefghijkl"),
      fake("stripe('sk_", "live_", "a".repeat(24), "')"),
      fake("GOOGLE=AI", "za", "a".repeat(35)),
      fake("WEBHOOK=whs", "ec_", "a".repeat(32)),
      fake("TOKEN=glp", "at-", "a".repeat(20)),
      fake("//registry.npmjs.org/:_authToken=np", "m_", "a".repeat(36)),
      fake("FARBAEK=f", "a_", "a".repeat(40)),
      // A developer API key (ADR 0187), as a CI file might carry it.
      fake("FARBAEK_API_KEY=fb", "k_", "a".repeat(43)),
    ];
    for (const content of samples) expect(screen("src/config.ts", content)).toEqual({ ok: false, reason: "secret_content" });
  });

  it("doesn't flag ordinary code that mentions key names", () => {
    expect(containsSecret("const apiKey = process.env.ANTHROPIC_API_KEY;\n// starts with sk-ant-")).toBe(false);
  });

  it("skips binary content and files over the limit", () => {
    expect(screen("logo.png", "PNG\u0000\u0001")).toEqual({ ok: false, reason: "binary" });
    expect(screen("big.txt", "x".repeat(LIMIT + 1))).toEqual({ ok: false, reason: "too_large" });
  });

  it("reports why a path isn't allowed", () => {
    expect(screen("../escape.ts")).toMatchObject({ ok: false, reason: "invalid_path", detail: expect.stringContaining("..") });
  });
});

describe("helpers", () => {
  it("strips the uploaded folder's own name", () => {
    expect(stripRootFolder("my-app/src/a.ts")).toBe("src/a.ts");
    expect(stripRootFolder("README.md")).toBe("README.md");
  });

  it("labels languages by extension", () => {
    expect(languageOf("src/app/page.tsx")).toBe("TypeScript (JSX)");
    expect(languageOf("Dockerfile")).toBe("Dockerfile");
    expect(languageOf("LICENSE")).toBe("Text");
  });

  it("builds a tree with folders first, each level sorted", () => {
    const tree = buildTree(["src/b.ts", "README.md", "src/a.ts", "src/lib/x.ts", "package.json"]);
    expect(tree.map((n) => n.name)).toEqual(["src", "package.json", "README.md"]);
    expect(tree[0]!.children!.map((n) => n.name)).toEqual(["lib", "a.ts", "b.ts"]);
    expect(tree[0]!.children![0]).toEqual({ name: "lib", path: "src/lib", children: [{ name: "x.ts", path: "src/lib/x.ts" }] });
  });
});
