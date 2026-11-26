/**
 * A source's picture (stage 278, ADR 0285): which addresses are kept, that only an address this server signed is fetched, and
 * that what comes back is sent as a picture and nothing else. SYNTHETIC values; nothing here reaches a network.
 */
import { describe, expect, it, vi } from "vitest";
import { PICTURE_SIG_PATTERN, PICTURE_URL_BYTES, pictureSrc, pictureUrl, storyDay } from "@/core/web/pictures";
import { createPictureGate, createPictureLimiter, pictureKey, servePicture, signPicture, signedPicture, verifyPicture, type PictureDeps } from "./picture";

vi.mock("server-only", () => ({}));

const KEY = pictureKey({ SUPABASE_SECRET_KEY: "a-made-up-secret-for-tests-only-0001" })!;
const IMAGE = "https://cdn.news.example/photos/launch.jpg?w=640";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("a picture's address", () => {
  it("is kept when it is https on a named host, and resolved against its page when relative", () => {
    expect(pictureUrl(IMAGE)).toBe(IMAGE);
    expect(pictureUrl("  https://cdn.news.example/a.png#top ")).toBe("https://cdn.news.example/a.png");
    expect(pictureUrl("/img/lead.webp", "https://news.example/story/1")).toBe("https://news.example/img/lead.webp");
    expect(pictureUrl("//cdn.news.example/a.jpg", "https://news.example/story")).toBe("https://cdn.news.example/a.jpg");
  });

  it("is refused when it isn't one Farbaek would fetch", () => {
    for (const bad of [
      null,
      undefined,
      42,
      "",
      "not an address",
      "http://cdn.news.example/a.jpg",
      "ftp://cdn.news.example/a.jpg",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      "https://user:pass@cdn.news.example/a.jpg",
      "https://cdn.news.example:8443/a.jpg",
      "https://localhost/a.jpg",
      "https://intranet/a.jpg",
      "https://127.0.0.1/a.jpg",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/a.jpg",
      `https://cdn.news.example/${"a".repeat(PICTURE_URL_BYTES)}.jpg`,
    ]) {
      expect(pictureUrl(bad), String(bad).slice(0, 40)).toBeNull();
    }
    // A relative address on a page that isn't https stays off too.
    expect(pictureUrl("/a.jpg", "http://news.example/story")).toBeNull();
  });

  it("is the same when read again, so a saved address is asked for as it was signed", () => {
    for (const raw of [IMAGE, "https://CDN.News.Example/A b.jpg", "https://news.example/ෆොටෝ.jpg"]) {
      const once = pictureUrl(raw)!;
      expect(pictureUrl(once)).toBe(once);
    }
  });
});

describe("a picture's signature", () => {
  it("is made only with a key, from a secret long enough to be one", () => {
    expect(pictureKey({})).toBeNull();
    expect(pictureKey({ SUPABASE_SECRET_KEY: "short" })).toBeNull();
    expect(pictureKey({ SUPABASE_SECRET_KEY: "   " })).toBeNull();
    expect(signedPicture(IMAGE, null)).toBeNull();
  });

  it("uses a key of its own when one is set, and the same key every time for the same secret", () => {
    const own = pictureKey({ PICTURE_SIGNING_KEY: "its-own-key-when-one-is-set-000001", SUPABASE_SECRET_KEY: "a-made-up-secret-for-tests-only-0001" })!;
    expect(own.equals(KEY)).toBe(false);
    expect(own.equals(pictureKey({ PICTURE_SIGNING_KEY: "its-own-key-when-one-is-set-000001" })!)).toBe(true);
    expect(pictureKey({ SUPABASE_SECRET_KEY: "a-made-up-secret-for-tests-only-0001" })!.equals(KEY)).toBe(true);
    // A key of its own that is too short is no key: the server's other secret is used in its place only when none is set.
    expect(pictureKey({ PICTURE_SIGNING_KEY: "short", SUPABASE_SECRET_KEY: "a-made-up-secret-for-tests-only-0001" })).toBeNull();
  });

  it("is 27 URL-safe characters, right for its own address and no other", () => {
    const sig = signPicture(IMAGE, KEY);
    expect(PICTURE_SIG_PATTERN.test(sig)).toBe(true);
    expect(verifyPicture(IMAGE, sig, KEY)).toBe(true);
    expect(verifyPicture(`${IMAGE}&x=1`, sig, KEY)).toBe(false);
    expect(verifyPicture("https://169.254.169.254/latest", sig, KEY)).toBe(false);
    expect(verifyPicture(IMAGE, sig, pictureKey({ SUPABASE_SECRET_KEY: "another-made-up-secret-for-tests-02" })!)).toBe(false);
    for (const bad of ["", "x", sig.slice(0, 26), `${sig}A`, `${sig.slice(0, 26)}+`, `${sig.slice(0, 26)}/`]) expect(verifyPicture(IMAGE, bad, KEY), bad).toBe(false);
  });

  it("is made with a derived key of 32 bytes, never with the secret's own bytes", () => {
    // What this can show: the key is not the secret. That a signature reveals nothing of the key rests on HMAC and HKDF, not on a test.
    expect(KEY).toHaveLength(32);
    expect(KEY.equals(Buffer.from("a-made-up-secret-for-tests-only-0001").subarray(0, 32))).toBe(false);
  });

  it("comes with the address a source keeps, and gives the screen one place to ask", () => {
    const kept = signedPicture("/lead.jpg", KEY, "https://news.example/story")!;
    expect(kept).toEqual({ image: "https://news.example/lead.jpg", imageSig: signPicture("https://news.example/lead.jpg", KEY) });
    expect(pictureSrc(kept)).toBe(`/app/chat/api/picture?u=${encodeURIComponent("https://news.example/lead.jpg")}&s=${kept.imageSig}`);
    expect(signedPicture("http://news.example/lead.jpg", KEY)).toBeNull();
    // No picture, or a signature that isn't one: the screen asks for nothing.
    expect(pictureSrc({})).toBeNull();
    expect(pictureSrc({ image: IMAGE })).toBeNull();
    expect(pictureSrc({ image: IMAGE, imageSig: "<script>" })).toBeNull();
  });
});

describe("asking Farbaek for a picture", () => {
  function setup(o: { picture?: { bytes: Uint8Array; contentType: string } | null | "throws"; allowed?: boolean; key?: Buffer | null; place?: boolean } = {}) {
    const fetched: string[] = [];
    const places = { taken: 0, given: 0 };
    const deps: PictureDeps = {
      key: o.key === undefined ? KEY : o.key,
      fetch: async (url) => {
        fetched.push(url);
        if (o.picture === "throws") throw new Error("down");
        return o.picture === undefined ? { bytes: JPEG, contentType: "image/jpeg" } : o.picture;
      },
      allow: () => o.allowed ?? true,
      enter: async () => {
        if (o.place === false) return null;
        places.taken += 1;
        return () => void (places.given += 1);
      },
    };
    return { deps, fetched, places };
  }
  const ask = (url: string, sig: string, headers: Record<string, string> = {}) => new Request(`https://www.farbaek.example/app/chat/api/picture?u=${encodeURIComponent(url)}&s=${sig}`, { headers });

  it("gives the picture for an address this server signed, as a picture and nothing else", async () => {
    const s = setup();
    const r = await servePicture(ask(IMAGE, signPicture(IMAGE, KEY)), s.deps);
    expect(r.status).toBe(200);
    expect(s.fetched).toEqual([IMAGE]);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(JPEG);
    expect(Object.fromEntries(r.headers)).toMatchObject({
      "content-type": "image/jpeg",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
      "cache-control": "private, max-age=604800, immutable",
    });
  });

  it("fetches nothing for an address without this server's signature of it", async () => {
    const sig = signPicture(IMAGE, KEY);
    for (const [url, s] of [
      [IMAGE, ""],
      [IMAGE, "A".repeat(27)],
      ["https://other.example/a.jpg", sig],
      ["https://169.254.169.254/latest/meta-data", sig],
      ["http://cdn.news.example/photos/launch.jpg?w=640", sig],
      // Signed as written, asked for in another spelling: refused, since only the saved spelling was signed.
      ["https://CDN.news.example/photos/launch.jpg?w=640", sig],
    ] as const) {
      const t = setup();
      const r = await servePicture(ask(url, s), t.deps);
      expect(r.status, url).toBe(404);
      expect(await r.text()).toBe("");
      expect(t.fetched).toEqual([]);
    }
    const none = setup();
    expect((await servePicture(new Request("https://www.farbaek.example/app/chat/api/picture"), none.deps)).status).toBe(404);
    expect(none.fetched).toEqual([]);
  });

  it("gives nothing when the server has no key, however the request is signed", async () => {
    const s = setup({ key: null });
    expect((await servePicture(ask(IMAGE, signPicture(IMAGE, KEY)), s.deps)).status).toBe(404);
    expect(s.fetched).toEqual([]);
  });

  it("turns a person away when they are over their count or there is no place, before anything is fetched", async () => {
    for (const o of [{ allowed: false }, { place: false }]) {
      const s = setup(o);
      const r = await servePicture(ask(IMAGE, signPicture(IMAGE, KEY)), s.deps);
      expect(r.status).toBe(429);
      expect(r.headers.get("retry-after")).toBe("60");
      expect(s.fetched).toEqual([]);
    }
  });

  it("gives its place back however it ends: a picture, none, or a fault", async () => {
    for (const picture of [undefined, null, "throws"] as const) {
      const s = setup({ picture });
      await servePicture(ask(IMAGE, signPicture(IMAGE, KEY)), s.deps);
      expect(s.places, String(picture)).toEqual({ taken: 1, given: 1 });
    }
    // Refused before a place is asked for: an unsigned request holds nothing.
    const unsigned = setup();
    await servePicture(ask(IMAGE, "A".repeat(27)), unsigned.deps);
    expect(unsigned.places).toEqual({ taken: 0, given: 0 });
  });

  it("sends no picture to someone who asked their browser to save data", async () => {
    const s = setup();
    const r = await servePicture(ask(IMAGE, signPicture(IMAGE, KEY), { "save-data": "on" }), s.deps);
    expect(r.status).toBe(404);
    expect(s.fetched).toEqual([]);
    // And says the answer depends on that, so a copy kept for one is never given to the other.
    const full = await servePicture(ask(IMAGE, signPicture(IMAGE, KEY)), setup().deps);
    expect(full.headers.get("vary")).toBe("save-data");
  });

  it("passes on only pictures: a page, a script or an SVG that came back is not sent", async () => {
    for (const contentType of ["text/html", "image/svg+xml", "image/gif", "application/javascript", "application/octet-stream", ""]) {
      const s = setup({ picture: { bytes: JPEG, contentType } });
      const r = await servePicture(ask(IMAGE, signPicture(IMAGE, KEY)), s.deps);
      expect(r.status, contentType).toBe(404);
      expect(await r.text()).toBe("");
    }
    // The kind is sent from the short list, without whatever followed it.
    const typed = await servePicture(ask(IMAGE, signPicture(IMAGE, KEY)), setup({ picture: { bytes: JPEG, contentType: "IMAGE/PNG; charset=utf-8" } }).deps);
    expect(typed.headers.get("content-type")).toBe("image/png");
  });

  it("answers 404 when the picture couldn't be had", async () => {
    for (const picture of [null, "throws", { bytes: new Uint8Array(), contentType: "image/jpeg" }] as const) {
      expect((await servePicture(ask(IMAGE, signPicture(IMAGE, KEY)), setup({ picture }).deps)).status).toBe(404);
    }
  });
});

describe("how many pictures one person may ask for", () => {
  it("is so many in a window, then none until the window has passed, each person counted alone", () => {
    let at = 1_000;
    const allow = createPictureLimiter(3, 60_000, 100, () => at);
    expect([allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false]);
    expect(allow("b")).toBe(true);
    at += 59_999;
    expect(allow("a")).toBe(false);
    at += 1;
    expect([allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false]);
  });

  it("is counted in room that never grows past its bound, whoever asks", () => {
    let at = 0;
    const allow = createPictureLimiter(2, 60_000, 50, () => at);
    let most = 0;
    for (let i = 0; i < 2_000; i++) {
      at += 1;
      expect(allow(`person-${i}`)).toBe(true);
      most = Math.max(most, allow.size());
    }
    expect(most).toBe(50);
    expect([allow("real"), allow("real"), allow("real")]).toEqual([true, true, false]);
  });
});

describe("how many pictures are on their way at once", () => {
  it("is a few for one person, the rest waiting their turn in the order they came", async () => {
    const gate = createPictureGate(2, 10);
    const a = (await gate.enter("ann"))!;
    const b = (await gate.enter("ann"))!;
    const order: string[] = [];
    const third = gate.enter("ann").then((leave) => (order.push("third"), leave));
    const fourth = gate.enter("ann").then((leave) => (order.push("fourth"), leave));
    await Promise.resolve();
    expect(gate.stats()).toEqual({ total: 2, people: 1, waiting: 2 });
    // Someone else isn't held up by Ann's queue.
    const other = (await gate.enter("ben"))!;
    expect(gate.stats()).toMatchObject({ total: 3, people: 2 });
    a();
    const c = (await third)!;
    expect(order).toEqual(["third"]);
    b();
    const d = (await fourth)!;
    expect(order).toEqual(["third", "fourth"]);
    // Giving a place back twice gives back one.
    a();
    expect(gate.stats()).toEqual({ total: 3, people: 2, waiting: 0 });
    c();
    d();
    other();
    expect(gate.stats()).toEqual({ total: 0, people: 0, waiting: 0 });
  });

  it("is so many in all, whoever they are for", async () => {
    const gate = createPictureGate(4, 2);
    const a = (await gate.enter("ann"))!;
    const b = (await gate.enter("ben"))!;
    let got = false;
    const waiting = gate.enter("cat").then((leave) => ((got = true), leave));
    await Promise.resolve();
    expect(got).toBe(false);
    a();
    const c = (await waiting)!;
    expect(got).toBe(true);
    b();
    c();
    expect(gate.stats().total).toBe(0);
  });

  it("turns a request away when too many are waiting already, and forgets one that went away while it waited", async () => {
    const gate = createPictureGate(1, 1, 1);
    const a = (await gate.enter("ann"))!;
    const gone = new AbortController();
    const waiting = gate.enter("ann", gone.signal);
    expect(await gate.enter("ann")).toBeNull();
    gone.abort();
    expect(await waiting).toBeNull();
    expect(gate.stats()).toEqual({ total: 1, people: 1, waiting: 0 });
    a();
    // The place is free again for the next one.
    const next = await gate.enter("ann");
    expect(next).not.toBeNull();
    next!();
    expect(gate.stats().total).toBe(0);
    // A request that has already gone away never waits.
    const held = (await gate.enter("ann"))!;
    const dead = new AbortController();
    dead.abort();
    expect(await gate.enter("ann", dead.signal)).toBeNull();
    held();
  });
});

describe("the day a story shows", () => {
  it("is short and in words, and empty when the date can't be read", () => {
    expect(storyDay("2026-11-25T08:30:00Z")).toBe("25 Nov 2026");
    expect(storyDay("2026-11-25")).toBe("25 Nov 2026");
    expect([storyDay(null), storyDay(undefined), storyDay(""), storyDay("soon")]).toEqual(["", "", "", ""]);
  });
});
