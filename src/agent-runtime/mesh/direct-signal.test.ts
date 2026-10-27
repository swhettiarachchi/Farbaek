import { duplexPair } from "node:stream";
import { describe, expect, it } from "vitest";
import { DirectError, SignalChannel } from "./direct-signal";

describe("setting up a direct link", () => {
  it("passes each message across, however the stream splits or joins them", async () => {
    const [a, b] = duplexPair();
    const receiver = new SignalChannel(b);
    const line = JSON.stringify({ t: "sdp", type: "offer", sdp: "v=0 é" }) + "\n" + JSON.stringify({ t: "ice", candidate: { candidate: "candidate:1 1 udp 1 192.0.2.1 5000 typ srflx", sdpMid: "0", sdpMLineIndex: 0 } }) + "\n";
    const bytes = Buffer.from(line, "utf8");
    // Split inside the two-byte "é" too.
    for (let i = 0; i < bytes.length; i += 7) a.write(bytes.subarray(i, i + 7));
    expect(await receiver.next(1_000)).toEqual({ t: "sdp", type: "offer", sdp: "v=0 é" });
    expect(await receiver.next(1_000)).toMatchObject({ t: "ice", candidate: { sdpMid: "0" } });
  });

  it("refuses what isn't a setup message, and too many candidates", async () => {
    for (const bad of ['{"t":"sdp","type":"offer","sdp":""}', '{"t":"run","cmd":"rm"}', "not json", JSON.stringify({ t: "sdp", type: "offer", sdp: "x".repeat(17_000) })]) {
      const [a, b] = duplexPair();
      const receiver = new SignalChannel(b);
      a.write(`${bad}\n`);
      await expect(receiver.next(1_000)).rejects.toThrow(DirectError);
    }
    const [a, b] = duplexPair();
    const receiver = new SignalChannel(b);
    const ice = JSON.stringify({ t: "ice", candidate: { candidate: "candidate:1" } });
    a.write(`${Array.from({ length: 65 }, () => ice).join("\n")}\n`);
    const got: unknown[] = [];
    await expect(
      (async () => {
        for (;;) got.push(await receiver.next(1_000));
      })(),
    ).rejects.toThrow(DirectError);
    expect(got).toHaveLength(64);
  });

  it("says when the other side stops, and when it doesn't answer in time", async () => {
    const [a, b] = duplexPair();
    const receiver = new SignalChannel(b);
    await expect(receiver.next(50)).rejects.toThrow(/didn't answer in time/);
    a.end();
    await expect(receiver.next(1_000)).rejects.toThrow(/stopped setting up/);
  });
});
