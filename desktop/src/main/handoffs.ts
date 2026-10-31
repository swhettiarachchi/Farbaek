/**
 * Continue on my computer (ADR 0139): tasks handed to this computer from a
 * phone or browser. Nothing runs until the person here starts one. Then the
 * project is copied into a folder of its own with the waiting change written
 * in, packages are installed with their install scripts off, and each check
 * runs once through the command broker (a program and its arguments, never a
 * shell) with a time limit. What each check did goes back to Farbaek, which
 * works out the report's digest; the copy is removed. A report from this
 * computer is evidence this computer gave, and it says so in Farbaek.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { HANDOFF_OUTPUT_CHARS, splitCheckCommand, type HandoffCheckResult, type HandoffReport } from "@/core/agent/handoff";
import { verificationSetup } from "@/core/realityloop/verification";
import { sha256Hex } from "@/core/trust/canonical-json";
import type { AgentHandoff, AgentHandoffDetail, SnapshotFile } from "@/agent-runtime/farbaek-client";
import { ProjectFolder } from "@/agent-runtime/fs-guard";
import { createLocalRunner, type CommandRunner } from "@/agent-runtime/runners";
import { materialize } from "@/agent-runtime/workspace";

export interface HandoffApi {
  handoffs(): Promise<AgentHandoff[]>;
  handoff(id: string): Promise<AgentHandoffDetail>;
  openHandoff(id: string): Promise<void>;
  finishHandoff(id: string, body: { status: "done"; report: HandoffReport } | { status: "failed"; reason: string }): Promise<{ digest: string | null }>;
  snapshot(taskId: string): Promise<SnapshotFile[]>;
}

export interface HandoffRun {
  id: string;
  state: "running" | "reported" | "failed";
  /** What it's doing now, in words. */
  step: string | null;
  checks: HandoffCheckResult[];
  message: string | null;
  digest: string | null;
}

export class HandoffError extends Error {}

/** Each check and the install may take this long; a test suite that hangs is stopped. */
const COMMAND_MS = 10 * 60_000;

const tail = (text: string) => (text.length > HANDOFF_OUTPUT_CHARS ? `…${text.slice(-(HANDOFF_OUTPUT_CHARS - 1))}` : text);

export class HandoffManager {
  private readonly runs = new Map<string, HandoffRun>();

  constructor(
    private readonly deps: {
      dataDir: string;
      platform: HandoffReport["platform"];
      emit(): void;
      /** Commands for the copy. Defaults to the local broker; tests pass a scripted one. */
      makeRunner?(root: string): CommandRunner;
    },
  ) {}

  all(): HandoffRun[] {
    return [...this.runs.values()];
  }

  /** Starts a handoff the person chose here. It runs in the background; `all()` shows how it goes. */
  start(api: HandoffApi, id: string): void {
    if (this.runs.get(id)?.state === "running") throw new HandoffError("That one is already running.");
    const run: HandoffRun = { id, state: "running", step: "Opening it in Farbaek", checks: [], message: null, digest: null };
    this.runs.set(id, run);
    this.deps.emit();
    void this.execute(api, run).catch(() => undefined);
  }

  private set(run: HandoffRun, change: Partial<HandoffRun>): void {
    Object.assign(run, change);
    this.deps.emit();
  }

  /** Runs one handoff. Exported through `start`; awaited directly in tests. */
  async execute(api: HandoffApi, run: HandoffRun): Promise<void> {
    const dir = path.join(this.deps.dataDir, "handoffs", run.id);
    try {
      await api.openHandoff(run.id);
      const detail = await api.handoff(run.id);

      this.set(run, { step: "Copying the project to this computer" });
      const snapshot = await api.snapshot(detail.taskId);
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(dir, { recursive: true });
      const folder = await ProjectFolder.open(dir);
      const { skipped } = await materialize(folder, snapshot);
      const files = new Map(snapshot.map((f) => [f.path, f.content]));
      for (const f of detail.change?.files ?? []) {
        await folder.write(f.path, f.content);
        files.set(f.path, f.content);
      }
      const runner = (this.deps.makeRunner ?? ((root: string) => createLocalRunner(root, { timeoutMs: COMMAND_MS })))(folder.root);

      // The project's packages, from its own lockfile, without running their install scripts.
      const setup = verificationSetup([...files.keys()], (p) => files.get(p) ?? null);
      if (setup) {
        this.set(run, { step: setup.label });
        const split = splitCheckCommand(setup.command);
        if (!split.ok) throw new HandoffError(split.reason);
        const done = await runner.run(split.program, split.args);
        if (done.exitCode !== 0) throw new HandoffError(`${setup.label} failed${done.timedOut ? ": it ran out of time" : done.exitCode === null ? "" : ` (exit ${done.exitCode})`}, so the checks didn't run.`);
      }

      const checks: HandoffCheckResult[] = [];
      for (const command of detail.checks) {
        this.set(run, { step: `Running ${command}`, checks: [...checks] });
        const split = splitCheckCommand(command);
        if (!split.ok) {
          checks.push({ command, exitCode: null, durationMs: null, timedOut: false, outputSha256: null, output: "", skipped: split.reason.slice(0, 300) });
          continue;
        }
        try {
          const r = await runner.run(split.program, split.args);
          const output = [r.stdout, r.stderr].filter(Boolean).join("\n");
          checks.push({ command, exitCode: r.timedOut ? null : r.exitCode, durationMs: r.durationMs, timedOut: r.timedOut, outputSha256: output ? await sha256Hex(output) : null, output: tail(output), skipped: null });
        } catch (error) {
          checks.push({ command, exitCode: null, durationMs: null, timedOut: false, outputSha256: null, output: "", skipped: (error instanceof Error ? error.message : "It couldn't start.").slice(0, 300) });
        }
      }

      this.set(run, { step: "Sending the results to Farbaek", checks: [...checks] });
      const report: HandoffReport = { checks, proposalSha256: detail.proposal?.sha256 ?? null, notCopied: skipped.length, platform: this.deps.platform };
      const { digest } = await api.finishHandoff(run.id, { status: "done", report });
      const passed = checks.filter((c) => c.exitCode === 0).length;
      this.set(run, { state: "reported", step: null, digest, message: `${passed} of ${checks.length} ${checks.length === 1 ? "check" : "checks"} passed. The results are in Farbaek, labelled as reported by this computer.` });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "It stopped unexpectedly.";
      await api.finishHandoff(run.id, { status: "failed", reason: reason.slice(0, 500) }).catch(() => undefined);
      this.set(run, { state: "failed", step: null, message: `${reason} Farbaek was told it couldn't run.` });
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
