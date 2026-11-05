import { BookOpenTextIcon, QuestionIcon, ShieldCheckIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { removeSkillAction } from "@/app/app/projects/[projectId]/skill-actions";
import { RelativeTime } from "@/components/ui/local-time";
import { SKILL_PIN_LABELS, type SkillPinStatus } from "@/core/agent/skill-pins";
import type { Skill } from "@/core/agent/skills";
import { shortHash } from "@/core/trust/canonical-json";
import { AddSkillForm } from "./add-skill-form";
import { SkillReview } from "./skill-review";

export interface ProjectSkillView extends Skill {
  path: string;
  revision: number;
  sha256: string;
  /** The file as it is now. */
  content: string;
  status: SkillPinStatus;
  /** Who approved the pinned version: the viewer, a teammate, or nobody (in use before approvals began). */
  pin: { revision: number; sha256: string; pinnedAt: string; by: "you" | "teammate" | "before" } | null;
  /** The approved version's text, for a skill that changed since; null otherwise. */
  approvedContent: string | null;
}

const STATUS: Record<SkillPinStatus, { Icon: typeof ShieldCheckIcon; cls: string }> = {
  approved: { Icon: ShieldCheckIcon, cls: "border-verified/35 text-verified" },
  changed: { Icon: WarningCircleIcon, cls: "border-approval/40 border-dashed text-approval" },
  new: { Icon: QuestionIcon, cls: "border-approval/40 border-dashed text-approval" },
};

/**
 * The project's own skills (ADR 0030): instructions in the SKILL.md format
 * of Claude Skills that every build in this project follows, after the
 * Farbaek Studio standard and the skills chosen on the plan card. Each one
 * applies only in the version a person approved (ADR 0043).
 */
export function ProjectSkills({ projectId, skills, disabledReason }: { projectId: string; skills: ProjectSkillView[]; disabledReason: string | null }) {
  const held = skills.filter((s) => s.status !== "approved").length;
  return (
    <section id="skills" aria-labelledby="skills-heading" className="grid scroll-mt-24 gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
      <div className="grid gap-1">
        <h2 id="skills-heading" className="flex items-center gap-2 text-lg font-medium">
          <BookOpenTextIcon size={20} weight="bold" className="text-accent" aria-hidden /> Skills
        </h2>
        <p className="text-sm leading-relaxed text-ink-2">
          Teach the agent how you like this project built: your brand, your tools, your rules. A skill applies to every build here and can&apos;t widen what a plan allows. If one
          changes or arrives in an import, it waits for your review first. Skills use the open SKILL.md format.
        </p>
      </div>
      {held ? (
        <p className="flex items-start gap-2 rounded-sm border border-dashed border-approval/40 bg-approval/[0.05] px-4 py-3 text-sm">
          <WarningCircleIcon size={18} className="mt-px shrink-0 text-approval" aria-hidden />
          <span>
            {held === 1 ? "1 skill is" : `${held} skills are`} waiting for review. Builds leave {held === 1 ? "it" : "them"} out until someone approves the exact version.
          </span>
        </p>
      ) : null}
      {skills.length ? (
        <ul className="grid gap-2">
          {skills.map((s) => {
            const status = STATUS[s.status];
            return (
              <li key={s.path} className="grid min-w-0 gap-3 rounded-sm border border-line px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-medium">{s.name}</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${status.cls}`}>
                        <status.Icon size={13} weight="bold" aria-hidden /> {SKILL_PIN_LABELS[s.status]}
                      </span>
                    </span>
                    {s.description ? <span className="mt-0.5 block text-sm text-ink-2">{s.description}</span> : null}
                    <span className="mt-1 block truncate font-mono text-xs text-ink-3">{s.path}</span>
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {s.pin && s.status === "approved" ? (
                        <>
                          <span className="font-mono">{shortHash(s.pin.sha256, 8, 6)}</span> ·{" "}
                          {s.pin.by === "before" ? (
                            "in use before approvals began"
                          ) : (
                            <>
                              approved <RelativeTime iso={s.pin.pinnedAt} /> by {s.pin.by === "you" ? "you" : "a teammate"}
                            </>
                          )}
                        </>
                      ) : s.pin ? (
                        <>
                          Approved at version {s.pin.revision}; now at version {s.revision}. Not used in builds until reviewed.
                        </>
                      ) : (
                        "Not used in builds until reviewed."
                      )}
                    </span>
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
                </div>
                {s.status !== "approved" ? (
                  <SkillReview
                    projectId={projectId}
                    name={s.name}
                    path={s.path}
                    revision={s.revision}
                    sha256={s.sha256}
                    current={s.content}
                    approved={s.approvedContent}
                    disabledReason={disabledReason}
                  />
                ) : null}
              </li>
            );
          })}
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
