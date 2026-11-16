import { describe, expect, it } from "vitest";
import { PROMPT_STORAGE_KEY } from "@/core/agent/prompt-start";
import { HANDOFF_MAX, handOffPlan } from "./handoff";
import { STUDIO_PROMPT_KEY } from "./protocol";

const talk = [
  { role: "user", content: "Plan a launch week for a bakery." },
  { role: "assistant", content: "Here is a week of posts." },
  { role: "user", content: "  Make the Friday post warmer.  " },
  { role: "assistant", content: "Done." },
];

describe("an answer's hand-off", () => {
  it("opens each space at its own page", () => {
    expect(handOffPlan("images", talk).href).toBe("/app/images");
    expect(handOffPlan("video", talk).href).toBe("/app/video");
    expect(handOffPlan("build", talk).href).toBe("/app/new");
  });

  it("carries the last thing the person asked, trimmed, never the answer", () => {
    expect(handOffPlan("images", talk).text).toBe("Make the Friday post warmer.");
  });

  it("uses the studios' key for pictures and video, and the build box's own key for Build", () => {
    expect(handOffPlan("images", talk).key).toBe(STUDIO_PROMPT_KEY);
    expect(handOffPlan("video", talk).key).toBe(STUDIO_PROMPT_KEY);
    expect(handOffPlan("build", talk).key).toBe(PROMPT_STORAGE_KEY);
  });

  it("cuts a long request to what the boxes take", () => {
    const long = [{ role: "user", content: "a".repeat(HANDOFF_MAX + 500) }];
    expect(handOffPlan("video", long).text).toHaveLength(HANDOFF_MAX);
  });

  it("skips a message that was only files, and carries nothing when nothing was asked", () => {
    expect(handOffPlan("build", [{ role: "user", content: "Draw a logo" }, { role: "user", content: "   " }]).text).toBe("Draw a logo");
    expect(handOffPlan("build", [{ role: "assistant", content: "Hello" }]).text).toBe("");
  });

  it("never puts the request in the address", () => {
    for (const to of ["images", "video", "build"] as const) expect(handOffPlan(to, talk).href).not.toMatch(/[?#]/);
  });
});
