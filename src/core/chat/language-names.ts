/**
 * The languages Farbaek AI's language reader names (stage 204, ADR 0221), and the answer-language preference a person can set in
 * Chat. Every language here has an example in language.test.ts that the reader gets right; nothing is claimed beyond that.
 */

export type AnswerScript = "native" | "latin";

export interface LanguageInfo {
  /** Its English name. */
  name: string;
  /** Its name in itself, for the settings list, when that's written differently. */
  own: string | null;
  /** How its usual script is named in a note ("Sinhala script", "Devanagari"); null when it's written in the Latin alphabet. */
  script: string | null;
}

const info = (name: string, own: string | null = null, script: string | null = null): LanguageInfo => ({ name, own, script });

/** Single languages: the ones a person can choose in settings, and the ones the reader can name on its own. */
export const LANGUAGES: Readonly<Record<string, LanguageInfo>> = {
  af: info("Afrikaans"),
  am: info("Amharic", "አማርኛ", "the Ethiopic script"),
  ar: info("Arabic", "العربية", "Arabic script"),
  bn: info("Bengali", "বাংলা", "Bengali script"),
  cs: info("Czech", "Čeština"),
  da: info("Danish", "Dansk"),
  de: info("German", "Deutsch"),
  el: info("Greek", "Ελληνικά", "Greek script"),
  en: info("English"),
  es: info("Spanish", "Español"),
  fa: info("Persian", "فارسی", "Persian script"),
  fi: info("Finnish", "Suomi"),
  fr: info("French", "Français"),
  gu: info("Gujarati", "ગુજરાતી", "Gujarati script"),
  he: info("Hebrew", "עברית", "Hebrew script"),
  hi: info("Hindi", "हिन्दी", "Devanagari"),
  hr: info("Croatian", "Hrvatski"),
  hu: info("Hungarian", "Magyar"),
  hy: info("Armenian", "Հայերեն", "Armenian script"),
  id: info("Indonesian", "Bahasa Indonesia"),
  it: info("Italian", "Italiano"),
  ja: info("Japanese", "日本語", "Japanese script (kana and kanji)"),
  ka: info("Georgian", "ქართული", "Georgian script"),
  km: info("Khmer", "ខ្មែរ", "Khmer script"),
  kn: info("Kannada", "ಕನ್ನಡ", "Kannada script"),
  ko: info("Korean", "한국어", "Hangul"),
  ml: info("Malayalam", "മലയാളം", "Malayalam script"),
  mr: info("Marathi", "मराठी", "Devanagari"),
  ms: info("Malay", "Bahasa Melayu"),
  my: info("Burmese", "မြန်မာ", "Myanmar script"),
  ne: info("Nepali", "नेपाली", "Devanagari"),
  nl: info("Dutch", "Nederlands"),
  no: info("Norwegian", "Norsk"),
  pa: info("Punjabi", "ਪੰਜਾਬੀ", "Gurmukhi"),
  pl: info("Polish", "Polski"),
  pt: info("Portuguese", "Português"),
  ro: info("Romanian", "Română"),
  ru: info("Russian", "Русский", "Cyrillic"),
  si: info("Sinhala", "සිංහල", "Sinhala script"),
  sv: info("Swedish", "Svenska"),
  sw: info("Swahili", "Kiswahili"),
  ta: info("Tamil", "தமிழ்", "Tamil script"),
  te: info("Telugu", "తెలుగు", "Telugu script"),
  th: info("Thai", "ไทย", "Thai script"),
  tl: info("Filipino"),
  tr: info("Turkish", "Türkçe"),
  uk: info("Ukrainian", "Українська", "Cyrillic"),
  ur: info("Urdu", "اردو", "Urdu script"),
  vi: info("Vietnamese", "Tiếng Việt"),
  zh: info("Chinese", "中文", "Chinese characters"),
};

/** Languages that share a script or a way of being typed in English letters: the model tells them apart from the words. */
export const FAMILIES: Readonly<Record<string, LanguageInfo>> = {
  "hi|ur": info("Hindi or Urdu", null, "Devanagari for Hindi or Urdu script for Urdu"),
  "hi|mr|ne": info("Hindi, Marathi or Nepali", null, "Devanagari"),
  "ar|ur|fa": info("Arabic, Urdu or Persian", null, "its own script (Arabic, Urdu or Persian)"),
  "ru|uk|bg|sr|mk|be|kk": info("Russian, Ukrainian or another language written in Cyrillic", null, "Cyrillic"),
  "id|ms": info("Indonesian or Malay"),
  "da|no": info("Danish or Norwegian"),
  "da|no|sv": info("Danish, Norwegian or Swedish"),
  "bs|hr|sr": info("Bosnian, Croatian or Serbian"),
};

export function describeLanguage(code: string): LanguageInfo | null {
  return LANGUAGES[code] ?? FAMILIES[code] ?? null;
}

/** True when a reading (a language or a family) covers this language. */
export function readsAs(reading: string | null, code: string): boolean {
  return reading !== null && (reading === code || reading.split("|").includes(code));
}

export const ANSWER_LANGUAGE_CODES = Object.keys(LANGUAGES);

/** The answer-language setting, in this browser (stage 204): "auto" answers in the language the person writes in. */
export interface LanguagePreference {
  answer: string;
  script: AnswerScript;
}

export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = { answer: "auto", script: "native" };

export function cleanPreference(value: Partial<LanguagePreference> | null | undefined): LanguagePreference {
  const answer = typeof value?.answer === "string" && (value.answer === "auto" || Object.hasOwn(LANGUAGES, value.answer)) ? value.answer : "auto";
  const script = value?.script === "latin" ? "latin" : "native";
  return { answer, script };
}

/** The settings list: every single language, by English name, with its own name beside it. */
export function languageOptions(): { code: string; label: string }[] {
  return Object.entries(LANGUAGES)
    .map(([code, l]) => ({ code, label: l.own && l.own !== l.name ? `${l.name} (${l.own})` : l.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
}
