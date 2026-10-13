"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mapCreateOrganizationError } from "@/server/workspace/organizations";
import { createSupabaseServerClient } from "@/server/supabase/server";

export type CreateOrganizationState = { status: "idle" } | { status: "error"; message: string; name: string };

export async function createOrganization(_previous: CreateOrganizationState, form: FormData): Promise<CreateOrganizationState> {
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 80) {
    return { status: "error", message: "Use a name between 1 and 80 characters.", name };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "Supabase isn't connected in this environment.", name };

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/sign-in");

  // The database function enforces email verification, ownership and the one-trial-per-user rule.
  const { error } = await supabase.rpc("create_organization", { p_name: name });
  if (error) return { status: "error", message: mapCreateOrganizationError(error.message).message, name };

  revalidatePath("/app");
  return { status: "idle" };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/sign-in");
}
