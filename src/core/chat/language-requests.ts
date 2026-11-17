/**
 * A person asking for a language or a way of writing it (stage 204, ADR 0221): "answer in English", "reply in Sinhala from now
 * on", "English please", "Sinhalen kiyanna", "Hindi mein batao", "use English letters", "Singlish". Read from the person's own
 * message only (never from files), and only as a hint for the model, which reads the message itself too.
 */
import type { AnswerScript } from "./language-names";
import { prose } from "./language";

export interface LanguageRequest {
  language?: string;
  script?: AnswerScript;
  /** For the rest of the conversation ("answer in English"), not only this answer ("explain recursion in Sinhala"). */
  lasting: boolean;
}

/** Language names as people type them in English letters. */
const NAMES: Record<string, string> = {
  en: "english, inglish, ingrisi, ingreesi, englisch, anglais, inglés, ingles, inglese, engleză, engleza, angielski, ingilizce, engelska, engelsk, engels",
  si: "sinhala, sinhalese, singhala, sinhalen",
  ta: "tamil, thamizh, tamizh",
  hi: "hindi",
  ur: "urdu",
  te: "telugu",
  kn: "kannada",
  ml: "malayalam",
  bn: "bengali, bangla",
  ne: "nepali",
  pa: "punjabi, panjabi",
  gu: "gujarati",
  mr: "marathi",
  ar: "arabic",
  fa: "persian, farsi",
  ru: "russian, po-russki",
  uk: "ukrainian",
  zh: "chinese, mandarin",
  ja: "japanese, nihongo",
  ko: "korean",
  th: "thai",
  el: "greek",
  he: "hebrew",
  de: "german, deutsch",
  fr: "french, français, francais",
  es: "spanish, español, espanol",
  pt: "portuguese, português, portugues",
  it: "italian, italiano",
  nl: "dutch, nederlands",
  ro: "romanian, română, romana",
  pl: "polish, polski",
  cs: "czech, čeština",
  tr: "turkish, türkçe, turkce",
  sv: "swedish, svenska",
  da: "danish, dansk",
  no: "norwegian, norsk",
  fi: "finnish, suomi",
  hu: "hungarian, magyar",
  hr: "croatian, hrvatski",
  id: "indonesian, bahasa indonesia",
  ms: "malay, bahasa melayu",
  vi: "vietnamese, tieng viet",
  tl: "filipino, tagalog",
  sw: "swahili, kiswahili",
  af: "afrikaans",
  km: "khmer",
  ka: "georgian",
  hy: "armenian",
  am: "amharic",
  my: "burmese",
};

/** Language names in their own scripts, as people write them in a request. */
const NATIVE_NAMES: Record<string, string> = {
  en: "ඉංග්‍රීසි, ඉංග්රීසි, अंग्रेजी, अंग्रेज़ी, ஆங்கிலம், ஆங்கிலத்தில், 英语, 英文, 英語, 영어, английский, английском",
  si: "සිංහල, සිංහලෙන්",
  ta: "தமிழ், தமிழில்",
  hi: "हिंदी, हिन्दी",
  ur: "اردو",
  ar: "العربية, عربي",
  fa: "فارسی",
  ru: "русский, русском, по-русски",
  uk: "українська, українською",
  zh: "中文, 汉语, 普通话",
  ja: "日本語",
  ko: "한국어",
  th: "ภาษาไทย",
  el: "ελληνικά",
  he: "עברית",
  bn: "বাংলা",
  te: "తెలుగు",
  kn: "ಕನ್ನಡ",
  ml: "മലയാളം",
  gu: "ગુજરાતી",
  pa: "ਪੰਜਾਬੀ",
  mr: "मराठी",
  ne: "नेपाली",
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ALIASES = new Map<string, string>();
for (const table of [NAMES, NATIVE_NAMES]) {
  for (const [code, list] of Object.entries(table)) for (const alias of list.split(",")) ALIASES.set(alias.trim().toLowerCase(), code);
}
/** Scripts written without spaces between words: a name there has no word boundary around it. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;
const NAME_RE = new RegExp(
  [...ALIASES.keys()]
    .sort((a, b) => b.length - a.length)
    .map((a) => (UNSPACED.test(a) ? esc(a) : `(?<![\\p{L}\\p{M}])${esc(a)}(?![\\p{L}\\p{M}])`))
    .join("|"),
  "gu",
);

/** Verbs that set the language for the conversation when said to Farbaek AI: "answer in", "switch to", "speak". */
const LASTING = "answer|reply|respond|talk|speak|chat|continue|switch|change|use|stick|keep|write back|antworte|sprich|réponds|répondez|parle|responde|responda|habla|rispondi|parla|fale|răspunde|raspunde|jawab|balas";
/** Words that may sit between such a verb and the language ("answer me only in", "switch to"). */
const FILLER = "to me|to us|from now on|your answers|me|us|only|please|pls|just|now|always|back|in|into|using|with|to|en|auf|em|în|the|it|this|that|bitte|everything|all";
/** Verbs that ask for one answer in a language ("explain recursion in Sinhala"). */
const CONTENT = "explain|tell|say|write|describe|summari[sz]e|give|show|teach|draft|compose|list|make|create";

const LASTING_BEFORE = new RegExp(`(^|[^\\p{L}])(?:${LASTING})((?:\\s+(?:${FILLER}))*)\\s+$`, "u");
/** The verb is said to Farbaek AI: at the start of a clause, or after "please", "can you", "let's". Never after "I", "they" or "do you". */
const IMPERATIVE = /(?:^|[.!?,;:\n]\s*|(?:^|[^\p{L}])(?:please|pls|plz|kindly|can you|could you|would you|will you|can we|could we|shall we|let's|lets|you to|just|now|and|so|ok|okay|always|only|also|then|on|bitte|por favor|per favore)\s+)$/u;
/** "I'd like answers in English", "Answers in English please". */
const ANSWERS_BEFORE = /(?:^|[^\p{L}])(?:answers?|repl(?:y|ies)|responses?)\s+(?:only\s+)?in\s+$/u;
/** The language ends the request: "answer in English, please", not "use Spanish for the button text". */
const AFTER_LASTING =
  /^\s*(?:(?:please|pls|only|now|instead|too|again|always|from now on|for now|for the rest(?: of (?:the|this) (?:chat|conversation))?|for (?:all|every) (?:of )?(?:your )?(?:answers?|replies|responses|messages))\s*)*(?:[.!?,;:)]|$|(?:and|but|so|then|because|since|as)(?![\p{L}]))/u;
const CONTENT_BEFORE = new RegExp(`(?:^|[^\\p{L}])(?:${CONTENT})(?![\\p{L}])(?:\\s+[^\\s.!?]+){0,6}\\s+(?:in|into|using)\\s+$`, "u");
/** Languages that put the verb after the language: "Sinhalen kiyanna", "English eken kiyanna", "Hindi mein batao", "日本語で答えて". */
const SOV_AFTER = new RegExp(
  "^\\s*(?:(?:walin|wlin|valin|eken|mein|me|mai|madhe|maa|ma|vich|la|lo|te|で|로|으로|में|मा)\\s*)?(?:" +
    "(?:kiyanna|kiyapan|kiyanne|kiyannako|kiyala|liyanna|denna|katha karanna|batao|bataiye|bolo|boliye|likho|samjhao|jawab do|sollu|sollunga|pesu|pesunga|cheppu|cheppandi|matladu|bolun|bhannus|bhana|dasso|kaho|sanga|saanga)(?![\\p{L}\\p{M}])" +
    "|答|回答|说|說|話|대답|말해|කියන්න|ලියන්න|बताओ|बताइए|बोलो|लिखो|சொல்லு|சொல்லுங்க|பேசு|చెప్పు|చెప్పండి|বলো|বলুন|ਦੱਸੋ|કહો|सांगा)",
  "u",
);
/** Words that make a short message a request for the conversation: "English please", "in Sinhala", "Deutsch bitte". */
const REQUEST_WORDS = new Set(
  "please pls plz kindly in into auf en em în po use reply answer respond speak talk write continue switch to only from now on always bitte por favor per favore mein me mai walin valin wlin eken la lo te ma madhe vich".split(" "),
);
/** Words a short message may also have without being a request: "Yes, Chinese" answers a question, for that answer only. */
const SHORT_OK = new Set("yes ok okay thanks thank you again and also the language just".split(" "));
/** Questions about words or translations name a language without asking for one. Read per clause. */
const TRANSLATION = /translat|traduc|übersetz|tradu[zç]|words? for|how (?:do|would|can) (?:you|i|we) (?:say|write|spell|pronounce|type)|how to (?:say|write|spell|pronounce|type)|what does .{1,60} mean|meaning of|what(?:'s| is| are) (?:the )?(?:pinyin|romaji|hangul|singlish|hinglish|tanglish|arabizi)/u;

const LATIN_LETTERS = /(?:english|roman|latin)[\s-]*(?:letters?|alphabets?|characters?|script|akuru|lipi)|romani[sz](?:ed|e|ation)|(?<![\p{L}])(?:singlish|hinglish|tanglish|banglish|manglish|arabizi|romaji|pinyin)(?![\p{L}])/gu;
const OWN_LETTERS = /(?:native|own|original|proper|unicode|sinhala|hindi|tamil|telugu|kannada|malayalam|bengali|bangla|nepali|punjabi|gujarati|marathi|arabic|urdu|persian|russian|chinese|japanese|korean|thai|greek|hebrew)[\s-]*(?:letters?|alphabets?|characters?|script|akuru|lipi)|(?<![\p{L}])(?:devanagari|cyrillic|hangul|kanji|hiragana|gurmukhi)(?![\p{L}])/gu;
/** The language a way of writing names by itself: Singlish is Sinhala, Hinglish Hindi, Romaji Japanese. */
const IMPLIED: Record<string, string> = { singlish: "si", hinglish: "hi", tanglish: "ta", banglish: "bn", manglish: "ml", arabizi: "ar", romaji: "ja", pinyin: "zh", hangul: "ko", kanji: "ja", hiragana: "ja", gurmukhi: "pa" };
const NEGATED_BEFORE = /(?:^|[^\p{L}])(?:don'?t|do not|never|not|no|stop|without|avoid|can'?t|cannot|won'?t|nahi|mat)\s+(?:[\p{L}'’]+\s+){0,2}$/u;
const NEGATED_AFTER = /^\s*(?:epa|nathuwa|nahi|mat|vendam|venda|wenda)(?![\p{L}])/u;
/** Where a clause starts and ends: punctuation, or "and", "but", "then" between words. */
const SEPARATOR = /[.!?;,\n]|\s(?:and|but|then)\s/gu;

function clauseAround(text: string, start: number, end: number): { before: string; after: string; whole: string } {
  let from = 0;
  let to = text.length;
  for (const m of text.matchAll(SEPARATOR)) {
    if (m.index + m[0].length <= start) from = m.index + m[0].length;
    else if (m.index >= end) {
      to = m.index;
      break;
    }
  }
  return { before: text.slice(from, start), after: text.slice(end, to), whole: text.slice(from, to) };
}

/** A lasting request names the language right after a verb said to Farbaek AI, and ends there. */
function askedBefore(before: string, after: string): boolean {
  const verb = LASTING_BEFORE.exec(before);
  const said = verb !== null && IMPERATIVE.test(before.slice(0, verb.index + (verb[1]?.length ?? 0)));
  return (said || ANSWERS_BEFORE.test(before)) && AFTER_LASTING.test(after);
}

/** The language and way of writing a message asks for, or null when it asks for neither. */
export function readLanguageRequest(message: string): LanguageRequest | null {
  const all = prose(message).toLowerCase();
  // A request sits at the start or the end of a message; a long paste in between isn't read.
  const text = all.length <= 600 ? all : `${all.slice(0, 300)}\n${all.slice(-300)}`;
  const found: LanguageRequest = { lasting: false };
  const words = text.match(/[\p{L}\p{M}'’-]+/gu) ?? [];

  // Ways of writing: "in English letters", "Singlish walin kiyanna", "no Sinhala letters". Only as a request, said to Farbaek AI.
  const scripts = [
    ...[...text.matchAll(LATIN_LETTERS)].map((m) => ({ m, kind: "latin" as const })),
    ...[...text.matchAll(OWN_LETTERS)].map((m) => ({ m, kind: "native" as const })),
  ].sort((a, b) => a.m.index - b.m.index);
  const spans: Array<[number, number]> = [];
  for (const { m, kind } of scripts) {
    const start = m.index;
    const end = start + m[0].length;
    spans.push([start, end]);
    const clause = clauseAround(text, start, end);
    if (TRANSLATION.test(clause.whole)) continue;
    const short = words.length <= 6 && words.every((w) => REQUEST_WORDS.has(w) || SHORT_OK.has(w) || m[0].includes(w));
    // Asked for: a short request, a verb after it, "in English letters", or a negation ("don't use English letters", "I can't read Sinhala script").
    const asked =
      short ||
      SOV_AFTER.test(clause.after) ||
      NEGATED_AFTER.test(clause.after) ||
      ((askedBefore(clause.before, clause.after) || NEGATED_BEFORE.test(clause.before) || /(?:^|\s)(?:in|with|using)\s+$/u.test(clause.before)) && AFTER_LASTING.test(clause.after));
    if (!asked) continue;
    const negated = NEGATED_BEFORE.test(clause.before) || NEGATED_AFTER.test(clause.after);
    found.script = negated ? (kind === "latin" ? "native" : "latin") : kind;
    const word = m[0].split(/[\s-]/)[0] ?? "";
    const implied = IMPLIED[word] ?? (kind === "native" ? ALIASES.get(word) : undefined);
    if (implied && !negated) found.language = implied;
    found.lasting = true;
  }

  // Languages by name, outside the ways of writing ("English" in "English letters" is about letters).
  const names = [...text.matchAll(NAME_RE)].filter((m) => !spans.some(([a, b]) => m.index >= a && m.index < b));
  const rest = text.replace(NAME_RE, " ").match(/[\p{L}\p{M}'’-]+/gu) ?? [];
  if (names.length > 0 && names.length + rest.length <= 6 && rest.every((w) => REQUEST_WORDS.has(w) || SHORT_OK.has(w))) {
    // "English please" asks for the conversation; a bare "Japanese" or "Yes, Chinese" answers a question, for that answer only.
    found.language = ALIASES.get(names.at(-1)![0]);
    found.lasting = found.lasting || rest.some((w) => REQUEST_WORDS.has(w));
    return found;
  }
  for (const m of names) {
    const code = ALIASES.get(m[0]);
    if (!code) continue;
    const clause = clauseAround(text, m.index, m.index + m[0].length);
    if (TRANSLATION.test(clause.whole) || NEGATED_BEFORE.test(clause.before)) continue;
    if (askedBefore(clause.before, clause.after) || SOV_AFTER.test(clause.after)) {
      found.language = code;
      found.lasting = true;
    } else if (CONTENT_BEFORE.test(clause.before) && /^\s*(?:please|pls|too|only|instead)?\s*[)]?\s*$/u.test(clause.after)) {
      found.language = code;
    }
  }
  return found.language || found.script ? found : null;
}
