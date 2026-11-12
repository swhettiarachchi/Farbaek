import { describe, expect, it } from "vitest";
import { createRailwayClient, statusFromRailwayDeploy, type RailwayResult } from "./railway-client";

const TOKEN = "3f9a7c2e-railway-test-token-value";
const API = "https://backboard.railway.com/graphql/v2";
const WS = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const ENV_PROD = "33333333-3333-4333-8333-333333333333";
const ENV_STAGING = "44444444-4444-4444-8444-444444444444";
const SERVICE = "55555555-5555-4555-8555-555555555555";
const DEPLOY = "66666666-6666-4666-8666-666666666666";
const WORKER = "88888888-8888-4888-8888-888888888888";
const SHA = "a".repeat(40);

type Sent = { url: string; init: RequestInit; query: string; variables: Record<string, unknown> };

function fake(respond: (sent: Sent) => Response | Promise<Response>) {
  const calls: Sent[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
    const sent = { url: String(input), init: init ?? {}, query: body.query, variables: body.variables };
    calls.push(sent);
    return respond(sent);
  }) as typeof fetch;
  return { fetcher, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const data = (body: unknown) => json({ data: body });
const PROJECT_BODY = {
  project: {
    id: PROJECT,
    name: "harbour-lane",
    environments: { edges: [{ node: { id: ENV_STAGING, name: "staging" } }, { node: { id: ENV_PROD, name: "production" } }] },
    services: { edges: [{ node: { id: SERVICE, name: "web" } }, { node: { id: WORKER, name: "worker" } }] },
  },
};
const INSTANCES_BODY = {
  environment: {
    serviceInstances: {
      edges: [{ node: { serviceId: SERVICE, source: { repo: "suvin/harbour-lane" } } }, { node: { serviceId: WORKER, source: null } }],
    },
  },
};
const message = (r: RailwayResult<unknown>) => (r.ok ? null : r.message);

describe("the Railway client", () => {
  it("posts to Railway's GraphQL endpoint with the bearer token, never follows redirects, and reads the workspaces", async () => {
    const f = fake(() => data({ me: { id: "user_1", name: "Suvin W", workspaces: [{ id: WS, name: "Studio" }] } }));
    expect(await createRailwayClient(TOKEN, { fetcher: f.fetcher }).whoami()).toEqual({ ok: true, value: { id: "user_1", name: "Suvin W", workspaces: [{ id: WS, name: "Studio" }] } });
    expect(f.calls).toHaveLength(1);
    const call = f.calls[0]!;
    expect(call.url).toBe(API);
    expect(call.init.method).toBe("POST");
    expect(call.init.redirect).toBe("error");
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["User-Agent"]).toMatch(/^Farbaek \(/);
    expect(call.query).toMatch(/\bme\s*\{/);
    expect(call.query).not.toContain("email");
    const unnamed = await createRailwayClient(TOKEN, { fetcher: fake(() => data({ me: { id: "user_1", name: null, workspaces: [] } })).fetcher }).whoami();
    expect(unnamed).toEqual({ ok: true, value: { id: "user_1", name: "Railway account", workspaces: [] } });
  });

  it("finds a project by its exact name, page by page, then reads its production environment and the repository each service builds", async () => {
    const f = fake(({ query, variables }) => {
      if (query.includes("projects(")) {
        return variables.after === "cursor_1"
          ? data({ projects: { edges: [{ node: { id: PROJECT, name: "harbour-lane" } }], pageInfo: { hasNextPage: false, endCursor: null } } })
          : data({ projects: { edges: [{ node: { id: "77777777-7777-4777-8777-777777777777", name: "harbour-lane-old" } }], pageInfo: { hasNextPage: true, endCursor: "cursor_1" } } });
      }
      if (query.includes("serviceInstances")) return data(INSTANCES_BODY);
      return data(PROJECT_BODY);
    });
    const found = await createRailwayClient(TOKEN, { fetcher: f.fetcher }).findProject("harbour-lane", WS);
    expect(found).toEqual({
      ok: true,
      value: {
        id: PROJECT,
        name: "harbour-lane",
        environmentId: ENV_PROD,
        services: [
          { id: SERVICE, name: "web", repo: "suvin/harbour-lane" },
          { id: WORKER, name: "worker", repo: null },
        ],
      },
    });
    expect(f.calls.map((c) => c.variables)).toEqual([{ workspaceId: WS }, { workspaceId: WS, after: "cursor_1" }, { id: PROJECT }, { id: ENV_PROD, projectId: PROJECT }]);
    expect(f.calls[3]!.query).toContain("source { repo }");
    expect(f.calls.every((c) => !c.query.includes("harbour-lane") && !c.query.includes(WS))).toBe(true);

    // When the services' repositories can't be read, the project isn't returned without them.
    const unread = fake(({ query }) => (query.includes("projects(") ? data({ projects: { edges: [{ node: { id: PROJECT, name: "harbour-lane" } }], pageInfo: { hasNextPage: false } } }) : query.includes("serviceInstances") ? json({ errors: [{ message: "Problem processing request" }], data: null }) : data(PROJECT_BODY)));
    expect(await createRailwayClient(TOKEN, { fetcher: unread.fetcher }).findProject("harbour-lane", WS)).toEqual({ ok: false, message: "Railway refused it: Problem processing request" });

    const personal = fake(() => data({ projects: { edges: [{ node: { id: PROJECT, name: "harbour-lane-2" } }], pageInfo: { hasNextPage: false, endCursor: null } } }));
    expect(await createRailwayClient(TOKEN, { fetcher: personal.fetcher }).findProject("harbour-lane", null)).toEqual({ ok: true, value: null });
    expect("workspaceId" in personal.calls[0]!.variables).toBe(false);
  });

  it("makes a project in the workspace with a production environment, sending values only as variables", async () => {
    const empty = { project: { ...PROJECT_BODY.project, services: { edges: [] } } };
    const f = fake(({ query }) => (query.includes("projectCreate") ? data({ projectCreate: { id: PROJECT, name: "harbour-lane" } }) : data(empty)));
    const made = await createRailwayClient(TOKEN, { fetcher: f.fetcher }).createProject("harbour-lane", WS);
    expect(made).toEqual({ ok: true, value: { id: PROJECT, name: "harbour-lane", environmentId: ENV_PROD, services: [] } });
    expect(f.calls[0]!.query).toContain("$input: ProjectCreateInput!");
    expect(f.calls[0]!.query).not.toContain("harbour-lane");
    expect(f.calls[0]!.variables).toEqual({ input: { name: "harbour-lane", workspaceId: WS, defaultEnvironmentName: "production" } });
    expect(f.calls[1]!.variables).toEqual({ id: PROJECT });
    // A project with no services has no repositories to read.
    expect(f.calls).toHaveLength(2);

    const bare = fake(({ query }) => (query.includes("projectCreate") ? data({ projectCreate: { id: PROJECT, name: "p" } }) : data({ project: { ...PROJECT_BODY.project, environments: { edges: [] } } })));
    const none = await createRailwayClient(TOKEN, { fetcher: bare.fetcher }).createProject("p", null);
    expect(message(none)).toMatch(/no environment to deploy to/);
    expect(bare.calls[0]!.variables).toEqual({ input: { name: "p", defaultEnvironmentName: "production" } });
  });

  it("makes a service from a GitHub repository and branch", async () => {
    const f = fake(() => data({ serviceCreate: { id: SERVICE, name: "web" } }));
    expect(await createRailwayClient(TOKEN, { fetcher: f.fetcher }).createService({ projectId: PROJECT, name: "web", repo: "suvin/harbour-lane", branch: "main" })).toEqual({ ok: true, value: { id: SERVICE, name: "web" } });
    expect(f.calls[0]!.variables).toEqual({ input: { projectId: PROJECT, name: "web", source: { repo: "suvin/harbour-lane" }, branch: "main" } });
    expect(f.calls[0]!.query).not.toContain("suvin");

    const blocked = await createRailwayClient(TOKEN, { fetcher: fake(() => json({ errors: [{ message: "Unable to access GitHub repo suvin/harbour-lane" }], data: null })).fetcher }).createService({
      projectId: PROJECT,
      name: "web",
      repo: "suvin/harbour-lane",
      branch: "main",
    });
    expect(message(blocked)).toBe("Railway can't reach this GitHub repository. Connect your Railway account to GitHub and give it this repository, then launch again.");
  });

  it("makes an empty service, then connects its repository and branch", async () => {
    const f = fake(({ query }) => (query.includes("serviceConnect") ? data({ serviceConnect: { id: SERVICE } }) : data({ serviceCreate: { id: SERVICE, name: "web" } })));
    const client = createRailwayClient(TOKEN, { fetcher: f.fetcher });
    expect(await client.createService({ projectId: PROJECT, name: "web" })).toEqual({ ok: true, value: { id: SERVICE, name: "web" } });
    expect(f.calls[0]!.variables).toEqual({ input: { projectId: PROJECT, name: "web" } });
    expect(await client.createService({ projectId: PROJECT, name: "web", repo: null, branch: null })).toMatchObject({ ok: true });
    expect(f.calls[1]!.variables).toEqual({ input: { projectId: PROJECT, name: "web" } });

    expect(await client.connectRepo({ serviceId: SERVICE, repo: "suvin/harbour-lane", branch: "release/1.2" })).toEqual({ ok: true, value: null });
    expect(f.calls[2]!.query).toContain("serviceConnect(id: $id, input: $input)");
    expect(f.calls[2]!.variables).toEqual({ id: SERVICE, input: { repo: "suvin/harbour-lane", branch: "release/1.2" } });

    const blocked = await createRailwayClient(TOKEN, { fetcher: fake(() => json({ errors: [{ message: "User does not have access to the repo" }], data: null })).fetcher }).connectRepo({
      serviceId: SERVICE,
      repo: "suvin/harbour-lane",
      branch: "main",
    });
    expect(message(blocked)).toMatch(/^Railway can't reach this GitHub repository/);
  });

  it("sets service variables without starting a deploy, keeping the others, and keeps their values out of messages", async () => {
    const f = fake(() => data({ variableCollectionUpsert: true }));
    const vars = { PORT: "8080", NPM_CONFIG_IGNORE_SCRIPTS: "true" };
    expect(await createRailwayClient(TOKEN, { fetcher: f.fetcher }).setVariables({ projectId: PROJECT, environmentId: ENV_PROD, serviceId: SERVICE, variables: vars })).toEqual({ ok: true, value: null });
    expect(f.calls[0]!.query).toContain("variableCollectionUpsert(input: $input)");
    expect(f.calls[0]!.query).not.toContain("8080");
    expect(f.calls[0]!.variables).toEqual({ input: { projectId: PROJECT, environmentId: ENV_PROD, serviceId: SERVICE, variables: vars, skipDeploys: true } });
    expect("replace" in (f.calls[0]!.variables.input as Record<string, unknown>)).toBe(false);

    const unsaved = await createRailwayClient(TOKEN, { fetcher: fake(() => data({ variableCollectionUpsert: false })).fetcher }).setVariables({ projectId: PROJECT, environmentId: ENV_PROD, serviceId: SERVICE, variables: vars });
    expect(message(unsaved)).toMatch(/didn't save the service's variables/);

    const secret = "s3cr3t-value-that-is-long";
    const echoed = await createRailwayClient(TOKEN, { fetcher: fake(() => json({ errors: [{ message: `Invalid value ${secret} for API_KEY` }], data: null })).fetcher }).setVariables({
      projectId: PROJECT,
      environmentId: ENV_PROD,
      serviceId: SERVICE,
      variables: { API_KEY: secret },
    });
    expect(message(echoed)).toBe("Railway refused it: Invalid value [value] for API_KEY");
  });

  it("turns off deploys on push for the service in its environment", async () => {
    const f = fake(() => data({ serviceInstanceAutoDeployUpdate: { enabled: false } }));
    expect(await createRailwayClient(TOKEN, { fetcher: f.fetcher }).disableAutoDeploys({ projectId: PROJECT, environmentId: ENV_PROD, serviceId: SERVICE })).toEqual({ ok: true, value: null });
    expect(f.calls[0]!.query).toContain("serviceInstanceAutoDeployUpdate(input: $input)");
    expect(f.calls[0]!.variables).toEqual({ input: { projectId: PROJECT, environmentId: ENV_PROD, serviceId: SERVICE, enabled: false } });
    const still = await createRailwayClient(TOKEN, { fetcher: fake(() => data({ serviceInstanceAutoDeployUpdate: { enabled: true } })).fetcher }).disableAutoDeploys({
      projectId: PROJECT,
      environmentId: ENV_PROD,
      serviceId: SERVICE,
    });
    expect(message(still)).toMatch(/still deploys this service on every push/);
  });

  it("sets the build and start commands on the service in its environment", async () => {
    const f = fake(() => data({ serviceInstanceUpdate: true }));
    const client = createRailwayClient(TOKEN, { fetcher: f.fetcher });
    expect(await client.setCommands({ serviceId: SERVICE, environmentId: ENV_PROD, buildCommand: "npm run build", startCommand: "npm start" })).toEqual({ ok: true, value: null });
    expect(f.calls[0]!.variables).toEqual({ serviceId: SERVICE, environmentId: ENV_PROD, input: { buildCommand: "npm run build", startCommand: "npm start" } });
    await client.setCommands({ serviceId: SERVICE, environmentId: ENV_PROD, buildCommand: null, startCommand: "node server.js" });
    expect(f.calls[1]!.variables.input).toEqual({ buildCommand: null, startCommand: "node server.js" });
    const unsaved = await createRailwayClient(TOKEN, { fetcher: fake(() => data({ serviceInstanceUpdate: false })).fetcher }).setCommands({ serviceId: SERVICE, environmentId: ENV_PROD, buildCommand: null, startCommand: "npm start" });
    expect(message(unsaved)).toMatch(/didn't save the build and start commands/);
  });

  it("returns the service's existing domain, or makes one on the target port", async () => {
    const existing = fake(() => data({ domains: { serviceDomains: [{ domain: "harbour-lane-production.up.railway.app" }] } }));
    const ids = { projectId: PROJECT, serviceId: SERVICE, environmentId: ENV_PROD };
    expect(await createRailwayClient(TOKEN, { fetcher: existing.fetcher }).ensureDomain({ ...ids, targetPort: 3000 })).toEqual({ ok: true, value: "harbour-lane-production.up.railway.app" });
    expect(existing.calls).toHaveLength(1);
    expect(existing.calls[0]!.variables).toEqual(ids);

    const fresh = fake(({ query }) => (query.includes("serviceDomainCreate") ? data({ serviceDomainCreate: { id: "dom_1", domain: "web-production-1a2b.up.railway.app" } }) : data({ domains: { serviceDomains: [] } })));
    expect(await createRailwayClient(TOKEN, { fetcher: fresh.fetcher }).ensureDomain({ ...ids, targetPort: 8080 })).toEqual({ ok: true, value: "web-production-1a2b.up.railway.app" });
    expect(fresh.calls[1]!.variables).toEqual({ input: { serviceId: SERVICE, environmentId: ENV_PROD, targetPort: 8080 } });
  });

  it("deploys one commit by its SHA and reads the deployment's status", async () => {
    const f = fake(({ query }) => (query.includes("serviceInstanceDeployV2") ? data({ serviceInstanceDeployV2: DEPLOY }) : data({ deployment: { id: DEPLOY, status: "DEPLOYING" } })));
    const client = createRailwayClient(TOKEN, { fetcher: f.fetcher });
    expect(await client.deployCommit({ serviceId: SERVICE, environmentId: ENV_PROD, commitSha: SHA.toUpperCase() })).toEqual({ ok: true, value: { id: DEPLOY } });
    expect(f.calls[0]!.variables).toEqual({ serviceId: SERVICE, environmentId: ENV_PROD, commitSha: SHA });
    expect(f.calls[0]!.query).toContain("commitSha: $commitSha");
    expect(await client.getDeployment(DEPLOY)).toEqual({ ok: true, value: { id: DEPLOY, status: "DEPLOYING" } });
    expect(f.calls[1]!.variables).toEqual({ id: DEPLOY });

    const odd = await createRailwayClient(TOKEN, { fetcher: fake(() => data({ deployment: { id: DEPLOY, status: "TELEPORTING" } })).fetcher }).getDeployment(DEPLOY);
    expect(odd).toEqual({ ok: true, value: { id: DEPLOY, status: "UNKNOWN" } });
    const missing = await createRailwayClient(TOKEN, { fetcher: fake(() => json({ errors: [{ message: "Commit not found" }], data: null })).fetcher }).deployCommit({ serviceId: SERVICE, environmentId: ENV_PROD, commitSha: SHA });
    expect(message(missing)).toBe("Railway couldn't find this commit in the GitHub repository. Push it to GitHub, then launch again.");
  });

  it("turns Railway's errors into plain sentences that never include the token", async () => {
    const say = async (respond: () => Response) => message(await createRailwayClient(TOKEN, { fetcher: fake(respond).fetcher }).getDeployment(DEPLOY));
    const tokenMessage = "Railway didn't accept this token. Create an account token in Railway under Account settings, Tokens, and connect again.";
    const said = [
      await say(() => json({ errors: [{ message: "Not Authorized" }], data: null })),
      await say(() => json({ message: "Unauthorized" }, 401)),
      await say(() => json({ message: "Forbidden" }, 403)),
      await say(() => json({ errors: [{ message: "Rate limit exceeded" }] }, 429, { "retry-after": "120" })),
      await say(() => new Response("upstream down", { status: 502 })),
      await say(() => json({ errors: [{ message: `Bad request for ${TOKEN}: ${"x".repeat(400)}` }], data: null })),
      await say(() => data({ deployment: { id: DEPLOY } })),
    ];
    expect(said[0]).toBe(tokenMessage);
    expect(said[1]).toBe(tokenMessage);
    expect(said[2]).toBe(tokenMessage);
    expect(said[3]).toBe("Railway is limiting requests from this token right now. Try again in 2 minutes.");
    expect(said[4]).toBe("Railway didn't answer properly. Try again in a few minutes.");
    expect(said[5]).toMatch(/^Railway refused it: Bad request for \[token\]/);
    expect(said[5]!.length).toBeLessThanOrEqual("Railway refused it: ".length + 200);
    expect(said[6]).toBe("Railway's answer about the deployment couldn't be read.");

    const down = await createRailwayClient(TOKEN, {
      fetcher: (async () => {
        throw new Error(`connect failed for ${TOKEN}`);
      }) as typeof fetch,
    }).whoami();
    expect(down).toEqual({ ok: false, message: "Farbaek couldn't reach Railway. Try again in a few minutes." });

    for (const text of [...said, message(down)]) {
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain("—");
    }
  });

  it("refuses ids, repositories, branches, commits, ports, commands, variables and tokens that don't look right, without calling Railway", async () => {
    const f = fake(() => data({}));
    const client = createRailwayClient(TOKEN, { fetcher: f.fetcher });
    const refused = await Promise.all([
      client.findProject("harbour-lane", "not-a-workspace"),
      client.findProject("", WS),
      client.createProject("two\nlines", null),
      client.createProject("harbour-lane", "1; drop"),
      client.createService({ projectId: "project_1", name: "web", repo: "suvin/harbour-lane", branch: "main" }),
      client.createService({ projectId: PROJECT, name: "web", repo: "suvin", branch: "main" }),
      client.createService({ projectId: PROJECT, name: "web", repo: "suvin/harbour-lane/extra", branch: "main" }),
      client.createService({ projectId: PROJECT, name: "web", repo: "-suvin/harbour-lane", branch: "main" }),
      client.createService({ projectId: PROJECT, name: "web", repo: "suvin/..", branch: "main" }),
      client.createService({ projectId: PROJECT, name: "web", repo: "suvin/harbour lane", branch: "main" }),
      client.createService({ projectId: PROJECT, name: "web", repo: "suvin/harbour-lane", branch: "../main" }),
      client.createService({ projectId: PROJECT, name: "", repo: "suvin/harbour-lane", branch: "main" }),
      client.setCommands({ serviceId: SERVICE, environmentId: ENV_PROD, buildCommand: null, startCommand: "  " }),
      client.setCommands({ serviceId: SERVICE, environmentId: ENV_PROD, buildCommand: "npm ci\nnpm run build", startCommand: "npm start" }),
      client.setCommands({ serviceId: SERVICE, environmentId: "production", buildCommand: null, startCommand: "npm start" }),
      client.ensureDomain({ projectId: PROJECT, serviceId: SERVICE, environmentId: ENV_PROD, targetPort: 0 }),
      client.ensureDomain({ projectId: PROJECT, serviceId: SERVICE, environmentId: ENV_PROD, targetPort: 3000.5 }),
      client.ensureDomain({ projectId: PROJECT, serviceId: "web", environmentId: ENV_PROD, targetPort: 3000 }),
      client.deployCommit({ serviceId: SERVICE, environmentId: ENV_PROD, commitSha: "a".repeat(39) }),
      client.deployCommit({ serviceId: SERVICE, environmentId: ENV_PROD, commitSha: "g".repeat(40) }),
      client.deployCommit({ serviceId: SERVICE, environmentId: ENV_PROD, commitSha: "main" }),
      client.getDeployment("dep_1"),
      createRailwayClient("", { fetcher: f.fetcher }).whoami(),
      createRailwayClient("token with spaces", { fetcher: f.fetcher }).getDeployment(DEPLOY),
      client.createService({ projectId: PROJECT, name: "web", repo: "suvin/harbour-lane" }),
      client.connectRepo({ serviceId: SERVICE, repo: "suvin", branch: "main" }),
      client.connectRepo({ serviceId: SERVICE, repo: "suvin/harbour-lane", branch: "-main" }),
      client.connectRepo({ serviceId: "web", repo: "suvin/harbour-lane", branch: "main" }),
      client.setVariables({ projectId: PROJECT, environmentId: ENV_PROD, serviceId: SERVICE, variables: {} }),
      client.setVariables({ projectId: PROJECT, environmentId: ENV_PROD, serviceId: SERVICE, variables: { "1PORT": "8080" } }),
      client.setVariables({ projectId: PROJECT, environmentId: ENV_PROD, serviceId: SERVICE, variables: { "MY-VAR": "x" } }),
      client.setVariables({ projectId: PROJECT, environmentId: ENV_PROD, serviceId: SERVICE, variables: { PORT: 8080 as unknown as string } }),
      client.setVariables({ projectId: PROJECT, environmentId: ENV_PROD, serviceId: SERVICE, variables: { BIG: "x".repeat(32_769) } }),
      client.setVariables({ projectId: "project", environmentId: ENV_PROD, serviceId: SERVICE, variables: { PORT: "8080" } }),
      client.disableAutoDeploys({ projectId: PROJECT, environmentId: ENV_PROD, serviceId: "web" }),
    ]);
    expect(f.calls).toHaveLength(0);
    for (const r of refused) {
      expect(r.ok).toBe(false);
      expect(message(r)).not.toContain("—");
    }
    expect(message(refused[6]!)).toMatch(/like owner\/repo/);
    expect(message(refused[18]!)).toMatch(/40 characters/);
    expect(message(refused[22]!)).toMatch(/didn't accept this token/);
    expect(message(refused[24]!)).toMatch(/branch name/);
    expect(message(refused[28]!)).toMatch(/no variables to set/);
    expect(message(refused[31]!)).toBe("The value of PORT should be text of up to 32 KB.");
  });

  it("maps Railway's deployment statuses to building, ready or failed", () => {
    expect(statusFromRailwayDeploy("SUCCESS")).toBe("ready");
    for (const s of ["FAILED", "CRASHED", "REMOVED", "SKIPPED"]) expect(statusFromRailwayDeploy(s)).toBe("failed");
    for (const s of ["BUILDING", "DEPLOYING", "WAITING", "QUEUED", "INITIALIZING", "NEEDS_APPROVAL", "SLEEPING", "REMOVING", "UNKNOWN", ""]) expect(statusFromRailwayDeploy(s)).toBe("building");
  });
});
