import { createServer, type AddressInfo, type Server } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emailStatus, readEmailConfig } from "./config";
import { buildMessage, dotStuff, isPlainAddress, MessageError } from "./message";
import { checksEmail, createNotifier, runEmail } from "./notify";
import { sendSmtp, SmtpError, type SmtpConfig } from "./smtp";

const meta = { date: new Date("2026-10-24T06:00:00Z"), messageId: "<abc@farbaek.com>", boundary: "farbaek-abc" };
const message = { fromName: "Farbaek", fromAddress: "hello@farbaek.com", to: "ada@example.com", subject: "Ready to review: Café site", text: "Hello\n.hidden line", html: "<p>Hello</p>" };

describe("buildMessage", () => {
  it("writes headers and both parts in UTF-8 base64, with CRLF line endings", () => {
    const data = buildMessage(message, meta);
    expect(data).toContain('From: "Farbaek" <hello@farbaek.com>\r\nTo: <ada@example.com>\r\n');
    expect(data).toContain(`Subject: =?UTF-8?B?${Buffer.from("Ready to review: Café site").toString("base64")}?=`);
    expect(data).toContain("Date: Sat, 24 Oct 2026 06:00:00 +0000");
    expect(data).toContain('Content-Type: multipart/alternative; boundary="farbaek-abc"');
    expect(data.split("\r\n").every((l) => l.length <= 998)).toBe(true);
    expect(data).not.toMatch(/[^\r]\n/);
    const plain = data.split('Content-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1]!.split("\r\n--")[0]!;
    expect(Buffer.from(plain.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe("Hello\n.hidden line");
  });

  it("refuses anything that could add a header", () => {
    expect(() => buildMessage({ ...message, subject: "Hi\r\nBcc: x@evil.test" }, meta)).toThrow(MessageError);
    expect(() => buildMessage({ ...message, fromName: "Farbaek\nBcc: x" }, meta)).toThrow(MessageError);
    expect(() => buildMessage({ ...message, to: "ada@example.com>\r\nBcc: <x@evil.test" }, meta)).toThrow(MessageError);
    expect(isPlainAddress("ada@example.com")).toBe(true);
    expect(isPlainAddress("Ada <ada@example.com>")).toBe(false);
    expect(isPlainAddress("ada@localhost")).toBe(false);
  });

  it("dot-stuffs lines that start with a dot", () => {
    expect(dotStuff(".a\r\nb\r\n.c")).toBe("..a\r\nb\r\n..c");
  });
});

/** A fake SMTP server on localhost that records what it's told. */
function fakeSmtp(opts: { auth?: string; refuse?: { at: string; reply: string }; silent?: boolean } = {}) {
  const heard: string[] = [];
  let data = "";
  const server: Server = createServer((socket) => {
    socket.on("error", () => undefined);
    socket.setEncoding("utf8");
    let inData = false;
    let buffer = "";
    if (!opts.silent) socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let i: number;
      while ((i = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 queued\r\n");
          } else data += `${line}\r\n`;
          continue;
        }
        heard.push(line);
        const verb = line.split(" ")[0]!.toUpperCase();
        if (opts.refuse && line.startsWith(opts.refuse.at)) {
          socket.write(`${opts.refuse.reply}\r\n`);
          continue;
        }
        if (verb === "EHLO") socket.write(`250-fake\r\n250-${opts.auth ?? "AUTH PLAIN LOGIN"}\r\n250 SIZE 1000000\r\n`);
        else if (verb === "AUTH" && line.includes("LOGIN")) socket.write("334 VXNlcm5hbWU6\r\n");
        else if (verb === "AUTH") socket.write("235 ok\r\n");
        else if (heard.length >= 2 && heard[heard.length - 2] === "AUTH LOGIN") socket.write("334 UGFzc3dvcmQ6\r\n");
        else if (heard.length >= 3 && heard[heard.length - 3] === "AUTH LOGIN") socket.write("235 ok\r\n");
        else if (verb === "MAIL" || verb === "RCPT") socket.write("250 ok\r\n");
        else if (verb === "DATA") {
          inData = true;
          socket.write("354 go\r\n");
        } else if (verb === "QUIT") socket.end("221 bye\r\n");
      }
    });
  });
  return {
    heard,
    data: () => data,
    start: () => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port))),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const servers: { stop(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.stop()));
});

const config = (port: number, over: Partial<SmtpConfig> = {}): SmtpConfig => ({ host: "127.0.0.1", port, secure: false, user: "hello@farbaek.com", password: "pw", heloName: "farbaek.com", timeoutMs: 2000, ...over });

describe("sendSmtp", () => {
  it("signs in with AUTH PLAIN and sends one message, dot-stuffed", async () => {
    const s = fakeSmtp();
    servers.push(s);
    const port = await s.start();
    await sendSmtp(config(port), { from: "hello@farbaek.com", to: "ada@example.com" }, "Subject: x\r\n\r\n.dot\r\nbody");
    expect(s.heard).toEqual(["EHLO farbaek.com", `AUTH PLAIN ${Buffer.from("\0hello@farbaek.com\0pw").toString("base64")}`, "MAIL FROM:<hello@farbaek.com>", "RCPT TO:<ada@example.com>", "DATA", "QUIT"]);
    expect(s.data()).toBe("Subject: x\r\n\r\n..dot\r\nbody\r\n");
  });

  it("uses AUTH LOGIN when that's all the server offers", async () => {
    const s = fakeSmtp({ auth: "AUTH LOGIN" });
    servers.push(s);
    const port = await s.start();
    await sendSmtp(config(port), { from: "hello@farbaek.com", to: "ada@example.com" }, "x");
    expect(s.heard.slice(1, 4)).toEqual(["AUTH LOGIN", Buffer.from("hello@farbaek.com").toString("base64"), Buffer.from("pw").toString("base64")]);
  });

  it("says what the server refused, without the password", async () => {
    const s = fakeSmtp({ refuse: { at: "AUTH", reply: "535 bad credentials" } });
    servers.push(s);
    const port = await s.start();
    const err = await sendSmtp(config(port, { password: "secret-pw" }), { from: "hello@farbaek.com", to: "ada@example.com" }, "x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SmtpError);
    expect((err as SmtpError).code).toBe(535);
    expect((err as SmtpError).message).toContain("refused the sign-in");
    expect((err as SmtpError).message).not.toContain("secret-pw");
  });

  it("gives up on a silent server, and only sends without TLS to localhost", async () => {
    const s = fakeSmtp({ silent: true });
    servers.push(s);
    const port = await s.start();
    await expect(sendSmtp(config(port, { timeoutMs: 150 }), { from: "a@b.co", to: "c@d.co" }, "x")).rejects.toThrow(/didn't answer in time/);
    await expect(sendSmtp(config(port, { host: "mail.example.com" }), { from: "a@b.co", to: "c@d.co" }, "x")).rejects.toThrow(/only sent over TLS/);
  });
});

describe("email settings", () => {
  it("are off without a password, default to Spacemail over TLS, and refuse a port without TLS", () => {
    expect(readEmailConfig({})).toBeNull();
    const c = readEmailConfig({ SMTP_PASSWORD: "pw", NEXT_PUBLIC_SITE_URL: "https://www.farbaek.com/" });
    expect(c).toMatchObject({ smtp: { host: "mail.spacemail.com", port: 465, secure: true, user: "hello@farbaek.com" }, fromAddress: "hello@farbaek.com", siteUrl: "https://www.farbaek.com" });
    expect(readEmailConfig({ SMTP_PASSWORD: "pw", SMTP_PORT: "587" })).toBeNull();
    expect(emailStatus({})).toMatchObject({ on: false });
    expect(emailStatus({ SMTP_PASSWORD: "pw" })).toEqual({ on: true, detail: "Sends through mail.spacemail.com" });
    expect(JSON.stringify(emailStatus({ SMTP_PASSWORD: "hunter2" }))).not.toContain("hunter2");
  });
});

describe("notifications", () => {
  const cfg = readEmailConfig({ SMTP_PASSWORD: "pw" })!;

  it("say what happened in plain words", () => {
    expect(runEmail({ userId: "u", taskId: "t", taskTitle: "Café site", status: "finished", outcome: "Finished. The change is waiting for your review." })?.subject).toBe("Ready to review: Café site");
    expect(runEmail({ userId: "u", taskId: "t", taskTitle: "Café site", status: "failed", outcome: "x" })?.subject).toBe("Build stopped: Café site");
    expect(runEmail({ userId: "u", taskId: "t", taskTitle: "Café site", status: "cancelled", outcome: "x" })).toBeNull();
    expect(checksEmail({ userId: "u", taskId: "t", taskTitle: "Café site", result: "verified" }).subject).toBe("Checks passed: Café site");
    expect(checksEmail({ userId: "u", taskId: "t", taskTitle: "Café site", result: "failed" }).subject).toBe("Checks failed: Café site");
    expect(checksEmail({ userId: "u", taskId: "t", taskTitle: "Café site", result: null, reason: "The sandbox didn't start." })).toEqual({ subject: "Checks didn't run: Café site", lines: ["The sandbox didn't start."] });
  });

  it("go only to the person's own confirmed address, with a link to the task", async () => {
    const send = vi.fn(async () => undefined);
    const n = createNotifier({ config: cfg, emailOf: async (id) => (id === "u1" ? "ada@example.com" : null), send });
    await n.buildFinished({ userId: "u1", taskId: "t-1", taskTitle: "Café <site>", status: "finished", outcome: "Finished." });
    await n.checksFinished({ userId: "u2", taskId: "t-1", taskTitle: "x", result: "verified" });
    expect(send).toHaveBeenCalledTimes(1);
    const [smtp, envelope, data] = send.mock.calls[0] as unknown as [SmtpConfig, { from: string; to: string }, string];
    expect(smtp.host).toBe("mail.spacemail.com");
    expect(envelope).toEqual({ from: "hello@farbaek.com", to: "ada@example.com" });
    const html = Buffer.from(data.split('Content-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1]!.split("\r\n--")[0]!.replace(/\r\n/g, ""), "base64").toString("utf8");
    expect(html).toContain('href="https://www.farbaek.com/app/tasks/t-1"');
    expect(html).not.toContain("<site>");
  });

  it("send nothing without settings, and never let a failure reach the work", async () => {
    const send = vi.fn(async () => {
      throw new SmtpError("The mail server refused the sign-in: 535", 535);
    });
    await createNotifier({ config: null, emailOf: async () => "ada@example.com", send }).buildFinished({ userId: "u", taskId: "t", taskTitle: "x", status: "finished", outcome: "x" });
    expect(send).not.toHaveBeenCalled();
    await expect(createNotifier({ config: cfg, emailOf: async () => "ada@example.com", send }).checksFinished({ userId: "u", taskId: "t", taskTitle: "x", result: "verified" })).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
