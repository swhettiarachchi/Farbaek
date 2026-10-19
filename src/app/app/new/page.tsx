import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PromptComposer } from "@/components/build/prompt-composer";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "New build" };

type Props = { searchParams: Promise<{ resume?: string }> };

export default async function NewBuildPage({ searchParams }: Props) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const { resume } = await searchParams;
  const canBuild = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const reason =
    ctx.mode === "demo" ? "The demo workspace is read-only." : !ctx.writes.enabled ? ctx.writes.reason : !canBuild ? "Your role can view work but not start builds." : null;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-10 pt-2 sm:pt-8">
      <div className="grid gap-3">
        <p className="font-mono text-xs text-ink-3">{"// new build"}</p>
        <h1 className="text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.035em] sm:text-5xl">What do you want to build?</h1>
        <p className="max-w-[56ch] text-[15px] leading-relaxed text-ink-2">
          Describe it in your own words. Farbaek sets up the project, drafts a plan you can read in a minute, and starts the agent once you approve it.
        </p>
      </div>
      <div className="aurora">
        <PromptComposer mode="app" autoResume={resume === "1"} disabledReason={reason} />
      </div>
      <p className="text-sm text-ink-3">
        Prefer to set things up yourself?{" "}
        <Link href="/app/projects" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
          Create a project <ArrowRightIcon size={13} weight="bold" aria-hidden />
        </Link>
      </p>
    </div>
  );
}
