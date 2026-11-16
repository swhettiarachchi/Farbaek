"use client";

/**
 * The browser's own speech recogniser, for the drafting assistant (stage 195, ADR 0210). The page never gets the audio, only text:
 * Chrome sends the sound to Google, Edge to Microsoft, Safari to Apple's dictation, Firefox hears on the device.
 *
 * - Push to talk keeps listening while the button is held (or until the second tap), then stops and hands over the words.
 * - Live talk listens until a pause; the caller ends the instruction with its own silence timer, so a surveyor pausing to read the next
 *   digits from a field book isn't cut off by the recogniser's shorter one.
 * - Chrome on Android hears one phrase at a time whatever is asked: when it stops early while the surveyor still wants it, it starts again
 *   and the words carry on in the same instruction.
 *
 * Each listen is a session with its own number. A recogniser from an earlier session is cut off from its callbacks before it's stopped,
 * so its late events can neither restart it nor send its words. A real error (a blocked microphone, no connection) ends the session
 * without sending anything, and it never restarts by itself.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

interface Alternative {
  transcript: string;
  confidence: number;
}
interface ResultLike {
  isFinal: boolean;
  length: number;
  [i: number]: Alternative;
}
interface ResultEvent {
  resultIndex: number;
  results: { length: number; [i: number]: ResultLike };
}
interface Recogniser {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: ResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart?: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecogniserClass = new () => Recogniser;

export function recogniserClass(): RecogniserClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecogniserClass; webkitSpeechRecognition?: RecogniserClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type SpeechStatics = {
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
};

export type OnDeviceStatus = { state: "available" | "downloadable" | "downloading"; tag: string } | { state: "unavailable" };

/**
 * Whether this browser can hear a language on the computer, for the first of the tags it can (Chrome 139 and later, on a computer).
 * Anything else, including a browser without the question, is "unavailable".
 */
export async function onDeviceStatus(tags: readonly string[]): Promise<OnDeviceStatus> {
  const C = recogniserClass() as (RecogniserClass & SpeechStatics) | null;
  if (!C || typeof C.available !== "function") return { state: "unavailable" };
  let later: OnDeviceStatus | null = null;
  for (const tag of tags) {
    try {
      const s = await C.available({ langs: [tag], processLocally: true });
      if (s === "available") return { state: "available", tag };
      if ((s === "downloadable" || s === "downloading") && !later) later = { state: s, tag };
    } catch {
      // This browser can't be asked about this tag.
    }
  }
  return later ?? { state: "unavailable" };
}

/** Asks the browser to download a language for hearing on the computer. It needs a click (user activation); false if it didn't. */
export async function installOnDevice(tag: string): Promise<boolean> {
  const C = recogniserClass() as (RecogniserClass & SpeechStatics) | null;
  if (!C || typeof C.install !== "function") return false;
  try {
    return (await C.install({ langs: [tag], processLocally: true })) === true;
  } catch {
    return false;
  }
}

/** Set once a browser refuses the survey-word hints, so later listens go without them. */
let phrasesRefused = false;

/** What a recogniser's error means for the surveyor, and what to do; null when it isn't one to show (a cancel, silence). */
export function speechErrorMessage(code: string, langName: string): string | null {
  switch (code) {
    case "phrases-not-supported":
      return "This browser didn't take the survey-word hints, so they're off now. Try again.";
    case "not-allowed":
    case "service-not-allowed":
      return "The microphone is blocked for Farbaek in this browser. Allow it in the site settings (the icon left of the address), or type the instruction.";
    case "audio-capture":
      return "No microphone was found. Plug one in or choose it in the system settings, or type the instruction.";
    case "network":
      return `Hearing ${langName} needs a connection in this browser, and it was lost. Try again, or type the instruction.`;
    case "language-not-supported":
      return `This browser can't hear ${langName}. Type it, or choose another language.`;
    case "aborted":
    case "no-speech":
      return null;
    default:
      return "The browser's speech recogniser stopped. Try again, or type the instruction.";
  }
}

export interface ListenOptions {
  lang: string;
  /** Keep going after a pause (push to talk while held; live talk until the caller's own pause timer). */
  continuous: boolean;
  /** Hear on the computer: the sound never leaves it. Only where the language is downloaded (see onDeviceStatus). */
  processLocally?: boolean;
  /** Words to listen for, on the computer only (Chrome biases only there). */
  phrases?: readonly string[];
  onWords(text: string): void;
  onFinal(text: string): void;
  onError(code: string): void;
}

const noSubscribe = () => () => {};
/** Restarts in a row with nothing heard before an instruction ends anyway (Chrome on Android ends each phrase by itself). */
const MAX_QUIET_RESTARTS = 4;

/** Cuts a recogniser off from its callbacks, then stops it, so nothing it does later reaches the page. */
function detach(r: Recogniser | null) {
  if (!r) return;
  r.onresult = null;
  r.onerror = null;
  r.onend = null;
  try {
    r.abort();
  } catch {
    // Already stopped.
  }
}

export function useSpeech() {
  // Known only in the browser: null on the server's render.
  const supported = useSyncExternalStore(noSubscribe, () => recogniserClass() !== null, () => null);
  const rec = useRef<Recogniser | null>(null);
  const beginRef = useRef<() => void>(() => {});
  const opts = useRef<ListenOptions | null>(null);
  const session = useRef(0);
  const wanted = useRef(false);
  const live = useRef(false);
  const heard = useRef("");
  const quickEnds = useRef(0);
  const [listening, setListening] = useState(false);

  /** Ends the current session: no callback of its recogniser runs after this. */
  const end = useCallback(() => {
    session.current++;
    wanted.current = false;
    live.current = false;
    const r = rec.current;
    rec.current = null;
    detach(r);
    setListening(false);
  }, []);

  // Leaving the page drops what was being heard: nothing is sent after the surveyor has gone.
  useEffect(() => end, [end]);

  const begin = useCallback(() => {
    const C = recogniserClass();
    const o = opts.current;
    if (!C || !o) return;
    const id = session.current;
    const r = new C();
    r.lang = o.lang;
    r.continuous = o.continuous;
    r.interimResults = true;
    r.maxAlternatives = 1;
    if (o.processLocally) {
      const local = r as Recogniser & { processLocally?: boolean; phrases?: unknown };
      local.processLocally = true;
      const Phrase = (window as unknown as { SpeechRecognitionPhrase?: new (phrase: string, boost: number) => unknown }).SpeechRecognitionPhrase;
      if (Phrase && o.phrases?.length && !phrasesRefused) {
        try {
          local.phrases = o.phrases.map((p) => new Phrase(p, 4));
        } catch {
          // A browser without the hints just listens without them.
        }
      }
    }
    const mine = () => session.current === id && rec.current === r;
    // Words already final from an earlier phrase of the same instruction stay at the front.
    const before = heard.current;
    let finals = "";
    r.onresult = (e) => {
      if (!mine()) return;
      quickEnds.current = 0;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) finals += text;
        else interim += text;
      }
      heard.current = `${before} ${finals}`.replace(/\s+/g, " ").trim();
      o.onWords(`${heard.current} ${interim}`.replace(/\s+/g, " ").trim());
    };
    r.onerror = (e) => {
      if (!mine() || e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "phrases-not-supported") phrasesRefused = true;
      // A real error ends the instruction: what was heard isn't sent, and it doesn't start again by itself.
      end();
      o.onError(e.error);
    };
    r.onend = () => {
      if (!mine()) return;
      // A recogniser that keeps ending with nothing heard isn't started again and again: after a few, the instruction ends.
      if (wanted.current && ++quickEnds.current > MAX_QUIET_RESTARTS) wanted.current = false;
      if (wanted.current) {
        // Ended on its own (Android hears one phrase at a time): carry on with the same instruction.
        try {
          beginRef.current();
          return;
        } catch {
          wanted.current = false;
        }
      }
      const words = heard.current;
      end();
      o.onFinal(words);
    };
    rec.current = r;
    r.start();
  }, [end]);
  useEffect(() => {
    beginRef.current = begin;
  }, [begin]);

  /** Starts listening; any listening before is dropped, unsent. */
  const start = useCallback(
    (o: ListenOptions) => {
      end();
      opts.current = o;
      heard.current = "";
      quickEnds.current = 0;
      wanted.current = true;
      live.current = true;
      setListening(true);
      try {
        begin();
      } catch {
        end();
        o.onError("start-failed");
      }
    },
    [begin, end],
  );

  /** Stops and hands over the words heard (onFinal). Does nothing once the session has ended or been dropped. */
  const stop = useCallback(() => {
    if (!live.current) return;
    wanted.current = false;
    if (rec.current) rec.current.stop();
    else {
      const words = heard.current;
      const o = opts.current;
      end();
      o?.onFinal(words);
    }
  }, [end]);

  /** Stops and drops the words. */
  const abort = end;

  return { supported, listening, start, stop, abort };
}
