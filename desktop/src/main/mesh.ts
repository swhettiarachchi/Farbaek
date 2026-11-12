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
import path from "node:path";
import type { Duplex } from "node:stream";
import { z } from "zod";
import { MeshError, MeshNode } from "@/agent-runtime/mesh/node";
import { OfferError } from "@/agent-runtime/mesh/receive";
import { PackError } from "@/agent-runtime/mesh/pack";
import { RelayClient } from "@/agent-runtime/mesh/relay";
import type { MeshState, Result } from "../shared/api";
import type { SecretStore } from "./secrets";

type Handle = <A extends z.ZodType>(channel: string, args: A, fn: (input: z.infer<A>) => Promise<unknown>) => void;

export interface MeshDeps {
  dataDir: string;
  secrets: () => SecretStore;
  /** The name other computers see: the agent's name once paired, otherwise this computer's. */
  name: () => string;
  window: () => BrowserWindow | null;
  /** The Farbaek server and agent token for the relay (ADR 0094), or null while this app isn't paired with Farbaek. */
  relay: () => { server: string; token: string } | null;
  /** Opens a direct WebRTC link set up over a relay session (ADR 0095). */
  direct: (signal: Duplex, role: "offer" | "answer") => Promise<Duplex>;
}

const NOT_PAIRED = "Pair this app with your Farbaek workspace first, under Farbaek. The relay goes through that workspace.";

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
        relay: () => this.relayClient() ?? NOT_PAIRED,
        direct: this.deps.direct,
        onUpdate: () => this.push(),
      });
      await node.init();
      this.node = node;
      return node;
    })();
    return this.starting;
  }

  private relay: { key: string; client: RelayClient } | null = null;

  /** One client per pairing: a new token makes a new one. */
  private relayClient(): RelayClient | null {
    const access = this.deps.relay();
    if (!access) return null;
    const key = `${access.server}|${access.token}`;
    if (this.relay?.key !== key) this.relay = { key, client: new RelayClient(access.server, access.token) };
    return this.relay.client;
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

  private async chooseFolder(title: string, buttonLabel: string, purpose: "send" | "save" | "earlier"): Promise<string | null> {
    // Development only, like FARBAEK_AGENT_DATA_DIR: a fixed folder instead of the dialog, so an automated check can drive two windows.
    const fixed = app.isPackaged ? undefined : process.env[purpose === "send" ? "FARBAEK_AGENT_TEST_SEND_FOLDER" : purpose === "earlier" ? "FARBAEK_AGENT_TEST_EARLIER_FOLDER" : "FARBAEK_AGENT_TEST_SAVE_FOLDER"];
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
    // Both carry the pairing the person looked at, so a click can't land on a pairing that replaced it (ADR 0194).
    handle("mesh:confirm", z.object({ id: Id, ok: z.boolean() }), (input) => this.attempt((n) => n.confirmPairing(input.id, input.ok)));
    handle("mesh:dismiss-pairing", Id, (id) => this.attempt((n) => n.dismissPairing(id)));
    handle("mesh:forget", Fingerprint, (fp) => this.attempt((n) => n.forget(fp)));

    handle("mesh:prepare", z.undefined(), () =>
      this.attempt(async (n) => {
        const folder = await this.chooseFolder("Choose a folder to send", "Choose", "send");
        return folder ? n.prepare(folder) : null;
      }),
    );
    handle("mesh:drop-prepared", Id, (id) => this.attempt((n) => n.dropPrepared(id)));
    handle("mesh:send", z.object({ preparedId: Id, fingerprint: Fingerprint, at: Address.optional() }), (input) => this.attempt((n) => n.send(input.preparedId, input.fingerprint, input.at)));
    handle("mesh:reachable", z.boolean(), (on) => this.attempt((n) => n.setReachable(on)));
    handle("mesh:send-internet", z.object({ preparedId: Id, fingerprint: Fingerprint }), (input) => this.attempt((n) => n.sendOverInternet(input.preparedId, input.fingerprint)));
    handle("mesh:use-relay", Id, (id) => this.attempt((n) => n.useRelay(id)));
    handle("mesh:pair-remote", z.boolean(), (open) => this.attempt((n) => (open ? n.openRelayPairing() : n.closeRelayPairing())));

    handle("mesh:accept", Id, (id) =>
      this.attempt(async (n) => {
        const parent = await this.chooseFolder("Choose where to save it", "Save here", "save");
        if (!parent) return false;
        await n.accept(id, parent);
        return true;
      }),
    );
    // Update an earlier copy (ADR 0138): the earlier copy is only read, and the new copy goes beside it.
    handle("mesh:accept-update", Id, (id) =>
      this.attempt(async (n) => {
        const earlier = await this.chooseFolder("Choose the earlier copy", "Use this copy", "earlier");
        if (!earlier) return false;
        await n.accept(id, path.dirname(earlier), earlier);
        return true;
      }),
    );
    handle("mesh:decline", Id, (id) => this.attempt((n) => n.decline(id)));
    handle("mesh:cancel", Id, (id) => this.attempt((n) => n.cancel(id)));
    handle("mesh:resume", Id, (id) => this.attempt((n) => n.resume(id)));
    handle("mesh:queue", Id, (id) => this.attempt((n) => n.queue(id)));
    handle("mesh:unqueue", Id, (id) => this.attempt((n) => n.unqueue(id)));
    handle("mesh:retry-queued", z.undefined(), () => this.attempt((n) => n.retryQueued()));
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
