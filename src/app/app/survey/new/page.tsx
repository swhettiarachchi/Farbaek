import { SlidersHorizontalIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/app/primitives";
import { AutoSurveyStart } from "@/components/survey/autosurvey-start";
import { NewSurveyProjectForm } from "@/components/survey/forms";
import { Disclosure } from "@/components/ui/disclosure";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { startingCrs } from "@/core/survey/autosurvey/start";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { surveyReadOnlyReason } from "@/server/survey/access";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "New survey" };

/**
 * AutoSurvey's start (stage 222, ADR 0233): upload everything, press Generate Plan. The coordinate system shown first is the one
 * this surveyor last confirmed in this workspace; the old step-by-step start stays one fold away for choosing columns by hand.
 */
export default async function NewSurveyPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const client = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const [last, profile] = client
    ? await Promise.all([
        client.from("survey_projects").select("crs_id").eq("org_id", ctx.current.id).eq("crs_confirmed_by", ctx.user.id).not("crs_confirmed_at", "is", null).order("crs_confirmed_at", { ascending: false }).limit(1).maybeSingle(),
        client.from("survey_surveyor_profiles").select("full_name").eq("org_id", ctx.current.id).eq("user_id", ctx.user.id).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];
  const lastCrs = typeof last.data?.crs_id === "string" ? last.data.crs_id : null;
  const surveyorName = typeof profile.data?.full_name === "string" && profile.data.full_name.trim() ? profile.data.full_name.trim() : null;
  const disabledReason = surveyReadOnlyReason(ctx);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 pt-2 sm:pt-6 lg:gap-8">
      <div className="grid gap-2">
        <h1 className={FOCUSED_TITLE}>New survey</h1>
        <p className="max-w-[62ch] text-body leading-relaxed text-ink-2">
          Upload your survey data and field sketches. Farbaek reads them, draws the plan, and shows only what needs your attention. You check it, approve it and print it.
        </p>
      </div>
      <AutoSurveyStart startingCrsId={startingCrs(lastCrs)?.id ?? null} surveyorName={surveyorName} disabledReason={disabledReason} />
      <Disclosure summary="Set up the project step by step" hint="Name it, confirm the coordinate system, then choose a file's columns yourself." icon={<SlidersHorizontalIcon size={20} aria-hidden />}>
        <Card>
          <NewSurveyProjectForm disabledReason={disabledReason} />
        </Card>
      </Disclosure>
    </div>
  );
}
