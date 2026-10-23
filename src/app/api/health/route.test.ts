import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health", () => {
  it("is ok, uncached, and names the commit when the host provides it", async () => {
    vi.stubEnv("FARBAEK_COMMIT", "0123456789abcdef0123");
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, commit: "0123456789ab" });
  });

  it("names the commit from Farbaek's own deploy on the VPS", async () => {
    vi.stubEnv("FARBAEK_COMMIT", "fedcba9876543210fedc");
    expect(await GET().json()).toEqual({ ok: true, commit: "fedcba987654" });
  });

  it("works without a commit (local)", async () => {
    vi.stubEnv("FARBAEK_COMMIT", undefined as unknown as string);
    expect(await GET().json()).toEqual({ ok: true, commit: null });
  });
});
