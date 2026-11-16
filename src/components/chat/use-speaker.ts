"use client";

/**
 * Reads an answer aloud with the browser's own speech (stage 199). Any voice for the language will do, the device's own first: Android
 * Chrome often has only network voices, and an answer is text the person already sees on screen. Sentences are queued one by one, so
 * a long answer doesn't hit the length some browsers cut off at.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/** The voice for a language: the device's own if it has one, otherwise any. */
export function pickVoice<V extends Pick<SpeechSynthesisVoice, "lang" | "localService" | "default">>(voices: readonly V[], lang: string): V | null {
  const base = lang.toLowerCase().split("-")[0]!;
  const matching = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(base));
  return matching.find((v) => v.localService && v.lang.toLowerCase() === lang.toLowerCase()) ?? matching.find((v) => v.localService) ?? matching.find((v) => v.default) ?? matching[0] ?? null;
}

export function useSpeaker() {
  const supported = useSyncExternalStore(noSubscribe, () => "speechSynthesis" in window, () => false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const queue = useRef<SpeechSynthesisUtterance[]>([]);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(synth.getVoices());
    // Chromium lists voices only after this event.
    synth.addEventListener("voiceschanged", load);
    const t = window.setTimeout(load, 0);
    return () => {
      synth.removeEventListener("voiceschanged", load);
      window.clearTimeout(t);
      queue.current = [];
      synth.cancel();
    };
  }, [supported]);

  /** Why it can't read aloud here, or null. */
  const unavailable = useCallback((): string | null => {
    if (!supported) return "This browser can't read answers aloud.";
    if (voices.length > 0 && !pickVoice(voices, navigator.language || "en-US")) return "This device has no voice for this language.";
    return null;
  }, [supported, voices]);

  const cancel = useCallback(() => {
    queue.current = [];
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  const speak = useCallback(
    (sentences: readonly string[], onDone: () => void) => {
      cancel();
      if (!supported || sentences.length === 0) {
        onDone();
        return;
      }
      const synth = window.speechSynthesis;
      const voice = pickVoice(voices, navigator.language || "en-US");
      const list = sentences.map((s) => {
        const u = new SpeechSynthesisUtterance(s);
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        }
        return u;
      });
      queue.current = list;
      list.forEach((u, i) => {
        const end = () => {
          if (queue.current === list && i === list.length - 1) onDone();
        };
        u.onend = end;
        u.onerror = () => {
          if (queue.current === list) onDone();
        };
        synth.speak(u);
      });
    },
    [cancel, supported, voices],
  );

  return { speak, cancel, unavailable };
}
