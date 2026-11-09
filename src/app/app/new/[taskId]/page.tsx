import { ArrowCounterClockwiseIcon, ArrowLeftIcon, GitDiffIcon, ListChecksIcon, PencilSimpleLineIcon, QuestionIcon, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { ReportResult } from "@/components/tasks/report-result";
import { notFound } from "next/navigation";
import { CancelTaskControl } from "@/components/app/forms";
import { CardTitle } from "@/components/app/primitives";
import { sayOperation } from "@/components/app/contract-view";
import { ApproveBuild } from "@/components/build/approve-build";
import { FARBAEK_SKILLS, defaultSkills } from "@/content/skills";
import { splitByPins } from "@/core/agent/skill-pins";
import { isProjectSkillPath } from "@/core/agent/skills";
import { pinMap } from "@/server/workspace/skill-pins";
import { ClearKeptPrompt } from "@/components/build/prompt-composer";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { kitTierFor } from "@/core/media/kit-tier";
import { themeFromPrompt } from "@/core/media/studio-kit";
import { contractHash } from "@/core/realityloop/contract";
import { resolveAiProvider } from "@/server/ai/config";
import { loadAppContext } from "@/server/workspace/context";
import { runEstimates, runKindFor } from "@/server/workspace/plan-card-data";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { withheldFor } from "@/core/workspace/permissions";
import { PAGE_TITLE } from "@/components/ui/titles";

export const metadata: Metadata = { title: "Your plan" };

// Sections assemble once, in reading order (motion-safe only).
const rise = "motion-safe:animate-[usage-in_420ms_cubic-bezier(0.16,1,0.3,1)_both]";

/** Each section's title carries the icon that names it (ADR 0183), the same way on every section. */
function Section({ title, icon, delay, children }: { title: string; icon: Icon; delay: number; children: React.ReactNode }) {
  return (
    <section className={`grid content-start gap-3 rounded-md border border-line bg-canvas-2/60 p-5 ${rise}`} style={{ animationDelay: `${delay}ms` }}>
      <CardTitle icon={icon}>{title}</CardTitle>
      {children}
    </section>
  );
}

/** Mono only for something that reads as a path or a command; a word like "products" is a word (ADR 0180). */
const looksLikeCode = (s: string) => /[/.\\:_]|^[a-z]+(?: [-\w]+)+$/.test(s) && !/\s[a-z]+\s/.test(s);

const Chips = ({ items, empty }: { items: string[]; empty: string }) =>
  items.length ? (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <li key={i} className={`rounded-full border border-line bg-surface px-2.5 py-0.5 text-ink-2 leading-normal ${looksLikeCode(i) ? "max-w-full break-all font-mono text-xs" : "text-label"}`}>
          {i}
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-ink-3">{empty}</p>
  );

type Params = { params: Promise<{ taskId: string }> };

export default async function PlanCardPage({ params }: Params) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const { taskId } = await params;
  const found = await ctx.reader.getTask(ctx.current.id, taskId);
  if (!found) notFound();
  const { task } = found;
  // A site's first build or a design upgrade (ADR 0158): Sonnet on Free, a whole site's estimate, no run cap by default.
  const kind = await runKindFor(ctx.reader, ctx.current.id, task.id);
  const estimates = runEstimates(ctx.current, undefined, kind);
  const strongerFirstBuild = kind.designPass === true && estimates.balanced?.model !== runEstimates(ctx.current).balanced?.model;
  const [contract, project, files, pins] = await Promise.all([
    ctx.reader.getContract(ctx.current.id, task.id),
    ctx.reader.getProject(ctx.current.id, task.projectId),
    ctx.reader.listFiles(ctx.current.id, task.projectId).catch(() => []),
    ctx.reader.listSkillPins(ctx.current.id, task.projectId).catch(() => []),
  ]);
  // Skills (ADR 0030): the ones that fit this plan start chosen; the project's own apply in their approved version (ADR 0043).
  const { use: pinnedFiles, held } = splitByPins(files, pinMap(pins));
  const skillName = (path: string) => path.split("/")[2]!;
  const projectSkillNames = pinnedFiles.filter((f) => isProjectSkillPath(f.path)).map((f) => skillName(f.path));
  const heldSkillNames = held.map((h) => skillName(h.path));

  const canBuild = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const ai = resolveAiProvider();
  const intact = contract ? (await contractHash(contract.body)) === contract.sha256 : false;
  const reason = !ctx.writes.enabled
    ? ctx.writes.reason
    : !canBuild
      ? "Your role can view this plan but not approve it."
      : ai.provider !== "anthropic"
        ? "Cloud runs aren't available on this server yet. You can still approve the plan from the task page."
        : !intact
          ? "This plan doesn't match what was saved. Open the task to check it."
          : withheldFor(ctx.role, ctx.permissions, "run_agents")
            ? `${withheldFor(ctx.role, ctx.permissions, "run_agents")} You can still approve the plan from the task page.`
            : null;

  const c = contract?.body;
  // What the plan keeps as it is: forbidden operations, protected fields and invariants.
  const kept = c ? [...c.forbiddenOperations.map(sayOperation), ...c.protectedFields, ...c.protectedInvariants.map((i) => i.statement)] : [];
  // The premium core (motion, 3D, brand identity) for anything people will see, plus what fits this plan (ADR 0156).
  const suggested = defaultSkills(`${task.title} ${c?.outcome ?? ""} ${project?.description ?? ""}`).map((s) => s.id);
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <ClearKeptPrompt />
      <Link href="/app/build" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={16} weight="bold" aria-hidden /> Build
      </Link>

      {!contract || !c ? (
        <section className="grid gap-4 rounded-lg border border-line bg-surface p-6 shadow-e2 sm:p-8">
          <h1 className={PAGE_TITLE}>{task.title}</h1>
          <p className="text-body leading-relaxed text-ink-2">
            Your project <span className="font-medium text-ink">{project?.name ?? ""}</span> is ready, but there&apos;s no plan yet. The AI couldn&apos;t draft one this time.
            Open the task to draft it again or write it yourself; nothing was charged for a draft that didn&apos;t finish.
          </p>
          <Link href={`/app/tasks/${task.id}`} className={buttonClasses("primary", "md", "w-fit")}>
            <PencilSimpleLineIcon size={16} weight="bold" aria-hidden /> Write the plan
          </Link>
        </section>
      ) : (
        <section aria-labelledby="plan-title" className="grid gap-6 rounded-lg border border-line bg-surface p-6 shadow-e2 sm:p-8">
          <div className="flex">
            {task.state === "CANCELLED" ? (
              <StatusBadge status="off" label="Cancelled" />
            ) : contract.status === "approved" ? (
              <StatusBadge status="done" label="Approved" />
            ) : (
              <StatusBadge status="approval" label="Waiting for your approval" />
            )}
          </div>
          <div className={`grid gap-2 ${rise}`}>
            <h1 id="plan-title" className={PAGE_TITLE}>
              {c.outcome}
            </h1>
            <p className="text-sm text-ink-3">
              In <span className="text-ink-2">{project?.name ?? "your project"}</span>. You asked: “{task.title}”
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="What will change" icon={GitDiffIcon} delay={80}>
              <p className="text-sm text-ink-2">{c.allowedOperations.length ? c.allowedOperations.map(sayOperation).join(", ") : "Nothing yet: the plan allows no changes."}</p>
              <Chips items={c.scope.resources} empty="Anywhere in the project." />
            </Section>
            <Section title="How it will be checked" icon={ListChecksIcon} delay={160}>
              <ul className="grid list-disc gap-1.5 pl-5 text-sm text-ink marker:text-ink-3">
                {c.acceptanceCriteria.map((a) => (
                  <li key={a.id}>{a.statement}</li>
                ))}
              </ul>
              {c.requiredChecks.length ? <Chips items={c.requiredChecks} empty="" /> : null}
            </Section>
            <Section title="What stays untouched" icon={ShieldCheckIcon} delay={240}>
              {kept.length ? (
                <ul className="grid gap-1 text-sm text-ink-2">
                  {kept.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-2">Nothing is marked as protected.</p>
              )}
            </Section>
            <Section title="If something goes wrong" icon={ArrowCounterClockwiseIcon} delay={320}>
              <p className="text-sm text-ink-2">{c.recovery}</p>
              {c.assumptions.length ? <p className="text-label text-ink-3">Assumes: {c.assumptions.join("; ")}</p> : null}
            </Section>
          </div>

          {c.openQuestions.length ? (
            // Questions need a person to settle them, so the box is in the "your turn" blue (ADR 0183).
            <div className={`grid gap-2 rounded-md border border-approval/30 bg-approval/[0.04] p-5 ${rise}`} style={{ animationDelay: "400ms" }}>
              <p className="flex items-center gap-2 text-sm font-medium text-approval">
                <QuestionIcon size={20} className="shrink-0" aria-hidden /> Questions to settle
              </p>
              <ul className="grid gap-1 text-sm text-ink">
                {c.openQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <p className="text-xs text-ink-3">Edit the plan to answer them, or approve it as it is and the agent stays within everything above.</p>
            </div>
          ) : null}

          <div className="border-t border-line pt-6">
            {task.state === "CANCELLED" ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-ink-2">This plan was cancelled, so it can&apos;t be built. Its history is kept.</p>
                <Link href="/app/build" className={buttonClasses("primary", "sm")}>
                  Start a new build
                </Link>
              </div>
            ) : contract.status === "approved" ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-ink-2">This plan is approved.</p>
                <Link href="/app/build" className={buttonClasses("primary", "sm")}>
                  Open Build
                </Link>
              </div>
            ) : (
              <div className="grid gap-4">
                <ApproveBuild
                  taskId={task.id}
                  version={contract.version}
                  expectedTaskVersion={task.version}
                  sha256={contract.sha256}
                  estimates={estimates}
                  disabledReason={reason}
                  skills={FARBAEK_SKILLS.map((s) => ({ id: s.id, label: s.label, description: s.description }))}
                  suggested={suggested}
                  projectSkills={projectSkillNames}
                  heldSkills={heldSkillNames}
                  skillsHref={`/app/projects/${task.projectId}#skills`}
                  kitPro={kitTierFor(ctx.current.plan) === "pro"}
                  defaultCap={kind.designPass ? "plan" : "double"}
                  defaultTheme={themeFromPrompt(task.title)}
                  firstBuildNote={strongerFirstBuild ? "A first build sets the look, so Free writes it with Claude Sonnet. Later changes use the fast model." : null}
                />
                <CancelTaskControl taskId={task.id} version={task.version} disabledReason={!ctx.writes.enabled ? ctx.writes.reason : canBuild ? null : "Your role can view this plan but not cancel it."} />
              </div>
            )}
            {task.state === "CANCELLED" ? null : (
              <p className="mt-4 text-xs leading-relaxed text-ink-3">
                Approving covers exactly this plan. The agent works on a copy, can&apos;t go beyond the plan, and nothing changes in your project until you review and approve the
                result.
              </p>
            )}
            <ReportResult about={{ taskId: task.id }} className="mt-2" />
          </div>
        </section>
      )}
    </div>
  );
}
