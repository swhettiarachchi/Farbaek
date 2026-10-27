import path from "node:path";
import { describe, expect, it } from "vitest";
import { storeDataDir } from "./data-dir";

describe("the agent's data folder", () => {
  it("moves out of AppData only when installed from the Microsoft Store", () => {
    const home = path.join("C:", "Users", "ada");
    expect(storeDataDir({ windowsStore: true, home })).toBe(path.join(home, ".farbaek-agent"));
    expect(storeDataDir({ windowsStore: false, home })).toBeNull();
  });
});
