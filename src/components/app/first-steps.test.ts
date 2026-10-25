import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { firstSteps, type FirstStepFacts } from "@/core/workspace/first-steps";

vi.mock("@/app/app/actions", () => ({ hideFirstStepsAction: async () => {}, showFirstStepsAction: async () => {} }));
const { FirstStepsHidden, FirstStepsPanel } = await import("./first-steps");

const none: FirstStepFacts = { projects: [], tasks: [], latestProofPack: null, verifiedTaskId: null, liveSite: null };
const OPEN = { checks: null, publishing: null };

describe("FirstStepsPanel", () => {
  it("holds the build box in the first step while nothing has been described", () => {
    const html = renderToStaticMarkup(createElement(FirstStepsPanel, { data: firstSteps(none, OPEN), composer: createElement("textarea", { "data-probe": "" }) }));
    expect(html).toContain("Describe what to build");
    expect(html).toMatch(/<div id="start"><textarea data-probe=""/);
    // The box is the action: no link that would only scroll to it.
    expect(html).not.toContain('href="#start"');
    expect(html).toContain("0 of 5 done");
  });

  it("names every station's state in words, and marks the next one as the current step", () => {
    const html = renderToStaticMarkup(createElement(FirstStepsPanel, { data: firstSteps({ ...none, tasks: [{ id: "t1", state: "CONTRACT_DRAFTED", projectId: "p1" }] }, OPEN) }));
    expect(html).toContain("Describe what to build, done");
    expect(html).toContain("Approve the plan, next");
    expect(html).toContain("Publish your site, to do");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain('href="/app/new/t1"');
    expect(html).toContain("Read the plan");
  });

  it("says why a step can't happen here", () => {
    const html = renderToStaticMarkup(createElement(FirstStepsPanel, { data: firstSteps(none, { checks: "Checks can't run on this server yet.", publishing: null }) }));
    expect(html).toContain("Get it verified, not available here");
    expect(html).toContain("Checks can&#x27;t run on this server yet.");
  });

  it("leaves a way back after hiding", () => {
    const html = renderToStaticMarkup(createElement(FirstStepsHidden, { data: firstSteps(none, OPEN) }));
    expect(html).toContain("First steps hidden, 0 of 5 done.");
    expect(html).toContain("Show them");
  });
});
