import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_RECEIVED, ReceivedLog, type ReceivedEntry } from "./received-log";

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "farbaek-received-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const entry = (id: string, over: Partial<ReceivedEntry> = {}): ReceivedEntry => ({
  id,
  name: `From Redmi A5 ${id}`,
  from: "Redmi A5",
  at: "2026-11-13T13:14:04.000Z",
  folder: path.join(dir, "Downloads", `From Redmi A5 ${id}`),
  files: 1,
  bytes: 133_035,
  summary: "1 photo",
  single: "Screenshot.png",
  ...over,
});

describe("Recently received (stage 188)", () => {
  it("keeps arrivals across restarts, newest first, one entry per transfer", async () => {
    const file = path.join(dir, "received.json");
    const log = new ReceivedLog(file);
    await log.add(entry("a"));
    await log.add(entry("b"));
    await log.add(entry("a", { summary: "2 photos" }));
    const again = new ReceivedLog(file);
    const listed = await again.load();
    expect(listed.map((e) => e.id)).toEqual(["a", "b"]);
    expect(listed[0]!.summary).toBe("2 photos");
  });

  it(`keeps only the newest ${MAX_RECEIVED}`, async () => {
    const log = new ReceivedLog(path.join(dir, "received.json"));
    for (let i = 0; i < MAX_RECEIVED + 5; i++) await log.add(entry(`t${i}`));
    const listed = await new ReceivedLog(path.join(dir, "received.json")).load();
    expect(listed).toHaveLength(MAX_RECEIVED);
    expect(listed[0]!.id).toBe(`t${MAX_RECEIVED + 4}`);
  });

  it("treats a missing or damaged file as an empty history, and drops entries that don't check out", async () => {
    expect(await new ReceivedLog(path.join(dir, "none.json")).load()).toEqual([]);
    const damaged = path.join(dir, "damaged.json");
    await fs.writeFile(damaged, "{not json", "utf8");
    expect(await new ReceivedLog(damaged).load()).toEqual([]);
    const mixed = path.join(dir, "mixed.json");
    await fs.writeFile(mixed, JSON.stringify([entry("ok"), { ...entry("relative"), folder: "Downloads/x" }, { id: "" }, entry("ok")]), "utf8");
    expect((await new ReceivedLog(mixed).load()).map((e) => e.id)).toEqual(["ok"]);
  });

  it("removes an entry by id only, and refuses one whose folder isn't an absolute path", async () => {
    const log = new ReceivedLog(path.join(dir, "received.json"));
    await log.add(entry("a"));
    await log.add(entry("b"));
    await log.remove("a");
    await log.remove("nope");
    expect(log.list().map((e) => e.id)).toEqual(["b"]);
    await expect(log.add(entry("c", { folder: "relative/path" }))).rejects.toThrow();
  });

  it("writes one at a time, so quick arrivals all survive", async () => {
    const file = path.join(dir, "received.json");
    const log = new ReceivedLog(file);
    await Promise.all(["a", "b", "c", "d"].map((id) => log.add(entry(id))));
    expect((await new ReceivedLog(file).load()).map((e) => e.id).sort()).toEqual(["a", "b", "c", "d"]);
  });
});
