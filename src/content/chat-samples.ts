/**
 * The demo workspace's one chat (stage 199): sample data, labelled as such in its name, so the read-only demo shows how answers
 * look (headings, lists, a table, code and maths). Nothing here was written by a model; it's hand-written to show the screen.
 */
import type { ChatMessage, ConversationSummary } from "@/core/chat/protocol";

export const SAMPLE_CHAT_ID = "00000000-0000-4000-8000-00000000c4a7";

const at = (minutesAgo: number) => new Date(Date.UTC(2026, 10, 16, 9, 30) - minutesAgo * 60_000).toISOString();

export const SAMPLE_CHATS: ConversationSummary[] = [
  { id: SAMPLE_CHAT_ID, title: "Sample: launch week for a bakery", pinned: false, archived: false, projectId: null, updatedAt: at(5), shared: false },
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
