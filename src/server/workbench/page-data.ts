/**
 * What Build's workspace shows for one project (stage 202, ADR 0219): the project, its file list, its tasks, and the open
 * task's plan, run and latest check. Everything is read as the signed-in person, through the same reader and the same
 * client the plan page, the run page and the Files page use, so the database's row rules stay the boundary: a project
 * someone can't see is simply not found here either.
 *
 * It stays small on purpose. A file's content and the preview are read by their own routes when a pane asks, because a
 * server action that saves re-renders this page inside its answer, and a whole site's text must not ride along each time.
 */
import { isLive } from "@/core/agent/cloud-run";
import { sayOperation } from "@/components/app/contract-view";
import { UUID, changeKey } from "@/core/workbench/key";
import { pickTask, threadStage } from "@/core/workbench/thread";
import { getRunUsage, listRunEvents, listRuns, type RunEventView, type RunView } from "@/server/cloud-agent/store";
import { createSupabaseServerClient } from "@/server/supabase/server";
import type { AppContext } from "@/server/workspace/context";
import { loadPlanCard } from "@/server/workspace/plan-card";
import { runUsageView, type RunUsageView } from "@/server/workspace/plan-card-data";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";
import type { WorkbenchData, WorkbenchPlan, WorkbenchTask } from "./types";

type Signed = AppContext & { current: NonNullable<AppContext["current"]> };

export async function loadWorkbench(ctx: Signed, projectId: string, wantedTask?: string | null): Promise<WorkbenchData | null> {
  if (!UUID.test(projectId)) return null;
  const orgId = ctx.current.id;
  const project = await ctx.reader.getProject(orgId, projectId);
  if (!project) return null;

  const [files, allTasks] = await Promise.all([ctx.reader.listFiles(orgId, projectId).catch(() => []), ctx.reader.listTasks(orgId, { projectId, limit: 30 }).catch(() => [])]);
  const tasks: WorkbenchTask[] = allTasks.map((t) => ({ id: t.id, title: t.title, state: t.state, version: t.version, updatedAt: t.updatedAt }));
  const picked = pickTask(tasks, wantedTask && UUID.test(wantedTask) ? wantedTask : null);
  const task = picked ? (allTasks.find((t) => t.id === picked.id) ?? null) : null;

  const canBuild = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const writeOff = ctx.writes.enabled ? null : ctx.writes.reason;
  const archivedOff = project.archivedAt ? "This project is archived, so it can't take new work." : null;
  const editOff = writeOff ?? archivedOff ?? (canBuild ? null : "Your role can view this project but not change it.");

  let plan: WorkbenchPlan | null = null;
  let run: RunView | null = null;
  let events: RunEventView[] = [];
  let usage: RunUsageView = null;
  let changePending = false;
  let pendingId: string | null = null;
  let buildOff: string | null = editOff;
  let check: WorkbenchData["check"] = null;

  if (task) {
    const [card, proposal, verification] = await Promise.all([
      // A plan that can't be read must not take the whole workspace down with it: the pane says so and links to the task.
      loadPlanCard(ctx, task).catch(() => null),
      ctx.reader.getLatestProposal(orgId, task.id).catch(() => null),
      ctx.reader.getLatestVerification(orgId, task.id).catch(() => null),
    ]);
    buildOff = archivedOff ?? (card ? card.reason : "This request's plan couldn't be read just now. Open the task to check it.");
    changePending = proposal?.status === "pending";
    pendingId = changePending ? proposal!.id : null;
    check = verification ? { status: verification.status, result: verification.result, failure: verification.failure } : null;

    const c = card?.contract?.body;
    if (card?.contract && c) {
      // Offered for approval only where the pane will show the control: a drafted plan on a request that hasn't ended.
      const waiting = threadStage({ state: task.state, hasPlan: true, planApproved: card.contract.status === "approved", runLive: false, changePending: false }) === "plan_waiting";
      plan = {
        outcome: c.outcome,
        changes: c.allowedOperations.length ? c.allowedOperations.map(sayOperation).join(", ") : "Nothing yet: the plan allows no changes.",
        resources: c.scope.resources,
        checks: c.acceptanceCriteria.map((a) => a.statement),
        kept: card.kept,
        recovery: c.recovery,
        questions: c.openQuestions,
        approved: card.contract.status === "approved",
        approve: waiting
          ? {
              version: card.contract.version,
              sha256: card.contract.sha256,
              estimates: card.estimates,
              skills: card.skills,
              suggested: card.suggested,
              projectSkills: card.projectSkills,
              heldSkills: card.heldSkills,
              kitPro: card.kitPro,
              defaultCap: card.defaultCap,
              defaultTheme: card.defaultTheme,
              firstBuildNote: card.firstBuildNote,
            }
          : null,
      };
    }

    // Runs live outside the reader and only exist in a real workspace: the sample one has none to show.
    if (ctx.mode === "live") {
      const user = await createSupabaseServerClient();
      if (user) {
        run = (await listRuns(user, orgId, { taskId: task.id, limit: 1 }).catch(() => []))[0] ?? null;
        if (run) {
          const [loaded, used] = await Promise.all([listRunEvents(user, orgId, run.id, 0, 400).catch(() => []), getRunUsage(user, orgId, run).catch(() => null)]);
          events = loaded;
          usage = runUsageView(used, run.capUnits, ctx.current);
        }
      }
    }
  }

  const runLive = run ? isLive(run.status) : false;
  return {
    project: { id: project.id, name: project.name, archived: Boolean(project.archivedAt) },
    files: files.map((f) => ({ path: f.path, revision: f.revision, sizeBytes: f.sizeBytes, image: f.encoding === "base64" })),
    tasks,
    task: picked,
    stage: task
      ? threadStage({ state: task.state, hasPlan: plan !== null, planApproved: plan?.approved === true, runLive, changePending })
      : "empty",
    plan,
    run,
    events,
    usage,
    check,
    demo: ctx.mode !== "live",
    buildOff,
    editOff,
    canAnswer: run !== null && ctx.writes.enabled && (run.startedBy === ctx.user.id || (ctx.role !== null && MANAGER_ROLES.includes(ctx.role))),
    previewKey: changeKey([...files.map((f) => `${f.path}@${f.revision}`), `change:${pendingId ?? "none"}`]),
  };
}
