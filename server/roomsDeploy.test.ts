import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { test } from 'node:test';
import numberedContent from '../tools/numbered.json' with { type: 'json' };
import {
  REPO,
  codeOf,
  decided,
  filesUnder,
  importedFrom,
  refused,
  underCode,
  workflowText,
} from './deployReadyForTests.ts';

/** The paths the rooms are built from, as the workflow lists them. */
const roomsCode = codeOf(workflowText('rooms.yml'));

/** The workspace crates a crate is built from, by its manifest's `[dependencies]`, and theirs in turn. */
function builtFrom(roots: readonly string[]): string[] {
  const found = new Set<string>();
  const visit = (crate: string) => {
    if (found.has(crate)) return;
    found.add(crate);
    const manifest = readFileSync(new URL(`../crates/${crate}/Cargo.toml`, import.meta.url), 'utf8');
    const section = manifest.split(/^\[dependencies\]$/m)[1]?.split(/^\[/m)[0] ?? '';
    for (const [, dependency] of section.matchAll(/path = "\.\.\/([a-z-]+)"/g)) if (dependency) visit(dependency);
  };
  roots.forEach(visit);
  return [...found].sort();
}

test('the rooms’ code is every crate the room’s WebAssembly and the bake are built from, and no other', () => {
  const crates = roomsCode.filter((path) => path.startsWith('crates/')).map((path) => path.slice('crates/'.length));
  assert.deepEqual(crates.sort(), builtFrom(['room-wasm', 'bake']));
  for (const path of [
    'server',
    'tools/schema.mjs',
    'content/world',
    'content/testground',
    'content/gear',
    'content/arts',
    'Cargo.lock',
  ])
    assert.ok(roomsCode.includes(path), path);
});

const repo = REPO;
/** Whether a path from the root lies under the rooms' code. */
const deployed = (path: string) => underCode(roomsCode, path);

test('every file the rooms read lies under the rooms’ code, so a change to it deploys them', () => {
  // What the room's crates build in: each `include_str!` and `include_bytes!` of their sources, not their tests', and
  // of their build scripts, with each file a build script reads from beside its manifest.
  const crates = builtFrom(['room-wasm', 'bake']);
  const sources = crates
    .flatMap((crate) => filesUnder(`crates/${crate}/src`))
    .filter((path) => path.endsWith('.rs') && !path.endsWith('_tests.rs') && !path.includes('/tests/'));
  const reads = (path: string, pattern: RegExp) =>
    [...readFileSync(new URL(path, repo), 'utf8').matchAll(pattern)].map(([, file]) =>
      normalize(join(dirname(path), file ?? '')),
    );
  const scripts = crates.map((crate) => `crates/${crate}/build.rs`).filter((path) => existsSync(new URL(path, repo)));
  const included = [
    ...sources.flatMap((path) => reads(path, /include_(?:str|bytes)!\(\s*"([^"]+)"/g)),
    ...scripts.flatMap((path) =>
      reads(path, /(?:include_(?:str|bytes)!\(\s*|env!\("CARGO_MANIFEST_DIR"\),\s*)"([^"]+)"/g),
    ),
  ];
  // What the bake reads from the repository as it runs (`root.join`), but what it writes, the nodes the rooms serve.
  const baked = filesUnder('crates/bake/src')
    .filter((path) => path.endsWith('.rs'))
    .flatMap((path) => [...readFileSync(new URL(path, repo), 'utf8').matchAll(/root\.join\("([^"]+)"\)/g)])
    .map(([, file]) => normalize(file ?? ''))
    .filter((path) => !path.startsWith('generated/'));
  // What the protocol's version hashes: the content numbered on the wire, and the list that names it.
  const numbered = [...numberedContent.paths, 'tools/numbered.json'];
  // What the Workers import from beyond their own folder, and what that imports in turn, but the room's WebAssembly
  // built from the crates; the bot is its own Worker, deployed by its own workflow.
  const workers = filesUnder('server').filter(
    (path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.startsWith('server/bot/'),
  );
  const imported = importedFrom(workers).filter((path) => !path.startsWith('server/') && !path.startsWith('target/'));
  for (const [what, paths] of Object.entries({ included, baked, numbered, imported })) {
    assert.ok(paths.length > 0, `some ${what} found`);
    for (const path of paths) assert.ok(existsSync(new URL(path, repo)) && deployed(path), `${what}: ${path}`);
  }
});

/** What the ready step decides for the rooms, as `decided` runs it. */
const roomsDecided = (changed: string, asked: Parameters<typeof decided>[3] = {}) =>
  decided('rooms', roomsCode, changed, asked);

test('a merge deploys the rooms when their code changed since the last deploy, and never for notes alone', () => {
  assert.equal(roomsDecided('bible/Hand-off.md'), 'deploy=no');
  assert.equal(roomsDecided('client/src/main.ts'), 'deploy=no', 'the page alone');
  assert.equal(roomsDecided('crates/room/src/lib.rs'), 'deploy=yes');
  assert.equal(roomsDecided('crates/protocol/messages.fbs'), 'deploy=yes', 'the schema');
  assert.equal(roomsDecided('server/worker.ts'), 'deploy=yes');
  assert.equal(roomsDecided('server/bot/worker.ts'), 'deploy=no', 'the Discord bot, which deploys on its own');
  assert.equal(roomsDecided('.github/workflows/rooms.yml'), 'deploy=yes', 'the workflow itself');
  assert.equal(roomsDecided('.github/deploy-ready.sh'), 'deploy=yes', 'the script that decides');
  const lines = { joined: '\n' };
  assert.equal(
    roomsDecided('.github/workflows/rooms.yml', lines),
    'deploy=yes',
    'the last of the paths given a line each',
  );
  assert.equal(roomsDecided('server/bot/worker.ts', lines), 'deploy=no', 'a path left out, given a line of its own');
});

test('by hand the rooms deploy whatever changed; with no deploy found they deploy; past main’s head they do not', () => {
  assert.equal(roomsDecided('bible/Hand-off.md', { byHand: true }), 'deploy=yes');
  assert.throws(
    () => roomsDecided('server/worker.ts', { byHand: true, checked: false }),
    refused,
    'by hand, not checked',
  );
  assert.equal(
    roomsDecided('server/worker.ts', { checked: false }),
    'deploy=yes',
    'a merge, which its own run checked',
  );
  assert.equal(roomsDecided('bible/Hand-off.md', { found: false }), 'deploy=yes');
  assert.equal(roomsDecided('server/worker.ts', { moved: true }), 'deploy=no');
  assert.equal(
    roomsDecided('server/worker.ts', { token: false }),
    'deploy=blocked',
    'the rooms to deploy, with no token',
  );
  assert.equal(roomsDecided('bible/Hand-off.md', { token: false }), 'deploy=no', 'nothing to deploy, token or not');
});

test('on main, the page and the site are published only once the rooms have deployed or had nothing to deploy', () => {
  const checks = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  for (const job of ['pages', 'site']) {
    const body = new RegExp(`\\n  ${job}:\\n((?: {4}.*\\n|\\s*\\n)*)`).exec(checks)?.[1] ?? '';
    assert.match(body, /needs: \[check, rooms\]/, `${job} waits for the rooms`);
    const when = /if: >-\n((?: {6}.*\n)*)/.exec(body)?.[1]?.replace(/\s+/g, ' ') ?? '';
    assert.ok(when.includes("needs.rooms.outputs.deploy == 'no' || needs.rooms.outputs.deployed == 'yes'"), when);
    assert.ok(!when.includes('blocked'), `a blocked deploy publishes no ${job}`);
  }
});
