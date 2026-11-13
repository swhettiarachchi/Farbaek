import { describe, expect, it } from "vitest";
import { arrivalWords, canOpen, canPreview, displayName, extensionOf, offerWords, placeLabel, summarise } from "./nearby-words";

const KNOWN = [
  { label: "Downloads", path: "C:\\Users\\Ada\\Downloads" },
  { label: "Documents", path: "C:\\Users\\Ada\\Documents" },
  { label: "Ada", path: "C:\\Users\\Ada" },
  { label: "OneDrive", path: "C:\\Users\\Ada\\OneDrive" },
];

describe("Nearby's words for what arrived (stage 188)", () => {
  it("says where a folder is the way the file manager names it, most specific folder first", () => {
    expect(placeLabel("C:\\Users\\Ada\\Downloads\\From Redmi A5 13 Nov 18.43", KNOWN, "win32")).toBe("Downloads › From Redmi A5 13 Nov 18.43");
    expect(placeLabel("c:\\users\\ada\\downloads\\Site photos (2)", KNOWN, "win32")).toBe("Downloads › Site photos (2)");
    expect(placeLabel("C:/Users/Ada/From Redmi A5 13 Nov 18.43", KNOWN, "win32")).toBe("Ada › From Redmi A5 13 Nov 18.43");
    expect(placeLabel("C:\\Users\\Ada\\OneDrive\\Work\\Brand kit", KNOWN, "win32")).toBe("OneDrive › Work › Brand kit");
    // Outside every known folder: the full path, as it is.
    expect(placeLabel("D:\\Projects\\Brand kit", KNOWN, "win32")).toBe("D:\\Projects\\Brand kit");
    // Elsewhere, letter case counts.
    expect(placeLabel("/home/ada/downloads/x", [{ label: "Downloads", path: "/home/ada/Downloads" }], "linux")).toBe("/home/ada/downloads/x");
    expect(placeLabel("/home/ada/Downloads/x", [{ label: "Downloads", path: "/home/ada/Downloads" }], "linux")).toBe("Downloads › x");
  });

  it("removes characters that can disguise a name, such as a right-to-left override", () => {
    expect(displayName("invoice\u202Efdp.exe")).toBe("invoicefdp.exe");
    expect(displayName("a\u200Bb\u0007c")).toBe("abc");
    expect(displayName("\u202E\u200B")).toBe("Unnamed");
    expect(extensionOf("invoice\u202Efdp.exe")).toBe("exe");
  });

  it("opens only kinds that open in a viewer, never a program, a shortcut or a page with scripts", () => {
    for (const name of ["IMG_0001.JPG", "clip.mp4", "song.m4a", "report.pdf", "notes.txt", "photo.heic"]) expect(canOpen(name)).toBe(true);
    for (const name of ["setup.exe", "run.bat", "link.lnk", "page.html", "drawing.svg", "script.js", "tool.ps1", "site.url", "README", "invoice\u202Efdp.exe"]) {
      expect(canOpen(name)).toBe(false);
    }
    expect(canPreview("a.png", 1_000)).toBe(true);
    expect(canPreview("a.png", 60 * 1024 * 1024)).toBe(false);
    expect(canPreview("a.pdf", 1_000)).toBe(false);
  });

  it("says what arrived as a person would", () => {
    expect(summarise([{ path: "a.jpg" }])).toBe("1 photo");
    expect(summarise([{ path: "a.jpg" }, { path: "b.png" }, { path: "c.heic" }])).toBe("3 photos");
    expect(summarise([{ path: "a.jpg" }, { path: "b.mp4" }])).toBe("1 photo and 1 video");
    expect(summarise([{ path: "a.jpg" }, { path: "b.mp4" }, { path: "c.pdf" }, { path: "d.zip" }])).toBe("1 photo, 1 video and 2 files");
    expect(summarise([{ path: "a.pdf" }, { path: "b.zip" }])).toBe("2 files");
    // When only some names are known, just the count.
    expect(summarise([{ path: "a.jpg" }], 12)).toBe("12 files");
  });

  it("writes notifications that say where it is in the words alone", () => {
    expect(offerWords("Redmi A5", 1, 133_035)).toEqual({ title: "Redmi A5 wants to send you 1 file (130 KB)", body: "Open Farbaek Agent to accept or decline it in Nearby." });
    expect(arrivalWords("Redmi A5", [{ path: "Screenshot.png" }], 1, "Downloads › From Redmi A5 13 Nov 18.43")).toEqual({
      title: "Photo from Redmi A5 arrived",
      body: "Saved in Downloads › From Redmi A5 13 Nov 18.43. Every file was checked.",
    });
    expect(arrivalWords("Studio laptop", [{ path: "a.jpg" }, { path: "b.jpg" }], 2, "Downloads › Site photos").title).toBe("2 photos from Studio laptop arrived");
    expect(arrivalWords("Studio laptop", [{ path: "deck.pdf" }], 1, "Downloads › Deck").title).toBe("File from Studio laptop arrived");
    expect(arrivalWords("Evil\u202Ename", [{ path: "a.jpg" }], 1, "Downloads › x").title).toBe("Photo from Evilname arrived");
  });

  it("uses no em dashes in anything it says", () => {
    const all = [offerWords("A", 2, 10).title, offerWords("A", 2, 10).body, arrivalWords("A", [{ path: "a.jpg" }], 1, "Downloads").body];
    for (const s of all) expect(s).not.toContain("\u2014");
  });
});
