/**
 * The bridge between the sandboxed window and the main process: a fixed set
 * of calls, each forwarded as data. No Node or Electron object reaches the
 * page, and the main process validates every call again.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { FarbaekAgentBridge, RunDetail } from "../shared/api";

const invoke = (channel: string, input?: unknown) => ipcRenderer.invoke(channel, input);

const bridge: FarbaekAgentBridge = {
  state: () => invoke("app:state"),
  pair: (input) => invoke("app:pair", input),
  unpair: () => invoke("app:unpair"),
  setKey: (provider, key) => invoke("keys:set", { provider, key }),
  removeKey: (provider) => invoke("keys:remove", provider),
  profile: () => invoke("agent:profile"),
  tasks: () => invoke("agent:tasks"),
  task: (id) => invoke("agent:task", id),
  startRun: (input) => invoke("runs:start", input),
  runs: () => invoke("runs:list"),
  run: (id) => invoke("runs:get", id),
  answerApproval: (input) => invoke("runs:answer", input),
  cancelRun: (runId) => invoke("runs:cancel", runId),
  submitRun: (runId) => invoke("runs:submit", runId),
  discardRun: (runId) => invoke("runs:discard", runId),
  openTaskInFarbaek: (taskId) => invoke("app:open-task", taskId),
  onRunUpdate(listener) {
    const wrapped = (_event: IpcRendererEvent, run: RunDetail) => listener(run);
    ipcRenderer.on("runs:update", wrapped);
    return () => ipcRenderer.removeListener("runs:update", wrapped);
  },
};

contextBridge.exposeInMainWorld("farbaek", bridge);
