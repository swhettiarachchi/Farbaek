import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/app/primitives";
import { SurveyorProfileForm } from "@/components/survey/forms";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { surveyReadOnlyReason } from "@/server/survey/access";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Surveyor details" };

export default async function SurveyorProfilePage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const client = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const { data } = client
    ? await client.from("survey_surveyor_profiles").select("full_name, designation, registration, address, contact").eq("org_id", ctx.current.id).eq("user_id", ctx.user.id).maybeSingle()
    : { data: null };
  return (
    <div className="grid max-w-2xl gap-6 lg:gap-8">
      <PageHeader
        title="Surveyor details"
        description="Your details for the surveyor block of plans you are responsible for. Only you can set them, and only you can approve a plan that names you. Farbaek shows what you enter and checks no register."
      />
      <Card>
        <SurveyorProfileForm profile={data} disabledReason={surveyReadOnlyReason(ctx)} />
      </Card>
    </div>
  );
}
