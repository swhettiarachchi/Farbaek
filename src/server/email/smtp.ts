/**
 * A small SMTP client for Farbaek's own notifications (ADR 0060): one
 * message to one recipient over implicit TLS (port 465), with AUTH PLAIN or
 * LOGIN. Certificates are checked. Every step has a timeout, and errors
 * carry the server's reply code and words, never the password.
 *
 * It does only what Farbaek needs. A plain connection is for tests alone:
 * the config refuses one for any host but localhost.
 */
import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { dotStuff } from "./message";

export interface SmtpConfig {
  host: string;
  port: number;
  /** Implicit TLS. Only localhost may turn it off. */
  secure: boolean;
  user: string;
  password: string;
  /** The name Farbaek gives itself in EHLO. */
  heloName: string;
  timeoutMs?: number;
}

export class SmtpError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
  ) {
    super(message);
  }
}

export type OpenSocket = (config: SmtpConfig) => Socket;

const openSocket: OpenSocket = (c) =>
  c.secure ? tlsConnect({ host: c.host, port: c.port, servername: c.host, minVersion: "TLSv1.2" }) : netConnect({ host: c.host, port: c.port });

interface Reply {
  code: number;
  lines: string[];
}

/** Reads SMTP replies off a socket: a reply ends at a line whose code is followed by a space. */
function replyReader(socket: Socket, timeoutMs: number) {
  let buffer = "";
  let lines: string[] = [];
  const ready: Reply[] = [];
  let waiting: { resolve: (r: Reply) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  let failure: Error | null = null;

  const deliver = () => {
    if (waiting && ready.length) {
      const w = waiting;
      waiting = null;
      clearTimeout(w.timer);
      w.resolve(ready.shift()!);
    }
  };
  const fail = (e: Error) => {
    failure = failure ?? e;
    if (waiting) {
      const w = waiting;
      waiting = null;
      clearTimeout(w.timer);
      w.reject(failure);
    }
  };

  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    let i: number;
    while ((i = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const m = /^(\d{3})([ -])(.*)$/.exec(line);
      if (!m) {
        fail(new SmtpError("The mail server sent something that isn't SMTP.", null));
        return;
      }
      lines.push(m[3]!);
      if (m[2] === " ") {
        ready.push({ code: Number(m[1]), lines });
        lines = [];
      }
    }
    deliver();
  });
  socket.on("error", (e) => fail(new SmtpError(`Couldn't reach the mail server: ${e.message}`, null)));
  socket.on("close", () => fail(new SmtpError("The mail server closed the connection.", null)));

  return (step: string) =>
    new Promise<Reply>((resolve, reject) => {
      if (ready.length) return resolve(ready.shift()!);
      if (failure) return reject(failure);
      const timer = setTimeout(() => fail(new SmtpError(`The mail server didn't answer in time (${step}).`, null)), timeoutMs);
      waiting = { resolve, reject, timer };
    });
}

/** Sends one message. `data` is the whole message (buildMessage), with CRLF line endings. */
export async function sendSmtp(config: SmtpConfig, envelope: { from: string; to: string }, data: string, open: OpenSocket = openSocket): Promise<void> {
  if (!config.secure && !["localhost", "127.0.0.1", "::1"].includes(config.host)) throw new SmtpError("Mail is only sent over TLS.", null);
  if (/[\r\n<>]/.test(envelope.from + envelope.to)) throw new SmtpError("Bad envelope address.", null);
  const socket = open(config);
  const read = replyReader(socket, config.timeoutMs ?? 20_000);
  const send = (line: string) => socket.write(`${line}\r\n`);
  const expect = async (step: string, ...codes: number[]) => {
    const r = await read(step);
    if (!codes.includes(r.code)) throw new SmtpError(`The mail server refused ${step}: ${r.code} ${r.lines.join(" ").slice(0, 200)}`, r.code);
    return r;
  };

  try {
    await expect("the connection", 220);
    send(`EHLO ${config.heloName}`);
    const ehlo = await expect("EHLO", 250);
    const auth = ehlo.lines.find((l) => /^AUTH[ =]/i.test(l))?.toUpperCase() ?? "";
    if (/\bPLAIN\b/.test(auth) || !/\bLOGIN\b/.test(auth)) {
      send(`AUTH PLAIN ${Buffer.from(`\0${config.user}\0${config.password}`, "utf8").toString("base64")}`);
      await expect("the sign-in", 235);
    } else {
      send("AUTH LOGIN");
      await expect("the sign-in", 334);
      send(Buffer.from(config.user, "utf8").toString("base64"));
      await expect("the sign-in", 334);
      send(Buffer.from(config.password, "utf8").toString("base64"));
      await expect("the sign-in", 235);
    }
    send(`MAIL FROM:<${envelope.from}>`);
    await expect("the sender", 250);
    send(`RCPT TO:<${envelope.to}>`);
    await expect("the recipient", 250, 251);
    send("DATA");
    await expect("the message", 354);
    socket.write(`${dotStuff(data.endsWith("\r\n") ? data : `${data}\r\n`)}.\r\n`);
    await expect("the message", 250);
    send("QUIT");
    // The message is already accepted; a missing goodbye doesn't change that.
    await read("QUIT").catch(() => undefined);
  } finally {
    socket.end();
    socket.destroySoon?.();
  }
}
