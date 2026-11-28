/**
 * The deed or an old plan read into the title at the start (stage 294), run as the server runs it with Claude and the database standing
 * in: nothing is sent without the say-so, everything read is saved waiting for the surveyor, and nothing is saved when nothing was read.
 * SYNTHETIC values only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDocument, type SurveyDocument } from "@/core/survey/document";

const { saves, reads, reader } = vi.hoisted(() => ({
  saves: [] as Record<string, unknown>[],
  reads: { count: 0 },
  reader: { result: null as unknown },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("@/server/workspace/context", () => ({
  loadAppContext: async () => ({ mode: "live", current: { id: "org-1" }, user: { id: "user-1" }, role: "owner", writes: { enabled: true, reason: "" } }),
}));
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/server/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/server/workspace/supabase-writer", () => ({ createSupabaseWriteDeps: () => ({}) }));
// The workspace's own key: no daily limit is asked for.
vi.mock("@/server/ai/workspace-ai", () => ({ aiForWorkspace: async () => ({ own: true, client: {}, deps: {} }) }));
vi.mock("@/server/survey/read", () => ({
  loadSurveyProject: async () => ({
    project: { id: "11111111-1111-4111-8111-111111111111", crsId: "LOCAL", crsConfirmedAt: "2026-11-28T10:00:00.000Z" },
    points: [],
    sources: [],
    drawing: { readable: true, document: emptyDocument(), version: 2 },
    versions: [],
    approvals: [],
    exports: [],
    profiles: [],
  }),
}));
vi.mock("@/server/survey/drafting", async () => {
  const actual = await vi.importActual<typeof import("@/server/survey/drafting")>("@/server/survey/drafting");
  return {
    ...actual,
    readSurveyPhotos: async () => {
      reads.count++;
      return reader.result;
    },
  };
});
vi.mock("./actions", () => ({
  saveSurveyDrawingAction: async (input: Record<string, unknown>) => {
    saves.push(input);
    return { status: "done", message: "Saved.", version: 3 };
  },
}));

const { readTitleIntoPlanAction } = await import("./ai-actions");

const PROJECT = "11111111-1111-4111-8111-111111111111";
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70])], "deed.jpg", { type: "image/jpeg" });
const form = (over: Record<string, string> = {}, files: File[] = [jpeg()]) => {
  const f = new FormData();
  f.set("projectId", PROJECT);
  f.set("baseVersion", "2");
  f.set("consent", "yes");
  for (const [k, v] of Object.entries(over)) f.set(k, v);
  for (const file of files) f.append("photo", file);
  return f;
};
const readInto = (fields: Partial<SurveyDocument["sheet"]>) => {
  const document = { ...emptyDocument(), sheet: { ...emptyDocument().sheet, ...fields } };
  const keys = Object.keys(fields).map((k) => `sheet.${k}`);
  for (const k of keys) document.provenance[k] = { source: "ai_photo", reviewed: false };
  return { ok: true, value: { document, accepted: keys.map((key) => ({ key, label: key, value: "" })), dropped: [], questions: [] } };
};

beforeEach(() => {
  saves.length = 0;
  reads.count = 0;
  reader.result = readInto({ landName: "Sample Watta", village: "Sample Village" });
});

describe("reading the deed or an old plan into the title at the start", () => {
  it("saves every fact read, each waiting for the surveyor, on the version it was asked about", async () => {
    const r = await readTitleIntoPlanAction(form());
    expect(r).toEqual({ status: "done", message: "2 facts read into the title from the deed or old plan, each waiting for you to confirm it.", version: 3, filled: 2 });
    expect(saves).toHaveLength(1);
    expect(saves[0]!.baseVersion).toBe(2);
    expect(saves[0]!.note).toBe("Title read from a photo of the deed or an old plan: 2 facts");
    const doc = saves[0]!.document as SurveyDocument;
    expect([doc.sheet.landName, doc.sheet.village]).toEqual(["Sample Watta", "Sample Village"]);
    expect(doc.provenance["sheet.landName"]).toEqual({ source: "ai_photo", reviewed: false });
    expect(doc.provenance["sheet.village"]).toEqual({ source: "ai_photo", reviewed: false });
  });

  it("sends nothing without the say-so, and refuses what isn't a photo", async () => {
    expect(await readTitleIntoPlanAction(form({ consent: "" }))).toMatchObject({ status: "error" });
    expect(await readTitleIntoPlanAction(form({}, [new File(["%PDF-1.7"], "deed.pdf", { type: "application/pdf" })]))).toMatchObject({ status: "error" });
    expect(await readTitleIntoPlanAction(form({}, []))).toMatchObject({ status: "error" });
    expect(await readTitleIntoPlanAction(form({}, [jpeg(), jpeg(), jpeg(), jpeg()]))).toMatchObject({ status: "error" });
    expect(reads.count).toBe(0);
    expect(saves).toEqual([]);
  });

  it("saves nothing when nothing could be read, or the reader failed, and says so", async () => {
    reader.result = { ok: true, value: { document: emptyDocument(), accepted: [], dropped: [], questions: [] } };
    expect(await readTitleIntoPlanAction(form())).toMatchObject({ status: "done", filled: 0, version: 2 });
    reader.result = { ok: false, message: "Claude couldn't read the photo." };
    expect(await readTitleIntoPlanAction(form())).toEqual({ status: "error", message: "Claude couldn't read the photo." });
    expect(saves).toEqual([]);
  });

  it("refuses a version that isn't the latest before anything is read", async () => {
    expect(await readTitleIntoPlanAction(form({ baseVersion: "1" }))).toMatchObject({ status: "error" });
    expect(reads.count).toBe(0);
  });
});
