/**
 * A direct link from a browser to a paired computer (ADR 0095, ADR 0096):
 * the browser's own WebRTC, set up by lines of JSON over a Farbaek relay
 * session, with Farbaek's STUN server only. The open data channel becomes a
 * byte pipe for the same Noise channel the relay would carry, so a link
 * anyone swapped carries nothing readable.
 */
import { SIGNAL_LIMITS, SignalSchema, type Signal } from "@/core/mesh/direct-protocol";
import type { BytePipe } from "./wire";

export class WebDirectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebDirectError";
  }
}

const PIECE = 64 * 1024;
const BUFFERED_HIGH = 4 * 1024 * 1024;
const OPEN_TIMEOUT_MS = 20_000;

/** Lines of checked JSON over a byte pipe. */
export class SignalLines {
  private pending = "";
  private readonly decoder = new TextDecoder();
  private candidates = 0;

  constructor(private readonly pipe: BytePipe) {}

  send(signal: Signal): Promise<void> {
    return this.pipe.write(new TextEncoder().encode(`${JSON.stringify(signal)}\n`));
  }

  /** The next message, or null once the other side has finished. Throws on anything that isn't a setup message. */
  async next(): Promise<Signal | null> {
    for (;;) {
      const newline = this.pending.indexOf("\n");
      if (newline >= 0) {
        const line = this.pending.slice(0, newline);
        this.pending = this.pending.slice(newline + 1);
        if (line.length > SIGNAL_LIMITS.line) throw new WebDirectError("The computer sent something that isn't part of setting up a direct link.");
        let parsed;
        try {
          parsed = SignalSchema.safeParse(JSON.parse(line));
        } catch {
          throw new WebDirectError("The computer sent something that isn't part of setting up a direct link.");
        }
        if (!parsed.success || (parsed.data.t === "ice" && ++this.candidates > SIGNAL_LIMITS.candidates)) throw new WebDirectError("The computer sent something that isn't part of setting up a direct link.");
        return parsed.data;
      }
      if (this.pending.length > SIGNAL_LIMITS.line) throw new WebDirectError("The computer sent something that isn't part of setting up a direct link.");
      const bytes = await this.pipe.read();
      if (bytes === null) return null;
      this.pending += this.decoder.decode(bytes, { stream: true });
    }
  }
}

/** An open data channel as a byte pipe, with backpressure. */
class ChannelPipe implements BytePipe {
  private readonly queue: Uint8Array[] = [];
  private readonly waiters: ((b: Uint8Array | null) => void)[] = [];
  private ended = false;

  constructor(
    private readonly channel: RTCDataChannel,
    private readonly pc: RTCPeerConnection,
  ) {
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = BUFFERED_HIGH / 4;
    channel.onmessage = (e: MessageEvent<ArrayBuffer>) => this.deliver(new Uint8Array(e.data));
    const end = () => this.finish();
    channel.onclose = end;
    channel.onerror = end;
  }

  private deliver(bytes: Uint8Array): void {
    const w = this.waiters.shift();
    if (w) w(bytes);
    else this.queue.push(bytes);
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    for (const w of this.waiters.splice(0)) w(null);
  }

  async write(bytes: Uint8Array): Promise<void> {
    for (let at = 0; at < bytes.length; at += PIECE) {
      if (this.channel.readyState !== "open") throw new WebDirectError("The direct link closed.");
      while (this.channel.bufferedAmount > BUFFERED_HIGH) await new Promise<void>((r) => this.channel.addEventListener("bufferedamountlow", () => r(), { once: true }));
      this.channel.send(new Uint8Array(bytes.subarray(at, at + PIECE)));
    }
  }

  read(): Promise<Uint8Array | null> {
    const next = this.queue.shift();
    if (next) return Promise.resolve(next);
    if (this.ended) return Promise.resolve(null);
    return new Promise((r) => this.waiters.push(r));
  }

  close(): void {
    try {
      this.channel.close();
      this.pc.close();
    } catch {
      // Already closed.
    }
    this.finish();
  }
}

/** Opens a direct link as the caller, set up over `signal` (a relay session). Throws WebDirectError when the networks don't allow it. */
export async function openDirectWeb(signal: BytePipe, iceServers: string[]): Promise<BytePipe> {
  const lines = new SignalLines(signal);
  const pc = new RTCPeerConnection({ iceServers: iceServers.map((urls) => ({ urls })) });
  const channel = pc.createDataChannel("farbaek-mesh", { ordered: true });
  pc.onicecandidate = (e) => {
    if (e.candidate) void lines.send({ t: "ice", candidate: e.candidate.toJSON() as { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } }).catch(() => undefined);
  };
  const opened = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new WebDirectError("The two networks didn't let a direct link through within 20 seconds.")), OPEN_TIMEOUT_MS);
    channel.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        clearTimeout(timer);
        reject(new WebDirectError("The two networks didn't let a direct link through."));
      }
    };
  });
  const answered = (async () => {
    await pc.setLocalDescription(await pc.createOffer());
    await lines.send({ t: "sdp", type: "offer", sdp: pc.localDescription!.sdp });
    let remoteSet = false;
    const early: RTCIceCandidateInit[] = [];
    for (;;) {
      const s = await lines.next();
      if (s === null) return;
      if (s.t === "bye") throw new WebDirectError("The computer couldn't open a direct link.");
      if (s.t === "sdp" && s.type === "answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: s.sdp });
        remoteSet = true;
        for (const c of early.splice(0)) await pc.addIceCandidate(c).catch(() => undefined);
      } else if (s.t === "ice") {
        if (remoteSet) await pc.addIceCandidate(s.candidate).catch(() => undefined);
        else early.push(s.candidate);
      }
    }
  })();
  try {
    await Promise.race([opened, answered.then(() => opened)]);
  } catch (error) {
    pc.close();
    signal.close();
    throw error instanceof WebDirectError ? error : new WebDirectError("The direct link couldn't be set up.");
  }
  // The setup is done: the relay session closes, and nothing else goes through the server.
  signal.close();
  answered.catch(() => undefined);
  return new ChannelPipe(channel, pc);
}

/** Answers a direct link from a paired computer, set up over `signal` (a relay session). Throws WebDirectError when the networks don't allow it. */
export async function answerDirectWeb(signal: BytePipe, iceServers: string[]): Promise<BytePipe> {
  const lines = new SignalLines(signal);
  const pc = new RTCPeerConnection({ iceServers: iceServers.map((urls) => ({ urls })) });
  pc.onicecandidate = (e) => {
    if (e.candidate) void lines.send({ t: "ice", candidate: e.candidate.toJSON() as { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } }).catch(() => undefined);
  };
  const opened = new Promise<ChannelPipe>((resolve, reject) => {
    const timer = setTimeout(() => reject(new WebDirectError("The two networks didn't let a direct link through within 20 seconds.")), OPEN_TIMEOUT_MS);
    pc.ondatachannel = (e) => {
      const channel = e.channel;
      // Handlers go on at once: the computer starts its handshake as soon as the channel opens.
      const pipe = new ChannelPipe(channel, pc);
      const ready = () => {
        clearTimeout(timer);
        resolve(pipe);
      };
      if (channel.readyState === "open") ready();
      else channel.onopen = ready;
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        clearTimeout(timer);
        reject(new WebDirectError("The two networks didn't let a direct link through."));
      }
    };
  });
  const negotiated = (async () => {
    let remoteSet = false;
    const early: RTCIceCandidateInit[] = [];
    for (;;) {
      const s = await lines.next();
      if (s === null) return;
      if (s.t === "bye") throw new WebDirectError("The computer couldn't open a direct link.");
      if (s.t === "sdp" && s.type === "offer" && !remoteSet) {
        await pc.setRemoteDescription({ type: "offer", sdp: s.sdp });
        remoteSet = true;
        for (const c of early.splice(0)) await pc.addIceCandidate(c).catch(() => undefined);
        await pc.setLocalDescription(await pc.createAnswer());
        await lines.send({ t: "sdp", type: "answer", sdp: pc.localDescription!.sdp });
      } else if (s.t === "ice") {
        if (remoteSet) await pc.addIceCandidate(s.candidate).catch(() => undefined);
        else early.push(s.candidate);
      }
    }
  })();
  let pipe: ChannelPipe;
  try {
    pipe = await Promise.race([opened, negotiated.then(() => opened)]);
  } catch (error) {
    pc.close();
    signal.close();
    throw error instanceof WebDirectError ? error : new WebDirectError("The direct link couldn't be set up.");
  }
  // The computer closes the setup once its side is open; nothing else goes through the server.
  negotiated.catch(() => undefined);
  return pipe;
}
