/**
 * The contract every execution runtime implements (ADR 0013). Farbaek's
 * control plane talks only to this interface. E2B and Vercel Sandbox
 * (ADR 0016) implement it, and another isolated runtime can be added without
 * touching the application.
 *
 * Capabilities are explicit. A feature the runtime doesn't support is false,
 * and the UI shows it as unavailable with the reason, never as working.
 */
import type { SandboxCapabilities } from "../execution/sandbox";
import type { FailureCategory } from "./failures";
import type { EgressRules } from "./network";

export interface RuntimeCapabilities extends SandboxCapabilities {
  pauseResume: boolean;
  metrics: boolean;
  previews: boolean;
  outputStreaming: boolean;
  cancel: boolean;
  filesystem: boolean;
  /** Why a capability is off on this runtime, in words people can act on. */
  unavailable?: Partial<Record<"previews" | "pauseResume" | "metrics", string>>;
}

export interface RuntimeSandboxSpec {
  /** Runtime image name (an E2B template, or a Vercel Sandbox image). */
  image: string;
  /** vCPUs to ask for. E2B fixes this in the image; Vercel Sandbox takes it per sandbox. */
  vcpu: number;
  /** The runtime ends the sandbox on its own after this long, even if Farbaek is down. */
  ttlSeconds: number;
  egress: EgressRules;
  /** Labels for finding orphans later; never secrets. */
  metadata: Record<string, string>;
}

export interface RuntimeSandbox {
  sandboxId: string;
  /** What the runtime reports, which may differ from what was asked for. */
  vcpu: number | null;
  memoryMiB: number | null;
}

export interface ExecRequest {
  command: string;
  timeoutSeconds: number;
  /** Farbaek's own lines run first in the same shell, such as the egress proxy's settings (ADR 0127). */
  prelude?: string;
}

export interface ExecHandlers {
  onStart?(pid: number): void | Promise<void>;
  onStdout?(chunk: string): void;
  onStderr?(chunk: string): void;
}

export interface ExecOutcome {
  /** null when the process didn't exit normally (timed out, killed, or the runtime lost it). */
  exitCode: number | null;
  timedOut: boolean;
  /** Set when the runtime itself failed, as opposed to the command failing. */
  runtimeError: { category: FailureCategory; message: string } | null;
}

export interface RuntimeFileEntry {
  name: string;
  /** Workspace-relative. */
  path: string;
  type: "file" | "dir";
  size: number | null;
}

export interface ResourceSample {
  at: string;
  cpuPct: number;
  cpuCount: number;
  memUsedBytes: number;
  memTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
}

export interface PreviewTarget {
  /** Upstream origin for the port, built by the adapter from the runtime's id, never from user input. */
  origin: string;
  /** Headers the gateway adds server-side (the runtime's traffic token). Never sent to browsers. */
  headers: Record<string, string>;
}

export type RuntimeHealth = { ok: true; latencyMs: number } | { ok: false; category: FailureCategory; reason: string };

/** A runtime failure, with a category people can act on and whether retrying could help. */
export class RuntimeError extends Error {
  constructor(
    readonly category: FailureCategory,
    message: string,
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "RuntimeError";
  }
}

export interface SandboxRuntime {
  readonly id: string;
  readonly capabilities: RuntimeCapabilities;
  health(): Promise<RuntimeHealth>;
  create(spec: RuntimeSandboxSpec): Promise<RuntimeSandbox>;
  /** Idempotent: destroying a sandbox that's already gone reports existed: false. */
  destroy(sandboxId: string): Promise<{ existed: boolean }>;
  isAlive(sandboxId: string): Promise<boolean>;
  pause(sandboxId: string): Promise<void>;
  resume(sandboxId: string, ttlSeconds: number): Promise<void>;
  exec(sandboxId: string, request: ExecRequest, handlers: ExecHandlers): Promise<ExecOutcome>;
  kill(sandboxId: string, pid: number): Promise<boolean>;
  listFiles(sandboxId: string, relativeDir: string): Promise<RuntimeFileEntry[]>;
  readFile(sandboxId: string, relativePath: string): Promise<string>;
  /** Text as UTF-8, or bytes as they are (images, ADR 0108). */
  writeFiles(sandboxId: string, files: { path: string; content: string | Uint8Array }[]): Promise<void>;
  metrics(sandboxId: string): Promise<ResourceSample | null>;
  /** Where to send one preview request. The method and path let a runtime sign it (the relay, ADR 0023). */
  previewTarget(sandboxId: string, port: number, request: { method: string; path: string }): Promise<PreviewTarget>;
  /** Sandboxes carrying these metadata labels, for finding ones Farbaek lost track of. */
  listTagged(metadata: Record<string, string>, limit: number): Promise<{ sandboxId: string; metadata: Record<string, string> }[]>;
}
