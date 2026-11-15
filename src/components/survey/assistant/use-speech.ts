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

/** What a recogniser's error means for the surveyor, and what to do; null when it isn't one to show (a cancel, silence). */
export function speechErrorMessage(code: string, langName: string): string | null {
  switch (code) {
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
  onWords(text: string): void;
  onFinal(text: string): void;
  onError(code: string): void;
}

const noSubscribe = () => () => {};

export function useSpeech() {
  // Known only in the browser: null on the server's render.
  const supported = useSyncExternalStore(noSubscribe, () => recogniserClass() !== null, () => null);
  const rec = useRef<Recogniser | null>(null);
  const beginRef = useRef<() => void>(() => {});
  const opts = useRef<ListenOptions | null>(null);
  const wanted = useRef(false);
  const discard = useRef(false);
  const heard = useRef("");
  const [listening, setListening] = useState(false);

  useEffect(
    () => () => {
      wanted.current = false;
      rec.current?.abort();
    },
    [],
  );

  const begin = useCallback(() => {
    const C = recogniserClass();
    const o = opts.current;
    if (!C || !o) return;
    const r = new C();
    r.lang = o.lang;
    r.continuous = o.continuous;
    r.interimResults = true;
    r.maxAlternatives = 1;
    // Words already final from an earlier phrase of the same instruction stay at the front.
    const before = heard.current;
    let finals = "";
    r.onresult = (e) => {
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
      if (e.error !== "no-speech" && e.error !== "aborted") {
        wanted.current = false;
        o.onError(e.error);
      }
    };
    r.onend = () => {
      if (wanted.current) {
        // Ended on its own (Android hears one phrase at a time): carry on with the same instruction.
        try {
          beginRef.current();
          return;
        } catch {
          wanted.current = false;
        }
      }
      rec.current = null;
      setListening(false);
      if (!discard.current) o.onFinal(heard.current);
    };
    rec.current = r;
    r.start();
  }, []);
  useEffect(() => {
    beginRef.current = begin;
  }, [begin]);

  /** Starts listening; any listening before is dropped. */
  const start = useCallback(
    (o: ListenOptions) => {
      rec.current?.abort();
      opts.current = o;
      heard.current = "";
      discard.current = false;
      wanted.current = true;
      setListening(true);
      try {
        begin();
      } catch {
        wanted.current = false;
        setListening(false);
        o.onError("start-failed");
      }
    },
    [begin],
  );

  /** Stops and hands over the words heard (onFinal). */
  const stop = useCallback(() => {
    wanted.current = false;
    if (rec.current) rec.current.stop();
    else if (listening && opts.current) {
      setListening(false);
      opts.current.onFinal(heard.current);
    }
  }, [listening]);

  /** Stops and drops the words. */
  const abort = useCallback(() => {
    wanted.current = false;
    discard.current = true;
    rec.current?.abort();
    rec.current = null;
    setListening(false);
  }, []);

  return { supported, listening, start, stop, abort };
}
