import { afterEach, describe, expect, it, vi } from "vitest";
import { PHOTO_SIDE, decodePhoto, shrink } from "./photo";

/**
 * A browser stood in for: Chrome 109 (the last on Windows 7) refuses `imageOrientation: "from-image"` with a TypeError, and a
 * newer one takes it. Synthetic: no real photo is decoded.
 */
function browser({ fromImage, element, plain }: { fromImage: boolean; element: boolean; plain: boolean }) {
  const drawn: { width: number; height: number; fill: string | null }[] = [];
  const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn() });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (_file: Blob, options?: { imageOrientation?: string }) => {
      if (options?.imageOrientation === "from-image" && !fromImage) throw new TypeError("The provided value 'from-image' is not a valid enum value of type ImageOrientation.");
      if (!options && !plain) throw new Error("no");
      return bitmap(3000, 2000);
    }),
  );
  vi.stubGlobal(
    "Image",
    class {
      decoding = "";
      src = "";
      naturalWidth = 2000;
      naturalHeight = 3000;
      async decode() {
        if (!element) throw new Error("EncodingError");
      }
    },
  );
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:photo"), revokeObjectURL: vi.fn() });
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => {
          const c = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn((_img: unknown, _x: number, _y: number, width: number, height: number) => drawn.push({ width, height, fill: c.fillStyle || null })) };
          return c;
        },
        toBlob: (done: (b: Blob | null) => void, type: string) => done(new Blob(["x"], { type })),
      };
      return canvas;
    },
  });
  return drawn;
}

const png = () => new File([new Uint8Array(10)], "Capture0.PNG", { type: "image/png" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("photos open on older browsers (stage 293)", () => {
  it("opens a PNG on Chrome 109, which refuses from-image, through the <img> decoder", async () => {
    const drawn = browser({ fromImage: false, element: true, plain: true });
    const blob = await shrink(png());
    expect(blob.type).toBe("image/jpeg");
    // Upright as the <img> gives it (2000 by 3000), shrunk to 1,568 on the long side.
    expect(drawn).toEqual([{ width: Math.round(2000 * (PHOTO_SIDE / 3000)), height: PHOTO_SIDE, fill: "#ffffff" }]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  });

  it("uses from-image where the browser takes it", async () => {
    const drawn = browser({ fromImage: true, element: false, plain: false });
    await shrink(png());
    expect(drawn).toEqual([{ width: PHOTO_SIDE, height: Math.round(2000 * (PHOTO_SIDE / 3000)), fill: "#ffffff" }]);
  });

  it("falls back to the plain decode when the <img> can't decode it either", async () => {
    browser({ fromImage: false, element: false, plain: true });
    const d = await decodePhoto(png());
    expect([d.width, d.height]).toEqual([3000, 2000]);
  });

  it("says it couldn't, when no way decodes it", async () => {
    browser({ fromImage: false, element: false, plain: false });
    await expect(shrink(png())).rejects.toThrow();
  });
});
