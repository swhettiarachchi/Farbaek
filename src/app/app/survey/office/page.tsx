import { ArchiveIcon, ToolboxIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { archiveOfficeProfileAction } from "../actions";
import { Card, CardTitle, PageHeader } from "@/components/app/primitives";
import { OfficeProfileForm, ProfileFromPlan } from "@/components/survey/office-profile-form";
import { ProfileSuggestions } from "@/components/survey/profile-suggestions";
import { suggestionsFor } from "@/core/survey/learning";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Disclosure } from "@/components/ui/disclosure";
import { LocalTime } from "@/components/ui/local-time";
import { profileSummary } from "@/core/survey/profile";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { surveyReadOnlyReason } from "@/server/survey/access";
import { loadRecentPlans } from "@/server/survey/defaults";
import { loadOfficeProfiles, loadProfileVersions } from "@/server/survey/profiles";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Office profiles" };

/**
 * The workspace's office profiles (stage 248, ADR 0256): each surveyor's set-up, saved once and reused by every new plan. Read as the
 * signed-in person through row-level security; saved through the server, each save a new version.
 */
export default async function OfficeProfilesPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const client = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const profiles = client ? await loadOfficeProfiles(client, ctx.current.id) : [];
  const versions = client ? await Promise.all(profiles.map((p) => loadProfileVersions(client, p.id))) : [];
  // What this surveyor's own recent plans suggest for each profile (ADR 0277): offered, never applied.
  const recentPlans = client ? await loadRecentPlans(client, ctx.current.id, ctx.user.id) : [];
  const { data: recent } = client
    ? await client.from("survey_projects").select("id, name").eq("org_id", ctx.current.id).is("archived_at", null).order("updated_at", { ascending: false }).limit(10)
    : { data: [] };
  const plans = (Array.isArray(recent) ? recent : []).flatMap((r) => (typeof r.id === "string" && typeof r.name === "string" ? [{ id: r.id, name: r.name }] : []));
  const disabledReason = surveyReadOnlyReason(ctx);

  return (
    <div className="grid max-w-3xl gap-6 lg:gap-8">
      <PageHeader
        title="Office profiles"
        description="Set up your instruments, code library and sheet once. Every new survey starts from the profile that fits its files, so you don't set the same things twice. Nothing about a piece of land is kept here."
      />

      {profiles.map((p, i) => (
        <Card key={p.id}>
          <CardTitle icon={ToolboxIcon}>{p.name}</CardTitle>
          <p className="mt-1 text-sm text-ink-2">{profileSummary(p)}</p>
          <p className="mt-1 text-sm text-ink-3">
            Version {p.version}
            {p.updatedAt ? (
              <>
                , saved <LocalTime iso={p.updatedAt} date />
              </>
            ) : null}
            .
          </p>
          <div className="mt-4 grid gap-3">
            <ProfileSuggestions profileId={p.id} version={p.version} suggestions={suggestionsFor(p, recentPlans)} disabledReason={disabledReason} />
            <Disclosure summary="Change it" hint="Saving makes a new version; the earlier ones are kept.">
              <OfficeProfileForm key={`${p.id}:${p.version}`} profile={p} disabledReason={disabledReason} />
            </Disclosure>
            {(versions[i] ?? []).length > 1 ? (
              <Disclosure summary="Earlier versions" hint="What each new plan started from can always be read again.">
                <ul className="grid gap-1 text-sm text-ink-2">
                  {versions[i]!.map((v) => (
                    <li key={v.version}>
                      Version {v.version}, &ldquo;{v.name}&rdquo;, saved <LocalTime iso={v.savedAt} date />.
                    </li>
                  ))}
                </ul>
              </Disclosure>
            ) : null}
            <ConfirmAction
              action={archiveOfficeProfileAction}
              fields={{ profileId: p.id }}
              trigger={
                <>
                  <ArchiveIcon size={16} weight="bold" aria-hidden /> Archive
                </>
              }
              question="New surveys won't be offered this profile. Plans already started from it keep what they took."
              confirmLabel="Archive the profile"
              pendingLabel="Archiving…"
              disabledReason={disabledReason}
            />
          </div>
        </Card>
      ))}

      <Card>
        <CardTitle icon={ToolboxIcon}>{profiles.length ? "Another profile" : "Your first profile"}</CardTitle>
        <p className="mt-1 text-sm text-ink-2">For each instrument or way of working: a Sokkia total station on SLD99, a GNSS receiver on local coordinates.</p>
        <div className="mt-4">
          <OfficeProfileForm key={profiles.length} profile={null} disabledReason={disabledReason} />
        </div>
      </Card>

      {plans.length > 0 ? (
        <Card>
          <CardTitle icon={ToolboxIcon}>Start from a plan</CardTitle>
          <p className="mt-1 text-sm text-ink-2">Take a plan you&apos;ve already set up: its checked office code list and line words, its sheet, its statement and its grid. Add its instruments afterwards.</p>
          <div className="mt-4">
            <ProfileFromPlan plans={plans} disabledReason={disabledReason} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
