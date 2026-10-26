/**
 * Outcome watch on this server (ADR 0080): watches read and recorded with
 * the server's key, what's live found from the project's site or launches,
 * and alerts sent by email and push to the person who turned the watch on.
 */
import { z } from "zod";
import { siteCheckUrl } from "@/core/launch/health";
import { LAUNCH_PROVIDERS, launchAddress } from "@/core/launch/providers";
import { renderEmail, sendEmail } from "@/server/email/compose";
import { readEmailConfig } from "@/server/email/config";
import { isPlainAddress } from "@/server/email/message";
import { confirmedEmail } from "@/server/email/wiring";
import { deploymentIndexSha, probeSite } from "@/server/launch/health";
import { log } from "@/server/observability/log";
import { siteDomain } from "@/server/publish/config";
import { pushToPerson } from "@/server/push/notifier";
import { serverPushDeps } from "@/server/push/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { OutcomeWatchDeps } from "./outcome-watch";

const NOTHING_LIVE = "Nothing is live to check yet. Publish it to Farbaek Sites, or launch it to Vercel or Netlify.";

export function outcomeWatchDeps(): OutcomeWatchDeps | null {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const email = readEmailConfig();
  const push = serverPushDeps();

  return {
    async due() {
      const before = new Date(Date.now() - 50 * 60_000).toISOString();
      const { data, error } = await admin.from("outcome_watches").select("project_id, org_id, enabled_by").or(`last_checked_at.is.null,last_checked_at.lt.${before}`).limit(500);
      if (error) throw new Error(`Couldn't read watches: ${error.message}`);
      const watches = z.array(z.object({ project_id: z.string(), org_id: z.string(), enabled_by: z.string().nullable() })).parse(data);
      if (watches.length === 0) return [];
      const { data: projects, error: projectError } = await admin.from("projects").select("id, name").in("id", watches.map((w) => w.project_id));
      if (projectError) throw new Error(`Couldn't read projects: ${projectError.message}`);
      const names = new Map(z.array(z.object({ id: z.string(), name: z.string() })).parse(projects).map((p) => [p.id, p.name]));
      return watches.map((w) => ({ projectId: w.project_id, orgId: w.org_id, enabledBy: w.enabled_by, projectName: names.get(w.project_id) ?? "Your project" }));
    },

    async target(w) {
      const { data: site } = await admin.from("sites").select("name, live_deployment_id").eq("project_id", w.projectId).not("live_deployment_id", "is", null).is("blocked_at", null).maybeSingle();
      const live = z.object({ name: z.string(), live_deployment_id: z.string() }).nullable().parse(site ?? null);
      if (live) {
        const url = siteCheckUrl(live.name, siteDomain());
        if (url) return { kind: "farbaek_site", url, deploymentId: live.live_deployment_id, indexSha256: await deploymentIndexSha(admin, w.orgId, live.live_deployment_id).catch(() => null) };
      }
      const { data: launch } = await admin.from("launch_orders").select("provider, url").eq("project_id", w.projectId).eq("status", "ready").order("finished_at", { ascending: false }).limit(1).maybeSingle();
      const last = z.object({ provider: z.enum(LAUNCH_PROVIDERS), url: z.string().nullable() }).nullable().parse(launch ?? null);
      const url = last ? launchAddress(last.provider, last.url) : null;
      return last && url ? { kind: "launch", provider: last.provider, url } : { none: NOTHING_LIVE };
    },

    probe: probeSite,

    async record(projectId, ok, detail) {
      const { data, error } = await admin.rpc("app_record_watch_result", { p_project: projectId, p_ok: ok, p_detail: detail });
      if (error) throw new Error(`Couldn't record the check: ${error.message}`);
      return data === "down" || data === "recovered" ? data : null;
    },

    async alert(a) {
      const subject = a.kind === "down" ? `Needs a look: ${a.projectName}` : `Back up: ${a.projectName}`;
      const lines =
        a.kind === "down"
          ? [`What's live for ${a.projectName} failed two checks in a row. ${a.detail}`, "Farbaek checks every hour and will tell you when it's back."]
          : [`${a.projectName} is answering again. ${a.detail}`];
      const path = `/app/projects/${encodeURIComponent(a.projectId)}/launch`;
      if (email) {
        try {
          const to = await confirmedEmail(admin, a.userId);
          if (to && isPlainAddress(to)) {
            await sendEmail(email, renderEmail(email, to, { subject, lines }, { label: "Open the Launch page", path }, "You're getting this because you turned on the outcome watch for this project on Farbaek."));
          }
        } catch (e) {
          log("warn", "watch.email_failed", { project: a.projectId, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
        }
      }
      if (push) await pushToPerson(push, a.userId, { title: subject, body: lines[0]!.slice(0, 160), url: path, tag: `watch:${a.projectId}` }).catch(() => 0);
      log("info", "watch.alert", { project: a.projectId, kind: a.kind });
    },
  };
}
