/**
 * Pairing a browser with a computer through Farbaek (ADR 0096): the same
 * confirmation as nearby (src/agent-runtime/mesh/node.ts, PairingSession).
 * The browser is the caller. Before any code exists it checks the computer
 * follows pairing version 2 and runs the commit, nonce and reveal steps
 * (ADR 0194, ../pairing.ts): the code depends on the handshake and on a
 * random value from each side, so the server, in the middle of every call,
 * matches the two screens with probability one in a million per try, and
 * the computer answers one call per window the person opens. Each person
 * then confirms, and the devices trust each other only when both have.
 */
import { PAIRING_REFUSED_THERE, PAIRING_STEPS_FAILED, PAIRING_STEPS_RELAY_MS, PAIR_NONCE_BYTES, PairingError, canPairWith, pairingRefused, runPairingSteps, type PairingCrypto } from "@/core/mesh/pairing";
import { PAIRING_WINDOW_MS } from "@/core/mesh/protocol";
import { webFingerprint, webPairingCode, webPairingCommit } from "./noise";
import type { WebSecureChannel } from "./wire";

export type WebPairingState = "confirming" | "waiting" | "paired" | "declined" | "expired" | "failed";

export interface PairedComputer {
  name: string;
  fingerprint: string;
  publicKey: Uint8Array;
}

/** Pairing ended before there was a code: the computer is too old, busy, or didn't follow the steps. In words to show. */
export class WebPairingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebPairingError";
  }
}

/** The browser's hashing for the pairing steps (ADR 0194). */
const PAIRING_CRYPTO: PairingCrypto = {
  random: () => globalThis.crypto.getRandomValues(new Uint8Array(PAIR_NONCE_BYTES)),
  commit: webPairingCommit,
  code: webPairingCode,
};

export class WebPairing {
  state: WebPairingState = "confirming";
  message: string | null = null;
  private mine: boolean | null = null;
  private theirs: boolean | null = null;
  private readonly timer: ReturnType<typeof setTimeout>;

  private constructor(
    private readonly channel: WebSecureChannel,
    readonly code: string,
    readonly computer: PairedComputer,
    private readonly onUpdate: () => void,
    private readonly onPaired: (computer: PairedComputer) => Promise<void>,
  ) {
    this.timer = setTimeout(() => this.end("expired", "The code wasn't confirmed within two minutes. Start again."), PAIRING_WINDOW_MS);
    void this.listen();
  }

  /**
   * Runs the pairing steps as the caller and resolves once the code exists.
   * Throws WebPairingError, and closes the channel, when the computer is too
   * old to pair, is busy, takes too long, or doesn't follow the steps.
   * `stepsMs`: the steps cross Farbaek's relay, a round trip through the server each.
   */
  static async start(channel: WebSecureChannel, onUpdate: () => void, onPaired: (computer: PairedComputer) => Promise<void>, stepsMs = PAIRING_STEPS_RELAY_MS): Promise<WebPairing> {
    const computer = { name: channel.peer.hello.name, fingerprint: await webFingerprint(channel.peer.publicKey), publicKey: channel.peer.publicKey };
    if (!canPairWith(channel.peer.hello)) {
      // An older version: no steps, no code and no fallback. It's told why, in words it shows.
      await channel.send({ t: "error", code: "protocol", message: PAIRING_REFUSED_THERE }).catch(() => undefined);
      channel.close();
      throw new WebPairingError(pairingRefused(computer.name));
    }
    let code: string;
    try {
      code = await runPairingSteps("caller", channel, channel.handshakeHash, PAIRING_CRYPTO, stepsMs);
    } catch (error) {
      channel.close();
      if (error instanceof PairingError && error.peerCode === "busy") throw new WebPairingError(`${computer.name} can't pair right now. On it, dismiss any pairing on screen, then choose Pair a phone or browser again.`);
      throw new WebPairingError(error instanceof PairingError ? error.message : PAIRING_STEPS_FAILED);
    }
    return new WebPairing(channel, code, computer, onUpdate, onPaired);
  }

  get active(): boolean {
    return this.state === "confirming" || this.state === "waiting";
  }

  private async listen(): Promise<void> {
    try {
      const { message } = await this.channel.receive(PAIRING_WINDOW_MS);
      if (message.t === "pair-confirm") {
        this.theirs = message.ok;
        await this.settle();
      } else if (message.t === "error") {
        this.end("failed", message.code === "busy" ? `${this.computer.name} can't pair right now. On it, dismiss any pairing on screen, then choose Pair a phone or browser again.` : message.message);
      } else {
        // A repeated or extra pairing step, or anything else out of order.
        this.end("failed", PAIRING_STEPS_FAILED);
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
    if (this.mine === false) return this.end("declined", "You said the codes don't match, so the devices weren't paired.");
    if (this.theirs === false) return this.end("declined", `${this.computer.name} said the codes don't match, so the devices weren't paired.`);
    if (this.mine && this.theirs) {
      await this.onPaired(this.computer);
      return this.end("paired", `Paired with ${this.computer.name}.`);
    }
    if (this.mine) {
      this.state = "waiting";
      this.message = `Waiting for ${this.computer.name} to confirm the same code.`;
      this.onUpdate();
    }
  }

  end(state: WebPairingState, message: string): void {
    if (!this.active) return;
    clearTimeout(this.timer);
    this.state = state;
    this.message = message;
    setTimeout(() => this.channel.close(), 250);
    this.onUpdate();
  }
}
