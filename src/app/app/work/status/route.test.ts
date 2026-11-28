import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, BoardItem } from "@/core/command/board";

const mocks = vi.hoisted(() => ({ loadAppContext: vi.fn(), loadWork: vi.fn(), pauseReasons: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/workspace/context", () => ({ loadAppContext: mocks.loadAppContext }));
// The real reads and the real reasons have their own test (server/command/load-work.test.ts). Here they are stand-ins, so
// this test is only about what the route does with them.
vi.mock("@/server/command/load-work", () => ({ loadWork: mocks.loadWork, pauseReasons: mocks.pauseReasons }));

import { GET } from "./route";

const item = (id: string): BoardItem => ({ id, kind: "change", title: `Change ${id}`, line: "Storefront. Waiting for your yes or no.", status: "approval", label: "Waiting for you", href: `/app/tasks/${id}`, action: "Review", at: "2026-11-27T08:00:00Z", when: "past" });
const board = (more: Partial<Board> = {}): Board => ({ needsYou: [], working: [], scheduled: [], finished: [], others: 0, ...more });
const work = (more: Record<string, unknown> = {}) => ({ board: board(), unread: { builds: false, workflows: false, tasks: false, runs: false, any: false }, liveNow: false, canAct: true, manager: false, contributor: true, tour: false, live: true, ...more });
const ctx = (current: unknown) => ({ mode: "live", user: { id: "u1", email: "ada@example.com" }, current });

describe("GET /app/work/status (stage 290, ADR 0298)", () => {
  beforeEach(() => {
    mocks.loadAppContext.mockReset();
    mocks.loadWork.mockReset();
    mocks.pauseReasons.mockReset();
    mocks.pauseReasons.mockReturnValue({ pauseReason: null, resumeReason: "stand-in: why not resume" });
  });

  it("lets the sign-in redirect through for someone signed out, and reads nothing for them", async () => {
    // The context redirects by throwing. Answered as "couldn't be read", the person would never be sent to sign in.
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" });
    mocks.loadAppContext.mockRejectedValue(redirect);
    await expect(GET()).rejects.toBe(redirect);
    expect(mocks.loadWork).not.toHaveBeenCalled();
  });

  it("says so when the server has no accounts set up, and reads nothing", async () => {
    mocks.loadAppContext.mockResolvedValue(null);
    const r = await GET();
    expect(r.status).toBe(503);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(mocks.loadWork).not.toHaveBeenCalled();
  });

  it("says there is no workspace rather than an empty list", async () => {
    mocks.loadAppContext.mockResolvedValue(ctx(null));
    const r = await GET();
    expect(r.status).toBe(404);
    expect(mocks.loadWork).not.toHaveBeenCalled();
  });

  it("answers with the board said short, and the pause with why this person can or can't press it", async () => {
    const paused = { at: "2026-11-27T07:00:00Z", reason: "The agent changed the wrong files." };
    mocks.loadAppContext.mockResolvedValue(ctx({ id: "org1", agentsPaused: paused }));
    const loaded = work({ board: board({ needsYou: [item("a")], working: [item("w")], others: 2 }) });
    mocks.loadWork.mockResolvedValue(loaded);
    const r = await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const { data } = (await r.json()) as { data: Record<string, unknown> };
    expect(data).toEqual({
      sentence: "One thing needs you. One thing is in progress, and nothing is scheduled.",
      incomplete: false,
      sample: false,
      // A row carries its name, where it stands and where it opens: nothing else of the board's item.
      needsYou: [{ id: "a", title: "Change a", line: "Storefront. Waiting for your yes or no.", href: "/app/tasks/a" }],
      working: [{ id: "w", title: "Change w", line: "Storefront. Waiting for your yes or no.", href: "/app/tasks/w" }],
      moreNeeds: 0,
      moreWorking: 0,
      others: "2 more changes are waiting for someone else's yes or no. You can read them in Approvals.",
      pause: { paused, pauseReason: null, resumeReason: "stand-in: why not resume" },
    });
    // The reasons are worked out from the same read as the board, not from anything the request said.
    expect(mocks.pauseReasons).toHaveBeenCalledWith(loaded);
    // It is asked about the workspace the person is in, and takes nothing from the request.
    expect(mocks.loadWork).toHaveBeenCalledTimes(1);
    expect(mocks.loadWork.mock.calls[0]![0]).toMatchObject({ current: { id: "org1" } });
  });

  it("says a list it couldn't read whole is incomplete, and the demo's work is a sample", async () => {
    mocks.loadAppContext.mockResolvedValue(ctx({ id: "org1", agentsPaused: null }));
    mocks.loadWork.mockResolvedValue(work({ unread: { builds: true, workflows: false, tasks: false, runs: false, any: true }, tour: true, contributor: false }));
    mocks.pauseReasons.mockReturnValue({ pauseReason: "stand-in: why not pause", resumeReason: "stand-in: why not resume" });
    const { data } = (await (await GET()).json()) as { data: { sentence: string; incomplete: boolean; sample: boolean; pause: unknown } };
    expect(data.sentence).toBe("Some of your work couldn't be read just now, so this is incomplete.");
    expect(data).toMatchObject({ incomplete: true, sample: true, pause: { paused: null, pauseReason: "stand-in: why not pause", resumeReason: "stand-in: why not resume" } });
  });

  it("says it couldn't be read when the read fails, without saying why", async () => {
    mocks.loadAppContext.mockResolvedValue(ctx({ id: "org1", agentsPaused: null }));
    mocks.loadWork.mockRejectedValue(new Error("connection to 10.0.0.5:5432 refused"));
    const r = await GET();
    expect(r.status).toBe(503);
    const text = await r.text();
    expect(text).toContain("couldn't be read");
    expect(text).not.toContain("10.0.0.5");
  });
});
