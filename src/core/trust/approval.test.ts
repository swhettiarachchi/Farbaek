import { describe, expect, it } from "vitest";
import { approvalBindingHash, checkApprovalForExecution, type ApprovalRecord, type ApprovalSubject } from "./approval";

const subject: ApprovalSubject = {
  action: { operation: "products.update", target: { collection: "products", count: 100 }, fields: { description: "Oiled twice." } },
  contractVersion: "3",
  policyVersion: "12",
  resourceVersion: "etag-41",
};
const now = new Date("2026-10-13T10:00:00Z");

async function approved(over: Partial<ApprovalRecord> = {}): Promise<ApprovalRecord> {
  return { id: "apr_1", state: "approved", bindingHash: await approvalBindingHash(subject), expiresAt: new Date("2026-10-13T11:00:00Z"), ...over };
}

describe("approval binding", () => {
  it("authorizes the exact payload that was reviewed", async () => {
    expect(await checkApprovalForExecution(await approved(), subject, now)).toEqual({ valid: true });
  });

  it("is independent of key order in the payload", async () => {
    const reordered: ApprovalSubject = {
      ...subject,
      action: { fields: { description: "Oiled twice." }, target: { count: 100, collection: "products" }, operation: "products.update" },
    };
    expect(await checkApprovalForExecution(await approved(), reordered, now)).toEqual({ valid: true });
  });

  it.each([
    ["payload", { ...subject, action: { ...(subject.action as object), fields: { description: "Oiled twice.", price: "+5%" } } }],
    ["record count", { ...subject, action: { ...(subject.action as object), target: { collection: "products", count: 101 } } }],
    ["contract version", { ...subject, contractVersion: "4" }],
    ["policy version", { ...subject, policyVersion: "13" }],
    ["resource version", { ...subject, resourceVersion: "etag-42" }],
  ])("is invalidated by a changed %s", async (_label, changed) => {
    expect(await checkApprovalForExecution(await approved(), changed as ApprovalSubject, now)).toMatchObject({
      valid: false,
      reason: "BINDING_MISMATCH",
    });
  });

  it("refuses pending, rejected and expired approvals", async () => {
    expect(await checkApprovalForExecution(await approved({ state: "pending" }), subject, now)).toMatchObject({ reason: "NOT_APPROVED" });
    expect(await checkApprovalForExecution(await approved({ state: "rejected" }), subject, now)).toMatchObject({ reason: "NOT_APPROVED" });
    expect(await checkApprovalForExecution(await approved({ expiresAt: now }), subject, now)).toMatchObject({ reason: "EXPIRED" });
  });
});
