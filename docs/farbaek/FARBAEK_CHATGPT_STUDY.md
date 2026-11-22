# How ChatGPT answers: a study for Farbaek's Chat

- **Date:** 2026-11-22.
- **Why:** the owner asked for their seven most recent ChatGPT conversations to be read, and for ChatGPT to be tested directly, to learn how it understands, structures, researches and talks, and to bring what's useful to Farbaek.
- **How:**
  - **The seven conversations** were read for their shape, not copied: each turn's length, its opening and closing lines, and its headings, tables, lists and special blocks. Their content stays the owner's and isn't reproduced here.
  - **One new conversation,** "Fix It Request", put nine test messages to ChatGPT on the owner's Go plan.
- **Screenshots:** ten files named `chatgpt-study-…` in `research/reference-screenshots/` (local only, never committed).
- **Companion:** `FARBAEK_REFERENCE_RESEARCH.md` covers the six platforms' interfaces. This document is about answers.

## The seven conversations

| Kind of request | How it was asked | What came back |
| --- | --- | --- |
| Translate to English (three conversations) | Sinhala typed in English letters, with or without "translate english" | Only the translation. 38 to 200 characters. No greeting, no note about the translation |
| Write a message to send to someone | A problem described in Singlish | One line in Sinhala saying what it is, then the English message in its own block |
| Explain a screenshot, "in Sinhala" | Two words in Singlish | About 3,500 characters in Sinhala script, ending with a recommendation and a question |
| Turn an idea into a prompt for another tool | Singlish | The finished English text in a block, with two buttons under it to refine it |
| Make and change a picture | Short, rough English | The picture and one line saying what was made. A later request in Singlish got its caption in Sinhala |
| What are the benefits of X for my product | One line of Singlish | About 5,600 characters in Sinhala: numbered headings, a cost section, a recommendation, then choices to tap |
| A price | Three words | A dated answer with tables, a worked example for the owner's product, a link to the official page and one closing piece of advice |
| Do you really think this can succeed | Singlish | "Yes", by name, in the first two words. Then why, with honest limits |
| What is the best X right now | English | "As of" the date, that no single one is agreed to be the best, then the candidates |

## The nine tests

| Test | Sent | Result |
| --- | --- | --- |
| A vague request | "Can you fix it?" | 121 characters: yes, one question, and the four things it could be sent (a screenshot, a file, code, a description) |
| Live information | The three most important launches in the last 14 days, with dates and sources | Answering within four seconds. The title turned "14 days" into exact dates. One grey line said the period covered and how it ranked. Each item had a date, two bullets, "why it matters" and a source link |
| Sinhala, a fact | How many square metres in a perch, briefly | 39 characters in Sinhala, and correct: 25.2929 |
| Singlish, casual | Five names for a small tea shop | Sinhala script: one line repeating what was asked for, exactly five names, then its own pick with the reason |
| An explanation at two levels | Attention in a transformer, for a child and for an engineer | Two headings that repeated the format asked for, three sentences then five bullets, a formula drawn properly, and a one-line takeaway |
| A reasoning problem, with Think on | Three workers and a fence | The answer first, in bold: 2 hours 33 minutes 20 seconds, which is correct. Then four short steps |
| Code and a comparison | A typed debounce function and a table | A one-line definition, the code in a soft grey card, one line on how it works, a table with small green "Best" and "Good" tags, and a one-line recommendation |
| A picture | An empty-state illustration: white, thin graphite lines, one blue accent, no text | "Creating image" for about a minute, then a picture that kept every constraint, with Edit on it |
| Memory of the chat, and honesty | Improve the fourth name; which answer are you least sure of | It knew the fourth name. It re-checked its launches answer against official pages and corrected a date it had got wrong, saying exactly what it should have distinguished |

## What ChatGPT does

1. **It answers first.** The translation, the number, "yes", the total time. Reasons and steps come after.
2. **Length follows the question.** 39 characters for a fact, 121 for a clarifying question, about 2,000 for an opinion, about 5,600 for "what are the benefits".
3. **It mirrors the language, not the alphabet.** Singlish in, Sinhala script out, with technical words left in English. English in, English out. A translation request gets only the translation.
4. **It keeps the mode.** After one translation, the next message was translated without being asked.
5. **It guesses when the context makes the guess safe, and asks when it doesn't.** Four words about "the best personal agent" were read as being about the owner's own product. "Can you fix it?" in an empty chat got a question.
6. **Text meant to be used elsewhere goes in its own block,** with copy and expand, and two short buttons under it that would refine it.
7. **Time-sensitive answers say when.** "As of" a date, or the exact period covered, and how the items were chosen.
8. **Broad answers have a fixed skeleton:** numbered headings, short bullets with a bold first phrase, tables for prices and comparisons, small tags in table cells, and a last line that is a recommendation or a takeaway.
9. **It commits to a pick.** After five options it says which it would choose and why.
10. **It closes with a next step:** a question, or choices to tap.
11. **It uses what it knows about the person:** their name, and their project, to make a general answer specific.
12. **Its working is visible and short.** With Think on: a sentence on what it is about to do, a label for the step it is on, a Skip button, and afterwards "Worked for 22s", which opens.
13. **Asked to check itself, it does,** and says precisely what was wrong.
14. **The tone moves with the person:** plain for facts, warm for a personal question, a little emoji only in casual talk.

## What Farbaek's Chat already has

Read today in `src/server/ai/chat-model.ts` (`CHAT_SYSTEM_PROMPT`) and from earlier stages. Nothing here was changed.

- **The person's language, however it is typed** (stage 204, ADR 0221): Singlish answered in Sinhala script, technical terms kept, a requested language kept until changed, text asked for in another language written in that language.
- **Answers shaped to the request, and no filler openings** (stage 206).
- **Choices to tap** at the end of an answer that is too open, up to six.
- **Sources cited by number,** each citation checked against the page (stages 205 and 206).
- **Honesty about not knowing,** and never inventing facts or links.
- **Memory the person can read and remove** (stage 207).
- **Why a model was chosen,** shown on the answer.

## What to bring to Farbaek

Each is a candidate for Chat's next stage, to be measured before and after with real questions in English, Sinhala and Singlish. None is built.

| From ChatGPT | For Farbaek | Kind of change |
| --- | --- | --- |
| A translation request gets only the translation | Say so in the instructions: no note, no "here is", and keep translating until told otherwise | Instructions, with test cases |
| The answer first for a problem with one answer | Say so: the result in the first line, then the steps | Instructions, with test cases |
| "As of" a date and the period covered for time-sensitive answers | Farbaek knows when a question needed the web. Ask for the date or period in the first lines of those answers | Instructions |
| A pick after options | When listing options, end with which one and why, unless the person asked not to | Instructions |
| A block for text to use elsewhere, with refine buttons | A "to copy" block for drafts, messages and prompts, with copy, and two suggested refinements under it | Interface and a small protocol addition, like the choices block |
| Small tags in table cells | A way to mark "best" or "good" in a comparison without colour alone | Interface |
| A sentence on what it is about to do, a step label and Skip | Farbaek shows research steps already. Add one sentence of intent and a way to skip the wait | Interface |
| Re-checking its own answer when asked | For an answer with sources, "check this" re-runs the research and says what changed | Behaviour |
| A greeting that changes and uses the person's name | Chat's empty state | Interface |
| Pictures inline, with Edit | Farbaek sends people to the Image studio. Decide whether Chat should show the picture in place | Product decision |

## Where to stay different

- **ChatGPT assumed the owner's product in a general question** because of memory. Useful here, but it would mislead someone asking for a neutral answer. Farbaek uses only what a person asked it to remember, and should say when an answer was shaped by a memory.
- **Its first live answer had a wrong date,** and said nothing until asked. Farbaek checks each citation against its page before the answer is finished. Keep that, and show it.
- **Its sources are chips after sentences.** Farbaek's are numbers a person can follow to the passage. Keep the numbers.

## What couldn't be told from outside

- Which model answered each test: the Go plan shows no model name.
- Whether the first live answer searched the web: the search step wasn't on screen in the capture, though the answer had links.
- Voice, file reading and deep research: not tested.

## Left in the owner's account

- A conversation called "Fix It Request" with the nine tests, and "AI Assistant UI Patterns" from the earlier study.
- One generated picture in the Library: a clock with three task cards. It is a candidate for a Scheduled page's empty state, not used anywhere yet.
- A message the owner had started typing in another conversation was seen in a screenshot and not touched.
