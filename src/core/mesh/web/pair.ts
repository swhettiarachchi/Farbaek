/**
 * Pairing a browser with a computer through Farbaek (ADR 0096): the same
 * confirmation as nearby (src/agent-runtime/mesh/node.ts, PairingSession).
 * Both screens show a six-digit code from the Noise handshake hash; they
 * match only if no one sat in the middle, the server included. Each person
 * confirms, and the devices trust each other only when both have.
 */
import { PAIRING_WINDOW_MS } from "@/core/mesh/protocol";
import { webFingerprint, webPairingCode } from "./noise";
import type { WebSecureChannel } from "./wire";

export type WebPairingState = "confirming" | "waiting" | "paired" | "declined" | "expired" | "failed";

export interface PairedComputer {
  name: string;
  fingerprint: string;
  publicKey: Uint8Array;
}

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

  static async start(channel: WebSecureChannel, onUpdate: () => void, onPaired: (computer: PairedComputer) => Promise<void>): Promise<WebPairing> {
    const code = await webPairingCode(channel.handshakeHash);
    const computer = { name: channel.peer.hello.name, fingerprint: await webFingerprint(channel.peer.publicKey), publicKey: channel.peer.publicKey };
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
        this.end("failed", message.code === "busy" ? `${this.computer.name} is pairing with another device. Try again in a moment.` : message.message);
      } else {
        this.end("failed", "The computer answered out of order.");
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
