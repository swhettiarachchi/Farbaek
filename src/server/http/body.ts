/**
 * Reading a request body with a hard size limit. `request.text()` and
 * `arrayBuffer()` hold the whole body in memory before anything can check
 * it, and Content-Length can be absent (chunked) or wrong, so an
 * unauthenticated caller could make the server buffer gigabytes. These read
 * the stream and stop at the limit.
 */

/** The body's bytes, or null when it's larger than `maxBytes` (or unreadable). */
export async function readBytesCapped(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** The body as UTF-8 text, or null when it's larger than `maxBytes` (or unreadable). */
export async function readTextCapped(request: Request, maxBytes: number): Promise<string | null> {
  const bytes = await readBytesCapped(request, maxBytes);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}
