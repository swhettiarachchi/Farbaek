/**
 * The languages the drafting assistant hears and answers in (stage 195, ADR
 * 0210), and which browser can hear which. Adding Tamil, or a self-hosted
 * recogniser later, is a change to this table.
 *
 * Evidence (research "Voice drafting assistant technology", 2026-11-15):
 * - Chrome sends speech to Google's service, which hears English, Sinhala
 *   (si-LK) and Tamil (ta-LK, ta-IN). Nothing hears Sinhala on the device.
 * - Edge sends speech to Microsoft; Sinhala there is unconfirmed.
 * - Safari (and every browser on an iPhone or iPad) uses Apple's dictation:
 *   English, no Sinhala.
 * - Firefox 160 hears on the device, English among its languages; Firefox
 *   for Android hears nothing.
 * - There's no en-LK anywhere: en-IN is the nearest.
 */

export type AssistLanguage = "en" | "si" | "ta";
export type BrowserFamily = "chrome" | "edge" | "safari" | "firefox" | "samsung" | "other";
type Hearing = "cloud" | "device" | "unconfirmed" | "none";

export interface LanguageEntry {
  id: AssistLanguage;
  /** Its name in English, and in its own script. */
  name: string;
  native: string;
  /** BCP 47 tags to ask the recogniser for, best first. */
  speech: readonly string[];
  /** Whether the assistant offers it yet. Tamil waits for its own review. */
  enabled: boolean;
  hearing: Record<BrowserFamily, Hearing>;
}

export const LANGUAGES: readonly LanguageEntry[] = [
  { id: "en", name: "English", native: "English", speech: ["en-IN", "en-GB"], enabled: true, hearing: { chrome: "cloud", edge: "cloud", safari: "cloud", firefox: "device", samsung: "cloud", other: "none" } },
  { id: "si", name: "Sinhala", native: "සිංහල", speech: ["si-LK"], enabled: true, hearing: { chrome: "cloud", edge: "unconfirmed", safari: "none", firefox: "none", samsung: "cloud", other: "none" } },
  { id: "ta", name: "Tamil", native: "தமிழ்", speech: ["ta-LK", "ta-IN"], enabled: false, hearing: { chrome: "cloud", edge: "unconfirmed", safari: "none", firefox: "none", samsung: "cloud", other: "none" } },
];

export const languageOf = (id: AssistLanguage): LanguageEntry => LANGUAGES.find((l) => l.id === id)!;

/** The browser family from its user agent. Every browser on an iPhone or iPad runs WebKit, so it hears as Safari does. */
export function browserFamily(userAgent: string): BrowserFamily {
  const ua = userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua))) return "safari";
  if (/SamsungBrowser\//.test(ua)) return "samsung";
  if (/Edg(?:A|iOS)?\//.test(ua)) return "edge";
  if (/Firefox\//.test(ua) && !/Seamonkey/.test(ua)) return "firefox";
  if (/Chrome\/|Chromium\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

/** Who turns speech into text in this browser, in a sentence's words. */
export function speechCompany(family: BrowserFamily): string | null {
  return family === "chrome" || family === "samsung" ? "Google" : family === "edge" ? "Microsoft" : family === "safari" ? "Apple" : null;
}

export type VoiceAvailability = { ok: true; tag: string; where: "cloud" | "device"; company: string | null; unconfirmed: boolean } | { ok: false; reason: string };

/**
 * Whether this browser can hear this language, and if not, why, in words the surveyor can act on. `hasApi` is whether the page found a
 * speech recogniser at all; `firefoxAndroid` covers the one Firefox without one.
 */
export function voiceAvailability(lang: AssistLanguage, family: BrowserFamily, hasApi: boolean): VoiceAvailability {
  const entry = languageOf(lang);
  if (!entry.enabled) return { ok: false, reason: `${entry.name} isn't offered yet. Type it, or choose English or Sinhala.` };
  if (!hasApi) return { ok: false, reason: "This browser doesn't turn speech into text. Type your instruction, or open Survey Studio in Chrome, Edge or Safari." };
  const h = entry.hearing[family];
  if (h === "none") {
    if (lang === "si") return { ok: false, reason: family === "safari" ? "Apple's dictation doesn't hear Sinhala, on iPhone, iPad or Mac. Type in Sinhala, speak in English, or use Chrome on a computer or Android phone." : "This browser doesn't hear Sinhala. Use Chrome on a computer or Android phone, online, or type in Sinhala." };
    return { ok: false, reason: `This browser doesn't hear ${entry.name}. Type it instead.` };
  }
  return { ok: true, tag: entry.speech[0]!, where: h === "device" ? "device" : "cloud", company: h === "device" ? null : speechCompany(family), unconfirmed: h === "unconfirmed" };
}

/** Whether text is mostly in a language's script, for answering in the language the surveyor used. */
export function scriptOf(text: string): AssistLanguage {
  const si = (text.match(/[඀-෿]/g) ?? []).length;
  const ta = (text.match(/[஀-௿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (si > latin && si >= ta) return "si";
  if (ta > latin) return "ta";
  return "en";
}
