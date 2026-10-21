"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { OfficeFormState } from "@/components/office/action-form";
import { staffAction } from "@/server/office/access";
import { requestMeta } from "@/server/office/request-meta";
import { OFFICE_MESSAGES } from "@/server/office/staff-store";

const Uuid = z.uuid();
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/** Takes a published site offline and keeps it as evidence. Its owner sees the notice; visitors see a neutral page. */
export async function blockSiteAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("site.block");
  if (!gate.ok) return { ok: false, message: gate.message };
  const siteId = Uuid.safeParse(form.get("siteId"));
  if (!siteId.success) return { ok: false, message: OFFICE_MESSAGES.SITE_MISSING };
  const r = await gate.ctx.store.blockSite({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { siteId: siteId.data, notice: text(form, "notice"), reason: text(form, "reason") }, await requestMeta());
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  refresh();
  return { ok: true, message: "Taken offline within a few seconds. The files and name are kept, and it can't go live again until you restore it." };
}

export async function unblockSiteAction(_prev: OfficeFormState, form: FormData): Promise<OfficeFormState> {
  const gate = await staffAction("site.block");
  if (!gate.ok) return { ok: false, message: gate.message };
  const siteId = Uuid.safeParse(form.get("siteId"));
  if (!siteId.success) return { ok: false, message: OFFICE_MESSAGES.SITE_MISSING };
  const r = await gate.ctx.store.unblockSite({ userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId }, { siteId: siteId.data, reason: text(form, "reason") }, await requestMeta());
  if (!r.ok) return { ok: false, message: OFFICE_MESSAGES[r.code] };
  refresh();
  return { ok: true, message: "Block lifted. The site stays offline until its owner makes it live again." };
}
