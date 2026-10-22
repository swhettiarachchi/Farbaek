/**
 * Farbaek Mesh nearby transfer, `farbaek-mesh/1` (spec §11, ADR 0038): the
 * messages two devices exchange once a Noise XX handshake has given them an
 * encrypted, mutually authenticated channel, and the limits both enforce.
 * Pure and framework-free, so the desktop agent today and the mobile apps
 * later speak exactly the same protocol.
 *
 * A transfer: the sender offers a Capsule manifest; the person on the
 * receiving device accepts and chooses where it goes; the files stream in
 * 4 MiB chunks, each checked against its BLAKE3 hash as it arrives; the
 * receiver reports `verified` only once every file has matched. A dropped
 * connection resumes from the last verified chunk.
 */
import { z } from "zod";
import type { CapsuleLimits } from "./capsule";

export const MESH_PROTOCOL = "farbaek-mesh/1";
/** The Noise prologue: binds every handshake to this protocol and version. */
export const MESH_PROLOGUE = new TextEncoder().encode(MESH_PROTOCOL);

/** Where devices announce themselves on the local network (an administratively scoped multicast group). */
export const DISCOVERY = { group: "239.255.70.66", port: 53_366 } as const;

/** How long a device stays visible after the person asks, and how long a pairing code is good for. */
export const VISIBLE_FOR_MS = 5 * 60_000;
export const PAIRING_WINDOW_MS = 2 * 60_000;
export const HANDSHAKE_TIMEOUT_MS = 10_000;
/** How long a sender waits for the person on the other device to accept. */
export const OFFER_TIMEOUT_MS = 5 * 60_000;

/** Between two computers: binary files are fine, sizes are larger than for a workspace import. */
export const TRANSFER_LIMITS: CapsuleLimits = {
  maxFiles: 10_000,
  maxFileBytes: 2 * 1024 ** 3,
  maxTotalBytes: 4 * 1024 ** 3,
};
/** A manifest larger than this isn't accepted. */
export const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
/** File bytes per encrypted message, comfortably inside Noise's 65,535-byte limit with the header and tag. */
export const DATA_PIECE_BYTES = 60 * 1024;

const Hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const Name = z.string().trim().min(1).max(60);

/** Carried inside the handshake, encrypted: who the device says it is and why it called. */
export const HelloSchema = z.object({
  v: z.literal(1),
  name: Name,
  purpose: z.enum(["pair", "transfer"]).optional(),
});
export type Hello = z.infer<typeof HelloSchema>;

export const ERROR_CODES = ["not_paired", "busy", "bad_offer", "no_space", "chunk_mismatch", "file_mismatch", "source_changed", "protocol", "internal"] as const;
export type MeshErrorCode = (typeof ERROR_CODES)[number];

/**
 * Every message after the handshake. `blob` messages announce a JSON body
 * that follows in `data` messages, for anything that may not fit in one
 * encrypted message (the manifest, resume points).
 */
export const MessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("pair-confirm"), ok: z.boolean() }),
  z.object({ t: z.literal("offer"), session: z.uuid(), digest: Hex64, size: z.number().int().min(2).max(MAX_MANIFEST_BYTES) }),
  z.object({ t: z.literal("accept"), size: z.number().int().min(2).max(1024 * 1024) }),
  z.object({ t: z.literal("decline") }),
  z.object({ t: z.literal("file"), f: z.number().int().min(0).max(TRANSFER_LIMITS.maxFiles - 1), from: z.number().int().min(0).max(1024) }),
  z.object({ t: z.literal("data") }),
  z.object({ t: z.literal("verified"), files: z.number().int().min(0), bytes: z.number().int().min(0) }),
  z.object({ t: z.literal("cancel") }),
  z.object({ t: z.literal("error"), code: z.enum(ERROR_CODES), message: z.string().max(300) }),
]);
export type MeshMessage = z.infer<typeof MessageSchema>;

/** The receiver's answer to an offer: for each file, how many chunks it already holds, checked. */
export const ResumeSchema = z.object({
  resume: z.array(z.tuple([z.number().int().min(0).max(TRANSFER_LIMITS.maxFiles - 1), z.number().int().min(1).max(1024)])).max(TRANSFER_LIMITS.maxFiles),
});
export type ResumePoints = z.infer<typeof ResumeSchema>;

/** What an announcement on the local network may say. Nothing in it is secret. */
export const AnnouncementSchema = z.object({
  p: z.literal(MESH_PROTOCOL),
  kind: z.enum(["here", "who"]),
  name: Name,
  /** The first 16 hex digits of SHA-256 of the device's public key. */
  fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
  /** The TCP port it accepts connections on; 0 when it's only looking. */
  port: z.number().int().min(0).max(65_535),
});
export type Announcement = z.infer<typeof AnnouncementSchema>;

export type TransferState = "packing" | "connecting" | "waiting" | "offered" | "sending" | "receiving" | "finishing" | "done" | "declined" | "cancelled" | "interrupted" | "failed";

/** States a transfer doesn't leave. */
export const FINAL_STATES: ReadonlySet<TransferState> = new Set(["done", "declined", "cancelled", "failed"]);
