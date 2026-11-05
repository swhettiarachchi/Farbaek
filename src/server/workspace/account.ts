/**
 * People and accounts (ADR 0064): what deleting an account would do, and
 * the words for the database's refusals. Server only: the plan and the
 * deletion run through migration v37's service-role functions.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { OrgRole } from "./types";

export type DeletionOutcome = "deleted" | "left" | "blocked_last_owner" | "blocked_paid" | "blocked_review";

export interface DeletionPlanItem {
  orgId: string;
  orgName: string;
  role: OrgRole;
  members: number;
  outcome: DeletionOutcome;
}

const Row = z.object({
  org_id: z.string(),
  org_name: z.string(),
  role: z.enum(["owner", "admin", "member", "viewer"]),
  members: z.number().int(),
  outcome: z.enum(["deleted", "left", "blocked_last_owner", "blocked_paid", "blocked_review"]),
});

/** Each of the person's workspaces and what deleting the account would do to it. */
export async function deletionPlan(admin: SupabaseClient, userId: string): Promise<DeletionPlanItem[]> {
  const { data, error } = await admin.rpc("app_account_deletion_plan", { p_user: userId });
  if (error) throw new Error(`deletion plan: ${error.message}`);
  return z
    .array(Row)
    .parse(data ?? [])
    .map((r) => ({ orgId: r.org_id, orgName: r.org_name, role: r.role, members: r.members, outcome: r.outcome }));
}

/** Whether the person is, or was, Farbaek staff: those sign-in records are kept (Office Space, ADR 0032). */
export async function isStaffAccount(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.from("staff_members").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`staff lookup: ${error.message}`);
  return data !== null;
}

/** What each outcome means, from the person's side. */
export const DELETION_WORDS: Record<DeletionOutcome, string> = {
  deleted: "Deleted, with its projects, files, history and published sites. You're its only member.",
  left: "You leave it. It stays for the others, and what you made in it stays theirs.",
  blocked_last_owner: "You're its only owner and others are in it. Make one of them an owner first.",
  blocked_paid: "It has a paid plan. Cancel it first, where it was bought: Billing, the iPhone's Subscriptions, or Google Play.",
  blocked_review: "Farbaek's team has it under review, so it can't be deleted yet. Write to support@farbaek.com.",
};

/** The database's refusals for people changes, in plain words. */
export function peopleError(message: string): string {
  if (/LAST_OWNER/.test(message)) return "A workspace always needs an owner. Make someone else an owner first.";
  if (/FORBIDDEN/.test(message)) return "Your role can't make that change. Owners change any role; admins move members and viewers.";
  if (/NOT_FOUND/.test(message)) return "That person isn't in this workspace any more.";
  return "That change couldn't be saved. Nothing was changed.";
}
