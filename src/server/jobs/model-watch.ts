/**
 * The daily model check (ADR 0090), run with the hourly jobs but at most
 * once a UTC day: what Anthropic lists, set against the models Farbaek
 * routes to. It records every check, and tells the owner by email about
 * each kind of finding once a day. It changes nothing: switching a model
 * takes a canary and an owner.
 */
import { findingWords, watchFindings, type ListedModel, type WatchFinding } from "@/core/ai/model-watch";
import type { EmailMessage } from "@/server/email/message";
import type { EmailConfig } from "@/server/email/config";

export type ModelAlertKind = "model_missing" | "model_newer";

export interface ModelWatchDeps {
  /** The models Anthropic lists; throws when it can't be reached. */
  list(): Promise<ListedModel[]>;
  /** The model each tier routes to now, switches included. */
  configured(): Record<string, string>;
  lastCheckedAt(): Promise<string | null>;
  record(listed: ListedModel[], findings: WatchFinding[]): Promise<void>;
  /** Email, when this server sends it; null records checks without telling anyone. */
  email: {
    config: EmailConfig;
    to: string;
    claim(day: string, kind: ModelAlertKind): Promise<boolean>;
    finish(day: string, kind: ModelAlertKind, status: "accepted" | "failed", detail: string | null): Promise<void>;
    send(message: EmailMessage): Promise<void>;
  } | null;
}

export type ModelWatchRun = { status: "skipped"; reason: string } | { status: "checked"; findings: WatchFinding[]; told: Partial<Record<ModelAlertKind, "accepted" | "failed" | "not_claimed">> };

const SUBJECTS: Record<ModelAlertKind, string> = {
  model_missing: "Farbaek: a model in use is no longer listed by Anthropic",
  model_newer: "Farbaek: a newer model is available",
};

export async function runModelWatch(deps: ModelWatchDeps, now: Date): Promise<ModelWatchRun> {
  const day = now.toISOString().slice(0, 10);
  const last = await deps.lastCheckedAt();
  if (last && last.slice(0, 10) === day) return { status: "skipped", reason: "Already checked today." };

  const listed = await deps.list();
  const findings = watchFindings(deps.configured(), listed);
  await deps.record(listed, findings);

  const told: Partial<Record<ModelAlertKind, "accepted" | "failed" | "not_claimed">> = {};
  if (!deps.email) return { status: "checked", findings, told };
  for (const kind of ["model_missing", "model_newer"] as const) {
    const these = findings.filter((f) => (kind === "model_missing" ? f.kind === "missing" : f.kind === "newer"));
    if (these.length === 0) continue;
    if (!(await deps.email.claim(day, kind))) {
      told[kind] = "not_claimed";
      continue;
    }
    const lines = [...these.map(findingWords), "Nothing has been switched. In Office Space, open Models to run a canary, then decide."];
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const message: EmailMessage = {
      fromName: deps.email.config.fromName,
      fromAddress: deps.email.config.fromAddress,
      to: deps.email.to,
      subject: SUBJECTS[kind],
      text: lines.join("\n\n"),
      html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#121317;font-size:16px;line-height:1.55;max-width:560px">${lines.map((l) => `<p style="margin:0 0 14px">${escape(l)}</p>`).join("")}</div>`,
    };
    try {
      await deps.email.send(message);
      await deps.email.finish(day, kind, "accepted", null);
      told[kind] = "accepted";
    } catch (e) {
      await deps.email.finish(day, kind, "failed", (e instanceof Error ? e.message : String(e)).slice(0, 300));
      told[kind] = "failed";
    }
  }
  return { status: "checked", findings, told };
}
