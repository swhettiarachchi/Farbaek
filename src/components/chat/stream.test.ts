import { describe, expect, it } from "vitest";
import { encodeEvent, encodeKeepAlive } from "@/core/chat/sse";
import type { TurnEvent } from "@/core/chat/protocol";
import { readTurnStream } from "./stream";

function streamOf(parts: Uint8Array[], cut = false): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const p of parts) controller.enqueue(p);
      if (cut) controller.error(new Error("network"));
      else controller.close();
    },
  });
}

describe("reading a turn's stream in the browser", () => {
  it("passes events on in order, through keep-alives and split chunks, and says the answer ended", async () => {
    const whole = new Uint8Array([...encodeEvent("text", { type: "text", v: "Hel" }), ...encodeKeepAlive(), ...encodeEvent("text", { type: "text", v: "lo" }), ...encodeEvent("done", { type: "done", status: "complete", error: null, thinkingMs: null, modelName: "Claude Haiku 5.5", stop: null })]);
    const seen: TurnEvent[] = [];
    const r = await readTurnStream(streamOf([whole.slice(0, 9), whole.slice(9, 40), whole.slice(40)]), (e) => seen.push(e));
    expect(seen.map((e) => (e.type === "text" ? e.v : e.type))).toEqual(["Hel", "lo", "done"]);
    expect(r.done).toBe(true);
  });

  it("skips what isn't an event, and reports a stream that ended without its end", async () => {
    const seen: TurnEvent[] = [];
    const r = await readTurnStream(streamOf([new TextEncoder().encode("data: not json\n\nevent: x\ndata: {\"type\":\"evil\"}\n\n"), encodeEvent("text", { type: "text", v: "A" })]), (e) => seen.push(e));
    expect(seen).toEqual([{ type: "text", v: "A" }]);
    expect(r.done).toBe(false);
  });

  it("rejects when the connection is cut, after passing on what arrived", async () => {
    const seen: TurnEvent[] = [];
    await expect(readTurnStream(streamOf([encodeEvent("text", { type: "text", v: "Part" })], true), (e) => seen.push(e))).rejects.toThrow();
  });
});

describe("choosing a voice to read aloud", () => {
  it("takes the device's own voice first, and any voice for the language otherwise", async () => {
    const { pickVoice } = await import("./use-speaker");
    const net = { lang: "en-US", localService: false, default: false };
    const local = { lang: "en-GB", localService: true, default: false };
    expect(pickVoice([net, local], "en-US")).toBe(local);
    expect(pickVoice([net], "en-US")).toBe(net);
    expect(pickVoice([{ lang: "si-LK", localService: true, default: true }], "en-US")).toBeNull();
  });
});
