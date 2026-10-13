/**
 * JSON Canonicalization Scheme (RFC 8785).
 *
 * Approvals, contracts and ProofPacks are hashed over this form so that the
 * same logical payload always produces the same bytes, in the browser and on
 * the server.
 *
 * - Object keys are sorted by UTF-16 code units (the default JS string order).
 * - Numbers use the ECMAScript Number-to-String algorithm (what JSON.stringify does).
 * - Strings use JSON.stringify escaping, which matches the RFC's rules.
 *
 * Values that aren't I-JSON (undefined, functions, NaN/Infinity, BigInt,
 * lone surrogates, cycles, non-plain objects) are rejected instead of being
 * silently dropped, because a dropped field would change what was approved.
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export class CanonicalizationError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(`${message} at ${path}`);
    this.name = "CanonicalizationError";
  }
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function serializeString(value: string, path: string): string {
  if (LONE_SURROGATE.test(value)) throw new CanonicalizationError("String contains a lone surrogate", path);
  return JSON.stringify(value);
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function serialize(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new CanonicalizationError("Number is not finite", path);
      return JSON.stringify(value);
    case "string":
      return serializeString(value, path);
    case "object":
      break;
    default:
      throw new CanonicalizationError(`Unsupported value of type ${typeof value}`, path);
  }

  const obj = value as object;
  if (ancestors.has(obj)) throw new CanonicalizationError("Circular reference", path);
  ancestors.add(obj);

  try {
    if (Array.isArray(obj)) {
      const items: string[] = [];
      for (let i = 0; i < obj.length; i++) {
        if (!(i in obj)) throw new CanonicalizationError("Sparse array", `${path}[${i}]`);
        items.push(serialize(obj[i], `${path}[${i}]`, ancestors));
      }
      return `[${items.join(",")}]`;
    }

    if (!isPlainObject(obj)) throw new CanonicalizationError("Only plain objects can be canonicalized", path);

    const record = obj as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const members = keys.map((key) => {
      const childPath = `${path}.${key}`;
      return `${serializeString(key, childPath)}:${serialize(record[key], childPath, ancestors)}`;
    });
    return `{${members.join(",")}}`;
  } finally {
    ancestors.delete(obj);
  }
}

export function canonicalize(value: unknown): string {
  return serialize(value, "$", new Set());
}

const encoder = new TextEncoder();

/** SHA-256 over UTF-8 bytes, as lowercase hex. Uses Web Crypto (browser and Node 20+). */
export async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto is not available in this context");
  const digest = await subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function canonicalHash(value: unknown): Promise<string> {
  return sha256Hex(canonicalize(value));
}

/** "sha256:3f9ac1…e2b7" for display. Never use the short form for comparisons. */
export function shortHash(hex: string, head = 6, tail = 4): string {
  return `sha256:${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
