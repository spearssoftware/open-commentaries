/**
 * Token hashing and generation, following gnosis-api-ts keys.ts:
 * hashToken = hex(SHA-256(`${salt}:${raw}`)); generateToken = prefix + base64url(32 random bytes).
 */

export async function hashToken(salt: string, raw: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${raw}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateToken(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `${prefix}${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

/** Constant-time comparison of two hex digests. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
