"use client";

/**
 * A person's chat preferences in this browser (stage 199): the model and answer style they last chose, whether Enter sends,
 * whether the sidebar is folded, and the language to answer in (stage 204: the language they write in by default). Conveniences only, kept in localStorage; every read survives storage being blocked, and the
 * server checks every choice again. Read with useSyncExternalStore, so the server's render and the first paint agree.
 */
import { useSyncExternalStore } from "react";
import { EFFORTS, type ChatEffort } from "@/core/chat/protocol";
import { cleanPreference, type AnswerScript } from "@/core/chat/language-names";

export interface ChatPrefs {
  model: string;
  effort: ChatEffort;
  enterSends: boolean;
  sidebarFolded: boolean;
  /** "auto" answers in the language the person writes in; otherwise a language code. */
  answerLanguage: string;
  /** For languages with their own script: that script (default) or English letters. */
  answerScript: AnswerScript;
  /** Check the live web when a question needs it (stage 205, stage 206). On unless switched off. */
  searchWeb: boolean;
  /** Use what the person asked Farbaek AI to remember, and save new things they ask for (stage 207). On unless switched off. */
  useMemory: boolean;
  /** Tell Farbaek AI about the project a chat is filed under: its files and tasks by name (stage 282). On unless switched off. */
  useProject: boolean;
}

const KEY = "fb-chat-prefs";
const DEFAULTS: ChatPrefs = { model: "auto", effort: "balanced", enterSends: true, sidebarFolded: false, answerLanguage: "auto", answerScript: "native", searchWeb: true, useMemory: true, useProject: true };
const listeners = new Set<() => void>();
let cache: ChatPrefs | null = null;
let raw: string | null = null;

function read(): ChatPrefs {
  let now: string | null = null;
  try {
    now = window.localStorage.getItem(KEY);
  } catch {
    now = null;
  }
  if (cache && now === raw) return cache;
  raw = now;
  try {
    const parsed = now ? (JSON.parse(now) as Partial<ChatPrefs>) : {};
    const language = cleanPreference({ answer: parsed.answerLanguage, script: parsed.answerScript });
    cache = {
      model: typeof parsed.model === "string" && /^(?:auto|[a-z0-9][a-z0-9.:_-]{0,79})$/.test(parsed.model) ? parsed.model : DEFAULTS.model,
      effort: (EFFORTS as readonly string[]).includes(parsed.effort as string) ? (parsed.effort as ChatEffort) : DEFAULTS.effort,
      enterSends: typeof parsed.enterSends === "boolean" ? parsed.enterSends : DEFAULTS.enterSends,
      sidebarFolded: typeof parsed.sidebarFolded === "boolean" ? parsed.sidebarFolded : DEFAULTS.sidebarFolded,
      answerLanguage: language.answer,
      answerScript: language.script,
      searchWeb: typeof parsed.searchWeb === "boolean" ? parsed.searchWeb : DEFAULTS.searchWeb,
      useMemory: typeof parsed.useMemory === "boolean" ? parsed.useMemory : DEFAULTS.useMemory,
      useProject: typeof parsed.useProject === "boolean" ? parsed.useProject : DEFAULTS.useProject,
    };
  } catch {
    cache = DEFAULTS;
  }
  return cache;
}

export function setChatPrefs(change: Partial<ChatPrefs>) {
  const next = { ...read(), ...change };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  cache = next;
  raw = JSON.stringify(next);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useChatPrefs(): ChatPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}

const noSubscribe = () => () => {};
/** True on a phone or tablet held by touch, where Enter adds a line and the keyboard's own button sends. */
export function useTouchFirst(): boolean {
  return useSyncExternalStore(noSubscribe, () => window.matchMedia("(pointer: coarse)").matches, () => false);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (l) => {
      const m = window.matchMedia("(prefers-reduced-motion: reduce)");
      m.addEventListener("change", l);
      return () => m.removeEventListener("change", l);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
