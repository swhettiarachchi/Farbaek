import { SKETCH_PHOTO_SIDE } from "@/core/survey/autosurvey/sketch";
/**
 * Photos for Survey Studio's AI readers ("Read an old plan", field sketches): shrunk in the browser to the size Claude reads best
 * (1,568 px on the long side), turned upright, and saved as JPEG, so a 50 MP phone photo goes up as a few hundred kilobytes.
 */
/** The longest side a photo is shrunk to: kept with the size check that knows a photo this long was larger (stage 303). */
export const PHOTO_SIDE = SKETCH_PHOTO_SIDE;

/** A decoded picture and how to let it go once it's drawn. */
export type Decoded = { image: CanvasImageSource; width: number; height: number; done: () => void };

const fromBitmap = (bitmap: ImageBitmap): Decoded => ({ image: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() });

/**
 * Decoded by an <img>, which turns a photo upright from its camera's record in every browser since 2020 (Chrome 81, Safari 13.1,
 * Firefox 77).
 */
async function fromElement(file: Blob): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return { image: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

/**
 * The photo, decoded the best way this browser can. `imageOrientation: "from-image"` is refused outright by browsers older than about
 * Chrome 112, including Chrome 109, the last there is for Windows 7 (stage 293): every photo failed there. So each way is tried in
 * turn, ending with the plain decode every browser has.
 */
export async function decodePhoto(file: Blob): Promise<Decoded> {
  // A large photo (a 50 MP phone camera) is decoded straight to a smaller width where the browser can, so it doesn't fill a phone's memory.
  const big = file.size > 4_000_000;
  const ways: (() => Promise<Decoded>)[] = [
    ...(big ? [async () => fromBitmap(await createImageBitmap(file, { imageOrientation: "from-image", resizeWidth: 2 * PHOTO_SIDE, resizeQuality: "high" }))] : []),
    async () => fromBitmap(await createImageBitmap(file, { imageOrientation: "from-image" })),
    () => fromElement(file),
    async () => fromBitmap(await createImageBitmap(file)),
  ];
  let last: unknown = new Error("decode");
  for (const way of ways) {
    try {
      const d = await way();
      if (d.width > 0 && d.height > 0) return d;
      d.done();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** A prepared photo's width and height, or null when it can't be measured here. */
export async function photoSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

export async function shrink(file: File): Promise<Blob> {
  const photo = await decodePhoto(file);
  const scale = Math.min(1, PHOTO_SIDE / Math.max(photo.width, photo.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(photo.width * scale));
  canvas.height = Math.max(1, Math.round(photo.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    photo.done();
    throw new Error("canvas");
  }
  // A screenshot or scan with see-through parts (a PNG) would turn black as JPEG: it's laid on white paper first.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(photo.image, 0, 0, canvas.width, canvas.height);
  photo.done();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85));
}
