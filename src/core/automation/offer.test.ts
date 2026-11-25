/**
 * The offer to schedule what was just asked in Chat (stage 273, ADR 0280): made for a request at a time, and not for a message
 * that merely has a time in it. The measured lists are in `offer.eval.test.ts`; these are the rules one by one.
 */
import { describe, expect, it } from "vitest";
import { OFFER_MAX_CHARS, ownWords, sameInstruction, scheduleOffer } from "./offer";

// Wednesday 25 November 2026, 10:00 in Sri Lanka.
const NOW = new Date("2026-11-25T04:30:00Z");
const offer = (text: string) => scheduleOffer(text, NOW, "Asia/Colombo");
const repeat = (text: string) => offer(text)?.schedule.repeat ?? null;

describe("offering to schedule a request", () => {
  it("offers a repeat for a request said with one, and says it in a sentence", () => {
    const o = offer("Research the latest AI news every morning at 8 and give me a short summary with sources");
    expect(o).toMatchObject({ schedule: { repeat: { kind: "daily", time: "08:00" }, timeZone: "Asia/Colombo", end: { kind: "never" } }, sentence: "Every day at 8:00 AM, Colombo time.", timeAssumed: false, hourAssumed: false });
    expect(repeat("every weekday at 8:30 give me a briefing")).toEqual({ kind: "weekdays", time: "08:30" });
    expect(repeat("Check my competitors' pricing pages every Monday at 9am")).toEqual({ kind: "weekly", days: [1], time: "09:00" });
    expect(repeat("Send me the AI news every morning at 8")).toEqual({ kind: "daily", time: "08:00" });
    expect(repeat("I'd like the top 5 HN stories every day at 7:30am")).toEqual({ kind: "daily", time: "07:30" });
    // A polite request is a request.
    expect(repeat("Can you send me the top tech stories every day at 7am?")).toEqual({ kind: "daily", time: "07:00" });
    expect(repeat("Could you summarise the news for me every evening?")).toEqual({ kind: "daily", time: "18:00" });
    expect(repeat("do this every day at 9")).toEqual({ kind: "daily", time: "09:00" });
    // No time given: a usual one, and the offer says so.
    expect(offer("summarise my field's news every week")).toMatchObject({ timeAssumed: true });
  });

  it("offers a one-time run only for a reminder", () => {
    expect(repeat("remind me tomorrow at 5pm to call the bank")).toEqual({ kind: "once", date: "2026-11-26", time: "17:00" });
    expect(repeat("in 20 minutes remind me to stretch")).toEqual({ kind: "once", date: "2026-11-25", time: "10:20" });
    expect(repeat("wake me up at 6am tomorrow")).toEqual({ kind: "once", date: "2026-11-26", time: "06:00" });
    // No day said: the next time the clock shows it.
    expect(repeat("Remind me at 5pm to call mom")).toEqual({ kind: "once", date: "2026-11-25", time: "17:00" });
    expect(repeat("Remind me at 9am to call mom")).toEqual({ kind: "once", date: "2026-11-26", time: "09:00" });
    // Told, given or shown something about a day is a question about that day.
    expect(offer("tell me the weather tomorrow")).toBeNull();
    expect(offer("Give me talking points for my meeting on Monday")).toBeNull();
    expect(offer("what happened on Friday at 5pm")).toBeNull();
    expect(offer("the meeting is tomorrow at 5pm in the main hall")).toBeNull();
    // Asking to be reminded of something now is a question.
    expect(offer("My flight is tomorrow at 6am, remind me what documents I need")).toBeNull();
  });

  it("doesn't offer for a question or a statement that only has a repeat in it", () => {
    for (const text of [
      "What do people in Japan usually eat every day?",
      "how much water should I drink every day",
      "Is it healthy to run every morning?",
      "can dogs eat rice every day",
      "should I take vitamin D every morning",
      "I wake up every day at 5am and still feel tired",
      "My daughter has piano lessons every Tuesday at 4pm, what should she practice",
      "Every morning I wake up tired",
      "I get headaches every evening, tell me why",
      "hamadama bath kanna hondada",
      "හැමදාම උදේ ඇවිදීම හොඳද",
      "mage amma hamadama udeta pansal yanawa",
    ])
      expect(offer(text), text).toBeNull();
  });

  it("doesn't take the schedule of a thing being described for the person's own", () => {
    for (const text of [
      "Write a Python script that sends an email every day at 9am",
      "Create a GitHub Action that runs every Monday at 9am",
      "How do I schedule a cron job to run every day at 3am?",
      "Write a poem about a man who walks his dog every morning",
      "Show me how to set an alarm for every day at 6am on iPhone",
      "Tell me why I feel tired every afternoon",
    ])
      expect(offer(text), text).toBeNull();
  });

  it("reads only the person's own words: not code, quotes, or what was pasted to be worked on", () => {
    expect(ownWords("Translate to Sinhala: I go to the gym every day")).toBe("Translate to Sinhala");
    expect(ownWords('What does "remind me every day at 9" mean in this app?')).toBe("What does mean in this app?");
    expect(ownWords("Why does this fail? ```cron.schedule('0 9 * * *') // every day at 9am```")).toBe("Why does this fail?");
    // More than three lines is something pasted, whatever it holds.
    expect(ownWords(["Why does this fail?", "```js", "cron.schedule() // every day at 9am", "```"].join("\n"))).toBeNull();
    expect(ownWords("Give me a regex that matches 'every day at 9am'")).toBe("Give me a regex that matches");
    // A request with its subject after a colon keeps it.
    expect(ownWords("Set a reminder for tomorrow at 9am: pay the electricity bill")).toBe("Set a reminder for tomorrow at 9am: pay the electricity bill");
    for (const text of [
      "Translate to Sinhala: I go to the gym every day",
      "Summarise this email: Hi team, the standup is every weekday at 9:30am. Please be on time.",
      'He said "send me the report every Friday" - how should I reply',
      "Reply to this email politely:\n\nHi Sam,\nJust a reminder that our review is tomorrow at 3pm.\nRegards, Anne",
      `send me news every day at 9 ${"x".repeat(OFFER_MAX_CHARS)}`,
    ])
      expect(offer(text), text).toBeNull();
    expect(ownWords("x".repeat(OFFER_MAX_CHARS + 1))).toBeNull();
    expect(ownWords("hi")).toBeNull();
    expect(ownWords("")).toBeNull();
  });

  it("offers nothing where the words name no schedule, two schedules, or one the form can't hold", () => {
    expect(offer("What is the capital of France?")).toBeNull();
    expect(offer("Write a poem about the sea")).toBeNull();
    expect(offer("send me news every day at 9am and 5pm")).toBeNull();
    expect(offer("send me news every other day")).toBeNull();
  });

  it("offers in Sinhala and in Sinhala typed with English letters", () => {
    expect(repeat("hamadama udeta AI news tika summarise karanna")).toEqual({ kind: "daily", time: "08:00" });
    expect(repeat("hamadama ude 7ta news tika ewanna")).toEqual({ kind: "daily", time: "07:00" });
    expect(repeat("හැමදාම උදේ 7ට පුවත් සාරාංශයක් එවන්න")).toEqual({ kind: "daily", time: "07:00" });
    expect(repeat("heta hawasa 5ta mata mathak karanna")).toEqual({ kind: "once", date: "2026-11-26", time: "17:00" });
    // A question about tomorrow, asked with "kiyanna" (tell me), is not a reminder.
    expect(offer("heta wahinawada kiyanna")).toBeNull();
  });

  it("reads the day from when the message was sent, and never offers a time that has passed", () => {
    // Today at 9am, asked at 10am.
    expect(offer("remind me today at 9am to call")).toBeNull();
    // Asked on the 25th, looked at again on the 30th: "tomorrow" was the 26th, which has passed. It isn't read as the 1st.
    const later = new Date("2026-11-30T04:30:00Z");
    expect(scheduleOffer("remind me tomorrow at 5pm to call the bank", NOW, "Asia/Colombo", later)).toBeNull();
    expect(scheduleOffer("in 20 minutes remind me to stretch", NOW, "Asia/Colombo", new Date(NOW.getTime() + 21 * 60_000))).toBeNull();
    // A repeat is still worth offering a week later.
    expect(scheduleOffer("Send me the AI news every morning at 8", NOW, "Asia/Colombo", later)).not.toBeNull();
  });

  it("knows the same instruction again, whatever its spacing or capitals", () => {
    expect(sameInstruction("Send me  the news\nevery day at 8", "send me the news every day at 8 ")).toBe(true);
    expect(sameInstruction("Send me the news every day at 8", "Send me the news every day at 9")).toBe(false);
    expect(sameInstruction("", " ")).toBe(false);
  });
});
