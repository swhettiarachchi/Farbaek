/**
 * The hourly job that gives back usage a stopped server left reserved (stage 272, ADR 0279): what it asks the database, and that a
 * database it can't ask is a failed job, never "nothing to do".
 */
import { describe, expect, it } from "vitest";
import { STALE_USAGE_BATCH, STALE_USAGE_MINUTES, releaseStaleUsage } from "./stale-usage";

const client = (answer: { data: unknown; error: { message: string } | null }) => {
  const calls: { fn: string; args: unknown }[] = [];
  return { calls, rpc: (async (fn: string, args: unknown) => (calls.push({ fn, args }), answer)) as never };
};

describe("giving back usage a stopped server left reserved", () => {
  it("asks for reservations an hour old at least, in a bounded batch, and reports what was given back", async () => {
    // bigint columns arrive as numbers or as numeric strings, depending on the client.
    const c = client({ data: [{ released: 3, units: "1250", returned: "900" }], error: null });
    expect(await releaseStaleUsage(c)).toEqual({ released: 3, units: 1250, returned: 900 });
    expect(c.calls).toEqual([{ fn: "app_release_stale_usage", args: { p_minutes: 60, p_limit: 500 } }]);
    // An age far past any one call or Chat turn; the database refuses under thirty minutes.
    expect(STALE_USAGE_MINUTES).toBeGreaterThanOrEqual(30);
    expect(STALE_USAGE_BATCH).toBeLessThanOrEqual(1000);
  });

  it("fails loudly when the database can't be asked or answers something else", async () => {
    await expect(releaseStaleUsage(client({ data: null, error: { message: "connection refused" } }))).rejects.toThrow(/app_release_stale_usage/);
    await expect(releaseStaleUsage(client({ data: [], error: null }))).rejects.toThrow(/unexpected/);
    await expect(releaseStaleUsage(client({ data: [{ released: -1, units: 0, returned: 0 }], error: null }))).rejects.toThrow(/unexpected/);
    await expect(releaseStaleUsage(client({ data: [{ released: 1, units: 10 }], error: null }))).rejects.toThrow(/unexpected/);
  });
});
