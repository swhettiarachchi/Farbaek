import { ArrowLeftIcon, CheckCircleIcon, FilePlusIcon, LockSimpleIcon, PencilSimpleLineIcon, ProhibitIcon, QuestionIcon, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelTaskControl } from "@/components/app/forms";
import { ApproveBuild } from "@/components/build/approve-build";
import { FARBAEK_SKILLS, suggestSkills } from "@/content/skills";
import { splitByPins } from "@/core/agent/skill-pins";
import { isProjectSkillPath } from "@/core/agent/skills";
import { pinMap } from "@/server/workspace/skill-pins";
import { ClearKeptPrompt } from "@/components/build/prompt-composer";
import { buttonClasses } from "@/components/ui/button";
import { contractHash } from "@/core/realityloop/contract";
import { shortHash } from "@/core/trust/canonical-json";
import { resolveAiProvider } from "@/server/ai/config";
import { loadAppContext } from "@/server/workspace/context";
import { runEstimates } from "@/server/workspace/plan-card-data";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Your plan" };

const OPERATION_WORDS: Record<string, string> = {
  "files.create": "Add new files",
  "files.edit": "Edit files",
  "files.delete": "Delete files",
};
const say = (op: string) => OPERATION_WORDS[op] ?? op;

// Sections assemble once, in reading order (motion-safe only).
const rise = "motion-safe:animate-[usage-in_420ms_cubic-bezier(0.16,1,0.3,1)_both]";

function Section({ title, icon, delay, children }: { title: string; icon: React.ReactNode; delay: number; children: React.ReactNode }) {
  return (
    <section className={`grid content-start gap-3 rounded-md border border-line bg-canvas-2/60 p-5 ${rise}`} style={{ animationDelay: `${delay}ms` }}>
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

const Chips = ({ items, empty }: { items: string[]; empty: string }) =>
  items.length ? (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <li key={i} className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-[12.5px] text-ink-2">
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
        ? "Cloud runs need Claude on this server. You can still approve the plan from the task page."
        : !intact
          ? "The stored plan doesn't match its fingerprint. Open the task to check it."
          : null;

  const c = contract?.body;
  // What the plan keeps as it is: forbidden operations, protected fields and invariants.
  const kept = c ? [...c.forbiddenOperations.map(say), ...c.protectedFields, ...c.protectedInvariants.map((i) => i.statement)] : [];
  const suggested = suggestSkills(`${task.title} ${c?.outcome ?? ""} ${project?.description ?? ""}`).map((s) => s.id);
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <ClearKeptPrompt />
      <Link href="/app/build" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={16} aria-hidden /> Build
      </Link>

      {!contract || !c ? (
        <section className="grid gap-4 rounded-lg border border-line bg-surface p-6 shadow-e2 sm:p-8">
          <p className="text-[13px] font-medium text-ink-3">Your plan</p>
          <h1 className="text-2xl font-medium tracking-[-0.02em]">{task.title}</h1>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Your project <span className="font-medium text-ink">{project?.name ?? ""}</span> is ready, but there&apos;s no plan yet. The AI couldn&apos;t draft one this time.
            Open the task to draft it again or write it yourself; nothing was charged for a draft that didn&apos;t finish.
          </p>
          <Link href={`/app/tasks/${task.id}`} className={buttonClasses("primary", "md", "w-fit")}>
            <PencilSimpleLineIcon size={18} weight="bold" aria-hidden /> Write the plan
          </Link>
        </section>
      ) : (
        <section aria-labelledby="plan-title" className="grid gap-6 rounded-lg border border-line bg-surface p-6 shadow-e2 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-ink-3">
              <span className="font-medium">Your plan, version {contract.version}</span>
              <span className="font-mono text-xs" title={`sha256:${contract.sha256}`}>
                {shortHash(contract.sha256)}
              </span>
            </p>
            {task.state === "CANCELLED" ? (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong px-3 text-xs font-medium text-ink-2">
                <ProhibitIcon size={14} weight="bold" aria-hidden /> Cancelled
              </span>
            ) : contract.status === "approved" ? (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-verified/40 px-3 text-xs font-medium text-verified">
                <CheckCircleIcon size={14} weight="bold" aria-hidden /> Approved
              </span>
            ) : (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-approval/40 px-3 text-xs font-medium text-approval">
                <ShieldCheckIcon size={14} weight="bold" aria-hidden /> Waiting for your approval
              </span>
            )}
          </div>
          <div className={`grid gap-2 ${rise}`}>
            <h1 id="plan-title" className="text-balance text-[1.7rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.1rem]">
              {c.outcome}
            </h1>
            <p className="text-sm text-ink-3">
              In <span className="text-ink-2">{project?.name ?? "your project"}</span>. You asked: “{task.title}”
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="What will change" icon={<FilePlusIcon size={16} weight="bold" className="text-accent" aria-hidden />} delay={80}>
              <p className="text-sm text-ink-2">{c.allowedOperations.length ? c.allowedOperations.map(say).join(", ") : "Nothing yet: the plan allows no changes."}</p>
              <Chips items={c.scope.resources} empty="Anywhere in the project." />
            </Section>
            <Section title="How it will be checked" icon={<CheckCircleIcon size={16} weight="bold" className="text-verified" aria-hidden />} delay={160}>
              <ul className="grid gap-1.5 text-sm text-ink">
                {c.acceptanceCriteria.map((a) => (
                  <li key={a.id} className="flex gap-2">
                    <CheckCircleIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                    {a.statement}
                  </li>
                ))}
              </ul>
              {c.requiredChecks.length ? <Chips items={c.requiredChecks} empty="" /> : null}
            </Section>
            <Section title="What stays untouched" icon={<LockSimpleIcon size={16} weight="bold" className="text-ink-2" aria-hidden />} delay={240}>
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
            <Section title="If something goes wrong" icon={<ShieldCheckIcon size={16} weight="bold" className="text-ink-2" aria-hidden />} delay={320}>
              <p className="text-sm text-ink-2">{c.recovery}</p>
              {c.assumptions.length ? <p className="text-[13px] text-ink-3">Assumes: {c.assumptions.join("; ")}</p> : null}
            </Section>
          </div>

          {c.openQuestions.length ? (
            <div className={`grid gap-2 rounded-md border border-approval/40 bg-approval/[0.06] p-5 ${rise}`} style={{ animationDelay: "400ms" }}>
              <p className="flex items-center gap-2 text-sm font-medium text-approval">
                <QuestionIcon size={16} weight="bold" aria-hidden /> Questions to settle
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
                  estimates={runEstimates(ctx.current)}
                  disabledReason={reason}
                  skills={FARBAEK_SKILLS.map((s) => ({ id: s.id, label: s.label, description: s.description }))}
                  suggested={suggested}
                  projectSkills={projectSkillNames}
                  heldSkills={heldSkillNames}
                  skillsHref={`/app/projects/${task.projectId}#skills`}
                />
                <CancelTaskControl taskId={task.id} version={task.version} disabledReason={!ctx.writes.enabled ? ctx.writes.reason : canBuild ? null : "Your role can view this plan but not cancel it."} />
              </div>
            )}
            {task.state === "CANCELLED" ? null : (
              <p className="mt-4 text-xs leading-relaxed text-ink-3">
                Approving fixes this exact plan by its fingerprint. The agent works on a copy, can&apos;t go beyond the plan, and nothing changes in your project until you review
                and apply the result.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
