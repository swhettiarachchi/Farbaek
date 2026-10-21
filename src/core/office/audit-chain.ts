/**
 * The Office Space audit log is a hash chain (ADR 0032). The database
 * writes each event's facts as a JSON "envelope" and stores
 * row_hash = SHA-256(prev_hash + envelope), with prev_hash the previous
 * row's row_hash and the first row chained to GENESIS_HASH. The text of the
 * envelope is stored, so checking it never depends on how Postgres prints
 * JSON. A deleted, edited or reordered row breaks the chain here.
 */
import { sha256Hex } from "@/core/trust/canonical-json";

export const GENESIS_HASH = "0".repeat(64);

export interface ChainRow {
  seq: number;
  prev_hash: string;
  envelope: string;
  row_hash: string;
  action: string;
  result: string;
  target_type: string | null;
  target_id: string | null;
}

export type ChainCheck =
  | { ok: true; checked: number; throughSeq: number; headHash: string }
  | { ok: false; checked: number; firstBadSeq: number; problem: string };

/**
 * Checks rows in order. `previous` is the row before the first one given
 * (null when starting from the beginning of the log).
 */
export async function verifyStaffAuditChain(rows: readonly ChainRow[], previous: { seq: number; row_hash: string } | null = null): Promise<ChainCheck> {
  let expectedSeq = previous ? previous.seq + 1 : 1;
  let prevHash = previous ? previous.row_hash : GENESIS_HASH;
  let checked = 0;
  for (const row of rows) {
    const bad = (problem: string): ChainCheck => ({ ok: false, checked, firstBadSeq: row.seq, problem });
    if (row.seq !== expectedSeq) return bad(`Event ${expectedSeq} is missing: the log jumps to ${row.seq}.`);
    if (row.prev_hash !== prevHash) return bad("This event doesn't link to the one before it.");
    if ((await sha256Hex(row.prev_hash + row.envelope)) !== row.row_hash) return bad("This event's contents don't match its hash.");
    let facts: { seq?: unknown; action?: unknown; result?: unknown; target_type?: unknown; target_id?: unknown };
    try {
      facts = JSON.parse(row.envelope) as typeof facts;
    } catch {
      return bad("This event's stored facts can't be read.");
    }
    if (facts.seq !== row.seq || facts.action !== row.action || facts.result !== row.result || (facts.target_type ?? null) !== row.target_type || (facts.target_id ?? null) !== row.target_id) {
      return bad("This event's columns don't match its hashed facts.");
    }
    prevHash = row.row_hash;
    expectedSeq += 1;
    checked += 1;
  }
  return { ok: true, checked, throughSeq: expectedSeq - 1, headHash: prevHash };
}
