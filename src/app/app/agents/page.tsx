import { DesktopIcon, EyeIcon, LockSimpleIcon, PencilSimpleLineIcon, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { revokeAgentAction } from "@/app/app/actions";
import { AgentDownload } from "@/components/agents/agent-download";
import { AgentLeasePanel } from "@/components/agents/agent-lease";
import { ToolPinPanel } from "@/components/agents/tool-pin";
import { readToolPins } from "@/server/agent/tool-pins";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { PairAgent } from "@/components/agents/pair-agent";
import { Card, EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { LEASE_WARNING_DAYS, leaseDaysLeft, leaseState } from "@/core/agent/lease";
import { AGENT_MODE_LABELS } from "@/core/agent/modes";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Agents" };

const PLATFORM_LABEL = { windows: "Windows", macos: "macOS", linux: "Linux" } as const;

/** Sandboxed Autopilot needs the desktop agent to run commands in a Farbaek sandbox, which isn't connected to the agent yet. */
const AUTOPILOT_UNAVAILABLE = "Not available yet: the desktop agent can't run commands in a Farbaek sandbox until that link is built. Use Review Only or Controlled Development.";

export default async function AgentsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const [agents, projects] = await Promise.all([ctx.reader.listAgents(ws.id), ctx.reader.listProjects(ws.id)]);
  // Tool Definition Pinning (ADR 0133): each agent's pinned tools, and any change waiting for review.
  const pinClient = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const pins = pinClient ? await readToolPins(pinClient, ws.id).catch(() => new Map()) : new Map();
  const active = agents.filter((a) => !a.revokedAt);
  const now = new Date();
  const ended = active.filter((a) => leaseState(a.lease, now) === "ended");
  const endingSoon = active.filter((a) => leaseState(a.lease, now) === "ending_soon");
  const leaseNotice =
    ended.length > 0
      ? `${ended.length === 1 ? `${ended[0]!.name}'s lease has` : `${ended.length} agents' leases have`} ended, so ${ended.length === 1 ? "it" : "they"} can't do anything until someone renews ${ended.length === 1 ? "it" : "them"} below.`
      : endingSoon.length > 0
        ? `${endingSoon.length === 1 ? `${endingSoon[0]!.name}'s lease ends` : `${endingSoon.length} agents' leases end`} within ${LEASE_WARNING_DAYS} days. Renew below to keep ${endingSoon.length === 1 ? "it" : "them"} working.`
        : null;
  const openProjects = projects.filter((p) => !p.archivedAt).map((p) => ({ id: p.id, name: p.name }));
  const leaseReason = ctx.mode === "demo" ? "The demo workspace is read-only." : !ctx.writes.enabled ? ctx.writes.reason : null;
  const limit = ws.plan.limits.agents;
  const canManage = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const canPair = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const pairReason =
    ctx.mode === "demo"
      ? "The demo workspace is read-only."
      : !ctx.writes.enabled
        ? ctx.writes.reason
        : !canPair
          ? "Viewers can't pair agents, since agents propose changes."
          : limit !== null && active.length >= limit
            ? `Every agent on this plan is in use (${active.length} of ${limit}). Revoke one to pair another computer.`
            : null;
  const usage = limit === null ? `${active.length} agents paired.` : `${active.length} of ${limit} agents on this plan.`;

  const modes = [
    { id: "review_only" as const, icon: EyeIcon, available: true, note: "No command runs and nothing on your disk changes." },
    { id: "controlled" as const, icon: PencilSimpleLineIcon, available: true, note: "Commands run on your computer, not isolated. Anything beyond reading waits for your approval." },
    { id: "sandboxed_autopilot" as const, icon: ShieldCheckIcon, available: false, note: AUTOPILOT_UNAVAILABLE },
  ];

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Agents"
        description="Farbaek Agent is a desktop app that works on a task's approved contract, using Farbaek's AI. No API key needed: each run uses your workspace's AI usage. Its work arrives here as a change proposal for you to review, apply and verify."
      />

      <AgentDownload />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <h2 className="text-lg font-medium">Pair a computer</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            Create a code, then type it into Farbaek Agent. The agent acts for you, only while you can contribute to this workspace, under a lease: 90 days on every project to start, which you can narrow or renew below. {usage}
          </p>
          <div className="mt-5">
            <PairAgent disabledReason={pairReason} />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-medium">What stays on your computer</h2>
          <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-ink-2">
            <li>The agent&apos;s working copy of the project, one folder per task.</li>
            <li>Commands you approve. They run with your account&apos;s rights, which is why the agent asks first.</li>
            <li>The agent&apos;s token, kept in the system keychain.</li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            Each model step goes through Farbaek to our AI provider (named in the Privacy Policy): the conversation, including the files the agent reads and the command output it shows the model. Farbaek doesn&apos;t keep the conversation. It records the model and its token counts against your AI usage, and checks the finished change again before you see it.
          </p>
        </Card>
      </div>

      <section aria-labelledby="agents-heading" className="grid gap-4">
        <h2 id="agents-heading" className="text-lg font-medium">
          Paired agents <span className="text-ink-3 tabular">{active.length}</span>
        </h2>
        {leaseNotice ? <Notice tone="warning">{leaseNotice}</Notice> : null}
        {agents.length === 0 ? (
          <EmptyState icon={DesktopIcon} title="No agents yet">
            Pair a computer with a code above. Each paired agent shows here with when it was last seen, and you can revoke it at any time.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
            {agents.map((a) => {
              const mine = a.pairedBy === ctx.user.id;
              const canRevoke = !a.revokedAt && ctx.mode === "live" && ctx.writes.enabled && (canManage || mine);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-2">
                    <DesktopIcon size={20} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{a.name}</span>
                    <span className="block text-xs leading-relaxed text-ink-3">
                      {PLATFORM_LABEL[a.platform]}
                      {a.appVersion ? `, app ${a.appVersion}` : ""}. Paired by {mine ? "you" : "a teammate"} <RelativeTime iso={a.createdAt} />.{" "}
                      {a.revokedAt ? (
                        <>
                          Revoked <RelativeTime iso={a.revokedAt} />.
                        </>
                      ) : a.lastSeenAt ? (
                        <>
                          Last seen <RelativeTime iso={a.lastSeenAt} />.
                        </>
                      ) : (
                        "Not seen since pairing."
                      )}
                    </span>
                  </span>
                  {a.revokedAt ? <StatusBadge status="unverified" label="Revoked" /> : <StatusBadge status="info" label="Paired" />}
                  {canRevoke ? (
                    <form action={revokeAgentAction}>
                      <input type="hidden" name="agentId" value={a.id} />
                      <button type="submit" className={buttonClasses("secondary", "sm")}>
                        Revoke
                      </button>
                    </form>
                  ) : null}
                  {a.revokedAt ? null : (
                    <ToolPinPanel agentId={a.id} pin={pins.get(a.id) ?? null} canApprove={canManage} disabledReason={leaseReason} />
                  )}
                  {a.revokedAt ? null : (
                    <AgentLeasePanel
                      agentId={a.id}
                      agentName={a.name}
                      lease={a.lease}
                      state={leaseState(a.lease, now)}
                      daysLeft={leaseDaysLeft(a.lease, now)}
                      projects={openProjects}
                      canEdit={canManage || mine}
                      disabledReason={leaseReason}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="modes-heading" className="grid gap-4">
        <h2 id="modes-heading" className="text-lg font-medium">
          How the agent works
        </h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {modes.map((m) => (
            <li key={m.id} className={`rounded-md border p-5 ${m.available ? "border-line bg-surface shadow-e1" : "border-dashed border-line-strong/40 bg-canvas"}`}>
              <div className="flex items-center gap-2">
                {m.available ? <m.icon size={20} className="text-accent" aria-hidden /> : <LockSimpleIcon size={20} className="text-ink-3" aria-hidden />}
                <h3 className={`text-base font-medium ${m.available ? "" : "text-ink-2"}`}>{AGENT_MODE_LABELS[m.id].title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{AGENT_MODE_LABELS[m.id].detail}</p>
              <p className={`mt-2 text-sm leading-relaxed ${m.available ? "text-ink-3" : "text-ink-2"}`}>{m.note}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
