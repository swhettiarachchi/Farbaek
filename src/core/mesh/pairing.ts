/**
 * Mesh pairing, version 2 (ADR 0194): the steps two devices follow after the
 * Noise handshake and before either shows a code. The Farbaek Agent
 * (src/agent-runtime/mesh/node.ts), the browser (./web/pair.ts) and the
 * Android app follow them byte for byte.
 *
 * Version 1 made the code from the handshake hash alone. The caller writes
 * the handshake's last message, so a device in the middle could try payloads
 * until both screens matched. Now each side adds a random value: the caller
 * commits to its value before it learns the answerer's, and the answerer
 * sends its value before it learns the caller's. Neither side can choose the
 * code, so a device in the middle matches the two screens with probability
 * one in a million per try.
 *
 * What bounds the tries is the person, not this file. A caller learns the
 * answerer's code before it reveals, so a device in the middle can quit any
 * try whose code it doesn't like, unseen by the person. So the answerer
 * keeps every pairing on screen until the person dismisses it, answers
 * "busy" meanwhile, and stops answering pairing calls altogether after
 * MAX_UNREVEALED_RUNS runs that ended after its nonce without a valid reveal
 * (src/agent-runtime/mesh/node.ts). That leaves a handful of tries per
 * visible window, each needing the person. Both devices must follow version 2
 * for any of this to hold: a device in the middle can pair an updated device
 * with one that hasn't updated by searching offline on the older leg.
 *
 *   caller   -> { t: "pair-commit", commit: hex(SHA-256("farbaek-pair-commit/2" || nC)) }
 *   answerer -> { t: "pair-nonce",  nonce: hex(nA) }
 *   caller   -> { t: "pair-reveal", nonce: hex(nC) }
 *   code = first 4 bytes of HMAC-SHA256(key = h, "farbaek-pair-code/2" || nC || nA), big-endian, mod 1,000,000
 *
 * The caller is the Noise initiator, always. The hash and HMAC come from each
 * platform (node:crypto on the agent, Web Crypto in the browser), so this
 * file holds only the order of the steps and their checks.
 */
import { HANDSHAKE_TIMEOUT_MS, type Hello, type MeshErrorCode, type MeshMessage } from "./protocol";

/** Sent in every hello. A peer that doesn't send at least this can't pair. */
export const PAIRING_VERSION = 2;
export const PAIR_COMMIT_LABEL = "farbaek-pair-commit/2";
export const PAIR_CODE_LABEL = "farbaek-pair-code/2";
/** The size of each side's random value. */
export const PAIR_NONCE_BYTES = 32;

/** Out of order, repeated, malformed, a reveal that doesn't match its commit, or a connection closed partway. */
export const PAIRING_STEPS_FAILED = "The other device didn't follow the pairing steps. Nothing was paired.";
/** The three steps took longer than allowed. */
export const PAIRING_TIMED_OUT = "The other device took too long to answer. Try again.";
/** How long the three steps may take through Farbaek's relay, where each message is a round trip through the server. Nearby, HANDSHAKE_TIMEOUT_MS. */
export const PAIRING_STEPS_RELAY_MS = 30_000;
/**
 * Runs an answerer allows that end after it sent its nonce without a valid
 * reveal: a caller that saw the code and quit. After this many it stops
 * answering pairing calls until the person turns visibility off and on.
 */
export const MAX_UNREVEALED_RUNS = 2;
/** What this device shows when the other one is too old to pair. */
export const pairingRefused = (peerName: string) => `Update Farbaek on ${peerName} to pair: pairing changed to keep it safe.`;
/** What an older device is told, so it shows why on its own screen. */
export const PAIRING_REFUSED_THERE = "Update Farbaek on this device to pair: pairing changed to keep it safe.";

/** Whether this hello's device follows these steps. */
export function canPairWith(hello: Hello): boolean {
  return typeof hello.pairing === "number" && hello.pairing >= PAIRING_VERSION;
}

export class PairingError extends Error {
  constructor(
    message: string,
    /** Set when the other device answered with an error of its own, such as `busy`. */
    readonly peerCode: MeshErrorCode | null = null,
    /** The answerer had sent its nonce, so the caller could know the code, and no valid reveal came. */
    readonly afterNonce = false,
  ) {
    super(message);
    this.name = "PairingError";
  }
}

/** The part of a secure channel the steps use: the agent's SecureChannel and the browser's WebSecureChannel both fit. */
export interface PairingChannel {
  send(message: MeshMessage): Promise<void>;
  receive(timeoutMs?: number): Promise<{ message: MeshMessage }>;
}

/** The platform's hashing for the steps. */
export interface PairingCrypto {
  /** PAIR_NONCE_BYTES random bytes. */
  random(): Uint8Array;
  /** Lowercase hex of SHA-256(PAIR_COMMIT_LABEL || callerNonce). */
  commit(callerNonce: Uint8Array): string | Promise<string>;
  /** The six-digit code. */
  code(handshakeHash: Uint8Array, callerNonce: Uint8Array, answererNonce: Uint8Array): string | Promise<string>;
}

const HEX64 = /^[0-9a-f]{64}$/;
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Runs this side's steps and returns the code. Throws PairingError, in
 * words, on anything out of order, repeated or malformed, on a reveal that
 * doesn't match its commit, or when the three steps take longer than
 * `timeoutMs`: the handshake timeout nearby, PAIRING_STEPS_RELAY_MS through
 * the relay. The caller closes the channel then.
 */
export async function runPairingSteps(role: "caller" | "answerer", channel: PairingChannel, handshakeHash: Uint8Array, crypto: PairingCrypto, timeoutMs = HANDSHAKE_TIMEOUT_MS): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  /** Set once the answerer's nonce is out: from then on, a run that ends without a valid reveal counts against the caller. */
  let nonceSent = false;
  const fail = (message: string, peerCode: MeshErrorCode | null = null) => new PairingError(message, peerCode, nonceSent);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(fail(PAIRING_TIMED_OUT)), timeoutMs);
  });

  const send = async (message: MeshMessage) => {
    try {
      await channel.send(message);
    } catch {
      throw fail(PAIRING_STEPS_FAILED);
    }
  };
  /** The next message, which must be `t`, carrying exactly 64 lowercase hex characters. */
  const expect = async (t: "pair-commit" | "pair-nonce" | "pair-reveal"): Promise<string> => {
    let message: MeshMessage;
    try {
      // A little past the deadline, so silence ends as a timeout, through `late`.
      message = (await channel.receive(Math.max(1, deadline - Date.now()) + 1_000)).message;
    } catch {
      // A malformed message, or a broken or tampered connection.
      throw fail(PAIRING_STEPS_FAILED);
    }
    if (message.t === "error") throw fail(message.message, message.code);
    let value: string | null = null;
    if (message.t === t) {
      if (message.t === "pair-commit") value = message.commit;
      else if (message.t === "pair-nonce" || message.t === "pair-reveal") value = message.nonce;
    }
    if (value === null || !HEX64.test(value)) throw fail(PAIRING_STEPS_FAILED);
    return value;
  };
  const fresh = () => {
    const value = crypto.random();
    if (value.length !== PAIR_NONCE_BYTES) throw fail(PAIRING_STEPS_FAILED);
    return value;
  };

  const steps = async (): Promise<string> => {
    if (role === "caller") {
      const callerNonce = fresh();
      await send({ t: "pair-commit", commit: await crypto.commit(callerNonce) });
      // Only after a well-formed nonce: revealing earlier would let the answerer choose its value knowing ours.
      const answererNonce = fromHex(await expect("pair-nonce"));
      await send({ t: "pair-reveal", nonce: toHex(callerNonce) });
      return crypto.code(handshakeHash, callerNonce, answererNonce);
    }
    const commit = await expect("pair-commit");
    // Made only now, after the caller can no longer change its value.
    const answererNonce = fresh();
    // Counted before the send completes: once it may have left, the caller may know the code.
    nonceSent = true;
    await send({ t: "pair-nonce", nonce: toHex(answererNonce) });
    const callerNonce = fromHex(await expect("pair-reveal"));
    if ((await crypto.commit(callerNonce)) !== commit) throw fail(PAIRING_STEPS_FAILED);
    return crypto.code(handshakeHash, callerNonce, answererNonce);
  };

  try {
    return await Promise.race([steps(), late]);
  } finally {
    clearTimeout(timer);
  }
}
