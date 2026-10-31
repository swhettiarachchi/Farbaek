import { CircleDashedIcon, DesktopIcon, FlowArrowIcon, FolderSimpleIcon, MagnifyingGlassIcon, PlugsConnectedIcon, ScrollIcon, UserIcon, WarningIcon, WrenchIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Notice, PageHeader } from "@/components/app/primitives";
import { TrustMap } from "@/components/trust/trust-map";
import { buttonClasses } from "@/components/ui/button";
import { neighbours, projectId, rulesOn, whoCanChange, type Answer, type TrustNode, type TrustNodeKind } from "@/core/trust/trust-graph";
import { loadTrustGraph } from "@/server/trust/trust-graph";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Trust graph" };

const KIND: Record<TrustNodeKind, { word: string; icon: Icon }> = {
  person: { word: "Person", icon: UserIcon },
  agent: { word: "Agent", icon: DesktopIcon },
  workflow: { word: "Workflow", icon: FlowArrowIcon },
  project: { word: "Project", icon: FolderSimpleIcon },
  integration: { word: "Connected service", icon: PlugsConnectedIcon },
  tool: { word: "Tool", icon: WrenchIcon },
  rule: { word: "Workspace rule", icon: ScrollIcon },
};

const field = "min-h-11 w-full rounded-sm border border-line bg-surface px-3 text-base sm:text-sm";

function NodeName({ node }: { node: TrustNode }) {
  const k = KIND[node.kind];
  return (
    <Link href={`?node=${encodeURIComponent(node.id)}#focus`} className="inline-flex min-h-11 min-w-0 items-center gap-2 font-medium text-ink hover:text-accent">
      <k.icon size={18} className="shrink-0 text-ink-3" aria-hidden />
      <span className="break-words">{node.label}</span>
      {node.inactive ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong/60 px-2 py-0.5 text-xs font-normal text-ink-3">
          <CircleDashedIcon size={12} aria-hidden /> inactive
        </span>
      ) : null}
    </Link>
  );
}

function AnswerList({ answers, empty }: { answers: Answer[]; empty: string }) {
  if (answers.length === 0) return <p className="text-sm text-ink-2">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {answers.map((a, i) => (
        <li key={`${a.node.id}-${i}`} className="grid gap-0.5 rounded-sm border border-line bg-surface px-3 py-2">
          <NodeName node={a.node} />
          <p className="flex flex-wrap items-center gap-x-1 text-sm text-ink-2">
            {a.via.map((e, j) => (
              <span key={j} className={e.limited ? "inline-flex items-center gap-1 text-approval" : ""}>
                {e.limited ? <WarningIcon size={14} aria-hidden /> : null}
                {j > 0 ? "then " : ""}
                {e.label}
                {j < a.via.length - 1 ? "," : ""}
              </span>
            ))}
            <span className="text-xs text-ink-3">({a.via.map((e) => e.source).join("; ")})</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The trust graph (ADR 0132): who and what can act in this workspace, and on
 * what, from the workspace's own records. Ask who can change a project,
 * select anything to see what it reaches, or search by name.
 */
export default async function TrustPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const { graph, unread } = await loadTrustGraph(ctx, ctx.current.id);
  const projects = graph.nodes.filter((n) => n.kind === "project" && !n.inactive);
  const asked = typeof sp.project === "string" ? sp.project : (projects[0]?.id.replace(/^project:/, "") ?? null);
  const askedNode = asked ? graph.nodes.find((n) => n.id === projectId(asked)) : undefined;
  const focusId = typeof sp.node === "string" && graph.nodes.some((n) => n.id === sp.node) ? sp.node : null;
  const focus = focusId ? graph.nodes.find((n) => n.id === focusId)! : null;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase().slice(0, 80) : "";
  const found = q ? graph.nodes.filter((n) => n.label.toLowerCase().includes(q) || n.detail.toLowerCase().includes(q)) : [];
  const limited = graph.edges.filter((e) => e.limited).length;

  return (
    <div className="grid gap-6">
      <PageHeader title="Trust graph" description="Who and what can act in this workspace, and on what: people, paired agents with their leases and tools, workflows, rules and connected services, from the workspace's own records." />

      {ctx.mode === "demo" ? <Notice>Sample data: the demo workspace&apos;s people, agents and projects.</Notice> : null}
      {unread.length ? <Notice tone="warning">Couldn&apos;t read {unread.join(", ")} just now, so the graph leaves them out. Reload to try again.</Notice> : null}

      <Card>
        <h2 className="text-lg font-medium">Who and what can change a project?</h2>
        <form className="mt-3 flex flex-wrap items-end gap-3" method="get">
          <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
            Project
            <select name="project" defaultValue={asked ?? ""} className={field}>
              {projects.map((p) => (
                <option key={p.id} value={p.id.replace(/^project:/, "")}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonClasses("secondary", "sm")}>
            Ask
          </button>
        </form>
        <div className="mt-4">
          {askedNode ? <AnswerList answers={whoCanChange(graph, askedNode.id.replace(/^project:/, ""))} empty="Nobody and nothing can change it." /> : <p className="text-sm text-ink-2">There are no active projects yet.</p>}
        </div>
        {askedNode ? (
          <div className="mt-4 grid gap-2">
            <h3 className="text-sm font-medium">Workspace rules on its changes</h3>
            <AnswerList answers={rulesOn(graph, askedNode.id.replace(/^project:/, ""))} empty="No workspace rules. Farbaek's built-in policy still decides what needs a person." />
          </div>
        ) : null}
        <p className="mt-3 text-xs text-ink-3">An agent always acts with the role of the person who paired it, checked again on every request, and only within its lease. It never has more authority than its person.</p>
      </Card>

      <section aria-labelledby="map-title" className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="map-title" className="text-lg font-medium">
            Map
          </h2>
          <p className="text-xs text-ink-3">
            {graph.nodes.length} records, {graph.edges.length} connections{limited ? `, ${limited} limited (dashed)` : ""}. Select one to see what it reaches.
          </p>
        </div>
        <TrustMap graph={graph} focus={focusId} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 id="focus" className="scroll-mt-24 text-lg font-medium">
            {focus ? focus.label : "Select something"}
          </h2>
          {focus ? (
            <div className="mt-3 grid gap-4">
              <p className="text-sm text-ink-2">
                {KIND[focus.kind].word}. {focus.detail}.
              </p>
              <div className="grid gap-2">
                <h3 className="text-sm font-medium">What it reaches</h3>
                <AnswerList answers={neighbours(graph, focus.id).out} empty="Nothing." />
              </div>
              <div className="grid gap-2">
                <h3 className="text-sm font-medium">What reaches it</h3>
                <AnswerList answers={neighbours(graph, focus.id).in} empty="Nothing." />
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-2">Select a person, agent, workflow, tool, project, rule or service on the map, or search for one.</p>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-medium">Search</h2>
          <form className="mt-3 flex flex-wrap items-end gap-3" method="get">
            <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
              Name or detail
              <input name="q" defaultValue={q} maxLength={80} placeholder="An email, agent, tool, project or rule" className={field} />
            </label>
            <button type="submit" className={buttonClasses("secondary", "sm")}>
              <MagnifyingGlassIcon size={16} aria-hidden /> Search
            </button>
          </form>
          {q ? (
            <ul className="mt-4 grid gap-1">
              {found.length ? (
                found.map((n) => (
                  <li key={n.id}>
                    <NodeName node={n} /> <span className="text-sm text-ink-3">{n.detail}</span>
                  </li>
                ))
              ) : (
                <li className="text-sm text-ink-2">Nothing matches &ldquo;{q}&rdquo;.</li>
              )}
            </ul>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
