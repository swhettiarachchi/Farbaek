import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createVercelClient, type Fetcher } from "./vercel-client";

const TOKEN = "vercel_test_token";

function fake(respond: (url: URL, init: RequestInit) => Response) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher: Fetcher = async (u, init) => {
    const url = new URL(u);
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetcher, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the Vercel client", () => {
  it("calls only api.vercel.com, with the token and the team, and never follows redirects", async () => {
    const f = fake(() => json({ user: { id: "u1", username: "suvin" } }));
    expect(await createVercelClient(TOKEN, { teamId: "team_1", fetcher: f.fetcher }).whoami()).toEqual({ ok: true, value: { id: "u1", username: "suvin" } });
    expect(f.calls[0]!.url.origin).toBe("https://api.vercel.com");
    expect(f.calls[0]!.url.pathname).toBe("/v2/user");
    expect(f.calls[0]!.url.searchParams.get("teamId")).toBe("team_1");
    expect((f.calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(f.calls[0]!.init.redirect).toBe("error");
  });

  it("uploads a file named by its SHA-1", async () => {
    const f = fake(() => json({ urls: [] }));
    const content = Buffer.from("<h1>Hi</h1>");
    const r = await createVercelClient(TOKEN, { fetcher: f.fetcher }).uploadFile(content);
    const sha = createHash("sha1").update(content).digest("hex");
    expect(r).toEqual({ ok: true, value: { sha, size: content.length } });
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-vercel-digest"]).toBe(sha);
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect(f.calls[0]!.url.pathname).toBe("/v2/files");
  });

  it("creates a production deployment from uploaded files, with only the settings it knows", async () => {
    const f = fake(() => json({ id: "dpl_1", url: "site-abc.vercel.app", inspectorUrl: "https://vercel.com/x/site/dpl_1", readyState: "QUEUED" }));
    const r = await createVercelClient(TOKEN, { fetcher: f.fetcher }).createDeployment({
      name: "harbour-lane",
      files: [{ file: "index.html", sha: "a".repeat(40), size: 10 }],
      settings: { framework: null, buildCommand: null, outputDirectory: null },
    });
    expect(r).toEqual({ ok: true, value: { id: "dpl_1", url: "site-abc.vercel.app", inspectorUrl: "https://vercel.com/x/site/dpl_1", readyState: "QUEUED", errorMessage: null, aliases: [] } });
    expect(f.calls[0]!.url.pathname).toBe("/v13/deployments");
    expect(f.calls[0]!.url.searchParams.get("skipAutoDetectionConfirmation")).toBe("1");
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ name: "harbour-lane", files: [{ file: "index.html", sha: "a".repeat(40), size: 10 }], target: "production", projectSettings: { framework: null } });
  });

  it("says plainly what went wrong, and never repeats the token", async () => {
    const say = async (status: number, body: unknown = {}) => (await createVercelClient(TOKEN, { fetcher: fake(() => json(body, status)).fetcher }).whoami()) as { ok: false; code: string; message: string };
    expect(await say(401)).toMatchObject({ ok: false, code: "AUTH" });
    expect(await say(402)).toMatchObject({ ok: false, code: "PAYMENT" });
    expect(await say(429)).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(await say(500)).toMatchObject({ ok: false, code: "UNAVAILABLE" });
    const invalid = await say(400, { error: { code: "bad_request", message: `Invalid request with ${TOKEN}` } });
    expect(invalid.code).toBe("INVALID");
    expect(invalid.message).not.toContain(TOKEN);
    const down = await createVercelClient(TOKEN, {
      fetcher: async () => {
        throw new TypeError("fetch failed");
      },
    }).getDeployment("dpl_1");
    expect(down).toMatchObject({ ok: false, code: "UNAVAILABLE" });
  });
});
