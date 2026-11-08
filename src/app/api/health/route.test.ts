import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

const buildId = (commit: string) => createHash("sha256").update(`farbaek-build:${commit}`).digest("hex").slice(0, 12);

describe("GET /api/health", () => {
  it("is ok and uncached, and shows an id of the build, never the commit (stage 171)", async () => {
    vi.stubEnv("FARBAEK_COMMIT", "0123456789abcdef0123");
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ ok: true, build: buildId("0123456789abcdef0123") });
    expect(JSON.stringify(body)).not.toContain("0123456789");
  });

  it("gives the same id that scripts/build-id.mjs works out for a deployed commit", async () => {
    vi.stubEnv("FARBAEK_COMMIT", "fedcba9876543210fedc");
    expect(await GET().json()).toEqual({ ok: true, build: buildId("fedcba9876543210fedc") });
  });

  it("works without a commit (local)", async () => {
    vi.stubEnv("FARBAEK_COMMIT", undefined as unknown as string);
    expect(await GET().json()).toEqual({ ok: true, build: null });
  });
});
