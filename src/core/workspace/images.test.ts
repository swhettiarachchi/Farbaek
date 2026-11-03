import { describe, expect, it } from "vitest";
import { checkImage, freeImagePath, imageKindOfPath, imageMime, imagePathFor, isImagePath, sniffImage } from "./images";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const GIF = new TextEncoder().encode("GIF89a....");
const WEBP = Uint8Array.from([...new TextEncoder().encode("RIFF"), 1, 2, 3, 4, ...new TextEncoder().encode("WEBPVP8 ")]);
const AVIF = Uint8Array.from([0, 0, 0, 0x1c, ...new TextEncoder().encode("ftypavif")]);
const ICO = Uint8Array.from([0, 0, 1, 0, 1, 0]);

describe("images in projects (ADR 0108)", () => {
  it("knows image paths by extension, like the database, and leaves SVG as text", () => {
    expect(["a.png", "b/c.JPG", "d.jpeg", "e.gif", "f.webp", "g.avif", "favicon.ico"].every(isImagePath)).toBe(true);
    expect(["logo.svg", "index.html", "png", "a.png.txt", "style.css"].some(isImagePath)).toBe(false);
    expect(imageKindOfPath("x.jpg")).toBe("jpeg");
    expect([imageMime("a.webp"), imageMime("a.ico"), imageMime("a.svg")]).toEqual(["image/webp", "image/x-icon", null]);
  });

  it("tells image kinds from their bytes", () => {
    expect([PNG, JPEG, GIF, WEBP, AVIF, ICO].map((b) => sniffImage(b))).toEqual(["png", "jpeg", "gif", "webp", "avif", "ico"]);
    expect(sniffImage(new TextEncoder().encode("<svg xmlns=...>"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });

  it("accepts real images at matching paths and says why anything else is refused", () => {
    expect(checkImage("assets/dot.png", PNG)).toEqual({ ok: true, kind: "png", mime: "image/png" });
    expect(checkImage("photo.jpg", JPEG)).toMatchObject({ ok: true, kind: "jpeg" });
    expect(checkImage("dot.jpg", PNG)).toMatchObject({ ok: false, reason: "wrong_type", detail: "That file is a PNG image, but its name ends in .jpg. Rename it to match." });
    expect(checkImage("notes.txt", PNG)).toMatchObject({ ok: false, reason: "not_image_path" });
    expect(checkImage("a.png", new Uint8Array())).toMatchObject({ ok: false, reason: "empty" });
    expect(checkImage("a.png", new TextEncoder().encode("hello"))).toMatchObject({ ok: false, reason: "not_an_image" });
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG.subarray(0, 8));
    expect(checkImage("a.png", big)).toMatchObject({ ok: false, reason: "too_large" });
  });
});

describe("names for uploaded images (ADR 0160)", () => {
  it("turns a file name into a path a site can link to", () => {
    expect(imagePathFor("My Photo (1).JPG")).toBe("assets/my-photo-1.jpg");
    expect(imagePathFor("Café crème.webp")).toBe("assets/cafe-creme.webp");
    expect(imagePathFor("!!!.png")).toBe("assets/image.png");
  });

  it("numbers a name that is taken, so an upload never replaces a file", () => {
    const taken = new Set(["assets/shop.jpg", "assets/shop-2.jpg"]);
    expect(freeImagePath("shop.jpg", taken)).toBe("assets/shop-3.jpg");
    expect(freeImagePath("new.jpg", taken)).toBe("assets/new.jpg");
  });
});
