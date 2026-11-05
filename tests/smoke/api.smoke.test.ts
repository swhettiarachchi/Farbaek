/**
 * End-to-end API smoke test through a running Farbaek server: sign-in token,
 * database, Guard, runtime and cleanup together. Skipped unless run with
 * `pnpm sandbox:smoke` and these are set:
 *
 *   FARBAEK_SMOKE_BASE_URL       e.g. http://localhost:3000
 *   FARBAEK_SMOKE_ACCESS_TOKEN   a signed-in person's Supabase access token
 *   FARBAEK_SMOKE_WORKSPACE      optional workspace id, on Lite or up: a token is the developer API (ADR 0175)
 *
 * It starts a small session with no network, runs one harmless command,
 * reads its recorded output back, and stops the session.
 */
import { afterAll, describe, expect, it } from "vitest";
import { FarbaekSandboxClient } from "@/sdk/sandbox-client";

const base = process.env.FARBAEK_SMOKE_BASE_URL;
const token = process.env.FARBAEK_SMOKE_ACCESS_TOKEN;
const enabled = import.meta.env.MODE === "smoke" && Boolean(base && token);
let sessionId: string | null = null;

describe.skipIf(!enabled)("sandbox API smoke test", () => {
  const client = new FarbaekSandboxClient({ baseUrl: base ?? "", accessToken: token, workspaceId: process.env.FARBAEK_SMOKE_WORKSPACE });

  afterAll(async () => {
    if (sessionId) await client.stop(sessionId).catch(() => undefined);
  });

  it("reports a sandboxed runtime", async () => {
    const health = await client.health();
    expect(health.execution.mode).toBe("sandboxed");
    expect(health.runtime.reachable).toBe(true);
  });

  it("starts a session, runs a command, reads the output and stops", async () => {
    const session = await client.create({ name: "API smoke test", template: "node-ts", size: "small", network: "none", minutes: 10 });
    sessionId = session.id;
    expect(session.state).toBe("ready");

    const events = [];
    for await (const e of client.runStream(session.id, "echo farbaek-api-smoke")) events.push(e);
    const end = events.at(-1);
    expect(end?.type).toBe("end");
    if (end?.type !== "end") return;
    expect(end.execution).toMatchObject({ state: "succeeded", exitCode: 0 });
    expect(end.execution.stdout).toContain("farbaek-api-smoke");

    const recorded = await client.execution(session.id, end.execution.id);
    expect(recorded.stdout).toBe(end.execution.stdout);

    const stopped = await client.stop(session.id);
    expect(["terminated", "stopping"]).toContain(stopped.state);
    sessionId = null;
  }, 180_000);
});
