import { describe, expect, it } from "vitest";
import { subjectForText } from "./photos";

describe("the photo subject a site's words point to (stage 156)", () => {
  it("opens a bakery's pictures on bread, from the picture's description or the page title", () => {
    for (const words of [
      "A soft bun with a spiced fish filling, on a plate",
      "Crisp golden egg rolls cut in half on a tray",
      "A slice of moist butter cake on a small plate",
      "A golden milk bread loaf on a wooden board",
      "Sunrise Bakery, Kandy",
    ]) {
      expect(subjectForText(words), words).toBe("bakery");
    }
  });

  it("finds the other businesses Farbaek builds for", () => {
    expect(subjectForText("Latte art at the counter")).toBe("cafe");
    expect(subjectForText("A plated dish from the chef")).toBe("restaurant");
    expect(subjectForText("The hotel lobby at night")).toBe("hotel");
    expect(subjectForText("Our infinity pool")).toBe("resort");
    expect(subjectForText("A hot stone massage")).toBe("spa");
    expect(subjectForText("A barber shaping a fade")).toBe("salon");
    expect(subjectForText("Ledgerly: invoices that chase themselves")).toBe("workspace");
  });

  it("says nothing when the words don't point anywhere, so the picker keeps its default", () => {
    expect(subjectForText("")).toBeNull();
    expect(subjectForText("A placeholder picture")).toBeNull();
  });
});
