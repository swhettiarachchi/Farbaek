/**
 * Whether a message needs the live web, and how much of it (stage 206, ADR 0223). Framework-free, no model call.
 *
 * Four answers:
 * - "none": greetings, small talk, creative writing, translating or rewriting the person's own text, code they pasted, maths.
 *   Nothing to look up, so the answer starts at once.
 * - "search": the message names something that changes (news, prices, releases, "latest", "today") or asks for a search.
 * - "deep": a research task: a survey, an investigation, a comparison on several points.
 * - "unsure": the words don't say. The planner model decides (server/web/planner.ts); without one, Farbaek searches.
 *
 * `explicit` is true when the person asked for a search or a check in so many words: that is always searched, whatever a
 * model thinks. The reading is from the message alone, in any language the lists below cover; a language they don't cover reads
 * as "unsure", never as "none".
 */
import { FRESH_SPACED, FRESH_UNSPACED, GREETINGS_SPACED, GREETINGS_UNSPACED, NEWS_SPACED, NEWS_UNSPACED } from "./intent-words";

export type SearchNeed = "none" | "search" | "deep" | "unsure";

export interface NeedReading {
  need: SearchNeed;
  /** The person asked for a search, a check or sources in so many words. */
  explicit: boolean;
  /** Why, in a few words. For logs and tests, never shown. */
  why: string;
}

/** The pattern for whole words in any script: letters, marks and digits on either side end a match. Longest first, so "good morning" is taken before "good". */
function wordsSource(list: string): string {
  const alternatives = list
    .trim()
    .split(/\s*\|\s*/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()[\]\\]/g, "\\$&").replace(/ /g, "\\s+"));
  return `(?<![\\p{L}\\p{M}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{M}\\p{N}])`;
}

function words(list: string): RegExp {
  return new RegExp(wordsSource(list), "iu");
}

/** Text written without spaces between words (Chinese, Japanese, Thai): matched anywhere. */
function anywhere(list: string): RegExp {
  return new RegExp(list.trim().split(/\s*\|\s*/).join("|"), "u");
}

const EXPLICIT = [
  /\b(?:search|google|bing)\b(?! (?:engine|bar|box|algorithm|tree|function|param|query|index|result page))/i,
  /\b(?:look (?:it|this|that|them)? ?up|find (?:me )?(?:it |this |that )?(?:online|on the (?:web|internet|net))|check (?:it |this |that )?(?:online|on the (?:web|internet|net))|browse the (?:web|internet)|on the internet|from the internet|web search|fact[- ]?check|double[- ]check (?:this|that|it) online|with (?:sources|citations|references|links)|cite (?:your |the )?sources|give (?:me )?(?:the )?sources|verify (?:this|that|it|whether|if))\b/i,
  // Sinhala in English letters.
  words("hoyanna | hoyala | hoyapan | soyanna | soyala | search karanna | search karala | search karapan | google karanna | google karala | internet eken | internet eke | web eken | web eke | online balanna | online balala | check karanna | check karala | sources ekka | sources denna"),
  // Sinhala.
  words("හොයන්න | හොයලා | සොයන්න | සොයා | සොයලා | සර්ච් කරන්න | අන්තර්ජාලයෙන් | අන්තර්ජාලයේ | ඉන්ටර්නෙට් එකෙන් | වෙබ් එකෙන් | පරීක්ෂා කරන්න | තහවුරු කරන්න | මූලාශ්‍ර"),
];

const DEEP = [
  /\b(?:deep (?:research|dive)|research report|in[- ]depth (?:research|analysis|report|review|look)|comprehensive (?:research|analysis|report|review|overview|guide)|detailed (?:research|analysis|report|comparison)|thorough(?:ly)? (?:research|analy[sz]e|investigate|review)|literature review|market (?:research|analysis)|competitive analysis|state of the art|landscape of|full report|due diligence)\b/i,
  /^(?:please |can you |could you )?(?:research|investigate)\b/i,
  /\b(?:do|conduct|carry out|run) (?:some |a |an )?(?:deep |detailed |thorough |full )?(?:research|investigation)\b/i,
  /\bcompare\b[^.?!\n]{3,80}\b(?:across|on (?:price|cost|features|performance|speed|quality|safety))\b/i,
  words("gambura research | gamburu research | gamburin research | sampurna research | wisthara sahitha | research ekak karanna | research ekak | research karanna | research karala | parjeshanayak | report ekak | wishleshanayak | wisleshanayak | vishleshanayak | analysis ekak | market analysis"),
  words("ගැඹුරු පර්යේෂණ | ගැඹුරු research | පර්යේෂණයක් | සම්පූර්ණ පර්යේෂණ | ගැඹුරින් විශ්ලේෂණ | සවිස්තර වාර්තාවක් | වාර්තාවක් | විශ්ලේෂණයක් | වෙළඳපොළ විශ්ලේෂණ"),
  // "Compare these by price, speed and coverage", in Sinhala typed in English letters.
  /\bcompare kara(?:nna|la|pan)\b[^?!\n]{3,90}\b(?:anuwa|walin)\b/i,
];

/** Things that change: the answer is only right if it was checked now. */
const FRESH = [
  /\b(?:today|tonight|tomorrow|yesterday|right now|currently|current|latest|newest|live (?:scores?|updates?|stream|results?|blog|coverage|now|feed)|breaking|trending|this (?:morning|evening|week|month|year|season|quarter)|last (?:night|week|month|year)|recent(?:ly)?|nowadays|these days|so far|up[- ]to[- ]date|as of|just (?:released|announced|launched|happened|came out))\b/i,
  /\b(?:news|headlines?|price|prices|cost of|how much (?:is|are|does|do)|stock|share price|market cap|exchange rate|usd|lkr|inr|eur|gbp|bitcoin|crypto|weather|forecast|temperature|traffic|score|scores|standings|fixtures?|schedule|results?|who won|who is winning|election|release date|released|launch(?:ed|es)?|announce(?:d|ment|s)?|update|updates|version|changelog|deadline|open now|opening hours|in stock|available (?:now|yet)|still (?:alive|open|available|valid|true|the)|is .{2,40} down)\b/i,
  /\bwho (?:is|are) (?:the )?(?:current )?(?:president|prime minister|ceo|cto|head|leader|chairman|governor|minister|king|queen|owner|champion|richest|captain|coach|manager)\b/i,
  /\b(?:best|top|cheapest|fastest|most popular)\b[^.?!\n]{2,60}\b(?:20\d\d|right now|this year|today|to buy|available)\b/i,
  // Sinhala in English letters.
  words("ada | adha | dan | den | daen | dang | danma | heta | iye | aluth | aluthma | aluthin | aluthen | alut | nawathama | nawatama | me dawaswala | medawaswala | me welawe | me wenakota | puwath | puwat | prawurthi | pravurthi | mila | gana kiyada | ganana | kiyada | keeyada | kalagunaya | lakunu | vinimaya | winimaya"),
  // Sinhala.
  words("අද | දැන් | හෙට | ඊයේ | අලුත් | අලුත්ම | අලුතින් | නවතම | මේ දවස්වල | මේ වෙලාවේ | මෙම සතියේ | මේ සතියේ | මේ මාසේ | මේ අවුරුද්දේ | පුවත් | ප්‍රවෘත්ති | මිල | ගාන | කීයද | කාලගුණය | ලකුණු | විනිමය | තරගය | මැතිවරණය"),
];

/** The same in the other languages Chat is tested in (intent-words.ts). */
const FRESH_WORLD = [...FRESH_SPACED.map(words), ...FRESH_UNSPACED.map(anywhere)];

/** News and events: the news search runs beside the general one. */
const NEWS = [
  /\b(?:news|headlines?|announce\w*|launch\w*|release\w*|election|match|game|won|lost|died|killed|crash|earthquake|storm|flood|strike|protest|price|stock|rate|score|ceo|update|breaking|today|latest)\b/i,
  words("puwath | puwat | prawurthi | pravurthi | news | aluth | aluthma | ada | nawathama"),
  words("පුවත් | ප්‍රවෘත්ති | අද | අලුත් | අලුත්ම | නවතම"),
  ...NEWS_SPACED.map(words),
  ...NEWS_UNSPACED.map(anywhere),
];

/** A year from last year on: about now. */
function namesRecentYear(text: string, year: number): boolean {
  const found = text.match(/\b20\d\d\b/g) ?? [];
  return found.some((y) => Number(y) >= year - 1);
}

/**
 * Greetings, small talk and thanks. A message is a greeting only when nothing but these and a word of address is left in it:
 * "kohomada machan" is one, "kiribath hadanne kohomada" (how do I make milk rice) is a question that ends in the same word.
 */
const GREETING_WORDS = [
  "good morning | good afternoon | good evening | good night | good day | how are you doing | how are you | how r u | how are u | how's it going | hows it going | how is it going | what's up | whats up | wassup | nice to meet you | see you | goodbye | goodnight | hello | helo | hiya | hii | hiii | hi | heya | hey | yo | sup | gm | gn | bye | thanks | thank you | thank u | thx | ty | you're the best | you are the best | cheers",
  "kohomada | kohomda | kohomadha | kohomadaa | kohomd | mokada wenne | mokada karanne | mokadda karanne | suba udesanak | suba dawasak | suba rathriyak | suba sandawak | gihin ennam | pasuwa hamuwemu | ayubowan | stuti | sthuthi | bohoma stuti | bohoma sthuthi",
  "හායි | හෙලෝ | හලෝ | ආයුබෝවන් | කොහොමද | සුබ උදෑසනක් | සුබ දවසක් | සුබ රාත්‍රියක් | සුබ සන්ධ්‍යාවක් | ගිහින් එන්නම් | මොකද කරන්නේ | ස්තූතියි | බොහොම ස්තූතියි",
  ...GREETINGS_SPACED,
];
/** Words of address and emphasis that may sit beside a greeting. */
const ADDRESS = "there | everyone | all | friend | my friend | buddy | bro | mate | man | dude | team | farbaek | ai | again | so much | a lot | very much | today | machan | machang | bn | ban | yaluwa | yaluwe | malli | aiye | ayye | nangi | akke | sir | miss | bhai | ji | amigo | ithin | itin | oyata | oyaata | මචං | යාළුවා | ඉතින් | ඔයාට";
const GREETING_RE = new RegExp(`${wordsSource([...GREETING_WORDS, ADDRESS].join(" | "))}|${GREETINGS_UNSPACED.map((list) => list.trim().split(/\s*\|\s*/).join("|")).join("|")}`, "giu");
const GREETING_ONLY = new RegExp(`${wordsSource(GREETING_WORDS.join(" | "))}|${GREETINGS_UNSPACED.map((list) => list.trim().split(/\s*\|\s*/).join("|")).join("|")}`, "iu");

/** True when the message is a greeting, small talk or thanks and nothing else. */
export function isGreeting(text: string): boolean {
  const message = text.normalize("NFC").trim();
  if (message.length === 0 || message.length > 70 || !GREETING_ONLY.test(message)) return false;
  return !/[\p{L}\p{N}]/u.test(message.replace(GREETING_RE, " "));
}

const ABOUT_ASSISTANT = [
  /^(?:so |ok |and |hey |hi )?(?:who|what) are you\b|^what(?:'s| is) your name\b|^(?:so |ok |and |hey |hi )?what (?:can|could) you (?:actually |really |even )?do\b|^what are you (?:capable of|able to do)\b|^tell me about yourself\b|^who (?:made|built|created|trained) you\b|^are you (?:an? )?(?:ai|bot|robot|human|real|chatgpt|claude|gpt)\b|^which (?:model|ai) are you\b|^how do you work\b|^can you (?:speak|understand|write|talk in) [\p{L} ]{3,30}\??$/iu,
  words("oya kawda | oyaa kawda | oya kauda | oyage nama mokakda | oyage nama | oyata mokada puluwan | oyata monawada puluwan | oyata mokakda karanna puluwan | oyata mokakda krnna puluwan | oyata monawada karanna puluwan | oyata monawada krnna puluwan | oyata mokada karanna puluwan | oyata sinhala puluwanda | oya sinhala danna wada | oya ai kenekda"),
  words("ඔයා කවුද | ඔබ කවුද | ඔයාගේ නම | ඔබේ නම | ඔයාට මොනවද පුළුවන් | ඔයාට මොනවද කරන්න පුළුවන් | ඔයාට මොකක්ද කරන්න පුළුවන් | ඔබට මොනවද කරන්න පුළුවන් | ඔබට කුමක් කළ හැකිද | ඔයාට සිංහල පුළුවන්ද"),
];

/**
 * Writing that needs imagination, not facts: up to three describing words, then the kind of thing ("a catchy slogan", "a short
 * funny poem"). Essays, reports, articles and emails aren't here: they may need facts.
 */
const CREATIVE =
  /^(?:please |can you |could you |pls )?(?:write|compose|make up|create|give|tell)(?: me| us)? (?:a|an|some|another|one more|two|three|\d+) (?:[a-z-]+ ){0,3}?(?:poem|poems|story|stories|bedtime story|song|lyrics|joke|jokes|haiku|limerick|riddle|riddles|rap|verse|rhyme|toast|birthday wish|wishes|greeting|pickup line|pick-up line|love letter|tongue twister|caption|captions|tagline|slogan|motto|nickname|nicknames|pun|puns)\b/i;
const CREATIVE_SI = [
  words("kaviyak | kawiyak | kavi ekak | kavi ekk | poem ekak | kathawak | kathandarayak | story ekak | sinduwak | geethayak | sindu ekak | wihiluwak | vihiluwak | joke ekak | theravili | subapathumak"),
  words("කවියක් | කවි | කතාවක් | කතන්දරයක් | සින්දුවක් | ගීතයක් | විහිළුවක් | තේරවිලි | සුබපැතුමක් | joke එකක් | story එකක් | poem එකක්"),
];

/** Work on text the person gave: nothing outside it is needed. */
const ON_THEIR_TEXT = [
  /^(?:please |can you |could you |pls )?(?:translate|proofread|rewrite|reword|rephrase|paraphrase|shorten|simplify|fix (?:the |my )?(?:grammar|spelling|typos)|correct (?:the |my |this )?(?:grammar|spelling|text|sentence|paragraph)|check (?:the |my )?(?:grammar|spelling)|make (?:this|it) (?:shorter|longer|simpler|clearer|more (?:formal|polite|casual|professional|friendly))|summari[sz]e (?:this|the following|the text|the above|the paragraph|it)|convert (?:this|the following) (?:to|into))\b/i,
  words("translate karanna | translate karala | sinhalata harawanna | sinhalen liyanna | englishwalata harawanna | ingrisiyata harawanna | sinhalata translate | english walata translate | grammar hadanna | grammar check karanna | meka summarize karanna | meka keti karanna | meka liyanna"),
  words("පරිවර්තනය කරන්න | සිංහලට හරවන්න | ඉංග්‍රීසියට හරවන්න | ව්‍යාකරණ හදන්න | මේක කෙටි කරන්න | සාරාංශ කරන්න"),
];

/**
 * An instruction, a colon, then the text to work on ("meka keti karala denna: ...", "Shorten this for me: ..."): whatever the
 * text says, the job is on the text. The words name the job in English, in Sinhala typed in English letters and in Sinhala.
 */
const TRANSFORM = /translat|proofread|rewrit|reword|rephras|paraphras|shorten|simplif|summari[sz]|fix (?:the |my )?(?:grammar|spelling)|keti kar|kota kar|harawa|pariwarthana|grammar (?:hada|check)|waradi hada|aluthen liya|කෙටි කර|හරව|පරිවර්තන|සාරාංශ|ව්‍යාකරණ|නැවත ලිය|වැරදි හද/iu;
/** A question, not an order: "Is this correct: ..." asks about the text, it doesn't hand it over to be worked on. */
const ASKS = /\?|^(?:is|are|was|were|does|do|did|can|could|should|what|who|why|when|where|which|how)\b/i;

/** The instruction before the colon, when the message is an instruction, a colon and at least three words of text; else null. */
function givenTextInstruction(text: string): string | null {
  const colon = text.indexOf(":");
  if (colon < 4 || colon > 90) return null;
  const instruction = text.slice(0, colon);
  return TRANSFORM.test(instruction) && !ASKS.test(instruction.trim()) && wordCount(text.slice(colon + 1, colon + 400)) >= 3 ? instruction : null;
}

/**
 * A sum to work out, also when it ends in "how much" in Sinhala ("250 + 375 kiyada"). Only ever run on a short message: a sum
 * is short, and a pattern like this one is slow on a long run of spaces.
 */
const SUM = /^(?:(?:what(?:'s| is)|calculate|compute|solve)\s{1,3})?(?=[^a-z]{0,60}[+\-*/×÷^%x])[\s\d+\-*/×÷^().,=%x]{3,60}(?:\s{0,3}(?:kiyada|keeyada|kiyadha|කීයද|is what))?\s{0,3}\??$/iu;
const SUM_MAX = 100;

const any = (text: string, patterns: readonly RegExp[]) => patterns.some((re) => re.test(text));
function wordCount(text: string): number {
  return text.match(/[\p{L}\p{M}\p{N}]+/gu)?.length ?? 0;
}

/** Reads one message. `year` is the current year (for "2026" meaning now); `files` the number attached to it. */
export function readSearchNeed(input: { text: string; files?: number; year: number }): NeedReading {
  const text = input.text.normalize("NFC").trim();
  const head = text.slice(0, 600);
  const lead = text.slice(0, 160);
  const fenced = /```|~~~/.test(text);
  const explicit = any(head, EXPLICIT);
  const deep = any(head, DEEP);
  if (explicit) return { need: deep ? "deep" : "search", explicit: true, why: "asked for a search" };
  if (deep) return { need: "deep", explicit: false, why: "a research task" };

  const fresh = (part: string) => any(part, FRESH) || any(part, FRESH_WORLD) || namesRecentYear(part, input.year);

  // The person's own text or code to work on: what's inside it says nothing about what to look up. But the instruction itself
  // may ask for something current ("Summarize this week's AI news", "Translate the latest headlines"): then it is searched.
  // Where the instruction is half one thing and half the other, the planner model decides: never "none" on a guess.
  const mixed: NeedReading = { need: "unsure", explicit: false, why: "work on their own text that also asks about now" };
  const instruction = givenTextInstruction(text);
  if (instruction !== null) return fresh(instruction) ? mixed : { need: "none", explicit: false, why: "work on their own text" };
  if (any(lead, ON_THEIR_TEXT) && !fresh(text.includes(":") ? text.slice(0, text.indexOf(":")) : head)) return { need: "none", explicit: false, why: "work on their own text" };
  // Pasted code, unless the words around it ask about now ("is this still the latest API?").
  if (fenced) return fresh(head.replace(/(```|~~~)[\s\S]*?(?:\1|$)/g, " ")) ? mixed : { need: "none", explicit: false, why: "code or text they pasted" };
  if (CREATIVE.test(lead) || (text.length <= 160 && any(lead, CREATIVE_SI))) return fresh(lead) ? mixed : { need: "none", explicit: false, why: "creative writing" };
  if (text.length <= SUM_MAX && SUM.test(text)) return { need: "none", explicit: false, why: "a sum" };
  if (isGreeting(text)) return { need: "none", explicit: false, why: "a greeting" };

  if (fresh(head)) return { need: "search", explicit: false, why: "something that changes" };

  if (text.length <= 80 && any(text, ABOUT_ASSISTANT)) return { need: "none", explicit: false, why: "about the assistant" };

  return { need: "unsure", explicit: false, why: (input.files ?? 0) > 0 ? "a question with files" : "not clear from the words" };
}

/** True when the message says "today", "latest", "news" or "price" in any language the lists cover. */
export function soundsFresh(text: string, year: number): boolean {
  const head = text.normalize("NFC").slice(0, 600);
  return any(head, FRESH) || any(head, FRESH_WORLD) || namesRecentYear(head, year);
}

/**
 * A roundup (stage 278, ADR 0285): the person asks for news, updates or headlines on a subject, not for one fact. "Today's tech
 * news" and "AI updates" are; "did the launch happen today" and "the price of gold" aren't. A roundup is searched as news
 * in every part, ranked with newsrooms a little ahead, and written as a list of stories.
 */
const ROUNDUP = [
  /\b(?:news|headlines|updates|news round-?up|round-?up of|(?:news|daily|weekly|morning) digest|digest of|briefing|what(?:'s| is| has)(?: been)? (?:happening|going on)|latest in|catch me up|bring me up to date)\b/i,
  // Sinhala in English letters, and Sinhala.
  words("puwath | puwat | prawurthi | pravurthi | updates | aluth dewal | aluth de | aluth tika | mokada wenne | mokada une"),
  words("පුවත් | ප්‍රවෘත්ති | යාවත්කාලීන | අලුත් දේවල් | අලුත් තොරතුරු"),
  ...NEWS_SPACED.map(words),
  ...NEWS_UNSPACED.map(anywhere),
];

/**
 * A question with one answer, by how it opens: "did…", "is…", "who…", "how…". Such a message can hold a roundup's words and
 * mean something else ("Is Fox News owned by Disney?", "Did Apple release any security updates?"), so its words alone never
 * make it a roundup; the planner model may still say it is one. "What…" is left out: "what are the headlines" is a roundup.
 */
const ONE_ANSWER = /^\s*(?:(?:hey|hi|hello|ok|okay|so|and|please)[,!\s]+)?(?:did|does|do|is|are|was|were|has|have|had|can|could|should|would|will|who|whom|whose|when|where|why|how|which)\b/i;

/** True when the message's own words ask for a roundup of news or updates. */
export function soundsLikeRoundup(text: string): boolean {
  const head = text.normalize("NFC").slice(0, 600);
  if (ONE_ANSWER.test(head)) return false;
  return ROUNDUP.some((re) => re.test(head));
}

/** True when the message is about news or events, so the news search runs too. */
export function soundsLikeNews(text: string): boolean {
  const head = text.normalize("NFC").slice(0, 600);
  return NEWS.some((re) => re.test(head));
}
