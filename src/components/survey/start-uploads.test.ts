/**
 * What the start screen keeps in the browser, and how it comes back (stage 250, ADR 0258). SYNTHETIC files only.
 */
import { describe, expect, it } from "vitest";
import { sketchFileNames } from "@/core/survey/autosurvey/sketch";
import { fromKept, keptSketches, readAlready, toKept, type Upload } from "./start-uploads";

const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" });
const UPLOADS: Upload[] = [
  { key: "1", name: "points.csv", size: 40, kind: "survey-data", content: "1,500000,600000,0,CP\n", read: null, problem: null, encoding: null, adjust: "compass" },
  { key: "2", name: "too-big.csv", size: 9e9, kind: "survey-data", content: "", read: null, problem: "This file is larger than 20 MB.", encoding: null, adjust: null },
  { key: "3", name: "sketch.jpg", size: 4, kind: "sketch", photo, problem: null },
  { key: "4", name: "broken.heic", size: 4, kind: "sketch", photo: null, problem: "This photo couldn't be opened here." },
  { key: "5", name: "deed.pdf", size: 9, kind: "document", reason: "Not read yet." },
  { key: "6", name: "codes.fcl", size: 9, kind: "code-library", content: "CP,Control point\n", read: { ok: false, problem: "x" } },
];

describe("a photo marked as the deed or an old plan (stage 294)", () => {
  it("keeps the mark, and only a real one comes back", () => {
    const deed: Upload = { key: "d", name: "deed.jpg", size: 4, kind: "sketch", photo, problem: null, deed: true };
    const kept = toKept([deed, UPLOADS[2]!], "", "LOCAL");
    expect(kept.uploads).toEqual([
      { name: "deed.jpg", size: 4, kind: "sketch", photo, deed: true },
      { name: "sketch.jpg", size: 4, kind: "sketch", photo },
    ]);
    const back = fromKept(kept, () => "k")!;
    expect(back.uploads.map((u) => u.kind === "sketch" && u.deed === true)).toEqual([true, false]);
    // Anything but true is no mark: a damaged entry is a sketch, as before.
    const odd = fromKept({ ...kept, uploads: [{ ...kept.uploads[0]!, deed: "yes" }] }, () => "k")!;
    expect(odd.uploads[0]!.kind === "sketch" && "deed" in odd.uploads[0]!).toBe(false);
  });
});

describe("what the start screen keeps", () => {
  it("keeps what can be sent, without what was worked out from it, and never the consent", () => {
    const kept = toKept(UPLOADS, "Sample job", "EPSG:5235");
    expect(kept.uploads.map((u) => u.name)).toEqual(["points.csv", "sketch.jpg", "deed.pdf", "codes.fcl"]);
    expect(kept).toMatchObject({ v: 1, title: "Sample job", crsId: "EPSG:5235" });
    expect(JSON.stringify(Object.keys(kept))).not.toContain("consent");
    expect(kept.uploads[0]).toEqual({ name: "points.csv", size: 40, kind: "survey-data", content: "1,500000,600000,0,CP\n", encoding: null, adjust: "compass" });
  });

  it("comes back as the screen shows files before reading them again", () => {
    let n = 0;
    const back = fromKept(toKept(UPLOADS, "Sample job", "EPSG:5235"), () => `k${++n}`)!;
    expect(back.title).toBe("Sample job");
    expect(back.uploads.map((u) => [u.key, u.name, u.kind])).toEqual([
      ["k1", "points.csv", "survey-data"],
      ["k2", "sketch.jpg", "sketch"],
      ["k3", "deed.pdf", "document"],
      ["k4", "codes.fcl", "code-library"],
    ]);
    const data = back.uploads[0]!;
    expect(data.kind === "survey-data" && data.adjust).toBe("compass");
    const sketch = back.uploads[1]!;
    expect(sketch.kind === "sketch" && sketch.photo).toBe(photo);
  });

  it("says when Generate Plan had been pressed with them, so a refresh mid-run doesn't invite a second plan", () => {
    expect(fromKept(toKept(UPLOADS, "", "EPSG:5235", 1_700_000_000_000), () => "k")!.sent).toBe(true);
    expect(fromKept(toKept(UPLOADS, "", "EPSG:5235"), () => "k")!.sent).toBe(false);
  });

  it("leaves out anything it didn't write, so a damaged entry can't break the screen", () => {
    expect(fromKept(null, () => "k")).toBeNull();
    expect(fromKept({ v: 2, uploads: [] }, () => "k")).toBeNull();
    const back = fromKept({ v: 1, title: 7, crsId: null, uploads: [null, { name: "", size: 1, kind: "document" }, { name: "x.csv", size: -1, kind: "survey-data", content: "" }, { name: "a.jpg", size: 1, kind: "sketch", photo: "not a blob" }, { name: "b.csv", size: 1, kind: "survey-data", content: "1,2,3", adjust: "made-up" }] }, () => "k")!;
    expect(back).toMatchObject({ title: "", crsId: "" });
    expect(back.uploads.map((u) => u.name)).toEqual(["b.csv"]);
    expect(back.uploads[0]!.kind === "survey-data" && back.uploads[0]!.adjust).toBeNull();
  });
});

describe("sketch photos kept until their read is saved", () => {
  it("come back only whole: every photo a named image, one to six of them", () => {
    expect(keptSketches({ v: 1, jobId: null, before: "2026-11-24T09:00:00Z", photos: [{ name: "a.jpg", blob: photo }] })).toMatchObject({ before: "2026-11-24T09:00:00Z", photos: [{ name: "a.jpg" }] });
    expect(keptSketches({ v: 1, jobId: null, photos: [] })).toBeNull();
    expect(keptSketches({ v: 1, jobId: null, photos: [{ name: "a.jpg", blob: "x" }] })).toBeNull();
    expect(keptSketches({ v: 1, jobId: null, photos: Array.from({ length: 7 }, () => ({ name: "a.jpg", blob: photo })) })).toBeNull();
  });

  it("are known to be read only by a read newer than the one the plan had when they were kept, of photos named as the server names them", () => {
    const names = ["image.jpg", "image.jpg"];
    const files = sketchFileNames(names);
    expect(files).toEqual(["image.jpg", "image.jpg (2)"]);
    const before = "2026-11-24T09:58:00Z";
    expect(readAlready({ before, names }, { readAt: "2026-11-24T10:01:00Z", files })).toBe(true);
    expect(readAlready({ before: null, names }, { readAt: "2026-11-24T10:01:00Z", files })).toBe(true);
    // The read the plan already had: a phone naming every shot "image.jpg" can't make retaken photos pass as read.
    expect(readAlready({ before, names }, { readAt: before, files })).toBe(false);
    expect(readAlready({ before, names }, { readAt: "2026-11-24T10:01:00Z", files: ["other.jpg"] })).toBe(false);
    expect(readAlready({ before, names }, null)).toBe(false);
  });
});
