import { describe, expect, it } from "vitest";
import { FarbaekAgentClient, FarbaekApiError, checkServerUrl, pairWithFarbaek } from "./farbaek-client";

const TOKEN = `fa_${"a".repeat(43)}`;

function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const seen: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    const r = handler(url, init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, seen };
}

describe("agent API client", () => {
  it("sends tokens only over HTTPS, or HTTP to this computer", () => {
    expect(checkServerUrl("https://farbaek.com/app")).toBe("https://farbaek.com");
    expect(checkServerUrl("http://localhost:3000")).toBe("http://localhost:3000");
    for (const bad of ["http://farbaek.com", "ftp://x", "https://user:pw@farbaek.com", "not a url"]) expect(() => checkServerUrl(bad)).toThrow(FarbaekApiError);
  });

  it("pairs, then sends the token as a bearer header", async () => {
    const { f, seen } = fakeFetch((url) =>
      url.endsWith("/pair") ? { status: 201, body: { data: { token: TOKEN, agentId: "a1", workspace: { id: "o1", name: "Studio" } } } } : { body: { data: [] } },
    );
    const paired = await pairWithFarbaek("http://localhost:3000", { code: "ABCDE-23456", name: "PC", platform: "windows" }, f);
    expect(paired.agentId).toBe("a1");
    await new FarbaekAgentClient("http://localhost:3000", paired.token, f).tasks();
    expect((seen[1]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(seen[0]!.init.redirect).toBe("error");
  });

  it("follows file pages to the end", async () => {
    const { f, seen } = fakeFetch((url) => {
      const after = new URL(url).searchParams.get("after");
      return after === null
        ? { body: { data: { files: [{ path: "a.md", revision: 1, sha256: "x", content: "A" }], next: "a.md", total: 2 } } }
        : { body: { data: { files: [{ path: "b.md", revision: 1, sha256: "y", content: "B" }], next: null, total: 2 } } };
    });
    const files = await new FarbaekAgentClient("http://localhost:3000", TOKEN, f).snapshot("t1");
    expect(files.map((x) => x.path)).toEqual(["a.md", "b.md"]);
    expect(seen[1]!.url).toBe("http://localhost:3000/api/v1/agent/tasks/t1/files?after=a.md");
  });

  it("turns the server's error shape into a typed error, and refuses unexpected shapes", async () => {
    const denied = fakeFetch(() => ({ status: 401, body: { error: { code: "UNAUTHENTICATED", message: "This agent token isn't valid or was revoked." } } }));
    await expect(new FarbaekAgentClient("http://localhost:3000", TOKEN, denied.f).me()).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    const odd = fakeFetch(() => ({ body: { data: { surprise: true } } }));
    await expect(new FarbaekAgentClient("http://localhost:3000", TOKEN, odd.f).me()).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
});
