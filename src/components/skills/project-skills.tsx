import { TrashIcon } from "@phosphor-icons/react/ssr";
import { removeSkillAction } from "@/app/app/projects/[projectId]/skill-actions";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import { SKILL_PIN_LABELS, type SkillPinStatus } from "@/core/agent/skill-pins";
import { skillFilePath, skillText } from "@/core/agent/skill-library";
import { SKILL_LIMITS, type Skill } from "@/core/agent/skills";
import { SKILL_LIBRARY } from "@/content/skills/library";
import { AddSkills } from "./add-skills";
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

// Each skill's state is its kind (ADR 0183): approved is verified, a changed one needs a look, and a new one waits
// for a person to approve it.
const STATUS: Record<SkillPinStatus, Status> = {
  approved: "verified",
  changed: "attention",
  new: "approval",
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
    // It sits inside the project page's Skills fold, which carries the title and what skills are for, so it doesn't repeat them.
    <section id="skills" aria-label="Skills" className="grid scroll-mt-24 gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
      <p className="text-sm leading-relaxed text-ink-2">
        Add a proven design skill from the library, one from GitHub, or write your own brand and rules. A skill applies to every build here and can&apos;t widen what a
        plan allows. If one changes or arrives from outside, it waits for your review first. Skills use the open SKILL.md format.
      </p>
      {held ? (
        <p className="flex items-start gap-2.5 rounded-sm border border-approval/35 bg-approval/[0.05] px-4 py-3 text-sm">
          <StatusGlyph status="approval" className="mt-0.5" />
          <span>
            {held === 1 ? "1 skill is" : `${held} skills are`} waiting for your review. Builds leave {held === 1 ? "it" : "them"} out until someone approves the exact version.
          </span>
        </p>
      ) : null}
      {skills.length ? (
        <ul className="grid gap-2">
          {skills.map((s) => (
              <li key={s.path} className="grid min-w-0 gap-3 rounded-sm border border-line px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.9375rem] font-medium">{s.name}</span>
                      <StatusBadge status={STATUS[s.status]} label={SKILL_PIN_LABELS[s.status]} />
                    </span>
                    {s.description ? <span className="mt-0.5 block text-sm text-ink-2">{s.description}</span> : null}
                    <span className="mt-1 block truncate font-mono text-xs text-ink-3">{s.path}</span>
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {s.pin && s.status === "approved" ? (
                        <span title={`Approved version sha256:${s.pin.sha256}`}>
                          {s.pin.by === "before" ? (
                            "In use before approvals began."
                          ) : (
                            <>
                              Approved <RelativeTime iso={s.pin.pinnedAt} /> by {s.pin.by === "you" ? "you" : "a teammate"}.
                            </>
                          )}
                        </span>
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
                    <ConfirmAction
                      action={removeSkillAction}
                      fields={{ projectId, path: s.path, revision: s.revision }}
                      triggerClassName="inline-flex size-11 items-center justify-center rounded-full text-ink-3 hover:bg-surface-raised hover:text-failed"
                      trigger={
                        <>
                          <TrashIcon size={16} weight="bold" aria-hidden />
                          <span className="sr-only">Remove the {s.name} skill</span>
                        </>
                      }
                      question={<>Remove the {s.name} skill from this project? Builds stop following it. Its file history is kept.</>}
                      confirmLabel="Remove skill"
                      pendingLabel="Removing…"
                    />
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
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">No skills of this project&apos;s own yet. Farbaek&apos;s built-in skills are chosen on each plan, and you can add more below.</p>
      )}
      <div className="border-t border-line pt-4">
        <AddSkills
          projectId={projectId}
          library={SKILL_LIBRARY.map((s) => ({ id: s.id, label: s.label, summary: s.summary, uses: s.uses, author: s.author, licence: s.licence, source: s.source, text: skillText(s.markdown) }))}
          added={SKILL_LIBRARY.filter((s) => skills.some((k) => k.path === skillFilePath(s.id) || k.id === s.id)).map((s) => s.id)}
          used={skills.length}
          max={SKILL_LIMITS.projectSkills}
          disabledReason={disabledReason}
        />
      </div>
    </section>
  );
}
