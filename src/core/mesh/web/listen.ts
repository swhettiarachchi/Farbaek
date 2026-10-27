/**
 * A browser that paired computers can send to (ADR 0097), while its page is
 * open: the agent's "Reachable through Farbaek" loop
 * (src/agent-runtime/mesh/node.ts, listenThroughRelay) over fetch. Calls
 * from computers this browser didn't pair with are closed without being
 * joined, and the handshake checks the key again. A browser never pairs as
 * the one called. A direct call opens the browser's own WebRTC link; the
 * relay carries the files only when the sender chose it.
 */
import type { Hello } from "@/core/mesh/protocol";
import { answerDirectWeb } from "./direct";
import { sameWebKey, webFingerprint, type WebKeyPair } from "./noise";
import { WebIncoming, WebOfferError, readOfferWeb } from "./receive";
import { WebRelayError, type WebRelay } from "./relay-pipe";
import { respondWeb, type BytePipe, type WebSecureChannel } from "./wire";

const FIRST_MESSAGE_MS = 30_000;
const DIRECT_HANDSHAKE_MS = 15_000;
const RELAY_HANDSHAKE_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface TrustedComputer {
  name: string;
  fingerprint: string;
  publicKey: Uint8Array;
}

export interface WebListenerOptions {
  relay: WebRelay;
  key: WebKeyPair;
  /** This browser's mesh fingerprint. */
  fingerprint: string;
  /** This browser's name, as the computer shows it. */
  name: () => string;
  /** The computers this browser paired with, read fresh for every call. */
  trusted: () => Promise<TrustedComputer[]>;
  iceServers: string[];
  /** A computer offered a transfer, checked and ready for the person to answer. */
  onIncoming: (incoming: WebIncoming) => void;
  onUpdate: () => void;
  /** Opens a direct link as the one called; the browser's WebRTC unless a test swaps it. */
  answerDirect?: (signal: BytePipe, iceServers: string[]) => Promise<BytePipe>;
  /** What a failed wait sleeps for; tests make it short. */
  backoffMs?: (failures: number) => number;
}

export class WebMeshListener {
  reachable = false;
  /** Words for why calls can't arrive right now, or null. */
  problem: string | null = null;
  private loop: Promise<void> | null = null;

  constructor(private readonly options: WebListenerOptions) {}

  /** Turns reachability on or off. Throws WebRelayError, in words, when Farbaek can't be reached. */
  async setReachable(on: boolean): Promise<void> {
    const { relay, fingerprint } = this.options;
    if (!on) {
      this.reachable = false;
      this.problem = null;
      this.options.onUpdate();
      await relay.setReachable(fingerprint, false).catch(() => undefined);
      return;
    }
    await relay.setReachable(fingerprint, true);
    this.reachable = true;
    this.problem = null;
    this.options.onUpdate();
    this.loop ??= this.listen().finally(() => {
      this.loop = null;
    });
  }

  private async listen(): Promise<void> {
    const { relay, fingerprint } = this.options;
    let failures = 0;
    while (this.reachable) {
      try {
        const calls = await relay.waitForCalls();
        failures = 0;
        if (this.problem) {
          this.problem = null;
          this.options.onUpdate();
        }
        for (const call of calls) void this.answer(call);
      } catch (error) {
        if (!this.reachable) break;
        const code = error instanceof WebRelayError ? error.code : "";
        if (code === "UNAUTHENTICATED" || code === "FORBIDDEN") {
          this.reachable = false;
          this.problem = error instanceof WebRelayError && code === "FORBIDDEN" ? error.message : "You're signed out, so computers can't reach this browser. Sign in again, then turn this on.";
          this.options.onUpdate();
          break;
        }
        failures++;
        // The server forgets reachability when it restarts: say it again, then carry on.
        if (code === "NOT_REACHABLE") await relay.setReachable(fingerprint, true).catch(() => undefined);
        else {
          this.problem = "Farbaek can't be reached right now. Trying again.";
          this.options.onUpdate();
        }
        await sleep(this.options.backoffMs?.(failures) ?? Math.min(30_000, 500 * 2 ** Math.min(failures, 6)));
      }
    }
  }

  private async answer(call: { session: string; from: string; mode: "relay" | "direct" | "pair" }): Promise<void> {
    const { relay } = this.options;
    const trusted = await this.options.trusted().catch(() => []);
    // A computer this browser never paired with isn't answered at all, and a browser pairs only as the caller.
    if (call.mode === "pair" || !trusted.some((c) => c.fingerprint === call.from)) {
      await relay.close(call.session, "cancelled");
      return;
    }
    try {
      await relay.join(call.session);
    } catch {
      return;
    }
    const signal = relay.open(call.session);
    let pipe: BytePipe = signal;
    if (call.mode === "direct") {
      try {
        pipe = await (this.options.answerDirect ?? answerDirectWeb)(signal, this.options.iceServers);
      } catch {
        signal.close();
        return;
      }
    }
    let channel: WebSecureChannel;
    try {
      channel = await respondWeb(pipe, this.options.key, { v: 1, name: this.options.name() } satisfies Hello, call.mode === "direct" ? DIRECT_HANDSHAKE_MS : RELAY_HANDSHAKE_MS);
    } catch {
      return;
    }
    await this.answerTransfer(channel, trusted, call.mode === "direct" ? "direct" : "relay");
  }

  private async answerTransfer(channel: WebSecureChannel, trusted: TrustedComputer[], via: "relay" | "direct"): Promise<void> {
    // The key proved in the handshake must be one this browser paired with, whatever the call said.
    const fp = await webFingerprint(channel.peer.publicKey);
    const known = trusted.find((c) => c.fingerprint === fp && sameWebKey(c.publicKey, channel.peer.publicKey));
    if (!known || channel.peer.hello.purpose !== "transfer") {
      await channel.send({ t: "error", code: "not_paired", message: "This phone or browser isn't paired with this computer. Pair them first." }).catch(() => undefined);
      channel.close();
      return;
    }
    let first;
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
    try {
      const manifest = await readOfferWeb(channel, first);
      this.options.onIncoming(new WebIncoming(channel, first.session, manifest, via, this.options.onUpdate));
    } catch (error) {
      const message = error instanceof WebOfferError ? [error.message, ...error.problems.slice(0, 3)].join(" ").slice(0, 300) : "The offer couldn't be read.";
      await channel.send({ t: "error", code: "bad_offer", message }).catch(() => undefined);
      channel.close();
    }
  }
}
