import { describe, expect, it } from "vitest";
import { studioEditorKey } from "./editor-key";

const files = [
  { path: "index.html", revision: 3, encoding: "utf8" },
  { path: "styles.css", revision: 2, encoding: "utf8" },
  { path: "images/old.jpg", revision: 1, encoding: "base64" },
];

describe("Studio's editor key", () => {
  it("doesn't change when a photo is uploaded mid-edit, so the draft and the new picture survive", () => {
    const uploaded = [...files, { path: "images/bread.jpg", revision: 1, encoding: "base64" }];
    expect(studioEditorKey(uploaded)).toBe(studioEditorKey(files));
    const replaced = files.map((f) => (f.path === "images/old.jpg" ? { ...f, revision: 2 } : f));
    expect(studioEditorKey(replaced)).toBe(studioEditorKey(files));
  });

  it("changes when a file the editor edits gets a new revision, as a save does", () => {
    const saved = files.map((f) => (f.path === "index.html" ? { ...f, revision: 4 } : f));
    expect(studioEditorKey(saved)).not.toBe(studioEditorKey(files));
    expect(studioEditorKey([...files, { path: "about.html", revision: 1, encoding: "utf8" }])).not.toBe(studioEditorKey(files));
  });
});
