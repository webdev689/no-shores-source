// Makes the Rust and the TypeScript for every network message from the one schema, with flatc at the version
// tools/install-flatc.sh pins, into generated/messages/, which git leaves out. The first run on a machine installs
// that flatc into target/flatc/, so nothing needs installing by hand.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA = 'crates/protocol/messages.fbs';
// The content whose entries cross the wire by their place in its lists (tools/numbered.json).
const NUMBERED = JSON.parse(readFileSync('tools/numbered.json', 'utf8')).paths;
const OUT = 'generated/messages';
const pinned = /^VERSION=(\S+)$/m.exec(readFileSync('tools/install-flatc.sh', 'utf8'))?.[1] ?? '';
const flatc = join('target', 'flatc', pinned, 'flatc');

if (!existsSync(flatc))
  execFileSync('bash', ['tools/install-flatc.sh', join('target', 'flatc', pinned)], { stdio: 'inherit' });
const installed = execFileSync(flatc, ['--version'], { encoding: 'utf8' }).trim();
if (installed !== `flatc version ${pinned}`)
  throw new Error(`flatc ${pinned} is pinned, but ${flatc} is "${installed}"`);

rmSync(OUT, { recursive: true, force: true });
execFileSync(flatc, ['--rust', '-o', join(OUT, 'rust'), SCHEMA]);
execFileSync(flatc, ['--ts', '-o', join(OUT, 'ts'), SCHEMA]);
// flatc's TypeScript imports its own files as .js; the client and Node's test runner import them as .ts.
for (const name of readdirSync(join(OUT, 'ts'), { recursive: true, encoding: 'utf8' })) {
  if (!name.endsWith('.ts')) continue;
  const path = join(OUT, 'ts', name);
  writeFileSync(path, readFileSync(path, 'utf8').replace(/(from '\.{1,2}\/[^']*)\.js'/g, "$1.ts'"));
}

// The protocol's version is the hash of the schema, of the fight's numbers as combat lays them out (a fighter, an
// intent and a glance cross as plain lists of numbers), and of the content numbered on the wire, never a number bumped
// by hand: a page and a room built from different layouts, or from lists in a different order, know it from the room's
// welcome.
const FLOATS = 'crates/combat/src/floats.rs';
const hash = createHash('sha256');
for (const path of [SCHEMA, FLOATS, ...NUMBERED]) hash.update(readFileSync(path));
const version = hash.digest().readUInt32BE(0);
writeFileSync(join(OUT, 'rust', 'version.rs'), `${version}\n`);
writeFileSync(join(OUT, 'ts', 'version.ts'), `export const PROTOCOL = ${version};\n`);
