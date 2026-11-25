/**
 * The offer to schedule from Chat, measured (stage 273, ADR 0280). An offer under an answer that didn't ask for one is noise under
 * every such answer, so the rule is held to lists of messages rather than to a few chosen examples. The list it was written against
 * must stay right; the list written afterwards, which the rule was not fitted to, has floors at what it scored when first measured.
 * A change may raise the floors, never lower them.
 */
import { describe, expect, it } from "vitest";
import { HELD_OUT, TUNED, type OfferCases } from "./eval/offer-cases";
import { scheduleOffer } from "./offer";

// Wednesday 25 November 2026, 10:00 in Sri Lanka: the moment the lists were written for.
const NOW = new Date("2026-11-25T04:30:00Z");
const offered = (message: string) => scheduleOffer(message, NOW, "Asia/Colombo") !== null;

function measure(cases: OfferCases) {
  const wrong = cases.no.filter((m) => offered(m));
  const missed = cases.yes.filter((m) => !offered(m));
  return { wrong, missed };
}

describe("the offer to schedule, measured on written lists", () => {
  it("is right on every message of the list it was written against", () => {
    const { wrong, missed } = measure(TUNED);
    expect(wrong, "offered where none belongs").toEqual([]);
    expect(missed, "a request that got no offer").toEqual([]);
  });

  it("holds its floors on the list written afterwards, which it was not fitted to", () => {
    const { wrong, missed } = measure(HELD_OUT);
    // As first measured: an offer under at most this many of the 30 messages that asked for none, and at most this many of the 20
    // requests missed. Before the rule was rewritten it was 19 and 1.
    expect(wrong.length, `offered where none belongs:\n${wrong.join("\n")}`).toBeLessThanOrEqual(HELD_OUT_WRONG_AT_MOST);
    expect(missed.length, `requests that got no offer:\n${missed.join("\n")}`).toBeLessThanOrEqual(HELD_OUT_MISSED_AT_MOST);
  });
});

// Measured on 2026-11-25, once, without reading which messages failed.
const HELD_OUT_WRONG_AT_MOST = 4;
const HELD_OUT_MISSED_AT_MOST = 4;
