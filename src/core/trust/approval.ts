/**
 * Approval binding. An approval authorizes one exact action: the SHA-256 of
 * the canonical action payload together with the contract, policy and
 * resource versions that the reviewer saw. Changing any of them invalidates
 * the approval.
 *
 * Reviewer authorization, expiry policy and storage are enforced by the
 * server (Stage 3). This module is the shared, pure part.
 */
import { canonicalHash, type JsonValue } from "./canonical-json";

export const APPROVAL_BINDING_SCHEME = "farbaek.approval-binding/v1";

export interface ApprovalSubject {
  action: JsonValue;
  contractVersion: string;
  policyVersion: string;
  resourceVersion: string;
}

export type ApprovalState = "pending" | "approved" | "rejected" | "changes_requested" | "expired";

export interface ApprovalRecord {
  id: string;
  state: ApprovalState;
  bindingHash: string;
  expiresAt: Date;
}

export type ApprovalCheck =
  | { valid: true }
  | { valid: false; reason: "NOT_APPROVED" | "EXPIRED" | "BINDING_MISMATCH"; message: string };

export function approvalBindingHash(subject: ApprovalSubject): Promise<string> {
  return canonicalHash({
    scheme: APPROVAL_BINDING_SCHEME,
    action: subject.action,
    contractVersion: subject.contractVersion,
    policyVersion: subject.policyVersion,
    resourceVersion: subject.resourceVersion,
  });
}

/** Run immediately before execution, against the subject as it is now. */
export async function checkApprovalForExecution(record: ApprovalRecord, current: ApprovalSubject, now: Date): Promise<ApprovalCheck> {
  if (record.state !== "approved") {
    return { valid: false, reason: "NOT_APPROVED", message: "This action has not been approved." };
  }
  if (now.getTime() >= record.expiresAt.getTime()) {
    return { valid: false, reason: "EXPIRED", message: "The approval expired. Request a fresh approval." };
  }
  const currentHash = await approvalBindingHash(current);
  if (currentHash !== record.bindingHash) {
    return {
      valid: false,
      reason: "BINDING_MISMATCH",
      message: "The action, plan, rules or resource changed after approval. Ask for a fresh approval.",
    };
  }
  return { valid: true };
}
