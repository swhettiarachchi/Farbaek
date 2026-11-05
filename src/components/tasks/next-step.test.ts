import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NextStepCard } from "./next-step";

const step = { tone: "done", title: "Done and checked", body: "Every check passed.", action: { label: "Open the project", target: "project" } } as const;
const digest = "993e2dc0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718294b6235";

describe("the next-step card's Seal (ADR 0172)", () => {
  it("draws it at a real size, since an SVG with no width renders as nothing", () => {
    const html = renderToStaticMarkup(createElement(NextStepCard, { step, projectId: "p1", seal: { digest, caption: "Farbaek ProofPack" } }));
    expect(html).toMatch(/<svg[^>]*class="[^"]*\bsize-32\b/);
    expect(html).toContain("Farbaek ProofPack");
  });

  it("draws none without verified evidence", () => {
    const html = renderToStaticMarkup(createElement(NextStepCard, { step, projectId: "p1" }));
    expect(html).not.toContain("<svg viewBox=\"0 0 128 128\"");
    expect(html).not.toContain("seal-reveal");
  });
});
