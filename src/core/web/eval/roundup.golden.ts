/**
 * Messages that ask for a roundup of news or updates, and messages that do not (stage 278, ADR 0285). Each must be read as it
 * is listed: a word added to the roundup words in intent.ts needs its case here, on the side it belongs.
 */
export const ROUNDUPS: readonly string[] = [
  "tech news today",
  "Give me today's tech updates",
  "what are the headlines this morning",
  "AI news",
  "cricket updates",
  "a quick digest of the week in AI",
  "what's happening in the markets",
  "what is going on with OpenAI",
  "the latest in robotics",
  "catch me up on space",
  "morning briefing please",
  // Sinhala typed in English letters, and Sinhala.
  "mata ada tech updates kiyanna",
  "mata ada new tech updates denna",
  "ada puwath monawada",
  "lankawe prawurthi",
  "අද තාක්ෂණික පුවත්",
  "අද ප්‍රවෘත්ති කියන්න",
  "තාක්ෂණික යාවත්කාලීන කියන්න",
  // Other languages Chat is tested in.
  "noticias de tecnología de hoy",
  "aaj ki khabar",
  "aktuelle nachrichten",
  "今日のニュース",
];
export const NOT_ROUNDUPS: readonly string[] = [
  "did the launch happen today",
  "what is the price of gold",
  "who won the match last night",
  "What is new in Node.js?",
  "when was the iPhone 17 released",
  "explain how a transformer works",
  "write a poem about the sea",
  "translate this to French: good morning",
  "ada kalagunaya kohomada",
  "තෙල් මිල කීයද?",
  "newsletter template for my bakery",
  "how do I update my phone",
  // A roundup's words, meaning something else.
  "Did Apple release any security updates for iOS 26.1?",
  "Is Fox News owned by Disney?",
  "Roundup weedkiller lawsuit settlement amount",
  "how long does it take to digest lactose",
  "what is the latest on the Boeing strike",
  "latest on the election",
  "who reads the news on Channel 4",
  "has there been any news about my visa application rules",
  "when is the next Windows update",
  "is no news good news",
];
