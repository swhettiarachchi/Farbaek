import { ArrowLeftIcon, ArrowUpRightIcon, ClockCounterClockwiseIcon, CloudArrowUpIcon, CoinsIcon, GlobeIcon, KeyIcon, PlugsConnectedIcon, SealCheckIcon, TerminalWindowIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Card, CardTitle, Notice, PageHeader } from "@/components/app/primitives";
import { LiveCheck } from "@/components/launch/live-check";
import { VERDICT_KIND } from "@/components/launch/verdict-kind";
import { NETLIFY_BUILDS, vercelBuilds } from "@/components/launch/provider-copy";
import { isServerProvider } from "@/core/launch/providers";
import { serverCommands, serverFit, serverName } from "@/core/launch/servers";
import { readRepoLink } from "@/server/github/store";
import { ProviderPanel } from "@/components/launch/provider-panel";
import { OutcomeWatch } from "@/components/launch/outcome-watch";
import { readWatch, type WatchView } from "@/server/launch/watch-store";
import { netlifyFit, netlifyPathProblem, netlifySiteName } from "@/core/launch/netlify";
import { deployDigest, vercelFit, vercelProjectName, vercelSettings } from "@/core/launch/vercel";
import { NO_VAULT, launchBytes } from "@/server/launch/provider-launch";
import { projectLaunchFiles } from "@/server/launch/files";
import { listLaunchOrders, readConnections, type ConnectionView, type LaunchOrderView, type Provider } from "@/server/launch/provider-store";
import { refreshLaunch } from "@/server/launch/refresh";
import { LAUNCH_PROVIDERS, type LaunchProvider } from "@/core/launch/providers";
import { launchDeps } from "@/server/launch/provider-wiring";
import { vaultKey } from "@/server/launch/token-vault";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import { VERDICT_WORDS } from "@/core/launch/health";
import { KIND_LABELS, type LaunchPlan, type PlanCommand, type ServiceKind } from "@/core/launch/planner";
import { PRICING_PAGES } from "@/core/launch/costs";
import { EVIDENCE_WORDS } from "@/core/publish/evidence";
import { formatBytes } from "@/core/workspace/files";
import { loadLaunchPage } from "@/server/launch/plan-data";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { withheldFor } from "@/core/workspace/permissions";

export const metadata: Metadata = { title: "Launch" };

const SERVICE_WORDS: Record<ServiceKind, string> = { database: "Database", auth: "Sign-in", payments: "Payments", storage: "File storage", email: "Email", ai: "AI" };

const HOSTING_WORDS: Record<LaunchPlan["hosting"], string> = {
  static: "It's served as static files.",
  server: "It runs a server.",
  unknown: "How it runs isn't clear from its files yet.",
};

/** "a", "a and b", "a, b and c". */
const andList = (items: string[]) => (items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

// Each step's state is its kind (ADR 0183): its words, icon, colour and border. A missing step is "not yet", and one
// this project doesn't need is off.
type StepState = "done" | "attention" | "missing" | "na";
const STEP_BADGE: Record<StepState, { status: Status; label: string }> = {
  done: { status: "verified", label: "Done" },
  attention: { status: "attention", label: "Needs a look" },
  missing: { status: "unverified", label: "Missing" },
  na: { status: "off", label: "Not needed yet" },
};

function Command({ label, value }: { label: string; value: PlanCommand | null }) {
  return (
    <div className="grid gap-1.5 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2">
        {value ? (
          <>
            <code className="break-all rounded-sm bg-surface-raised px-2 py-1 font-mono text-label text-ink">{value.command}</code>
            <span className={`text-xs ${value.source === "found" ? "text-ink-2" : "text-ink-3"}`}>{value.source === "found" ? "From the project" : "Usual default, assumed"}</span>
          </>
        ) : (
          <span className="text-sm text-ink-3">None needed</span>
        )}
      </dd>
    </div>
  );
}

const isLaunchProvider = (id: string): id is LaunchProvider => (LAUNCH_PROVIDERS as readonly string[]).includes(id);

export default async function LaunchPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) notFound();
  const user = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const { plan, costs, publish, evidence: proof, checks } = await loadLaunchPage(ctx, user, project);

  // LaunchOS with your own hosting account (ADR 0078, ADR 0093, ADR 0191): exactly the files a launch would send, the connections, and the launches so far.
  const orgId = ctx.current.id;
  // Exactly what a launch sends, images included (ADR 0108): the same list the authorized launch uses.
  const contents = await projectLaunchFiles(ctx.reader, orgId, project.id);
  const deployFiles = { count: contents.length, bytes: contents.reduce((n, f) => n + launchBytes(f).length, 0), digest: await deployDigest(contents.map((f) => ({ path: f.path, sha256: f.sha256 }))) };
  let connections: Partial<Record<Provider, ConnectionView>> = {};
  let orders: LaunchOrderView[] = [];
  let watch: WatchView | null = null;
  // Render and Railway build from the project's linked GitHub repository (ADR 0191).
  let linkedRepo = false;
  if (user) {
    watch = await readWatch(user, orgId, project.id).catch(() => null);
    [connections, orders, linkedRepo] = await Promise.all([
      readConnections(user, orgId).catch(() => ({})),
      listLaunchOrders(user, orgId, project.id).catch(() => []),
      readRepoLink(user, orgId, project.id).then((l) => l !== null).catch(() => false),
    ]);
    const building = orders.find((o) => o.status === "building");
    const deps = building ? launchDeps(ctx) : null;
    if (building && deps) {
      await refreshLaunch(deps, orgId, building).catch(() => undefined);
      orders = await listLaunchOrders(user, orgId, project.id).catch(() => orders);
    }
  }
  // One launch runs at a time per project, whichever provider it went to.
  const busy = orders.some((o) => o.status === "authorized" || o.status === "uploading" || o.status === "building");
  const canManage = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const readOnly = ctx.mode === "demo" ? "The demo workspace is read-only." : ctx.writes.enabled ? null : ctx.writes.reason;
  const connectReason = readOnly ?? (!canManage ? "Only an owner or admin can connect a hosting account." : vaultKey() ? null : NO_VAULT);
  const launchReason =
    readOnly ??
    (ctx.role === null || !CONTRIBUTOR_ROLES.includes(ctx.role) ? "Viewers can't launch projects." : null) ??
    (project.archivedAt ? "This project is archived." : null) ??
    (deployFiles.count === 0 ? "This project has no files to launch." : null);

  const site = publish?.site ?? null;
  const live = publish?.live ?? null;
  const liveCheck = live ? (checks[live.id] ?? null) : null;
  const sitesDestination = plan.destinations.find((d) => d.id === "farbaek_sites")!;
  const providers = plan.destinations.filter((d) => d.id !== "farbaek_sites");
  // Why each connected kind of host can't take this project, if it can't: the card and the panel say the same.
  // A Node app goes to a host that runs servers (ADR 0191): its package.json says how it installs, builds and starts.
  const pkgText = contents.find((f) => f.path === "package.json" && f.encoding !== "base64")?.content ?? null;
  const serverProject = { pkgText, paths: contents.map((f) => f.path), totalBytes: deployFiles.bytes, linkedRepo };
  const commands = serverCommands(plan, pkgText);
  const runs = commands ? (commands.build ? `${commands.build}, then ${commands.start}` : commands.start) : "No start command found";
  const unfitFor: Record<LaunchProvider, string | null> = {
    vercel: vercelFit(plan),
    netlify: netlifyFit(plan) ?? netlifyPathProblem(contents.map((f) => f.path)),
    render: serverFit("render", plan, serverProject),
    railway: serverFit("railway", plan, serverProject),
    flyio: serverFit("flyio", plan, serverProject),
  };
  const totalBytes = live?.totalBytes ?? null;
  const workedOutFrom = andList(plan.evidence);

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
  // The same evidence the publish gate reads (ADR 0050).
  const evidence: { state: StepState; text: ReactNode } = {
    state: proof.status === "verified" ? "done" : proof.status === "none" ? "missing" : "attention",
    text: `${EVIDENCE_WORDS[proof.status].detail}${proof.status === "verified" ? "" : " Without passed checks, publishing needs a reason from an owner or admin."}`,
  };
  const deployed: { state: StepState; text: ReactNode } = live
    ? {
        state: "done",
        text: (
          <>
            <span title={`sha256:${live.digest}`}>
              Version {live.number} is live with {live.fileCount} {live.fileCount === 1 ? "file" : "files"}, recorded exactly as they went out.
            </span>
            {live.evidence === "verified" && live.evidenceProofPack ? (
              <>
                {" "}
                It went live with passed checks, and <span title={`ProofPack sha256:${live.evidenceProofPack}`}>its ProofPack says so</span>.
              </>
            ) : live.evidence ? (
              <> It went live without passed checks. The reason given: {live.overrideReason}</>
            ) : null}
          </>
        ),
      }
    : { state: plan.hosting === "static" ? "missing" : "na", text: plan.hosting === "static" ? "Nothing is live yet." : "Launching servers comes with your own hosting, which is next." };

  const steps = [
    { key: "security", title: "Security check of these files", ...security, href: `/app/projects/${project.id}/security`, link: "Open Security" },
    { key: "evidence", title: "Proof for the latest change", ...evidence, href: proof.taskId ? `/app/tasks/${proof.taskId}` : null, link: "Open the task" },
    { key: "deployed", title: "The version that's live", ...deployed, href: null, link: null },
  ];

  return (
    <div className="grid gap-8">
      <div>
        <Link href={`/app/projects/${project.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} weight="bold" aria-hidden /> {project.name}
        </Link>
        <div className="mt-2">
          <PageHeader title="Launch" description="What this project is, what it needs to run, the proof behind it and where it can go. Read from its own files; nothing here changes the project." />
        </div>
      </div>

      {/* The plan's headline is the page's lead statement, set large, so it stands as words alone like a page title. */}
      <section aria-labelledby="plan-title" className="rounded-lg border border-line bg-surface p-6 shadow-e2 sm:p-8">
        <h2 id="plan-title" className="text-balance text-[1.7rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.2rem]">
          {KIND_LABELS[plan.kind]}
          {sitesDestination.available ? <span className="text-ink-3">, ready for Farbaek Sites</span> : null}
        </h2>
        <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-ink-2">
          {workedOutFrom ? `Worked out from ${workedOutFrom}. ` : ""}
          It has {plan.fileCount.toLocaleString("en-US")} {plan.fileCount === 1 ? "file" : "files"}
          {totalBytes !== null ? `, and the live version is ${formatBytes(totalBytes)}` : ""}. {HOSTING_WORDS[plan.hosting]}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {live && publish?.address ? (
            <a href={publish.address} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "md")}>
              <GlobeIcon size={16} weight="bold" aria-hidden /> Open {site?.name}
              <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
            </a>
          ) : sitesDestination.available ? (
            <Link href={`/app/projects/${project.id}#publish`} className={buttonClasses("primary", "md")}>
              <GlobeIcon size={16} weight="bold" aria-hidden /> Publish on Farbaek Sites
            </Link>
          ) : null}
          <p className="text-sm text-ink-2">{sitesDestination.reason}</p>
        </div>
      </section>

      {plan.notes.length > 0 ? (
        <ul className="grid gap-2">
          {plan.notes.map((n) => (
            <li key={n}>
              <Notice>{n}</Notice>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section aria-labelledby="evidence-title" className="grid content-start gap-5">
          <div>
            <CardTitle id="evidence-title" icon={SealCheckIcon}>
              The proof behind it
            </CardTitle>
            <p className="mt-1 text-sm text-ink-2">Each launch stands on these, in order. A step that isn&apos;t done says what&apos;s missing.</p>
          </div>
          <ol className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
            {steps.map((s) => {
              const badge = STEP_BADGE[s.state];
              return (
                <li key={s.key} className="grid gap-1.5 px-5 py-4">
                  <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <span className="font-medium text-ink">{s.title}</span>
                    <StatusBadge status={badge.status} label={badge.label} />
                  </p>
                  <p className="text-sm leading-relaxed text-ink-2">{s.text}</p>
                  {s.href && s.state !== "na" ? (
                    <Link href={s.href} className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-accent hover:underline">
                      {s.link}
                    </Link>
                  ) : null}
                </li>
              );
            })}
            {/* The live check says its own state in words, and can change it while the page is open. */}
            <li className="grid gap-2 px-5 py-4">
              <p className="font-medium text-ink">The live address answers with it</p>
              {live && site ? (
                <LiveCheck
                  projectId={project.id}
                  last={liveCheck ? { verdict: liveCheck.verdict, detail: liveCheck.detail, checkedAt: liveCheck.checkedAt } : null}
                  autoRun={ctx.mode === "live" && !liveCheck && !site.blocked}
                />
              ) : (
                <p className="text-sm leading-relaxed text-ink-2">Once a version is live, Farbaek opens its address and confirms exactly these files answer.</p>
              )}
            </li>
          </ol>
        </section>

        <div className="grid content-start gap-6">
          <Card>
            <CardTitle icon={TerminalWindowIcon}>How it runs</CardTitle>
            <dl className="mt-2 divide-y divide-line">
              <Command label="Build" value={plan.build} />
              {plan.output ? <Command label="Output" value={plan.output} /> : null}
              <Command label="Start" value={plan.start} />
              {plan.nodeVersion ? (
                <div className="grid gap-1.5 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <dt className="text-sm text-ink-3">Node.js</dt>
                  <dd className="font-mono text-label text-ink">{plan.nodeVersion}</dd>
                </div>
              ) : null}
              {plan.services.length > 0 ? (
                <div className="grid gap-1.5 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-start sm:gap-4">
                  <dt className="text-sm text-ink-3">Services</dt>
                  <dd>
                    <ul className="grid gap-1 text-sm text-ink">
                      {plan.services.map((s) => (
                        <li key={s.kind} className="flex items-start gap-2">
                          <PlugsConnectedIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                          <span className="min-w-0">
                            {SERVICE_WORDS[s.kind]}, through <code className="break-all font-mono text-label text-ink-2">{s.via}</code>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card>
            <CardTitle icon={CoinsIcon}>What will cost money</CardTitle>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">
              Farbaek doesn&apos;t charge for launches. These bill your own accounts at the host and at each service. Farbaek can&apos;t see your plans or traffic there, so there are no prices here.
            </p>
            {costs.length === 0 ? (
              <p className="mt-4 text-sm text-ink-3">Nothing found in the files yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {costs.map((c) => (
                  <li key={c.id} className="grid gap-1 py-3">
                    <p className="text-body font-medium text-ink">{c.title}</p>
                    <p className="text-sm leading-relaxed text-ink-2">{c.detail}</p>
                    {c.evidence ? <p className="break-all font-mono text-xs text-ink-3">{c.evidence}</p> : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 flex flex-wrap items-center gap-x-1 border-t border-line pt-3 text-sm text-ink-3">
              Prices:
              {PRICING_PAGES.map((p, i) => (
                <span key={p.name}>
                  <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 underline decoration-line-strong underline-offset-4 hover:text-ink">
                    {p.name} <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
                  </a>
                  {i < PRICING_PAGES.length - 1 ? "," : null}
                </span>
              ))}
            </p>
          </Card>

          <Card>
            <CardTitle icon={KeyIcon}>Settings it needs</CardTitle>
            <p className="mt-1 text-sm text-ink-2">Names only. Their values belong in the host&apos;s settings; Farbaek never reads or stores them here.</p>
            {plan.envNames.length === 0 ? (
              <p className="mt-4 text-sm text-ink-3">None found in the files.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {plan.envNames.map((e) => (
                  <li key={e.name} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <code className="break-all font-mono text-label text-ink">{e.name}</code>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                      {e.public ? <StatusBadge status="attention" label="Visible in the browser" /> : null}
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
          <CardTitle id="where-title" icon={CloudArrowUpIcon}>
            Where it can go
          </CardTitle>
          <p className="mt-1 text-sm text-ink-2">Farbaek Sites works today. Vercel and Netlify serve sites, and Render, Railway and Fly.io run apps, each from your own account, connected below. Farbaek charges nothing here.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <li className={`grid gap-2 rounded-md border p-5 ${sitesDestination.available ? "border-accent/30 bg-accent/[0.04] shadow-e1" : "border-line bg-surface"}`}>
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{sitesDestination.name}</span>
              {sitesDestination.available ? <StatusBadge status="verified" label="Available" /> : <StatusBadge status="off" label="Not for this project" />}
            </span>
            <span className="text-sm text-ink-2">{sitesDestination.suits}</span>
          </li>
          {providers.map((p) => {
            const connectable = isLaunchProvider(p.id);
            const connection = isLaunchProvider(p.id) ? (connections[p.id] ?? null) : null;
            return (
              <li key={p.id} className={`grid content-start gap-2 rounded-md border bg-surface p-5 ${connection ? "border-verified/30 shadow-e1" : "border-line"}`}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink">{p.name}</span>
                  {connection ? <StatusBadge status="verified" label="Connected" /> : <StatusBadge status="off" label="Not connected" />}
                </span>
                <span className="text-sm text-ink-2">{p.suits}</span>
                {connectable ? (
                  <a href={`#launch-${p.id}`} className="-my-3 inline-flex min-h-11 w-fit items-center py-3 text-xs font-medium text-accent hover:underline">
                    {unfitFor[p.id as LaunchProvider] ? "Not for this project. Why, below." : connection ? `As ${connection.accountName}. Launch it below.` : "Connect your own account below."}
                  </a>
                ) : (
                  <span className="text-xs text-ink-3">{p.reason}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {LAUNCH_PROVIDERS.map((provider) => (
        <ProviderPanel
          key={provider}
          provider={provider}
          projectId={project.id}
          launchKey={crypto.randomUUID()}
          target={isServerProvider(provider) ? serverName(project.name) : provider === "netlify" ? netlifySiteName(project.name) : vercelProjectName(project.name)}
          connection={connections[provider] ?? null}
          orders={orders.filter((o) => o.provider === provider)}
          busy={busy}
          files={deployFiles}
          evidence={proof.status}
          builds={isServerProvider(provider) ? runs : provider === "netlify" ? NETLIFY_BUILDS : vercelBuilds(vercelSettings(plan))}
          unfit={unfitFor[provider]}
          connectReason={connectReason}
          launchReason={launchReason ?? withheldFor(ctx.role, ctx.permissions, "publish")}
          canOverride={canManage}
          canDisconnect={canManage && !readOnly}
        />
      ))}

      <OutcomeWatch projectId={project.id} watch={watch} disabledReason={launchReason} />

      {publish && publish.deployments.length > 0 ? (
        <section aria-labelledby="timeline-title" className="grid gap-4">
          <CardTitle id="timeline-title" icon={ClockCounterClockwiseIcon}>
            Every version
          </CardTitle>
          <ol className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
            {publish.deployments.map((d) => {
              const c = checks[d.id];
              const isLive = d.id === live?.id;
              return (
                <li key={d.id} id={`version-${d.number}`} className="grid scroll-mt-24 gap-2 px-5 py-4 target:bg-accent/[0.05] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                  <span className="grid gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">Version {d.number}</span>
                      {isLive ? <StatusBadge status="verified" label="Live" /> : null}
                    </span>
                    <span className="text-xs text-ink-3" title={`sha256:${d.digest}`}>
                      Published <RelativeTime iso={d.createdAt} />. {d.fileCount} {d.fileCount === 1 ? "file" : "files"}, {formatBytes(d.totalBytes)}
                      {d.securityScore !== null ? `, with a security score of ${d.securityScore} out of 100` : ""}.
                    </span>
                  </span>
                  <span className="text-xs text-ink-2">
                    {c ? (
                      // How the check ended is its kind's icon and colour; the words stay in one colour whichever it is.
                      <span className="inline-flex items-center gap-1.5">
                        <StatusGlyph status={VERDICT_KIND[c.verdict]} size={14} />
                        {isLive || c.verdict !== "live" ? VERDICT_WORDS[c.verdict] : "Served exactly this version when checked"}, <RelativeTime iso={c.checkedAt} />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-ink-3">
                        <StatusGlyph status="unverified" size={14} />
                        Not checked
                      </span>
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
