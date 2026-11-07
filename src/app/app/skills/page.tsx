import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/primitives";
import { LibraryCard } from "@/components/skills/skill-library";
import { buttonClasses } from "@/components/ui/button";
import { skillText } from "@/core/agent/skill-library";
import { FARBAEK_SKILLS } from "@/content/skills";
import { SKILL_LIBRARY } from "@/content/skills/library";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Skills" };

/**
 * Skills (ADR 0179): everything that can teach the agent how to design and build, in one place. Farbaek's own,
 * chosen on each plan; the library, added to a project in one step; and a person's own, kept with a project.
 */
export default async function SkillsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const projects = (await ctx.reader.listProjects(ctx.current.id)).filter((p) => !p.archivedAt).map((p) => ({ id: p.id, name: p.name }));
  const disabledReason = ctx.mode === "demo" ? "The demo workspace is read-only." : ctx.writes.enabled ? null : ctx.writes.reason;

  return (
    <div className="grid gap-10">
      <PageHeader
        title="Skills"
        description="Skills teach the agent how to design and build. Farbaek's own come with every plan. Add any of these to a project, and every build there follows it."
        actions={
          <Link href="/app/projects" className={buttonClasses("secondary", "sm")}>
            Your projects&apos; skills <ArrowRightIcon size={15} weight="bold" aria-hidden />
          </Link>
        }
      />

      <section aria-labelledby="library-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="library-heading" className="text-xl font-medium tracking-[-0.02em]">
            The library
          </h2>
          <p className="max-w-[68ch] text-sm leading-relaxed text-ink-2">
            Proven design skills from people who share them openly. Each one keeps its author&apos;s rules, shortened to fit a build, and travels with its licence. A skill guides
            the agent; it can&apos;t widen what a plan allows.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SKILL_LIBRARY.map((s, i) => (
            <li key={s.id} className="motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]" style={{ animationDelay: `${i * 40}ms` }}>
              <LibraryCard
                skill={{ id: s.id, label: s.label, summary: s.summary, uses: s.uses, author: s.author, licence: s.licence, source: s.source, text: skillText(s.markdown) }}
                projects={projects}
                disabledReason={disabledReason}
              />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="own-heading" className="grid gap-3 rounded-md border border-line bg-surface p-5 shadow-e1">
        <h2 id="own-heading" className="text-lg font-medium tracking-[-0.01em]">
          Your own, or one from GitHub
        </h2>
        <p className="max-w-[68ch] text-sm leading-relaxed text-ink-2">
          Write your brand, your tools and your rules as a skill, or bring in any skill from a GitHub link. Both live with a project: open it and go to Skills. One from
          GitHub waits for you to read and approve it before any build uses it.
        </p>
        <div>
          <Link href="/app/projects" className={buttonClasses("secondary", "sm")}>
            Choose a project <ArrowRightIcon size={15} weight="bold" aria-hidden />
          </Link>
        </div>
      </section>

      <section aria-labelledby="builtin-heading" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="builtin-heading" className="text-xl font-medium tracking-[-0.02em]">
            Built into every plan
          </h2>
          <p className="max-w-[68ch] text-sm leading-relaxed text-ink-2">
            Farbaek chooses the ones that fit each plan, and you can untick any of them before a build starts. Nothing to add.
          </p>
        </div>
        <ul className="grid gap-x-6 gap-y-3 rounded-md border border-line bg-surface p-5 shadow-e1 sm:grid-cols-2">
          {FARBAEK_SKILLS.map((s) => (
            <li key={s.id} className="min-w-0">
              <span className="block text-[0.9375rem] font-medium">{s.label}</span>
              <span className="block text-sm leading-relaxed text-ink-2">{s.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
