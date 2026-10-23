/**
 * The fingerprint of the security evaluation suite: SHA-256 over its
 * scenario files and catalog, with line endings normalised. The committed
 * run report records it, so a report always belongs to exactly the suite
 * that produced it, and changing a scenario means running the suite again.
 */
import { sha256Hex } from "@/core/trust/canonical-json";

export async function suiteFingerprint(files: readonly { path: string; content: string }[]): Promise<string> {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sha256Hex(sorted.map((f) => `${f.path}\n${f.content.replace(/\r\n/g, "\n")}`).join("\n\u0000\n"));
}
