import { describe, expect, it } from "vitest";
import { forPeople, namesOperatorDetail } from "./operator-detail";

describe("lines saved before stage 171", () => {
  it("replaces a line that names a setting, an operator command or the provider", () => {
    for (const line of [
      "Run pnpm sandbox:smoke, then set SANDBOX_ISOLATION_VERIFIED_AT.",
      "E2B_API_KEY isn't set on this server.",
      "Starting: Vercel refused the credentials. Check SANDBOX_VERCEL_TOKEN.",
      "the Vercel account's sandbox allowance is used up. On Hobby, new sandboxes are paused until the next cycle.",
      "Checks ran in Vercel Sandbox against the applied content.",
      "Farbaek stopped this run from Office Space.",
    ]) {
      expect(namesOperatorDetail(line), line).toBe(true);
      expect(forPeople(line)).toBe("Farbaek's test space had a problem here, and Farbaek has been told.");
    }
  });

  it("leaves ordinary lines, and a person's own words, alone", () => {
    for (const line of ["The command exited with an error.", "Checks ran in a Farbaek test space against the applied content.", "Run npm test, then try again.", "Not run: the plan listed no checks."]) {
      expect(forPeople(line)).toBe(line);
    }
  });
});
