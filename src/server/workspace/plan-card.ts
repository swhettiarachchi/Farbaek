/**
 * Everything the plan card shows and its Approve and build control needs (ADR 0027), read once for whoever draws it: the
 * plan page, and Build's workspace since stage 202 (ADR 0219). One reader, so the two can never disagree about whether a
 * plan may be approved, what it costs, or which skills apply.
 */
import { sayOperation } from "@/components/app/contract-view";
import { FARBAEK_SKILLS, defaultSkills } from "@/content/skills";
import { splitByPins } from "@/core/agent/skill-pins";
import { isProjectSkillPath } from "@/core/agent/skills";
import type { CapChoice } from "@/core/agent/cap-choices";
import { kitTierFor } from "@/core/media/kit-tier";
import { themeFromPrompt, type SiteTheme } from "@/core/media/studio-kit";
import { contractHash } from "@/core/realityloop/contract";
import { withheldFor } from "@/core/workspace/permissions";
import { resolveAiProvider } from "@/server/ai/config";
import type { AppContext } from "./context";
import { runEstimates, runKindFor, type RunEstimates } from "./plan-card-data";
import { pinMap } from "./skill-pins";
import { CONTRIBUTOR_ROLES, type ContractRecord, type Task } from "./types";

type Signed = AppContext & { current: NonNullable<AppContext["current"]> };

export interface PlanCard {
  contract: ContractRecord | null;
  project: Awaited<ReturnType<AppContext["reader"]["getProject"]>>;
  estimates: RunEstimates;
  /** Whether this person's role may approve and build at all. */
  canBuild: boolean;
  /** Why approving and building is off right now, said plainly; null when it can go ahead. */
  reason: string | null;
  /** What the plan keeps as it is: operations it forbids, fields it protects and what must stay true. */
  kept: string[];
  /** Farbaek's skills to choose from, and the ones that fit this plan. */
  skills: { id: string; label: string; description: string }[];
  suggested: string[];
  /** The project's own skills in their approved version, and the ones waiting for a review (ADR 0043). */
  projectSkills: string[];
  heldSkills: string[];
  kitPro: boolean;
  defaultCap: CapChoice;
  defaultTheme: SiteTheme;
  /** Said when a first build on Free is written by a stronger model (ADR 0158). */
  firstBuildNote: string | null;
}

export async function loadPlanCard(ctx: Signed, task: Task): Promise<PlanCard> {
  // A site's first build or a design upgrade (ADR 0158): Sonnet on Free, a whole site's estimate, no run cap by default.
  const kind = await runKindFor(ctx.reader, ctx.current.id, task.id);
  const estimates = runEstimates(ctx.current, undefined, kind);
  const strongerFirstBuild = kind.designPass === true && estimates.balanced?.model !== runEstimates(ctx.current).balanced?.model;
  const [contract, project, files, pins] = await Promise.all([
    ctx.reader.getContract(ctx.current.id, task.id),
    ctx.reader.getProject(ctx.current.id, task.projectId),
    ctx.reader.listFiles(ctx.current.id, task.projectId).catch(() => []),
    ctx.reader.listSkillPins(ctx.current.id, task.projectId).catch(() => []),
  ]);
  // Skills (ADR 0030): the ones that fit this plan start chosen; the project's own apply in their approved version (ADR 0043).
  const { use: pinnedFiles, held } = splitByPins(files, pinMap(pins));
  const skillName = (path: string) => path.split("/")[2]!;

  const canBuild = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const ai = resolveAiProvider();
  const intact = contract ? (await contractHash(contract.body)) === contract.sha256 : false;
  const withheld = withheldFor(ctx.role, ctx.permissions, "run_agents");
  const reason = !ctx.writes.enabled
    ? ctx.writes.reason
    : !canBuild
      ? "Your role can view this plan but not approve it."
      : ai.provider !== "anthropic"
        ? "Cloud runs aren't available on this server yet. You can still approve the plan from the task page."
        : !intact
          ? "This plan doesn't match what was saved. Open the task to check it."
          : withheld
            ? `${withheld} You can still approve the plan from the task page.`
            : null;

  const c = contract?.body;
  return {
    contract,
    project,
    estimates,
    canBuild,
    reason,
    kept: c ? [...c.forbiddenOperations.map(sayOperation), ...c.protectedFields, ...c.protectedInvariants.map((i) => i.statement)] : [],
    skills: FARBAEK_SKILLS.map((s) => ({ id: s.id, label: s.label, description: s.description })),
    // The premium core (motion, 3D, brand identity) for anything people will see, plus what fits this plan (ADR 0156).
    suggested: defaultSkills(`${task.title} ${c?.outcome ?? ""} ${project?.description ?? ""}`).map((s) => s.id),
    projectSkills: pinnedFiles.filter((f) => isProjectSkillPath(f.path)).map((f) => skillName(f.path)),
    heldSkills: held.map((h) => skillName(h.path)),
    kitPro: kitTierFor(ctx.current.plan) === "pro",
    defaultCap: kind.designPass ? "plan" : "double",
    defaultTheme: themeFromPrompt(task.title),
    firstBuildNote: strongerFirstBuild ? "A first build sets the look, so Free writes it with Claude Sonnet. Later changes use the fast model." : null,
  };
}
