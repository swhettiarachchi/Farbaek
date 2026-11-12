// The routes. Pages are rendered on the server; every change is a form POST
// that carries a token proving it came from this site. Sessions are a
// random token in an HttpOnly cookie, kept on the server only as a hash.
import { readFile } from "node:fs/promises";
import { DECOY_HASH, createLimiter, hashPassword, newToken, normalizeEmail, passwordProblem, sameText, sha256, verifyPassword } from "./auth.js";
import * as view from "./views.js";

const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const RESET_MS = 30 * 60 * 1000;
const MAX_BODY = 16 * 1024;
const NOTE_MAX = 2000;
const STYLES = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

/** Until an email service is connected, reset links go to the server's log. Swap this for your email provider. */
function logResetLink(email, path) {
  console.log("Password reset for " + email + ": open " + path + " on this site. It works once, for 30 minutes.");
}

export function createApp({ store, sendResetLink = logResetLink }) {
  const limits = {
    signInByAddress: createLimiter(20, 15 * 60_000),
    signInByEmail: createLimiter(10, 15 * 60_000),
    signUp: createLimiter(10, 60 * 60_000),
    reset: createLimiter(5, 60 * 60_000),
    writes: createLimiter(120, 60_000),
  };

  return async function handle(req, res) {
    try {
      await route(req, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) send(res, 500, view.refused("Something went wrong on the server. Nothing was changed. Try again."));
      else res.end();
    }
  };

  async function route(req, res) {
    const url = new URL(req.url, "http://local");
    const path = url.pathname;
    const method = req.method;

    if (path === "/health") return json(res, 200, { ok: true });
    if (path === "/styles.css") {
      res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" });
      return res.end(STYLES);
    }

    // A change must come from this site's own pages.
    if (method === "POST" && !sameOrigin(req)) return send(res, 403, view.refused("That form didn't come from this site."));
    const session = currentSession(req);
    const user = session ? store.findUser(session.userId) : null;
    const form = method === "POST" ? await readForm(req, res) : null;
    if (method === "POST" && form === null) return;

    // Signed-out forms carry a token that matches a cookie set with the page (double submit).
    const pre = cookies(req).pre || null;
    const preToken = () => pre || setPreToken(req, res);
    const preOk = () => Boolean(pre) && sameText(form?._csrf ?? "", pre);
    // Signed-in forms carry the session's own token.
    const csrfOk = () => Boolean(session) && sameText(form?._csrf ?? "", session.csrf);

    if (method === "GET" && path === "/") return user ? redirect(res, "/app") : send(res, 200, view.home());

    if (path === "/sign-up") {
      if (user) return redirect(res, "/app");
      if (method === "GET") return send(res, 200, view.signUp({ csrf: preToken() }));
      if (!preOk()) return send(res, 403, view.refused("This form expired. Go back, reload the page and try again."));
      if (!limits.signUp(address(req))) return send(res, 429, view.signUp({ csrf: preToken(), error: "Too many new accounts from your network. Try again in an hour.", values: form }));
      const name = String(form.name ?? "").trim().slice(0, 80);
      const email = normalizeEmail(form.email);
      const problem = !name ? "Tell us your name." : !email ? "That email address doesn't look right." : passwordProblem(form.password);
      if (problem) return send(res, 400, view.signUp({ csrf: preToken(), error: problem, values: { name, email: form.email } }));
      if (store.findUserByEmail(email)) return send(res, 409, view.signUp({ csrf: preToken(), error: "That email already has an account. Sign in, or reset its password.", values: { name, email } }));
      const created = await store.createUser({ email, name, passwordHash: await hashPassword(form.password) });
      await startSession(req, res, created.id);
      return redirect(res, "/app");
    }

    if (path === "/sign-in") {
      if (user) return redirect(res, "/app");
      if (method === "GET") return send(res, 200, view.signIn({ csrf: preToken(), message: url.searchParams.get("done") === "deleted" ? "Your account and its notes were deleted." : null }));
      if (!preOk()) return send(res, 403, view.refused("This form expired. Go back, reload the page and try again."));
      const email = normalizeEmail(form.email);
      if (!limits.signInByAddress(address(req)) || (email && !limits.signInByEmail(email))) {
        return send(res, 429, view.signIn({ csrf: preToken(), error: "Too many tries. Wait 15 minutes, then try again.", values: { email: form.email } }));
      }
      const found = email ? store.findUserByEmail(email) : null;
      // The same work whether or not the email has an account, so the answer's timing gives nothing away.
      const valid = await verifyPassword(String(form.password ?? ""), found ? found.passwordHash : DECOY_HASH);
      if (!found || !valid) return send(res, 401, view.signIn({ csrf: preToken(), error: "That email and password don't match an account.", values: { email: form.email } }));
      await startSession(req, res, found.id);
      return redirect(res, "/app");
    }

    if (path === "/reset") {
      if (method === "GET") return send(res, 200, view.resetRequest({ csrf: preToken() }));
      if (!preOk()) return send(res, 403, view.refused("This form expired. Go back, reload the page and try again."));
      if (!limits.reset(address(req))) return send(res, 429, view.resetRequest({ csrf: preToken(), error: "Too many reset requests from your network. Try again in an hour." }));
      const email = normalizeEmail(form.email);
      const found = email ? store.findUserByEmail(email) : null;
      if (found) {
        const token = newToken();
        await store.addReset({ hash: sha256(token), userId: found.id, expiresAt: Date.now() + RESET_MS });
        await sendResetLink(found.email, "/reset/" + token);
      }
      // The same answer either way, so the page doesn't say who has an account.
      return send(res, 200, view.resetRequest({ sent: true }));
    }

    const reset = path.match(/^\/reset\/([A-Za-z0-9_-]{43})$/);
    if (reset) {
      const token = reset[1];
      if (method === "GET") return send(res, 200, view.resetForm({ csrf: preToken(), token }));
      if (!preOk()) return send(res, 403, view.refused("This form expired. Go back, reload the page and try again."));
      const problem = passwordProblem(form.password);
      if (problem) return send(res, 400, view.resetForm({ csrf: preToken(), token, error: problem }));
      const taken = await store.takeReset(sha256(token));
      if (!taken || !store.findUser(taken.userId)) return send(res, 400, view.resetForm({ csrf: preToken(), token, error: "This link has expired or was already used. Ask for a new one." }));
      await store.setPassword(taken.userId, await hashPassword(form.password));
      await store.removeSessionsFor(taken.userId);
      await startSession(req, res, taken.userId);
      return redirect(res, "/app");
    }

    // Everything below is for signed-in people only.
    if (!user) {
      if (path === "/app" || path.startsWith("/app/") || path === "/account" || path.startsWith("/account/") || path === "/sign-out") return redirect(res, "/sign-in");
      return send(res, 404, view.notFound(null, null));
    }
    if (method === "POST" && !csrfOk()) return send(res, 403, view.refused("This form expired. Go back, reload the page and try again."));
    if (method === "POST" && !limits.writes(user.id)) return send(res, 429, view.refused("Too many changes in a minute. Wait a moment, then try again."));

    if (path === "/sign-out" && method === "POST") {
      await store.removeSession(session.hash);
      clearSession(req, res);
      return redirect(res, "/");
    }

    if (path === "/app" && method === "GET") return send(res, 200, view.notes({ user, csrf: session.csrf, list: store.notesFor(user.id) }));

    if (path === "/app/notes" && method === "POST") {
      const text = String(form.text ?? "").trim();
      if (!text || text.length > NOTE_MAX) {
        return send(res, 400, view.notes({ user, csrf: session.csrf, list: store.notesFor(user.id), error: "Write between 1 and " + NOTE_MAX + " characters." }));
      }
      await store.addNote(user.id, text);
      return redirect(res, "/app");
    }

    const del = path.match(/^\/app\/notes\/([0-9a-f-]{36})\/delete$/);
    if (del && method === "POST") {
      const deleted = await store.deleteNote(user.id, del[1]);
      return deleted ? redirect(res, "/app") : send(res, 404, view.notFound(user, session.csrf));
    }

    if (path === "/account" && method === "GET") return send(res, 200, view.account({ user, csrf: session.csrf, message: url.searchParams.get("done") === "password" ? "Password changed. Every other device was signed out." : null }));

    if (path === "/account/password" && method === "POST") {
      if (!(await verifyPassword(String(form.current ?? ""), user.passwordHash))) return send(res, 400, view.account({ user, csrf: session.csrf, error: "Your current password isn't right." }));
      const problem = passwordProblem(form.password);
      if (problem) return send(res, 400, view.account({ user, csrf: session.csrf, error: problem }));
      await store.setPassword(user.id, await hashPassword(form.password));
      await store.removeSessionsFor(user.id);
      await startSession(req, res, user.id);
      return redirect(res, "/account?done=password");
    }

    if (path === "/account/delete" && method === "POST") {
      if (!(await verifyPassword(String(form.password ?? ""), user.passwordHash))) return send(res, 400, view.account({ user, csrf: session.csrf, error: "That password isn't right, so nothing was deleted." }));
      await store.deleteUser(user.id);
      clearSession(req, res);
      return redirect(res, "/sign-in?done=deleted");
    }

    return send(res, 404, view.notFound(user, session.csrf));
  }

  function currentSession(req) {
    const sid = cookies(req).sid;
    return sid && /^[A-Za-z0-9_-]{43}$/.test(sid) ? store.findSession(sha256(sid)) : null;
  }

  async function startSession(req, res, userId) {
    const sid = newToken();
    await store.addSession({ hash: sha256(sid), userId, csrf: newToken(), expiresAt: Date.now() + SESSION_MS });
    setCookie(req, res, "sid", sid, { maxAge: SESSION_MS / 1000 });
  }

  function clearSession(req, res) {
    setCookie(req, res, "sid", "", { maxAge: 0 });
  }

  function setPreToken(req, res) {
    const token = newToken();
    setCookie(req, res, "pre", token, { maxAge: 60 * 60, sameSite: "Strict" });
    return token;
  }
}

// ----------------------------------------------------------------- helpers

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Secure cookies when the request arrived over https, directly or through the host's proxy. */
function secure(req) {
  return process.env.COOKIE_SECURE === "1" || req.headers["x-forwarded-proto"] === "https" || Boolean(req.socket?.encrypted);
}

function setCookie(req, res, name, value, { maxAge, sameSite = "Lax" }) {
  const cookie = name + "=" + encodeURIComponent(value) + "; Path=/; HttpOnly; SameSite=" + sameSite + "; Max-Age=" + Math.floor(maxAge) + (secure(req) ? "; Secure" : "");
  const existing = res.getHeader("set-cookie");
  res.setHeader("set-cookie", existing ? [].concat(existing, cookie) : [cookie]);
}

/** The client's network address. Behind a host's proxy, set TRUST_PROXY=1 so the first forwarded address is used. */
function address(req) {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress ?? "unknown";
}

/** A POST is accepted only from this site's own pages, when the browser says where it came from. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readForm(req, res) {
  const type = String(req.headers["content-type"] ?? "");
  if (!type.startsWith("application/x-www-form-urlencoded")) {
    send(res, 415, view.refused("Send the form as it is on the page."));
    return null;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      send(res, 413, view.refused("That form was too large."));
      return null;
    }
    chunks.push(chunk);
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
}

function send(res, status, html) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...SECURITY_HEADERS });
  res.end(html);
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function redirect(res, location) {
  res.writeHead(303, { location, "cache-control": "no-store", ...SECURITY_HEADERS });
  res.end();
}
