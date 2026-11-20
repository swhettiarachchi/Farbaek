/**
 * A search query from a Sinhala question when no model could write one (stage 206, ADR 0223). Framework-free.
 *
 * The planner model normally turns a question into search queries. When it is late or fails, the question itself used to go to
 * the search engines, and Sinhala typed in English letters ("mata ada tech industry eka aluth details denna") found pages that
 * happened to contain "mata" and "denna". This reads the question word by word instead: request words (to me, tell, give, about)
 * are dropped, common topic words become English (ada: today, aluth: latest, puwath: news), and every other word is kept as it
 * is, since it is usually an English term or a name. The result is rough, and only the fallback: it never replaces the model,
 * and it never changes the message the model answers.
 */

/** "a=b; c d=e" as a map: several spellings on the left of "=", one meaning on the right. A spelling of two words is written with "_". */
function lexicon(...parts: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of parts.join(";").split(";")) {
    const [left, right] = entry.split("=");
    if (!left || right === undefined) continue;
    for (const spelling of left.trim().split(/\s+/)) if (spelling) map.set(spelling.replace(/_/g, " ").normalize("NFC"), right.trim());
  }
  return map;
}

const list = (...parts: string[]) => new Set(parts.join(" ").normalize("NFC").split(/\s+/).filter(Boolean));

/** Sinhala in English letters: words that carry the request, not the topic. */
const DROP_LATIN = list(
  "mata mage mama man mn oya oyaa oyage oyata oyala api apita ape apee apiwa eya eyata eyala",
  "eka ekak eke ekee ekata ekai ekath ekakata ekaka ekakda ekada meka mekata mewa mekee me mee e ee oka okata",
  "gena gana gaena gaana gatha pilibanda pilibandawa sambandawa sambandayen",
  "kiyanna kiyannako kiyapan kiyala kiyalada kiyanawada kiyanne denna dennako dipan dennam pennanna pennanna pennana balanna balala balapan",
  "karanna karannako karala karapan karanne puluwanda puluwan puluwanda pulwanda da dha the",
  "tika tikak tikka tikk podi poddak podda wisthara wistharak visthara vistharak details detail info",
  "ekka samaga saha ha hari ne neda nam wage wagey wge wage thawa tawa ithin itin ehenam",
  "please plz pls machan machang bn ban bro aiye ayye malli nangi sir miss",
  "thiyenawada thiyenawa tiyenawa tiyenawada thiyenne innawa wenawa wenne wenawada",
  "sinhalen sinhalenma englishwalin walin valin",
  // Typed fast, with vowels left out (counted in the Swa-Bhasha comment pairs, Apache-2.0).
  "mt mta mat mge mm mam oy oyta oyat ek ekk ekt aka akak akata mek meeka eeka ooka",
  "kynna kiyann denn danna krnn krnna kranna blnna balnna kyl kiyl kiyla krl krla puluwn puluvan",
  "tikk gdk godk godak nm thwa thava vage wenwa innwa karanwa karanawa karanava thynwa thiyanawa",
  "thorathuru toraturu vistara ow ou hri mokda mkda monada",
);

/** Sinhala in English letters: common topic words, as English search words. */
const GLOSS_LATIN = lexicon(
  "ada adha=today; heta=tomorrow; iye=yesterday; dan den daen dang danma=now",
  "aluth alut aluthma aluthin aluthen nawathama nawatama=latest; parana=old",
  "puwath puwat prawurthi pravurthi=news; lokaye loke lokaya lowa=world; jathyanthara jathyantara=international",
  "lankawe lankawa lankave srilankawe=Sri Lanka; rata=country; kolamba=Colombo",
  "mila ganan ganana=price; kiyada keeyada=price; salli mudal=money; ran=gold; thel=fuel; baddu=tax; poli poliya=interest rate",
  "kalagunaya=weather; wessa wahinawa=rain",
  "kreeda kreedawa=sports; tharagaya tharaga=match; lakunu=score",
  "deshapalanaya deshapalana=politics; arthikaya arthika=economy; wiyaparaya wiyapara vyapara=business",
  "thakshanaya thakshana thakshanika takshana=technology; karmanthaya karmantha=industry; wignanaya vidyawa widyawa=science",
  "saukya sawukya sawkya=health; adyapanaya adyapana=education; wibhagaya wibhaga=exam; prathipala=results; rassawa rakiya=jobs",
  "rajaya anduwa=government; janadhipathi=president; agamathi=prime minister; mathiwaranaya chandaya=election; neethiya neethi=law",
  "mkkd mokkd=; kohmd=; kawuda=who; kohada=where; kwdd=when; kochchara kochchra kochara=how much; puvath=news",
  // Everyday topics people ask about: money, food, weather, transport, school, the state.
  "rattaran=gold; pol=coconut; elawalu=vegetables; haal=rice; pan=bread; kiri=milk; seeni=sugar; gas=gas; diesel=diesel; petrol=petrol",
  "lanka=Sri Lanka; yapanaya yapanayata yapane=Jaffna; nuwara mahanuwara=Kandy; galla=Galle; indiyawa=India; pakisthanaya=Pakistan",
  "ganwathura=flood; niyangaya=drought; suli_sulanga=cyclone; bhumi_kampawa=earthquake; kochchi dumriya=train; bus=bus; guwan=flight",
  "padi padiya=salary; wadi=increase; rajaye=government; sewakayange sewakayo=employees; thahanama=ban; uddhamanaya=inflation; aya_wayaya ayawayaya=budget",
  "shishyathwa shishyathwaya=scholarship; wibhage=exam; a/l=A/L; o/l=O/L; light_kapana light_kapanawa power_cut=power cut; widuli=electricity; jala=water",
  "kohomada kohomda kohomadha=; kawda kauda=who; koheda kohe=where; kawadada=when; mokakda mokadda monawada mokada=",
  "hondama=best; lesi=easy; ikman=fast; wenasa=difference; sansandanaya=comparison; hadanne hadanna hadaganna=how to make; igenaganna=learn",
  "durakathana durakathanaya=phone; parigananaka pariganakaya=computer; antharjalaya=internet; wahana=vehicles; gedara niwasa=house; idam=land",
);

/** Sinhala script: request words. */
const DROP_SINHALA = list(
  "මට මගේ මම ඔයා ඔබ ඔයාට ඔබට අපි අපට අපිට",
  "එක එකක් එකේ එකට එකයි මේක මේකට මේ ඒ ඕක",
  "ගැන පිළිබඳ පිළිබඳව සම්බන්ධව සම්බන්ධයෙන්",
  "කියන්න කියන්නකෝ කියලා දෙන්න දෙන්නකෝ පෙන්වන්න බලන්න කරන්න කරලා පුළුවන්ද පුළුවන් ද",
  "ටික ටිකක් පොඩි පොඩ්ඩක් විස්තර විස්තරයක් තොරතුරු",
  "එක්ක සමග සමඟ සහ හා හරි නේ නේද නම් වගේ තව ඉතින් එහෙනම් කරුණාකර",
  "තියෙනවා තියෙනවාද තියෙන්නේ ඉන්නවා වෙනවා වෙන්නේ",
  "සිංහලෙන් ඉංග්‍රීසියෙන්",
);

/** Sinhala script: common topic words, as English search words. */
const GLOSS_SINHALA = lexicon(
  "අද=today; හෙට=tomorrow; ඊයේ=yesterday; දැන්=now",
  "අලුත් අලුත්ම අලුතින් නවතම=latest; පරණ=old",
  "පුවත් ප්‍රවෘත්ති=news; ලෝකයේ ලෝක ලෝකය=world; ජාත්‍යන්තර=international",
  "ලංකාවේ ලංකාව=Sri Lanka; ශ්‍රී=; රට රටේ=country; කොළඹ=Colombo",
  "මිල ගාන ගණන්=price; කීයද=price; සල්ලි මුදල්=money; රන්=gold; තෙල්=fuel; බදු=tax; පොලී පොලිය=interest rate",
  "කාලගුණය කාලගුණ=weather; වැස්ස=rain",
  "ක්‍රීඩා ක්‍රීඩාව=sports; තරගය තරග=match; ලකුණු=score",
  "දේශපාලන දේශපාලනය=politics; ආර්ථික ආර්ථිකය=economy; ව්‍යාපාර ව්‍යාපාරය=business",
  "තාක්ෂණ තාක්ෂණය තාක්ෂණික=technology; කර්මාන්තය කර්මාන්තයේ කර්මාන්ත=industry; විද්‍යාව විද්‍යා=science",
  "සෞඛ්‍ය සෞඛ්‍යය=health; අධ්‍යාපන අධ්‍යාපනය=education; විභාග විභාගය=exam; ප්‍රතිඵල=results; රැකියා රස්සා=jobs",
  "රජය ආණ්ඩුව=government; ජනාධිපති=president; අගමැති=prime minister; මැතිවරණය මැතිවරණ=election; නීතිය නීති=law",
  "කොහොමද=; කවුද=who; කොහෙද=where; කවදාද=when; මොකක්ද මොනවද=",
  "යාපනයේ යාපනය යාපනයට=Jaffna; මහනුවර නුවර=Kandy; ගාල්ල ගාල්ලේ=Galle; ඉන්දියාව ඉන්දියාවේ=India; පාකිස්තානය පාකිස්තානයේ=Pakistan",
  "ඩීසල්=diesel; පෙට්‍රල්=petrol; ඩොලරයේ ඩොලරය ඩොලර් ඩොලර්=dollar; එළවළු=vegetables; පොල්=coconut; හාල්=rice; ගෑස්=gas",
  "වර්ධන වර්ධනය=growth; උද්ධමනය=inflation; අයවැය=budget; වැටුප් වැටුප=salary; ගංවතුර=flood; දුම්රිය කෝච්චි=train; විදුලිය විදුලි=electricity; ශිෂ්‍යත්ව=scholarship",
  "හොඳම=best; වෙනස=difference; සංසන්දනය=comparison; දුරකථන=phone; පරිගණක=computer; අන්තර්ජාලය=internet; වාහන=vehicles",
);

/** Two-word spellings in the lists above, looked up before single words. */
const PAIRS = new Map([...GLOSS_LATIN].filter(([spelling]) => spelling.includes(" ")));

export interface Gloss {
  /** The English-leaning query: request words gone, known words in English, the rest kept. */
  query: string;
  /** Words that carried the topic (kept or translated). */
  kept: number;
  /** Of those, how many were translated from Sinhala. */
  translated: number;
  /** Sinhala words that were neither dropped nor known: the query still carries them. */
  unknown: number;
}

const SINHALA = /\p{Script=Sinhala}/u;

/** Reads a Sinhala question, in its own script or in English letters, into a rough English search query. */
export function glossSinhala(text: string): Gloss {
  // "Sinhala walin", "in Sinhala": the language to answer in, not part of the topic.
  // A question is short: only its beginning is read, so a long paste costs nothing.
  const topic = text.slice(0, 600).normalize("NFC").replace(/\b(?:sinhala|singlish|english|tamil)\s+(?:walin|valin|wlin|basawen|bhashawen)\b|\bin (?:sinhala|singlish|english|tamil)\b/gi, " ");
  const tokens = topic.match(/[\p{L}\p{M}\p{N}\u200d][\p{L}\p{M}\p{N}\u200d'’.+#-]*/gu) ?? [];
  const out: string[] = [];
  let translated = 0;
  let unknown = 0;
  for (let t = 0; t < tokens.length; t++) {
    const raw = tokens[t]!;
    const word = raw.replace(/[.'’+-]+$/, "");
    if (!word) continue;
    // Two words that mean one thing ("light kapana": a power cut).
    const pair = PAIRS.get(`${word.toLowerCase()} ${(tokens[t + 1] ?? "").toLowerCase()}`);
    if (pair) {
      if (!out.includes(pair)) out.push(pair);
      translated++;
      t++;
      continue;
    }
    const own = SINHALA.test(word);
    const key = own ? word : word.toLowerCase();
    if ((own ? DROP_SINHALA : DROP_LATIN).has(key)) continue;
    const meaning = (own ? GLOSS_SINHALA : GLOSS_LATIN).get(key);
    if (meaning !== undefined) {
      if (meaning && !out.includes(meaning)) out.push(meaning);
      if (meaning) translated++;
      continue;
    }
    if (own) unknown++;
    out.push(word);
  }
  return { query: out.join(" ").replace(/\s{2,}/g, " ").trim(), kept: out.length, translated, unknown };
}
