import { describe, expect, it } from "vitest";
import { CONTRACT_SYSTEM_PROMPT, contractBriefMessage, contractPromptTokens } from "./prompts";

const brief = { taskTitle: "Add a pricing section", projectName: "Shop", projectDescription: null, paths: ["package.json"], notes: {} };

describe("the plan drafter's brief (ADR 0116)", () => {
  it("carries Farbaek's context facts with their status, and counts them in the reserved tokens", () => {
    const facts = [
      { status: "verified_current", statement: 'package.json defines "build", "test".' },
      { status: "missing", statement: 'The check "npm run lint" runs the "lint" script, which package.json doesn\'t define.' },
    ];
    const message = JSON.parse(contractBriefMessage({ ...brief, facts })) as { context: { status: string; fact: string }[] };
    expect(message.context).toEqual(facts.map((f) => ({ status: f.status, fact: f.statement })));
    expect(contractPromptTokens({ ...brief, facts })).toBeGreaterThan(contractPromptTokens(brief));
    expect(CONTRACT_SYSTEM_PROMPT).toContain("Put a command under required checks only if a fact shows the project has it");
  });

  it("leaves context out when there are no facts", () => {
    expect(JSON.parse(contractBriefMessage(brief))).not.toHaveProperty("context");
  });
});
