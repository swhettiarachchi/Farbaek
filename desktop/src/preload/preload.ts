/**
 * The bridge between the sandboxed window and the main process: a fixed set
 * of calls, each forwarded as data. No Node or Electron object reaches the
 * page, and the main process validates every call again.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { FarbaekAgentBridge, MeshSnapshot, RunDetail } from "../shared/api";

const invoke = (channel: string, input?: unknown) => ipcRenderer.invoke(channel, input);

const bridge: FarbaekAgentBridge = {
  state: () => invoke("app:state"),
  pair: (input) => invoke("app:pair", input),
  unpair: () => invoke("app:unpair"),
  profile: () => invoke("agent:profile"),
  tasks: () => invoke("agent:tasks"),
  task: (id) => invoke("agent:task", id),
  startRun: (input) => invoke("runs:start", input),
  runs: () => invoke("runs:list"),
  run: (id) => invoke("runs:get", id),
  answerApproval: (input) => invoke("runs:answer", input),
  cancelRun: (runId) => invoke("runs:cancel", runId),
  submitRun: (runId) => invoke("runs:submit", runId),
  checkProposal: (runId) => invoke("runs:check-proposal", runId),
  discardRun: (runId) => invoke("runs:discard", runId),
  openTaskInFarbaek: (taskId) => invoke("app:open-task", taskId),
  onRunUpdate(listener) {
    const wrapped = (_event: IpcRendererEvent, run: RunDetail) => listener(run);
    ipcRenderer.on("runs:update", wrapped);
    return () => ipcRenderer.removeListener("runs:update", wrapped);
  },
  mesh: {
    state: () => invoke("mesh:state"),
    setVisible: (on) => invoke("mesh:visible", on),
    setLooking: (on) => invoke("mesh:look", on),
    pair: (at) => invoke("mesh:pair", at),
    confirm: (ok) => invoke("mesh:confirm", ok),
    dismissPairing: () => invoke("mesh:dismiss-pairing"),
    forget: (fingerprint) => invoke("mesh:forget", fingerprint),
    prepare: () => invoke("mesh:prepare"),
    dropPrepared: (id) => invoke("mesh:drop-prepared", id),
    send: (input) => invoke("mesh:send", input),
    setReachable: (on) => invoke("mesh:reachable", on),
    sendOverInternet: (input) => invoke("mesh:send-internet", input),
    useRelay: (id) => invoke("mesh:use-relay", id),
    accept: (id) => invoke("mesh:accept", id),
    decline: (id) => invoke("mesh:decline", id),
    cancel: (id) => invoke("mesh:cancel", id),
    resume: (id) => invoke("mesh:resume", id),
    dismiss: (id) => invoke("mesh:dismiss", id),
    openFolder: (id) => invoke("mesh:open-folder", id),
    onUpdate(listener) {
      const wrapped = (_event: IpcRendererEvent, snapshot: MeshSnapshot) => listener(snapshot);
      ipcRenderer.on("mesh:update", wrapped);
      return () => ipcRenderer.removeListener("mesh:update", wrapped);
    },
  },
};

contextBridge.exposeInMainWorld("farbaek", bridge);
