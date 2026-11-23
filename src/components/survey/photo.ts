/**
 * Photos for Survey Studio's AI readers ("Read an old plan", field sketches): shrunk in the browser to the size Claude reads best
 * (1,568 px on the long side), turned upright, and saved as JPEG, so a 50 MP phone photo goes up as a few hundred kilobytes.
 */
export const PHOTO_SIDE = 1_568;

export async function shrink(file: File): Promise<Blob> {
  // A large photo (a 50 MP phone camera) is decoded straight to a smaller width where the browser can, so it doesn't fill a phone's memory.
  const big = file.size > 4_000_000;
  const bitmap = await createImageBitmap(file, big ? { imageOrientation: "from-image", resizeWidth: 2 * PHOTO_SIDE, resizeQuality: "high" } : { imageOrientation: "from-image" }).catch(() => createImageBitmap(file, { imageOrientation: "from-image" }));
  const scale = Math.min(1, PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85));
}
