import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  CubeIcon,
  EyeIcon,
  FingerprintIcon,
  GlobeIcon,
  InfoIcon,
  KeyIcon,
  PlugsIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  WarningIcon,
} from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/app/primitives";
import { LiveCheck } from "@/components/launch/live-check";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { VERDICT_WORDS } from "@/core/launch/health";
import { KIND_LABELS, type PlanCommand, type ServiceKind } from "@/core/launch/planner";
import { formatBytes } from "@/core/workspace/files";
import { loadLaunchPage } from "@/server/launch/plan-data";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Launch" };

const SERVICE_WORDS: Record<ServiceKind, string> = { database: "Database", auth: "Sign-in", payments: "Payments", storage: "File storage", email: "Email", ai: "AI" };

type StepState = "done" | "attention" | "missing" | "na";
const STEP_LOOK: Record<StepState, { word: string; ring: string; icon: string }> = {
  done: { word: "Done", ring: "border-verified/45 bg-verified/[0.08] text-verified", icon: "text-verified" },
  attention: { word: "Needs a look", ring: "border-approval/50 bg-approval/[0.08] text-approval", icon: "text-approval" },
  missing: { word: "Missing", ring: "border-dashed border-line-strong/60 bg-surface text-ink-3", icon: "text-ink-3" },
  na: { word: "Not needed yet", ring: "border-line bg-surface-raised text-ink-3", icon: "text-ink-3" },
};

function Command({ label, value }: { label: string; value: PlanCommand | null }) {
  return (
    <div className="grid gap-1.5 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2">
        {value ? (
          <>
            <code className="break-all rounded-sm bg-surface-raised px-2 py-1 font-mono text-[13px] text-ink">{value.command}</code>
            <span className={`text-xs ${value.source === "found" ? "text-ink-2" : "text-ink-3"}`}>{value.source === "found" ? "From the project" : "Usual default, assumed"}</span>
          </>
        ) : (
          <span className="text-sm text-ink-3">None needed</span>
        )}
      </dd>
    </div>
  );
}

export default async function LaunchPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) notFound();
  const user = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const { plan, publish, proofPack, checks } = await loadLaunchPage(ctx, user, project);

  const site = publish?.site ?? null;
  const live = publish?.live ?? null;
  const liveCheck = live ? (checks[live.id] ?? null) : null;
  const sitesDestination = plan.destinations.find((d) => d.id === "farbaek_sites")!;
  const providers = plan.destinations.filter((d) => d.id !== "farbaek_sites");
  const totalBytes = live?.totalBytes ?? null;

  const check = publish?.check ?? null;
  const security: { state: StepState; text: string } =
    plan.hosting !== "static"
      ? { state: "na", text: "Runs before a launch to Farbaek Sites. This project needs a host that runs code." }
      : !check || check.status === "failed"
        ? { state: "missing", text: "No finished check of these files yet. Publishing needs one with nothing critical." }
        : check.status === "running"
          ? { state: "attention", text: "A check is running now." }
          : publish?.block?.code === "CHECK_STALE"
            ? { state: "attention", text: "The files changed after the last check. Run it again before publishing." }
            : check.critical > 0
              ? { state: "attention", text: `The last check found ${check.critical} critical ${check.critical === 1 ? "problem" : "problems"}.` }
              : { state: "done", text: "The last check of exactly these files found nothing critical." };
  const evidence: { state: StepState; text: string } = !proofPack
    ? { state: "missing", text: "No change in this project has a ProofPack yet. Changes made by the agent and approved by you get one." }
    : proofPack.status === "verified"
      ? { state: "done", text: "The latest change's checks ran in a sandbox against exactly what was applied, and passed." }
      : proofPack.status === "failed"
        ? { state: "attention", text: "The latest change's checks failed. Look at the task before launching." }
        : { state: "attention", text: proofPack.status === "partially_verified" ? "The latest change is partly verified: some checks didn't run." : "The latest change was applied without verified checks." };
  const deployed: { state: StepState; text: string } = live
    ? { state: "done", text: `Version ${live.number} is live: ${live.fileCount} files, recorded with a SHA-256 digest of exactly those revisions.` }
    : { state: plan.hosting === "static" ? "missing" : "na", text: plan.hosting === "static" ? "Nothing is live yet." : "Launching servers comes with your own hosting, next in LaunchOS." };

  const steps = [
    { key: "security", title: "Security check of these files", icon: ShieldCheckIcon, ...security, href: `/app/projects/${project.id}/security`, link: "Open Security" },
    { key: "evidence", title: "Evidence for the latest change", icon: FingerprintIcon, ...evidence, href: proofPack ? `/app/tasks/${proofPack.taskId}` : null, link: "Open the task" },
    { key: "deployed", title: "The version that's live", icon: CubeIcon, ...deployed, href: null, link: null },
  ];

  return (
    <div className="grid gap-8">
      <div>
        <Link href={`/app/projects/${project.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> {project.name}
        </Link>
        <div className="mt-2">
          <PageHeader title="Launch" description="What this project is, what it needs to run, the proof behind it and where it can go. Read from its own files; nothing here changes the project." />
        </div>
      </div>

      <section aria-labelledby="plan-title" className="relative overflow-hidden rounded-lg border border-line bg-surface p-6 shadow-e2 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(circle,var(--color-accent)_0%,transparent_70%)] opacity-[0.07]" />
        <p className="font-mono text-xs text-ink-3">{"// launch plan"}</p>
        <h2 id="plan-title" className="mt-2 text-balance text-[1.7rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.2rem]">
          {KIND_LABELS[plan.kind]}
          {sitesDestination.available ? <span className="text-ink-3">, ready for Farbaek Sites</span> : null}
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {plan.evidence.map((e) => (
            <span key={e} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface-raised/60 px-3 font-mono text-xs text-ink-2">
              <EyeIcon size={13} aria-hidden /> {e}
            </span>
          ))}
          <span className="inline-flex h-7 items-center rounded-full border border-line px-3 text-xs text-ink-2">
            {plan.fileCount} {plan.fileCount === 1 ? "file" : "files"}
            {totalBytes !== null ? `, ${formatBytes(totalBytes)} live` : ""}
          </span>
          <span className="inline-flex h-7 items-center rounded-full border border-line px-3 text-xs text-ink-2">
            {plan.hosting === "static" ? "Static files" : plan.hosting === "server" ? "Runs a server" : "Hosting unknown"}
          </span>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {live && publish?.address ? (
            <a href={publish.address} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "md")}>
              <GlobeIcon size={17} aria-hidden /> Open {site?.name}
              <ArrowSquareOutIcon size={14} aria-hidden />
            </a>
          ) : sitesDestination.available ? (
            <Link href={`/app/projects/${project.id}#publish`} className={buttonClasses("primary", "md")}>
              <RocketLaunchIcon size={17} aria-hidden /> Publish on Farbaek Sites
            </Link>
          ) : null}
          <p className="text-sm text-ink-2">{sitesDestination.reason}</p>
        </div>
      </section>

      {plan.notes.length > 0 ? (
        <ul className="grid gap-2">
          {plan.notes.map((n) => (
            <li key={n} className="flex items-start gap-2.5 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
              <InfoIcon size={17} className="mt-px shrink-0 text-accent" aria-hidden />
              {n}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section aria-labelledby="evidence-title" className="grid content-start gap-5">
          <div>
            <h2 id="evidence-title" className="text-lg font-medium">
              The proof behind it
            </h2>
            <p className="mt-1 text-sm text-ink-2">Each launch stands on these, in order. A step that isn&apos;t done says what&apos;s missing.</p>
          </div>
          <ol className="relative grid gap-0">
            {steps.map((s) => {
              const look = STEP_LOOK[s.state];
              return (
                <li key={s.key} className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-4 pb-7">
                  <span aria-hidden className="absolute bottom-0 left-[21px] top-11 w-px bg-line" />
                  <span className={`relative z-10 flex size-11 items-center justify-center rounded-full border ${look.ring}`}>
                    <s.icon size={20} weight={s.state === "done" ? "fill" : "regular"} aria-hidden />
                  </span>
                  <div className="grid gap-1 pt-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-ink">{s.title}</span>
                      <span className={`text-xs font-medium ${look.icon}`}>{look.word}</span>
                    </p>
                    <p className="text-sm leading-relaxed text-ink-2">{s.text}</p>
                    {s.href && s.state !== "na" ? (
                      <Link href={s.href} className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-accent hover:underline">
                        {s.link}
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
            <li className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-4">
              <span
                className={`relative z-10 flex size-11 items-center justify-center rounded-full border ${
                  liveCheck?.verdict === "live" ? STEP_LOOK.done.ring : live ? STEP_LOOK.attention.ring : STEP_LOOK[plan.hosting === "static" ? "missing" : "na"].ring
                }`}
              >
                <GlobeIcon size={20} weight={liveCheck?.verdict === "live" ? "fill" : "regular"} aria-hidden />
              </span>
              <div className="grid gap-2 pt-1">
                <p className="font-medium text-ink">The live address answers with it</p>
                {live && site ? (
                  <LiveCheck
                    projectId={project.id}
                    last={liveCheck ? { verdict: liveCheck.verdict, detail: liveCheck.detail, checkedAt: liveCheck.checkedAt } : null}
                    autoRun={ctx.mode === "live" && !liveCheck && !site.blocked}
                  />
                ) : (
                  <p className="text-sm text-ink-2">Once a version is live, Farbaek opens its address and confirms exactly these files answer.</p>
                )}
              </div>
            </li>
          </ol>
        </section>

        <div className="grid content-start gap-6">
          <Card>
            <h2 className="text-lg font-medium">How it runs</h2>
            <dl className="mt-2 divide-y divide-line">
              <Command label="Build" value={plan.build} />
              {plan.output ? <Command label="Output" value={plan.output} /> : null}
              <Command label="Start" value={plan.start} />
              {plan.nodeVersion ? (
                <div className="grid gap-1.5 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <dt className="text-sm text-ink-3">Node.js</dt>
                  <dd className="font-mono text-[13px] text-ink">{plan.nodeVersion}</dd>
                </div>
              ) : null}
            </dl>
            {plan.services.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-4">
                {plan.services.map((s) => (
                  <span key={s.kind} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-raised px-3 text-xs text-ink-2">
                    <PlugsIcon size={13} aria-hidden /> {SERVICE_WORDS[s.kind]} <span className="font-mono text-ink-3">{s.via}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <KeyIcon size={18} aria-hidden /> Settings it needs
            </h2>
            <p className="mt-1 text-sm text-ink-2">Names only. Their values belong in the host&apos;s settings; Farbaek never reads or stores them here.</p>
            {plan.envNames.length === 0 ? (
              <p className="mt-4 text-sm text-ink-3">None found in the files.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {plan.envNames.map((e) => (
                  <li key={e.name} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <code className="break-all font-mono text-[13px] text-ink">{e.name}</code>
                    <span className="flex items-center gap-2 text-xs text-ink-3">
                      {e.public ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-approval/40 px-2 py-0.5 font-medium text-approval">
                          <EyeIcon size={12} aria-hidden /> Visible in the browser
                        </span>
                      ) : null}
                      {e.seenIn.includes("code") ? "Read in code" : "In the example file"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <section aria-labelledby="where-title" className="grid gap-4">
        <div>
          <h2 id="where-title" className="text-lg font-medium">
            Where it can go
          </h2>
          <p className="mt-1 text-sm text-ink-2">Farbaek Sites works today. Connecting your own hosting account is the next part of LaunchOS; nothing is connected or charged here.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <li className={`grid gap-2 rounded-md border p-5 ${sitesDestination.available ? "border-accent/30 bg-accent/[0.04] shadow-e1" : "border-line bg-surface"}`}>
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">{sitesDestination.name}</span>
              {sitesDestination.available ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-verified">
                  <CheckCircleIcon size={14} weight="fill" aria-hidden /> Available
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                  <CircleDashedIcon size={14} aria-hidden /> Not for this project
                </span>
              )}
            </span>
            <span className="text-sm text-ink-2">{sitesDestination.suits}</span>
          </li>
          {providers.map((p) => (
            <li key={p.id} className="grid gap-2 rounded-md border border-dashed border-line-strong/50 bg-surface p-5">
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink">{p.name}</span>
                <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                  <CircleDashedIcon size={14} aria-hidden /> Not connected
                </span>
              </span>
              <span className="text-sm text-ink-2">{p.suits}</span>
              <span className="text-xs text-ink-3">{p.reason}</span>
            </li>
          ))}
        </ul>
      </section>

      {publish && publish.deployments.length > 0 ? (
        <section aria-labelledby="timeline-title" className="grid gap-4">
          <h2 id="timeline-title" className="text-lg font-medium">
            Every version
          </h2>
          <ol className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
            {publish.deployments.map((d) => {
              const c = checks[d.id];
              const isLive = d.id === live?.id;
              return (
                <li key={d.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                  <span className="grid gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">Version {d.number}</span>
                      {isLive ? (
                        <span className="inline-flex h-6 items-center gap-1 rounded-full border border-verified/40 px-2 text-xs font-medium text-verified">
                          <CheckCircleIcon size={12} weight="bold" aria-hidden /> Live
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-ink-3">
                      Published <RelativeTime iso={d.createdAt} /> · {d.fileCount} files · {formatBytes(d.totalBytes)}
                      {d.securityScore !== null ? ` · security ${d.securityScore}` : ""}
                    </span>
                    <code className="font-mono text-[11px] text-ink-3" title={d.digest}>
                      sha256 {d.digest.slice(0, 16)}…
                    </code>
                  </span>
                  <span className="text-xs text-ink-2">
                    {c ? (
                      <span className="inline-flex items-center gap-1.5">
                        {c.verdict === "live" ? (
                          <CheckCircleIcon size={14} weight="fill" className="text-verified" aria-hidden />
                        ) : (
                          <WarningIcon size={14} weight="fill" className={c.verdict === "previous" ? "text-approval" : "text-failed"} aria-hidden />
                        )}
                        {isLive || c.verdict !== "live" ? VERDICT_WORDS[c.verdict] : "Served exactly this version when checked"}, <RelativeTime iso={c.checkedAt} />
                      </span>
                    ) : (
                      <span className="text-ink-3">Not checked</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
