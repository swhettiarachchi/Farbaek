import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health", () => {
  it("is ok, uncached, and names the commit when the host provides it", async () => {
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "0123456789abcdef0123");
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, commit: "0123456789ab" });
  });

  it("works without a commit (local)", async () => {
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", undefined as unknown as string);
    expect(await GET().json()).toEqual({ ok: true, commit: null });
  });
});
