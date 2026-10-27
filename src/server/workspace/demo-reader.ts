import { TRIAL } from "@/core/billing/catalog";
import { resolveEffectivePlan, trialPhase, trialWindow } from "@/core/billing/trial";
import { contractHash, type IntentContract } from "@/core/realityloop/contract";
import type { TaskState } from "@/core/realityloop/task-machine";
import type { WorkflowView } from "@/core/realityloop/workflow";
import { sha256Hex } from "@/core/trust/canonical-json";
import { SAMPLE_CONTRACT } from "@/content/samples";
import { DEMO_FILES, DEMO_FILES_PROJECT_ID, DEMO_SKILL_PINS } from "@/content/demo-files";
import { buildChanges, checkProposal, planFrom, proposalHash } from "@/core/realityloop/change-proposal";
import { evaluateChangePolicy } from "@/core/trust/policy";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import {
  DEMO_EVALUATIONS_THIS_PERIOD,
  DEMO_MEMBERS,
  DEMO_ORG_ID,
  DEMO_PROJECTS,
  DEMO_TASKS,
  DEMO_TIME,
  DEMO_TRIAL_STARTED_DAYS_AGO,
  DEMO_USER,
  DEMO_CODE_CONTRACT,
  DEMO_PROPOSAL_OUTPUT,
  DEMO_LENS_SUGGESTION,
  DEMO_PROPOSAL_ID,
  DEMO_PROPOSAL_TASK_ID,
  DEMO_WORKFLOW_ID,
  DEMO_VERIFICATION,
  demoEventType,
} from "@/content/demo-workspace";
import type { ContractRecord, FileRevision, Project, ProjectFileContent, ProposalRecord, Task, Transition, WorkspaceReader } from "./types";
import { AUTONOMY_OFF } from "./autonomy";
import type { Incident, IncidentEvent } from "./incidents";

/**
 * Read-only sample workspace. Timestamps are relative to "now" so the trial
 * countdown and timelines always look current. Never touches a database.
 */
export function createDemoReader(now: Date = new Date()): WorkspaceReader {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const demoIncident = (): Incident => ({
    id: "00000000-0000-4000-8000-0000000d0001",
    number: 1,
    title: "A change applied on its own failed its checks",
    severity: "high",
    status: "open",
    source: "autonomy_failure",
    projectId: DEMO_FILES_PROJECT_ID,
    proposalId: DEMO_PROPOSAL_ID,
    openedAt: ago(2 * DEMO_TIME.HOUR),
    openedBy: null,
    resolvedAt: null,
    outcome: null,
    escalatedAt: null,
  });
  const demoIncidentEvents = (): IncidentEvent[] => [
    {
      id: 1,
      at: ago(2 * DEMO_TIME.HOUR),
      actor: null,
      kind: "opened",
      text: "A change that applied on its own failed its checks, so autonomy paused itself for the whole workspace.",
      ref: { task: DEMO_PROPOSAL_TASK_ID, proposal: DEMO_PROPOSAL_ID },
    },
  ];

  let files: Promise<ProjectFileContent[]> | null = null;
  const demoFiles = (projectId: string): Promise<ProjectFileContent[]> => {
    if (projectId !== DEMO_FILES_PROJECT_ID) return Promise.resolve([]);
    files ??= Promise.all(
      DEMO_FILES.map(async (f) => ({
        path: f.path,
        revision: (f.history?.length ?? 0) + 1,
        sizeBytes: new TextEncoder().encode(f.content).length,
        sha256: await sha256Hex(f.content),
        content: f.content,
        updatedAt: ago(f.updatedHoursAgo * DEMO_TIME.HOUR),
      })),
    ).then((list) => list.sort((a, b) => a.path.localeCompare(b.path)));
    return files;
  };
  const trialStart = new Date(now.getTime() - DEMO_TRIAL_STARTED_DAYS_AGO * DEMO_TIME.DAY);
  const window = trialWindow(trialStart);

  const projects: Project[] = DEMO_PROJECTS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    createdAt: ago(p.createdDaysAgo * DEMO_TIME.DAY),
    archivedAt: null,
  }));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const built = DEMO_TASKS.map((t) => {
    const created = t.createdHoursAgo * DEMO_TIME.HOUR;
    const step = created / (t.path.length + 1);
    let from: TaskState = "RECEIVED";
    const history: Transition[] = t.path.map((to, i) => {
      const record: Transition = {
        eventId: `${t.id}-e${i + 1}`,
        eventType: demoEventType(from, to),
        from,
        to,
        actorKind: to === "CONTRACT_APPROVED" || to === "CANCELLED" ? "user" : to === "POLICY_EVALUATED" || to === "BLOCKED" ? "system" : "agent",
        actorId: to === "CONTRACT_APPROVED" || to === "CANCELLED" ? DEMO_USER.id : "farbaek",
        at: ago(created - step * (i + 1)),
      };
      from = to;
      return record;
    });
    const task: Task = {
      id: t.id,
      title: t.title,
      state: t.path.at(-1) ?? "RECEIVED",
      version: t.path.length,
      projectId: t.projectId,
      projectName: projectName.get(t.projectId),
      createdAt: ago(created),
      updatedAt: history.at(-1)?.at ?? ago(created),
    };
    return { task, history };
  });
  const tasks = built.map((b) => b.task).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  async function demoContract(taskId: string): Promise<ContractRecord | null> {
    const found = built.find((b) => b.task.id === taskId);
    const drafted = found?.history.find((h) => h.to === "CONTRACT_DRAFTED");
    if (!found || !drafted) return null;
    const approved = found.history.find((h) => h.to === "CONTRACT_APPROVED");
    const code = DEMO_TASKS.find((t) => t.id === taskId)?.code;
    const body: IntentContract = code
      ? {
          ...SAMPLE_CONTRACT,
          ...DEMO_CODE_CONTRACT,
          version: 1,
          outcome: found.task.title,
          scope: { organizationId: DEMO_ORG_ID, projectId: found.task.projectId, resources: DEMO_CODE_CONTRACT.resources },
        }
      : {
          ...SAMPLE_CONTRACT,
          version: 1,
          outcome: found.task.title,
          scope: { organizationId: DEMO_ORG_ID, projectId: found.task.projectId, resources: SAMPLE_CONTRACT.scope.resources },
        };
    const record: ContractRecord = {
      version: 1,
      status: approved ? "approved" : "draft",
      sha256: await contractHash(body),
      body,
      createdAt: drafted.at,
      approvedAt: approved?.at ?? null,
    };
    return record;
  }

  async function demoWorkflow(): Promise<WorkflowView | null> {
    const ids = [DEMO_PROPOSAL_TASK_ID, "00000000-0000-4000-8000-00000000b008", "00000000-0000-4000-8000-00000000b009"];
    const found = ids.map((id) => built.find((b) => b.task.id === id)?.task);
    if (found.some((t) => !t)) return null;
    const contracts = await Promise.all(ids.map((id) => demoContract(id)));
    const created = ago(5 * DEMO_TIME.HOUR);
    return {
      id: DEMO_WORKFLOW_ID,
      projectId: found[0]!.projectId,
      title: "Harden the cart and checkout",
      status: "waiting",
      waitingReason: "review",
      haltedReason: null,
      // About the estimate per step (9% of the sample period's usage), as the New workflow form sets it.
      ceilingUnits: 9_450,
      approvedBy: DEMO_USER.id,
      approvedAt: ago(4.5 * DEMO_TIME.HOUR),
      approvedSha256: "5a1e".repeat(16),
      createdAt: created,
      steps: found.map((t, i) => ({
        position: i + 1,
        title: t!.title,
        notes: "",
        checkpoint: i === 1,
        taskId: t!.id,
        runId: null,
        status: i === 0 ? "waiting" : "pending",
        detail: i === 0 ? "The change is waiting for review." : null,
        contract: contracts[i] ? { status: contracts[i]!.status, sha256: contracts[i]!.sha256, version: contracts[i]!.version } : null,
        startedAt: i === 0 ? ago(4 * DEMO_TIME.HOUR) : null,
        finishedAt: null,
      })),
    };
  }

  return {
    mode: "demo",

    async listWorkspaces() {
      return [
        {
          id: DEMO_ORG_ID,
          name: "Harbour Lane Studio",
          plan: resolveEffectivePlan({ state: "trialing", trial: window }, now),
          trial: { startedAt: window.startedAt.toISOString(), endsAt: window.endsAt.toISOString(), phase: trialPhase(window, now) },
          trialWithheld: null,
          billingUnknown: false,
          suspension: null,
          agentsPaused: null,
          paidAnchor: null,
        },
      ];
    },

    async listMembers() {
      return DEMO_MEMBERS.map((m) => ({ userId: m.userId, role: m.role, joinedAt: ago(m.joinedDaysAgo * DEMO_TIME.DAY), permissions: m.permissions }));
    },

    async listProjects() {
      return projects;
    },

    async getProject(_orgId, projectId) {
      return projects.find((p) => p.id === projectId) ?? null;
    },

    async listTasks(_orgId, options = {}) {
      const filtered = options.projectId ? tasks.filter((t) => t.projectId === options.projectId) : tasks;
      return filtered.slice(0, options.limit ?? 200);
    },

    async getTask(_orgId, taskId) {
      return built.find((b) => b.task.id === taskId) ?? null;
    },

    async listFiles(_orgId, projectId) {
      return (await demoFiles(projectId)).map((f) => ({ path: f.path, revision: f.revision, sizeBytes: f.sizeBytes, sha256: f.sha256, updatedAt: f.updatedAt }));
    },

    async getProjectContents(_orgId, projectId) {
      return (await demoFiles(projectId)).map((f) => ({ path: f.path, content: f.content }));
    },

    async getFile(_orgId, projectId, path) {
      return (await demoFiles(projectId)).find((f) => f.path === path) ?? null;
    },

    async listProofPacks() {
      // The demo has no applied changes, so it has no evidence records.
      return [];
    },

    async getProofPack() {
      return null;
    },

    async getRecoverySource() {
      // Nothing is applied in the demo, so there's nothing to undo.
      return null;
    },

    async listRecoveries() {
      return [];
    },

    async getRecovery() {
      return null;
    },

    async listCheckReceipts() {
      // Nothing runs in the demo.
      return [];
    },

    async getLatestVerification(_orgId, taskId) {
      if (taskId !== DEMO_VERIFICATION.taskId) return null;
      return {
        id: "00000000-0000-4000-8000-0000000d0001",
        taskId,
        trigger: "autonomy",
        status: "failed",
        result: null,
        receiptDigest: null,
        failure: DEMO_VERIFICATION.failure,
        sessionId: null,
        startedBy: DEMO_USER.id,
        startedAt: ago(DEMO_VERIFICATION.startedMinutesAgo * 60_000),
        finishedAt: ago(DEMO_VERIFICATION.startedMinutesAgo * 60_000 - 40_000),
      };
    },

    async listInvitations() {
      return [];
    },

    async listAgents() {
      return [];
    },

    // One sample workflow over the Storefront's sample tasks (ADR 0092): approved, its first change waiting for review.
    async listWorkflows() {
      const w = await demoWorkflow();
      return w ? [w] : [];
    },

    async getWorkflow(_orgId, id) {
      const w = await demoWorkflow();
      return w && w.id === id ? w : null;
    },

    // Built from the same sample tasks, contracts, proposal and incident the other demo pages show. The demo applies nothing, so it has no ProofPacks or versions.
    async getProjectGraph(_orgId, projectId) {
      const mine = built.filter((b) => b.task.projectId === projectId).map((b) => b.task);
      const contracts = (await Promise.all(mine.map(async (t) => ({ t, c: await demoContract(t.id) })))).flatMap(({ t, c }) =>
        c ? [{ taskId: t.id, version: c.version, status: c.status, createdAt: c.createdAt, approvedAt: c.approvedAt }] : [],
      );
      const proposal = mine.some((t) => t.id === DEMO_PROPOSAL_TASK_ID) ? await this.getLatestProposal(DEMO_ORG_ID, DEMO_PROPOSAL_TASK_ID) : null;
      const incident = demoIncident();
      return {
        projectId,
        tasks: mine.map((t) => ({ id: t.id, title: t.title, state: t.state, createdAt: t.createdAt })),
        contracts,
        proposals: proposal ? [{ id: proposal.id, taskId: DEMO_PROPOSAL_TASK_ID, status: proposal.status, outcome: proposal.policy?.outcome ?? null, createdAt: proposal.createdAt, decidedAt: proposal.decidedAt }] : [],
        proofpacks: [],
        fileChanges: [],
        deployments: [],
        launches: [],
        incidents: incident.projectId === projectId ? [{ number: incident.number, title: incident.title, severity: incident.severity, status: incident.status, proposalId: incident.proposalId, openedAt: incident.openedAt }] : [],
        truncated: false,
      };
    },

    async listRecentProofPacks() {
      return [];
    },

    async listRehearsal() {
      return [];
    },

    async getFirstStepRecords() {
      return { latestProofPack: null, verifiedTaskId: null, liveSite: null };
    },

    async listFileChangesSince(_orgId, projectId, since) {
      if (projectId !== DEMO_FILES_PROJECT_ID) return [];
      const events = DEMO_FILES.flatMap((f) => {
        const versions = [...(f.history ?? []), { content: f.content, updatedHoursAgo: f.updatedHoursAgo }];
        return versions.map((v, i) => ({
          path: f.path,
          change: i === 0 ? ("import" as const) : ("edit" as const),
          revision: i + 1,
          at: ago(v.updatedHoursAgo * DEMO_TIME.HOUR),
          proposalId: null,
        }));
      });
      return events.filter((e) => e.at >= since).sort((a, b) => a.at.localeCompare(b.at));
    },

    async getLatestProposal(_orgId, taskId) {
      if (taskId !== DEMO_PROPOSAL_TASK_ID) return null;
      const found = built.find((b) => b.task.id === taskId);
      const contract = await demoContract(taskId);
      const proposed = found?.history.find((h) => h.to === "PLAN_PROPOSED");
      if (!found || !contract || !proposed) return null;
      // Built from the sample files with the same rules as a live proposal.
      const files = await demoFiles(found.task.projectId);
      const { changes, dropped } = await buildChanges(DEMO_PROPOSAL_OUTPUT, files, new Set(files.map((f) => f.path)), WORKSPACE_LIMITS.maxFileBytes);
      const violations = checkProposal(contract.body, changes);
      const decision = await evaluateChangePolicy({ files: changes, contractViolations: violations, rules: null });
      const record: ProposalRecord = {
        id: DEMO_PROPOSAL_ID,
        status: "pending",
        contractVersion: contract.version,
        plan: planFrom(DEMO_PROPOSAL_OUTPUT),
        changes,
        dropped,
        violations,
        sha256: await proposalHash({ taskId, contractVersion: contract.version, contractSha256: contract.sha256, changes }),
        model: "sample (no model call)",
        createdAt: proposed.at,
        expiresAt: new Date(Date.parse(proposed.at) + 72 * DEMO_TIME.HOUR).toISOString(),
        decidedAt: null,
        appliedSha256: null,
        policy: { outcome: decision.outcome, version: decision.policyVersion, findings: decision.findings },
        agentId: null,
      };
      return record;
    },

    async listFileRevisions(_orgId, projectId, path) {
      const f = projectId === DEMO_FILES_PROJECT_ID ? DEMO_FILES.find((d) => d.path === path) : undefined;
      if (!f) return [];
      const versions = [...(f.history ?? []), { content: f.content, updatedHoursAgo: f.updatedHoursAgo }];
      const out: FileRevision[] = await Promise.all(
        versions.map(async (v, i) => ({
          revision: i + 1,
          change: i === 0 ? ("import" as const) : ("edit" as const),
          sizeBytes: new TextEncoder().encode(v.content).length,
          sha256: await sha256Hex(v.content),
          createdAt: ago(v.updatedHoursAgo * DEMO_TIME.HOUR),
        })),
      );
      return out.reverse();
    },

    async getLensSuggestion(_orgId, proposalId) {
      // A sample mapping for the demo's pending proposal, so the review shows how AI suggestions read.
      return proposalId === DEMO_PROPOSAL_ID ? { ...DEMO_LENS_SUGGESTION, createdAt: ago(DEMO_TIME.HOUR) } : null;
    },

    // The demo workspace keeps every change waiting for a person.
    getAutonomy: async () => AUTONOMY_OFF,
    // The demo workspace has no rules of its own; the builder still shows how they read against its sample files.
    getRuleVersions: async () => [],
    // One sample incident, so the Incidents page and its replay show how they read. The page labels it a sample.
    listIncidents: async () => [demoIncident()],
    getIncident: async (_orgId, number) => (number === 1 ? { incident: demoIncident(), events: demoIncidentEvents() } : null),
    getIncidentChanges: async (_orgId, number) =>
      number === 1
        ? { changes: [{ proposalId: DEMO_PROPOSAL_ID, taskId: DEMO_PROPOSAL_TASK_ID, at: ago(3 * DEMO_TIME.HOUR), files: [{ path: "src/lib/cart.ts", kind: "edit" }], outcome: "ALLOW_WITHIN_LIMITS" }], exact: true }
        : { changes: [], exact: false },
    listProjectPaths: async () => ({ files: (await demoFiles(DEMO_FILES_PROJECT_ID)).map((f) => ({ projectId: DEMO_FILES_PROJECT_ID, path: f.path })), complete: true }),
    getEmailPreferences: async () => ({ workUpdates: true, trialReminders: true }),

    async listSkillPins(_orgId, projectId) {
      if (projectId !== DEMO_FILES_PROJECT_ID) return [];
      return Promise.all(
        DEMO_SKILL_PINS.flatMap((pin) => {
          const f = DEMO_FILES.find((d) => d.path === pin.path);
          const content = f ? [...(f.history ?? []).map((h) => h.content), f.content][pin.revision - 1] : undefined;
          return content === undefined
            ? []
            : [sha256Hex(content).then((sha256) => ({ path: pin.path, revision: pin.revision, sha256, pinnedBy: null, pinnedAt: ago(pin.pinnedHoursAgo * DEMO_TIME.HOUR) }))];
        }),
      );
    },

    async getFileRevision(_orgId, projectId, path, revision) {
      const f = projectId === DEMO_FILES_PROJECT_ID ? DEMO_FILES.find((d) => d.path === path) : undefined;
      if (!f) return null;
      const versions = [...(f.history ?? []).map((h) => h.content), f.content];
      return versions[revision - 1] ?? null;
    },

    async searchFiles(_orgId, projectId, query) {
      const q = query.trim().toLowerCase();
      if (!q || q.length > 200) return [];
      const hits = (await demoFiles(projectId)).flatMap((f) =>
        f.content.split("\n").flatMap((text, i) => (text.toLowerCase().includes(q) ? [{ path: f.path, line: i + 1, text: text.slice(0, 300) }] : [])),
      );
      return hits.slice(0, 200);
    },

    getContract: (_orgId, taskId) => demoContract(taskId),

    async countEvaluations() {
      return Math.min(DEMO_EVALUATIONS_THIS_PERIOD, TRIAL.limits.evaluationsTotal);
    },

    async listUsageGrants() {
      // The demo never calls a model, so its wallet is untouched.
      return [];
    },
  };
}
