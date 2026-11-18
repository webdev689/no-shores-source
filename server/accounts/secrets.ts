/** Session tokens and their hashes, and passwords as PBKDF2 keeps them: what the accounts store is never what a
 *  browser holds. */

/** Cloudflare Workers refuse PBKDF2 above this many iterations. */
const ITERATIONS = 100_000;
const SCHEME = 'pbkdf2-sha256';

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const base64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const unbase64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

/** A fresh secret: 32 random bytes as hex. */
export function randomToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

/** A token's SHA-256 as hex: what the database keeps of it. */
export async function hashOf(token: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256),
  );
}

/** A password as it is kept: its scheme, iterations, a random salt and what they derive. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${SCHEME}$${ITERATIONS}$${base64(salt)}$${base64(await derive(password, salt, ITERATIONS))}`;
}

/** Whether a password is the one kept, compared in time that does not depend on where they differ. */
export async function passwordMatches(password: string, kept: string): Promise<boolean> {
  const [scheme, iterations, salt, derived] = kept.split('$');
  const count = Number(iterations);
  if (scheme !== SCHEME || !Number.isInteger(count) || count < 1 || count > ITERATIONS || !salt || !derived)
    return false;
  const [mine, theirs] = [await derive(password, unbase64(salt), count), unbase64(derived)];
  let differ = mine.length ^ theirs.length;
  for (let index = 0; index < mine.length; index++) differ |= (mine[index] ?? 0) ^ (theirs[index] ?? 0);
  return differ === 0;
}

/** A password kept for no one, so a sign-in with an unknown name takes as long as one with a wrong password. */
export const NO_ONES_PASSWORD = `${SCHEME}$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;
