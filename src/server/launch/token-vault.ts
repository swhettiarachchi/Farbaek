/**
 * Provider tokens at rest (ADR 0078): AES-256-GCM, each sealed with its
 * workspace and provider as associated data, so a sealed token copied to
 * another row doesn't open. The key is PROVIDER_TOKEN_KEY (32 bytes, base64)
 * when set; otherwise one derived with HKDF from the server's Supabase secret,
 * so rotating that secret means reconnecting providers. Tokens never go back
 * to a browser; they're opened only on the server, to call the provider.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export interface VaultKey {
  /** "k1" for PROVIDER_TOKEN_KEY, "d1" for the derived key. */
  id: "k1" | "d1";
  bytes: Buffer;
}

/** The key, or null when none can be had (fail closed: nothing is stored or opened). */
export function vaultKey(env: Record<string, string | undefined> = process.env): VaultKey | null {
  const dedicated = env.PROVIDER_TOKEN_KEY?.trim();
  if (dedicated) {
    const bytes = Buffer.from(dedicated, "base64");
    return bytes.length === 32 ? { id: "k1", bytes } : null;
  }
  const master = env.SUPABASE_SECRET_KEY?.trim();
  if (!master) return null;
  return { id: "d1", bytes: Buffer.from(hkdfSync("sha256", master, "farbaek", "farbaek/provider-tokens/v1", 32)) };
}

const aad = (orgId: string, provider: string) => Buffer.from(`farbaek/provider-token/v1|${orgId}|${provider}`, "utf8");

export function sealToken(token: string, key: VaultKey, bind: { orgId: string; provider: string }): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.bytes, iv);
  cipher.setAAD(aad(bind.orgId, bind.provider));
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${key.id}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

/** The token, or null when it was sealed with another key, for another workspace, or was changed. */
export function openToken(sealed: string, key: VaultKey, bind: { orgId: string; provider: string }): string | null {
  const [version, keyId, payload] = sealed.split(".");
  if (version !== "v1" || keyId !== key.id || !payload) return null;
  const raw = Buffer.from(payload, "base64url");
  if (raw.length < 12 + 16 + 1) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.bytes, raw.subarray(0, 12));
    decipher.setAAD(aad(bind.orgId, bind.provider));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
