"use server";

import { refresh } from "next/cache";
import type { OfficeFormState } from "@/components/office/action-form";
import { staffAction } from "@/server/office/access";
import { verifyAuditChain } from "@/server/office/staff-data";

const number = new Intl.NumberFormat("en-US");

/** Re-checks every event's hash and link, and records the result in its own append-only table. */
export async function verifyAuditChainAction(): Promise<OfficeFormState> {
  const gate = await staffAction("audit.verify");
  if (!gate.ok) return { ok: false, message: gate.message };
  const result = await verifyAuditChain(gate.ctx.admin);
  const saved = await gate.ctx.store.recordVerification(
    { userId: gate.ctx.user.id, sessionId: gate.ctx.sessionId },
    result.ok
      ? { throughSeq: result.throughSeq, headHash: result.headHash, ok: true, firstBadSeq: null }
      : { throughSeq: result.firstBadSeq - 1, headHash: null, ok: false, firstBadSeq: result.firstBadSeq },
  );
  refresh();
  if (!saved.ok) return { ok: false, message: "The check ran but its result couldn't be saved. Try again." };
  return result.ok
    ? { ok: true, message: `All ${number.format(result.checked)} events check out: nothing was edited, removed or reordered.` }
    : { ok: false, message: `The chain breaks at event ${result.firstBadSeq}: ${result.problem} Tell the owner now.` };
}
