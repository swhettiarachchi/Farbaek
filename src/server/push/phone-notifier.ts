/**
 * The same moments as email and web push (ADR 0079), sent to the person's
 * connected iPhones through APNs (ADR 0110): a build finished, a change's
 * checks ended. A token Apple calls gone, or one that keeps failing, is
 * dropped by the database.
 */
import type { Notifier } from "@/server/email/notify";
import { log } from "@/server/observability/log";
import { http2Transport, sendApns, type ApnsConfig, type ApnsEnvironment, type ApnsTransport } from "./apns";
import { buildFinishedMessage, checksFinishedMessage } from "./notifier";
import type { PushMessage, PushOutcome } from "./send";

export interface PhonePushDeps {
  config: ApnsConfig;
  targets(userId: string): Promise<{ token: string; environment: ApnsEnvironment }[]>;
  note(token: string, outcome: PushOutcome): Promise<void>;
  transport?: () => ApnsTransport & { close?: () => void };
}

export async function pushToPhones(deps: PhonePushDeps, userId: string, message: PushMessage): Promise<number> {
  const targets = await deps.targets(userId);
  if (targets.length === 0) return 0;
  const transport = (deps.transport ?? http2Transport)();
  let sent = 0;
  try {
    for (const t of targets) {
      const outcome = await sendApns(deps.config, transport, t, message);
      if (outcome === "sent") sent++;
      await deps.note(t.token, outcome).catch(() => undefined);
    }
  } finally {
    transport.close?.();
  }
  return sent;
}

export function createPhonePushNotifier(deps: PhonePushDeps): Notifier {
  async function deliver(kind: string, userId: string, message: PushMessage | null) {
    if (!message) return;
    try {
      const sent = await pushToPhones(deps, userId, message);
      if (sent > 0) log("info", "push.phone_sent", { kind, phones: sent });
    } catch (e) {
      log("warn", "push.phone_failed", { kind, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
    }
  }
  return {
    buildFinished: (n) => deliver("build_finished", n.userId, buildFinishedMessage(n)),
    checksFinished: (n) => deliver("checks_finished", n.userId, checksFinishedMessage(n)),
  };
}
