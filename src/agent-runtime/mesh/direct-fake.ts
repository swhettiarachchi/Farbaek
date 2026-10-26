/**
 * For tests: a direct link without WebRTC. The two agents really exchange an
 * offer and an answer over the relay session, as the desktop's WebRTC bridge
 * does, then get the two ends of an in-memory stream. It can be told to
 * fail like a blocked network, or to hand the caller a stream to someone
 * else (a server that swapped the link).
 */
import { randomUUID } from "node:crypto";
import { duplexPair, type Duplex } from "node:stream";
import { DirectError, SignalChannel } from "./direct-signal";

export interface FakeDirectOptions {
  /** The networks block a direct link. */
  blocked?: () => boolean;
  /** A man in the middle: the caller's stream goes here instead of to the other agent. */
  swap?: (callerEnd: Duplex) => void;
}

export function fakeDirect(options: FakeDirectOptions = {}) {
  const waiting = new Map<string, Duplex>();
  return async function direct(signal: Duplex, role: "offer" | "answer"): Promise<Duplex> {
    const channel = new SignalChannel(signal);
    if (role === "offer") {
      const id = randomUUID();
      const [mine, theirs] = duplexPair();
      waiting.set(id, theirs);
      channel.send({ t: "sdp", type: "offer", sdp: id });
      const answer = await channel.next(5_000).catch(() => null);
      if (!answer || answer.t !== "sdp" || answer.type !== "answer" || options.blocked?.()) {
        channel.close();
        throw new DirectError("The two networks didn't let a direct link through.");
      }
      channel.close();
      if (options.swap) {
        const [swapped, attacker] = duplexPair();
        options.swap(attacker);
        return swapped;
      }
      return mine;
    }
    const offer = await channel.next(5_000);
    if (offer.t !== "sdp" || offer.type !== "offer") throw new DirectError("No offer arrived.");
    const end = waiting.get(offer.sdp);
    channel.send({ t: "sdp", type: "answer", sdp: "fake-answer" });
    if (!end || options.blocked?.()) throw new DirectError("The two networks didn't let a direct link through.");
    return end;
  };
}
