import { readFileSync } from 'node:fs';

/** A fingerprint the Rust tests and the TypeScript tests both hold, read from the one file that pins it,
 *  content/fingerprints.txt: its line's value, after the name. */
export function pinned(name: string): string {
  const text = readFileSync(new URL('../content/fingerprints.txt', import.meta.url), 'utf8');
  const value = text
    .split('\n')
    .find((line) => line.startsWith(`${name} `))
    ?.slice(name.length + 1);
  if (value === undefined) throw new Error(`${name} is not pinned in content/fingerprints.txt`);
  return value;
}
