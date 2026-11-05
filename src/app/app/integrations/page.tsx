import { CircuitryIcon, CloudArrowUpIcon, DesktopIcon, EnvelopeSimpleIcon, GithubLogoIcon, GlobeIcon, LockSimpleIcon, PackageIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { LAUNCH_PROVIDERS, PROVIDER_NAMES } from "@/core/launch/providers";
import { loadAppContext } from "@/server/workspace/context";
import { loadIntegrations } from "@/server/workspace/integrations";

export const metadata: Metadata = { title: "Connections" };

interface Row {
  id: string;
  icon: Icon;
  name: string;
  does: string;
  status: { tone: Status; label: string };
  detail: ReactNode;
  action: { href: string; label: string } | null;
}

/**
 * Everything this workspace connects to, in one place (ADR 0120), each with
 * its real state from the workspace's records and the next step. Connecting
 * and disconnecting stay where they happen: a project's Launch page, Agents,
 * Mesh and Settings.
 */
export default async function IntegrationsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const v = await loadIntegrations(ctx, ctx.current.id);
  const unread = ctx.mode === "demo" ? "The demo workspace has no connections." : "Couldn't be read just now. Reload to try again.";

  const rows: Row[] = [
    {
      id: "farbaek-hosting",
      icon: GlobeIcon,
      name: "Farbaek hosting",
      does: "Publishes a static site at its own address on farbaek.si, with custom domains.",
      status:
        v.liveSites === null ? { tone: "unverified", label: "Not read" } : v.liveSites > 0 ? { tone: "verified", label: `${v.liveSites} live` } : { tone: "info", label: "Ready" },
      detail: v.liveSites === null ? unread : v.liveSites > 0 ? `${v.liveSites === 1 ? "1 site is" : `${v.liveSites} sites are`} live.` : "No site is live yet. Publish one from its project page.",
      action: { href: "/app/projects", label: "Open projects" },
    },
    ...LAUNCH_PROVIDERS.map((p): Row => {
      const c = v.connections?.[p] ?? null;
      return {
        id: p,
        icon: CloudArrowUpIcon,
        name: PROVIDER_NAMES[p],
        does: `Launches a project to your own ${PROVIDER_NAMES[p]} account with LaunchOS, after you approve it.`,
        status: v.connections === null ? { tone: "unverified", label: "Not read" } : c ? { tone: "verified", label: "Connected" } : { tone: "unverified", label: "Not connected" },
        detail:
          v.connections === null ? (
            unread
          ) : c ? (
            <>
              Connected to {c.accountName} on <LocalTime iso={c.createdAt} />.{" "}
              {c.lastUsedAt ? (
                <>
                  Last used <LocalTime iso={c.lastUsedAt} />.
                </>
              ) : (
                "Not used yet."
              )}
            </>
          ) : (
            `Connect it from a project's Launch page, with a token you create in ${PROVIDER_NAMES[p]}. Farbaek stores it sealed and never shows it again.`
          ),
        action: { href: "/app/projects", label: c ? "Launch a project" : "Choose a project" },
      };
    }),
    {
      id: "github",
      icon: GithubLogoIcon,
      name: "GitHub",
      does: "Imports a public repository as a new project, and opens a pull request for each applied change, with a Farbaek ProofPack status check.",
      status: v.github === null ? { tone: "unverified", label: "Not read" } : v.github.login ? { tone: "verified", label: "Connected" } : { tone: "info", label: "Import only" },
      detail:
        v.github === null
          ? unread
          : v.github.login
            ? `Connected as ${v.github.login}. ${v.github.linked === 1 ? "1 project is" : `${v.github.linked} projects are`} linked to a repository.`
            : "Connect a fine-grained token in Settings to open pull requests. Importing public repositories needs nothing.",
      action: v.github?.login ? { href: "/app/projects", label: "Choose a project" } : { href: "/app/settings#github", label: "Connect GitHub" },
    },
    {
      id: "agents",
      icon: DesktopIcon,
      name: "Farbaek Agent",
      does: "The desktop app that works on approved tasks on your computer, under a lease you control.",
      status: v.agents.paired > 0 ? { tone: "verified", label: `${v.agents.paired} paired` } : { tone: "unverified", label: "None paired" },
      detail: v.agents.paired > 0 ? `${v.agents.paired === 1 ? "1 agent is" : `${v.agents.paired} agents are`} paired with this workspace.` : "Pair a computer with a one-time code.",
      action: { href: "/app/agents", label: "Open Agents" },
    },
    {
      id: "mesh",
      icon: PackageIcon,
      name: "Move projects",
      does: "Moves folders between your own computers, directly or through Farbaek's relay.",
      status: v.agents.reachable > 0 ? { tone: "verified", label: `${v.agents.reachable} reachable` } : { tone: "info", label: "Nearby only" },
      detail:
        v.agents.reachable > 0
          ? `${v.agents.reachable === 1 ? "1 computer is" : `${v.agents.reachable} computers are`} reachable through Farbaek.`
          : "No computer is reachable through Farbaek, so transfers work only on the same network.",
      action: { href: "/app/mesh", label: "Open Move projects" },
    },
    {
      id: "email",
      icon: EnvelopeSimpleIcon,
      name: "Email",
      does: "Sends updates about your work, trial reminders and billing notices.",
      status: v.emailSending ? { tone: "verified", label: "Sending" } : { tone: "unverified", label: "Not sending" },
      detail: v.emailSending ? "Each person chooses work updates and trial reminders in Settings. Owners and admins always get billing notices." : "Farbaek isn't sending email from this server yet.",
      action: { href: "/app/settings#email", label: "Email choices" },
    },
    {
      id: "ai",
      icon: CircuitryIcon,
      name: "AI models",
      does: v.modelKey ? "Plans, drafting and agent runs use this workspace's own Anthropic key." : "Plans, drafting and agent runs use Farbaek's AI. No API key needed.",
      status: v.modelKey ? { tone: "verified", label: "Your key" } : { tone: "verified", label: "Included" },
      detail: v.modelKey
        ? `The key ends ${v.modelKey.hint}${v.modelKey.gateway ? `, through ${v.modelKey.gateway}` : ""}. Calls on it don't count against this workspace's AI usage.`
        : "Each step counts against this workspace's AI usage, at the model's real token cost. Owners and admins can use their own Anthropic key instead.",
      action: { href: "/app/settings#ai-key", label: v.modelKey ? "AI key settings" : "Use your own key" },
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title="Connections" description="The services this workspace is linked to, and what each one does. Connect or disconnect each one where it's used." />

      <ul className="grid gap-4 md:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="grid content-start gap-3 rounded-md border border-line bg-surface p-5 shadow-e1">
            <div className="flex items-start justify-between gap-3">
              <span className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-2">
                  <r.icon size={20} aria-hidden />
                </span>
                <h2 className="text-base font-medium">{r.name}</h2>
              </span>
              <StatusBadge status={r.status.tone} label={r.status.label} />
            </div>
            <p className="text-sm leading-relaxed text-ink-2">{r.does}</p>
            <p className="text-sm leading-relaxed text-ink-3">{r.detail}</p>
            {r.action ? (
              <div>
                <ButtonLink href={r.action.href} variant="secondary" size="sm">
                  {r.action.label}
                </ButtonLink>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <section aria-labelledby="not-yet" className="grid gap-3 rounded-md border border-dashed border-line-strong/40 bg-canvas p-5">
        <h2 id="not-yet" className="flex items-center gap-2 text-base font-medium text-ink-2">
          <LockSimpleIcon size={18} aria-hidden /> Not available yet
        </h2>
        <ul className="grid gap-1.5 text-sm leading-relaxed text-ink-2">
          <li>Importing private GitHub repositories.</li>
          <li>Local models running on your own computer.</li>
          <li>Streaming the activity log to your own systems.</li>
        </ul>
      </section>
    </div>
  );
}
