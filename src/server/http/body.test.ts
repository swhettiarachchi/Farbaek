import { describe, expect, it } from "vitest";
import { readBytesCapped, readTextCapped } from "./body";

/** A request whose body arrives in chunks with no Content-Length, as a chunked upload does. */
function chunked(parts: string[]): Request {
  const enc = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < parts.length) controller.enqueue(enc.encode(parts[i++]!));
      else controller.close();
    },
  });
  return new Request("https://example.test/hook", { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("capped request bodies", () => {
  it("reads a body within the limit, as text and as bytes", async () => {
    expect(await readTextCapped(new Request("https://example.test", { method: "POST", body: "héllo" }), 64)).toBe("héllo");
    expect(await readBytesCapped(new Request("https://example.test", { method: "POST", body: "abc" }), 3)).toEqual(new TextEncoder().encode("abc"));
    expect(await readTextCapped(new Request("https://example.test", { method: "POST" }), 8)).toBe("");
  });

  it("stops a chunked body as soon as it passes the limit, without a Content-Length", async () => {
    let pulled = 0;
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(enc.encode("x".repeat(1000)));
      },
    });
    const endless = new Request("https://example.test", { method: "POST", body, duplex: "half" } as RequestInit);
    expect(await readTextCapped(endless, 4096)).toBeNull();
    expect(pulled).toBeLessThan(10);
    expect(await readTextCapped(chunked(["ab", "cd", "ef"]), 6)).toBe("abcdef");
    expect(await readTextCapped(chunked(["ab", "cd", "efg"]), 6)).toBeNull();
  });

  it("refuses a declared length over the limit before reading anything", async () => {
    const r = new Request("https://example.test", { method: "POST", body: "tiny", headers: { "content-length": "999999" } });
    expect(await readTextCapped(r, 1024)).toBeNull();
  });
});
