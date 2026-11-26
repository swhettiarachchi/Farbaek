import { describe, expect, it } from "vitest";
import { LEVELS, choosesModel } from "@/core/experience/level";
import { AUTO_MODEL, modelToAsk } from "./model-to-ask";

describe("the model a turn asks for, by level (stage 285, ADR 0293)", () => {
  it("is the person's own pick where their level lists the models", () => {
    expect(modelToAsk("claude-opus-5-5", true)).toBe("claude-opus-5-5");
    expect(modelToAsk(AUTO_MODEL, true)).toBe("auto");
  });

  it("is Auto where it doesn't, whatever was picked before", () => {
    for (const earlier of ["claude-opus-5-5", "gpt-6-luna", "auto", "", "anything"]) expect(modelToAsk(earlier, false), earlier).toBe("auto");
  });

  it("follows the three levels: Auto at Standard, the pick from Advanced", () => {
    const asked = LEVELS.map((level) => modelToAsk("claude-opus-5-5", choosesModel(level)));
    expect(asked).toEqual(["auto", "claude-opus-5-5", "claude-opus-5-5"]);
  });
});
