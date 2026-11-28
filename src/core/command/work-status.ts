/** The All work board, cut to what the assistant answers with (stage 290, ADR 0298). Kept apart from status.ts, which the browser takes. */
import { boardSentence, type Board, type BoardItem } from "./board";
import { INCOMPLETE_SENTENCE, STATUS_ROWS, othersSentence, type StatusRow, type WorkStatus } from "./status";

const row = (item: BoardItem): StatusRow => ({ id: item.id, title: item.title, line: item.line, href: item.href });

export function workStatus(board: Board, facts: { incomplete: boolean; sample: boolean; canAct: boolean }): WorkStatus {
  return {
    sentence: facts.incomplete ? INCOMPLETE_SENTENCE : boardSentence(board),
    incomplete: facts.incomplete,
    sample: facts.sample,
    needsYou: board.needsYou.slice(0, STATUS_ROWS).map(row),
    working: board.working.slice(0, STATUS_ROWS).map(row),
    moreNeeds: Math.max(0, board.needsYou.length - STATUS_ROWS),
    moreWorking: Math.max(0, board.working.length - STATUS_ROWS),
    others: othersSentence(board.others, facts.canAct),
  };
}
