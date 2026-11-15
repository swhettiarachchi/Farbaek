/**
 * The drafting assistant's conversation as states (stage 195): one pure
 * reducer, so every path (push to talk, live talk, typing) is tested without
 * a browser. Each state has words and an icon on screen; motion only while a
 * state is live.
 *
 * Push to talk: a hold or a tap records one instruction; release (or the
 * second tap) sends it. Live talk: one tap opens a conversation; each pause
 * ends an instruction, which is sent after a short countdown; the microphone
 * listens again after each answer, until the surveyor says "stop listening",
 * taps, or a minute passes in silence.
 *
 * The recognised words are held for review (state "heard") when the surveyor
 * asked for that, or when the numbers in them could be read two ways ("2 to
 * 4", "for", "to").
 */

export type VoiceMode = "push" | "live";
export type Phase = "idle" | "listening" | "heard" | "countdown" | "working" | "suggested" | "asking" | "answered" | "applied" | "handoff" | "failed";

export interface SessionState {
  phase: Phase;
  mode: VoiceMode;
  /** A live conversation is open (live talk only). */
  live: boolean;
  /** What's being heard right now. */
  interim: string;
  /** The instruction line's words. */
  text: string;
  /** Failed turns in a row: after three, typing is offered first. */
  failures: number;
  /** The message for a failed turn. */
  message: string;
}

export type SessionEvent =
  | { type: "mode"; mode: VoiceMode }
  | { type: "listen"; live: boolean }
  | { type: "interim"; text: string }
  | { type: "final"; text: string; review: boolean }
  | { type: "no_speech" }
  | { type: "edit"; text: string }
  | { type: "send" }
  | { type: "countdown_done" }
  | { type: "result"; phase: "suggested" | "asking" | "answered" | "applied" | "handoff" }
  | { type: "failed"; message: string }
  | { type: "decided" }
  | { type: "cancel" }
  | { type: "stop_live" };

export const initialSession = (mode: VoiceMode = "push"): SessionState => ({ phase: "idle", mode, live: false, interim: "", text: "", failures: 0, message: "" });

/** Whether a number in the words could be read two ways, so the words should be checked before sending. */
export function ambiguousNumbers(text: string): boolean {
  return /\d\s*(?:to|too|for)\s*\d|\b(?:to|too|for|won)\s+\d|\d\s+\d{3}\b/i.test(text);
}

export function sessionReducer(s: SessionState, e: SessionEvent): SessionState {
  switch (e.type) {
    case "mode":
      return s.phase === "listening" || s.phase === "working" ? s : { ...initialSession(e.mode), text: s.text };
    case "listen":
      // Pressing the microphone interrupts whatever was happening: a reply being spoken, a turn in flight.
      return { ...s, phase: "listening", live: e.live, mode: e.live ? "live" : "push", interim: "", message: "" };
    case "interim":
      return s.phase === "listening" ? { ...s, interim: e.text } : s;
    case "final": {
      const text = e.text.trim();
      if (!text) return { ...s, phase: s.live ? "listening" : "idle", interim: "" };
      if (e.review || ambiguousNumbers(text)) return { ...s, phase: "heard", interim: "", text };
      return { ...s, phase: s.live ? "countdown" : "working", interim: "", text };
    }
    case "no_speech":
      return { ...s, phase: s.live ? "listening" : "idle", interim: "" };
    case "edit":
      return s.phase === "working" ? s : { ...s, text: e.text, phase: s.phase === "listening" ? s.phase : s.phase === "idle" || s.phase === "heard" ? s.phase : "idle" };
    case "send":
      return s.text.trim() ? { ...s, phase: "working", interim: "" } : s;
    case "countdown_done":
      return s.phase === "countdown" ? { ...s, phase: "working" } : s;
    case "result":
      return s.phase === "working" ? { ...s, phase: e.phase, failures: 0, text: e.phase === "asking" ? "" : s.text } : s;
    case "failed":
      return { ...s, phase: "failed", failures: s.failures + 1, message: e.message };
    case "decided":
      // After an Apply or Discard the line clears. A live conversation stays open, but the state says listening only once the
      // microphone has really started again ("listen"), never before.
      return { ...s, phase: "idle", text: "", interim: "" };
    case "cancel":
      return { ...s, phase: "idle", live: false, interim: "" };
    case "stop_live":
      return { ...s, live: false, phase: s.phase === "listening" || s.phase === "countdown" ? "idle" : s.phase };
  }
}
