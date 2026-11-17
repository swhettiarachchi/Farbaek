# Stage 204: Farbaek AI answers in the language a person writes, however they type it

- **Date:** 2026-11-17
- **Branch:** `feat/stage-204-multilingual` (built on stage 203's branch)
- **Decision:** ADR 0221
- **Migration:** none. **New dependency:** none.

## What the owner asked

The "Universal Multilingual Intelligence Engine" specification: understand the language a person means, not the alphabet they type it in; Singlish, Hinglish, Tanglish, Roman Urdu, Arabizi, romanized Russian, Pinyin, Romaji and romanized Korean answered in their own scripts; German, Italian, Romanian, French and other Latin-script languages answered in themselves; technical terms kept; explicit requests and saved preferences followed in a set order; short and unclear messages handled by confidence and the conversation; no translation into English first, no extra model call, no fabricated results or untested claims; built into the existing Claude and OpenAI pipeline.

## What was built

- **The reader** (`src/core/chat/language.ts`, with `language-profiles.ts` and `language-romanized.ts`): scripts by Unicode property; Latin letters by each language's common words, diacritic letters and word shapes; Arabic's digits-for-sounds; Pinyin syllables; technical words, code, links and paths ignored; close relatives too near to call named as a family.
- **Requests** (`language-requests.ts`): lasting ("answer in English", "English please", "Sinhalen kiyanna", "Hindi mein batao", "Singlish", "use English letters"), for one answer ("explain recursion in Sinhala"), and look-alikes ignored (translation questions, "I speak Hindi", "which countries speak French").
- **The plan and the note** (`language-plan.ts`): the owner's priority order; the conversation's language and earlier requests read from the person's own messages in the branch, so nothing new is stored; a fixed-wording note that stays identical through a one-language conversation; a typed, validated analysis record with the specification's fields (`analyzeLanguage`).
- **The pipeline**: the note goes to Claude as a second system block after the unchanged, cached system prompt, and to OpenAI after the instructions; five new system prompt lines; chat titles in the answer's language and script; every fallback model gets the same note; the person's messages are sent unchanged.
- **Settings**: "Answer in" (the language I write in, or any tested language) and "Languages with their own script" (their own script, or English letters), with Chat's other preferences in this browser, checked again by the server.

## Verified

- **Every example sentence in the specification** reads as the right language: Sinhala, Hindi, Tamil, Urdu (as Hindi or Urdu), Arabic, Russian (twice), Chinese, Japanese and Korean typed in English letters, none of them as English and none with low confidence; German (twice), Romanian and Italian in their own alphabets; the three mixed sentences keep their language and are marked mixed; "Hi", "No", "Ma", "Tu", "Na" and "Me" read as unclear.
- **One example for every language offered in settings** (50 languages) reads right, and a test fails if one is added without an example.
- **The labelled set** (`language.golden.ts`, 77 sentences across 50 languages, scripts and short messages), first run before any tuning: language right **76 of 77**, script **77 of 77**, typed-in-English-letters or not **77 of 77**. The one miss: "Wir fahren am Wochenende an die Ostsee" (German) read as English with low confidence. Honest limits: these sentences and the word lists were written by the same author (Claude) in the same session, so this isn't an independent test, and no native speaker has checked them. Words that had slipped from the set into the lists were taken out before the first run. One change came after it (the Danish, Norwegian or Swedish family, found by the settings examples, not by the set); the set's result didn't change.
- **Requests, priority and memory**: requests in many forms and look-alikes that aren't requests; a request beats the settings and the reading; an earlier lasting request holds until a newer one; a one-answer request doesn't last; a stale setting never beats a request; English letters from a request or the setting; unknown settings ignored; a short message keeps the conversation's language; a clear new language switches; a request-only message isn't taken as the conversation's language.
- **The note**: says Sinhala typed in English letters isn't English and asks for Sinhala script; identical across a one-language conversation (so caching holds); names a Latin-script language only as a reading; never contains the person's words, even when they try to give instructions.
- **The providers**: Claude gets the system prompt as its first block and the note second, with caching on; OpenAI gets the note after its instructions; both send the person's message unchanged. In the turn: the note is built for a new question, a short follow-up, the saved setting and an answer asked again, and left out when there's nothing to say.
- **Speed and size**, measured on this PC over several runs: 0.02 to 0.07 ms per reading, 0.3 to 0.5 ms per turn's whole plan (the question and 12 earlier messages), 2 to 4 ms for a 12,000-character message; ten earlier 32,000-character pastes with no spaces add 4 to 17 ms in all. The note is at most 268 characters (about 70 tokens) and the new system prompt lines 1,389 characters (about 350 tokens), both estimated from characters, not counted by a tokenizer.
- **Ordinary English stays English**: of 9,733 English sentences from the decision records, 11 (0.11%) read as another language with medium or high confidence, mostly short list items such as "Alt text on images"; before the review's fixes it was 53 of 9,023.
- **Settings in the browser** (demo workspace, phone width): the Language section shows, choosing Sinhala and English letters saves both, 51 options (automatic and 50 languages), the field is 44px tall with 16px text, no sideways scroll, no console errors.
- Lint and the type check on everything changed; the design tests and all chat tests.

## A fresh review, and what it found

A second agent read and probed the stage without having written it. It confirmed the turn reads the right question for every action, every fallback model gets the note, the messages are sent unchanged, none of the person's words can reach the note, and the setting is checked on the server. It found real problems, all fixed and tested before the first commit:
- **Speed on hostile input**: a 32,000-character paste of one long word took seconds to read (66 s with ten earlier copies), blocking the server before usage was checked. The text is now cut before any pattern runs, every pattern has bounded runs, and words over 40 characters are skipped.
- **False lasting requests**: "use Spanish for the button text", "Use Chinese characters for the logo", "How do I type Sinhala letters on Windows?", "What is pinyin?", a bare "Japanese" and "Do you speak Japanese?" each switched the conversation's language. A lasting request now needs a verb said to Farbaek AI and must end with the language; a bare language name is for one answer.
- **Negation**: "No English please" asked for English, and "Write in English letters please, I can't read Sinhala script" asked for Sinhala script. Both now mean what they say.
- **A request worded as a sentence** ("Please use English letters from now on for all of your answers") became the conversation's language. Requests up to 20 words no longer count as one.
- **Firm notes from shaky readings**: "5th", "2nd" and "2fa" read as Arabic, "ok" as Hungarian, "go on" as Polish, "per" made English Italian, a quoted or named word in another script decided a sentence. Now: an uncertain reading sends no note (the model judges), one recognised word is never enough, ordinals and hex aren't Arabic, quoted text is left out, and scripts are weighed by words, not letters.
- **Missed requests** now caught: "Can we switch to English?", "I'd like answers in English", "Mata sinhalen kiyala denna", "English eken kiyanna", and "Translate this to French and answer in English from now on" (translation is now judged per clause).
- Smaller: the system prompt now says a request for one answer is for that answer; the comments on caching say what really happens (a language change re-reads the conversation once); a stored setting such as "toString" no longer passes the browser's check.

The full test suite also showed one unhandled error both times, from `src/agent-runtime/mesh/mesh.test.ts` (a temporary folder not yet empty when it was removed, on Windows, under load). That file passes alone and nothing in this stage touches it.

## Live, and what the real models did

Merged as #268 on 2026-11-17 at 14:26:18, after the Next.js 16.4.5 upgrade (#269, 14:26:05). Production showed #269's build (`3cf7e4b19cf7`) at 14:31:58 and main's tip, both merges (`e871e237f47c`), at 14:38:33; the homepage, `/chat` and `/api/health` answered 200.

Real messages in the owner's Chrome, signed in, Free plan, Auto and Quick unless said, each in a new chat:

| Message | Answered by | Answer | Chat title |
| --- | --- | --- | --- |
| "Mata website ekak hadaganna one." | GPT-6 Luna | Sinhala, in Sinhala script: asks what kind of site (business, online shop, portfolio, blog); "portfolio" kept | "වෙබ් අඩවියක් හදමු" (Sinhala) |
| then "ok" | GPT-6 Luna | Sinhala script, asks the site's purpose, name and pages; "Home, About, Contact, products" kept | |
| then "Answer in English letters" | GPT-6 Luna | **English** ("Hari. What kind of website…"): not what was asked | |
| the same, answered again | Claude Haiku 5.5 (second opinion) | **Partly**: its four questions in Sinhala in English letters ("Website eke nama mokakda?"), the sentences around them in English | |
| then "Can we switch to English?" | GPT-6 Luna | English | |
| "Mujhe ek website banani hai." | GPT-6 Luna | Hindi, in Devanagari, on topic | "वेबसाइट बनाने की शुरुआत" (Hindi) |
| "Privet, kak dela?" | GPT-6 Luna | Russian, in Cyrillic: "Привет! Всё хорошо, спасибо 😊 А у тебя?" | "Приветствие на русском" (Russian) |
| "Wie kann ich meine Website verbessern?" | GPT-6 Luna | German, eight practical steps | "Website gezielt verbessern" (German) |
| "Come posso creare un sito web?" | GPT-6 Luna | Italian; WordPress, HTML, CSS and JavaScript kept | "Creare un sito web" (Italian) |
| "Mata website ekak hadanna one using Next.js and Supabase." | Claude Haiku 5.5, picked by hand | Sinhala, in Sinhala script: a step-by-step guide with Next.js, Supabase, Row Level Security and every code block kept as written | "Next.js සහ Supabase වෙබ් අඩවිය" (Sinhala) |

**Works live:** typed-in-English-letters Sinhala, Hindi and Russian answered in their own scripts; German and Italian in themselves; technical terms and code kept; a short "ok" keeps the conversation's language; "Can we switch to English?" switches; chat titles in the answer's language and script; both GPT-6 Luna and Claude Haiku 5.5 follow the note for language and script.

**Doesn't work yet: asking for English letters.** The note was right: run on the same conversation, the live code sent "Answer in Sinhala, written in English letters the way the person types it, not in Sinhala script… They asked for this way of writing it." GPT-6 Luna still answered in English, and Claude Haiku 5.5 did it only for part of its answer. When the request is itself written in English, the models lean to English. To fix: stronger wording in the note and the system prompt for this case (Sinhala words and grammar, spelled in English letters, not English), checked live again on both models.

**The fix (same day).** For a language with its own script answered in English letters, the note now names the form people know ("often called Singlish", Hinglish, Tanglish, Roman Urdu, Arabizi, Romaji, Pinyin), says it means that language's words and grammar spelled in English letters, "not English and not Sinhala script", that "they mean Sinhala spelled in English letters, not the English language", and to write every sentence that way "even when their latest message is in English". The system prompt's own-script rule now says a request for English letters means the person's language spelled in English letters, never the English language. Notes for ordinary own-script answers are unchanged, so caching for them is unaffected. Tested in the note and prompt tests; whether the live models now follow it is checked after the merge.

## Not verified yet

- Whether GPT-6 Luna and Claude Haiku 5.5 now answer "Answer in English letters" in Singlish: re-checked live after the merge.
- Accuracy on messages from real people, with their own spellings.
- Tamil, Urdu, Arabic, Chinese, Japanese and Korean typed in English letters, and Romanian, were checked by tests but not yet with live answers.
