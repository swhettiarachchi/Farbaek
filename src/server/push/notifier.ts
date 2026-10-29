/**
 * Push notifications for the same moments as email (ADR 0079): a build
 * someone started has finished, and a change's checks have ended. The words
 * are the email's own. A device gets them only after its person turned
 * notifications on there; a device its push service calls gone is removed.
 */
import { checksEmail, runEmail, type Notifier } from "@/server/email/notify";
import { log } from "@/server/observability/log";
import { sendPush, type PushMessage, type PushOutcome, type PushSubscriptionKeys } from "./send";
import type { VapidKeys } from "./web-push";

export interface PushDeps {
  keys: VapidKeys;
  devices(userId: string): Promise<PushSubscriptionKeys[]>;
  note(endpoint: string, outcome: PushOutcome): Promise<void>;
  send?: typeof sendPush;
}

const line = (s: string, max: number) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

/** Sends one message to every device a person turned notifications on for. Returns how many took it. */
export async function pushToPerson(deps: PushDeps, userId: string, message: PushMessage): Promise<number> {
  const send = deps.send ?? sendPush;
  let sent = 0;
  for (const device of await deps.devices(userId)) {
    const outcome = await send(deps.keys, device, message);
    if (outcome === "sent") sent++;
    await deps.note(device.endpoint, outcome).catch(() => undefined);
  }
  return sent;
}

/** The words for a finished build, as its email says them; null when there's nothing to say. */
export function buildFinishedMessage(n: Parameters<Notifier["buildFinished"]>[0]): PushMessage | null {
  const email = runEmail(n);
  return email ? { title: email.subject, body: line(email.lines[0] ?? "", 160), url: `/app/tasks/${encodeURIComponent(n.taskId)}`, tag: `task:${n.taskId}` } : null;
}

export function checksFinishedMessage(n: Parameters<Notifier["checksFinished"]>[0]): PushMessage {
  const email = checksEmail(n);
  return { title: email.subject, body: line(email.lines[0] ?? "", 160), url: `/app/tasks/${encodeURIComponent(n.taskId)}`, tag: `checks:${n.taskId}` };
}

export function createPushNotifier(deps: PushDeps): Notifier {
  async function deliver(kind: string, userId: string, message: PushMessage | null) {
    if (!message) return;
    try {
      const sent = await pushToPerson(deps, userId, message);
      if (sent > 0) log("info", "push.sent", { kind, devices: sent });
    } catch (e) {
      log("warn", "push.failed", { kind, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
    }
  }
  return {
    buildFinished: (n) => deliver("build_finished", n.userId, buildFinishedMessage(n)),
    checksFinished: (n) => deliver("checks_finished", n.userId, checksFinishedMessage(n)),
  };
}

/** One notifier that tells each channel; one failing never stops another. */
export function combineNotifiers(...list: (Notifier | null)[]): Notifier | null {
  const live = list.filter((n): n is Notifier => n !== null);
  if (live.length === 0) return null;
  if (live.length === 1) return live[0]!;
  return {
    buildFinished: async (n) => void (await Promise.allSettled(live.map((x) => x.buildFinished(n)))),
    checksFinished: async (n) => void (await Promise.allSettled(live.map((x) => x.checksFinished(n)))),
  };
}
