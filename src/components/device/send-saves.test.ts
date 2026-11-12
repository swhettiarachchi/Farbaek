import { describe, expect, it } from "vitest";
import type { QueuedSave } from "@/core/workspace/device-copy";
import { sendOne, sendSaves, type PostSave } from "./send-saves";

const PROJECT = "8b3e4d1a-3c4d-4e6f-8a1b-2c3d4e5f6071";
const ORG = "9c4f5e2b-4d5e-4f70-9b2c-3d4e5f607182";
const OWNER = "6f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const save = (path: string, content = "mine", baseRevision = 3): QueuedSave => ({ orgId: ORG, projectId: PROJECT, path, content, baseRevision, savedAt: "2026-11-12T08:00:00.000Z" });
const answer = (status: number, body: unknown): PostSave => async () => ({ status, body });

describe("sending one save", () => {
  it("is saved as the server's new revision, expecting the revision the edit started from", async () => {
    const sent: unknown[] = [];
    const post: PostSave = async (projectId, body) => (sent.push({ projectId, ...body }), { status: 200, body: { revision: 4 } });
    expect(await sendOne(post, OWNER, save("a.js"))).toMatchObject({ kind: "saved", revision: 4 });
    expect(sent).toEqual([{ projectId: PROJECT, owner: OWNER, orgId: ORG, path: "a.js", content: "mine", expectedRevision: 3 }]);
  });

  it("settles by itself when the server already has the same words, and asks when it doesn't", async () => {
    expect(await sendOne(answer(409, { code: "FILE_CHANGED", server: { revision: 6, content: "mine" } }), OWNER, save("a.js"))).toMatchObject({ kind: "same", revision: 6 });
    expect(await sendOne(answer(409, { code: "FILE_CHANGED", server: { revision: 6, content: "theirs" } }), OWNER, save("a.js"))).toMatchObject({ kind: "conflict", server: { revision: 6, content: "theirs" } });
    expect(await sendOne(answer(409, { code: "FILE_CHANGED", server: { revision: 0, content: null } }), OWNER, save("a.js"))).toMatchObject({ kind: "conflict", server: { revision: 0 } });
  });

  it("keeps the save and passes on Farbaek's words when it's refused", async () => {
    expect(await sendOne(answer(422, { code: "SECRET_IN_CONTENT", message: "Remove the key." }), OWNER, save("a.js"))).toEqual({ kind: "refused", save: save("a.js"), message: "Remove the key." });
    expect(await sendOne(answer(409, { code: "PROJECT_ARCHIVED", message: "Archived." }), OWNER, save("a.js"))).toMatchObject({ kind: "refused", message: "Archived." });
    expect(await sendOne(answer(200, { revision: "x" }), OWNER, save("a.js"))).toMatchObject({ kind: "refused" });
    expect(await sendOne(answer(409, { code: "FILE_CHANGED", server: { revision: -1, content: 3 } }), OWNER, save("a.js"))).toMatchObject({ kind: "refused" });
  });

  it("stops when another account is signed in than the one that saved the changes here", async () => {
    expect(await sendOne(answer(409, { code: "OTHER_ACCOUNT", message: "Another account." }), OWNER, save("a.js"))).toEqual({ kind: "other_account", message: "Another account." });
    const seen: string[] = [];
    expect(await sendSaves(answer(409, { code: "OTHER_ACCOUNT", message: "Another account." }), OWNER, [save("a.js"), save("b.js")], (r) => void seen.push(r.kind))).toMatchObject({ kind: "other_account" });
    expect(seen).toEqual([]);
  });

  it("can expect the server's revision, when the person keeps theirs", async () => {
    const sent: number[] = [];
    await sendOne(async (_p, body) => (sent.push(body.expectedRevision), { status: 200, body: { revision: 7 } }), OWNER, save("a.js"), 6);
    expect(sent).toEqual([6]);
  });
});

describe("sending every waiting save", () => {
  it("stops when offline or signed out, and doesn't let one refusal hold back the rest", async () => {
    const seen: string[] = [];
    const onResult = (r: { kind: string; save: QueuedSave }) => void seen.push(`${r.kind}:${r.save.path}`);

    const mixed: PostSave = async (_p, body) => (body.path === "bad.js" ? { status: 422, body: { message: "No." } } : { status: 200, body: { revision: 2 } });
    expect(await sendSaves(mixed, OWNER, [save("bad.js"), save("good.js")], onResult)).toBeNull();
    expect(seen).toEqual(["refused:bad.js", "saved:good.js"]);

    seen.length = 0;
    const offline: PostSave = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await sendSaves(offline, OWNER, [save("a.js"), save("b.js")], onResult)).toEqual({ kind: "offline" });
    expect(seen).toEqual([]);

    expect(await sendSaves(answer(401, { code: "SIGNED_OUT", message: "Sign in." }), OWNER, [save("a.js")], onResult)).toEqual({ kind: "signed_out", message: "Sign in." });
  });
});
