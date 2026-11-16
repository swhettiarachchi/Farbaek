"use client";

/**
 * The microphone's level, and spoken replies, for the drafting assistant (stage 195).
 *
 * The level is real: measured from the microphone with the Web Audio API, on computers only. On phones a second microphone stream can
 * clash with the speech recogniser, so there the growing caption is the live signal instead.
 *
 * Spoken replies use the device's own voices only (localService): a network voice would send plan text to Google or Microsoft. Each
 * sentence is its own utterance (Chrome cuts long ones off), speech never runs while listening, and where the device has no voice for
 * the language the reply stays text. iOS 27.0 to 27.2 mutes an open microphone once speech starts (WebKit bug 218815), so spoken replies
 * are off there.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AssistLanguage } from "@/core/survey/assistant/languages";

const noSubscribe = () => () => {};

/** Whether this is a computer with a fine pointer, where a level meter can open its own stream safely. */
const finePointer = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches === true;

/** The microphone's level from 0 to 1 while `active`, about twenty times a second; 0 on phones or without permission. */
export function useMicLevel(active: boolean): number {
  const [level, setLevel] = useState(0);
  const fine = useSyncExternalStore(noSubscribe, finePointer, () => false);
  useEffect(() => {
    if (!active || !fine || !navigator.mediaDevices?.getUserMedia) return;
    let stop = false;
    let raf = 0;
    let last = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    void navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (stop) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const tick = (t: number) => {
          if (stop) return;
          if (t - last > 50) {
            last = t;
            analyser.getFloatTimeDomainData(buf);
            let sum = 0;
            for (const v of buf) sum += v * v;
            // Speech sits around 0.02 to 0.2 RMS; a gentle curve keeps quiet speech visible.
            setLevel(Math.min(1, Math.sqrt(Math.sqrt(sum / buf.length)) * 1.6));
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      })
      .catch(() => {
        // No meter without permission; the recogniser asks for its own.
      });
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setLevel(0);
    };
  }, [active, fine]);
  return level;
}

/** iOS 27.0 to 27.2, where speaking mutes an open microphone. */
export const iosMutesMicrophone = (ua: string) => /(?:iPhone|iPad|iPod).* OS 27_[0-2](?!\d)/.test(ua);

const voicesNow = (): SpeechSynthesisVoice[] => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis.getVoices() : []);

/** The device's own voice for a language, or null. */
export function localVoice(voices: readonly SpeechSynthesisVoice[], lang: AssistLanguage): SpeechSynthesisVoice | null {
  const own = voices.filter((v) => v.localService && v.lang.toLowerCase().startsWith(lang));
  return own.find((v) => /-(LK|IN)$/i.test(v.lang)) ?? own.find((v) => /-GB$/i.test(v.lang)) ?? own[0] ?? null;
}

export function useVoiceReply() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const queue = useRef<SpeechSynthesisUtterance[]>([]);
  const blocked = useSyncExternalStore(noSubscribe, () => iosMutesMicrophone(navigator.userAgent), () => false);
  const supported = useSyncExternalStore(noSubscribe, () => "speechSynthesis" in window, () => false);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(voicesNow());
    // Chromium lists voices only after this event.
    synth.addEventListener("voiceschanged", load);
    const t = window.setTimeout(load, 0);
    return () => {
      synth.removeEventListener("voiceschanged", load);
      window.clearTimeout(t);
      // Emptied first, so the cancelled utterances' error events don't call back into a page that's gone.
      queue.current = [];
      synth.cancel();
    };
  }, [supported]);

  /** Why replies can't be spoken in this language here, or null when they can. */
  const unavailable = useCallback(
    (lang: AssistLanguage): string | null => {
      if (!supported) return "This browser can't speak replies; they're shown as text.";
      if (blocked) return "Spoken replies are off on iOS 27.0 to 27.2, where speaking stops the microphone. Replies are shown as text.";
      if (!localVoice(voices, lang)) return lang === "si" ? "No Sinhala voice on this device: replies are shown as text." : lang === "ta" ? "No Tamil voice on this device: replies are shown as text." : "No English voice on this device: replies are shown as text.";
      return null;
    },
    [supported, blocked, voices],
  );

  const cancel = useCallback(() => {
    queue.current = [];
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  /** Says the sentences one by one in the language's local voice; anything already being said stops first. */
  const speak = useCallback(
    (sentences: readonly string[], lang: AssistLanguage, onDone?: () => void) => {
      cancel();
      const voice = localVoice(voices, lang);
      if (!voice || blocked || sentences.length === 0) {
        onDone?.();
        return;
      }
      const synth = window.speechSynthesis;
      const list = sentences.map((s) => {
        const u = new SpeechSynthesisUtterance(s);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = 1;
        return u;
      });
      queue.current = list;
      list.forEach((u, i) => {
        u.onend = () => {
          if (i === list.length - 1 && queue.current === list) {
            setSpeaking(false);
            onDone?.();
          }
        };
        u.onerror = () => {
          if (queue.current === list) {
            setSpeaking(false);
            onDone?.();
          }
        };
        synth.speak(u);
      });
      setSpeaking(true);
    },
    [cancel, voices, blocked],
  );

  return { speak, cancel, speaking, unavailable };
}
