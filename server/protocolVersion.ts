// The protocol's version: the hash of the schema's files, of the files laying out the fights' numbers that cross as
// plain lists (`FLOATS`), and of the content and rules numbered on the wire (tools/numbered.json), never a number
// bumped by hand: a page and a room built from different layouts, or from lists in a different order, know it from the
// room's welcome.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import numbered from '../tools/numbered.json' with { type: 'json' };

/** The schema's files: its root and every file it includes. */
export const SCHEMAS: readonly string[] = readdirSync('crates/protocol', { encoding: 'utf8' })
  .filter((name) => name.endsWith('.fbs'))
  .sort()
  .map((name) => join('crates/protocol', name));
/** The files laying out the fights' numbers that cross as plain lists: a fighter (its body, statuses and trim among
 *  them), an intent and a glance, the sea fight's view and lay, the foes' list and how others' numbers are packed. */
const FLOATS = [
  'crates/combat/src/floats.rs',
  'crates/movement/src/floats.rs',
  'crates/combat/src/status.rs',
  'crates/combat/src/trim.rs',
  'crates/naval/src/wire.rs',
  'crates/protocol/src/land.rs',
  'crates/protocol/src/pack.rs',
];

/** Every file the version hashes, in order. */
export const PROTOCOL_PATHS: readonly string[] = [...SCHEMAS, ...FLOATS, ...numbered.paths];

/** The version of the files as `read` gives them. */
export function protocolOf(read: (path: string) => string | Uint8Array = readFileSync): number {
  const hash = createHash('sha256');
  for (const path of PROTOCOL_PATHS) hash.update(read(path));
  return hash.digest().readUInt32BE(0);
}
