import { describe, expect, it } from "vitest";
import { closeSupportRequest, openSupportRequest, replyToSupportRequest, type SupportRpc } from "./support";

const ACTOR = "00000000-0000-4000-8000-00000000a11c";

function fakeRpc(answer: { data?: unknown; error?: string }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: SupportRpc = async (fn, args) => {
    calls.push({ fn, args });
    return { data: answer.data ?? null, error: answer.error ? { message: answer.error } : null };
  };
  return { rpc, calls };
}

describe("support writes", () => {
  it("checks a new request before the database, and sends it tidied with the verified person", async () => {
    const t = fakeRpc({ data: "thread-1" });
    expect(await openSupportRequest(t.rpc, ACTOR, { orgId: null, topic: "billing", subject: "  Trial   end ", body: " When? " })).toEqual({ ok: true, value: "thread-1" });
    expect(t.calls).toEqual([{ fn: "app_support_open", args: { p_actor: ACTOR, p_org: null, p_topic: "billing", p_subject: "Trial end", p_body: "When?" } }]);

    const none = fakeRpc({});
    expect(await openSupportRequest(none.rpc, ACTOR, { orgId: null, topic: "billing", subject: "Hi", body: "When?" })).toMatchObject({ ok: false, code: "INVALID_SUBJECT" });
    expect(await replyToSupportRequest(none.rpc, ACTOR, "thread-1", "   ")).toMatchObject({ ok: false, code: "INVALID_BODY" });
    expect(none.calls).toEqual([]);
  });

  it("turns the database's refusals into plain messages", async () => {
    expect(await openSupportRequest(fakeRpc({ error: "SUPPORT_LIMIT" }).rpc, ACTOR, { orgId: null, topic: "other", subject: "Hello there", body: "Hi" })).toMatchObject({ ok: false, code: "SUPPORT_LIMIT" });
    expect(await replyToSupportRequest(fakeRpc({ error: "THREAD_MISSING" }).rpc, ACTOR, "x", "Hi")).toMatchObject({ ok: false, code: "THREAD_MISSING", message: expect.stringContaining("isn't yours") });
    expect(await closeSupportRequest(fakeRpc({ error: "connection reset" }).rpc, ACTOR, "x")).toMatchObject({ ok: false, code: "UNKNOWN" });
    expect(await openSupportRequest(fakeRpc({ error: "FORBIDDEN" }).rpc, ACTOR, { orgId: "o", topic: "other", subject: "Hello there", body: "Hi" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});
