import { describe, expect, it } from "vitest";
import type { ListedModel } from "@/core/ai/model-watch";
import { runModelWatch, type ModelAlertKind, type ModelWatchDeps } from "./model-watch";

const NOW = new Date("2026-10-26T09:00:00Z");
const listed: ListedModel[] = [
  { id: "claude-sonnet-5-5", displayName: "Claude Sonnet 5.5", createdAt: "2026-09-01T00:00:00Z" },
  { id: "claude-sonnet-5-6", displayName: "Claude Sonnet 5.6", createdAt: "2026-10-20T00:00:00Z" },
];

function fakes(over: { last?: string | null; email?: boolean; claim?: boolean; sendFails?: boolean } = {}) {
  const recorded: unknown[] = [];
  const sent: { subject: string; text: string }[] = [];
  const finished: [ModelAlertKind, string][] = [];
  const deps: ModelWatchDeps = {
    list: async () => listed,
    configured: () => ({ standard: "claude-sonnet-5-5", frontier: "claude-fable-5-1" }),
    lastCheckedAt: async () => over.last ?? null,
    record: async (l, f) => {
      recorded.push({ listed: l.length, findings: f.length });
    },
    email:
      over.email === false
        ? null
        : {
            config: { fromName: "Farbaek", fromAddress: "hello@farbaek.com" } as never,
            to: "info@farbaek.com",
            claim: async () => over.claim ?? true,
            finish: async (_day, kind, status) => {
              finished.push([kind, status]);
            },
            send: async (m) => {
              if (over.sendFails) throw new Error("mail server refused");
              sent.push({ subject: m.subject, text: m.text });
            },
          },
  };
  return { deps, recorded, sent, finished };
}

describe("the daily model check", () => {
  it("records what it found and tells the owner once per kind", async () => {
    const f = fakes();
    const run = await runModelWatch(f.deps, NOW);
    expect(run).toMatchObject({ status: "checked", told: { model_missing: "accepted", model_newer: "accepted" } });
    expect(f.recorded).toEqual([{ listed: 2, findings: 2 }]);
    expect(f.sent.map((s) => s.subject)).toEqual(["Farbaek: a model in use is no longer listed by Anthropic", "Farbaek: a newer model is available"]);
    expect(f.sent[1]!.text).toMatch(/Nothing has been switched/);
  });

  it("checks at most once a day", async () => {
    expect(await runModelWatch(fakes({ last: "2026-10-26T01:00:00Z" }).deps, NOW)).toEqual({ status: "skipped", reason: "Already checked today." });
    expect((await runModelWatch(fakes({ last: "2026-10-25T23:00:00Z" }).deps, NOW)).status).toBe("checked");
  });

  it("still records the check without email, doesn't send what another run claimed, and records a refused email", async () => {
    const quiet = fakes({ email: false });
    expect(await runModelWatch(quiet.deps, NOW)).toMatchObject({ status: "checked", told: {} });
    expect(quiet.recorded).toHaveLength(1);
    const claimed = fakes({ claim: false });
    expect((await runModelWatch(claimed.deps, NOW)) as { told: unknown }).toMatchObject({ told: { model_missing: "not_claimed" } });
    expect(claimed.sent).toEqual([]);
    const refused = fakes({ sendFails: true });
    await runModelWatch(refused.deps, NOW);
    expect(refused.finished).toEqual([
      ["model_missing", "failed"],
      ["model_newer", "failed"],
    ]);
  });
});
