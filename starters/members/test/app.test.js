// Starts the app on a free port with its own data folder and uses it like a browser would.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { createStore } from "../src/store.js";

let base = "";
let server;
let dir = "";
const resetLinks = [];

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "fieldnote-"));
  const store = await createStore(dir);
  server = createServer(createApp({ store, sendResetLink: (email, path) => resetLinks.push({ email, path }) }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

/** A browser with its own cookies. */
function browser() {
  const jar = new Map();
  async function go(path, { method = "GET", form } = {}) {
    const headers = { cookie: [...jar].map(([k, v]) => k + "=" + v).join("; ") };
    if (form) headers["content-type"] = "application/x-www-form-urlencoded";
    const res = await fetch(base + path, { method, headers, body: form ? new URLSearchParams(form).toString() : undefined, redirect: "manual" });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const value = pair.slice(i + 1);
      if (value === "") jar.delete(pair.slice(0, i));
      else jar.set(pair.slice(0, i), value);
    }
    return { status: res.status, location: res.headers.get("location"), html: await res.text(), headers: res.headers };
  }
  const token = (html) => html.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? "";
  return {
    go,
    token,
    async signUp(email, password = "correct horse battery", name = "Ama") {
      const page = await go("/sign-up");
      return go("/sign-up", { method: "POST", form: { _csrf: token(page.html), name, email, password } });
    },
    async signIn(email, password) {
      const page = await go("/sign-in");
      return go("/sign-in", { method: "POST", form: { _csrf: token(page.html), email, password } });
    },
    async addNote(text) {
      const page = await go("/app");
      return go("/app/notes", { method: "POST", form: { _csrf: token(page.html), text } });
    },
  };
}

test("answers its health check and serves its own security headers", async () => {
  const res = await fetch(base + "/health");
  assert.deepEqual(await res.json(), { ok: true });
  const page = await fetch(base + "/");
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
});

test("signs up, keeps the person signed in, and never stores the password", async () => {
  const a = browser();
  const created = await a.signUp("ama@example.com");
  assert.equal(created.status, 303);
  assert.equal(created.location, "/app");
  const notes = await a.go("/app");
  assert.equal(notes.status, 200);
  assert.match(notes.html, /Signed in as ama@example\.com/);
  const saved = await readFile(join(dir, "fieldnote.json"), "utf8");
  assert.doesNotMatch(saved, /correct horse battery/);
  assert.match(saved, /scrypt\$16384/);
});

test("refuses a form without its token, and a form from another site", async () => {
  const a = browser();
  await a.signUp("kofi@example.com");
  const missing = await a.go("/app/notes", { method: "POST", form: { text: "planted" } });
  assert.equal(missing.status, 403);
  const page = await a.go("/app");
  const res = await fetch(base + "/app/notes", {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded", cookie: "" },
    body: new URLSearchParams({ _csrf: a.token(page.html), text: "x" }).toString(),
    redirect: "manual",
  });
  assert.equal(res.status, 403);
});

test("gives the same answer for a wrong password and an unknown email, then stops guesses", async () => {
  const a = browser();
  await a.signUp("lena@example.com");
  const b = browser();
  const wrong = await b.signIn("lena@example.com", "not the password at all");
  const unknown = await b.signIn("nobody@example.com", "not the password at all");
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.match(wrong.html, /don&#39;t match an account/);
  assert.match(unknown.html, /don&#39;t match an account/);
  let last;
  for (let i = 0; i < 10; i += 1) last = await b.signIn("lena@example.com", "still wrong guess " + i);
  assert.equal(last.status, 429);
});

test("keeps each person's notes to themselves", async () => {
  const a = browser();
  await a.signUp("owner@example.com");
  await a.addNote("Only mine: <script>alert(1)</script>");
  const mine = await a.go("/app");
  assert.match(mine.html, /Only mine: &lt;script&gt;/);
  const id = mine.html.match(/\/app\/notes\/([0-9a-f-]{36})\/delete/)[1];

  const b = browser();
  await b.signUp("other@example.com");
  const theirs = await b.go("/app");
  assert.doesNotMatch(theirs.html, /Only mine/);
  const steal = await b.go("/app/notes/" + id + "/delete", { method: "POST", form: { _csrf: b.token(theirs.html) } });
  assert.equal(steal.status, 404);
  assert.match((await a.go("/app")).html, /Only mine/);
});

test("resets a password with a one-time link and signs out every old session", async () => {
  const a = browser();
  await a.signUp("reset@example.com", "the first long password");
  const page = await a.go("/reset");
  const unknown = await a.go("/reset", { method: "POST", form: { _csrf: a.token(page.html), email: "ghost@example.com" } });
  assert.match(unknown.html, /If that email has an account/);
  await a.go("/reset", { method: "POST", form: { _csrf: a.token(page.html), email: "reset@example.com" } });
  const link = resetLinks.find((l) => l.email === "reset@example.com").path;

  const b = browser();
  const form = await b.go(link);
  const done = await b.go(link, { method: "POST", form: { _csrf: b.token(form.html), password: "a brand new long password" } });
  assert.equal(done.status, 303);
  // The old session was signed out, and the link doesn't work twice.
  assert.equal((await a.go("/app")).status, 303);
  const again = await b.go(link, { method: "POST", form: { _csrf: b.token(form.html), password: "another long password!" } });
  assert.match(again.html, /expired or was already used/);
  assert.equal((await browser().signIn("reset@example.com", "a brand new long password")).status, 303);
});

test("signs out, and deletes an account with all its notes", async () => {
  const a = browser();
  await a.signUp("leaving@example.com", "a long goodbye password");
  await a.addNote("Soon gone");
  const account = await a.go("/account");
  const deleted = await a.go("/account/delete", { method: "POST", form: { _csrf: a.token(account.html), password: "a long goodbye password" } });
  assert.equal(deleted.location, "/sign-in?done=deleted");
  assert.equal((await a.go("/app")).status, 303);
  const saved = await readFile(join(dir, "fieldnote.json"), "utf8");
  assert.doesNotMatch(saved, /Soon gone|leaving@example\.com/);
});
