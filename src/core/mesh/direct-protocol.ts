/**
 * The messages that set up a direct link between two Mesh devices (ADR
 * 0095), as lines of JSON over a Farbaek relay session. Shared by the
 * Farbaek Agent and browsers (ADR 0096), and checked on arrival.
 */
import { z } from "zod";

export const SIGNAL_LIMITS = { line: 20 * 1024, candidates: 64 } as const;

export const SignalSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("sdp"), type: z.enum(["offer", "answer"]), sdp: z.string().min(1).max(16 * 1024) }),
  z.object({
    t: z.literal("ice"),
    candidate: z.object({
      candidate: z.string().max(1024),
      sdpMid: z.string().max(64).nullable().optional(),
      sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
    }),
  }),
  z.object({ t: z.literal("bye") }),
]);
export type Signal = z.infer<typeof SignalSchema>;
