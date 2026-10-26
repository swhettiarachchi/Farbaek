/**
 * The hidden window's whole job (ADR 0095): one RTCPeerConnection and one
 * ordered, reliable data channel per direct link, using Chromium's own
 * WebRTC (ICE hole punching through Farbaek's STUN server, DTLS, SCTP). The
 * main process sets it up through a MessagePort and gets the bytes back the
 * same way. Nothing here reads files, keys or the Farbaek token; the bytes
 * it carries are already Noise-encrypted by the main process.
 */
import { ipcRenderer } from "electron";
import { RTC_BUFFERED_HIGH, RTC_PIECE, type FromRtc, type RtcOpen, type ToRtc } from "../shared/rtc";

function connect(port: MessagePort, init: RtcOpen): void {
  const post = (message: FromRtc) => port.postMessage(message);
  const pc = new RTCPeerConnection({ iceServers: init.iceServers.map((urls) => ({ urls })) });
  let channel: RTCDataChannel | null = null;
  let remoteSet = false;
  const earlyCandidates: RTCIceCandidateInit[] = [];
  const waiting: Uint8Array<ArrayBuffer>[] = [];
  let ended = false;

  const end = () => {
    if (ended) return;
    ended = true;
    post({ t: "closed" });
    try {
      channel?.close();
      pc.close();
    } catch {
      // Already closed.
    }
    port.close();
  };

  /** Hands the channel what it can take now, and tells the main process how much it took. */
  const flush = () => {
    if (!channel || channel.readyState !== "open") return;
    let taken = 0;
    while (waiting.length > 0 && channel.bufferedAmount < RTC_BUFFERED_HIGH) {
      const piece = waiting.shift()!;
      channel.send(piece);
      taken += piece.length;
    }
    if (taken > 0) post({ t: "ack", bytes: taken });
  };

  const adopt = (c: RTCDataChannel) => {
    channel = c;
    c.binaryType = "arraybuffer";
    c.bufferedAmountLowThreshold = RTC_BUFFERED_HIGH / 4;
    c.onopen = () => {
      post({ t: "open" });
      flush();
    };
    c.onmessage = (e: MessageEvent<ArrayBuffer>) => post({ t: "data", bytes: new Uint8Array(e.data) });
    c.onbufferedamountlow = flush;
    c.onclose = end;
    c.onerror = end;
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) post({ t: "signal", signal: { t: "ice", candidate: e.candidate.toJSON() as { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } } });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") {
      post({ t: "failed", reason: "The two networks didn't let a direct link through." });
      end();
    }
  };

  const remote = async (description: RTCSessionDescriptionInit) => {
    await pc.setRemoteDescription(description);
    remoteSet = true;
    for (const c of earlyCandidates.splice(0)) await pc.addIceCandidate(c).catch(() => undefined);
  };

  port.onmessage = (e: MessageEvent<ToRtc>) => {
    const m = e.data;
    if (m.t === "data") {
      // Bytes posted across the port are backed by their own ArrayBuffer.
      const bytes = m.bytes as Uint8Array<ArrayBuffer>;
      for (let i = 0; i < bytes.length; i += RTC_PIECE) waiting.push(bytes.subarray(i, i + RTC_PIECE));
      flush();
    } else if (m.t === "close") {
      end();
    } else if (m.t === "signal") {
      const s = m.signal;
      void (async () => {
        try {
          if (s.t === "sdp" && s.type === "offer" && init.role === "answer") {
            await remote({ type: "offer", sdp: s.sdp });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            post({ t: "signal", signal: { t: "sdp", type: "answer", sdp: pc.localDescription!.sdp } });
          } else if (s.t === "sdp" && s.type === "answer" && init.role === "offer") {
            await remote({ type: "answer", sdp: s.sdp });
          } else if (s.t === "ice") {
            if (remoteSet) await pc.addIceCandidate(s.candidate).catch(() => undefined);
            else earlyCandidates.push(s.candidate);
          }
        } catch {
          post({ t: "failed", reason: "The other computer's link details couldn't be used." });
          end();
        }
      })();
    }
  };
  port.start();

  if (init.role === "offer") {
    adopt(pc.createDataChannel("farbaek-mesh", { ordered: true }));
    void (async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer());
        post({ t: "signal", signal: { t: "sdp", type: "offer", sdp: pc.localDescription!.sdp } });
      } catch {
        post({ t: "failed", reason: "This computer couldn't start a direct link." });
        end();
      }
    })();
  } else {
    pc.ondatachannel = (e) => adopt(e.channel);
  }
}

ipcRenderer.on("rtc:open", (event, init: RtcOpen) => {
  const port = event.ports[0];
  if (port) connect(port, init);
});
