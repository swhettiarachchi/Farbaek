// Where the data lives: one JSON file, written whole to a temporary file and
// renamed over the old one, so a crash never leaves half a file. Writes run
// one after another. Swap this module for a database when you outgrow it:
// the app only calls the functions returned here.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const EMPTY = () => ({ users: [], sessions: [], notes: [], resets: [] });

export async function createStore(dir) {
  await mkdir(dir, { recursive: true });
  const file = join(dir, "fieldnote.json");
  let data = EMPTY();
  try {
    data = { ...EMPTY(), ...JSON.parse(await readFile(file, "utf8")) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  let queue = Promise.resolve();
  function save() {
    const snapshot = JSON.stringify(data);
    queue = queue.then(async () => {
      const temp = file + "." + process.pid + ".tmp";
      await writeFile(temp, snapshot, { mode: 0o600 });
      await rename(temp, file);
    });
    return queue;
  }

  const now = () => Date.now();
  const live = (s) => s.expiresAt > now();

  return {
    file,

    findUserByEmail: (email) => data.users.find((u) => u.email === email) ?? null,
    findUser: (id) => data.users.find((u) => u.id === id) ?? null,
    async createUser({ email, name, passwordHash }) {
      const user = { id: randomUUID(), email, name, passwordHash, createdAt: new Date().toISOString() };
      data.users.push(user);
      await save();
      return user;
    },
    async setPassword(userId, passwordHash) {
      const user = data.users.find((u) => u.id === userId);
      if (!user) return false;
      user.passwordHash = passwordHash;
      await save();
      return true;
    },
    async deleteUser(userId) {
      data.users = data.users.filter((u) => u.id !== userId);
      data.sessions = data.sessions.filter((s) => s.userId !== userId);
      data.notes = data.notes.filter((n) => n.userId !== userId);
      data.resets = data.resets.filter((r) => r.userId !== userId);
      await save();
    },

    async addSession(session) {
      data.sessions = data.sessions.filter(live);
      data.sessions.push(session);
      await save();
    },
    findSession: (hash) => data.sessions.find((s) => s.hash === hash && live(s)) ?? null,
    async removeSession(hash) {
      data.sessions = data.sessions.filter((s) => s.hash !== hash);
      await save();
    },
    async removeSessionsFor(userId) {
      data.sessions = data.sessions.filter((s) => s.userId !== userId);
      await save();
    },

    notesFor: (userId) => data.notes.filter((n) => n.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    async addNote(userId, text) {
      const note = { id: randomUUID(), userId, text, createdAt: new Date().toISOString() };
      data.notes.push(note);
      await save();
      return note;
    },
    // Only the note's own author can delete it: the id alone is never enough.
    async deleteNote(userId, noteId) {
      const before = data.notes.length;
      data.notes = data.notes.filter((n) => !(n.id === noteId && n.userId === userId));
      if (data.notes.length === before) return false;
      await save();
      return true;
    },

    async addReset(reset) {
      data.resets = data.resets.filter((r) => r.expiresAt > now() && r.userId !== reset.userId);
      data.resets.push(reset);
      await save();
    },
    // A reset link works once, before it expires.
    async takeReset(hash) {
      const reset = data.resets.find((r) => r.hash === hash);
      if (!reset) return null;
      data.resets = data.resets.filter((r) => r !== reset);
      await save();
      return reset.expiresAt > now() ? reset : null;
    },
  };
}
