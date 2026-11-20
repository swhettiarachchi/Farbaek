/**
 * The demo workspace's one chat (stage 199): sample data, labelled as such in its name, so the read-only demo shows how answers
 * look (headings, lists, a table, code and maths). Nothing here was written by a model; it's hand-written to show the screen.
 */
import type { ChatMessage, ConversationSummary } from "@/core/chat/protocol";

export const SAMPLE_CHAT_ID = "00000000-0000-4000-8000-00000000c4a7";

const at = (minutesAgo: number) => new Date(Date.UTC(2026, 10, 16, 9, 30) - minutesAgo * 60_000).toISOString();

/** A second sample (stage 206): a question in Sinhala typed in English letters, answered from the web with its sources. */
export const SAMPLE_RESEARCH_ID = "00000000-0000-4000-8000-00000000c4a8";

export const SAMPLE_CHATS: ConversationSummary[] = [
  { id: SAMPLE_CHAT_ID, title: "Sample: launch week for a bakery", pinned: false, archived: false, projectId: null, updatedAt: at(5), shared: false },
  { id: SAMPLE_RESEARCH_ID, title: "Sample: an answer with sources, in Sinhala", pinned: false, archived: false, projectId: null, updatedAt: at(3), shared: false },
];

const QUESTION_1 = "00000000-0000-4000-8000-00000000c4b1";
const ANSWER_1 = "00000000-0000-4000-8000-00000000c4b2";
const QUESTION_2 = "00000000-0000-4000-8000-00000000c4b3";
const ANSWER_2 = "00000000-0000-4000-8000-00000000c4b4";

const base = { status: "complete" as const, error: null, rating: null, meta: {}, files: [], kind: "text" as const };

export const SAMPLE_MESSAGES: ChatMessage[] = [
  {
    ...base,
    id: QUESTION_1,
    parentId: null,
    role: "user",
    content: "This is a sample. Plan a launch week for a small bakery's new sourdough line, with a budget I can check.",
    modelName: null,
    thinkingMs: null,
    createdAt: at(12),
    siblings: [QUESTION_1],
  },
  {
    ...base,
    id: ANSWER_1,
    parentId: QUESTION_1,
    role: "assistant",
    modelName: "Sample answer",
    thinkingMs: null,
    createdAt: at(11),
    siblings: [ANSWER_1],
    content: [
      "## Launch week, day by day",
      "",
      "1. **Monday:** bake a tasting batch and photograph it in morning light.",
      "2. **Wednesday:** post the photos and open pre-orders for Saturday.",
      "3. **Saturday:** launch in the shop with free tasting slices until noon.",
      "",
      "### Budget",
      "",
      "| Item | Cost | Notes |",
      "| :--- | ---: | :--- |",
      "| Flour and starter | $40 | Two tasting batches |",
      "| Printed cards | $25 | 200 cards |",
      "| Tasting slices | $30 | About 60 slices |",
      "| **Total** | **$95** | |",
      "",
      "Margin per loaf at a price $p$ with cost $c$ is $\\frac{p - c}{p}$.",
      "",
      "- [x] Choose the launch day",
      "- [ ] Order the cards",
    ].join("\n"),
  },
  {
    ...base,
    id: QUESTION_2,
    parentId: ANSWER_1,
    role: "user",
    content: "Sample: give me a small script to total the pre-orders from a CSV.",
    modelName: null,
    thinkingMs: null,
    createdAt: at(6),
    siblings: [QUESTION_2],
  },
  {
    ...base,
    id: ANSWER_2,
    parentId: QUESTION_2,
    role: "assistant",
    modelName: "Sample answer",
    thinkingMs: null,
    createdAt: at(5),
    siblings: [ANSWER_2],
    content: [
      "Here's a short Python script. It reads `orders.csv` with a `loaves` column:",
      "",
      "```python",
      "import csv",
      "",
      "def total_loaves(path: str) -> int:",
      "    # Sum the loaves column, skipping blank rows",
      "    with open(path, newline=\"\") as f:",
      "        return sum(int(row[\"loaves\"]) for row in csv.DictReader(f) if row[\"loaves\"])",
      "",
      "print(total_loaves(\"orders.csv\"))",
      "```",
      "",
      "> Run it from the folder with the file: `python total.py`.",
    ].join("\n"),
  },
];

const RESEARCH_QUESTION = "00000000-0000-4000-8000-00000000c4c1";
const RESEARCH_ANSWER = "00000000-0000-4000-8000-00000000c4c2";

/**
 * The second sample: what an answer from the live web looks like. The stories are made up and say so in their first line; the
 * sources are the reserved example sites, which open, so no link leads nowhere and nothing passes for a real report.
 */
export const SAMPLE_RESEARCH_MESSAGES: ChatMessage[] = [
  {
    ...base,
    id: RESEARCH_QUESTION,
    parentId: null,
    role: "user",
    content: "Sample: mata ada tech news tika kiyanna",
    modelName: null,
    thinkingMs: null,
    createdAt: at(4),
    siblings: [RESEARCH_QUESTION],
  },
  {
    ...base,
    id: RESEARCH_ANSWER,
    parentId: RESEARCH_QUESTION,
    role: "assistant",
    modelName: "Sample answer",
    thinkingMs: null,
    createdAt: at(3),
    siblings: [RESEARCH_ANSWER],
    meta: {
      search: {
        at: at(3),
        status: "done",
        queries: ["technology news today", "තාක්ෂණ පුවත් අද"],
        depth: "standard",
        sources: [
          { n: 1, url: "https://example.org/", title: "Sample source one: a phone is announced", site: "example.org", published: at(600), read: true, cited: true, support: "matched" },
          { n: 2, url: "https://example.com/", title: "Sample source two: battery claims", site: "example.com", published: null, read: true, cited: true, support: "partly" },
          { n: 3, url: "https://example.net/", title: "Sample source three: update notes", site: "example.net", published: at(2900), updated: at(700), read: true, cited: true, support: "matched" },
          { n: 4, url: "https://www.iana.org/help/example-domains", title: "Sample source four: a page that was found and not used", site: "iana.org", published: null, read: false, cited: false },
        ],
        checks: { cited: 3, matched: 2, unmatched: 0, invalid: 0 },
      },
    },
    content: [
      "**මේක sample එකක්.** මෙතන තියෙන්නේ ඇත්ත පුවත් නෙවෙයි; පිළිතුරක් පේන විදිහ පෙන්වන්න ලියපු එකක්.",
      "",
      "## අද තාක්ෂණ පුවත් (sample)",
      "",
      "2026 නොවැම්බර් 16",
      "",
      "### Sample phone එකක් එළියට එනවා",
      "",
      "Sample Mobile සමාගම එයාලගේ අලුත් phone එක ලබන මාසේ ගෙනෙනවා කියලා කිව්වා. මිල ඩොලර් 499යි [1]. Battery එක පැය 30ක් තියෙනවා කියලත් එයාලා කියනවා [1][2].",
      "",
      "### Sample AI update එකක්",
      "",
      "Sample Labs එකේ AI assistant එකට දැන් file කියවන්න පුළුවන්. මේ update එක නොවැම්බර් 14 ඉඳන් හැමෝටම ලැබෙනවා [3].",
      "",
      "| දේ | විස්තරය |",
      "| :--- | :--- |",
      "| Phone එකේ මිල | ඩොලර් 499 |",
      "| AI update එක | නොවැම්බර් 14 ඉඳන් |",
      "",
      "ඊළඟට මොනවා ගැනද දැනගන්න ඕන?",
      "",
      "```choices",
      "AI ගැන තව පුවත් කියන්න",
      "Phone ගැන තව විස්තර දෙන්න",
      "ලංකාවේ තාක්ෂණ පුවත් කියන්න",
      "```",
    ].join("\n"),
  },
];

/** Each sample conversation's messages, by its id. */
export const SAMPLE_CONVERSATIONS: Readonly<Record<string, ChatMessage[]>> = {
  [SAMPLE_CHAT_ID]: SAMPLE_MESSAGES,
  [SAMPLE_RESEARCH_ID]: SAMPLE_RESEARCH_MESSAGES,
};
