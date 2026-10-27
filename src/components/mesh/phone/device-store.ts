/**
 * This browser as a Mesh device (ADR 0096), kept in IndexedDB: its X25519
 * key pair, with the private half a non-extractable CryptoKey that can't be
 * read out of the browser, a random device id, the name the person gives
 * it, and the computers it paired with. Clearing the site's data forgets it
 * all; the browser then pairs again as a new device.
 */
import { generateWebKeyPair, webFingerprint, type WebKeyPair } from "@/core/mesh/web/noise";

const DB = "farbaek-mesh";
const VERSION = 1;

export interface BrowserDevice {
  id: string;
  name: string;
  key: WebKeyPair;
  fingerprint: string;
}

export interface StoredComputer {
  fingerprint: string;
  name: string;
  publicKey: Uint8Array;
  pairedAt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("device");
      req.result.createObjectStore("computers", { keyPath: "fingerprint" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("This browser's storage isn't available."));
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("This browser's storage refused the change."));
    });
  } finally {
    db.close();
  }
}

/** This browser's device, made on first use. */
export async function loadDevice(defaultName: string): Promise<BrowserDevice> {
  const stored = await run<{ id: string; name: string; key: WebKeyPair } | undefined>("device", "readonly", (s) => s.get("self"));
  if (stored) return { ...stored, fingerprint: await webFingerprint(stored.key.publicKey) };
  const fresh = { id: globalThis.crypto.randomUUID(), name: defaultName.slice(0, 60), key: await generateWebKeyPair(false) };
  await run("device", "readwrite", (s) => s.put(fresh, "self"));
  return { ...fresh, fingerprint: await webFingerprint(fresh.key.publicKey) };
}

export async function renameDevice(device: BrowserDevice, name: string): Promise<BrowserDevice> {
  const next = { id: device.id, name: name.trim().slice(0, 60) || device.name, key: device.key };
  await run("device", "readwrite", (s) => s.put(next, "self"));
  return { ...device, name: next.name };
}

export function listComputers(): Promise<StoredComputer[]> {
  return run<StoredComputer[]>("computers", "readonly", (s) => s.getAll());
}

export async function saveComputer(computer: Omit<StoredComputer, "pairedAt">): Promise<void> {
  await run("computers", "readwrite", (s) => s.put({ ...computer, pairedAt: new Date().toISOString() }));
}

export async function forgetComputer(fingerprint: string): Promise<void> {
  await run("computers", "readwrite", (s) => s.delete(fingerprint));
}
