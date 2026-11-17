/**
 * Which language and script Farbaek AI answers in (stage 204, ADR 0221), and the short note the model gets with each answer.
 *
 * Priority, from the owner's specification: an explicit request in this message, then one made earlier in the conversation,
 * then the person's saved preference, then the reading of the message, then the conversation's language, then the model's own
 * judgement. Earlier requests and the conversation's language are read from the person's own messages already in the context,
 * so nothing new is stored. The note only ever contains fixed sentences and language names, never the person's words.
 */
import { z } from "zod";
import { readLanguage, prose, type Confidence, type LanguageReading } from "./language";
import { cleanPreference, describeLanguage, type AnswerScript, type LanguagePreference } from "./language-names";
import { readLanguageRequest } from "./language-requests";

export type LanguageSource = "asked" | "asked-here" | "chosen" | "read" | "none";

export interface LanguagePlan {
  /** The language to answer in: a language, a family, or null to leave it to the model. */
  language: string | null;
  /** Where it came from: a lasting request, a request for this answer only, the settings, the person's own writing, or nowhere. */
  languageFrom: LanguageSource;
  script: AnswerScript;
  scriptFrom: "asked" | "chosen" | "default";
  /** The person types the language in English letters (from the reading that gave it). */
  romanized: boolean;
  /** False when the language is a guess from one short message. */
  sure: boolean;
  confidence: Confidence;
  /** The reading of this message alone. */
  reading: LanguageReading;
}

const UNREAD: LanguageReading = { language: null, script: null, romanized: false, mixed: false, confidence: "low" };
const wordCount = (text: string) => prose(text).match(/[\p{L}\p{M}'’]+/gu)?.length ?? 0;

export function planLanguage(input: { message: string; earlier?: readonly string[]; preference?: Partial<LanguagePreference> | null }): LanguagePlan {
  const preference = cleanPreference(input.preference);
  const earlier = input.earlier ?? [];
  const now = readLanguageRequest(input.message);

  // Earlier requests for the rest of the conversation, newest first.
  let askedLanguage: string | undefined;
  let askedScript: AnswerScript | undefined;
  for (let i = earlier.length - 1; i >= 0 && !(askedLanguage && askedScript); i--) {
    const request = readLanguageRequest(earlier[i]!);
    if (!request?.lasting) continue;
    askedLanguage ??= request.language;
    askedScript ??= request.script;
  }

  // A message that is mostly a request ("please use English letters from now on") says nothing about the language to answer in.
  const reading = now?.lasting && wordCount(input.message) <= 20 ? UNREAD : readLanguage(input.message);
  // The conversation's language: the newest of the last few messages that reads clearly.
  let conversation: LanguageReading | null = null;
  for (let i = earlier.length - 1, seen = 0; i >= 0 && seen < 6 && !conversation; i--, seen++) {
    const text = earlier[i]!;
    if (wordCount(text) <= 20 && readLanguageRequest(text)?.lasting) continue;
    const r = readLanguage(text);
    if (r.language && r.confidence !== "low") conversation = r;
  }

  const plan: LanguagePlan = { language: null, languageFrom: "none", script: "native", scriptFrom: "default", romanized: false, sure: true, confidence: "low", reading };
  if (now?.language) Object.assign(plan, { language: now.language, languageFrom: now.lasting ? "asked" : "asked-here", confidence: "high" });
  else if (askedLanguage) Object.assign(plan, { language: askedLanguage, languageFrom: "asked", confidence: "high" });
  else if (preference.answer !== "auto") Object.assign(plan, { language: preference.answer, languageFrom: "chosen", confidence: "high" });
  else {
    const read = reading.language && reading.confidence !== "low" ? reading : (conversation ?? (reading.language ? reading : null));
    if (read) Object.assign(plan, { language: read.language, languageFrom: "read", romanized: read.romanized, sure: read.confidence !== "low", confidence: read.confidence });
  }
  plan.script = now?.script ?? askedScript ?? preference.script;
  plan.scriptFrom = now?.script || askedScript ? "asked" : preference.script === "latin" ? "chosen" : "default";
  return plan;
}

/** The whole reading of a turn as one record (the owner's specification, section 5). Internal: never shown to the person. */
export const languageAnalysisSchema = z.object({
  primaryLanguage: z.string().nullable(),
  secondaryLanguages: z.array(z.string()),
  inputScript: z.string().nullable(),
  inputStyle: z.enum(["native_script", "latin_script", "romanized", "romanized_mixed", "mixed", "unknown"]),
  isRomanized: z.boolean(),
  isMixedLanguage: z.boolean(),
  responseLanguage: z.string().nullable(),
  responseScript: z.string().nullable(),
  responseSource: z.enum(["asked", "asked-here", "chosen", "read", "none"]),
  confidence: z.enum(["high", "medium", "low"]),
});
export type LanguageAnalysis = z.infer<typeof languageAnalysisSchema>;

export function analyzeLanguage(plan: LanguagePlan): LanguageAnalysis {
  const r = plan.reading;
  const inputStyle: LanguageAnalysis["inputStyle"] =
    r.script === null ? "unknown" : r.romanized ? (r.mixed ? "romanized_mixed" : "romanized") : r.mixed ? "mixed" : r.script === "Latin" ? "latin_script" : "native_script";
  const info = plan.language ? describeLanguage(plan.language) : null;
  const responseScript = !info ? null : info.script === null ? "Latin" : plan.script === "latin" ? "Latin (typed the way the person types it)" : info.script;
  return languageAnalysisSchema.parse({
    primaryLanguage: r.language,
    secondaryLanguages: r.mixed && r.language !== "en" ? ["en"] : [],
    inputScript: r.script,
    inputStyle,
    isRomanized: r.romanized,
    isMixedLanguage: r.mixed,
    responseLanguage: plan.language,
    responseScript,
    responseSource: plan.languageFrom,
    confidence: plan.confidence,
  });
}

const NOTE = "Language for this answer (a note from Farbaek, not from the person):";

/** The names people use for their language typed in English letters, which models know well. */
const ROMANIZED_NAMES: Readonly<Record<string, string>> = {
  si: "Singlish",
  hi: "Hinglish",
  ur: "Roman Urdu",
  "hi|ur": "Hinglish or Roman Urdu",
  ta: "Tanglish",
  bn: "Banglish",
  ml: "Manglish",
  ar: "Arabizi",
  ja: "Romaji",
  zh: "Pinyin",
};

/**
 * The note sent beside the system prompt. It depends only on the language, the script, where each came from and whether the
 * person types in English letters, so it stays the same from one answer to the next and prompt caching keeps working. Null when
 * there's nothing to add to the model's own judgement.
 */
export function languageNote(plan: LanguagePlan): string | null {
  const info = plan.language ? describeLanguage(plan.language) : null;
  if (!plan.language || !info) {
    if (plan.scriptFrom === "default") return null;
    const how = plan.script === "latin" ? "in English letters, the way the person types it (that language's words, not English)" : "in its own script";
    return `${NOTE} When answering in a language with its own script, write it ${how}: the person ${plan.scriptFrom === "asked" ? "asked for this" : "chose this in their settings"}.`;
  }
  // An uncertain reading of one short message ("ok", "go on", "5th") says nothing firm: the model judges for itself.
  if (plan.languageFrom === "read" && !plan.sure) return null;
  const family = plan.language.includes("|");
  const own = info.script !== null;
  // English letters, said so that no model reads it as English (live, 2026-11-17: GPT-6 Luna answered "Answer in English
  // letters" in English, and Claude Haiku 5.5 only partly in Singlish, under a shorter note).
  const latin = own && plan.script === "latin";
  const known = ROMANIZED_NAMES[plan.language];
  const how = !own
    ? ""
    : latin
      ? `, written in English letters${known ? ` (often called ${known})` : ""}: ${family ? "the language's own" : info.name} words and grammar, spelled the way the person types them, not English and not ${info.script}`
      : `, written in ${info.script}`;
  const parts: string[] = [];
  if (plan.languageFrom === "read") {
    if (!own) parts.push(`Answer in the language the person writes in (it reads as ${info.name}).`);
    else if (family) parts.push(`Answer in the language the person writes in (${info.name}: tell which from their words)${how}.`);
    else parts.push(`Answer in ${info.name}${how}.`);
    if (plan.romanized) parts.push(`They type ${family ? "it" : info.name} in English letters: that isn't English.`);
  } else if (plan.languageFrom === "asked-here") {
    parts.push(`The person asked for ${info.name} in this message: write what they asked for in ${info.name}${how}.`);
  } else {
    parts.push(`Answer in ${info.name}${how}.`);
    parts.push(plan.languageFrom === "asked" ? "The person asked for this language: keep to it until they ask for another." : "The person chose this language in their settings.");
  }
  if (own && plan.scriptFrom === "asked" && plan.languageFrom !== "asked") {
    parts.push(latin ? `They asked for English letters: they mean ${family ? "their language" : info.name} spelled in English letters, not the English language.` : "They asked for this way of writing it.");
  }
  if (own && plan.scriptFrom === "chosen") parts.push("They chose English letters in their settings.");
  if (latin) parts.push("Write every sentence this way, even when their latest message is in English; keep technical terms and code as they are.");
  return `${NOTE} ${parts.join(" ")}`;
}
