/**
 * LaunchOS's dependencies on this server (ADR 0078, ADR 0093, ADR 0191): the
 * store through the service-role functions, the token vault's key, each
 * provider's API, the project's files as the person reads them, the linked
 * GitHub repository for Render and Railway, and one fetch of a ready launch's
 * address (only ever https on the provider's own domain, checked before it
 * gets here).
 */
import { z } from "zod";
import { GITHUB_MESSAGES, createGitHubClient } from "@/server/github/client";
import { createLaunchGitHub } from "@/server/github/launch-commit";
import { openGitHubToken, readRepoLink } from "@/server/github/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { AppContext } from "@/server/workspace/context";
import { projectLaunchFiles } from "./files";
import { createFlyClient } from "./fly-client";
import { createNetlifyClient } from "./netlify-client";
import { createSupabaseLaunchStore } from "./provider-store";
import { createRailwayClient } from "./railway-client";
import { createRenderClient } from "./render-client";
import type { ServerLaunchDeps } from "./server-launch";
import { vaultKey } from "./token-vault";
import { createVercelClient } from "./vercel-client";

async function probe(url: string): Promise<number> {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8_000), headers: { "user-agent": "Farbaek-live-check (+https://www.farbaek.com)" } });
    await res.body?.cancel().catch(() => undefined);
    return res.status;
  } catch {
    return 0;
  }
}

export function launchDeps(ctx: AppContext): ServerLaunchDeps | null {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  return {
    store: createSupabaseLaunchStore(admin),
    key: vaultKey(),
    vercel: (token, teamId) => createVercelClient(token, { teamId }),
    netlify: (token, accountSlug) => createNetlifyClient(token, { accountSlug }),
    render: (token) => createRenderClient(token),
    railway: (token) => createRailwayClient(token),
    fly: (token) => createFlyClient(token),
    // Text and images, exactly as the Launch page fingerprints them (ADR 0108).
    files: (orgId, projectId) => projectLaunchFiles(ctx.reader, orgId, projectId),
    repo: {
      async link(orgId, projectId) {
        const link = await readRepoLink(admin, orgId, projectId).catch(() => null);
        if (!link) return { error: "Link this project to a GitHub repository first (the project's GitHub page). Render and Railway build from it." };
        const opened = await openGitHubToken(admin, orgId).catch(() => ({ state: "broken" as const }));
        if (opened.state !== "ok") return { error: "The workspace's GitHub token can't be opened. An owner or admin can connect GitHub again in Settings." };
        // The very repository that was linked, by GitHub's own id: a deleted one recreated under the same name is someone else's.
        const repo = await createGitHubClient(opened.token).repo(link.owner, link.repo);
        if (!repo.ok) return { error: GITHUB_MESSAGES[repo.code] };
        if (repo.value.id !== link.repoId) return { error: "The linked repository was replaced by another with the same name. Link the project again on its GitHub page." };
        if (repo.value.archived) return { error: "The linked repository is archived on GitHub, so nothing can be written to it." };
        if (!repo.value.canPush) return { error: "The workspace's GitHub token can't write to the linked repository. Give it Contents: Read and write for it." };
        return { owner: repo.value.owner, repo: repo.value.repo, gh: createLaunchGitHub(opened.token) };
      },
      async recentCommits(projectId) {
        const { data } = await admin.rpc("app_recent_launch_commits", { p_project: projectId });
        return z.array(z.string().regex(/^[0-9a-f]{40}$/)).catch([]).parse(data ?? []);
      },
      async recordCommit(orderId, commit) {
        const { error } = await admin.rpc("app_record_launch_commit", { p_order: orderId, p_commit: commit });
        return !error;
      },
    },
    probe,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
