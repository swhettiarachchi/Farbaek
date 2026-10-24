/**
 * One email as RFC 5322 text (ADR 0060): plain text and HTML alternatives,
 * both base64 in UTF-8, with CRLF line endings. Nothing a person typed can
 * add a header: addresses must be plain addresses, and line breaks in the
 * subject or the sender's name are refused.
 */

export interface EmailMessage {
  fromName: string;
  fromAddress: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** A plain address: no spaces, angle brackets, quotes or line breaks. */
const ADDRESS = /^[^\s<>@",;:()\\[\]]+@[^\s<>@",;:()\\[\]]+\.[^\s<>@",;:()\\[\]]+$/;

export function isPlainAddress(value: string): boolean {
  return value.length <= 254 && ADDRESS.test(value);
}

export class MessageError extends Error {}

/** A header value in UTF-8, as an RFC 2047 encoded word when it isn't plain ASCII. */
function headerText(value: string, what: string): string {
  if (/[\r\n]/.test(value)) throw new MessageError(`The ${what} can't contain a line break.`);
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Base64 in lines of at most 76 characters, as MIME asks. */
function base64Lines(value: string): string {
  return (Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");
}

export function buildMessage(m: EmailMessage, meta: { date: Date; messageId: string; boundary: string }): string {
  if (!isPlainAddress(m.fromAddress)) throw new MessageError("The sender isn't a plain email address.");
  if (!isPlainAddress(m.to)) throw new MessageError("The recipient isn't a plain email address.");
  if (!/^[A-Za-z0-9._-]+$/.test(meta.boundary) || !/^<[^\s<>]+@[^\s<>]+>$/.test(meta.messageId)) throw new MessageError("Bad message metadata.");
  const name = headerText(m.fromName, "sender's name").replace(/["\\]/g, "");
  const lines = [
    `From: "${name}" <${m.fromAddress}>`,
    `To: <${m.to}>`,
    `Subject: ${headerText(m.subject, "subject")}`,
    `Date: ${meta.date.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: ${meta.messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${meta.boundary}"`,
    "",
    `--${meta.boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(m.text),
    `--${meta.boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(m.html),
    `--${meta.boundary}--`,
    "",
  ];
  return lines.join("\r\n");
}

/** SMTP's DATA terminator is a line holding only ".", so every line that starts with "." gets one more. */
export function dotStuff(data: string): string {
  return data.replace(/(^|\r\n)\./g, "$1..");
}
