/**
 * What the main process and the hidden WebRTC window say to each other over
 * a MessagePort, one port per direct link (ADR 0095). Control messages are
 * plain objects; file bytes travel as Uint8Arrays, already Noise-encrypted.
 */
import type { Signal } from "@/agent-runtime/mesh/direct-signal";

export interface RtcOpen {
  role: "offer" | "answer";
  /** Farbaek's own STUN server, as stun:host:port. No TURN: the relay is the fallback, with consent. */
  iceServers: string[];
}

/** From the main process to the window. */
export type ToRtc = { t: "signal"; signal: Signal } | { t: "data"; bytes: Uint8Array } | { t: "close" };

/** From the window to the main process. */
export type FromRtc =
  | { t: "signal"; signal: Signal }
  | { t: "open" }
  | { t: "data"; bytes: Uint8Array }
  /** Bytes the data channel took, so the main process can send more. */
  | { t: "ack"; bytes: number }
  | { t: "failed"; reason: string }
  | { t: "closed" };

/** Bytes per data channel message: under Chromium's message size limit, and above the largest Noise frame. */
export const RTC_PIECE = 64 * 1024;
/** Bytes the main process sends before the window says they were taken. */
export const RTC_IN_FLIGHT = 8 * 1024 * 1024;
/** Bytes the data channel holds before the window stops handing it more. */
export const RTC_BUFFERED_HIGH = 4 * 1024 * 1024;
