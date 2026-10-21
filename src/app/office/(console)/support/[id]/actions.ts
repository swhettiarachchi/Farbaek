"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { OfficeFormState } from "@/components/office/action-form";
import { supportBody } from "@/core/support/support";
import { staffAction } from "@/server/office/access";
import { requestMeta } from "@/server/office/request-meta";
import { OFFICE_MESSAGES } from "@/server/office/staff-store";

const Uuid = z.uuid();
const Update = z.enum(["assign_me", "unassign", "close", "reopen"]);

export type SupportReplyState = OfficeFormState & { sentAt?: number };

/** A reply the person sees under Help, or an internal note only staff see. */
export async function staffSupportReplyAction(_prev: SupportReplyState, form: FormData): Promise<SupportReplyState> {
  const gate = await staffAction("support.reply");
  if (!gate.ok) return { ok: false, message: gate.message };
  const threadId = Uuid.safeParse(form.get("threadId"));
  if (!threadId.success) return { ok: false, message: OFFICE_MESSAGES.THREAD_MISSING };
  const body = supportBody(form.get("body"));
  if (!body) return { ok: false, message: OFFICE_MESSAGES.INVALID_SUPPORT };
  const internal = form.get("mode") === "internal";
  const r = await gate.ctx.store.supportReply({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { threadId: threadId.data, body, internal }, await requestMeta());
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  refresh();
  return { ok: true, message: internal ? "Note added. Only staff see it." : "Sent. They'll see it under Help, with a dot on the menu.", sentAt: Date.now() };
}

export async function staffSupportUpdateAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("support.reply");
  if (!gate.ok) return { ok: false, message: gate.message };
  const threadId = Uuid.safeParse(form.get("threadId"));
  const action = Update.safeParse(form.get("action"));
  if (!threadId.success || !action.success) return { ok: false, message: OFFICE_MESSAGES.THREAD_MISSING };
  const r = await gate.ctx.store.supportUpdate({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { threadId: threadId.data, action: action.data }, await requestMeta());
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  refresh();
  const done = { assign_me: "Assigned to you.", unassign: "Unassigned.", close: "Closed. Writing again opens it for them.", reopen: "Reopened. It's back in Waiting on us." } as const;
  return { ok: true, message: done[action.data] };
}
