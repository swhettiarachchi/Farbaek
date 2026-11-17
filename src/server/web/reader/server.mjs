// Farbaek's page reader as a small HTTP service (stage 205, ADR 0222). It runs in its own container on the app's image, on a
// network that only reaches the internet (never the database's), with no privileges and little memory. The app asks it to
// read pages; the app itself never fetches arbitrary addresses.
//
//   POST /read  {"url": "https://…", "timeoutMs": 4000, "hintedDate": "2026-11-17"}  → the page's text, or why not
//   GET  /healthz                                                                  → ok
import http from "node:http";
import { createReader } from "./read.mjs";

const port = Number(process.env.READER_PORT ?? 8080);
const reader = createReader();

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(json), "cache-control": "no-store" });
  res.end(json);
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") return send(res, 200, { ok: true, ...reader.stats() });
  if (req.method !== "POST" || req.url !== "/read") return send(res, 404, { ok: false, reason: "not found" });
  let size = 0;
  const chunks = [];
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > 4_096) {
      send(res, 413, { ok: false, reason: "request too large" });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", async () => {
    if (res.headersSent) return;
    let input;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return send(res, 400, { ok: false, reason: "not JSON" });
    }
    if (typeof input?.url !== "string" || input.url.length > 2_048) return send(res, 400, { ok: false, reason: "no url" });
    const timeoutMs = Math.min(Math.max(Number(input.timeoutMs) || 4_000, 500), 8_000);
    const hintedDate = typeof input.hintedDate === "string" ? input.hintedDate.slice(0, 64) : null;
    // The app gave up: stop reading too.
    const stop = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) stop.abort();
    });
    const result = await reader.read(input.url, { timeoutMs, hintedDate, signal: stop.signal });
    if (!res.destroyed) send(res, 200, result);
  });
});

server.requestTimeout = 15_000;
server.listen(port, "0.0.0.0", () => console.log(JSON.stringify({ msg: "reader.listening", port })));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
