/**
 * Sensitive information disclosure, system prompt leakage and improper output
 * handling (LLM02, LLM05, LLM07). Secret-shaped values are built at run time
 * so no credential-looking string sits in the repository.
 */
import { afterEach, describe, expect, it } from "vitest";
import { commandEnv } from "@/agent-runtime/broker";
import { agentSystemPrompt, openingMessage } from "@/agent-runtime/loop";
import { decide } from "@/core/agent/permissions";
import { ContractDraftSchema, draftToForm } from "@/core/realityloop/contract-draft";
import { acceptSuggestion, type LensRequest } from "@/core/realityloop/lens-suggestion";
import { containsSecret, screenFile } from "@/core/workspace/files";
import { redact } from "@/server/observability/log";
import { CONTRACT, project, type Project } from "./support";

const fake = {
  anthropic: ["sk", "ant", "api03"].join("-") + "-" + "Q".repeat(40),
  aws: "AKIA" + "Z".repeat(16),
  github: "ghp" + "_" + "x".repeat(36),
  supabase: "sb" + "_secret_" + "y".repeat(24),
  stripe: "sk" + "_live_" + "w".repeat(24),
  pem: ["-----BEGIN", "RSA PRIVATE KEY-----"].join(" ") + "\nMIIE\n-----END RSA PRIVATE KEY-----",
};

let p: Project | null = null;
afterEach(async () => {
  await p?.cleanup();
  p = null;
});

describe("SE-014 Secrets written into the project", () => {
  it("refuses credential files and credential-shaped content on import", () => {
    for (const name of [".env", ".env.production", "id_rsa", "server.pem", "deploy.key", ".npmrc", "credentials.json"]) {
      expect(screenFile(name, "x", 1, 1_000_000), name).toMatchObject({ ok: false, reason: "secret_file" });
    }
    expect(screenFile(".env.example", "API_KEY=", 8, 1_000_000)).toMatchObject({ ok: true });
    for (const [kind, value] of Object.entries(fake)) {
      expect(containsSecret(`const key = "${value}";`), kind).toBe(true);
      expect(screenFile("src/config.ts", `export const key = "${value}";\n`, 80, 1_000_000), kind).toMatchObject({ ok: false, reason: "secret_content" });
    }
  });

  it("refuses the agent writing a credential into a file it may otherwise change", () => {
    const ctx = { mode: "controlled" as const, contract: CONTRACT, sandboxVerified: false, exists: (path: string) => path === "README.md" };
    expect(decide({ name: "write_file", input: { path: "docs/setup.md", content: `Use ${fake.anthropic}`, reason: "r" } }, ctx)).toMatchObject({ kind: "deny", reason: expect.stringMatching(/secret/) });
    expect(decide({ name: "edit_file", input: { path: "README.md", edits: [{ find: "tests", replace: fake.github }], reason: "r" } }, ctx)).toMatchObject({ kind: "deny" });
    expect(decide({ name: "write_file", input: { path: "docs/.env", content: "X=1", reason: "r" } }, ctx)).toMatchObject({ kind: "deny" });
  });
});

describe("SE-015 Secrets inherited by commands", () => {
  it("passes only allowlisted variable names to commands", () => {
    const env = commandEnv({
      PATH: "/usr/bin",
      HOME: "/home/dev",
      ANTHROPIC_API_KEY: fake.anthropic,
      SUPABASE_SECRET_KEY: fake.supabase,
      AWS_SECRET_ACCESS_KEY: "s".repeat(40),
      GITHUB_TOKEN: fake.github,
      DATABASE_URL: "postgres://user:pass@db/prod",
      NPM_TOKEN: "n".repeat(36),
      NODE_OPTIONS: "--require /tmp/evil.js",
    });
    expect(Object.keys(env).sort()).toEqual(["CI", "FORCE_COLOR", "HOME", "NO_COLOR", "NO_UPDATE_NOTIFIER", "PATH"]);
    expect(JSON.stringify(env)).not.toMatch(/pass@db|evil\.js/);
  });
});

describe("SE-016 Secrets in what the model reads", () => {
  it("keeps environment values out of the system prompt and the opening message, and redacts secrets in run events", async () => {
    const planted = `planted-${"v".repeat(24)}`;
    process.env.FARBAEK_EVAL_PLANTED = planted;
    try {
      p = await project({ "README.md": "# Demo\n" });
      const ws = await p.workspace("patch");
      const texts = [
        agentSystemPrompt("review_only", null),
        agentSystemPrompt("controlled", "local"),
        agentSystemPrompt("sandboxed_autopilot", "sandbox"),
        openingMessage({ task: { id: "t1", title: "Name the test command", contractVersion: 1, contract: CONTRACT }, mode: "controlled", workspace: ws }),
      ];
      for (const t of texts) {
        expect(t).not.toContain(planted);
        for (const value of Object.values(process.env)) if (value && value.length >= 12) expect(t.includes(value)).toBe(false);
      }
    } finally {
      delete process.env.FARBAEK_EVAL_PLANTED;
    }
    // Run events (shown to people and logged) have secrets taken out.
    expect(redact(`curl -H "Authorization: Bearer x" -d api_key=${fake.anthropic}`)).not.toContain(fake.anthropic);
    expect(redact(`token: ${"t".repeat(30)}`)).toBe("token: [redacted]");
  });
});

describe("SE-017 Model output trusted as fact", () => {
  it("keeps only AI suggestions for hunks that were sent and clauses that exist", () => {
    const request: LensRequest = {
      clauses: [{ id: "outcome", label: "Outcome", statement: "s" }, { id: "ac-1", label: "AC-1", statement: "s" }],
      hunks: [{ id: "f0h0", path: "README.md", range: "1", reason: "", flags: [], removed: [], added: [] }],
    };
    const accepted = acceptSuggestion(request, {
      mappings: [
        { hunk: "f9h9", clause: "ac-1", reason: "A hunk that was never sent." },
        { hunk: "f0h0", clause: "ac-99", reason: "A clause the contract doesn't have." },
        { hunk: "f0h0", clause: "AC-1", reason: "  The real\nmapping.  " },
        { hunk: "f0h0", clause: "outcome", reason: "A second answer for the same hunk." },
      ],
    });
    expect(accepted).toEqual([{ hunk: "f0h0", clause: "ac-1", reason: "The real mapping." }]);
  });

  it("refuses AI contract drafts that don't match the schema, and never lets one allow what it also forbids", () => {
    expect(ContractDraftSchema.safeParse({ outcome: "x" }).success).toBe(false);
    expect(ContractDraftSchema.safeParse({ outcome: 1, resources: "all" }).success).toBe(false);
    const draft = ContractDraftSchema.parse({
      outcome: "Ship it.\u0000\u001b[31m",
      resources: ["src"],
      allowedOperations: ["files.edit", "files.delete"],
      forbiddenOperations: ["files.delete"],
      protectedFields: [],
      protectedInvariants: [],
      acceptanceCriteria: [{ statement: "Works.", verification: "manual" }],
      requiredChecks: ["pnpm test"],
      assumptions: [],
      openQuestions: [],
      recovery: "Revert.",
      maxRecords: 1e12,
    });
    const form = draftToForm(draft);
    expect(form.allowed).toBe("files.edit");
    expect(form.forbidden).toBe("files.delete");
    expect(form.outcome).not.toMatch(/[\u0000-\u001f]/);
    expect(form.maxRecords).toBe("");
  });
});
