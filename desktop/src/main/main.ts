/**
 * Farbaek Agent's main process. It owns everything sensitive: the agent
 * token (encrypted with the system keychain), network calls to Farbaek
 * (model steps go through Farbaek's model gateway, so there are no model
 * keys here), the project copies and the commands. The window is a
 * sandboxed page with no Node access that can only call the narrow,
 * validated handlers below.
 *
 * Window hardening: context isolation, the Chromium sandbox, no Node
 * integration, a strict Content Security Policy in the page, no navigation,
 * no new windows, no webviews, every permission request denied, and every
 * network request from the page cancelled (the page needs none).
 */
import { checkLocalModelUrl, listLocalModels, validLocalModelName } from "@/agent-runtime/models/local";
import { ModelError } from "@/agent-runtime/models/types";
import { connectMcp, McpError } from "@/agent-runtime/mcp/client";
import { checkServerConfig, connectMcpServers, MAX_MCP_SERVERS, mcpOrigin, type McpServerConfig } from "@/agent-runtime/mcp/external";
import { spawnStdioTransport } from "@/agent-runtime/mcp/stdio";
import { BrowserWindow, Menu, app, ipcMain, session, shell, type IpcMainInvokeEvent } from "electron";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { AGENT_MODES } from "@/core/agent/modes";
import { EFFORTS } from "@/core/agent/routing";
import { FarbaekAgentClient, FarbaekApiError, checkServerUrl, pairWithFarbaek } from "@/agent-runtime/farbaek-client";
import type { AppState, Result, RunDetail } from "../shared/api";
import { DirectBridge } from "./direct";
import { DesktopMesh } from "./mesh";
import { RunError, RunManager } from "./runs";
import { HandoffError, HandoffManager } from "./handoffs";
import { SecretStore } from "./secrets";
import { storeDataDir } from "./data-dir";

app.setName("Farbaek Agent");
// Installed from the Microsoft Store: data outside AppData, which Windows redirects for packages (ADR 0098).
const fromStore = storeDataDir({ windowsStore: process.windowsStore === true, home: os.homedir() });
if (fromStore) app.setPath("userData", fromStore);
// Development only: a separate data folder, so a test run never touches the real one.
if (!app.isPackaged && process.env.FARBAEK_AGENT_DATA_DIR) app.setPath("userData", process.env.FARBAEK_AGENT_DATA_DIR);
if (!app.requestSingleInstanceLock()) app.quit();

const RENDERER = path.join(__dirname, "renderer", "index.html");
const RENDERER_URL = pathToFileURL(RENDERER).href;

interface Settings {
  paired: { server: string; agentId: string; agentName: string; workspaceName: string } | null;
  /** A model on this computer (ADR 0134). */
  localModel?: { base: string; model: string } | null;
  /** MCP servers the person added (ADR 0148). */
  mcpServers?: McpServerConfig[];
}

let window: BrowserWindow | null = null;
let settings: Settings = { paired: null };
const dataDir = () => app.getPath("userData");
const secrets = () => new SecretStore(path.join(dataDir(), "secrets"));
let runs: RunManager;
let handoffs: HandoffManager;
/** The agent token, read once from the keychain, for Mesh's relay. */
let agentToken: string | null = null;

/** Development only, ignored in packaged builds: a local relay and token, so two windows can be checked against it. */
function testRelay(): { server: string; token: string } | null {
  const raw = app.isPackaged ? undefined : process.env.FARBAEK_AGENT_TEST_RELAY;
  const [server, token] = raw?.split("|") ?? [];
  return server && token ? { server, token } : null;
}

function relayAccess(): { server: string; token: string } | null {
  return testRelay() ?? (settings.paired && agentToken ? { server: settings.paired.server, token: agentToken } : null);
}

/** Direct links (ADR 0095): WebRTC in a hidden window, through Farbaek's own STUN server on the paired host. */
const direct = new DirectBridge({ preload: path.join(__dirname, "rtc-preload.js"), page: path.join(__dirname, "rtc", "rtc.html") }, () => {
  const access = relayAccess();
  return access ? [`stun:${new URL(access.server).hostname}:3478`] : [];
});

const mesh = new DesktopMesh({
  dataDir: dataDir(),
  secrets: () => secrets(),
  name: () => settings.paired?.agentName ?? os.hostname().slice(0, 60),
  window: () => window,
  relay: relayAccess,
  direct: (signal, role) => direct.open(signal, role),
});

async function loadSettings(): Promise<void> {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(dataDir(), "settings.json"), "utf8")) as Settings;
    const local = parsed.localModel && checkLocalModelUrl(parsed.localModel.base).ok && validLocalModelName(parsed.localModel.model) ? parsed.localModel : null;
    const servers = Array.isArray(parsed.mcpServers) ? parsed.mcpServers.map(checkServerConfig).filter((s): s is McpServerConfig => s !== null).slice(0, MAX_MCP_SERVERS) : [];
    settings = { paired: parsed.paired ?? null, localModel: local, mcpServers: servers };
  } catch {
    settings = { paired: null };
  }
}

async function saveSettings(): Promise<void> {
  const file = path.join(dataDir(), "settings.json");
  await fs.writeFile(`${file}.tmp`, JSON.stringify(settings), "utf8");
  await fs.rename(`${file}.tmp`, file);
}

async function appState(): Promise<AppState> {
  const store = secrets();
  return {
    version: app.getVersion(),
    paired: settings.paired,
    localModel: settings.localModel ?? null,
    mcpServers: settings.mcpServers ?? [],
    keychain: store.availability(),
    dataFolder: dataDir(),
    computerName: os.hostname().slice(0, 60),
  };
}

async function forgetPairing(): Promise<void> {
  await secrets().delete("agent-token");
  agentToken = null;
  settings.paired = null;
  await saveSettings();
}

async function client(): Promise<FarbaekAgentClient> {
  const token = await secrets().get("agent-token");
  if (!settings.paired || !token) throw new FarbaekApiError(401, "NOT_PAIRED", "This computer isn't paired with Farbaek yet.");
  return new FarbaekAgentClient(settings.paired.server, token);
}

/** Runs a handler and turns failures into a message for the window. A revoked token unpairs this computer. */
async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    if (error instanceof FarbaekApiError && error.status === 401 && error.code === "UNAUTHENTICATED") {
      await forgetPairing();
      return { ok: false, message: "Farbaek doesn't accept this computer's agent token anymore (it was revoked, or the person who paired it left). Pair it again with a new code." };
    }
    if (error instanceof FarbaekApiError || error instanceof RunError || error instanceof ModelError || error instanceof McpError) return { ok: false, message: error.message };
    return { ok: false, message: "Something went wrong. Try again." };
  }
}

/** Only our own page may call the handlers. */
function handle<A extends z.ZodType>(channel: string, args: A, fn: (input: z.infer<A>) => Promise<unknown>) {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, raw: unknown) => {
    if (event.senderFrame?.url !== RENDERER_URL) throw new Error("Refused: unknown sender.");
    const parsed = args.safeParse(raw);
    if (!parsed.success) throw new Error("Refused: invalid input.");
    return fn(parsed.data);
  });
}

const Id = z.uuid();

function registerHandlers(): void {
  handle("app:state", z.undefined(), () => appState());

  handle("app:pair", z.object({ server: z.string().max(200), code: z.string().max(40), name: z.string().trim().min(1).max(60) }), (input) =>
    attempt(async () => {
      if (!secrets().availability().available) throw new FarbaekApiError(0, "NO_KEYCHAIN", secrets().availability().reason ?? "Secrets can't be stored on this computer.");
      const server = checkServerUrl(input.server.trim());
      const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
      const paired = await pairWithFarbaek(server, { code: input.code, name: input.name, platform, appVersion: app.getVersion() });
      await secrets().set("agent-token", paired.token);
      agentToken = paired.token;
      settings.paired = { server, agentId: paired.agentId, agentName: input.name, workspaceName: paired.workspace.name };
      await saveSettings();
      return appState();
    }),
  );

  handle("app:unpair", z.undefined(), () =>
    attempt(async () => {
      // Revoke on the server when it can be reached; forget the token here either way.
      await (await client()).unpair().catch(() => undefined);
      await forgetPairing();
      return appState();
    }),
  );

  handle("agent:profile", z.undefined(), () => attempt(async () => (await client()).me()));

  handle("agent:tasks", z.undefined(), () => attempt(async () => (await (await client()).tasks()).map((t) => ({ id: t.id, title: t.title, projectName: t.projectName, updatedAt: t.updatedAt }))));

  handle("agent:task", Id, (id) =>
    attempt(async () => {
      const t = await (await client()).task(id);
      const c = t.contract?.body;
      return {
        id: t.task.id,
        title: t.task.title,
        projectName: t.project.name,
        ready: t.task.readyForChange,
        fileCount: t.files.length,
        contract:
          t.contract && c
            ? {
                version: t.contract.version,
                outcome: c.outcome,
                resources: c.scope.resources,
                allowed: c.allowedOperations,
                forbidden: c.forbiddenOperations,
                acceptance: c.acceptanceCriteria.map((a) => a.statement),
                requiredChecks: c.requiredChecks,
              }
            : null,
      };
    }),
  );

  handle("runs:start", z.object({ taskId: Id, mode: z.enum(AGENT_MODES), effort: z.enum(EFFORTS), model: z.enum(["farbaek", "local"]).optional() }), (input) =>
    attempt(async () => {
      if (input.model === "local" && !settings.localModel) throw new RunError("No local model is set on this computer. Set one in Settings first.");
      const runId = await runs.start({ api: await client(), taskId: input.taskId, mode: input.mode, effort: input.effort, local: input.model === "local" ? settings.localModel ?? null : null, mcp: settings.mcpServers ?? [] });
      return { runId };
    }),
  );

  // Local models (ADR 0134): on this computer only; the address is checked in the main process too.
  handle("model:local-list", z.string().max(200), (base) =>
    attempt(async () => {
      const r = await listLocalModels(base);
      if (!r.ok) throw new ModelError("bad_request", r.reason);
      return r.models;
    }),
  );
  handle("model:local-set", z.object({ base: z.string().max(200), model: z.string().max(90) }).nullable(), (input) =>
    attempt(async () => {
      if (input) {
        const checked = checkLocalModelUrl(input.base);
        if (!checked.ok) throw new ModelError("bad_request", checked.reason);
        if (!validLocalModelName(input.model)) throw new ModelError("bad_request", "Choose one of the models the local server offers.");
        const offered = await listLocalModels(checked.base);
        if (!offered.ok) throw new ModelError("bad_request", offered.reason);
        if (!offered.models.includes(input.model)) throw new ModelError("bad_request", `The local server doesn't offer ${input.model}. Download it first, for example with ollama pull.`);
        settings.localModel = { base: checked.base, model: input.model };
      } else {
        settings.localModel = null;
      }
      await saveSettings();
      return appState();
    }),
  );

  // MCP servers (ADR 0148): checked by starting one once, in a folder of its own; saved only in this app's settings.
  const McpServer = z.object({ name: z.string().max(24), command: z.string().max(64), args: z.array(z.string().max(500)).max(32) });
  const checkedServer = (raw: unknown) => {
    const server = checkServerConfig(raw);
    if (!server) throw new McpError("Give the server a short lowercase name (letters, numbers and dashes), a program on PATH such as npx, node or uvx, and its arguments.");
    return server;
  };
  handle("mcp:check", McpServer, (input) =>
    attempt(async () => {
      const server = checkedServer(input);
      const cwd = path.join(dataDir(), "mcp", server.name);
      await fs.mkdir(cwd, { recursive: true });
      let info: { name: string; version: string } | null = null;
      const session = await connectMcpServers([server], async (s) => {
        const client = await connectMcp(await spawnStdioTransport({ command: s.command, args: s.args, cwd }), { clientVersion: app.getVersion() });
        info = client.server;
        return client;
      });
      try {
        if (session.problems.length > 0 && session.tools.definitions.length === 0) throw new McpError(session.problems.join(" "));
        return { server: info, tools: session.tools.definitions.map((d) => ({ name: d.name, description: d.description.slice(mcpOrigin(server.name).length) })), problems: session.problems };
      } finally {
        session.close();
      }
    }),
  );
  handle("mcp:set", z.array(McpServer).max(MAX_MCP_SERVERS), (input) =>
    attempt(async () => {
      const servers = input.map(checkedServer);
      if (new Set(servers.map((s) => s.name)).size !== servers.length) throw new McpError("Each MCP server needs its own name.");
      settings.mcpServers = servers;
      await saveSettings();
      return appState();
    }),
  );

  // Continue on my computer (ADR 0139): nothing runs until the person here starts it.
  handle("handoffs:list", z.undefined(), () => attempt(async () => (await client()).handoffs()));
  handle("handoffs:start", Id, (id) =>
    attempt(async () => {
      try {
        handoffs.start(await client(), id);
      } catch (error) {
        if (error instanceof HandoffError) throw new RunError(error.message);
        throw error;
      }
    }),
  );
  handle("handoffs:runs", z.undefined(), async () => handoffs.all());

  handle("runs:list", z.undefined(), async () => runs.list());
  handle("runs:get", Id, async (id) => runs.get(id));
  handle("runs:answer", z.object({ runId: Id, requestId: z.string().max(200), approved: z.boolean(), bindingHash: z.string().regex(/^[0-9a-f]{64}$/) }), async (input) =>
    runs.answer(input.runId, input.requestId, input.approved, input.bindingHash),
  );
  handle("runs:cancel", Id, async (id) => runs.cancel(id));
  handle("runs:submit", Id, (id) => attempt(async () => runs.submit(id, await client())));
  handle("runs:check-proposal", Id, (id) => attempt(async () => runs.refreshProposal(id, await client())));
  handle("runs:discard", Id, async (id) => runs.discard(id));

  mesh.register(handle);

  handle("app:open-task", Id, async (taskId) => {
    if (!settings.paired) return;
    // Only the Farbaek server this computer is paired with, over the checked origin.
    await shell.openExternal(`${checkServerUrl(settings.paired.server)}/app/tasks/${taskId}`);
  });
}

function harden(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  // The page needs no network at all; everything goes through the main process.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (_details, callback) => callback({ cancel: true }));
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (e) => e.preventDefault());
    contents.on("will-navigate", (e) => e.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
  });
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: "Farbaek Agent",
    backgroundColor: "#fbfbfc",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "renderer", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  window.once("ready-to-show", () => window?.show());
  // The hidden direct-link window would otherwise keep the app open after this one closes.
  window.on("closed", () => direct.close());
  void window.loadFile(RENDERER);
}

app.on("second-instance", () => {
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

app.on("before-quit", () => {
  // Stops anything a run started; the next launch shows those runs as interrupted.
  runs?.abortAll();
  void mesh.close();
});

app.on("window-all-closed", () => app.quit());

void app.whenReady().then(async () => {
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]));
  } else {
    Menu.setApplicationMenu(null);
  }
  harden();
  await loadSettings();
  await secrets().forgetLegacyKeys();
  if (settings.paired && secrets().availability().available) agentToken = await secrets().get("agent-token").catch(() => null);
  runs = new RunManager({
    dataDir: dataDir(),
    emit: (run: RunDetail) => window?.webContents.send("runs:update", run),
  });
  await runs.load();
  handoffs = new HandoffManager({
    dataDir: dataDir(),
    platform: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux",
    emit: () => window?.webContents.send("handoffs:update"),
  });
  registerHandlers();
  createWindow();
});
