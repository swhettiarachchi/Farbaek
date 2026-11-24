/**
 * Files kept in this browser while a run needs them (stage 250, ADR 0258): what the surveyor chose on the start screen until the plan
 * is generated, and sketch photos until their read is saved, so a refresh or a dropped connection loses nothing.
 *
 * - **Whose:** each key carries the workspace and the signed-in person's id. On every signed-in page, entries of any other account are
 *   removed (`keepOnly`, beside the device store's own claim, ADR 0192), and signing out removes them all (`forgetAll`).
 * - **How long:** a week. Every time the store is opened, anything older is removed, whatever its key.
 * - **When storage fails:** a private window, cleared or blocked site data, a full disk or a browser that never answers (each call
 *   gives up after 1.5 s) keeps nothing and breaks nothing. A read says whether nothing was kept or it couldn't look, so a failed look
 *   never counts as "nothing kept".
 */

const NAME = "farbaek-autosurvey";
const STORE = "staged";
/** How long anything is kept: a week, then it's removed. */
export const STAGED_MS = 7 * 24 * 3_600_000;
/** How long a call waits for the browser's storage before giving up. */
const WAIT_MS = 1_500;

export interface Staged<T> {
  /** When it was kept, in milliseconds since 1970 on this device. */
  at: number;
  value: T;
}

/** What a look found: something kept, nothing kept, or storage that couldn't be read. */
export type Look<T> = { status: "found"; at: number; value: T } | { status: "none" } | { status: "failed" };

const within = <T>(p: Promise<T>, fallback: T): Promise<T> => Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), WAIT_MS))]);

const fresh = (e: unknown, now: number): boolean => {
  const at = (e as Partial<Staged<unknown>> | null)?.at;
  return typeof at === "number" && Number.isFinite(at) && now - at <= STAGED_MS && at <= now + 3_600_000;
};

let swept = false;

function open(): Promise<IDBDatabase | null> {
  return within(
    new Promise<IDBDatabase | null>((resolve) => {
      try {
        if (typeof indexedDB === "undefined") return resolve(null);
        const r = indexedDB.open(NAME, 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
        };
        r.onsuccess = () => {
          const db = r.result;
          // Once a page: anything older than a week goes, whatever it is and whoever kept it.
          if (!swept) {
            swept = true;
            try {
              const tx = db.transaction(STORE, "readwrite");
              const cur = tx.objectStore(STORE).openCursor();
              const now = Date.now();
              cur.onsuccess = () => {
                const c = cur.result;
                if (!c) return;
                if (!fresh(c.value, now)) c.delete();
                c.continue();
              };
            } catch {
              // Nothing swept this time; the next page tries again.
              swept = false;
            }
          }
          resolve(db);
        };
        r.onerror = () => resolve(null);
        r.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }),
    null,
  );
}

/** One request in its own transaction; null when storage is missing, the request fails, or the browser doesn't answer in time. */
async function run<T>(mode: IDBTransactionMode, make: (store: IDBObjectStore) => IDBRequest<T>): Promise<{ result: T } | null> {
  const db = await open();
  if (!db) return null;
  return within(
    new Promise<{ result: T } | null>((resolve) => {
      try {
        const tx = db.transaction(STORE, mode);
        const req = make(tx.objectStore(STORE));
        tx.oncomplete = () => resolve({ result: req.result });
        tx.onerror = tx.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    }),
    null,
  ).finally(() => db.close());
}

/** Keeps a value under a key, replacing what was there. False when it couldn't be kept (in time). */
export async function stage(key: string, value: unknown): Promise<boolean> {
  const entry: Staged<unknown> = { at: Date.now(), value };
  return (await run("readwrite", (s) => s.put(entry, key))) !== null;
}

/** What's kept under a key; an entry older than a week, or not one this code wrote, is removed and counts as nothing kept. */
export async function staged<T>(key: string): Promise<Look<T>> {
  const got = await run("readonly", (s) => s.get(key) as IDBRequest<unknown>);
  if (!got) return { status: "failed" };
  const e = got.result;
  if (e === undefined || e === null) return { status: "none" };
  if (typeof e !== "object" || !fresh(e, Date.now())) {
    await unstage(key);
    return { status: "none" };
  }
  const s = e as Staged<T>;
  return { status: "found", at: s.at, value: s.value };
}

/** Removes what's kept under a key. */
export async function unstage(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key));
}

/** On a signed-in page: removes everything another account kept in this browser. */
export async function keepOnly(userId: string): Promise<void> {
  const keys = await run("readonly", (s) => s.getAllKeys());
  if (!keys) return;
  for (const k of keys.result) if (typeof k !== "string" || !k.split(":").includes(userId)) await run("readwrite", (s) => s.delete(k));
}

/** Signing out: everything kept here goes. */
export async function forgetAll(): Promise<void> {
  await run("readwrite", (s) => s.clear());
}

/** The key for what one person chose on the start screen of one workspace. */
export const startKey = (orgId: string, userId: string) => `start:${orgId}:${userId}`;
/** The key for one person's sketch photos waiting to be read into one project of one workspace. */
export const sketchesKey = (orgId: string, userId: string, projectId: string) => `sketches:${orgId}:${userId}:${projectId}`;
