/**
 * One list of places, drawn by one component (stage 287, ADR 0295). Before it, five pieces of navigation each kept a
 * list of their own, and they had drifted apart: the studios' switcher had no Build, Chat's sidebar no Projects or
 * Approvals, the workspace's header a third version. A frame that needs the places now draws `PlacesNav` or `PlacesRail`
 * from the app's navigation; it never writes the list out again.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
  });
}

const sources = files(path.join(process.cwd(), "src")).map((full) => ({ rel: path.relative(process.cwd(), full).split(path.sep).join("/"), text: readFileSync(full, "utf8") }));
const read = (rel: string) => sources.find((f) => f.rel === rel)?.text ?? "";

/** Naming both studios' own addresses is the mark of a list of places. Each file here names them for another reason. */
const MAY_NAME_BOTH: Record<string, string> = {
  "src/components/app/app-nav.tsx": "the one list",
  "src/components/app/app-frame.tsx": "which pages bring their own frame",
  "src/components/site/spaces.ts": "the public site's pages for each space",
  "src/core/chat/handoff.ts": "where an answer's request is handed on",
};

describe("one list of places (stage 287, ADR 0295)", () => {
  it("is written out once: no other file keeps a list of the places", () => {
    const naming = sources.filter((f) => f.text.includes('"/app/images"') && f.text.includes('"/app/video"')).map((f) => f.rel);
    expect(naming.filter((rel) => !(rel in MAY_NAME_BOTH)).sort()).toEqual([]);
    // The list of exceptions doesn't outlive its files.
    for (const rel of Object.keys(MAY_NAME_BOTH)) expect(naming, rel).toContain(rel);
  });

  it("is what every frame draws: the app's sidebar, Chat's, the studios' and Build's workspace", () => {
    const nav = read("src/components/app/app-nav.tsx");
    expect(nav).toContain("export const PLACES");
    // The app's own sidebar draws the list with the same component the other frames use.
    expect(nav.slice(nav.indexOf("export function SidebarNav"))).toMatch(/<PlacesNav\b/);
    // Chat draws it twice: as rows in its sidebar and drawer, and as the rail when the sidebar is folded.
    const chat = read("src/components/chat/sidebar.tsx");
    expect(chat.split("<PlacesNav ").length - 1).toBe(2);
    expect(chat).toContain('<PlacesNav form="rail"');
    expect(chat).toMatch(/<PlacesNav more rows=\{5\}/);
    expect(read("src/components/studio/studio.tsx")).toContain("<PlacesRail />");
    expect(read("src/components/studio/studio.tsx")).toContain("<PlacesNav ");
    expect(read("src/components/workbench/stage.tsx")).toContain("<PlacesRail />");
  });

  it("left no switcher of its own in the studios' or the workspace's header", () => {
    for (const rel of ["src/components/studio/studio.tsx", "src/components/workbench/stage.tsx"]) {
      expect(read(rel), rel).not.toContain('aria-label="Farbaek AI"');
      expect(read(rel), rel).not.toMatch(/const SPACES\b/);
    }
    expect(read("src/components/chat/sidebar.tsx")).not.toMatch(/const SPACE_LINKS\b/);
  });
});
