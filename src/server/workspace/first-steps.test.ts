import { describe, expect, it } from "vitest";
import { hiddenWorkspaces, withHidden } from "./first-steps";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

describe("hidden first steps", () => {
  it("reads only workspace ids from the cookie", () => {
    expect(hiddenWorkspaces(undefined)).toEqual([]);
    expect(hiddenWorkspaces(`${A}.nope.${B}`)).toEqual([A, B]);
  });

  it("hides and shows one workspace without touching the others", () => {
    const one = withHidden(undefined, A, true);
    expect(hiddenWorkspaces(one)).toEqual([A]);
    const two = withHidden(one, B, true);
    expect(hiddenWorkspaces(two)).toEqual([B, A]);
    expect(hiddenWorkspaces(withHidden(two, A, false))).toEqual([B]);
    expect(hiddenWorkspaces(withHidden(two, A, true))).toEqual([A, B]);
  });

  it("keeps the cookie small", () => {
    let value = "";
    for (let i = 0; i < 30; i++) value = withHidden(value, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, true);
    expect(hiddenWorkspaces(value)).toHaveLength(20);
  });
});
