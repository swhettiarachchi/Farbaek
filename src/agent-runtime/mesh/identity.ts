/**
 * Who this device is to Mesh, and which devices it trusts. The device key is
 * a long-term X25519 key pair made on first use; its private half is kept by
 * a vault (the system keychain in the desktop app) and never leaves the main
 * process. Trusted devices are stored by public key, with the name they gave
 * when the person paired them, in a plain JSON file: nothing in it is secret.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { fingerprint, generateKeyPair, keyPairFromPrivate, sameKey, type KeyPair } from "./noise";

/** Where the device key's private half lives. */
export interface KeyVault {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
}

/** The device key, made and stored on first use. */
export async function loadDeviceKey(vault: KeyVault): Promise<KeyPair> {
  const stored = await vault.get();
  if (stored && /^[0-9a-f]{64}$/.test(stored)) return keyPairFromPrivate(Buffer.from(stored, "hex"));
  const key = generateKeyPair();
  await vault.set(key.privateKey.toString("hex"));
  return key;
}

const TrustedSchema = z.object({
  fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
  name: z.string().min(1).max(60),
  publicKey: z.string().regex(/^[0-9a-f]{64}$/),
  pairedAt: z.string(),
});
export type TrustedDevice = z.infer<typeof TrustedSchema>;

export class TrustStore {
  private devices: TrustedDevice[] = [];

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      const parsed = z.array(TrustedSchema).safeParse(JSON.parse(await fs.readFile(this.file, "utf8")));
      this.devices = parsed.success ? parsed.data : [];
    } catch {
      this.devices = [];
    }
  }

  list(): TrustedDevice[] {
    return [...this.devices];
  }

  /** The trusted device with this public key, if any. */
  find(publicKey: Uint8Array): TrustedDevice | null {
    return this.devices.find((d) => sameKey(Buffer.from(d.publicKey, "hex"), publicKey)) ?? null;
  }

  byFingerprint(value: string): TrustedDevice | null {
    return this.devices.find((d) => d.fingerprint === value) ?? null;
  }

  async add(publicKey: Uint8Array, name: string, now = new Date()): Promise<TrustedDevice> {
    const device: TrustedDevice = { fingerprint: fingerprint(publicKey), name: name.slice(0, 60), publicKey: Buffer.from(publicKey).toString("hex"), pairedAt: now.toISOString() };
    this.devices = [...this.devices.filter((d) => d.fingerprint !== device.fingerprint), device];
    await this.save();
    return device;
  }

  /** Forgets a device: it can no longer send to or receive from this one until paired again. */
  async forget(value: string): Promise<boolean> {
    const before = this.devices.length;
    this.devices = this.devices.filter((d) => d.fingerprint !== value);
    if (this.devices.length === before) return false;
    await this.save();
    return true;
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(`${this.file}.tmp`, JSON.stringify(this.devices, null, 2), "utf8");
    await fs.rename(`${this.file}.tmp`, this.file);
  }
}
