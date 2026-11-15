"use client";

/**
 * The drafting assistant's conversation and settings (stage 195). It sits outside the plan editor, which starts afresh on every save, so
 * the conversation, a change waiting to be applied and the surveyor's choices carry on across saves.
 *
 * Settings stay on this device: the voice mode (push to talk or live talk), the language, spoken replies, and whether to check the words
 * before sending. They're conveniences, so a private window without storage simply starts from the defaults.
 */
import { createContext, useCallback, useContext, useMemo, useReducer, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Answer } from "@/core/survey/assistant/answer";
import type { Patch } from "@/core/survey/assistant/apply";
import type { AssistLanguage } from "@/core/survey/assistant/languages";
import type { AssistQuestion, PlanOp } from "@/core/survey/assistant/ops";
import { initialSession, sessionReducer, type SessionEvent, type SessionState, type VoiceMode } from "@/core/survey/assistant/session";

export type Outcome = "suggested" | "applied" | "discarded" | "answered" | "asked" | "handed_off" | "failed" | "done" | "reverted";

export interface Turn {
  id: string;
  at: number;
  words: string;
  inputMethod: "voice" | "typed";
  lang: AssistLanguage;
  /** Read by the local rules, or by the model. */
  engine: "reader" | "model";
  /** The assistant's own words (never figures). */
  say: string;
  ops: PlanOp[];
  dropped: { what: string; why: string }[];
  question: AssistQuestion | null;
  answers: Answer[];
  outcome: Outcome;
  /** What applying it changed, to take it back later. */
  patch: Patch | null;
  /** The turn's record on the server, when it went to the model. */
  serverId: string | null;
  message: string;
  /** Its card is showing, waiting for the surveyor. */
  open: boolean;
}

export interface AssistantSettings {
  mode: VoiceMode;
  lang: AssistLanguage;
  speak: boolean;
  review: boolean;
  /** The first-use note on who turns speech into text has been read. */
  privacyNoted: boolean;
  /** Live talk's pause before an instruction ends, in milliseconds. */
  pauseMs: number;
}

const DEFAULTS: AssistantSettings = { mode: "push", lang: "en", speak: false, review: false, privacyNoted: false, pauseMs: 1200 };
const KEY = "farbaek.survey.assistant";

// A tiny store over localStorage, so the settings read the same in every component and never mismatch the server's render.
let cachedRaw: string | null | undefined;
let cached: AssistantSettings = DEFAULTS;
const listeners = new Set<() => void>();
function readSettings(): AssistantSettings {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const v = raw ? (JSON.parse(raw) as Partial<AssistantSettings>) : {};
      cached = {
        mode: v.mode === "live" ? "live" : "push",
        lang: v.lang === "si" || v.lang === "ta" ? v.lang : "en",
        speak: v.speak === true,
        review: v.review === true,
        privacyNoted: v.privacyNoted === true,
        pauseMs: typeof v.pauseMs === "number" && v.pauseMs >= 600 && v.pauseMs <= 4000 ? v.pauseMs : DEFAULTS.pauseMs,
      };
    } catch {
      cached = DEFAULTS;
    }
  }
  return cached;
}
function writeSettings(next: AssistantSettings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage off: the choice lasts this visit.
    cachedRaw = JSON.stringify(next);
    cached = next;
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

interface AssistantValue {
  settings: AssistantSettings;
  setSettings(change: Partial<AssistantSettings>): void;
  session: SessionState;
  dispatch(e: SessionEvent): void;
  turns: Turn[];
  addTurn(t: Turn): void;
  updateTurn(id: string, change: Partial<Turn>): void;
}

const Ctx = createContext<AssistantValue | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const settings = useSyncExternalStore(subscribe, readSettings, () => DEFAULTS);
  const [session, dispatch] = useReducer(sessionReducer, settings.mode, initialSession);
  const [turns, setTurns] = useState<Turn[]>([]);
  const setSettings = useCallback((change: Partial<AssistantSettings>) => writeSettings({ ...readSettings(), ...change }), []);
  const addTurn = useCallback((t: Turn) => setTurns((all) => [...all.slice(-49), t]), []);
  const updateTurn = useCallback((id: string, change: Partial<Turn>) => setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...change } : t))), []);
  const value = useMemo(() => ({ settings, setSettings, session, dispatch, turns, addTurn, updateTurn }), [settings, setSettings, session, turns, addTurn, updateTurn]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The assistant's state, or null outside a provider (the editor then shows no assistant). */
export function useAssistant(): AssistantValue | null {
  return useContext(Ctx);
}
