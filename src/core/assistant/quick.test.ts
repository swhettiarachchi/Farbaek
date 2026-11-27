import { describe, expect, it } from "vitest";
import { answersByItself, QUICK_IDS, QUICK_MAX, QUICK_WORDS, quickAction } from "./quick";

describe("what the assistant answers or does in place (stage 290, ADR 0298)", () => {
  it("knows a request for what is waiting for the person, however it is put", () => {
    for (const said of [
      "what needs me",
      "What needs me?",
      "what needs my attention",
      "what needs my approval right now",
      "anything need me",
      "does anything need me?",
      "is there anything waiting for me",
      "what's waiting for me",
      "what is waiting on me today",
      "What\u2019s waiting for me?",
      "anything waiting for my approval",
      "what do I need to approve",
      "what should I review",
      "what needs a yes or no",
      "hey Farbaek, what needs me",
      "Farbaek what needs me please",
      "tell me what needs me",
      "is anything waiting for me",
      "whats waiting for me",
      "what do I need to do",
      "  what   needs  me  ",
    ]) {
      expect(quickAction(said), said).toBe("needs");
    }
  });

  it("knows a request for what is being done now", () => {
    for (const said of [
      "what are you working on",
      "what are you working on right now?",
      "what is Farbaek doing",
      "what are my agents doing",
      "what's running",
      "what is in progress",
      "is anything running",
      "anything in progress?",
      "what work is under way",
      "show me what is in progress",
      "whats in progress",
      "whats running",
    ]) {
      expect(quickAction(said), said).toBe("progress");
    }
  });

  it("knows a request to pause or to resume all of it", () => {
    for (const said of ["pause everything", "Pause everything.", "pause all", "pause all work", "pause the agents", "stop everything", "stop all agents", "halt everything now", "please pause everything", "can you pause everything", "pause farbaek", "pause all the builds", "pause the agent", "pause everything for now"]) {
      expect(quickAction(said), said).toBe("pause");
    }
    for (const said of ["resume everything", "resume agents", "resume the agents", "resume all work", "unpause", "unpause everything", "start the agents again", "continue everything", "restart agents"]) {
      expect(quickAction(said), said).toBe("resume");
    }
  });

  it("leaves a question about something else a question", () => {
    for (const said of [
      "",
      "what",
      "needs",
      "what needs to change in my essay",
      "what does my site need",
      "what needs me to be a better writer is practice",
      "why is my build waiting for me",
      "who is waiting for me at the airport",
      "what is waiting for godot about",
      "what do I need to approve a mortgage",
      "what should I review before the exam",
      "how do I pause a video",
      "pause",
      "pause the music",
      "pause the deploy of the storefront",
      "stop everything you are doing and write a poem",
      "resume",
      "resume writing tips",
      "write a resume",
      "continue",
      "continue the story",
      // "work" alone is not all of it.
      "continue my work",
      "continue work",
      "resume my work",
      "stop work",
      "what can I answer",
      "what should I do",
      "what do I need to do to get a visa",
      "what are you",
      "what are you doing this weekend",
      "what is running a marathon like",
      "what's running on port 3000",
      "is anything running on my server",
      "what is in progress bars",
      "status",
      "pause everything " + "x".repeat(QUICK_MAX),
    ]) {
      expect(quickAction(said), said).toBeNull();
    }
  });

  it("turns a very long line away before any rule reads it", () => {
    const started = performance.now();
    expect(quickAction(`what needs ${"me ".repeat(40_000)}`)).toBeNull();
    expect(quickAction(" ".repeat(200_000))).toBeNull();
    expect(performance.now() - started).toBeLessThan(300);
  });

  it("stays quick on words short enough to reach every rule and built to make them work hard", () => {
    // Each is at most QUICK_MAX characters once tidied, so the rules themselves are timed, not the length check.
    const hard = [
      `what needs ${"me ".repeat(22)}x`,
      `${"pause ".repeat(11)}everythin`,
      `hey farbaek please can you tell me what is anything waiting for my my my my`,
      `what do i need to ${"do ".repeat(19)}x`,
      `${"please ".repeat(10)}resume`,
      `what${"'s".repeat(30)} running`,
      `is anything ${"running ".repeat(8)}x`,
    ];
    for (const words of hard) expect(words.replace(/\s+/g, " ").trim().length, words).toBeLessThanOrEqual(QUICK_MAX);
    const started = performance.now();
    for (let i = 0; i < 2_000; i++) for (const words of hard) expect(quickAction(words)).toBeNull();
    expect(performance.now() - started).toBeLessThan(1_500);
  });

  it("answers by itself only what reads and changes nothing, and has words for each", () => {
    expect(QUICK_IDS.filter(answersByItself)).toEqual(["needs", "progress"]);
    for (const id of QUICK_IDS) {
      expect(QUICK_WORDS[id].label.length).toBeGreaterThan(5);
      expect(QUICK_WORDS[id].hint).toBe(answersByItself(id) ? "Answered here" : "You confirm first");
    }
  });
});
