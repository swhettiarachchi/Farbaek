/**
 * Sinhala questions and the search words their fallback query must carry (stage 206, ADR 0223): what the plan made without a
 * model has to find, and the request words it must never send to a search engine. Written for this test.
 */
export type GlossCase = readonly [question: string, has: readonly string[], never: readonly string[]];

export const GLOSS_SINGLISH: GlossCase[] = [
  ["mata ada tech industire eka aluth details denna", ["today", "tech", "latest"], ["mata", "denna", "eka", "details"]],
  ["mata international tech news kiyanna", ["international", "tech", "news"], ["mata", "kiyanna"]],
  ["Mata aluth AI news tikak kiyanna.", ["latest", "AI", "news"], ["mata", "tikak", "kiyanna"]],
  ["Mata latest AI news tika Sinhala walin kiyanna.", ["latest", "AI", "news"], ["mata", "walin", "sinhala", "kiyanna"]],
  ["ada dollar eka kiyada", ["today", "dollar", "price"], ["eka", "kiyada"]],
  ["dan ran mila kiyada", ["now", "gold", "price"], ["dan", "mila"]],
  ["ada kolamba kalagunaya kohomada", ["today", "Colombo", "weather"], ["kalagunaya", "kohomada"]],
  ["lankawe janadhipathi kawda", ["Sri Lanka", "president"], ["lankawe", "kawda"]],
  ["aluthma iphone eka mokakda", ["latest", "iphone"], ["aluthma", "mokakda", "eka"]],
  ["mt ada news tika kynna", ["today", "news"], ["mt", "kynna", "tika"]],
  ["thel mila ada kiyada", ["fuel", "price", "today"], ["thel", "mila"]],
  ["lankawe mathiwaranaya gena aluth thorathuru", ["Sri Lanka", "election", "latest"], ["gena", "thorathuru"]],
  ["kreeda puwath monawada ada", ["sports", "news", "today"], ["puwath", "monawada"]],
  ["bitcoin price eka ada kiyada", ["bitcoin", "price", "today"], ["eka", "kiyada"]],
  ["arthikaya gena aluth puwath denna", ["economy", "latest", "news"], ["gena", "denna"]],
  ["oyata puluwanda mata samsung s26 gena kiyanna", ["samsung", "s26"], ["oyata", "puluwanda", "mata", "gena", "kiyanna"]],
  ["heta kolamba wessa thiyenawada", ["tomorrow", "Colombo", "rain"], ["thiyenawada"]],
  ["hondama laptop eka mokakda", ["best", "laptop"], ["hondama", "mokakda"]],
  ["iphone saha samsung wenasa mokakda", ["iphone", "samsung", "difference"], ["saha", "wenasa", "mokakda"]],
  ["wibhaga prathipala ada enawada", ["exam", "results", "today"], ["wibhaga", "prathipala"]],
  ["AI gena aluth thakshanika puwath", ["AI", "latest", "technology", "news"], ["gena", "puwath"]],
  ["poli anupathaya dan kiyada", ["interest rate", "now", "price"], ["poli", "kiyada"]],
  ["lankawe wahana mila gena kiyanna", ["Sri Lanka", "vehicles", "price"], ["lankawe", "gena", "kiyanna"]],
  ["mta dn aluth puvath krnna one", ["latest", "news"], ["mta", "krnna"]],
];

export const GLOSS_SINHALA: GlossCase[] = [
  ["මට අලුත් AI news ටිකක් කියන්න.", ["latest", "AI", "news"], ["මට", "කියන්න", "ටිකක්"]],
  ["අද පුවත් මොනවද?", ["today", "news"], ["මොනවද"]],
  ["තෙල් මිල අද කීයද?", ["fuel", "price", "today"], ["කීයද"]],
  ["ශ්‍රී ලංකාවේ ජනාධිපති කවුද?", ["Sri Lanka", "president"], ["කවුද"]],
  ["අද කොළඹ කාලගුණය කොහොමද?", ["today", "Colombo", "weather"], ["කොහොමද"]],
  ["නවතම තාක්ෂණ පුවත් දෙන්න", ["latest", "technology", "news"], ["දෙන්න"]],
  ["රන් මිල දැන් කීයද?", ["gold", "price", "now"], ["කීයද"]],
  ["ආර්ථිකය ගැන අලුත් පුවත්", ["economy", "latest", "news"], ["ගැන"]],
  ["ජාත්‍යන්තර ක්‍රීඩා පුවත් කියන්න", ["international", "sports", "news"], ["කියන්න"]],
  ["හොඳම laptop එක මොකක්ද?", ["best", "laptop"], ["එක", "මොකක්ද"]],
  ["මැතිවරණය ගැන අලුත් තොරතුරු", ["election", "latest"], ["ගැන", "තොරතුරු"]],
  ["Samsung සහ iPhone වෙනස මොකක්ද", ["Samsung", "iPhone", "difference"], ["සහ", "මොකක්ද"]],
];
