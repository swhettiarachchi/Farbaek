import { describe, expect, it } from "vitest";
import { suggestHandOffs, handOffPlan } from "./handoff";
import { COMPUTER_CAPABILITIES, computerNote, readAction } from "./intent";

/** Requests to act on the person's computer, and what each would need. Written for this test. */
const ACTIONS: [string, string][] = [
  ["Open my browser and visit the official website.", "browser"],
  ["open chrome", "browser"],
  ["Can you launch Firefox for me", "browser"],
  ["Go to gmail.com in my browser and log in", "browser"],
  ["Create a folder on my desktop.", "files"],
  ["please delete all the files in my downloads", "files"],
  ["Rename the photos on my computer by date", "files"],
  ["move my documents to the D drive on my pc", "files"],
  ["Open the application and perform this task.", "apps"],
  ["open notepad", "apps"],
  ["Install VS Code on my laptop", "apps"],
  ["shut down my computer", "apps"],
  ["Take a screenshot", "screen"],
  ["look at my screen and tell me what's wrong", "screen"],
  ["Take control of my computer and fix it", "input"],
  ["run this command on my machine: npm install", "terminal"],
  ["Open the terminal", "terminal"],
  ["chrome eka open karanna", "browser"],
  ["mage desktop eke folder ekak hadanna", "files"],
  ["mage computer eka control karanna", "input"],
  ["notepad eka open karanna", "apps"],
  ["screenshot ekak ganna", "screen"],
  ["මගේ desktop එකේ folder එකක් හදන්න", "files"],
  ["browser එක open කරන්න", "browser"],
];

/** Questions and ordinary requests that mention the same things. None is a request to act. */
const QUESTIONS = [
  "Explain how to install an application.",
  "How do I create a folder on my desktop?",
  "how to open chrome in incognito mode",
  "What is a browser?",
  "How can I take a screenshot on Windows?",
  "Why is my computer slow?",
  "Write a Python script that deletes temp files",
  "open a file in Python and read its lines",
  "Search the internet for the official download page.",
  "What does the terminal command ls do?",
  "Can I run this command on my mac safely?",
  "Tell me how to rename many files at once",
  "Is it safe to shut down my computer during an update?",
  "Create a marketing plan for my bakery",
  "Open source alternatives to Photoshop",
  "folder ekak hadanne kohomada",
  "chrome eka open wenne na, mokada karanne",
  "screenshot ekak ganne kohomada",
  "mage computer eka slow, ai e",
  "desktop එකේ folder එකක් හදන්නේ කොහොමද?",
  "Install guide for Node.js on Ubuntu",
  "Fix this:\n```sh\nrm -rf ./tmp\n```",
  // The fresh review's cases: ordinary requests that mention the same words. A refusal here would be a mistake.
  "Write a press release for me about our new product",
  "What type of phone is best for me in 2026?",
  "Update the app to use React 19",
  "Update my application letter for the bank job",
  "Start a word game with me",
  "Open the Excel file I attached and total column B",
  "Use the edge cases above to write unit tests",
  "Use the browser's localStorage API to save the theme",
  "My site won't open properly in the browser, what could be wrong",
  "Add retry logic to the system",
  "Remove the bias from the machine learning model",
  "Create a PDF checklist for reviewing my documents",
  "Write a Playwright script to take a screenshot of the page",
  "click the submit button for me",
  "Type a short bio for me",
  "Press coverage summary for my startup",
  "Move the meeting to Friday and tell the team",
  "Create a folder structure for a React project",
  "Delete the second paragraph and make it shorter",
  "Open a file in Python and read its lines",
];

describe("telling a request to act on the computer from a question (stage 206)", () => {
  it("reads requests as requests and questions as questions, measured", () => {
    const missed = ACTIONS.filter(([text]) => readAction(text) === null).map(([text]) => text);
    const wrongWant = ACTIONS.filter(([text, wants]) => {
      const action = readAction(text);
      return action !== null && !action.wants.includes(wants as never);
    }).map(([text]) => text);
    const falseAlarms = QUESTIONS.filter((text) => readAction(text) !== null);
    console.log(`Computer requests: ${ACTIONS.length - missed.length}/${ACTIONS.length} read as requests, ${ACTIONS.length - missed.length - wrongWant.length} with the right kind. Questions read as requests: ${falseAlarms.length}/${QUESTIONS.length}.`);
    if (missed.length > 0) console.log(`  missed: ${missed.join(" | ")}`);
    if (wrongWant.length > 0) console.log(`  wrong kind: ${wrongWant.join(" | ")}`);
    if (falseAlarms.length > 0) console.log(`  false alarms: ${falseAlarms.join(" | ")}`);
    // A question taken for a request would get a refusal it doesn't deserve: none may be.
    expect(falseAlarms).toEqual([]);
    expect((ACTIONS.length - missed.length) / ACTIONS.length).toBeGreaterThanOrEqual(0.9);
    expect(wrongWant).toEqual([]);
  });

  it("the note says what can't be done from what the list says, and never the person's words", () => {
    const note = computerNote({ kind: "computer", wants: ["browser", "files"] });
    for (const c of COMPUTER_CAPABILITIES) expect(note, c.id).toContain(c.does);
    expect(note).toMatch(/you can't act on their computer/);
    expect(note).toMatch(/must never say or imply that you opened, created, deleted, clicked, typed, installed or ran anything/);
    expect(note).toMatch(/This request needs it to create, move or delete files and folders elsewhere on the computer, and to open or drive a web browser, which isn't possible yet\./);
    expect(note).toMatch(/Don't promise that this is coming/);
    expect(computerNote({ kind: "computer", wants: ["browser"] })).toBe(computerNote({ kind: "computer", wants: ["browser"] }));
  });

  it("the list is honest about today: only work on a project copy is possible", () => {
    expect(COMPUTER_CAPABILITIES.filter((c) => c.available).map((c) => c.id)).toEqual(["project-files", "project-commands"]);
  });
});

describe("where an answer can go next (stage 206)", () => {
  it("offers a space only for a request about that kind of thing", () => {
    expect(suggestHandOffs("mata international tech news kiyanna")).toEqual([]);
    expect(suggestHandOffs("What is the weather in Colombo today?")).toEqual([]);
    expect(suggestHandOffs("Design a logo for my bakery")).toEqual(["images"]);
    expect(suggestHandOffs("I need a landing page for my cafe")).toEqual(["build"]);
    expect(suggestHandOffs("make a short video about our product launch")).toEqual(["video"]);
    expect(suggestHandOffs("mata website ekak hadaganna one")).toEqual(["build"]);
    expect(suggestHandOffs("මට ලෝගෝ එකක් හදලා දෙන්න")).toEqual(["images"]);
    expect(suggestHandOffs("a website with a hero video and a logo")).toEqual(["images", "video", "build"]);
    expect(suggestHandOffs("Create a folder on my desktop.")).toEqual(["desktop"]);
  });

  it("the desktop entry opens the desktop app's page and carries nothing", () => {
    expect(handOffPlan("desktop", [{ role: "user", content: "Create a folder on my desktop." }])).toMatchObject({ href: "/app/agents", text: "" });
    expect(handOffPlan("build", [{ role: "user", content: "A site for my cafe" }])).toMatchObject({ href: "/app/new", text: "A site for my cafe" });
  });
});
