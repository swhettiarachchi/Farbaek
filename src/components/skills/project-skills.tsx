import { BookOpenTextIcon, TrashIcon } from "@phosphor-icons/react/ssr";
import { removeSkillAction } from "@/app/app/projects/[projectId]/skill-actions";
import type { Skill } from "@/core/agent/skills";
import { AddSkillForm } from "./add-skill-form";

export interface ProjectSkillView extends Skill {
  path: string;
  revision: number;
}

/**
 * The project's own skills (ADR 0030): instructions in the SKILL.md format
 * of Claude Skills that every build in this project follows, after the
 * Farbaek Studio standard and the skills chosen on the plan card.
 */
export function ProjectSkills({ projectId, skills, disabledReason }: { projectId: string; skills: ProjectSkillView[]; disabledReason: string | null }) {
  return (
    <section aria-labelledby="skills-heading" className="grid gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
      <div className="grid gap-1">
        <h2 id="skills-heading" className="flex items-center gap-2 text-lg font-medium">
          <BookOpenTextIcon size={20} weight="bold" className="text-accent" aria-hidden /> Skills
        </h2>
        <p className="text-sm leading-relaxed text-ink-2">
          Teach the agent how you like this project built: your brand, your stack, your rules. Skills use the SKILL.md format from Claude Skills, apply to every build here, and
          can&apos;t widen what a plan allows.
        </p>
      </div>
      {skills.length ? (
        <ul className="grid gap-2">
          {skills.map((s) => (
            <li key={s.path} className="flex flex-wrap items-start gap-3 rounded-sm border border-line px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{s.name}</span>
                {s.description ? <span className="mt-0.5 block text-sm text-ink-2">{s.description}</span> : null}
                <span className="mt-1 block truncate font-mono text-xs text-ink-3">{s.path}</span>
              </span>
              {disabledReason ? null : (
                <form action={removeSkillAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="path" value={s.path} />
                  <input type="hidden" name="revision" value={s.revision} />
                  <button type="submit" className="inline-flex size-11 items-center justify-center rounded-full text-ink-3 hover:bg-surface-raised hover:text-failed" aria-label={`Remove the ${s.name} skill`}>
                    <TrashIcon size={17} aria-hidden />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">No skills of this project&apos;s own yet. Farbaek&apos;s built-in skills are chosen on each plan.</p>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-accent">Add a skill</summary>
        <div className="mt-3">
          <AddSkillForm projectId={projectId} disabledReason={disabledReason} />
        </div>
      </details>
    </section>
  );
}
