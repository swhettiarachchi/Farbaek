/**
 * Nearby transfer in the desktop app (Mesh phase B, ADR 0038). The main
 * process owns the MeshNode: the device key (encrypted with the system
 * keychain), the listener, discovery and every file read or written. The
 * window gets snapshots and asks for actions through the handlers below;
 * folders are chosen in the system dialog or are the save folder the person
 * already chose, never typed or sent by the page. Without a keychain, Nearby
 * is unavailable and says why.
 *
 * Arrivals (stage 188, ADR 0196): the person is told when something waits for
 * them and when it has arrived, with a notification when the window isn't in
 * front, the taskbar's own progress while files move, and where it went in
 * words their file manager uses. A received file opens with a click only when
 * its kind opens in a viewer; anything else is shown in its folder, never run.
 */
import { BrowserWindow, Notification, app, dialog, nativeImage, shell } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Duplex } from "node:stream";
import { z } from "zod";
import { MeshError, MeshNode, type MeshSnapshot } from "@/agent-runtime/mesh/node";
import { OfferError } from "@/agent-runtime/mesh/receive";
import { PackError } from "@/agent-runtime/mesh/pack";
import { RelayClient } from "@/agent-runtime/mesh/relay";
import type { ArrivalDetail, ArrivalsView, MeshState, ReceivedView, Result } from "../shared/api";
import { transferEvents } from "./nearby-events";
import { arrivalWords, canOpen, canPreview, displayName, kindOf, offerWords, placeLabel, summarise, type KnownFolder } from "./nearby-words";
import { ReceivedLog, type ReceivedEntry } from "./received-log";
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
  /** Brings the window to the front on Nearby: a notification was clicked. */
  showNearby: () => void;
}

/** Shows and closes system notifications by a key, so an offer's notification can be taken back when it stops waiting. */
export interface NearbyNotifier {
  show(note: { key: string; title: string; body: string; onClick: () => void }): void;
  close(key: string): void;
}

/** The system's notifications. Each stays referenced until it's closed, or its click would be lost. */
class SystemNotifier implements NearbyNotifier {
  private readonly open = new Map<string, Notification>();

  show(note: { key: string; title: string; body: string; onClick: () => void }): void {
    if (!Notification.isSupported()) return;
    this.close(note.key);
    const n = new Notification({ title: note.title, body: note.body });
    n.on("click", () => {
      note.onClick();
      this.close(note.key);
    });
    n.on("close", () => {
      if (this.open.get(note.key) === n) this.open.delete(note.key);
    });
    this.open.set(note.key, n);
    n.show();
  }

  close(key: string): void {
    const n = this.open.get(key);
    this.open.delete(key);
    n?.close();
  }
}

/** Development only: notifications written to a file, one JSON line each, so an automated check can count them. */
class LogNotifier implements NearbyNotifier {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  show(note: { key: string; title: string; body: string }): void {
    this.write({ kind: "show", key: note.key, title: note.title, body: note.body });
  }

  close(key: string): void {
    this.write({ kind: "close", key });
  }

  private write(line: object): void {
    this.chain = this.chain.then(() => fs.appendFile(this.file, `${JSON.stringify({ at: new Date().toISOString(), ...line })}\n`, "utf8")).catch(() => undefined);
  }
}

const NOT_PAIRED = "Pair this app with your Farbaek workspace first, under Farbaek. The relay goes through that workspace.";

/** The person's Downloads folder, or their home folder if the system can't say where it is. */
function downloadsFolder(): string {
  try {
    return app.getPath("downloads");
  } catch {
    return os.homedir();
  }
}

/** The folders people know by name, for saying where something went. The most specific match wins. */
function knownFolders(): KnownFolder[] {
  const known: KnownFolder[] = [];
  const add = (label: string, get: () => string) => {
    try {
      known.push({ label, path: get() });
    } catch {
      // A folder the system can't name is left out.
    }
  };
  add("Downloads", () => app.getPath("downloads"));
  add("Desktop", () => app.getPath("desktop"));
  add("Documents", () => app.getPath("documents"));
  add("Pictures", () => app.getPath("pictures"));
  add("Videos", () => app.getPath("videos"));
  add("Music", () => app.getPath("music"));
  if (process.env.OneDrive) known.push({ label: "OneDrive", path: process.env.OneDrive });
  known.push({ label: path.basename(os.homedir()) || "Home", path: os.homedir() });
  return known;
}

async function isFolder(p: string): Promise<boolean> {
  return fs.stat(p).then((s) => s.isDirectory(), () => false);
}

async function isFile(p: string): Promise<boolean> {
  return fs.stat(p).then((s) => s.isFile(), () => false);
}

/** A path inside `folder`, or null if `relative` would lead out of it. */
function inside(folder: string, relative: string): string | null {
  const full = path.resolve(folder, relative);
  const back = path.relative(folder, full);
  return back && !back.startsWith("..") && !path.isAbsolute(back) ? full : null;
}

/** The files in a received folder, for previews and counts: no links followed, at most 200, at most 4 levels down. */
async function listFiles(folder: string): Promise<{ path: string; bytes: number }[]> {
  const found: { path: string; bytes: number }[] = [];
  const walk = async (dir: string, depth: number) => {
    if (depth > 4 || found.length >= 200) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (found.length >= 200) return;
      if (e.name.startsWith(".farbaek-")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, depth + 1);
      else if (e.isFile()) found.push({ path: path.relative(folder, full), bytes: (await fs.lstat(full).catch(() => null))?.size ?? 0 });
    }
  };
  await walk(folder, 0);
  return found;
}

const Fingerprint = z.string().regex(/^[0-9a-f]{16}$/);
const Id = z.string().min(1).max(64);
const Address = z.object({ address: z.union([z.ipv4(), z.ipv6()]), port: z.number().int().min(1).max(65_535) });

export class DesktopMesh {
  private node: MeshNode | null = null;
  private starting: Promise<MeshNode> | null = null;
  private pushTimer: NodeJS.Timeout | null = null;
  /** Each transfer's state when last looked at, for telling what changed. */
  private readonly seen = new Map<string, string>();
  private readonly received: ReceivedLog;
  private readonly notifier: NearbyNotifier;
  /** The folder the person last chose to save into; received files go there with one click until they choose again. */
  private saveFolder: string | null = null;
  private readonly previews = new Map<string, ArrivalDetail>();

  constructor(private readonly deps: MeshDeps) {
    this.received = new ReceivedLog(path.join(deps.dataDir, "nearby-received.json"));
    const log = app.isPackaged ? undefined : process.env.FARBAEK_AGENT_TEST_NOTIFY_LOG;
    this.notifier = log ? new LogNotifier(log) : new SystemNotifier();
  }

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
      await Promise.all([this.received.load(), this.loadSaveFolder()]);
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
    const node = await this.ready();
    return { available: true, snapshot: node.snapshot(), arrivals: await this.arrivals() };
  }

  /**
   * At most every 100 ms: looks at what changed (with or without a window, so a notification never depends on the
   * Nearby page being open), then sends the window a fresh snapshot.
   */
  private push(): void {
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      const node = this.node;
      if (!node) return;
      const snapshot = node.snapshot();
      this.observe(snapshot);
      this.deps.window()?.webContents.send("mesh:update", snapshot);
    }, 100);
  }

  /** Notifications, the taskbar and the history, from what changed since the last look. */
  private observe(snapshot: MeshSnapshot): void {
    const events = transferEvents(this.seen, snapshot.transfers);
    const window = this.deps.window();
    const away = !window || !window.isFocused();
    for (const id of events.offered) {
      const t = snapshot.transfers.find((x) => x.id === id);
      if (!t || !away) continue;
      this.notifier.show({ key: `offer:${id}`, ...offerWords(t.peer.name, t.files, t.bytes), onClick: () => this.deps.showNearby() });
      window?.flashFrame(true);
    }
    for (const id of events.ended) this.notifier.close(`offer:${id}`);
    for (const id of events.arrived) {
      const t = snapshot.transfers.find((x) => x.id === id);
      if (t?.direction === "in" && t.destination) void this.arrived(t, away).catch(() => undefined);
    }
    if (window && !window.isDestroyed()) {
      if (events.progress) window.setProgressBar(events.progress.fraction, { mode: events.progress.mode });
      else window.setProgressBar(-1);
    }
  }

  /** An arrival: kept in the history, and told in a notification when the window isn't in front. */
  private async arrived(t: MeshSnapshot["transfers"][number], away: boolean): Promise<void> {
    if (!t.destination) return;
    const files = this.node?.receivedFiles(t.id) ?? (await listFiles(t.destination));
    const single = files.length === 1 && canOpen(files[0]!.path) ? files[0]!.path : null;
    const entry: ReceivedEntry = {
      id: t.id,
      name: displayName(t.name),
      from: displayName(t.peer.name),
      at: new Date().toISOString(),
      folder: t.destination,
      files: t.files,
      bytes: t.bytes,
      summary: summarise(files, t.files),
      single,
    };
    await this.received.add(entry);
    await this.sendArrivals();
    if (!away) return;
    const words = arrivalWords(t.peer.name, files, t.files, placeLabel(t.destination, knownFolders()));
    this.notifier.show({ key: `arrived:${t.id}`, ...words, onClick: () => void this.reveal(entry).catch(() => this.deps.showNearby()) });
    this.deps.window()?.flashFrame(true);
  }

  /** What the window shows about arrivals: where received files go now, and the recent ones, with what's still there. */
  private async arrivals(): Promise<ArrivalsView> {
    const known = knownFolders();
    const folder = await this.defaultSaveFolder();
    const received: ReceivedView[] = await Promise.all(
      this.received.list().map(async (e) => {
        const there = await isFolder(e.folder);
        const file = e.single ? inside(e.folder, e.single) : null;
        return {
          id: e.id,
          name: e.name,
          from: e.from,
          at: e.at,
          files: e.files,
          bytes: e.bytes,
          summary: e.summary,
          place: placeLabel(e.folder, known),
          folder: e.folder,
          exists: there,
          opens: there && file !== null && (await isFile(file)) ? "file" : there ? "folder" : null,
        } satisfies ReceivedView;
      }),
    );
    return { saveTo: { label: placeLabel(folder, known), chosen: this.saveFolder !== null }, received };
  }

  private async sendArrivals(): Promise<void> {
    const window = this.deps.window();
    if (window && !window.isDestroyed()) window.webContents.send("mesh:arrivals", await this.arrivals());
  }

  // Where received files go

  private get saveSettingsFile(): string {
    return path.join(this.deps.dataDir, "nearby-settings.json");
  }

  private async loadSaveFolder(): Promise<void> {
    try {
      const raw = z.object({ saveFolder: z.string().min(1).max(2048).nullable() }).safeParse(JSON.parse(await fs.readFile(this.saveSettingsFile, "utf8")));
      this.saveFolder = raw.success && raw.data.saveFolder && path.isAbsolute(raw.data.saveFolder) ? raw.data.saveFolder : null;
    } catch {
      this.saveFolder = null;
    }
  }

  private async rememberSaveFolder(folder: string): Promise<void> {
    this.saveFolder = folder;
    await fs.writeFile(`${this.saveSettingsFile}.tmp`, JSON.stringify({ saveFolder: folder }), "utf8");
    await fs.rename(`${this.saveSettingsFile}.tmp`, this.saveSettingsFile);
  }

  /** Where one click saves: the folder the person last chose, if it's still there, otherwise Downloads. */
  private async defaultSaveFolder(): Promise<string> {
    const fixed = app.isPackaged ? undefined : process.env.FARBAEK_AGENT_TEST_SAVE_FOLDER;
    if (fixed) return fixed;
    if (this.saveFolder && path.isAbsolute(this.saveFolder) && (await isFolder(this.saveFolder))) return this.saveFolder;
    return downloadsFolder();
  }

  // Arrived files: shown, opened safely, previewed

  /** A received folder by the transfer's id: from the history, or a transfer that has just arrived. */
  private async receivedEntry(id: string): Promise<ReceivedEntry> {
    await this.received.load();
    const entry = this.received.get(id);
    if (entry) return entry;
    const t = this.node?.snapshot().transfers.find((x) => x.id === id);
    if (t?.direction !== "in" || t.state !== "done" || !t.destination) throw new MeshError("That folder isn't ready to open.");
    return { id, name: t.name, from: t.peer.name, at: t.updatedAt, folder: t.destination, files: t.files, bytes: t.bytes, summary: "", single: null };
  }

  /** Shows it in the file manager: the one file selected, or the folder selected in the folder that holds it. */
  private async reveal(entry: ReceivedEntry): Promise<void> {
    if (!(await isFolder(entry.folder))) throw new MeshError("It's no longer there. It may have been moved or deleted.");
    const file = entry.single ? inside(entry.folder, entry.single) : null;
    shell.showItemInFolder(file && (await isFile(file)) ? file : entry.folder);
  }

  /** Opens it: the one file when it's a kind that opens in a viewer, otherwise the folder. Never runs anything. */
  private async open(entry: ReceivedEntry): Promise<void> {
    if (!(await isFolder(entry.folder))) throw new MeshError("It's no longer there. It may have been moved or deleted.");
    const file = entry.single && canOpen(entry.single) ? inside(entry.folder, entry.single) : null;
    const problem = await shell.openPath(file && (await isFile(file)) ? file : entry.folder);
    if (problem) throw new MeshError("This computer couldn't open it. Show it in its folder instead.");
  }

  /** The files that arrived, with up to 4 photo thumbnails (on Windows and macOS), for the arrival card. */
  private async detail(id: string): Promise<ArrivalDetail> {
    const cached = this.previews.get(id);
    if (cached) return cached;
    const entry = await this.receivedEntry(id);
    if (!(await isFolder(entry.folder))) return { files: [], thumbnails: [] };
    const files = await listFiles(entry.folder);
    const thumbnails: string[] = [];
    if (process.platform === "win32" || process.platform === "darwin") {
      for (const f of files) {
        if (thumbnails.length >= 4) break;
        if (!canPreview(f.path, f.bytes)) continue;
        const full = inside(entry.folder, f.path);
        if (!full) continue;
        const image = await nativeImage.createThumbnailFromPath(full, { width: 192, height: 192 }).catch(() => null);
        if (image && !image.isEmpty()) thumbnails.push(image.toDataURL());
      }
    }
    const detail: ArrivalDetail = {
      files: files.slice(0, 50).map((f) => ({ name: displayName(f.path), bytes: f.bytes, kind: kindOf(f.path), opens: canOpen(f.path) })),
      thumbnails,
    };
    if (this.previews.size > 20) this.previews.delete(this.previews.keys().next().value!);
    this.previews.set(id, detail);
    return detail;
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
    // Received files start where they went last time (Downloads at first); folders to send start at home.
    const options = { title, buttonLabel, defaultPath: purpose === "send" ? os.homedir() : await this.defaultSaveFolder(), properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[] };
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

    // Save with one click (into the folder the person already chose, Downloads at first), or choose a folder now. One
    // click needs this window in front: a person is looking at the offer, not a page acting on its own.
    handle("mesh:accept", z.object({ id: Id, where: z.enum(["default", "choose"]) }), (input) =>
      this.attempt(async (n) => {
        let parent: string;
        if (input.where === "default") {
          const testing = !app.isPackaged && Boolean(process.env.FARBAEK_AGENT_TEST_SAVE_FOLDER);
          if (!testing && !this.deps.window()?.isFocused()) throw new MeshError("Bring Farbaek Agent to the front, then choose Save again.");
          parent = await this.defaultSaveFolder();
        } else {
          const chosen = await this.chooseFolder("Choose where to save it", "Save here", "save");
          if (!chosen) return false;
          await this.rememberSaveFolder(chosen);
          parent = chosen;
        }
        await n.accept(input.id, parent);
        void this.sendArrivals();
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
    // Arrivals, by the transfer's id only: the page never sends a path.
    handle("mesh:show-in-folder", Id, (id) => this.attempt(async () => this.reveal(await this.receivedEntry(id))));
    handle("mesh:open-received", Id, (id) => this.attempt(async () => this.open(await this.receivedEntry(id))));
    handle("mesh:arrival", Id, (id) => this.attempt(() => this.detail(id)));
    handle("mesh:forget-received", Id, (id) =>
      this.attempt(async () => {
        await this.received.remove(id);
        this.previews.delete(id);
        await this.sendArrivals();
      }),
    );
  }

  async close(): Promise<void> {
    await this.node?.close();
  }
}
