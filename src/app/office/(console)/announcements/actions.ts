"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { OfficeFormState } from "@/components/office/action-form";
import { staffAction } from "@/server/office/access";
import { requestMeta } from "@/server/office/request-meta";
import { OFFICE_MESSAGES } from "@/server/office/staff-store";

/** A message across the top of everyone's app. Incidents stay until ended; notices can be closed. */
export async function publishAnnouncementAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("announcements.manage");
  if (!gate.ok) return { ok: false, message: gate.message };
  const tone = form.get("tone") === "incident" ? "incident" : "info";
  const hours = Number(form.get("hours") ?? "0");
  const endsAt = Number.isFinite(hours) && hours > 0 ? new Date(Date.now() + Math.min(hours, 24 * 30) * 3_600_000).toISOString() : null;
  const r = await gate.ctx.store.publishAnnouncement(
    { userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId },
    { message: String(form.get("message") ?? "").trim(), tone, dismissible: tone === "info", endsAt, reason: String(form.get("reason") ?? "").trim() },
    await requestMeta(),
  );
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  refresh();
  return { ok: true, message: tone === "incident" ? "Posted. Everyone sees it on their next page until you end it." : "Posted. People see it on their next page and can close it." };
}

export async function endAnnouncementAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("announcements.manage");
  if (!gate.ok) return { ok: false, message: gate.message };
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { ok: false, message: OFFICE_MESSAGES.ANNOUNCEMENT_MISSING };
  const r = await gate.ctx.store.endAnnouncement({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { id: id.data, reason: String(form.get("reason") ?? "").trim() }, await requestMeta());
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  refresh();
  return { ok: true, message: "Ended. It's gone from everyone's next page." };
}
