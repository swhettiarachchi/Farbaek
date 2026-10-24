"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeDeviceCode } from "@/core/office/device-codes";
import { officeClients } from "@/server/office/access";
import { deviceCodeHash } from "@/server/office/device-token";
import { ensureDevice } from "@/server/office/devices";
import { requestMeta } from "@/server/office/request-meta";

export type CodeState = { message: string | null };

const DIDNT_WORK = "That code didn't work. A code works once, for 15 minutes: make a new one on your other device.";

/**
 * A device-add code typed on a new device (ADR 0072). The one office action an
 * unknown device can reach, so it says nothing about what's behind it: every
 * refusal reads the same, and five tries per network address per 15 minutes.
 */
export async function redeemDeviceCodeAction(_prev: CodeState, form: FormData): Promise<CodeState> {
  const clients = await officeClients();
  if (!clients) return { message: DIDNT_WORK };
  const h = await headers();
  const origin = h.get("origin");
  if (origin ? origin !== clients.office.origin : h.get("sec-fetch-site") !== "same-origin") return { message: DIDNT_WORK };
  const meta = await requestMeta();
  if (!(await clients.store.rateLimit(`office-add-device:${meta.ipHash}`, 15 * 60, 5))) return { message: "Too many tries. Wait 15 minutes, then try again." };
  const code = normalizeDeviceCode(form.get("code"));
  if (!code) return { message: "Enter the 8 characters, like K7P2 9XQM." };
  const device = await ensureDevice();
  const redeemed = await clients.store.redeemDeviceInvite(deviceCodeHash(code), device, meta);
  if (!redeemed.ok || !redeemed.value) return { message: DIDNT_WORK };
  redirect("/sign-in");
}
