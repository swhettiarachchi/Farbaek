/** Reading values from spoken words (stage 195): every form a recogniser may write, and every refusal. */
import { describe, expect, it } from "vitest";
import { cardinalWords, numberSpans, numbersIn, readBearing, readCount, readDate, readLength, readLotName, readNumber, readPointList, readScale, speakBearing, speakDigits, speakPointNumbers } from "./spoken";

describe("numbers from words", () => {
  it("reads digits, words, digit by digit and mixed", () => {
    expect(readNumber("25.4")?.text).toBe("25.4");
    expect(readNumber("twenty five point four")?.text).toBe("25.4");
    expect(readNumber("twenty-five point four")?.text).toBe("25.4");
    expect(readNumber("25 point 4")?.text).toBe("25.4");
    expect(readNumber("four five zero zero one two point three four five")?.text).toBe("450012.345");
    expect(readNumber("four five oh oh one two decimal three four five")?.text).toBe("450012.345");
    expect(readNumber("distance two five point four zero metres")?.text).toBe("25.40");
    // "point" first is the survey point, not a decimal point.
    expect(readNumber("point forty five")?.text).toBe("45");
    expect(readNumber("zero point forty five")?.text).toBe("0.45");
    expect(readNumber("one hundred and five")?.text).toBe("105");
    expect(readNumber("two lakh fifty thousand and twelve")?.text).toBe("250012");
    expect(readNumber("four hundred fifty thousand twelve point three")?.text).toBe("450012.3");
    expect(readNumber("double five three")?.text).toBe("553");
    expect(readNumber("minus zero point five")?.text).toBe("-0.5");
    expect(readNumber("450,012.345")?.text).toBe("450012.345");
  });

  it("refuses what doesn't read one way only", () => {
    expect(readNumber("four fifty thousand")).toBeNull();
    expect(readNumber("twenty one twenty two")).toBeNull();
    expect(readNumber("one and two")).toBeNull();
    expect(readNumber("lot B")).toBeNull();
    expect(readNumber("5 and 7")).toBeNull();
    expect(readNumber("oh, the lot")).toBeNull();
    expect(readNumber("thousand thousand")).toBeNull();
  });

  it("never reads to, too, for or won as digits", () => {
    expect(numbersIn("move it to the left for now")).toEqual([]);
    expect(numbersIn("points one to five").map((n) => n.text)).toEqual(["1", "5"]);
  });

  it("finds every number, and counts", () => {
    expect(numbersIn("lot B one, 25.4 metres and forty five degrees").map((n) => n.text)).toEqual(["1", "25.4", "45"]);
    expect(readCount("four lots")).toBe(4);
    expect(readCount("fifty one", 50)).toBeNull();
    expect(readCount("2.5")).toBeNull();
  });
});

describe("point lists", () => {
  const known = new Set(["1", "2", "3", "4", "5", "12", "21", "22", "101", "102", "103", "104", "A110", "105"]);
  it("reads lists, single digits as items, ranges and named points", () => {
    expect(readPointList("points 1, 2, 3 and 4", known)?.ids).toEqual(["1", "2", "3", "4"]);
    expect(readPointList("one two three four", known)?.ids).toEqual(["1", "2", "3", "4"]);
    expect(readPointList("twenty one twenty two", known)?.ids).toEqual(["21", "22"]);
    expect(readPointList("one to five", known)?.ids).toEqual(["1", "2", "3", "4", "5"]);
    expect(readPointList("from 101 through 104", known)?.ids).toEqual(["101", "102", "103", "104"]);
    expect(readPointList("101-103", known)?.ids).toEqual(["101", "102", "103"]);
    expect(readPointList("one hundred and five", known)?.ids).toEqual(["105"]);
    expect(readPointList("a110 and 12", known)?.ids).toEqual(["A110", "12"]);
  });

  it("names points that aren't in the project, and refuses ranges it can't read", () => {
    expect(readPointList("1, 2 and 99", known)).toEqual({ ids: ["1", "2"], unknown: ["99"] });
    expect(readPointList("1 to 7", known)).toEqual({ ids: ["1", "2", "3", "4", "5"], unknown: ["6", "7"] });
    expect(readPointList("to 5", known)).toBeNull();
    expect(readPointList("5 to 1", known)).toBeNull();
    expect(readPointList("1 to", known)).toBeNull();
    expect(readPointList("points", known)).toBeNull();
  });
});

describe("lot names, bearings, scales, lengths and dates", () => {
  it("reads lot names as label and superscript", () => {
    expect(readLotName("lot B1")).toEqual({ label: "B", sup: "1" });
    expect(readLotName("lot b one")).toEqual({ label: "B", sup: "1" });
    expect(readLotName("lot B superscript 2")).toEqual({ label: "B", sup: "2" });
    expect(readLotName("lot 4A")).toEqual({ label: "4", sup: "A" });
    expect(readLotName("lot four a")).toEqual({ label: "4", sup: "A" });
    expect(readLotName("lot 2")).toEqual({ label: "2", sup: "" });
    expect(readLotName("the big lot by the road")).toBeNull();
  });

  it("reads bearings by the tested parser", () => {
    expect(readBearing("45 30 15")?.degrees).toBeCloseTo(45 + 30 / 60 + 15 / 3600, 12);
    expect(readBearing("forty five degrees thirty minutes fifteen seconds")?.degrees).toBeCloseTo(45.504166666666, 9);
    expect(readBearing("bearing two seven zero degrees")?.degrees).toBe(270);
    expect(readBearing("north forty five east")?.degrees).toBe(45);
    expect(readBearing("south 30 west")?.degrees).toBe(210);
    expect(readBearing("45 75 00")).toBeNull();
    expect(readBearing("the road")).toBeNull();
  });

  it("reads scales, lengths and dates", () => {
    expect(readScale("1:500")).toEqual({ scale: 500 });
    expect(readScale("scale one to five hundred")).toEqual({ scale: 500 });
    expect(readScale("1 in 1000")).toEqual({ scale: 1000 });
    expect(readScale("automatic scale")).toEqual({ scale: null });
    expect(readScale("1:20")).toBeNull();
    expect(readScale("2:500")).toBeNull();
    expect(readLength("ten feet")).toEqual({ value: 10, text: "10", unit: "ft" });
    expect(readLength("3.5 metres")).toEqual({ value: 3.5, text: "3.5", unit: "m" });
    expect(readLength("zero metres")).toBeNull();
    expect(readDate("12.11.2026")).toBe("2026-11-12");
    expect(readDate("2026-11-12")).toBe("2026-11-12");
    expect(readDate("12 November 2026")).toBe("2026-11-12");
    expect(readDate("the twelfth of November twenty twenty six")).toBe("2026-11-12");
    expect(readDate("November 12, 2026")).toBe("2026-11-12");
    expect(readDate("31.02.2026")).toBeNull();
    expect(readDate("November 2026")).toBeNull();
  });
});

describe("read-backs for speech", () => {
  it("says figures digit by digit, bearings in words, and marks numbers", () => {
    expect(speakDigits("450012.345")).toBe("four five zero zero one two decimal three four five");
    expect(speakBearing(45, 30, 15)).toBe("forty five degrees, thirty minutes, fifteen seconds");
    expect(cardinalWords(345)).toBe("three hundred and forty five");
    expect(speakPointNumbers(["1", "12", "101", "A110"])).toBe("one, twelve, one zero one, A one one zero");
    expect(numberSpans("lot B1 is 25.4 m at 45°30'")).toEqual([
      [5, 6],
      [10, 14],
      [20, 25],
    ]);
  });
});

describe("bearings said without a word between the parts", () => {
  it("splits degrees, minutes and seconds by how the numbers are said", () => {
    expect(readBearing("forty five thirty fifteen")?.degrees).toBeCloseTo(45 + 30 / 60 + 15 / 3600, 12);
    expect(readBearing("three hundred fifteen forty five")?.degrees).toBeCloseTo(315.75, 12);
    expect(readBearing("ninety zero zero")?.degrees).toBe(90);
    expect(readBearing("four five, three zero, one five")?.degrees).toBeCloseTo(45.504166666666, 9);
  });
});
