import { describe, expect, it } from "vitest";
import { changeKey } from "./key";

describe("the preview's change key", () => {
  const files = ["index.html@3", "styles.css@1", "app.js@7"];

  it("is the same for the same parts", () => {
    expect(changeKey(files)).toBe(changeKey([...files]));
  });

  it("changes when a file is saved", () => {
    expect(changeKey(["index.html@4", "styles.css@1", "app.js@7"])).not.toBe(changeKey(files));
  });

  it("changes when a file is added or removed", () => {
    expect(changeKey([...files, "about.html@1"])).not.toBe(changeKey(files));
    expect(changeKey(files.slice(0, 2))).not.toBe(changeKey(files));
  });

  it("tells a moved boundary apart: joining two parts isn't the same as keeping them", () => {
    expect(changeKey(["ab", "c"])).not.toBe(changeKey(["a", "bc"]));
    expect(changeKey(["abc"])).not.toBe(changeKey(["ab", "c"]));
  });

  it("is short, whatever the size of the project", () => {
    const many = Array.from({ length: 3_000 }, (_, i) => `src/file-${i}.ts@${i}`);
    expect(changeKey(many).length).toBeLessThan(16);
    expect(changeKey([])).toMatch(/^0-/);
  });
});
