/**
 * Starter: a REST API service in plain Node.js (ADR 0140). No dependencies,
 * so nothing is installed and nothing can run on install; Node's own http
 * server and test runner. One resource, contacts, with validation, cursor
 * pages, JSON problem errors, a body size limit and a small rate limit, and
 * tests that start the server and call it. The data lives in memory and is
 * sample data; the README says how to put a database behind store.js.
 */
import type { StarterFile } from "./types";

const PACKAGE = `{
  "name": "contacts-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "A small REST API for contacts. Sample data, kept in memory.",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "test": "node --test"
  }
}
`;

const SERVER = `// Starts the API. Reads --port and --hostname (the preview passes them), then PORT, then 3000.
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { createStore } from "./store.js";

function flag(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(flag("port", process.env.PORT || 3000));
const hostname = flag("hostname", "0.0.0.0");
const server = createServer(createApp(createStore()));
server.listen(port, hostname, () => {
  console.log("Contacts API (sample data) on http://" + hostname + ":" + port);
});
`;

const APP = `// The routes. Every error is a JSON problem (RFC 9457) with a status, a title and what to do.
const MAX_BODY = 64 * 1024;
const WINDOW_MS = 60_000;
const PER_WINDOW = 120;

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
};
const problem = (res, status, title, detail, headers) => json(res, status, { type: "about:blank", status, title, detail }, { ...headers, "content-type": "application/problem+json" });

/** Checks a contact sent by a client. Returns the cleaned contact, or the problems in words. */
export function validateContact(input, partial = false) {
  const problems = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { problems: ["Send a JSON object."] };
  const out = {};
  for (const [key, max] of [["name", 120], ["email", 200], ["company", 120]]) {
    if (input[key] === undefined) {
      if (!partial && key !== "company") problems.push(key + " is required.");
      continue;
    }
    if (typeof input[key] !== "string" || !input[key].trim()) problems.push(key + " must be text.");
    else if (input[key].trim().length > max) problems.push(key + " must be " + max + " characters or fewer.");
    else out[key] = input[key].trim();
  }
  if (out.email && !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(out.email)) problems.push("email must look like an email address.");
  for (const key of Object.keys(input)) if (!["name", "email", "company"].includes(key)) problems.push(key + " isn't a field contacts have.");
  return problems.length ? { problems } : { value: out };
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
  } catch {
    throw Object.assign(new Error("bad json"), { status: 400 });
  }
}

const INDEX = "<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Contacts API (sample)</title>" +
  "<style>body{font:16px/1.6 system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1rem;color:#16201c}code{background:#eef3f0;padding:.1rem .35rem;border-radius:4px}li{margin:.4rem 0}</style>" +
  "<h1>Contacts API</h1><p>A REST API with sample data, kept in memory. Try these:</p><ul>" +
  "<li><code>GET /health</code></li><li><code>GET /api/contacts?limit=2</code></li><li><code>GET /api/contacts/c_1</code></li>" +
  "<li><code>POST /api/contacts</code> with a JSON body</li><li><code>PATCH /api/contacts/c_1</code></li><li><code>DELETE /api/contacts/c_1</code></li></ul>";

/** The request handler. The store is passed in, so tests get a fresh one. */
export function createApp(store, { now = () => Date.now() } = {}) {
  const hits = new Map();
  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const ip = req.socket.remoteAddress || "unknown";
    const t = now();
    const recent = (hits.get(ip) || []).filter((at) => t - at < WINDOW_MS);
    recent.push(t);
    hits.set(ip, recent);
    if (recent.length > PER_WINDOW) return problem(res, 429, "Too many requests", "Wait a minute, then try again.", { "retry-after": "60" });

    try {
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(INDEX);
      }
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });

      if (url.pathname === "/api/contacts") {
        if (req.method === "GET") {
          const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
          return json(res, 200, store.list({ limit, after: url.searchParams.get("cursor"), q: url.searchParams.get("q") }));
        }
        if (req.method === "POST") {
          const checked = validateContact(await readJson(req));
          if (checked.problems) return problem(res, 422, "The contact isn't valid", checked.problems.join(" "));
          const created = store.create(checked.value);
          return json(res, 201, created, { location: "/api/contacts/" + created.id });
        }
        return problem(res, 405, "Method not allowed", "Use GET or POST here.", { allow: "GET, POST" });
      }

      const one = url.pathname.match(/^\\/api\\/contacts\\/([A-Za-z0-9_-]{1,40})$/);
      if (one) {
        const found = store.get(one[1]);
        if (!found) return problem(res, 404, "Not found", "There's no contact " + one[1] + ".");
        if (req.method === "GET") return json(res, 200, found);
        if (req.method === "PATCH") {
          const checked = validateContact(await readJson(req), true);
          if (checked.problems) return problem(res, 422, "The change isn't valid", checked.problems.join(" "));
          return json(res, 200, store.update(one[1], checked.value));
        }
        if (req.method === "DELETE") {
          store.remove(one[1]);
          res.writeHead(204);
          return res.end();
        }
        return problem(res, 405, "Method not allowed", "Use GET, PATCH or DELETE here.", { allow: "GET, PATCH, DELETE" });
      }
      return problem(res, 404, "Not found", "Nothing lives at " + url.pathname + ". Start at /.");
    } catch (error) {
      if (error.status === 413) return problem(res, 413, "Too large", "Bodies are limited to 64 KB.");
      if (error.status === 400) return problem(res, 400, "Not JSON", "Send the body as JSON.");
      console.error(error);
      return problem(res, 500, "Something went wrong", "The server couldn't finish this request. Try again.");
    }
  };
}
`;

const STORE = `// Contacts in memory, with sample data. Replace this file to keep them in a database:
// the routes only call list, get, create, update and remove.
const SAMPLE = [
  { name: "Ama Mensah", email: "ama@example.com", company: "Harbour Lane Studio" },
  { name: "Ravi Perera", email: "ravi@example.com", company: "Lotus Bakes" },
  { name: "Lena Ortiz", email: "lena@example.com", company: "Northfield Clinic" },
];

export function createStore(seed = SAMPLE) {
  const rows = new Map();
  let next = 1;
  const create = (input) => {
    const id = "c_" + next++;
    const row = { id, name: input.name, email: input.email, company: input.company ?? null, createdAt: new Date().toISOString() };
    rows.set(id, row);
    return row;
  };
  for (const s of seed) create(s);
  return {
    list({ limit, after, q }) {
      const all = [...rows.values()].filter((r) => !q || (r.name + " " + r.company).toLowerCase().includes(q.toLowerCase()));
      const start = after ? all.findIndex((r) => r.id === after) + 1 : 0;
      const page = all.slice(start, start + limit);
      const more = start + limit < all.length;
      return { data: page, next: more ? page[page.length - 1].id : null };
    },
    get: (id) => rows.get(id) ?? null,
    create,
    update(id, change) {
      const row = { ...rows.get(id), ...change };
      rows.set(id, row);
      return row;
    },
    remove: (id) => rows.delete(id),
  };
}
`;

const TEST = `// Starts the API on a free port and calls it, the way a client would.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp, validateContact } from "../src/app.js";
import { createStore } from "../src/store.js";

let server;
let base;
before(async () => {
  server = createServer(createApp(createStore()));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});
after(() => server.close());

const call = (path, init = {}) => fetch(base + path, { ...init, headers: { "content-type": "application/json", ...init.headers } });

describe("contacts API (sample data)", () => {
  it("is healthy", async () => {
    assert.deepEqual(await (await call("/health")).json(), { ok: true });
  });

  it("lists contacts a page at a time", async () => {
    const first = await (await call("/api/contacts?limit=2")).json();
    assert.equal(first.data.length, 2);
    const second = await (await call("/api/contacts?limit=2&cursor=" + first.next)).json();
    assert.equal(second.data[0].id, "c_3");
    assert.equal(second.next, null);
  });

  it("creates, changes and removes a contact", async () => {
    const created = await call("/api/contacts", { method: "POST", body: JSON.stringify({ name: "Kofi Boateng", email: "kofi@example.com" }) });
    assert.equal(created.status, 201);
    const { id } = await created.json();
    assert.equal(created.headers.get("location"), "/api/contacts/" + id);
    const changed = await (await call("/api/contacts/" + id, { method: "PATCH", body: JSON.stringify({ company: "Akwaaba Tours" }) })).json();
    assert.equal(changed.company, "Akwaaba Tours");
    assert.equal((await call("/api/contacts/" + id, { method: "DELETE" })).status, 204);
    assert.equal((await call("/api/contacts/" + id)).status, 404);
  });

  it("refuses what isn't valid, with a problem that says why", async () => {
    const r = await call("/api/contacts", { method: "POST", body: JSON.stringify({ name: "", email: "nope", role: "admin" }) });
    assert.equal(r.status, 422);
    assert.equal(r.headers.get("content-type"), "application/problem+json");
    const body = await r.json();
    assert.match(body.detail, /name must be text/);
    assert.match(body.detail, /role isn't a field/);
    assert.equal((await call("/api/contacts", { method: "POST", body: "{oops" })).status, 400);
    assert.equal((await call("/api/contacts", { method: "PUT" })).status, 405);
  });

  it("checks contacts without a server too", () => {
    assert.deepEqual(validateContact({ name: " Ama ", email: "ama@example.com" }), { value: { name: "Ama", email: "ama@example.com" } });
    assert.ok(validateContact([]).problems);
  });
});
`;

const README = `# Contacts API

A small REST API for contacts, in plain Node.js 22 with no dependencies. It's sample data, kept in memory: it resets when the server restarts.

## Run it

- \`npm run dev\` starts it on port 3000 and restarts on changes.
- \`npm test\` starts it on a free port and calls every route.
- \`npm start\` runs it without watching.

## Routes

| Method | Path | What it does |
| --- | --- | --- |
| GET | \`/health\` | \`{ "ok": true }\` |
| GET | \`/api/contacts?limit=20&cursor=c_2&q=lotus\` | A page of contacts; \`next\` is the cursor for the next page |
| POST | \`/api/contacts\` | Creates one from \`{ name, email, company? }\`; 201 with a Location header |
| GET | \`/api/contacts/{id}\` | One contact |
| PATCH | \`/api/contacts/{id}\` | Changes the fields you send |
| DELETE | \`/api/contacts/{id}\` | Removes it; 204 |

Errors are JSON problems (RFC 9457): \`{ "status", "title", "detail" }\`. Bodies are limited to 64 KB, and each address to 120 requests a minute.

## Keeping the data

Replace \`src/store.js\` with one backed by a database. The routes only call \`list\`, \`get\`, \`create\`, \`update\` and \`remove\`, so nothing else changes. Keep the database's address in an environment variable, never in the code.
`;

const DESIGN = `# DESIGN.md

The API's design plan isn't written yet. A REST API's design is its contract with the clients that call it.

## Palette

Not used: this project has no screens. The index page at / uses system colours only.

## Type

Responses are JSON. Field names are camelCase and stay stable once clients use them.

## Layout

Resources live under /api, one plural noun each. Pages use \`limit\` and \`cursor\`.

## Signature

Every error explains itself: a status, a title and what to do next.

## Motion

None.
`;

export const REST_API_FILES: StarterFile[] = [
  { path: "package.json", content: PACKAGE },
  { path: "src/server.js", content: SERVER },
  { path: "src/app.js", content: APP },
  { path: "src/store.js", content: STORE },
  { path: "test/api.test.js", content: TEST },
  { path: "README.md", content: README },
  { path: "DESIGN.md", content: DESIGN },
];
