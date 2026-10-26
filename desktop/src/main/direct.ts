/**
 * Direct links between paired Farbaek Agents over the internet (ADR 0095),
 * from the main process's side. WebRTC lives in Chromium, so a hidden,
 * sandboxed window holds the peer connections (desktop/src/rtc); this file
 * carries their setup messages over a Farbaek relay session and turns each
 * open data channel into a byte stream the Noise channel can use, exactly
 * like a TCP socket. The window is made on first use and closes with the app.
 */
import { BrowserWindow, MessageChannelMain, app, type MessagePortMain } from "electron";
import { Duplex } from "node:stream";
import { DirectError, SignalChannel } from "@/agent-runtime/mesh/direct-signal";
import { RTC_IN_FLIGHT, type FromRtc, type RtcOpen, type ToRtc } from "../shared/rtc";

/** How long two networks get to open a direct link before the person is offered the relay. */
const OPEN_TIMEOUT_MS = 20_000;

/** One open data channel as a byte stream, with backpressure from the window. */
class DirectStream extends Duplex {
  private inFlight = 0;
  private resumeWrites: (() => void)[] = [];

  constructor(private readonly port: MessagePortMain) {
    super({ allowHalfOpen: false });
  }

  received(bytes: Uint8Array): void {
    this.push(Buffer.from(bytes));
  }

  acknowledged(bytes: number): void {
    this.inFlight = Math.max(0, this.inFlight - bytes);
    if (this.inFlight < RTC_IN_FLIGHT) for (const resume of this.resumeWrites.splice(0)) resume();
  }

  ended(): void {
    this.push(null);
    for (const resume of this.resumeWrites.splice(0)) resume();
    this.destroy();
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.inFlight += chunk.length;
    this.port.postMessage({ t: "data", bytes: new Uint8Array(chunk) } satisfies ToRtc);
    if (this.inFlight < RTC_IN_FLIGHT) callback();
    else this.resumeWrites.push(() => callback());
  }

  override _read(): void {
    // Bytes arrive as the window posts them.
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    try {
      this.port.postMessage({ t: "close" } satisfies ToRtc);
      this.port.close();
    } catch {
      // The port is already closed.
    }
    callback(error);
  }
}

export class DirectBridge {
  private host: Promise<BrowserWindow> | null = null;
  private window: BrowserWindow | null = null;

  constructor(
    private readonly files: { preload: string; page: string },
    /** Farbaek's own STUN server for this pairing, as stun:host:port, or none. */
    private readonly iceServers: () => string[],
  ) {}

  private hiddenWindow(): Promise<BrowserWindow> {
    this.host ??= (async () => {
      const w = new BrowserWindow({
        show: false,
        width: 320,
        height: 240,
        webPreferences: { preload: this.files.preload, contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, spellcheck: false, backgroundThrottling: false, devTools: !app.isPackaged },
      });
      w.on("closed", () => {
        this.window = null;
        this.host = null;
      });
      await w.loadFile(this.files.page);
      this.window = w;
      return w;
    })();
    return this.host;
  }

  /** Opens a direct link set up over `signal`, a relay session to the other agent. */
  async open(signal: Duplex, role: "offer" | "answer"): Promise<Duplex> {
    const ice = this.iceServers();
    let window: BrowserWindow;
    try {
      window = await this.hiddenWindow();
    } catch {
      throw new DirectError("This computer couldn't start a direct link.");
    }
    const setup = new SignalChannel(signal);
    const { port1: port, port2 } = new MessageChannelMain();
    const stream = new DirectStream(port);
    window.webContents.postMessage("rtc:open", { role, iceServers: ice } satisfies RtcOpen, [port2]);

    return new Promise<Duplex>((resolve, reject) => {
      let settled = false;
      let opened = false;
      const timer = setTimeout(() => fail("The two networks didn't let a direct link through within 20 seconds."), OPEN_TIMEOUT_MS);
      function fail(reason: string): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        setup.close();
        stream.destroy();
        reject(new DirectError(reason));
      }
      setup.onMessage((s) => {
        if (s.t === "bye") fail("The other computer couldn't open a direct link.");
        else port.postMessage({ t: "signal", signal: s } satisfies ToRtc);
      });
      port.on("message", (event) => {
        const m = event.data as FromRtc;
        if (m.t === "signal") setup.send(m.signal);
        else if (m.t === "data") stream.received(m.bytes);
        else if (m.t === "ack") stream.acknowledged(m.bytes);
        else if (m.t === "failed") {
          if (!settled) setup.send({ t: "bye" });
          fail(m.reason);
        } else if (m.t === "closed") {
          if (opened) stream.ended();
          else fail("The direct link closed before it opened.");
        } else if (m.t === "open" && !settled) {
          settled = true;
          opened = true;
          clearTimeout(timer);
          // The setup is done: the relay session closes, and nothing else goes through the server.
          setup.close();
          resolve(stream);
        }
      });
      port.start();
    });
  }

  close(): void {
    this.window?.destroy();
    this.window = null;
    this.host = null;
  }
}
