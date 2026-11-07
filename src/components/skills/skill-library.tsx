"use client";

import { ArrowSquareOutIcon, CheckCircleIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { addLibrarySkillAction, type SkillState } from "@/app/app/projects/[projectId]/skill-actions";
import { buttonClasses } from "@/components/ui/button";
import { LICENCE_LABELS, SKILL_USE_LABELS, type LibrarySkillMeta } from "@/core/agent/skill-library";

const IDLE: SkillState = { status: "idle" };

/** A library skill as a card shows it: its details, and its instructions without the frontmatter. */
export type LibraryCardSkill = LibrarySkillMeta & { text: string };

function Byline({ skill }: { skill: LibraryCardSkill }) {
  return (
    <p className="text-xs leading-relaxed text-ink-3">
      {skill.licence === "Farbaek" ? "By Farbaek." : `By ${skill.author}, ${LICENCE_LABELS[skill.licence]}.`}{" "}
      {skill.source ? (
        <a href={skill.source} target="_blank" rel="noopener noreferrer" className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
          Original <ArrowSquareOutIcon size={12} className="inline align-[-0.0625em]" aria-hidden />
          <span className="sr-only">(opens GitHub in a new tab)</span>
        </a>
      ) : null}
    </p>
  );
}

function Uses({ skill }: { skill: LibraryCardSkill }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Best for">
      {skill.uses.map((u) => (
        <li key={u} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2">
          {SKILL_USE_LABELS[u]}
        </li>
      ))}
    </ul>
  );
}

/** A skill's markdown as reading text: headings, bullets and paragraphs. Only text is rendered, never HTML. */
function SkillText({ text }: { text: string }) {
  const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
  const blocks: { kind: "h" | "li" | "p"; text: string }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (heading) blocks.push({ kind: "h", text: plain(heading[1]!) });
    else if (bullet) blocks.push({ kind: "li", text: plain(bullet[1]!) });
    else blocks.push({ kind: "p", text: plain(line) });
  }
  return (
    <div className="grid gap-1.5">
      {blocks.map((b, i) =>
        b.kind === "h" ? (
          <p key={i} className="mt-2 font-medium text-ink first:mt-0">
            {b.text}
          </p>
        ) : b.kind === "li" ? (
          <p key={i} className="ml-4 list-item list-disc marker:text-ink-3">
            {b.text}
          </p>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  );
}

function ReadIt({ skill }: { skill: LibraryCardSkill }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent">Read the skill</summary>
      <div
        tabIndex={0}
        role="region"
        aria-label={`The ${skill.label} skill`}
        className="mt-1 max-h-80 overflow-auto rounded-sm border border-line bg-surface-sunken p-4 text-[0.8125rem] leading-relaxed text-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <SkillText text={skill.text} />
      </div>
    </details>
  );
}

function Result({ state }: { state: SkillState }) {
  if (state.status === "error")
    return (
      <p role="alert" className="flex items-start gap-2 text-sm text-failed">
        <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
      </p>
    );
  if (state.status === "done")
    return (
      <p role="status" className="flex items-start gap-2 text-sm text-verified">
        <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
      </p>
    );
  return null;
}

/**
 * A library skill on the Skills page (ADR 0179): what it does, who made it under which licence, its full text,
 * and adding it to one of the workspace's projects.
 */
export function LibraryCard({ skill, projects, disabledReason }: { skill: LibraryCardSkill; projects: { id: string; name: string }[]; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(addLibrarySkillAction, IDLE);
  const selectId = useId();
  // Kept by hand: a form action resets its fields, and the next add is usually to the same project.
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  return (
    <article className="grid h-full content-start gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
      <div className="grid gap-1.5">
        <h3 className="text-[1.0625rem] font-medium tracking-[-0.01em]">{skill.label}</h3>
        <p className="text-sm leading-relaxed text-ink-2">{skill.summary}</p>
      </div>
      <Uses skill={skill} />
      <Byline skill={skill} />
      <ReadIt skill={skill} />
      {projects.length === 0 ? (
        <p className="text-sm text-ink-3">
          Skills belong to a project.{" "}
          <Link href="/app/new" className="font-medium text-accent underline underline-offset-2">
            Start one
          </Link>{" "}
          to add this.
        </p>
      ) : (
        <form action={action} className="mt-auto grid gap-2.5">
          <input type="hidden" name="skillId" value={skill.id} />
          {projects.length > 1 ? (
            <label htmlFor={selectId} className="grid gap-1.5">
              <span className="text-[0.8125rem] font-medium text-ink-3">Add to</span>
              <select
                id={selectId}
                name="projectId"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={Boolean(disabledReason) || pending}
                className="h-11 min-w-0 rounded-sm border border-line bg-surface px-3 text-base text-ink outline-none focus:border-accent/60 sm:text-sm"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="projectId" value={projects[0]!.id} />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary", "sm")}>
              <PlusIcon size={15} weight="bold" aria-hidden /> {pending ? "Adding…" : projects.length > 1 ? "Add to this project" : `Add to ${projects[0]!.name}`}
            </button>
            {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
          </div>
          <Result state={state} />
        </form>
      )}
    </article>
  );
}

/** A library skill in a project's Skills section: one step to add it, or a note that it's there. */
export function LibraryRow({ skill, projectId, added, disabledReason }: { skill: LibraryCardSkill; projectId: string; added: boolean; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(addLibrarySkillAction, IDLE);
  return (
    <li className="grid min-w-0 gap-2 rounded-sm border border-line px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">{skill.label}</span>
          <span className="mt-0.5 block text-sm leading-relaxed text-ink-2">{skill.summary}</span>
        </span>
        {added ? (
          <span className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-verified">
            <CheckCircleIcon size={16} weight="fill" aria-hidden /> Added
          </span>
        ) : (
          <form action={action}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="skillId" value={skill.id} />
            <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("secondary", "sm")} aria-label={`Add ${skill.label}`}>
              <PlusIcon size={15} weight="bold" aria-hidden /> {pending ? "Adding…" : "Add"}
            </button>
          </form>
        )}
      </div>
      <Byline skill={skill} />
      <ReadIt skill={skill} />
      <Result state={state} />
    </li>
  );
}
