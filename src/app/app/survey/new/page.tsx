import { SlidersHorizontalIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/app/primitives";
import { AutoSurveyStart } from "@/components/survey/autosurvey-start";
import { NewSurveyProjectForm } from "@/components/survey/forms";
import { Disclosure } from "@/components/ui/disclosure";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { startingCrs } from "@/core/survey/autosurvey/start";
import { readModelKey } from "@/server/ai/workspace-ai";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { surveyReadOnlyReason } from "@/server/survey/access";
import { loadStartingDefaults } from "@/server/survey/defaults";
import { loadOfficeProfiles, loadProfileChoice } from "@/server/survey/profiles";
import { resolveProfile } from "@/core/survey/profile";
import { loadAppContext } from "@/server/workspace/context";
import { loadAiAvailability } from "@/server/workspace/usage-summary";

export const metadata: Metadata = { title: "New survey" };

/**
 * AutoSurvey's start (stage 222, ADR 0233): upload everything, press Generate Plan. The coordinate system shown first is the one
 * this surveyor last confirmed in this workspace; the old step-by-step start stays one fold away for choosing columns by hand.
 * Field sketches are read with Claude when this workspace can use it and the surveyor agrees (stage 223, ADR 0234).
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
  // Reading field sketches (stage 223, ADR 0234): on Claude, free while Survey Studio is tested, or on the workspace's own key.
  const sketchAi = !disabledReason && ctx.mode === "live" ? await loadAiAvailability(ctx, ctx.current, "survey_read").catch(() => null) : null;
  const sketchOff = disabledReason ?? (sketchAi ? sketchAi.disabledReason : "Reading sketches isn't available right now. The plan is drawn from your data either way.");
  const ownKey = client && !sketchOff ? await readModelKey(client, ctx.current.id).catch(() => null) : null;
  // What a new plan takes from this surveyor's own recent plans (ADR 0237), said before they press Generate.
  const defaults = client ? await loadStartingDefaults(client, ctx.current.id, ctx.user.id) : { codes: null, settings: null };
  const carried = {
    codes: defaults.codes ? { from: defaults.codes.from, count: defaults.codes.entries.length } : null,
    sheet: defaults.settings ? { from: defaults.settings.from, paper: defaults.settings.values.paper, orientation: defaults.settings.values.orientation } : null,
    grammar: "grammar" in defaults ? (defaults.grammar ?? null) : null,
  };
  const aiCost = ownKey ? "It runs on your workspace's own Claude key." : "It's free while Survey Studio is being tested.";
  // The workspace's office profiles (ADR 0256), and the one this surveyor used last: the start screen picks one as files arrive. The
  // grid shown first is the likely profile's, else the one last confirmed.
  const [profiles, lastProfile] = client ? await Promise.all([loadOfficeProfiles(client, ctx.current.id), loadProfileChoice(client, ctx.current.id, ctx.user.id)]) : [[], null];
  const likely = resolveProfile(profiles, { formats: [], lastChosen: lastProfile }).chosen;
  const profileCrs = likely?.body.crsId ? startingCrs(likely.body.crsId) : null;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 pt-2 sm:pt-6 lg:gap-8">
      <div className="grid gap-2">
        <h1 className={FOCUSED_TITLE}>New survey</h1>
        <p className="max-w-[62ch] text-body leading-relaxed text-ink-2">
          Upload your survey data and field sketches. Farbaek reads them, draws the plan, and shows only what needs your attention. You check it, approve it and print it.
        </p>
      </div>
      <AutoSurveyStart
        startingCrsId={profileCrs?.id ?? startingCrs(lastCrs)?.id ?? null}
        lastCrsId={startingCrs(lastCrs)?.id ?? null}
        profiles={profiles}
        lastProfile={lastProfile}
        surveyorName={surveyorName}
        disabledReason={disabledReason}
        sketchOff={sketchOff}
        aiCost={aiCost}
        carried={carried}
        userId={disabledReason ? null : ctx.user.id}
        orgId={ctx.current.id}
      />
      <Disclosure summary="Set up the project step by step" hint="Name it, confirm the coordinate system, then choose a file's columns yourself." icon={<SlidersHorizontalIcon size={20} weight="bold" aria-hidden />}>
        <Card>
          <NewSurveyProjectForm disabledReason={disabledReason} />
        </Card>
      </Disclosure>
    </div>
  );
}
