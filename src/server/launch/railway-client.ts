/**
 * Railway's public GraphQL API, as LaunchOS uses it: whose account token
 * this is, finding or making a project by name, a service and the GitHub
 * repository it builds, its variables and build and start commands, turning
 * off deploys on push, its railway.app domain, deploying one commit, and
 * reading the deployment's status. Only backboard.railway.com is called, with
 * a time limit, every value travels as a GraphQL variable, and Railway's
 * errors come back as plain sentences that never include the token.
 * Operations, arguments and fields were checked against the live schema by
 * introspection on 2026-11-12. Most are in Railway's API guides
 * (https://docs.railway.com/guides/public-api); two are in the schema only:
 * a service instance's `source { repo }` and `serviceInstanceAutoDeployUpdate`.
 */
import { z } from "zod";
import { CONTACT } from "@/config/contact";

const API = "https://backboard.railway.com/graphql/v2";
const TIMEOUT_MS = 30_000;
const PROJECT_PAGES = 10;
const MAX_VARIABLES = 100;
const MAX_VALUE = 32_768;

export type RailwayResult<T> = { ok: true; value: T } | { ok: false; message: string };
export interface RailwayProject {
  id: string;
  name: string;
  environmentId: string;
  /** `repo` is the GitHub repository (owner/name) the service builds in that environment, or null when it has none. */
  services: { id: string; name: string; repo: string | null }[];
}
export type RailwayDeployStatus =
  | "BUILDING"
  | "DEPLOYING"
  | "SUCCESS"
  | "FAILED"
  | "CRASHED"
  | "REMOVED"
  | "SLEEPING"
  | "SKIPPED"
  | "WAITING"
  | "QUEUED"
  | "INITIALIZING"
  | "NEEDS_APPROVAL"
  | "REMOVING";
export interface RailwayClient {
  whoami(): Promise<RailwayResult<{ id: string; name: string; workspaces: { id: string; name: string }[] }>>;
  findProject(name: string, workspaceId: string | null): Promise<RailwayResult<RailwayProject | null>>;
  createProject(name: string, workspaceId: string | null): Promise<RailwayResult<RailwayProject>>;
  /** Without `repo` the service is empty, so variables and commands can be set before `connectRepo` gives it something to build. */
  createService(input: { projectId: string; name: string; repo?: string | null; branch?: string | null }): Promise<RailwayResult<{ id: string; name: string }>>;
  /** Points the service at a GitHub repository and branch. */
  connectRepo(input: { serviceId: string; repo: string; branch: string }): Promise<RailwayResult<null>>;
  /** Adds or changes these service variables, keeping the others, without starting a deploy. */
  setVariables(input: { projectId: string; environmentId: string; serviceId: string; variables: Record<string, string> }): Promise<RailwayResult<null>>;
  setCommands(input: { serviceId: string; environmentId: string; buildCommand: string | null; startCommand: string }): Promise<RailwayResult<null>>;
  /** Stops Railway deploying the service on every push, keeping its repository and branch. */
  disableAutoDeploys(input: { projectId: string; environmentId: string; serviceId: string }): Promise<RailwayResult<null>>;
  /** The service's railway.app domain, made when it has none. */
  ensureDomain(input: { projectId: string; serviceId: string; environmentId: string; targetPort: number }): Promise<RailwayResult<string>>;
  deployCommit(input: { serviceId: string; environmentId: string; commitSha: string }): Promise<RailwayResult<{ id: string }>>;
  getDeployment(id: string): Promise<RailwayResult<{ id: string; status: RailwayDeployStatus | "UNKNOWN" }>>;
}

const STATUSES: readonly RailwayDeployStatus[] = ["BUILDING", "DEPLOYING", "SUCCESS", "FAILED", "CRASHED", "REMOVED", "SLEEPING", "SKIPPED", "WAITING", "QUEUED", "INITIALIZING", "NEEDS_APPROVAL", "REMOVING"];
const FAILED = new Set(["FAILED", "CRASHED", "REMOVED", "SKIPPED"]);

/** What a Railway deployment status means for a launch: only SUCCESS is ready, and a deployment that stopped without serving is failed. */
export function statusFromRailwayDeploy(status: string): "building" | "ready" | "failed" {
  if (status === "SUCCESS") return "ready";
  if (FAILED.has(status)) return "failed";
  return "building";
}

const ME = "query FarbaekRailwayMe { me { id name workspaces { id name } } }";
const PROJECTS =
  "query FarbaekRailwayProjects($workspaceId: String, $after: String) { projects(workspaceId: $workspaceId, first: 100, after: $after) { edges { node { id name } } pageInfo { hasNextPage endCursor } } }";
const PROJECT =
  "query FarbaekRailwayProject($id: String!) { project(id: $id) { id name environments(first: 50) { edges { node { id name } } } services(first: 100) { edges { node { id name } } } } }";
const INSTANCES =
  "query FarbaekRailwayInstances($id: String!, $projectId: String!) { environment(id: $id, projectId: $projectId) { serviceInstances(first: 100) { edges { node { serviceId source { repo } } } } } }";
const PROJECT_CREATE = "mutation FarbaekRailwayProjectCreate($input: ProjectCreateInput!) { projectCreate(input: $input) { id name } }";
const SERVICE_CREATE = "mutation FarbaekRailwayServiceCreate($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }";
const SERVICE_CONNECT = "mutation FarbaekRailwayServiceConnect($id: String!, $input: ServiceConnectInput!) { serviceConnect(id: $id, input: $input) { id } }";
const VARIABLES = "mutation FarbaekRailwayVariables($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }";
const SERVICE_UPDATE =
  "mutation FarbaekRailwayServiceInstanceUpdate($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }";
const AUTO_DEPLOY = "mutation FarbaekRailwayAutoDeploy($input: ServiceInstanceAutoDeployUpdateInput!) { serviceInstanceAutoDeployUpdate(input: $input) { enabled } }";
const DOMAINS =
  "query FarbaekRailwayDomains($projectId: String!, $serviceId: String!, $environmentId: String!) { domains(projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId) { serviceDomains { domain } } }";
const DOMAIN_CREATE = "mutation FarbaekRailwayDomainCreate($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { id domain } }";
const DEPLOY =
  "mutation FarbaekRailwayDeploy($serviceId: String!, $environmentId: String!, $commitSha: String!) { serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha) }";
const DEPLOYMENT = "query FarbaekRailwayDeployment($id: String!) { deployment(id: $id) { id status } }";

const Named = z.object({ id: z.string(), name: z.string() });
const NamedEdges = z.object({ edges: z.array(z.object({ node: Named })) });
const GraphQlBody = z.object({ data: z.unknown(), errors: z.array(z.object({ message: z.unknown() })).optional() });
const MeData = z.object({ me: z.object({ id: z.string(), name: z.string().nullable().optional(), workspaces: z.array(Named) }) });
const ProjectsData = z.object({ projects: z.object({ edges: z.array(z.object({ node: Named })), pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable().optional() }) }) });
const ProjectData = z.object({ project: z.object({ id: z.string(), name: z.string(), environments: NamedEdges, services: NamedEdges }) });
const InstancesData = z.object({
  environment: z.object({
    serviceInstances: z.object({ edges: z.array(z.object({ node: z.object({ serviceId: z.string(), source: z.object({ repo: z.string().nullable().optional() }).nullable().optional() }) })) }),
  }),
});
const ProjectCreateData = z.object({ projectCreate: Named });
const ServiceCreateData = z.object({ serviceCreate: Named });
const ServiceConnectData = z.object({ serviceConnect: z.object({ id: z.string() }) });
const VariablesData = z.object({ variableCollectionUpsert: z.boolean() });
const ServiceUpdateData = z.object({ serviceInstanceUpdate: z.boolean() });
const AutoDeployData = z.object({ serviceInstanceAutoDeployUpdate: z.object({ enabled: z.boolean() }) });
const DomainsData = z.object({ domains: z.object({ serviceDomains: z.array(z.object({ domain: z.string() })) }) });
const DomainCreateData = z.object({ serviceDomainCreate: z.object({ id: z.string(), domain: z.string() }) });
const DeployData = z.object({ serviceInstanceDeployV2: z.string() });
const DeploymentData = z.object({ deployment: z.object({ id: z.string(), status: z.string() }) });

const TOKEN_MESSAGE = "Railway didn't accept this token. Create an account token in Railway under Account settings, Tokens, and connect again.";
const REPO_MESSAGE = "Railway can't reach this GitHub repository. Connect your Railway account to GitHub and give it this repository, then launch again.";
const COMMIT_MESSAGE = "Railway couldn't find this commit in the GitHub repository. Push it to GitHub, then launch again.";
const UNAVAILABLE = "Railway didn't answer properly. Try again in a few minutes.";
const UNREACHABLE = "Farbaek couldn't reach Railway. Try again in a few minutes.";
const BAD_REPO = "The repository should be a GitHub owner and name, like owner/repo, so Farbaek didn't send it.";
const BAD_BRANCH = "This branch name has characters Farbaek can't pass to Railway. Use a branch named with letters, numbers, dots, dashes, underscores and slashes.";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,255}$/;
const SHA = /^[0-9a-f]{40}$/i;
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const TOKEN = /^[\x21-\x7e]{1,512}$/;
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,254}$/;

const fail = <T = never>(message: string): RailwayResult<T> => ({ ok: false, message });
const isId = (value: unknown): value is string => typeof value === "string" && ID.test(value);
const badId = (what: string) => fail(`This Railway ${what} id doesn't look right, so Farbaek didn't send it. Start the launch again.`);
/** One line of printable text: no control characters, no line breaks. */
const oneLine = (value: string, max: number) => value.length > 0 && value.length <= max && [...value].every((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) !== 0x7f);

/** A GitHub repository as owner/name, with GitHub's own naming rules. */
function isGitHubRepo(repo: unknown): repo is string {
  if (typeof repo !== "string") return false;
  const parts = repo.split("/");
  if (parts.length !== 2) return false;
  const [owner, name] = parts as [string, string];
  return OWNER.test(owner) && REPO_NAME.test(name) && name !== "." && name !== "..";
}

const isBranch = (branch: unknown): branch is string =>
  typeof branch === "string" &&
  BRANCH.test(branch) &&
  !branch.startsWith("-") &&
  !branch.startsWith("/") &&
  !branch.endsWith("/") &&
  !branch.endsWith(".") &&
  !branch.endsWith(".lock") &&
  !branch.includes("..") &&
  !branch.includes("//");

/** Railway's text with the token, and any variable value long enough to be a secret, taken out. */
function clean(text: string, token: string, values: readonly string[] = []): string {
  let scrubbed = token ? text.split(token).join("[token]") : text;
  for (const value of values) if (value.length >= 8) scrubbed = scrubbed.split(value).join("[value]");
  return scrubbed.replace(/\s+/g, " ").trim().slice(0, 200);
}

/** When to try again, from a Retry-After header in seconds or as a date. */
function later(retryAfter: string | null): string {
  const raw = retryAfter?.trim() ?? "";
  const seconds = /^\d+$/.test(raw) ? Number(raw) : raw && !Number.isNaN(Date.parse(raw)) ? Math.round((Date.parse(raw) - Date.now()) / 1000) : 0;
  if (seconds <= 0) return "in a few minutes";
  const minutes = Math.ceil(seconds / 60);
  if (minutes <= 1) return "in a minute";
  if (minutes < 120) return `in ${minutes} minutes`;
  return `in about ${Math.round(minutes / 60)} hours`;
}
const limited = (when: string) => `Railway is limiting requests from this token right now. Try again ${when}.`;

/** Railway's GraphQL error, in plain words. */
function fromGraphQl(message: string, token: string, values: readonly string[]): string {
  const text = clean(message, token, values);
  if (/commit not found/i.test(text)) return COMMIT_MESSAGE;
  if (/rate limit|too many requests/i.test(text)) return limited("in a few minutes");
  if (/\b(github|repo|repository)\b/i.test(text) && /(access|find|found|permission|install|connect|authori|unable)/i.test(text)) return REPO_MESSAGE;
  if (/not authori[sz]ed|unauthori[sz]ed|unauthenticated|invalid token|token is invalid/i.test(text)) return TOKEN_MESSAGE;
  return text ? `Railway refused it: ${text}` : "Railway refused it.";
}

async function drain(res: Response) {
  await res.body?.cancel().catch(() => undefined);
}

/** Variables Railway can take: names like PORT, string values up to 32 KB without NUL, at most 100 at once. */
function checkVariables(variables: unknown): { ok: true; value: Record<string, string> } | { ok: false; message: string } {
  if (typeof variables !== "object" || variables === null || Array.isArray(variables)) return fail("There are no variables to set, so Farbaek didn't send anything.");
  const entries = Object.entries(variables as Record<string, unknown>);
  if (entries.length === 0) return fail("There are no variables to set, so Farbaek didn't send anything.");
  if (entries.length > MAX_VARIABLES) return fail(`Railway variables go ${MAX_VARIABLES} at a time at most, so Farbaek didn't send them.`);
  for (const [name, value] of entries) {
    if (!VARIABLE_NAME.test(name)) return fail("A variable name should start with a letter or underscore and use only letters, numbers and underscores.");
    if (typeof value !== "string" || value.length > MAX_VALUE || value.includes("\u0000")) return fail(`The value of ${name} should be text of up to 32 KB.`);
  }
  return { ok: true, value: Object.fromEntries(entries) as Record<string, string> };
}

/** `token` is a Railway account or workspace token; it is only ever sent to backboard.railway.com. */
export function createRailwayClient(token: string, options: { fetcher?: typeof fetch; timeoutMs?: number } = {}): RailwayClient {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const tokenOk = TOKEN.test(token);

  async function gql<S extends z.ZodType>(query: string, variables: Record<string, unknown>, schema: S, what: string, secrets: readonly string[] = []): Promise<RailwayResult<z.output<S>>> {
    if (!tokenOk) return fail(TOKEN_MESSAGE);
    let res: Response;
    try {
      res = await fetcher(API, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": `Farbaek (${CONTACT.support})` },
        body: JSON.stringify({ query, variables }),
      });
    } catch {
      return fail(UNREACHABLE);
    }
    if (res.status === 401 || res.status === 403) {
      await drain(res);
      return fail(TOKEN_MESSAGE);
    }
    if (res.status === 429) {
      const when = later(res.headers.get("retry-after"));
      await drain(res);
      return fail(limited(when));
    }
    const body = GraphQlBody.safeParse(await res.json().catch(() => null));
    const error = body.success ? body.data.errors?.[0] : undefined;
    if (error) return fail(fromGraphQl(typeof error.message === "string" ? error.message : "", token, secrets));
    if (!res.ok) return fail(res.status >= 500 ? UNAVAILABLE : `Railway refused it (${res.status}).`);
    if (!body.success || body.data.data == null) return fail(UNAVAILABLE);
    const data = schema.safeParse(body.data.data);
    return data.success ? { ok: true, value: data.data } : fail(`Railway's answer about ${what} couldn't be read.`);
  }

  /**
   * A project's services, the environment launches deploy to (production, or
   * the first one), and the GitHub repository each service builds there.
   */
  async function readProject(id: string): Promise<RailwayResult<RailwayProject>> {
    const r = await gql(PROJECT, { id }, ProjectData, "the project");
    if (!r.ok) return r;
    const p = r.value.project;
    const environments = p.environments.edges.map((e) => e.node);
    const environment = environments.find((e) => e.name === "production") ?? environments[0];
    if (!environment) return fail("This Railway project has no environment to deploy to. Add one in Railway, then launch again.");
    const services = p.services.edges.map((e) => e.node);
    const repos = new Map<string, string>();
    if (services.length > 0) {
      const instances = await gql(INSTANCES, { id: environment.id, projectId: p.id }, InstancesData, "the project's services");
      if (!instances.ok) return instances;
      for (const { node } of instances.value.environment.serviceInstances.edges) {
        const repo = node.source?.repo?.trim();
        if (repo) repos.set(node.serviceId, repo);
      }
    }
    return { ok: true, value: { id: p.id, name: p.name, environmentId: environment.id, services: services.map((s) => ({ id: s.id, name: s.name, repo: repos.get(s.id) ?? null })) } };
  }

  const projectName = (name: string) => {
    const trimmed = name.trim();
    return oneLine(trimmed, 100) ? trimmed : null;
  };
  const badProjectName = () => fail("The Railway project name should be one line of 1 to 100 characters.");

  return {
    async whoami() {
      const r = await gql(ME, {}, MeData, "the account");
      if (!r.ok) return r;
      const me = r.value.me;
      return {
        ok: true,
        value: { id: me.id, name: (me.name?.trim() || "Railway account").slice(0, 200), workspaces: me.workspaces.map((w) => ({ id: w.id, name: w.name.slice(0, 200) })) },
      };
    },

    async findProject(name, workspaceId) {
      const wanted = projectName(name);
      if (!wanted) return badProjectName();
      if (workspaceId !== null && !isId(workspaceId)) return badId("workspace");
      let after: string | undefined;
      for (let page = 0; page < PROJECT_PAGES; page++) {
        const r = await gql(PROJECTS, { workspaceId: workspaceId ?? undefined, after }, ProjectsData, "your projects");
        if (!r.ok) return r;
        const match = r.value.projects.edges.find((e) => e.node.name === wanted);
        if (match) return readProject(match.node.id);
        const { hasNextPage, endCursor } = r.value.projects.pageInfo;
        if (!hasNextPage || !endCursor) break;
        after = endCursor;
      }
      return { ok: true, value: null };
    },

    async createProject(name, workspaceId) {
      const wanted = projectName(name);
      if (!wanted) return badProjectName();
      if (workspaceId !== null && !isId(workspaceId)) return badId("workspace");
      const r = await gql(PROJECT_CREATE, { input: { name: wanted, workspaceId: workspaceId ?? undefined, defaultEnvironmentName: "production" } }, ProjectCreateData, "the new project");
      if (!r.ok) return r;
      return readProject(r.value.projectCreate.id);
    },

    async createService(input) {
      if (!isId(input.projectId)) return badId("project");
      const name = input.name.trim();
      if (!oneLine(name, 100)) return fail("The Railway service name should be one line of 1 to 100 characters.");
      const withRepo = input.repo !== undefined && input.repo !== null;
      if (withRepo && !isGitHubRepo(input.repo)) return fail(BAD_REPO);
      if (withRepo && !isBranch(input.branch)) return fail(BAD_BRANCH);
      const source = withRepo ? { source: { repo: input.repo }, branch: input.branch } : {};
      const r = await gql(SERVICE_CREATE, { input: { projectId: input.projectId, name, ...source } }, ServiceCreateData, "the new service");
      if (!r.ok) return r;
      return { ok: true, value: { id: r.value.serviceCreate.id, name: r.value.serviceCreate.name } };
    },

    async connectRepo(input) {
      if (!isId(input.serviceId)) return badId("service");
      if (!isGitHubRepo(input.repo)) return fail(BAD_REPO);
      if (!isBranch(input.branch)) return fail(BAD_BRANCH);
      const r = await gql(SERVICE_CONNECT, { id: input.serviceId, input: { repo: input.repo, branch: input.branch } }, ServiceConnectData, "the service's repository");
      return r.ok ? { ok: true, value: null } : r;
    },

    async setVariables(input) {
      if (!isId(input.projectId)) return badId("project");
      if (!isId(input.environmentId)) return badId("environment");
      if (!isId(input.serviceId)) return badId("service");
      const checked = checkVariables(input.variables);
      if (!checked.ok) return checked;
      const r = await gql(
        VARIABLES,
        { input: { projectId: input.projectId, environmentId: input.environmentId, serviceId: input.serviceId, variables: checked.value, skipDeploys: true } },
        VariablesData,
        "the service's variables",
        Object.values(checked.value),
      );
      if (!r.ok) return r;
      return r.value.variableCollectionUpsert ? { ok: true, value: null } : fail("Railway didn't save the service's variables. Try again in a few minutes.");
    },

    async setCommands(input) {
      if (!isId(input.serviceId)) return badId("service");
      if (!isId(input.environmentId)) return badId("environment");
      const startCommand = input.startCommand.trim();
      const buildCommand = input.buildCommand === null ? null : input.buildCommand.trim();
      if (!startCommand) return fail("The start command is empty, so Farbaek didn't send it.");
      if (!oneLine(startCommand, 1000) || (buildCommand !== null && !oneLine(buildCommand, 1000))) return fail("Build and start commands should each be one line of up to 1,000 characters.");
      const r = await gql(SERVICE_UPDATE, { serviceId: input.serviceId, environmentId: input.environmentId, input: { buildCommand: buildCommand || null, startCommand } }, ServiceUpdateData, "the service settings");
      if (!r.ok) return r;
      return r.value.serviceInstanceUpdate ? { ok: true, value: null } : fail("Railway didn't save the build and start commands. Try again in a few minutes.");
    },

    async disableAutoDeploys(input) {
      if (!isId(input.projectId)) return badId("project");
      if (!isId(input.environmentId)) return badId("environment");
      if (!isId(input.serviceId)) return badId("service");
      const r = await gql(
        AUTO_DEPLOY,
        { input: { projectId: input.projectId, environmentId: input.environmentId, serviceId: input.serviceId, enabled: false } },
        AutoDeployData,
        "deploys on push",
      );
      if (!r.ok) return r;
      return r.value.serviceInstanceAutoDeployUpdate.enabled
        ? fail("Railway still deploys this service on every push. Turn off automatic deploys in the service's settings in Railway, then launch again.")
        : { ok: true, value: null };
    },

    async ensureDomain(input) {
      if (!isId(input.projectId)) return badId("project");
      if (!isId(input.serviceId)) return badId("service");
      if (!isId(input.environmentId)) return badId("environment");
      if (!Number.isInteger(input.targetPort) || input.targetPort < 1 || input.targetPort > 65535) return fail("The port should be a whole number from 1 to 65535.");
      const ids = { projectId: input.projectId, serviceId: input.serviceId, environmentId: input.environmentId };
      const existing = await gql(DOMAINS, ids, DomainsData, "the service's domains");
      if (!existing.ok) return existing;
      const known = existing.value.domains.serviceDomains.map((d) => d.domain.trim().toLowerCase()).find((d) => HOST.test(d));
      if (known) return { ok: true, value: known };
      const made = await gql(DOMAIN_CREATE, { input: { serviceId: input.serviceId, environmentId: input.environmentId, targetPort: input.targetPort } }, DomainCreateData, "the new domain");
      if (!made.ok) return made;
      const domain = made.value.serviceDomainCreate.domain.trim().toLowerCase();
      return HOST.test(domain) ? { ok: true, value: domain } : fail("Railway's answer about the new domain couldn't be read.");
    },

    async deployCommit(input) {
      if (!isId(input.serviceId)) return badId("service");
      if (!isId(input.environmentId)) return badId("environment");
      if (!SHA.test(input.commitSha)) return fail("The commit should be a full commit SHA of 40 characters, so Farbaek didn't send it.");
      const r = await gql(DEPLOY, { serviceId: input.serviceId, environmentId: input.environmentId, commitSha: input.commitSha.toLowerCase() }, DeployData, "the deployment");
      if (!r.ok) return r;
      const id = r.value.serviceInstanceDeployV2.trim();
      return isId(id) ? { ok: true, value: { id } } : fail("Railway's answer about the deployment couldn't be read.");
    },

    async getDeployment(id) {
      if (!isId(id)) return badId("deployment");
      const r = await gql(DEPLOYMENT, { id }, DeploymentData, "the deployment");
      if (!r.ok) return r;
      const raw = r.value.deployment.status;
      const status = (STATUSES as readonly string[]).includes(raw) ? (raw as RailwayDeployStatus) : "UNKNOWN";
      return { ok: true, value: { id: r.value.deployment.id, status } };
    },
  };
}
