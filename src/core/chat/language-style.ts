/**
 * How to write well in a language, beyond which language to write (stage 206, ADR 0223). Framework-free.
 *
 * The language note (language-plan.ts) tells the model which language and script to answer in. For a language that models
 * write less naturally than English, that isn't enough: the answer comes out as English sentences in translated words, or in
 * the stiff register of official documents. A short style note, sent with the language note, fixes the register and names what
 * to avoid. Published work on low-resource languages found that naming what not to write, and a few grammar notes, improved
 * output more than examples did (Tulu, 2026: 12 to 22 points); nothing here is a translation step, and the person's message
 * still goes to the model unchanged.
 *
 * Sinhala has its own note, built from how Sinhala is written online today: everyday written Sinhala with spoken verb forms,
 * English technical terms kept in English letters, the literary register only when the person uses it. Every other language
 * shares one general sentence. A language gets its own note only with examples to test it against (language.golden.ts).
 */

const SINHALA = [
  "How to write Sinhala here: write as a fluent Sri Lankan explains something to a person they respect, in today's everyday written Sinhala. Compose the sentences in Sinhala; never translate English sentences word by word.",
  "Use the verb forms and words people really write to each other: කරනවා, තියෙනවා, වෙනවා, පුළුවන්, නැහැ, මේක, ඒක, නිසා, එක්ක, වගේ. Avoid the forms of official documents and news bulletins (කරයි, ඇත, වේ, හැකිය, මෙය, එය, මෙම, හේතුවෙන්, සමඟ) and passives with විසින් ... කරනු ලැබේ, unless the person writes that way themselves or asks for a formal document or letter.",
  "Follow how the person addresses you: ඔයා in a casual conversation, ඔබ in a formal one. Put the verb at the end, keep sentences short, one idea in each, and join ideas the way Sinhala does (නිසා, ඒත්, ඒ වගේම), not with English punctuation habits.",
  "Keep well-known technical and product words in English letters, as people say them: AI, app එක, update එකක්, software, cloud, website එක. Explain an unfamiliar term once in simple Sinhala, and don't coin a Sinhala word for a technical term. Headings, table headers and list labels are in Sinhala too; numbers are in Western digits; conjunct letters are written correctly (ශ්‍රී, ක්‍ර, ප්‍ර).",
].join(" ");

const SINGLISH =
  "How to write Sinhala in English letters here: spell words the way most people type them, in full and the same way each time (mata, oyata, karanna, puluwan, thiyenawa, nisa, wage), with everyday spoken forms, not formal ones. English technical words stay as they are.";

const GENERAL =
  "Write it as a fluent native writer would, not as a translation from English: natural word order, everyday words, and the names people there really use for technical things (the English term where that is what they say).";

/**
 * The style note for an answer in `language`, or null when there's nothing to add (English, or no language known).
 * `latin` is true when the answer is to be in English letters.
 */
export function styleNote(language: string | null, latin: boolean): string | null {
  if (!language || language === "en") return null;
  if (language === "si") return latin ? SINGLISH : SINHALA;
  return latin ? null : GENERAL;
}
