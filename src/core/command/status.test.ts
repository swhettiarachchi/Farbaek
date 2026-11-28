import { describe, expect, it } from "vitest";
import type { Board, BoardItem } from "./board";
import { INCOMPLETE_SENTENCE, SAMPLE_SENTENCE, SPOKEN_ROWS, STATUS_ROWS, othersSentence, spokenStatus } from "./status";
import { workStatus } from "./work-status";

const item = (id: string, more: Partial<BoardItem> = {}): BoardItem => ({
  id,
  kind: "change",
  title: `Change ${id}`,
  line: "Storefront. Waiting for your yes or no.",
  status: "approval",
  label: "Waiting for you",
  href: `/app/tasks/${id}`,
  action: "Review",
  at: null,
  when: null,
  ...more,
});
const board = (more: Partial<Board> = {}): Board => ({ needsYou: [], working: [], scheduled: [], finished: [], others: 0, ...more });
const facts = { incomplete: false, sample: false, canAct: true };

describe("the board, said short (stage 290, ADR 0298)", () => {
  it("says the board's own sentence and lists the board's own rows, with nothing of a row but its name, its line and where it opens", () => {
    const status = workStatus(board({ needsYou: [item("a"), item("b")], working: [item("w", { kind: "build", title: "Build w", line: "Docs site. Step 3.", href: "/app/build/w" })] }), facts);
    expect(status.sentence).toBe("2 things need you. One thing is in progress, and nothing is scheduled.");
    expect(status.needsYou).toEqual([
      { id: "a", title: "Change a", line: "Storefront. Waiting for your yes or no.", href: "/app/tasks/a" },
      { id: "b", title: "Change b", line: "Storefront. Waiting for your yes or no.", href: "/app/tasks/b" },
    ]);
    expect(status.working).toEqual([{ id: "w", title: "Build w", line: "Docs site. Step 3.", href: "/app/build/w" }]);
    expect(status).toMatchObject({ moreNeeds: 0, moreWorking: 0, others: null, incomplete: false, sample: false });
  });

  it("lists a few and counts the rest, never dropping them silently", () => {
    const many = Array.from({ length: STATUS_ROWS + 3 }, (_, i) => item(String(i)));
    const status = workStatus(board({ needsYou: many, working: many.slice(0, STATUS_ROWS + 1) }), facts);
    expect(status.needsYou).toHaveLength(STATUS_ROWS);
    expect(status.moreNeeds).toBe(3);
    expect(status.working).toHaveLength(STATUS_ROWS);
    expect(status.moreWorking).toBe(1);
    // The sentence counts all of them, not the rows listed.
    expect(status.sentence).toContain(`${STATUS_ROWS + 3} things need you.`);
  });

  it("says a list is incomplete rather than summing up what it couldn't read, and says when it is the demo's sample", () => {
    const status = workStatus(board({ needsYou: [item("a")] }), { incomplete: true, sample: true, canAct: true });
    expect(status.sentence).toBe(INCOMPLETE_SENTENCE);
    expect(status).toMatchObject({ incomplete: true, sample: true });
    expect(status.needsYou).toHaveLength(1);
    // Said aloud, it is still a sample: the label is not only on the screen.
    expect(spokenStatus("needs", status).slice(0, 2)).toEqual([INCOMPLETE_SENTENCE, SAMPLE_SENTENCE]);
    expect(spokenStatus("needs", workStatus(board(), facts))).not.toContain(SAMPLE_SENTENCE);
  });

  it("says changes that wait for someone else, and never as this person's own", () => {
    expect(othersSentence(0, true)).toBeNull();
    expect(othersSentence(-1, true)).toBeNull();
    expect(othersSentence(1, true)).toBe("One more change is waiting for someone else's yes or no. You can read them in Approvals.");
    expect(othersSentence(3, true)).toBe("3 more changes are waiting for someone else's yes or no. You can read them in Approvals.");
    expect(othersSentence(1, false)).toBe("One change is waiting for a yes or no. You can read them in Approvals.");
    expect(othersSentence(2, false)).toBe("2 changes are waiting for a yes or no. You can read them in Approvals.");
    expect(workStatus(board({ others: 2 }), facts).others).toBe(othersSentence(2, true));
    expect(workStatus(board({ others: 2 }), { ...facts, canAct: false }).others).toBe(othersSentence(2, false));
  });

  it("says aloud the sentence, then the first few by name with where each stands, then how many more", () => {
    const many = Array.from({ length: STATUS_ROWS + 2 }, (_, i) => item(String(i), { title: `Change ${i}` }));
    const status = workStatus(board({ needsYou: many }), facts);
    const said = spokenStatus("needs", status);
    expect(said[0]).toBe(status.sentence);
    expect(said.slice(1, 1 + SPOKEN_ROWS)).toEqual(["Change 0. Storefront. Waiting for your yes or no.", "Change 1. Storefront. Waiting for your yes or no.", "Change 2. Storefront. Waiting for your yes or no."]);
    expect(said.at(-1)).toBe(`And ${STATUS_ROWS + 2 - SPOKEN_ROWS} more.`);
    expect(said).toHaveLength(SPOKEN_ROWS + 2);
  });

  it("says only the sentence when there is nothing to name, and ends every sentence as one", () => {
    const empty = workStatus(board(), facts);
    expect(spokenStatus("needs", empty)).toEqual(["Nothing needs you. Nothing is in progress, and nothing is scheduled."]);
    expect(spokenStatus("progress", empty)).toEqual(["Nothing needs you. Nothing is in progress, and nothing is scheduled."]);
    const one = workStatus(board({ working: [item("w", { title: "Is the menu right?", line: "Docs site,\n  step 3" }), item("x", { title: "Second" }), item("y"), item("z")] }), facts);
    expect(spokenStatus("progress", one).slice(1)).toEqual(["Is the menu right? Docs site, step 3.", "Second. Storefront. Waiting for your yes or no.", "Change y. Storefront. Waiting for your yes or no.", "And one more."]);
    // Asked what is in progress, it names what is in progress, not what needs the person.
    expect(spokenStatus("progress", workStatus(board({ needsYou: [item("a")] }), facts))).toHaveLength(1);
  });
});
