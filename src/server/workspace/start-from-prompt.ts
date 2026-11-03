/**
 * From one sentence to a plan (ADR 0027). Chains the steps a person would
 * otherwise take across four pages, through the same rules each of them
 * enforces: create the project from a fitting starter, import the starter's
 * files, create the task, draft the intent contract with AI and save it as
 * version 1. Approval stays a separate, explicit step on the plan card.
 *
 * Partial success is reported honestly: if the AI can't draft (not
 * connected, no usage left, a provider failure), the project and task still
 * exist and the plan card says the contract needs writing by hand.
 */
import type { Effort } from "@/core/agent/routing";
import { cleanPrompt, projectNameFromPrompt, starterForPrompt, taskTitleFromPrompt } from "@/core/agent/prompt-start";
import { getStarter, type StarterId } from "@/content/starters";
import type { ContractDrafter } from "@/server/ai/contract-drafter";
import { draftContractWithAi } from "./ai-drafting";
import type { AiUsageDeps, ModelSource } from "./ai-usage";
import { importProjectFiles, type FileDeps } from "./files";
import { createProject, createTask, fail, saveContract, type WriteDeps, type WriteResult } from "./use-cases";

export interface PromptStartResult {
  projectId: string;
  taskId: string;
  /** True when contract version 1 was drafted and saved. */
  planned: boolean;
  /** Why there's no plan yet, when planned is false. */
  planNote: string | null;
  /** Set when the starter's files couldn't be imported; the project stays empty. */
  starterNote: string | null;
}

export async function startFromPrompt(
  deps: WriteDeps & AiUsageDeps & FileDeps,
  drafter: ModelSource<ContractDrafter> | { unavailable: string },
  input: {
    orgId: string;
    userId: string;
    prompt: unknown;
    effort?: Effort;
    existing?: { id: string; name: string; description: string | null; paths: readonly string[] };
    /** A starter or template the person chose; otherwise one is picked from the prompt. */
    starter?: StarterId;
  },
): Promise<WriteResult<PromptStartResult>> {
  const prompt = cleanPrompt(input.prompt);
  if (!prompt) return fail("INVALID_TITLE", "Describe what you want to build in a few more words.");

  // A follow-up goes into the project it's about; a new idea gets its own project from a fitting starter.
  const name = input.existing?.name ?? projectNameFromPrompt(prompt);
  const starter = (input.starter ? getStarter(input.starter) : null) ?? getStarter(starterForPrompt(prompt))!;
  const project: WriteResult<string> = input.existing
    ? { ok: true, value: input.existing.id }
    : await createProject(deps, { orgId: input.orgId, userId: input.userId, name, description: prompt.slice(0, 500) });
  if (!project.ok) return project;

  let starterNote: string | null = null;
  // What's in the project, so the plan's scope names real files.
  let paths: readonly string[] = input.existing?.paths ?? [];
  if (!input.existing && starter.files.length > 0) {
    const imported = await importProjectFiles(deps, { orgId: input.orgId, userId: input.userId, projectId: project.value, files: starter.files });
    if (imported.ok) paths = starter.files.map((f) => f.path);
    else starterNote = `The ${starter.name.toLowerCase()} starter couldn't be added (${imported.message}), so the project starts empty.`;
  }

  const title = taskTitleFromPrompt(prompt);
  const task = await createTask(deps, { orgId: input.orgId, userId: input.userId, projectId: project.value, title });
  if (!task.ok) return task;

  const done = (planned: boolean, planNote: string | null): WriteResult<PromptStartResult> => ({
    ok: true,
    value: { projectId: project.value, taskId: task.value, planned, planNote, starterNote },
  });

  if ("unavailable" in drafter) return done(false, drafter.unavailable);

  const draft = await draftContractWithAi(deps, drafter, {
    orgId: input.orgId,
    userId: input.userId,
    taskId: task.value,
    brief: {
      taskTitle: title,
      projectName: name,
      projectDescription: input.existing
        ? input.existing.description
        : starter.kind === "template"
          ? // A template's files are sample content for a different product: its features aren't part of this brief.
            `${prompt}\n\nThe project starts from the ${starter.name} template. Its files are sample content for a different product, with a DESIGN.md: keep the structure and quality that fit, and replace the content, the signature element and anything specific to the sample with what this brief needs.`
          : `${prompt}\n\nThe project starts from the ${starter.name} starter: ${starter.summary}${
              starter.files.some((f) => f.path === "DESIGN.md")
                ? starter.id === "static-website"
                  ? " It's built on the Farbaek Studio kit with a 3D hero, motion and stand-in media: keep the kit and the premium section quality, and make everything else this brand's own. Its DESIGN.md is a blank design plan to write for this brief first (pick the kit look closest to the brand), text in [square brackets] is placeholder copy to replace, and photos and video marked as placeholders are chosen to fit the brand."
                  : " Its DESIGN.md is a blank design plan to write for this brief first, its look is a neutral stand-in, and text in [square brackets] is placeholder copy to replace."
                : ""
            }`,
      paths,
      // A new build adds and edits files; the drafter keeps what's typed here, and the person still reviews it.
      notes: { outcome: prompt.slice(0, 4_000), allowed: "files.create\nfiles.edit" },
    },
    effort: input.effort,
  });
  if (!draft.ok) return done(false, draft.message);

  const loaded = await deps.loadTask(input.orgId, task.value);
  if (!loaded) return done(false, "The task couldn't be read back. Open it to write the plan.");
  const saved = await saveContract(deps, {
    orgId: input.orgId,
    userId: input.userId,
    taskId: task.value,
    expectedTaskVersion: loaded.version,
    basedOn: 0,
    form: draft.value.form,
  });
  if (!saved.ok) return done(false, `The AI's draft didn't pass Farbaek's checks (${saved.message}). Open the plan to finish it.`);
  return done(true, null);
}
