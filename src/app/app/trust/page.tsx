import { CursorClickIcon, DesktopIcon, FlowArrowIcon, GraphIcon, MagnifyingGlassIcon, PlugsConnectedIcon, ScalesIcon, SquaresFourIcon, UserIcon, UsersThreeIcon, WarningIcon, WrenchIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, Notice, PageHeader } from "@/components/app/primitives";
import { TrustMap } from "@/components/trust/trust-map";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { neighbours, projectId, rulesOn, whoCanChange, type Answer, type TrustNode, type TrustNodeKind } from "@/core/trust/trust-graph";
import { loadTrustGraph } from "@/server/trust/trust-graph";
import { loadAppContext } from "@/server/workspace/context";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Who can do what" };

const KIND: Record<TrustNodeKind, { word: string; icon: Icon }> = {
  person: { word: "Person", icon: UserIcon },
  agent: { word: "Agent", icon: DesktopIcon },
  workflow: { word: "Workflow", icon: FlowArrowIcon },
  project: { word: "Project", icon: SquaresFourIcon },
  integration: { word: "Connected service", icon: PlugsConnectedIcon },
  tool: { word: "Tool", icon: WrenchIcon },
  rule: { word: "Workspace rule", icon: ScalesIcon },
};

function NodeName({ node }: { node: TrustNode }) {
  const k = KIND[node.kind];
  return (
    <Link href={`?node=${encodeURIComponent(node.id)}#focus`} className="inline-flex min-h-11 min-w-0 items-center gap-2 font-medium text-ink hover:text-accent">
      <k.icon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
      <span className="min-w-0 break-words">{node.label}</span>
      {node.inactive ? <StatusBadge status="off" label="Inactive" /> : null}
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
              // Limited access is a look first, not a turn to act: burnt orange (ADR 0183).
              <span key={j} className={e.limited ? "inline-flex items-center gap-1 text-caution" : ""}>
                {e.limited ? <WarningIcon size={14} weight="bold" aria-hidden /> : null}
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
      <PageHeader title="Who can do what" description="Everyone and everything that can act in this workspace, and what each can change: people, desktop agents, workflows, rules and connected services." />

      {ctx.mode === "demo" ? <Notice>Sample data: the demo workspace&apos;s people, agents and projects.</Notice> : null}
      {unread.length ? <Notice tone="warning">Couldn&apos;t read {unread.join(", ")} just now, so the graph leaves them out. Reload to try again.</Notice> : null}

      <Card>
        <CardTitle icon={UsersThreeIcon}>Who and what can change a project?</CardTitle>
        <form className="mt-3 flex flex-wrap items-end gap-3" method="get">
          <label className="grid min-w-0 flex-1 gap-1.5">
            <span className={LABEL_CLASSES}>Project</span>
            <select name="project" defaultValue={asked ?? ""} className={inputClasses()}>
              {projects.map((p) => (
                <option key={p.id} value={p.id.replace(/^project:/, "")}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonClasses("secondary", "md")}>
            Ask
          </button>
        </form>
        <div className="mt-4">
          {askedNode ? <AnswerList answers={whoCanChange(graph, askedNode.id.replace(/^project:/, ""))} empty="Nobody and nothing can change it." /> : <p className="text-sm text-ink-2">There are no active projects yet.</p>}
        </div>
        {askedNode ? (
          <div className="mt-4 grid gap-2">
            <h3 className="text-sm font-medium">Workspace rules on its changes</h3>
            <AnswerList answers={rulesOn(graph, askedNode.id.replace(/^project:/, ""))} empty="No workspace rules. Farbaek's built-in rules still decide what needs a person." />
          </div>
        ) : null}
        <p className="mt-3 text-xs text-ink-3">An agent always acts with the role of the person who paired it, checked again on every request. It acts only within the access it was given, and never has more authority than its person.</p>
      </Card>

      <section aria-labelledby="map-title" className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle id="map-title" icon={GraphIcon}>
            Map
          </CardTitle>
          <p className="text-sm text-ink-3">
            Select anything on the map to see what it reaches.{limited ? " A dashed line means that access is limited." : ""}
          </p>
        </div>
        <TrustMap graph={graph} focus={focusId} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle id="focus" icon={focus ? KIND[focus.kind].icon : CursorClickIcon} className="scroll-mt-24">
            {focus ? focus.label : "Select something"}
          </CardTitle>
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
          <CardTitle icon={MagnifyingGlassIcon}>Search</CardTitle>
          <form className="mt-3 flex flex-wrap items-end gap-3" method="get">
            <label className="grid min-w-0 flex-1 gap-1.5">
              <span className={LABEL_CLASSES}>Name or detail</span>
              <input name="q" defaultValue={q} maxLength={80} placeholder="An email, agent, tool, project or rule" className={inputClasses()} />
            </label>
            <button type="submit" className={buttonClasses("secondary", "md")}>
              <MagnifyingGlassIcon size={16} weight="bold" aria-hidden /> Search
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
