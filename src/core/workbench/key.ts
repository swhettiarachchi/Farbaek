/**
 * A short key that changes whenever any of its parts do (stage 202). Build's workspace compares it to decide whether the
 * preview has to be read again, so saving one file or applying a change refreshes it, and nothing else does. It only ever
 * answers "did something change?": it is not a checksum of the content and protects nothing.
 */
/** An id as the database writes it. Anything else is not an id, and is never used to read or to build an address. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function changeKey(parts: readonly string[]): string {
  // FNV-1a over the parts, each ended by a separator that can't appear inside a path or an id.
  let h = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193);
  }
  return `${parts.length.toString(36)}-${(h >>> 0).toString(36)}`;
}
