import { approvalHash, type PlanInput } from "@/core/survey/view";
import type { SurveyApproval, SurveyProjectData, SurveyorProfile } from "./read";

/** A date as written on plans and in the app: YYYY-MM-DD, the same in every time zone. */
export const isoDate = (iso: string) => iso.slice(0, 10);

/** The name a member gave as a surveyor, or a neutral description: Farbaek never invents a name. */
export function personName(userId: string | null, profiles: readonly SurveyorProfile[], me?: string): string {
  if (!userId) return "a former member";
  if (userId === me) return "you";
  return profiles.find((p) => p.user_id === userId)?.full_name ?? "a member of this workspace";
}

export interface ApprovalStatus {
  /** The approval that stands for the version shown: not withdrawn, and its hash matches the plan recomputed now. */
  current: SurveyApproval | null;
  /** An approval of this version that no longer applies, and why. */
  lapsed: { reason: "crs_changed" | "content_changed" } | null;
}

/**
 * Whether the version shown is approved. An approval counts only while it
 * stands (the database withdraws it when the grid changes) and while its
 * SHA-256 equals the hash of the same plan computed now, from the engine,
 * the grid, the document and every coordinate it uses. Anything else that
 * changed what was approved shows the plan as a draft again.
 */
export async function approvalStatus(data: SurveyProjectData): Promise<ApprovalStatus> {
  const forVersion = data.approvals.filter((a) => a.drawing_version === data.drawing.version);
  if (forVersion.length === 0) return { current: null, lapsed: null };
  const standing = forVersion.find((a) => a.withdrawn_at === null);
  if (!standing) return { current: null, lapsed: { reason: "crs_changed" } };
  const hash = await approvalHash({ document: data.drawing.document, crsId: data.project.crsId, points: data.points });
  return hash === standing.content_sha256 ? { current: standing, lapsed: null } : { current: null, lapsed: { reason: "content_changed" } };
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * The plan's inputs from a loaded project: the CRS confirmation, the
 * responsible surveyor and this version's approval. An approved plan carries
 * the surveyor's details as they were when they approved it, never later edits.
 */
export async function planInputFor(data: SurveyProjectData): Promise<PlanInput & { approvalStatus: ApprovalStatus }> {
  const doc = data.drawing.document;
  const status = await approvalStatus(data);
  const approval = status.current;
  const profile = doc.surveyorUserId ? data.profiles.find((p) => p.user_id === doc.surveyorUserId) : undefined;
  const surveyor = approval
    ? { name: text(approval.surveyor.name), designation: text(approval.surveyor.designation), registration: text(approval.surveyor.registration), address: text(approval.surveyor.address), contact: text(approval.surveyor.contact) }
    : profile
      ? { name: profile.full_name, designation: profile.designation, registration: profile.registration, address: profile.address, contact: profile.contact }
      : null;
  return {
    points: data.points,
    document: doc,
    crsId: data.project.crsId,
    crsConfirmation:
      data.project.id === "sample"
        ? "Sample data: no real survey"
        : data.project.crsConfirmedAt
          ? `Confirmed by ${personName(data.project.crsConfirmedBy, data.profiles)} on ${isoDate(data.project.crsConfirmedAt)}`
          : null,
    surveyor,
    approval: approval ? { by: text(approval.surveyor.name) || "the surveyor", at: isoDate(approval.approved_at) } : null,
    approvalStatus: status,
  };
}
