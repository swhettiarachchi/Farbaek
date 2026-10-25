import { describe, expect, it } from "vitest";
import type { Notifier } from "@/server/email/notify";
import { combineNotifiers, createPushNotifier, type PushDeps } from "./notifier";
import type { PushMessage, PushOutcome } from "./send";
import { vapidKeys } from "./web-push";

const KEYS = vapidKeys({ SUPABASE_SECRET_KEY: "sb_secret_example" })!;
const device = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, p256dh: "p", auth: "a" });

function fakes(outcomes: PushOutcome[] = ["sent", "sent"]) {
  const sent: { endpoint: string; message: PushMessage }[] = [];
  const noted: [string, PushOutcome][] = [];
  const deps: PushDeps = {
    keys: KEYS,
    devices: async () => outcomes.map((_, i) => device(i)),
    note: async (e, o) => void noted.push([e, o]),
    send: async (_k, sub, message) => (sent.push({ endpoint: sub.endpoint, message }), outcomes[Number(sub.endpoint.split("/").pop())]!),
  };
  return { deps, sent, noted };
}

describe("push notifications", () => {
  it("tells every device of a finished build, in the email's words, opening the task", async () => {
    const f = fakes();
    await createPushNotifier(f.deps).buildFinished({ userId: "u1", taskId: "t1", taskTitle: "Fix the cart total", status: "finished", outcome: "Finished. The change is waiting for your review." });
    expect(f.sent).toHaveLength(2);
    expect(f.sent[0]!.message).toEqual({ title: "Ready to review: Fix the cart total", body: "Finished. The change is waiting for your review.", url: "/app/tasks/t1", tag: "task:t1" });
  });

  it("sends nothing for a build the person cancelled", async () => {
    const f = fakes();
    await createPushNotifier(f.deps).buildFinished({ userId: "u1", taskId: "t1", taskTitle: "x", status: "cancelled", outcome: "Cancelled." });
    expect(f.sent).toEqual([]);
  });

  it("says how checks ended, and records what each device's push service said", async () => {
    const f = fakes(["sent", "gone"]);
    await createPushNotifier(f.deps).checksFinished({ userId: "u1", taskId: "t1", taskTitle: "Fix the cart total", result: "verified" });
    expect(f.sent[0]!.message.title).toBe("Checks passed: Fix the cart total");
    expect(f.noted).toEqual([
      [device(0).endpoint, "sent"],
      [device(1).endpoint, "gone"],
    ]);
  });

  it("tells every channel even when one fails", async () => {
    const calls: string[] = [];
    const broken: Notifier = {
      buildFinished: async () => {
        throw new Error("smtp down");
      },
      checksFinished: async () => undefined,
    };
    const fine: Notifier = { buildFinished: async () => void calls.push("push"), checksFinished: async () => undefined };
    await combineNotifiers(broken, null, fine)!.buildFinished({ userId: "u1", taskId: "t1", taskTitle: "x", status: "finished", outcome: "Done." });
    expect(calls).toEqual(["push"]);
    expect(combineNotifiers(null, null)).toBeNull();
  });
});
