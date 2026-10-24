/**
 * The one-time codes that add a device to Office Space (ADR 0072): 8
 * characters from an alphabet without look-alikes (no 0, O, 1, I or L), shown
 * as two groups of four. They work once, for 15 minutes.
 */
export const DEVICE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

export function newDeviceCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % DEVICE_CODE_ALPHABET.length);
  let code = "";
  while (code.length < 8) {
    for (const byte of random(16)) {
      if (byte < limit && code.length < 8) code += DEVICE_CODE_ALPHABET[byte % DEVICE_CODE_ALPHABET.length];
    }
  }
  return code;
}

/** What someone typed, as a code, or null. Spaces, dashes and lower case are fine. */
export function normalizeDeviceCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.toUpperCase().replace(/[\s-]+/g, "");
  return CODE.test(code) ? code : null;
}

export function formatDeviceCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}
