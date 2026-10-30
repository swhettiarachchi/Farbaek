import { describe, expect, it } from "vitest";
import type { AppContext } from "./context";
import { loadIntegrations } from "./integrations";
import type { AgentRecord } from "./types";

const lease = { expiresAt: "2099-01-01T00:00:00Z", projects: null, capabilities: ["read" as const], actionsPerHour: 600, setAt: null };
const agent = (over: Partial<AgentRecord>): AgentRecord => ({
  id: "a",
  name: "Office PC",
  platform: "windows",
  appVersion: null,
  pairedBy: "u1",
  createdAt: "2026-10-01T00:00:00Z",
  lastSeenAt: null,
  revokedAt: null,
  meshFingerprint: null,
  meshReachableAt: null,
  lease,
  ...over,
});

describe("the Integrations page's data", () => {
  it("counts paired and reachable agents, and says connections weren't read in the demo instead of 'not connected'", async () => {
    const ctx = {
      mode: "demo",
      reader: {
        listAgents: async () => [
          agent({ id: "1" }),
          agent({ id: "2", meshFingerprint: "f".repeat(64), meshReachableAt: "2026-10-02T00:00:00Z" }),
          agent({ id: "3", revokedAt: "2026-10-03T00:00:00Z", meshFingerprint: "f".repeat(64), meshReachableAt: "2026-10-02T00:00:00Z" }),
        ],
      },
    } as unknown as AppContext;
    const v = await loadIntegrations(ctx, "o1");
    expect(v.agents).toEqual({ paired: 2, reachable: 1 });
    expect(v.connections).toBeNull();
    expect(v.liveSites).toBeNull();
    expect(v.modelKey).toBeNull();
    expect(v.github).toBeNull();
  });

  it("treats agents it can't read as none, without failing the page", async () => {
    const ctx = { mode: "demo", reader: { listAgents: async () => Promise.reject(new Error("down")) } } as unknown as AppContext;
    expect((await loadIntegrations(ctx, "o1")).agents).toEqual({ paired: 0, reachable: 0 });
  });
});
