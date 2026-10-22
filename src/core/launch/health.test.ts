import { describe, expect, it } from "vitest";
import { checkSite, judgeProbe, siteCheckUrl, type ProbeResult } from "./health";

const DEP = "00000000-0000-4000-8000-0000000000aa";
const SHA = "a".repeat(64);
const expected = { deploymentId: DEP, indexSha256: SHA };
const ok: ProbeResult = { status: 200, ms: 140.4, deploymentHeader: DEP, etag: `"${SHA}"` };

describe("live-site health checks", () => {
  it("only ever builds an https address from a valid site name and the configured domain", () => {
    expect(siteCheckUrl("volt-ride", "farbaek.si")).toBe("https://volt-ride.farbaek.si/");
    expect(siteCheckUrl("volt-ride", null)).toBeNull();
    expect(siteCheckUrl("evil.com/x", "farbaek.si")).toBeNull();
    expect(siteCheckUrl("www", "farbaek.si")).toBeNull();
    expect(siteCheckUrl("ok-site", "localhost:3000")).toBeNull();
  });

  it("calls a site live only when the version and the home page's hash both match", () => {
    expect(judgeProbe(ok, expected)).toEqual({ verdict: "live", status: 200, ms: 140, detail: "Answered 200 in 140 ms with exactly these files." });
    expect(judgeProbe({ ...ok, deploymentHeader: "other" }, expected).verdict).toBe("previous");
    expect(judgeProbe({ ...ok, deploymentHeader: null }, expected).detail).toMatch(/without naming a version/);
    expect(judgeProbe({ ...ok, etag: `"${"b".repeat(64)}"` }, expected).verdict).toBe("previous");
    expect(judgeProbe({ ...ok, etag: `W/"${SHA}"` }, expected).verdict).toBe("live");
    expect(judgeProbe({ ...ok, status: 503 }, expected)).toMatchObject({ verdict: "down", detail: "It answered 503." });
    expect(judgeProbe({ status: null, ms: 8000, deploymentHeader: null, etag: null, error: "timeout" }, expected)).toMatchObject({ verdict: "unreachable", detail: "No answer within 8 seconds." });
  });

  it("tries again while the earlier version is still cached, then gives the last answer", async () => {
    const answers: ProbeResult[] = [{ ...ok, deploymentHeader: "old" }, { ...ok, deploymentHeader: "old" }, ok];
    const waits: number[] = [];
    const r = await checkSite(async () => answers.shift()!, expected, { sleep: async (ms) => void waits.push(ms) });
    expect(r.verdict).toBe("live");
    expect(waits).toEqual([4000, 4000]);

    const stale = await checkSite(async () => ({ ...ok, deploymentHeader: "old" }), expected, { sleep: async () => undefined });
    expect(stale.verdict).toBe("previous");
    const down = await checkSite(async () => ({ ...ok, status: 500 }), expected, { sleep: async () => undefined });
    expect(down.verdict).toBe("down");
  });
});
