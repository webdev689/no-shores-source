// Makes the Rust and the TypeScript for every network message from the one schema, with flatc at the version
// tools/install-flatc.sh pins, into generated/messages/, which git leaves out. The first run on a machine installs
// that flatc into target/flatc/, so nothing needs installing by hand.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { protocolOf } from '../server/protocolVersion.ts';

// The schema's root, which includes the rest of its files (a player's gear in `gear.fbs`).
const SCHEMA = 'crates/protocol/messages.fbs';
const OUT = 'generated/messages';
// Written beside it and renamed into place, so a check reading the messages meanwhile never finds the folder half made.
const NEW = `${OUT}.new-${process.pid}`;
const pinned = /^VERSION=(\S+)$/m.exec(readFileSync('tools/install-flatc.sh', 'utf8'))?.[1] ?? '';
const flatc = join('target', 'flatc', pinned, 'flatc');

if (!existsSync(flatc))
  execFileSync('bash', ['tools/install-flatc.sh', join('target', 'flatc', pinned)], { stdio: 'inherit' });
const installed = execFileSync(flatc, ['--version'], { encoding: 'utf8' }).trim();
if (installed !== `flatc version ${pinned}`)
  throw new Error(`flatc ${pinned} is pinned, but ${flatc} is "${installed}"`);

rmSync(NEW, { recursive: true, force: true });
execFileSync(flatc, ['--rust', '--gen-all', '-o', join(NEW, 'rust'), SCHEMA]);
execFileSync(flatc, ['--ts', '--gen-all', '-o', join(NEW, 'ts'), SCHEMA]);
// flatc's TypeScript imports its own files as .js; the client and Node's test runner import them as .ts.
for (const name of readdirSync(join(NEW, 'ts'), { recursive: true, encoding: 'utf8' })) {
  if (!name.endsWith('.ts')) continue;
  const path = join(NEW, 'ts', name);
  writeFileSync(path, readFileSync(path, 'utf8').replace(/(from '\.{1,2}\/[^']*)\.js'/g, "$1.ts'"));
}

// The protocol's version (server/protocolVersion.ts).
const version = protocolOf();
writeFileSync(join(NEW, 'rust', 'version.rs'), `${version}\n`);
writeFileSync(join(NEW, 'ts', 'version.ts'), `export const PROTOCOL = ${version};\n`);

// A rename cannot replace a folder that holds files, so the old one moves aside: none is there only between renames.
const OLD = `${OUT}.old-${process.pid}`;
if (existsSync(OUT)) renameSync(OUT, OLD);
renameSync(NEW, OUT);
rmSync(OLD, { recursive: true, force: true });
