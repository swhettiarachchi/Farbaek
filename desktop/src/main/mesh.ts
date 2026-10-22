/**
 * Nearby transfer in the desktop app (Mesh phase B, ADR 0038). The main
 * process owns the MeshNode: the device key (encrypted with the system
 * keychain), the listener, discovery and every file read or written. The
 * window gets snapshots and asks for actions through the handlers below;
 * folders are always chosen in the system dialog, never typed or sent by
 * the page. Without a keychain, Nearby is unavailable and says why.
 */
import { BrowserWindow, app, dialog, shell } from "electron";
import os from "node:os";
import { z } from "zod";
import { MeshError, MeshNode } from "@/agent-runtime/mesh/node";
import { OfferError } from "@/agent-runtime/mesh/receive";
import { PackError } from "@/agent-runtime/mesh/pack";
import type { MeshState, Result } from "../shared/api";
import type { SecretStore } from "./secrets";

type Handle = <A extends z.ZodType>(channel: string, args: A, fn: (input: z.infer<A>) => Promise<unknown>) => void;

export interface MeshDeps {
  dataDir: string;
  secrets: () => SecretStore;
  /** The name other computers see: the agent's name once paired, otherwise this computer's. */
  name: () => string;
  window: () => BrowserWindow | null;
}

const Fingerprint = z.string().regex(/^[0-9a-f]{16}$/);
const Id = z.string().min(1).max(64);
const Address = z.object({ address: z.union([z.ipv4(), z.ipv6()]), port: z.number().int().min(1).max(65_535) });

export class DesktopMesh {
  private node: MeshNode | null = null;
  private starting: Promise<MeshNode> | null = null;
  private pushTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: MeshDeps) {}

  private unavailable(): string | null {
    const keychain = this.deps.secrets().availability();
    return keychain.available ? null : (keychain.reason ?? "This computer's keychain isn't available, so Nearby can't keep its device key safe.");
  }

  /** The node, created on first use so a computer that never uses Nearby never makes a key. */
  private async ready(): Promise<MeshNode> {
    const reason = this.unavailable();
    if (reason) throw new MeshError(reason);
    if (this.node) return this.node;
    this.starting ??= (async () => {
      const store = this.deps.secrets();
      const node = new MeshNode({
        dataDir: this.deps.dataDir,
        name: this.deps.name,
        vault: { get: () => store.get("mesh-device-key"), set: (v) => store.set("mesh-device-key", v) },
        onUpdate: () => this.push(),
      });
      await node.init();
      this.node = node;
      return node;
    })();
    return this.starting;
  }

  async state(): Promise<MeshState> {
    const reason = this.unavailable();
    if (reason) return { available: false, reason };
    return { available: true, snapshot: (await this.ready()).snapshot() };
  }

  /** Sends the window a fresh snapshot, at most every 100 ms. */
  private push(): void {
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      const node = this.node;
      if (node) this.deps.window()?.webContents.send("mesh:update", node.snapshot());
    }, 100);
  }

  private async attempt<T>(fn: (node: MeshNode) => Promise<T> | T): Promise<Result<T>> {
    try {
      return { ok: true, value: await fn(await this.ready()) };
    } catch (error) {
      if (error instanceof MeshError || error instanceof OfferError || error instanceof PackError) return { ok: false, message: error.message };
      return { ok: false, message: "That didn't work. Try again." };
    }
  }

  private async chooseFolder(title: string, buttonLabel: string, purpose: "send" | "save"): Promise<string | null> {
    // Development only, like FARBAEK_AGENT_DATA_DIR: a fixed folder instead of the dialog, so an automated check can drive two windows.
    const fixed = app.isPackaged ? undefined : process.env[purpose === "send" ? "FARBAEK_AGENT_TEST_SEND_FOLDER" : "FARBAEK_AGENT_TEST_SAVE_FOLDER"];
    if (fixed) return fixed;
    const window = this.deps.window();
    const options = { title, buttonLabel, defaultPath: os.homedir(), properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[] };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  }

  register(handle: Handle): void {
    handle("mesh:state", z.undefined(), () => this.state());
    handle("mesh:visible", z.boolean(), (on) => this.attempt((n) => n.setVisible(on)));
    handle("mesh:look", z.boolean(), (on) => this.attempt((n) => n.setLooking(on)));
    handle("mesh:pair", Address, (at) => this.attempt((n) => n.pair(at.address, at.port)));
    handle("mesh:confirm", z.boolean(), (ok) => this.attempt((n) => n.confirmPairing(ok)));
    handle("mesh:dismiss-pairing", z.undefined(), () => this.attempt((n) => n.dismissPairing()));
    handle("mesh:forget", Fingerprint, (fp) => this.attempt((n) => n.forget(fp)));

    handle("mesh:prepare", z.undefined(), () =>
      this.attempt(async (n) => {
        const folder = await this.chooseFolder("Choose a folder to send", "Choose", "send");
        return folder ? n.prepare(folder) : null;
      }),
    );
    handle("mesh:drop-prepared", Id, (id) => this.attempt((n) => n.dropPrepared(id)));
    handle("mesh:send", z.object({ preparedId: Id, fingerprint: Fingerprint, at: Address.optional() }), (input) => this.attempt((n) => n.send(input.preparedId, input.fingerprint, input.at)));

    handle("mesh:accept", Id, (id) =>
      this.attempt(async (n) => {
        const parent = await this.chooseFolder("Choose where to save it", "Save here", "save");
        if (!parent) return false;
        await n.accept(id, parent);
        return true;
      }),
    );
    handle("mesh:decline", Id, (id) => this.attempt((n) => n.decline(id)));
    handle("mesh:cancel", Id, (id) => this.attempt((n) => n.cancel(id)));
    handle("mesh:resume", Id, (id) => this.attempt((n) => n.resume(id)));
    handle("mesh:dismiss", Id, (id) => this.attempt((n) => n.dismiss(id)));
    handle("mesh:open-folder", Id, (id) =>
      this.attempt(async (n) => {
        // Only a folder this app received into, once every file in it has been checked.
        const transfer = n.snapshot().transfers.find((t) => t.id === id);
        if (transfer?.direction !== "in" || transfer.state !== "done" || !transfer.destination) throw new MeshError("That folder isn't ready to open.");
        await shell.openPath(transfer.destination);
      }),
    );
  }

  async close(): Promise<void> {
    await this.node?.close();
  }
}
