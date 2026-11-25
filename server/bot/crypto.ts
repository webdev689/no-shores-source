// Small crypto helpers on WebCrypto: random tokens, hashes, PKCE, and Discord's Ed25519 request signatures.

const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A random token of `size` bytes, base64url. */
export function randomToken(size = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(size)));
}

/** 128 random bits as hex: an address no one can guess. */
export function randomHex(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The PKCE challenge for a verifier (S256). */
export async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** How far Discord's timestamp may stray from our clock, in seconds: a replayed request older than this is refused. */
export const SIGNATURE_SKEW_S = 300;

const keys = new Map<string, Promise<CryptoKey>>();

/**
 * Whether Discord signed this request: Ed25519 over the timestamp and the exact body bytes, with the application's
 * public key.
 */
export async function discordSigned(
  publicKeyHex: string,
  body: Uint8Array,
  signature: string | null,
  timestamp: string | null,
  nowS: number,
): Promise<boolean> {
  if (
    !/^[0-9a-f]{64}$/i.test(publicKeyHex) ||
    !signature ||
    !timestamp ||
    !/^[0-9a-f]{128}$/i.test(signature) ||
    !/^\d{1,12}$/.test(timestamp)
  )
    return false;
  if (Math.abs(nowS - Number(timestamp)) > SIGNATURE_SKEW_S) return false;
  let key = keys.get(publicKeyHex);
  if (!key) {
    key = crypto.subtle.importKey('raw', hexBytes(publicKeyHex), { name: 'Ed25519' }, false, ['verify']);
    keys.set(publicKeyHex, key);
  }
  const signed = new Uint8Array(timestamp.length + body.length);
  signed.set(encoder.encode(timestamp), 0);
  signed.set(body, timestamp.length);
  try {
    return await crypto.subtle.verify({ name: 'Ed25519' }, await key, hexBytes(signature), signed);
  } catch {
    return false;
  }
}
