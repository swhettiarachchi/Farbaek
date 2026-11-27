import { redirect } from "next/navigation";
import { buildStartPath } from "@/core/agent/build-surface";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The New build page's address (ADR 0027). Build starts in one place since stage 286 (ADR 0294), so this sends everyone
 * on to it, keeping a chosen template, a prompt kept through sign-in and anything shared from another app. Older links,
 * an installed app's share and its shortcut all still arrive. A plan's own page, `/app/new/<task>`, is unchanged.
 */
export default async function NewBuildPage({ searchParams }: Props) {
  redirect(buildStartPath(await searchParams));
}
