/**
 * The board, said short (stage 290, ADR 0298): what the assistant answers when a person asks, from any page, what needs
 * them or what is in progress. It is the All work page's own board (`buildBoard`), cut to a few rows by `workStatus`
 * (work-status.ts), so the two can never say different things. Nothing here reads anything: the server builds the board as
 * the person and hands this over.
 *
 * This file imports nothing, so the palette can take its types and what is said aloud without the board's code.
 */
/** How many rows an answer lists. All work has the rest, and the answer says how many. */
export const STATUS_ROWS = 6;
/** How many of them are said aloud by name. */
export const SPOKEN_ROWS = 3;

export interface StatusRow {
  id: string;
  title: string;
  /** Where it stands, in a sentence: the board's own line. */
  line: string;
  href: string;
}

export interface WorkStatus {
  /** The board in a sentence or two, or that it couldn't all be read. */
  sentence: string;
  /** Some of the work couldn't be read, so the lists are known to be short. */
  incomplete: boolean;
  /** The demo workspace's sample work. */
  sample: boolean;
  needsYou: StatusRow[];
  working: StatusRow[];
  /** How many more there are than are listed. */
  moreNeeds: number;
  moreWorking: number;
  /** Changes waiting for someone else's yes or no, in a sentence, or null. */
  others: string | null;
}

/** What the server answers: the status, and the workspace's one pause with why this person can or can't press it. */
export interface WorkStatusReply extends WorkStatus {
  pause: { paused: { at: string; reason: string | null } | null; pauseReason: string | null; resumeReason: string | null };
}

export const INCOMPLETE_SENTENCE = "Some of your work couldn't be read just now, so this is incomplete.";
/** Said with every answer made from the demo workspace, on the screen and aloud. */
export const SAMPLE_SENTENCE = "This is the demo workspace's sample work.";

/** Changes that wait for someone else: said, never listed as the person's own. */
export function othersSentence(others: number, canAct: boolean): string | null {
  if (others <= 0) return null;
  return canAct
    ? `${others === 1 ? "One more change is" : `${others} more changes are`} waiting for someone else's yes or no. You can read them in Approvals.`
    : `${others === 1 ? "One change is" : `${others} changes are`} waiting for a yes or no. You can read them in Approvals.`;
}

/** A sentence that ends as one, so the voice pauses where the next begins. */
const ended = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/**
 * What is said aloud for an answer, one sentence at a time: the board's sentence, that it is sample work when it is, then
 * the first few by name with where each stands, then how many more there are. Said only when the question was spoken.
 */
export function spokenStatus(kind: "needs" | "progress", status: WorkStatus): string[] {
  const rows = kind === "needs" ? status.needsYou : status.working;
  const total = rows.length + (kind === "needs" ? status.moreNeeds : status.moreWorking);
  const said = rows.slice(0, SPOKEN_ROWS);
  const out = [status.sentence];
  if (status.sample) out.push(SAMPLE_SENTENCE);
  for (const r of said) out.push(ended(`${ended(r.title)} ${r.line}`));
  const rest = total - said.length;
  if (rest > 0) out.push(rest === 1 ? "And one more." : `And ${rest} more.`);
  return out;
}
