import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { priorityWorkspaces, toQueueRows } from "./support-data";

const org = (id: string, paid: string | null) => ({
  id,
  name: id,
  created_at: "2026-10-01T00:00:00Z",
  billing_accounts: { state: paid ? "active" : "free", paid_plan_id: paid, paid_through: null, suspended_reason: null },
  trials: null,
});
const fake = (result: { data: unknown; error: unknown }) => ({ from: () => ({ select: () => ({ in: async () => result }) }) }) as unknown as SupabaseClient;

describe("priority support in the queue (ADR 0084)", () => {
  it("marks workspaces whose plan includes it", async () => {
    const admin = fake({ data: [org("o-max", "max"), org("o-pro", "pro"), org("o-free", null)], error: null });
    expect([...(await priorityWorkspaces(admin, ["o-max", "o-pro", "o-free", "o-max"]))]).toEqual(["o-max"]);
  });

  it("marks nobody when plans can't be read, so the queue keeps its own order", async () => {
    expect((await priorityWorkspaces(fake({ data: null, error: { message: "down" } }), ["o-max"])).size).toBe(0);
    expect((await priorityWorkspaces(fake({ data: [], error: null }), [])).size).toBe(0);
  });

  it("carries the mark onto queue rows", () => {
    const row = { id: "00000000-0000-4000-8000-000000000001", subject: "Help", topic: "other" as const, status: "waiting_on_farbaek" as const, orgId: "00000000-0000-4000-8000-0000000000a1", workspace: "Shop", email: "a@b.co", assignedTo: null, assignedEmail: null, waiting_since: "2026-10-25T09:00:00Z", messages: 1 };
    const [marked] = toQueueRows([row], { userId: "u1", showEmail: true }, new Set([row.orgId]));
    expect(marked).toMatchObject({ priority: true });
    expect(toQueueRows([{ ...row, orgId: null }], { userId: "u1", showEmail: true }, new Set([row.orgId]))[0]).toMatchObject({ priority: false });
  });
});
