import { describe, expect, it } from "vitest";
import { trialEndLabel, trialReminderEmail } from "./trial-emails";
import { trialWindow } from "./trial";

const start = new Date("2026-10-13T09:30:00.000Z");
const DAY = 86_400_000;
const at = (ms: number) => new Date(start.getTime() + ms);
const w = trialWindow(start);

describe("trial reminder emails", () => {
  it("say how long is really left, from the end, not the reminder's name", () => {
    // The day 7 reminder sent late, on day 10.
    expect(trialReminderEmail("day_7", w, at(10 * DAY), "Alice Studio")).toEqual({
      subject: "Your Farbaek trial: 4 days left",
      lines: [
        "The Pro trial for Alice Studio has 4 days left. It ends Tue 27 Oct 2026, 09:30 UTC.",
        "Then the workspace moves to Free automatically and nothing is charged. Payments aren't connected yet, so no plan can be bought.",
        "See what Free includes on the Billing page.",
      ],
    });
    expect(trialReminderEmail("day_13", w, at(13 * DAY + 3_600_000), "Alice Studio").subject).toBe("Your Farbaek trial: 1 day left");
  });

  it("say the trial ended, and that nothing was charged", () => {
    expect(trialReminderEmail("expiry", w, at(14 * DAY + 60_000), "Alice Studio")).toEqual({
      subject: "Your Farbaek trial has ended",
      lines: ["The Pro trial for Alice Studio ended Tue 27 Oct 2026, 09:30 UTC. The workspace is on Free now, and nothing was charged.", "See what Free includes on the Billing page."],
    });
    // A day reminder that arrives after the end says the same.
    expect(trialReminderEmail("day_13", w, at(14 * DAY + 1), "x").subject).toBe("Your Farbaek trial has ended");
  });

  it("point to the plans only once live payments are on", () => {
    const live = trialReminderEmail("day_7", w, at(10 * DAY), "Alice Studio", true);
    expect(live.lines.slice(1)).toEqual(["Then the workspace moves to Free automatically, and nothing is charged unless you choose a plan.", "Compare the plans and what Free includes on the Billing page."]);
    expect(live.lines.join(" ")).not.toMatch(/aren't connected/);
    expect(trialReminderEmail("expiry", w, at(14 * DAY + 60_000), "Alice Studio", true).lines[1]).toBe("Choose a plan on the Billing page to get Pro's features back, or see what Free includes.");
  });

  it("name the time zone, keep long workspace names short, and use no em dashes", () => {
    expect(trialEndLabel(new Date("2026-01-05T00:05:00Z"))).toBe("Mon 5 Jan 2026, 00:05 UTC");
    const long = trialReminderEmail("day_7", w, at(7 * DAY), "A".repeat(100));
    expect(long.lines[0]).toContain(`${"A".repeat(59)}…`);
    for (const kind of ["day_7", "day_12", "day_13", "expiry"] as const) {
      const e = trialReminderEmail(kind, w, at(8 * DAY), "Studio");
      expect([e.subject, ...e.lines].join(" ")).not.toMatch(/—/);
    }
  });
});
