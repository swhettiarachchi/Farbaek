/**
 * The language a person writes in (stage 204, ADR 0221): a free, instant reading of a chat message that tells the model which
 * language and script to answer in. A hint, never a replacement for the model's own understanding: the message itself is sent
 * unchanged, nothing is translated, and nothing here is stored or shown to the person.
 *
 * - Scripts are read exactly, with Unicode script properties. A script used by one language names it (Sinhala script is
 *   Sinhala); a shared one names its family (Devanagari: Hindi, Marathi or Nepali), and the model tells them apart.
 * - Latin letters are read by language: common words, letters with diacritics and a few word shapes, scored over the whole
 *   message. That includes languages typed in English letters, so English letters are never taken to mean English.
 * - English technical words don't outvote the sentence's language: they aren't in any language's common words.
 *
 * Framework-free and dependency-free. Limits: the word lists are short, and a language without a profile reads as unclear or as
 * a close neighbour (the note then asks the model to answer in the language the person writes in).
 */
import { LATIN_PROFILES, type Profile } from "./language-profiles";
import { ROMANIZED_PROFILES } from "./language-romanized";

export type Confidence = "high" | "medium" | "low";

export interface LanguageReading {
  /** A language ("si"), a family ("hi|ur"), or null when the message doesn't say. */
  language: string | null;
  /** The script the message is written in ("Latin", "Sinhala", "Japanese"), or null with no letters at all. */
  script: string | null;
  /** A language usually written in its own script, typed here in English letters. */
  romanized: boolean;
  /** English words (technical terms, names) inside a message in another language. */
  mixed: boolean;
  confidence: Confidence;
}

const NOTHING: LanguageReading = { language: null, script: null, romanized: false, mixed: false, confidence: "low" };

// ---------------------------------------------------------------------------------------------------------------------------
// Scripts

const SCRIPTS: ReadonlyArray<{ name: string; re: RegExp; language: string }> = [
  { name: "Sinhala", re: /\p{Script=Sinhala}/gu, language: "si" },
  { name: "Tamil", re: /\p{Script=Tamil}/gu, language: "ta" },
  { name: "Telugu", re: /\p{Script=Telugu}/gu, language: "te" },
  { name: "Kannada", re: /\p{Script=Kannada}/gu, language: "kn" },
  { name: "Malayalam", re: /\p{Script=Malayalam}/gu, language: "ml" },
  { name: "Bengali", re: /\p{Script=Bengali}/gu, language: "bn" },
  { name: "Gurmukhi", re: /\p{Script=Gurmukhi}/gu, language: "pa" },
  { name: "Gujarati", re: /\p{Script=Gujarati}/gu, language: "gu" },
  { name: "Devanagari", re: /\p{Script=Devanagari}/gu, language: "hi|mr|ne" },
  { name: "Arabic", re: /\p{Script=Arabic}/gu, language: "ar|ur|fa" },
  { name: "Hebrew", re: /\p{Script=Hebrew}/gu, language: "he" },
  { name: "Cyrillic", re: /\p{Script=Cyrillic}/gu, language: "ru|uk|bg|sr|mk|be|kk" },
  { name: "Greek", re: /\p{Script=Greek}/gu, language: "el" },
  { name: "Armenian", re: /\p{Script=Armenian}/gu, language: "hy" },
  { name: "Georgian", re: /\p{Script=Georgian}/gu, language: "ka" },
  { name: "Thai", re: /\p{Script=Thai}/gu, language: "th" },
  { name: "Khmer", re: /\p{Script=Khmer}/gu, language: "km" },
  { name: "Myanmar", re: /\p{Script=Myanmar}/gu, language: "my" },
  { name: "Ethiopic", re: /\p{Script=Ethiopic}/gu, language: "am" },
  { name: "Hangul", re: /\p{Script=Hangul}/gu, language: "ko" },
];
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const HAN = /\p{Script=Han}/gu;
const LATIN = /\p{Script=Latin}/gu;
/** Scripts written without spaces between words. */
const UNSPACED = new Set(["Han", "Japanese", "Thai", "Khmer", "Myanmar"]);

const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;

/** The words a person wrote, without code, links, addresses, paths and dotted names, which carry no language. */
export function prose(text: string): string {
  // Cut first: a long paste is read by its beginning and end, and every pattern below has bounded runs, so a 32,000-character
  // message of one long word costs as little as a short one.
  const cut = text.length > 4_000 ? `${text.slice(0, 3_000)}\n${text.slice(-1_000)}` : text;
  return cut
    .normalize("NFC")
    .replace(/(```|~~~)[\s\S]*?(?:\1|$)/g, " ")
    .replace(/`[^`\n]{0,400}`/g, " ")
    .replace(/(?:https?:\/\/|www\.)\S{1,400}/gi, " ")
    .replace(/[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g, " ")
    .replace(/(?:^|\s)(?:[\w.-]{1,64}\/){1,16}[\w.-]{0,64}/g, " ")
    .replace(/\b[\w-]{1,64}(?:\.[\w-]{1,64}){1,8}\b/g, " ");
}

/** Text in quotation marks is usually something being asked about ("what does 'කොහොමද' mean?"), not the person's own language. */
function withoutQuotes(text: string): string {
  const left = text.replace(/"[^"\n]{1,200}"|“[^”\n]{1,200}”|‘[^’\n]{1,200}’|「[^」\n]{1,200}」|«[^»\n]{1,200}»|(?<=^|[\s(:])'[^'\n]{1,200}'(?=$|[\s).,!?;:])/g, " ");
  return (left.match(/\p{L}{2,}/gu)?.length ?? 0) >= 2 ? left : text;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Words in Latin letters

interface Hit {
  lang: string;
  w: number;
}
const EXACT = new Map<string, Hit[]>();
/** The same words without their diacritics, for people who type without them ("nao" for "não"), at a little less weight. */
const BARE = new Map<string, Hit[]>();
const LETTERS = new Map<string, string[]>();
const SHAPES: Array<[string, RegExp]> = [];
/** Languages usually written in their own script, read here when typed in English letters. */
const ROMANIZED = new Set(Object.keys(ROMANIZED_PROFILES));

const bare = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

function put(map: Map<string, Hit[]>, word: string, hit: Hit) {
  const list = map.get(word);
  if (!list) return void map.set(word, [hit]);
  const same = list.find((h) => h.lang === hit.lang);
  if (same) same.w = Math.max(same.w, hit.w);
  else list.push(hit);
}

function learn(code: string, profile: Profile) {
  for (const spec of profile.words.trim().split(/\s+/)) {
    const [word = "", weight] = spec.split(":");
    const w = weight ? Number(weight) : 1;
    put(EXACT, word, { lang: code, w });
    const plain = bare(word);
    if (plain !== word && profile.bare !== false) put(BARE, plain, { lang: code, w: w * 0.7 });
  }
  for (const ch of profile.letters ?? "") LETTERS.set(ch, [...(LETTERS.get(ch) ?? []), code]);
  for (const re of profile.shapes ?? []) SHAPES.push([code, re]);
}
for (const [code, profile] of Object.entries(LATIN_PROFILES)) learn(code, profile);
for (const [code, profile] of Object.entries(ROMANIZED_PROFILES)) learn(code, profile);

function lookup(word: string): Hit[] | null {
  const exact = EXACT.get(word);
  const plain = /^[ -~]*$/.test(word) ? BARE.get(word) : undefined;
  if (exact && plain) return [...exact, ...plain.filter((h) => !exact.some((e) => e.lang === h.lang))];
  if (exact ?? plain) return (exact ?? plain)!;
  if (!word.includes("'")) return null;
  for (const part of word.split("'")) {
    const found = part.length >= 2 ? lookup(part) : null;
    if (found) return found;
  }
  return null;
}

/** A word shared by several languages counts once in all, split by how common it is in each. */
function share(scores: Map<string, number>, hits: readonly Hit[], mass: number) {
  let top = 0;
  let sum = 0;
  for (const h of hits) {
    top = Math.max(top, h.w);
    sum += h.w;
  }
  for (const h of hits) scores.set(h.lang, (scores.get(h.lang) ?? 0) + (mass * top * h.w) / sum);
}

/** Arabic in English letters writes some sounds with digits: 3, 7, 2, 5 (a3raf, 7abibi, 3ala). Not product names like k8s. */
const ARABIZI = /[a-z][235679][a-z]|^[235679][a-z]{3,}/;
const NOT_ARABIZI = new Set(["k8s", "w3c", "w3schools", "b2b", "b2c", "p2p", "h2o", "co2", "web3", "mp3", "mp4", "i18n", "l10n", "a11y", "e2e", "s3", "ec2"]);

/** Every syllable of Mandarin Pinyin, without tones ("v" for "ü"). */
const PINYIN = new Set(
  [
    "a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu ca cai can cang cao ce cen ceng",
    "cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu",
    "cuan cui cun cuo da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo",
    "e ei en eng er fa fan fang fei fen feng fo fou fu ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan",
    "guang gui gun guo ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo ji jia jian",
    "jiang jiao jie jin jing jiong jiu ju juan jue jun ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan",
    "kuang kui kun kuo la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu long lou lu luan lun luo",
    "lv lve ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu na nai nan nang nao ne nei nen",
    "neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nv nve o ou pa pai pan pang pao pei pen peng pi",
    "pian piao pie pin ping po pou pu qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun ran rang rao re",
    "ren reng ri rong rou ru rua ruan rui run ruo sa sai san sang sao se sen seng sha shai shan shang shao she shei",
    "shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo ta tai tan tang",
    "tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo wa wai wan wang wei wen weng wo wu xi xia xian",
    "xiang xiao xie xin xing xiong xiu xu xuan xue xun ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun za",
    "zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai",
    "zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo",
  ]
    .join(" ")
    .split(" "),
);

/** Everyday technical words: they make a message "mixed" when its sentence is in another language, and never count as English. */
const TECH = new Set(
  "website web app apps application laptop computer phone mobile wifi internet email code coding api database server login password account download upload install update file folder design logo project deploy bug error online office meeting video photo game software hardware browser link page button chat message data cloud react node python java javascript typescript flutter firebase html css sql docker github git model prompt frontend backend framework library function class system network".split(
    " ",
  ),
);

/** Languages so close in their common words that a near tie is named as their family. */
const RELATIVES: Readonly<Record<string, string>> = { "da|no sv": "da|no|sv" };

/** True when a word splits wholly into Pinyin syllables ("zhidao", "wangzhan"). */
function isPinyin(word: string): boolean {
  const w = word.replace(/ü/g, "v");
  if (!/^[a-z]{2,24}$/.test(w)) return false;
  const reach: boolean[] = [true];
  for (let i = 0; i < w.length; i++) {
    if (!reach[i]) continue;
    for (let n = 1; n <= 6 && i + n <= w.length; n++) if (PINYIN.has(w.slice(i, i + n))) reach[i + n] = true;
  }
  return reach[w.length] === true;
}

/** Acronyms (API, CSS), camelCase (JavaScript, useState) and snake_case carry no language. In a message written all in capitals, capitals don't count. */
const technical = (raw: string, shouting: boolean) => (!shouting && /^[\p{Lu}\d]{2,}$/u.test(raw) && /\p{L}/u.test(raw)) || /\p{Ll}\p{Lu}/u.test(raw) || raw.includes("_");

function readLatin(text: string): Omit<LanguageReading, "script"> {
  const words = [...text.matchAll(/[\p{L}\p{M}\d'’_]+/gu)].map((m) => m[0].replace(/’/g, "'").replace(/^'+|'+$/g, "")).filter((w) => w && !/^\d+$/.test(w));
  const shouting = words.filter((w) => /^\p{Lu}{2,}$/u.test(w)).length > words.length * 0.6;
  const scores = new Map<string, number>();
  let counted = 0;
  let recognized = 0;
  let techs = 0;
  let pinyin = 0;
  for (const raw of words) {
    // No word in any language is this long: a pasted hash or a run of letters carries no language (and would cost time).
    if (raw.length > 40) continue;
    if (technical(raw, shouting)) {
      techs++;
      continue;
    }
    // Pinyin with tone numbers ("ni3 hao3") reads as Pinyin.
    const low = /^[a-zü]+[1-5]$/.test(raw.toLowerCase()) ? raw.toLowerCase().slice(0, -1) : raw.toLowerCase();
    counted++;
    const hits = lookup(low);
    if (hits) {
      share(scores, hits, 1);
      recognized++;
    } else if (/\d/.test(low)) {
      // Hex (colours, bytes, hashes: a87b3d, 0x1f) is never Arabic.
      if (ARABIZI.test(low) && !NOT_ARABIZI.has(low) && !/^(?:0x)?[0-9a-f]+$/.test(low)) {
        share(scores, [{ lang: "ar", w: 1 }], 1);
        recognized++;
      } else counted--;
    } else {
      const shaped = SHAPES.filter(([, re]) => re.test(low)).map(([lang]) => ({ lang, w: 1 }));
      if (shaped.length > 0) {
        share(scores, shaped, 0.5);
        recognized++;
      } else if (TECH.has(low)) techs++;
    }
    if (isPinyin(low) && !hits?.some((h) => h.lang === "en")) pinyin++;
  }
  // Letters with diacritics: each counts up to twice, shared by the languages that use it.
  const letters = new Map<string, number>();
  for (const ch of text.toLowerCase()) if (LETTERS.has(ch)) letters.set(ch, (letters.get(ch) ?? 0) + 1);
  for (const [ch, n] of letters) share(scores, LETTERS.get(ch)!.map((lang) => ({ lang, w: 1 })), 0.6 * Math.min(n, 2));
  // Once real Pinyin words are there, other words that split into Pinyin syllables count too.
  const zh = scores.get("zh") ?? 0;
  if (zh >= 1) scores.set("zh", zh + 0.2 * pinyin);

  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  let best = ranked[0]?.[0] ?? null;
  let top = ranked[0]?.[1] ?? 0;
  let next = ranked[1]?.[1] ?? 0;
  // Close relatives too near to call are named as a family, and the model tells which.
  const related = best && ranked[1] ? RELATIVES[[best, ranked[1][0]].sort().join(" ")] : undefined;
  if (related && (top < 1.4 * next || top - next < 0.6)) {
    best = related;
    top += next;
    next = ranked[2]?.[1] ?? 0;
  }
  if (!best || top < 0.6) return { language: null, romanized: false, mixed: false, confidence: "low" };
  let confidence: Confidence = top >= 2 && top >= 2 * next && top - next >= 1.2 ? "high" : top >= 1 && top >= 1.4 * next && top - next >= 0.6 ? "medium" : "low";
  // One recognised word ("per", "kia") never decides a message; short messages are never certain.
  if (counted < 3 || recognized < 2) confidence = "low";
  else if (counted < 5 && confidence === "high") confidence = "medium";
  return { language: best, romanized: ROMANIZED.has(best), mixed: best !== "en" && ((scores.get("en") ?? 0) >= 0.5 || techs > 0), confidence };
}

/** Reads the language of one message. Never changes it, never stores it. */
export function readLanguage(text: string): LanguageReading {
  const words = withoutQuotes(prose(text));
  const latin = count(words, LATIN);
  let best: { name: string; language: string; source: string } | null = null;
  let most = 0;
  for (const s of SCRIPTS) {
    const n = count(words, s.re);
    if (n > most) {
      most = n;
      best = { name: s.name, language: s.language, source: s.re.source };
    }
  }
  const kana = count(words, KANA);
  const han = count(words, HAN);
  if (kana + han > most) {
    most = kana + han;
    best = kana > 0 ? { name: "Japanese", language: "ja", source: "[\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}]" } : { name: "Han", language: "zh", source: "\\p{Script=Han}" };
  }
  if (best) {
    // A script of its own decides when it has at least as many words as the Latin letters around it (technical words aside), so
    // one named word ("what does සිංහල mean?") doesn't decide a sentence. Scripts written without spaces count a word per two characters.
    const own = new RegExp(best.source, "u");
    const latinWords = (words.match(/\p{Script=Latin}[\p{L}\p{M}'’]*/gu) ?? []).filter((w) => !TECH.has(w.toLowerCase()) && !technical(w, false)).length;
    const ownWords = UNSPACED.has(best.name) ? most / 2 : words.split(/[\s\p{P}]+/u).filter((w) => own.test(w)).length;
    if (ownWords > 0 && ownWords >= latinWords) {
      return { language: best.language, script: best.name, romanized: false, mixed: latin >= 3, confidence: latinWords === 0 || ownWords >= 2 * latinWords ? "high" : "medium" };
    }
  }
  if (latin === 0) return NOTHING;
  return { ...readLatin(words), script: "Latin" };
}
