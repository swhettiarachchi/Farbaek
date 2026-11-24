/**
 * Office profiles (stage 248, ADR 0256): the body's rules, how a new plan picks one, and what it takes from one. SYNTHETIC values.
 */
import { describe, expect, it } from "vitest";
import { commonCodes, type CodeEntry } from "./codes";
import { DEFAULT_STATEMENT, emptyDocument } from "./document";
import { officeProfileBodySchema, precisionFromText, profileFromPlan, profilePrecision, profileSummary, readOfficeProfile, resolveProfile, withProfile, type OfficeProfile, type OfficeProfileBody } from "./profile";

const body = (o: Partial<OfficeProfileBody> = {}): OfficeProfileBody => ({ crsId: "EPSG:5235", equipment: [], codes: null, sheet: null, statement: "", ...o });
const profile = (id: string, o: Partial<OfficeProfileBody> = {}): OfficeProfile => ({ id, name: `Profile ${id}`, version: 1, body: body(o), updatedAt: "2026-11-24T00:00:00Z" });
const SOKKIA = profile("s", { equipment: [{ kind: "total_station", make: "Sokkia", model: "CX-105", exports: ["sdr", "sokkialist", "dxf"] }] });
const LEICA = profile("l", { equipment: [{ kind: "total_station", make: "Leica", model: "TS07", exports: ["gsi", "delimited"] }] });
const GNSS = profile("g", { equipment: [{ kind: "gnss", make: "Any", model: "RTK", exports: ["delimited"] }] });
const office: CodeEntry[] = [
  { code: "BW", meaning: "Boundary wall", kind: "line", line: "solid", legend: true },
  { code: "BP", meaning: "Boundary post", kind: "mark", line: "solid", legend: true },
];

describe("the profile's body", () => {
  it("accepts a full set-up and refuses an unknown grid, a hidden character and too many codes", () => {
    expect(officeProfileBodySchema.safeParse(SOKKIA.body).success).toBe(true);
    expect(officeProfileBodySchema.safeParse(body({ crsId: "EPSG:9999" })).success).toBe(false);
    expect(officeProfileBodySchema.safeParse(body({ statement: `a${String.fromCharCode(7)}b` })).success).toBe(false);
    const many = Array.from({ length: 501 }, (_, i) => ({ ...office[0]!, code: `C${i}` }));
    expect(officeProfileBodySchema.safeParse(body({ codes: { entries: many, grammar: "farbaek" } })).success).toBe(false);
  });

  it("reads a stored row defensively: a body that doesn't fit is left out", () => {
    expect(readOfficeProfile({ id: "x", name: "Ok", version: 2, body: SOKKIA.body, updated_at: "t" })?.version).toBe(2);
    expect(readOfficeProfile({ id: "x", name: "Bad", version: 1, body: { crsId: 5 }, updated_at: "t" })).toBeNull();
  });
});

describe("which profile a new plan starts from", () => {
  it("takes the one whose instruments export the files, before the one used last", () => {
    expect(resolveProfile([SOKKIA, LEICA], { formats: ["sdr"], lastChosen: "l" })).toMatchObject({ chosen: { id: "s" }, why: "Its instruments export the files you uploaded." });
    expect(resolveProfile([SOKKIA, LEICA], { formats: ["gsi", "delimited"], lastChosen: null }).chosen?.id).toBe("l");
  });

  it("settles a tie by the one used last, and asks when nothing settles it", () => {
    expect(resolveProfile([LEICA, GNSS], { formats: ["delimited"], lastChosen: "g" })).toMatchObject({ chosen: { id: "g" }, why: "You used it last, and its instruments export these files." });
    expect(resolveProfile([LEICA, GNSS], { formats: ["delimited"], lastChosen: null })).toMatchObject({ chosen: null, why: "More than one profile's instruments export these files." });
    expect(resolveProfile([SOKKIA, LEICA], { formats: [], lastChosen: null })).toMatchObject({ chosen: null, why: "This workspace has more than one office profile." });
  });

  it("falls back to the one used last, then the only one, then none", () => {
    expect(resolveProfile([SOKKIA, LEICA], { formats: ["landxml"], lastChosen: "l" }).chosen?.id).toBe("l");
    expect(resolveProfile([SOKKIA], { formats: [], lastChosen: null })).toMatchObject({ chosen: { id: "s" }, why: "It's this workspace's only office profile." });
    expect(resolveProfile([], { formats: ["sdr"], lastChosen: null }).chosen).toBeNull();
  });
});

describe("what a new plan takes from a profile", () => {
  it("takes the office list as checked, with its line words, the sheet and the statement, and nothing about the land", () => {
    const p = profile("s", { codes: { entries: office, grammar: "carlson" }, sheet: { ...emptyDocument().settings, template: "panel", paper: "A3", orientation: "landscape" }, statement: "Boundaries as shown by the owner and agreed by the neighbours" });
    const before = emptyDocument();
    const doc = withProfile(before, p, ["BW"]);
    expect(doc.codes.map((c) => c.code)).toEqual(["BW", "BP"]);
    expect(doc.grammar).toBe("carlson");
    expect(doc.provenance["codes"]).toEqual({ source: "engine", reviewed: true });
    expect(doc.settings).toMatchObject({ template: "panel", paper: "A3", orientation: "landscape" });
    expect(doc.sheet.statement).toBe("Boundaries as shown by the owner and agreed by the neighbours");
    expect({ ...doc.sheet, statement: before.sheet.statement }).toEqual(before.sheet);
    expect(doc.lots).toEqual(before.lots);
  });

  it("leaves Farbaek's list, sheet and statement where the profile has none", () => {
    const before = emptyDocument();
    const doc = withProfile(before, profile("x"), []);
    expect(doc.codes).toEqual(before.codes);
    expect(doc.settings).toEqual(before.settings);
    expect(doc.sheet.statement).toBe(DEFAULT_STATEMENT);
    expect(doc.provenance["codes"]).toEqual(before.provenance["codes"]);
  });

  it("starts a profile from a plan: its checked office list, its sheet and its own statement only", () => {
    const plan = { ...emptyDocument(), codes: office, grammar: "carlson" as const, provenance: { codes: { source: "engine" as const, reviewed: true } }, sheet: { ...emptyDocument().sheet, statement: "As agreed on site" } };
    const b = profileFromPlan(plan, "EPSG:5235");
    expect(b.codes).toEqual({ entries: office, grammar: "carlson" });
    expect(b.statement).toBe("As agreed on site");
    expect(officeProfileBodySchema.safeParse(b).success).toBe(true);
    // The common list, or a list never checked, isn't an office library.
    expect(profileFromPlan({ ...emptyDocument(), codes: commonCodes(), provenance: { codes: { source: "engine", reviewed: true } } }, null).codes).toBeNull();
    expect(profileFromPlan({ ...plan, provenance: {} }, null).codes).toBeNull();
    expect(profileFromPlan(emptyDocument(), "EPSG:9999").crsId).toBeNull();
  });

  it("says what a profile holds in a sentence", () => {
    expect(profileSummary(SOKKIA)).toBe("SLD99 / Sri Lanka Grid 1999; Sokkia CX-105; Farbaek's code list; Farbaek's sheet.");
    const stated = profile("p", { equipment: [{ ...SOKKIA.body.equipment[0]!, precision: { angleSeconds: 3, distanceMm: 2, distancePpm: 2 } }] });
    expect(profileSummary(stated)).toBe("SLD99 / Sri Lanka Grid 1999; Sokkia CX-105 (3″, 2 mm + 2 ppm); Farbaek's code list; Farbaek's sheet.");
  });
});

describe("a total station's stated precision (stage 267, ADR 0274)", () => {
  const ts = (make: string, exports: ("sdr" | "gsi")[], precision?: { angleSeconds: number; distanceMm: number; distancePpm: number }) => ({ kind: "total_station" as const, make, model: "X", exports, ...(precision ? { precision } : {}) });
  const P3 = { angleSeconds: 3, distanceMm: 2, distancePpm: 2 };
  const P5 = { angleSeconds: 5, distanceMm: 3, distancePpm: 2 };

  it("is kept with the instrument when given, and older profiles without it still read", () => {
    expect(officeProfileBodySchema.safeParse(body({ equipment: [ts("Sokkia", ["sdr"], P3)] })).success).toBe(true);
    expect(readOfficeProfile({ id: "x", name: "Old", version: 1, body: SOKKIA.body, updated_at: "t" })?.body.equipment[0]!.precision).toBeUndefined();
    expect(officeProfileBodySchema.safeParse(body({ equipment: [ts("Sokkia", ["sdr"], { angleSeconds: 0, distanceMm: 2, distancePpm: 2 })] })).success).toBe(false);
    expect(officeProfileBodySchema.safeParse(body({ equipment: [ts("Sokkia", ["sdr"], { angleSeconds: 5, distanceMm: 2, distancePpm: -1 })] })).success).toBe(false);
  });

  it("is read from the form as all three figures or none", () => {
    expect(precisionFromText("", " ", "")).toEqual({ ok: true, value: null });
    expect(precisionFromText("3", "2", "2")).toEqual({ ok: true, value: P3 });
    expect(precisionFromText("1.5", "0.8", "1")).toEqual({ ok: true, value: { angleSeconds: 1.5, distanceMm: 0.8, distancePpm: 1 } });
    expect(precisionFromText("3", "", "2").ok).toBe(false);
    expect(precisionFromText("3″", "2", "2").ok).toBe(false);
    expect(precisionFromText("90", "2", "2").ok).toBe(false);
  });

  it("weighs a file by the total station that exports it, else the only one that states one, never a guess between two", () => {
    expect(profilePrecision(null)).toBeNull();
    expect(profilePrecision(SOKKIA)).toBeNull();
    const one = profile("1", { equipment: [ts("Sokkia", ["sdr"], P3)] });
    expect(profilePrecision(one)).toEqual({ ...P3, instrument: "Sokkia X" });
    // Two that state different figures: the one exporting the file's format.
    const two = profile("2", { equipment: [ts("Sokkia", ["sdr"], P3), ts("Leica", ["gsi"], P5)] });
    expect(profilePrecision(two, "sdr")).toEqual({ ...P3, instrument: "Sokkia X" });
    // Neither exports it: two different figures, so none.
    const other = profile("3", { equipment: [ts("Sokkia", ["gsi"], P3), ts("Leica", ["gsi"], P5)] });
    expect(profilePrecision(other, "sdr")).toBeNull();
    // A GNSS receiver or a level never weighs a traverse.
    const gnss = profile("4", { equipment: [{ kind: "gnss", make: "Any", model: "RTK", exports: ["sdr"], precision: P3 }] });
    expect(profilePrecision(gnss)).toBeNull();
  });
});
