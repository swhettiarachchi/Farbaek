/**
 * A line diff for reviews (the Intent Diff Lens, ADR 0041): which lines of a
 * file a change removed and added, grouped into hunks. Myers' O(ND)
 * algorithm on the lines between the common start and end. Very large or
 * very different files fall back to a single hunk, so the work stays small
 * enough to run in the browser while someone reads a review.
 */

export interface Hunk {
  /** First line in the old file (1-based); for an insertion, the line it follows plus one. */
  oldStart: number;
  oldLines: number;
  /** First line in the new file (1-based). */
  newStart: number;
  newLines: number;
  removed: string[];
  added: string[];
}

export interface DiffLimits {
  /** Most lines on either side between the common start and end. */
  maxLines: number;
  /** Most insertions and deletions before giving up on detail. */
  maxEdits: number;
}

const DEFAULT_LIMITS: DiffLimits = { maxLines: 5_000, maxEdits: 2_000 };

/** A file's lines; a final newline doesn't make an extra empty line. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

type Op = "=" | "-" | "+";

/** The shortest edit script from a to b, or null past the edit limit. */
function myers(a: readonly string[], b: readonly string[], maxEdits: number): Op[] | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= Math.min(max, maxEdits); d += 1) {
    // What step d-1 reached, for k in [-d, d]: enough to walk back from step d.
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1]! < v[off + k + 1]!) ? v[off + k + 1]! : v[off + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m);
    }
  }
  return null;
}

function backtrack(trace: Int32Array[], n: number, m: number): Op[] {
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d -= 1) {
    const before = trace[d]!;
    // before[i] is V[k] for k = i - d - 1.
    const at = (k: number) => before[k + d + 1]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push("=");
      x -= 1;
      y -= 1;
    }
    ops.push(prevK === k + 1 ? "+" : "-");
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    ops.push("=");
    x -= 1;
    y -= 1;
  }
  return ops.reverse();
}

/** The hunks that turn `before` into `after`. */
export function diffLines(before: string, after: string, limits: DiffLimits = DEFAULT_LIMITS): Hunk[] {
  if (before === after) return [];
  const a = splitLines(before);
  const b = splitLines(after);
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre += 1;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf += 1;
  const A = a.slice(pre, a.length - suf);
  const B = b.slice(pre, b.length - suf);
  if (A.length === 0 && B.length === 0) return [];

  const whole: Hunk = { oldStart: pre + 1, oldLines: A.length, newStart: pre + 1, newLines: B.length, removed: A, added: B };
  if (A.length > limits.maxLines || B.length > limits.maxLines) return [whole];
  const ops = myers(A, B, limits.maxEdits);
  if (!ops) return [whole];

  const hunks: Hunk[] = [];
  let i = pre;
  let j = pre;
  let current: Hunk | null = null;
  for (const op of ops) {
    if (op === "=") {
      if (current) hunks.push(current);
      current = null;
      i += 1;
      j += 1;
      continue;
    }
    current ??= { oldStart: i + 1, oldLines: 0, newStart: j + 1, newLines: 0, removed: [], added: [] };
    if (op === "-") {
      current.removed.push(a[i]!);
      current.oldLines += 1;
      i += 1;
    } else {
      current.added.push(b[j]!);
      current.newLines += 1;
      j += 1;
    }
  }
  if (current) hunks.push(current);
  return hunks;
}
