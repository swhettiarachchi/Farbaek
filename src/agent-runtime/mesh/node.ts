/**
 * One device in Farbaek Mesh (ADR 0038): its key, the devices it trusts,
 * visibility on the local network, pairing, and the transfers it sends and
 * receives. The desktop app's main process owns one; the window only sees
 * snapshots and asks for actions.
 *
 * Nothing listens until the person asks to be visible, and that lapses
 * after five minutes. Pairing needs both people to confirm the same
 * six-digit code within two minutes. Transfers need a paired device on both
 * ends, and every incoming one waits for the person to accept it.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer, connect as tcpConnect, type Server, type Socket } from "node:net";
import path from "node:path";
import type { Duplex } from "node:stream";
import { z } from "zod";
import { FINAL_STATES, PAIRING_WINDOW_MS, VISIBLE_FOR_MS, type MeshMessage } from "@/core/mesh/protocol";
import { initiate, respond, type SecureChannel } from "./channel";
import { Discovery, localAddresses, type NearbyDevice } from "./discovery";
import { TrustStore, loadDeviceKey, type KeyVault, type TrustedDevice } from "./identity";
import { fingerprint, pairingCode, type KeyPair } from "./noise";
import { packFolder, type PackedFolder } from "./pack";
import { IncomingTransfer, OfferError, readOffer, type IncomingView } from "./receive";
import { DirectError } from "./direct-signal";
import { RelayError } from "./relay";
import { OutgoingTransfer, type OutgoingView } from "./send";

const CONNECT_TIMEOUT_MS = 10_000;
/** How long an answering device waits for the caller's first message after the handshake. */
const FIRST_MESSAGE_MS = 30_000;

export class MeshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeshError";
  }
}

export interface PairingView {
  id: string;
  role: "caller" | "answerer";
  peer: { name: string; fingerprint: string };
  code: string;
  state: "confirming" | "waiting" | "paired" | "declined" | "expired" | "failed";
  expiresAt: string;
  message: string | null;
}

export interface PreparedView {
  id: string;
  name: string;
  root: string;
  files: number;
  bytes: number;
  excluded: { path: string; reason: string }[];
  excludedCount: number;
}

export interface MeshSnapshot {
  self: { name: string; fingerprint: string };
  visible: { until: string; port: number; addresses: string[] } | null;
  looking: boolean;
  nearby: (Omit<NearbyDevice, "seenAt"> & { paired: boolean })[];
  /** `via` "farbaek": a phone or browser, reached only over the internet. */
  devices: (Pick<TrustedDevice, "name" | "fingerprint" | "pairedAt"> & { via: "nearby" | "farbaek" })[];
  pairing: PairingView | null;
  prepared: PreparedView[];
  /** Farbaek's secure relay (ADR 0094): whether this app can use it, and whether this computer is reachable through it. */
  relay: { available: true; reachable: boolean; problem: string | null; direct: boolean; pairingUntil: string | null } | { available: false; reason: string };
  /**
   * `via`: how the bytes go. `canUseRelay`: a direct link was blocked, and the person can choose the relay instead (ADR 0095).
   * `queuedUntil`: an outgoing transfer waiting for its device to come back, and until when (ADR 0138).
   */
  transfers: ((IncomingView | OutgoingView) & { via: Via; canUseRelay: boolean; queuedUntil: string | null })[];
}

/** How long a queued transfer keeps waiting, and how often one over the internet is tried again (ADR 0138). */
export const QUEUE_FOR_MS = 24 * 60 * 60_000;
export const QUEUE_RETRY_MS = 60_000;

const QueueFileSchema = z.object({
  v: z.literal(1),
  entries: z
    .array(
      z.object({
        root: z.string().min(1).max(4096),
        device: z.string().regex(/^[0-9a-f]{16}$/),
        via: z.enum(["nearby", "relay", "direct"]),
        until: z.iso.datetime(),
        at: z.object({ address: z.string().max(100), port: z.number().int().min(1).max(65_535) }).nullable(),
      }),
    )
    .max(50),
});

export type Via = "nearby" | "relay" | "direct";

/** The relay as MeshNode needs it: RelayClient in the app, an in-process hub in tests. */
export interface RelayLink {
  setReachable(fingerprint: string, on: boolean): Promise<void>;
  waitForCalls(): Promise<{ session: string; from: string; mode: "relay" | "direct" | "pair" }[]>;
  call(to: string, from: string, mode?: "relay" | "direct" | "pair"): Promise<string>;
  join(session: string): Promise<void>;
  open(session: string): Duplex;
  close(session: string, reason: "done" | "cancelled"): Promise<void>;
}

export interface MeshNodeOptions {
  dataDir: string;
  name: () => string;
  vault: KeyVault;
  /** false turns discovery off (tests); devices can still connect by address. */
  discovery?: { group?: string; port?: number } | false;
  /** The address the listener binds to. Tests use 127.0.0.1. */
  listenHost?: string;
  /** Farbaek's relay, or why it isn't available (the app isn't paired with Farbaek). */
  relay?: () => RelayLink | string;
  /**
   * Opens a direct link to the other agent (ADR 0095), set up over `signal`
   * (a relay session), and returns its byte stream, or throws DirectError.
   * The desktop app uses WebRTC; without it, only the relay is offered.
   */
  direct?: (signal: Duplex, role: "offer" | "answer") => Promise<Duplex>;
  onUpdate: () => void;
}

/** Through the relay the other side's first answer can take a few round trips. */
const RELAY_HANDSHAKE_MS = 30_000;
/** Over a direct link the handshake is quick; this only bounds a link that opened and then went quiet. */
const DIRECT_HANDSHAKE_MS = 15_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class PairingSession {
  readonly id = randomUUID();
  readonly code: string;
  readonly expiresAt = Date.now() + PAIRING_WINDOW_MS;
  state: PairingView["state"] = "confirming";
  message: string | null = null;
  private mine: boolean | null = null;
  private theirs: boolean | null = null;
  private readonly timer: NodeJS.Timeout;

  constructor(
    readonly role: PairingView["role"],
    private readonly channel: SecureChannel,
    private readonly trust: TrustStore,
    private readonly onUpdate: () => void,
    private readonly via: "nearby" | "farbaek" = "nearby",
  ) {
    this.code = pairingCode(channel.handshakeHash);
    this.timer = setTimeout(() => this.end("expired", "The code wasn't confirmed within two minutes. Start again."), PAIRING_WINDOW_MS);
    void this.listen();
  }

  get active(): boolean {
    return this.state === "confirming" || this.state === "waiting";
  }

  view(): PairingView {
    return {
      id: this.id,
      role: this.role,
      peer: { name: this.channel.peer.hello.name, fingerprint: fingerprint(this.channel.peer.publicKey) },
      code: this.code,
      state: this.state,
      expiresAt: new Date(this.expiresAt).toISOString(),
      message: this.message,
    };
  }

  private async listen(): Promise<void> {
    try {
      const { message } = await this.channel.receive(PAIRING_WINDOW_MS);
      if (message.t === "pair-confirm") {
        this.theirs = message.ok;
        await this.settle();
      } else if (message.t === "error") {
        this.end("failed", message.code === "busy" ? `${this.channel.peer.hello.name} is pairing with another computer. Try again in a moment.` : message.message);
      } else {
        this.end("failed", "The other computer answered out of order.");
      }
    } catch {
      if (this.active) this.end("failed", "The connection closed before both codes were confirmed.");
    }
  }

  async confirm(ok: boolean): Promise<void> {
    if (!this.active || this.mine !== null) return;
    this.mine = ok;
    await this.channel.send({ t: "pair-confirm", ok }).catch(() => undefined);
    await this.settle();
  }

  private async settle(): Promise<void> {
    if (!this.active) return;
    if (this.mine === false) return this.end("declined", "You said the codes don't match, so the computers weren't paired.");
    if (this.theirs === false) return this.end("declined", `${this.channel.peer.hello.name} said the codes don't match, so the computers weren't paired.`);
    if (this.mine && this.theirs) {
      await this.trust.add(this.channel.peer.publicKey, this.channel.peer.hello.name, this.via);
      return this.end("paired", `Paired with ${this.channel.peer.hello.name}.`);
    }
    if (this.mine) {
      this.state = "waiting";
      this.message = `Waiting for ${this.channel.peer.hello.name} to confirm the same code.`;
      this.onUpdate();
    }
  }

  end(state: PairingView["state"], message: string): void {
    if (!this.active) return;
    clearTimeout(this.timer);
    this.state = state;
    this.message = message;
    // Give the last confirmation a moment to reach the other side before closing.
    setTimeout(() => this.channel.close(), 250);
    this.onUpdate();
  }
}

function connectTo(address: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = tcpConnect({ host: address, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new MeshError("The other computer didn't answer."));
    }, CONNECT_TIMEOUT_MS);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      reject(new MeshError("The other computer didn't answer."));
    });
  });
}

export class MeshNode {
  private key!: KeyPair;
  private readonly trust: TrustStore;
  private discovery: Discovery | null = null;
  private server: Server | null = null;
  private serverPort = 0;
  private visibleUntil: number | null = null;
  private visibleTimer: NodeJS.Timeout | null = null;
  private lookingTimer: NodeJS.Timeout | null = null;
  private looking = false;
  private pairing: PairingSession | null = null;
  private readonly prepared = new Map<string, PackedFolder>();
  private readonly incoming = new Map<string, IncomingTransfer>();
  private readonly outgoing = new Map<string, OutgoingTransfer>();
  private readonly addresses = new Map<string, { address: string; port: number }>();
  private reachable = false;
  private relayProblem: string | null = null;
  private relayLoop: Promise<void> | null = null;
  /** How each transfer over the internet goes now: through the relay or directly. Absent means nearby. */
  private readonly via = new Map<string, "relay" | "direct">();
  /** Until when this computer answers a phone or browser pairing through Farbaek (ADR 0096); 0 when closed. */
  private relayPairingUntil = 0;
  /** Outgoing transfers whose direct link was blocked: the person may choose the relay. */
  private readonly directBlocked = new Set<string>();
  /** Outgoing transfers waiting for an offline device, and until when (ADR 0138). */
  private readonly queued = new Map<string, number>();
  private queueTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: MeshNodeOptions) {
    this.trust = new TrustStore(path.join(options.dataDir, "mesh-devices.json"));
  }

  async init(): Promise<void> {
    this.key = await loadDeviceKey(this.options.vault);
    await this.trust.load();
    await this.restoreQueue();
  }

  get fingerprint(): string {
    return fingerprint(this.key.publicKey);
  }

  private name(): string {
    return this.options.name().trim().slice(0, 60) || "Farbaek computer";
  }

  private update = () => this.options.onUpdate();

  snapshot(): MeshSnapshot {
    const nearby = (this.discovery?.devices() ?? []).map((d) => ({ name: d.name, fingerprint: d.fingerprint, address: d.address, port: d.port, paired: this.trust.byFingerprint(d.fingerprint) !== null }));
    return {
      self: { name: this.name(), fingerprint: this.fingerprint },
      visible: this.visibleUntil ? { until: new Date(this.visibleUntil).toISOString(), port: this.serverPort, addresses: localAddresses() } : null,
      looking: this.looking,
      nearby,
      devices: this.trust.list().map(({ name, fingerprint: fp, pairedAt, via }) => ({ name, fingerprint: fp, pairedAt, via: via ?? "nearby" })),
      pairing: this.pairing?.view() ?? null,
      prepared: [...this.prepared.entries()].map(([id, p]) => ({
        id,
        name: p.name,
        root: p.root,
        files: p.manifest.totals.files,
        bytes: p.manifest.totals.bytes,
        excluded: p.manifest.excluded.slice(0, 50),
        excludedCount: p.manifest.excluded.length,
      })),
      relay: (() => {
        const link = this.relayLink();
        return typeof link === "string"
          ? { available: false as const, reason: link }
          : {
              available: true as const,
              reachable: this.reachable,
              problem: this.relayProblem,
              direct: this.options.direct !== undefined,
              pairingUntil: this.reachable && this.relayPairingUntil > Date.now() ? new Date(this.relayPairingUntil).toISOString() : null,
            };
      })(),
      transfers: [...[...this.incoming.values()].map((t) => t.view()), ...[...this.outgoing.values()].map((t) => t.view())]
        .map((t) => {
          const until = this.queued.get(t.id);
          return { ...t, via: this.via.get(t.id) ?? ("nearby" as const), canUseRelay: t.state === "interrupted" && this.directBlocked.has(t.id), queuedUntil: until ? new Date(until).toISOString() : null };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
  }

  // Visibility and discovery

  async setVisible(on: boolean): Promise<void> {
    if (this.visibleTimer) clearTimeout(this.visibleTimer);
    this.visibleTimer = null;
    if (!on) {
      this.visibleUntil = null;
      this.server?.close();
      this.server = null;
      this.serverPort = 0;
      if (!this.looking) this.stopDiscovery();
      this.update();
      return;
    }
    if (!this.server) {
      const server = createServer((socket) => void this.answer(socket));
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, this.options.listenHost ?? "0.0.0.0", () => {
          server.off("error", reject);
          resolve();
        });
      });
      server.on("error", () => undefined);
      this.server = server;
      const address = server.address();
      this.serverPort = typeof address === "object" && address ? address.port : 0;
    }
    this.visibleUntil = Date.now() + VISIBLE_FOR_MS;
    this.visibleTimer = setTimeout(() => void this.setVisible(false), VISIBLE_FOR_MS);
    await this.startDiscovery();
    this.discovery?.announce();
    this.update();
  }

  async setLooking(on: boolean): Promise<void> {
    if (this.lookingTimer) clearTimeout(this.lookingTimer);
    this.lookingTimer = null;
    this.looking = on;
    if (on) {
      await this.startDiscovery();
      this.lookingTimer = setTimeout(() => void this.setLooking(false), VISIBLE_FOR_MS);
    } else if (!this.visibleUntil) {
      this.stopDiscovery();
    }
    this.update();
  }

  private async startDiscovery(): Promise<void> {
    if (this.options.discovery === false || this.discovery?.running) return;
    const settings = this.options.discovery ?? {};
    this.discovery = new Discovery({
      group: settings.group,
      port: settings.port,
      self: () => ({ name: this.name(), fingerprint: this.fingerprint, port: this.visibleUntil ? this.serverPort : 0 }),
      onChange: () => {
        for (const d of this.discovery?.devices() ?? []) this.addresses.set(d.fingerprint, { address: d.address, port: d.port });
        // A device a queued transfer waits for may just have come back (ADR 0138).
        if (this.queued.size > 0) void this.retryQueued();
        this.update();
      },
    });
    try {
      await this.discovery.start();
    } catch {
      this.discovery = null;
      throw new MeshError("This computer couldn't look for others on the network. Connect by address instead.");
    }
  }

  private stopDiscovery(): void {
    this.discovery?.stop();
    this.discovery = null;
  }

  // Answering calls

  private async answer(socket: Duplex, via: Via = "nearby", allowPairing = via === "nearby"): Promise<void> {
    let channel: SecureChannel;
    try {
      channel = await respond(socket, this.key, { v: 1, name: this.name() });
    } catch {
      socket.destroy();
      return;
    }
    const purpose = channel.peer.hello.purpose;
    // Pairing happens on the same network, or through Farbaek only while the person opened a window here (ADR 0096).
    if (purpose === "pair" && allowPairing) return this.answerPairing(channel, via === "nearby" ? "nearby" : "farbaek");
    if (purpose === "transfer") return this.answerTransfer(channel, via);
    channel.close();
  }

  private async answerPairing(channel: SecureChannel, via: "nearby" | "farbaek"): Promise<void> {
    if (this.pairing?.active) {
      await channel.send({ t: "error", code: "busy", message: "This computer is already pairing." }).catch(() => undefined);
      channel.close();
      return;
    }
    this.pairing = new PairingSession("answerer", channel, this.trust, this.update, via);
    this.update();
  }

  private async answerTransfer(channel: SecureChannel, via: Via): Promise<void> {
    if (!this.trust.find(channel.peer.publicKey)) {
      await channel.send({ t: "error", code: "not_paired", message: "These computers aren't paired. Pair them first." }).catch(() => undefined);
      channel.close();
      return;
    }
    let first: MeshMessage;
    try {
      first = (await channel.receive(FIRST_MESSAGE_MS)).message;
    } catch {
      channel.close();
      return;
    }
    if (first.t !== "offer") {
      channel.close();
      return;
    }
    const existing = this.incoming.get(first.session);
    if (existing) {
      // The same sender resuming the same transfer: carry on without asking again.
      try {
        const manifest = await readOffer(channel, first);
        if (existing.digest !== first.digest || manifest.id !== existing.manifest.id || !channel.peer.publicKey.equals(existing.peerKey)) throw new OfferError("That isn't the transfer it claims to resume.");
        if (existing.state === "done") {
          // Finished here already; the sender only missed the verdict.
          await channel.send({ t: "verified", files: manifest.totals.files, bytes: manifest.totals.bytes }).catch(() => undefined);
          channel.close();
          return;
        }
        await existing.reattach(channel);
      } catch (error) {
        await channel.send({ t: "error", code: "bad_offer", message: error instanceof OfferError ? error.message : "That transfer can't be resumed." }).catch(() => undefined);
        channel.close();
      }
      return;
    }
    try {
      const manifest = await readOffer(channel, first);
      const transfer = new IncomingTransfer(channel, first.session, first.digest, manifest, this.update);
      if (via !== "nearby") this.via.set(transfer.id, via);
      this.incoming.set(transfer.id, transfer);
      this.update();
    } catch (error) {
      const message = error instanceof OfferError ? [error.message, ...error.problems.slice(0, 3)].join(" ").slice(0, 300) : "The offer couldn't be read.";
      await channel.send({ t: "error", code: "bad_offer", message }).catch(() => undefined);
      channel.close();
    }
  }

  // Calling out

  private async dial(address: string, port: number, purpose: "pair" | "transfer"): Promise<SecureChannel> {
    const socket = await connectTo(address, port);
    return initiate(socket, this.key, { v: 1, name: this.name(), purpose });
  }

  /** Starts pairing with the device at this address. Both people then compare the code. */
  async pair(address: string, port: number): Promise<void> {
    if (this.pairing?.active) throw new MeshError("A pairing is already in progress. Finish or cancel it first.");
    let channel: SecureChannel;
    try {
      channel = await this.dial(address, port, "pair");
    } catch {
      throw new MeshError("That computer didn't answer. Check it's visible and on the same network.");
    }
    this.addresses.set(fingerprint(channel.peer.publicKey), { address, port });
    this.pairing = new PairingSession("caller", channel, this.trust, this.update);
    this.update();
  }

  async confirmPairing(ok: boolean): Promise<void> {
    await this.pairing?.confirm(ok);
  }

  dismissPairing(): void {
    if (this.pairing?.active) this.pairing.end("declined", "Pairing cancelled.");
    this.pairing = null;
    this.update();
  }

  async forget(fingerprintValue: string): Promise<void> {
    await this.trust.forget(fingerprintValue);
    this.update();
  }

  // Transfers

  async prepare(root: string): Promise<PreparedView> {
    const packed = await packFolder(root);
    const id = randomUUID();
    this.prepared.set(id, packed);
    this.update();
    return this.snapshot().prepared.find((p) => p.id === id)!;
  }

  dropPrepared(id: string): void {
    this.prepared.delete(id);
    this.update();
  }

  /** Sends a prepared folder to a paired device, at the address discovery found or the one given. */
  send(preparedId: string, deviceFingerprint: string, at?: { address: string; port: number }): string {
    const packed = this.prepared.get(preparedId);
    if (!packed) throw new MeshError("Choose the folder again: it's no longer prepared.");
    const device = this.trust.byFingerprint(deviceFingerprint);
    if (!device) throw new MeshError("Pair with that computer first.");
    if (device.via === "farbaek") throw new MeshError(`${device.name} is a phone or browser: phones and browsers receive over the internet. Choose Send over the internet.`);
    if (at) this.addresses.set(device.fingerprint, at);
    if (!this.addresses.has(device.fingerprint)) throw new MeshError(`${device.name} isn't visible. On that computer, open Nearby and choose Be visible.`);
    const transfer = this.outgoingFor(randomUUID(), packed, device, "nearby");
    this.outgoing.set(transfer.id, transfer);
    this.prepared.delete(preparedId);
    void transfer.start();
    this.update();
    return transfer.id;
  }

  // Farbaek's secure relay (ADR 0094)

  private relayLink(): RelayLink | string {
    return this.options.relay?.() ?? "Farbaek's relay isn't available in this app.";
  }

  /**
   * Turns "Reachable through Farbaek" on or off: while on and the app is
   * open, paired computers can send to this one through the relay. Only
   * devices this computer paired with nearby are answered.
   */
  async setReachable(on: boolean): Promise<void> {
    const link = this.relayLink();
    if (typeof link === "string") throw new MeshError(link);
    if (!on) {
      this.reachable = false;
      this.relayProblem = null;
      this.update();
      await link.setReachable(this.fingerprint, false).catch(() => undefined);
      return;
    }
    try {
      await link.setReachable(this.fingerprint, true);
    } catch (error) {
      throw new MeshError(error instanceof Error ? error.message : "Farbaek's relay couldn't be reached.");
    }
    this.reachable = true;
    this.relayProblem = null;
    this.update();
    this.relayLoop ??= this.listenThroughRelay(link).finally(() => {
      this.relayLoop = null;
    });
  }

  private async listenThroughRelay(link: RelayLink): Promise<void> {
    let failures = 0;
    while (this.reachable) {
      try {
        const calls = await link.waitForCalls();
        failures = 0;
        if (this.relayProblem) {
          this.relayProblem = null;
          this.update();
        }
        for (const call of calls) void this.answerRelayCall(link, call);
      } catch (error) {
        if (!this.reachable) break;
        const code = error instanceof RelayError ? error.code : "";
        if (code === "UNAUTHENTICATED" || code === "FORBIDDEN") {
          this.reachable = false;
          this.relayProblem = "This app isn't paired with your Farbaek workspace any more, so it can't be reached through Farbaek. Pair it again.";
          this.update();
          break;
        }
        failures++;
        // The server forgets reachability when it restarts: say it again, then carry on.
        if (code === "NOT_REACHABLE") await link.setReachable(this.fingerprint, true).catch(() => undefined);
        else {
          this.relayProblem = "Farbaek's relay can't be reached right now. Trying again.";
          this.update();
        }
        await sleep(Math.min(30_000, 500 * 2 ** Math.min(failures, 6)));
      }
    }
  }

  private async answerRelayCall(link: RelayLink, call: { session: string; from: string; mode: "relay" | "direct" | "pair" }): Promise<void> {
    if (call.mode === "pair") return this.answerRelayPairing(link, call.session);
    // A computer this one never paired with isn't answered at all. The handshake checks the key again.
    // Without direct links here, a direct call is declined, so the sender is offered the relay.
    if (!this.trust.byFingerprint(call.from) || (call.mode === "direct" && !this.options.direct)) {
      await link.close(call.session, "cancelled").catch(() => undefined);
      return;
    }
    try {
      await link.join(call.session);
    } catch {
      return;
    }
    const signal = link.open(call.session);
    if (call.mode === "relay") return this.answer(signal, "relay");
    let stream: Duplex;
    try {
      stream = await this.options.direct!(signal, "answer");
    } catch {
      signal.destroy();
      return;
    }
    await this.answer(stream, "direct");
  }

  /**
   * Lets a phone or browser pair with this computer through Farbaek for two
   * minutes (ADR 0096). Only while reachable over the internet. The same
   * six-digit code must show on both screens and both people confirm, so
   * Farbaek's server can't pair anyone in the middle.
   */
  openRelayPairing(): void {
    if (!this.reachable) throw new MeshError("Turn on Be reachable over the internet first.");
    this.relayPairingUntil = Date.now() + PAIRING_WINDOW_MS;
    setTimeout(() => this.update(), PAIRING_WINDOW_MS + 50).unref?.();
    this.update();
  }

  closeRelayPairing(): void {
    this.relayPairingUntil = 0;
    this.update();
  }

  private async answerRelayPairing(link: RelayLink, session: string): Promise<void> {
    if (Date.now() > this.relayPairingUntil || this.pairing?.active) {
      await link.close(session, "cancelled").catch(() => undefined);
      return;
    }
    // One pairing per window.
    this.relayPairingUntil = 0;
    try {
      await link.join(session);
    } catch {
      return;
    }
    await this.answer(link.open(session), "relay", true);
  }

  /**
   * Sends a prepared folder to a paired computer over the internet (ADR
   * 0095): directly between the two when their networks allow it, set up
   * through Farbaek. When a direct link is blocked, the transfer stops and
   * the person can choose Farbaek's relay instead; it's never used silently.
   * `first` "relay" goes through the relay from the start.
   */
  sendOverInternet(preparedId: string, deviceFingerprint: string, first: "direct" | "relay" = "direct"): string {
    const link = this.relayLink();
    if (typeof link === "string") throw new MeshError(link);
    const mode = first === "direct" && this.options.direct ? "direct" : "relay";
    const packed = this.prepared.get(preparedId);
    if (!packed) throw new MeshError("Choose the folder again: it's no longer prepared.");
    const device = this.trust.byFingerprint(deviceFingerprint);
    if (!device) throw new MeshError("Pair with that computer first, on the same network.");
    const id = randomUUID();
    const transfer = this.outgoingFor(id, packed, device, mode);
    this.outgoing.set(id, transfer);
    this.prepared.delete(preparedId);
    void transfer.start();
    this.update();
    return id;
  }

  /** An outgoing transfer to `device`: nearby at the address discovery last saw, or over the internet. */
  private outgoingFor(id: string, packed: PackedFolder, device: TrustedDevice, via: Via): OutgoingTransfer {
    if (via === "nearby") {
      return new OutgoingTransfer(
        id,
        packed,
        device,
        () => {
          const where = this.addresses.get(device.fingerprint);
          if (!where) return Promise.reject(new MeshError(`${device.name} isn't visible yet.`));
          return this.dial(where.address, where.port, "transfer");
        },
        this.update,
      );
    }
    this.via.set(id, via);
    return new OutgoingTransfer(
      id,
      packed,
      device,
      () => {
        const link = this.relayLink();
        return typeof link === "string" ? Promise.reject(new MeshError(link)) : this.dialOverInternet(link, id, device.fingerprint);
      },
      this.update,
      (error) => this.unreachableOverInternet(id, device, error),
    );
  }

  // Waiting for an offline device (ADR 0138)

  private waitingMessage(t: OutgoingTransfer): void {
    t.message = this.via.has(t.id)
      ? `Waiting for ${t.device.name}. Farbaek tries again every minute while this app is open, for up to a day.`
      : `Waiting for ${t.device.name}. It's sent as soon as ${t.device.name} is visible on this network while this app is open, for up to a day.`;
  }

  /**
   * Keeps a transfer that couldn't reach its device waiting for it, even
   * across restarts of this app: nearby, it goes as soon as the device is
   * visible again; over the internet, it's tried every minute. After a day it
   * stops trying. Nothing is uploaded anywhere while it waits.
   */
  async queue(id: string): Promise<void> {
    const t = this.outgoing.get(id);
    if (!t || t.state !== "interrupted") throw new MeshError("Only a transfer that couldn't reach the other device can wait for it.");
    this.queued.set(id, Date.now() + QUEUE_FOR_MS);
    this.waitingMessage(t);
    await this.watchQueue();
    await this.saveQueue();
    this.update();
  }

  async unqueue(id: string): Promise<void> {
    if (!this.queued.delete(id)) return;
    const t = this.outgoing.get(id);
    if (t?.state === "interrupted") t.message = "It's no longer waiting. Resume to try again.";
    await this.watchQueue();
    await this.saveQueue();
    this.update();
  }

  /** Tries every waiting transfer whose device may be back. The window's "Try now" calls it too. */
  async retryQueued(): Promise<void> {
    const now = Date.now();
    let changed = false;
    for (const [id, until] of [...this.queued]) {
      const t = this.outgoing.get(id);
      if (!t || FINAL_STATES.has(t.state)) {
        this.queued.delete(id);
        changed = true;
        continue;
      }
      if (now > until) {
        this.queued.delete(id);
        changed = true;
        if (t.state === "interrupted") t.message = `It waited a day without reaching ${t.device.name}, so it stopped trying. Resume to try again.`;
        continue;
      }
      if (t.state !== "interrupted") continue;
      if (!this.via.has(id)) {
        // Nearby: once discovery sees the device again, or at the last address when discovery is off.
        const seen = this.discovery?.running ? this.discovery.devices().some((d) => d.fingerprint === t.device.fingerprint) : this.addresses.has(t.device.fingerprint);
        if (!seen) continue;
      }
      void t.start().then(() => {
        if (t.state === "interrupted" && this.queued.has(id)) {
          this.waitingMessage(t);
          this.update();
        }
      });
    }
    if (changed) {
      await this.watchQueue();
      await this.saveQueue();
      this.update();
    }
  }

  /** Runs the retry timer, and listens for nearby devices, only while something waits. */
  private async watchQueue(): Promise<void> {
    if (this.queued.size > 0 && !this.queueTimer) {
      this.queueTimer = setInterval(() => void this.retryQueued(), QUEUE_RETRY_MS);
      this.queueTimer.unref?.();
    }
    if (this.queued.size === 0 && this.queueTimer) {
      clearInterval(this.queueTimer);
      this.queueTimer = null;
    }
    const nearbyWaiting = [...this.queued.keys()].some((id) => !this.via.has(id));
    if (nearbyWaiting) await this.startDiscovery().catch(() => undefined);
    else if (!this.looking && !this.visibleUntil) this.stopDiscovery();
  }

  private queueFile(): string {
    return path.join(this.options.dataDir, "mesh-queue.json");
  }

  private async saveQueue(): Promise<void> {
    const entries = [...this.queued].flatMap(([id, until]) => {
      const t = this.outgoing.get(id);
      if (!t) return [];
      return [{ root: t.packed.root, device: t.device.fingerprint, via: this.via.get(id) ?? ("nearby" as const), until: new Date(until).toISOString(), at: this.addresses.get(t.device.fingerprint) ?? null }];
    });
    await fs.writeFile(this.queueFile(), JSON.stringify({ v: 1, entries }, null, 2), "utf8");
  }

  /** After a restart: each waiting folder is packed again from disk, so what's sent is what's there now. */
  private async restoreQueue(): Promise<void> {
    const raw = await fs.readFile(this.queueFile(), "utf8").catch(() => null);
    if (!raw) return;
    let parsed;
    try {
      parsed = QueueFileSchema.safeParse(JSON.parse(raw));
    } catch {
      return;
    }
    if (!parsed.success) return;
    for (const entry of parsed.data.entries) {
      const until = Date.parse(entry.until);
      const device = this.trust.byFingerprint(entry.device);
      if (until <= Date.now() || !device) continue;
      const packed = await packFolder(entry.root).catch(() => null);
      if (!packed) continue;
      if (entry.at) this.addresses.set(device.fingerprint, entry.at);
      const t = this.outgoingFor(randomUUID(), packed, device, entry.via);
      t.state = "interrupted";
      this.outgoing.set(t.id, t);
      this.queued.set(t.id, until);
      this.waitingMessage(t);
    }
    await this.watchQueue();
    await this.saveQueue();
  }

  private async dialOverInternet(link: RelayLink, id: string, deviceFingerprint: string): Promise<SecureChannel> {
    const mode = this.via.get(id) ?? "relay";
    const session = await link.call(deviceFingerprint, this.fingerprint, mode);
    const signal = link.open(session);
    const hello = { v: 1 as const, name: this.name(), purpose: "transfer" as const };
    if (mode === "relay") return initiate(signal, this.key, hello, RELAY_HANDSHAKE_MS);
    let stream: Duplex;
    try {
      stream = await this.options.direct!(signal, "offer");
    } catch (error) {
      signal.destroy();
      throw error;
    }
    this.directBlocked.delete(id);
    return initiate(stream, this.key, hello, DIRECT_HANDSHAKE_MS);
  }

  private unreachableOverInternet(id: string, device: TrustedDevice, error: unknown): string {
    const name = device.name;
    if (device.via === "farbaek" && error instanceof RelayError && error.code === "NOT_REACHABLE") return `${name} isn't reachable now. On it, open Mesh in Farbaek, turn on Be reachable and keep the page open, then resume.`;
    if (error instanceof DirectError) {
      this.directBlocked.add(id);
      return `Couldn't open a direct link to ${name}. ${error.message} Some networks block direct links, such as phone hotspots and many offices. You can send it through Farbaek's relay instead: still encrypted end to end, so the server can't read it.`;
    }
    if (error instanceof RelayError) return error.message;
    return `Couldn't reach ${name} over the internet. Make sure it's open and reachable over the internet, then resume.`;
  }

  /** The person chose Farbaek's relay for a transfer whose direct link was blocked: it carries on through the relay. */
  useRelay(id: string): void {
    const transfer = this.outgoing.get(id);
    if (!transfer || transfer.state !== "interrupted" || !this.directBlocked.has(id)) throw new MeshError("Only a transfer whose direct link was blocked can switch to the relay.");
    this.directBlocked.delete(id);
    this.via.set(id, "relay");
    void transfer.start();
    this.update();
  }

  /** Accepts into a new folder inside `parent`; with `earlier`, files already in that earlier copy aren't sent again (ADR 0138). */
  async accept(id: string, parent: string, earlier?: string): Promise<void> {
    const transfer = this.incoming.get(id);
    if (!transfer) throw new MeshError("That transfer isn't waiting any more.");
    void transfer.accept(parent, earlier).catch((error) => {
      transfer.message = error instanceof Error ? error.message : "It couldn't be accepted.";
      this.update();
    });
  }

  async decline(id: string): Promise<void> {
    await this.incoming.get(id)?.decline();
  }

  async cancel(id: string): Promise<void> {
    await this.incoming.get(id)?.cancel();
    await this.outgoing.get(id)?.cancel();
  }

  async resume(id: string): Promise<void> {
    const transfer = this.outgoing.get(id);
    if (!transfer || transfer.state !== "interrupted") throw new MeshError("Only an interrupted transfer can resume.");
    void transfer.start();
  }

  /** Removes a finished transfer from the list, or gives up on an interrupted incoming one. */
  async dismiss(id: string): Promise<void> {
    const incoming = this.incoming.get(id);
    if (incoming?.state === "interrupted") await incoming.discard();
    if (incoming && FINAL_STATES.has(incoming.state)) this.incoming.delete(id);
    const outgoing = this.outgoing.get(id);
    if (outgoing && (FINAL_STATES.has(outgoing.state) || outgoing.state === "interrupted")) {
      this.outgoing.delete(id);
      if (this.queued.delete(id)) {
        await this.watchQueue();
        await this.saveQueue();
      }
    }
    this.update();
  }

  async close(): Promise<void> {
    // Waiting transfers stay saved for the next start; only the timer stops.
    if (this.queueTimer) clearInterval(this.queueTimer);
    this.queueTimer = null;
    for (const t of this.incoming.values()) if (!FINAL_STATES.has(t.state) && t.state !== "offered" && t.state !== "interrupted") await t.cancel();
    for (const t of this.outgoing.values()) if (!FINAL_STATES.has(t.state) && t.state !== "interrupted") await t.cancel();
    this.dismissPairing();
    await this.setLooking(false);
    await this.setVisible(false);
    if (this.reachable) await this.setReachable(false).catch(() => undefined);
  }
}
