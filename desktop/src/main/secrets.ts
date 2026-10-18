/**
 * Secrets on this computer: the agent token and the person's model keys.
 * Each one is encrypted with Electron's safeStorage, which uses the system
 * keychain (DPAPI on Windows, Keychain on macOS, libsecret or KWallet on
 * Linux), and written to its own file in the app's data folder. When the
 * system can't encrypt (for example Linux with no keyring, where safeStorage
 * falls back to plain text), nothing secret is stored at all.
 *
 * Secret values never leave the main process: the window only learns whether
 * a key is set.
 */
import { safeStorage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

export type SecretName = "agent-token" | "key-anthropic" | "key-gemini";

export class SecretStore {
  constructor(private readonly dir: string) {}

  /** Whether secrets can be stored, and why not when they can't. */
  availability(): { available: boolean; reason: string | null } {
    if (!safeStorage.isEncryptionAvailable()) return { available: false, reason: "This computer's keychain isn't available, so keys and the agent token can't be stored safely." };
    if (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text") {
      return { available: false, reason: "No keyring is running (GNOME Keyring or KWallet), so keys can't be stored safely. Start one and reopen the app." };
    }
    return { available: true, reason: null };
  }

  private file(name: SecretName) {
    return path.join(this.dir, `${name}.bin`);
  }

  async set(name: SecretName, value: string): Promise<void> {
    const a = this.availability();
    if (!a.available) throw new Error(a.reason ?? "Secrets can't be stored on this computer.");
    await fs.mkdir(this.dir, { recursive: true });
    const file = this.file(name);
    await fs.writeFile(`${file}.tmp`, safeStorage.encryptString(value), { mode: 0o600 });
    await fs.rename(`${file}.tmp`, file);
  }

  async get(name: SecretName): Promise<string | null> {
    if (!this.availability().available) return null;
    try {
      return safeStorage.decryptString(await fs.readFile(this.file(name)));
    } catch {
      return null;
    }
  }

  async has(name: SecretName): Promise<boolean> {
    try {
      await fs.access(this.file(name));
      return true;
    } catch {
      return false;
    }
  }

  async delete(name: SecretName): Promise<void> {
    await fs.rm(this.file(name), { force: true });
  }
}
