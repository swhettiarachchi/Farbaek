/**
 * What the assistant answers or does in place, without a model (stage 290, ADR 0298): a few whole requests a person types
 * or says in the palette, recognised by fixed rules. Anything else is a question for Chat.
 *
 * The whole phrase must be the request. "pause everything" is one. "how do I pause a video" and "what needs to change in
 * my essay" are questions, and stay questions: a rule that guessed would answer about a person's work when they had asked
 * about something else.
 *
 * English only for now. Recognising a request never does anything by itself: a question is answered from the person's own
 * work, read as them, and pausing or resuming still takes a press on the real button.
 */
export const QUICK_IDS = ["needs", "progress", "pause", "resume"] as const;
export type QuickId = (typeof QUICK_IDS)[number];

/** Longer than this is a sentence about something, not one of these requests. */
export const QUICK_MAX = 80;

const LEAD = "(?:(?:hey|hi|ok|okay)[, ]+)?(?:farbaek(?: ai)?[,:]? +)?(?:please +)?(?:(?:can|could|would) you +)?(?:(?:tell|show) me +)?";
const TAIL = "(?: +(?:right )?now| +for now| +today| +so far)?(?: +please)?[ .!?]*";
/** "what's", "what is", and "whats" as it is typed in a hurry. */
const WHATS = "what(?:'?s| is)";
const MINE = "(?:me|my (?:attention|approval|answer|review|yes or no|ok|okay|turn|input))";
const AGENTS = "(?:you|farbaek|the agents?|my agents?|the ai)";
// "work" alone is not all of it: "continue my work" and "stop work" are said about other things.
const ALL = "(?:everything|it all|all(?: of it| work| the work| agents| the agents| my agents| builds| the builds| runs| the runs)?|(?:the |my )?agents?|farbaek)";

const RULES: Record<QuickId, readonly string[]> = {
  needs: [
    `(?:what|what else|anything|something)(?:'?s| is| does| do)? +(?:needs?|needing) +${MINE}`,
    `(?:does|do|is there|is) +(?:anything|something) +(?:need|needs|needing|that needs|waiting for|waiting on) +${MINE}`,
    `(?:what|what else|anything|something)(?:'?s| is)? +(?:waiting|waits) +(?:for|on) +${MINE}`,
    `what +(?:do|should|must) +i +(?:need to +|have to +)?(?:approve|review|sign off)`,
    `what +(?:do|must) +i +(?:need|have) +to +do`,
    `what +needs +(?:a yes or no|an answer|approving|approval|reviewing)`,
  ],
  progress: [
    `what(?:'?s| is| are)? +${AGENTS} +(?:working on|doing|up to|building|busy with)`,
    `${WHATS} +(?:in progress|running|being built|under way|underway|being worked on)`,
    `(?:is +)?anything +(?:running|in progress|being built|under way|underway)`,
    `what +work +is +(?:in progress|running|under way|underway)`,
  ],
  pause: [`(?:pause|stop|halt) +${ALL}`],
  // "resume" alone is also a word for a CV, so it needs what to resume. "unpause" has one meaning.
  resume: [`(?:resume|restart|continue) +${ALL}`, `unpause(?: +${ALL})?`, `start +${ALL} +again`],
};

const COMPILED: readonly (readonly [QuickId, RegExp])[] = QUICK_IDS.flatMap((id) => RULES[id].map((rule) => [id, new RegExp(`^${LEAD}${rule}${TAIL}$`)] as const));

/** The request these words are, whole, or null: then they are a question, a page's name or a build, as before. */
export function quickAction(typed: string): QuickId | null {
  if (typed.length > QUICK_MAX * 2) return null;
  const text = typed
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 5 || text.length > QUICK_MAX) return null;
  for (const [id, rule] of COMPILED) if (rule.test(text)) return id;
  return null;
}

/** Whether recognising it may be followed by doing it without a further press: only what reads and changes nothing. */
export function answersByItself(id: QuickId): boolean {
  return id === "needs" || id === "progress";
}

/** How each is offered in the palette. */
export const QUICK_WORDS: Record<QuickId, { label: string; hint: string }> = {
  needs: { label: "What needs me?", hint: "Answered here" },
  progress: { label: "What is in progress?", hint: "Answered here" },
  pause: { label: "Pause everything", hint: "You confirm first" },
  resume: { label: "Resume agents", hint: "You confirm first" },
};
