import { describe, expect, it } from "vitest";
import { chapterFills, chapterTarget, formatFor, keyAction, pickLead, playFailure, playerNotice, shouldPlay, type AutoplayInput, type LeadCandidate } from "./player-logic";

const base: AutoplayInput = { inView: true, hidden: false, reducedMotion: false, saveData: false, userPaused: false, userPlayed: false };
const chapters = [{ start: 0 }, { start: 8_000 }, { start: 17_000 }];

describe("formatFor", () => {
  it("loads the landscape film on wide screens and the portrait one on phones", () => {
    expect(formatFor(["landscape", "portrait"], true)).toBe("landscape");
    expect(formatFor(["landscape", "portrait"], false)).toBe("portrait");
  });

  it("falls back to whatever exists, and clips stay clips", () => {
    expect(formatFor(["landscape"], false)).toBe("landscape");
    expect(formatFor(["clip"], true)).toBe("clip");
  });
});

describe("shouldPlay", () => {
  it("plays when on screen in a visible tab", () => {
    expect(shouldPlay(base)).toBe(true);
  });

  it("never plays off screen or in a background tab, even after the person pressed play", () => {
    expect(shouldPlay({ ...base, inView: false, userPlayed: true })).toBe(false);
    expect(shouldPlay({ ...base, hidden: true, userPlayed: true })).toBe(false);
  });

  it("doesn't start on its own under reduced motion or Save-Data", () => {
    expect(shouldPlay({ ...base, reducedMotion: true })).toBe(false);
    expect(shouldPlay({ ...base, saveData: true })).toBe(false);
  });

  it("plays under reduced motion once the person presses play", () => {
    expect(shouldPlay({ ...base, reducedMotion: true, userPlayed: true })).toBe(true);
  });

  it("keeps a person's pause", () => {
    expect(shouldPlay({ ...base, userPaused: true })).toBe(false);
  });
});

describe("chapterFills", () => {
  it("fills earlier chapters, part fills the current one and leaves later ones empty", () => {
    expect(chapterFills(chapters, 30_000, 12_500)).toEqual([1, 0.5, 0]);
  });

  it("is empty at the start and full at the end", () => {
    expect(chapterFills(chapters, 30_000, 0)).toEqual([0, 0, 0]);
    expect(chapterFills(chapters, 30_000, 30_000)).toEqual([1, 1, 1]);
  });
});

describe("chapterTarget", () => {
  it("steps to the next chapter and stops at the last", () => {
    expect(chapterTarget(chapters, 9_000, 1)).toBe(17_000);
    expect(chapterTarget(chapters, 20_000, 1)).toBe(17_000);
  });

  it("goes back to this chapter's start, or the one before when just past it", () => {
    expect(chapterTarget(chapters, 12_000, -1)).toBe(8_000);
    expect(chapterTarget(chapters, 9_000, -1)).toBe(0);
    expect(chapterTarget(chapters, 500, -1)).toBe(0);
  });
});

describe("keyAction", () => {
  it("maps the player's keys", () => {
    expect(keyAction(" ")).toEqual({ kind: "toggle" });
    expect(keyAction("K")).toEqual({ kind: "toggle" });
    expect(keyAction("ArrowLeft")).toEqual({ kind: "seek", byMs: -5_000 });
    expect(keyAction("l")).toEqual({ kind: "chapter", step: 1 });
    expect(keyAction("c")).toEqual({ kind: "captions" });
    expect(keyAction("f")).toEqual({ kind: "fullscreen" });
    expect(keyAction("x")).toBeNull();
  });
});

describe("pickLead", () => {
  const c = (id: string, over: Partial<LeadCandidate> = {}): LeadCandidate => ({ id, eligible: true, visiblePx: 300, userAt: null, order: 0, ...over });

  it("plays the video taking up most of the screen, and only one", () => {
    expect(pickLead([c("film", { visiblePx: 420, order: 0 }), c("clip", { visiblePx: 250, order: 1 })])).toBe("film");
    expect(pickLead([c("film", { visiblePx: 120, order: 0 }), c("clip", { visiblePx: 250, order: 1 })])).toBe("clip");
  });

  it("prefers the one the person started, most recent first", () => {
    expect(pickLead([c("film", { visiblePx: 600 }), c("clip", { visiblePx: 100, userAt: 5 })])).toBe("clip");
    expect(pickLead([c("film", { userAt: 9 }), c("clip", { userAt: 5 })])).toBe("film");
  });

  it("skips videos that can't play now, breaks ties by page order and can choose none", () => {
    expect(pickLead([c("film", { eligible: false, userAt: 9, visiblePx: 800 }), c("clip")])).toBe("clip");
    expect(pickLead([c("b", { order: 2 }), c("a", { order: 1 })])).toBe("a");
    expect(pickLead([c("film", { eligible: false })])).toBeNull();
    expect(pickLead([])).toBeNull();
  });
});

describe("playFailure", () => {
  it("tells a refused autoplay from an interruption and a real failure", () => {
    expect(playFailure(new DOMException("no", "NotAllowedError"))).toBe("blocked");
    expect(playFailure(new DOMException("paused", "AbortError"))).toBe("interrupted");
    expect(playFailure(new DOMException("codec", "NotSupportedError"))).toBe("failed");
    expect(playFailure("odd")).toBe("failed");
  });
});

describe("playerNotice", () => {
  const s = { want: true, playing: false, blocked: false, slow: false, error: false };
  it("says loading, then slow, until frames arrive, and stays quiet at rest", () => {
    expect(playerNotice(s)).toBe("loading");
    expect(playerNotice({ ...s, slow: true })).toBe("slow");
    expect(playerNotice({ ...s, playing: true, slow: true })).toBe("none");
    expect(playerNotice({ ...s, want: false })).toBe("none");
  });

  it("leaves a refused autoplay to the play button, and always shows a failure", () => {
    expect(playerNotice({ ...s, blocked: true })).toBe("none");
    expect(playerNotice({ ...s, want: false, error: true })).toBe("error");
  });
});
