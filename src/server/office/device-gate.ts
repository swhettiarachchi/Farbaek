/**
 * The hidden office (ADR 0072): before any office page, is this a device the
 * office knows? Unknown devices get the same "not found" as an unused name,
 * so they can't tell the office is there. Fails closed.
 */
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { DEVICE_TOKEN, deviceHash } from "./device-token";

/** The one office path an unknown device may open: where a device-add code is typed. */
export const OFFICE_OPEN_PATH = /^\/add-device\/?$/;

export async function officeDeviceKnown(token: string | undefined): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  if (!admin) return false;
  const hash = token && DEVICE_TOKEN.test(token) ? deviceHash(token) : null;
  const { data, error } = await admin.rpc("app_office_device_known", { p_token_hash: hash });
  return !error && data === true;
}
