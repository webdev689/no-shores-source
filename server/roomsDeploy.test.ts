import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { test } from 'node:test';
import numberedContent from '../tools/numbered.json' with { type: 'json' };

const workflow = readFileSync(new URL('../.github/workflows/rooms.yml', import.meta.url), 'utf8');

/** The paths the rooms are built from, as the workflow lists them. */
const roomsCode = (/ROOMS_CODE: >-\n((?: {12}\S.*\n)+)/.exec(workflow)?.[1] ?? '').trim().split(/\s+/);

/** The `ready` step's script, as the runner's shell is handed it. */
const readyScript = (/- id: ready\n[\s\S]*?run: \|\n((?: {10}.*\n|\n)+)/.exec(workflow)?.[1] ?? '')
  .split('\n')
  .map((line) => line.slice(10))
  .join('\n');

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

const repo = new URL('../', import.meta.url);
/** Every file under a folder of the repository, by its path from the root. */
const filesUnder = (folder: string): string[] =>
  readdirSync(new URL(folder, repo), { recursive: true, encoding: 'utf8' }).map((name) => join(folder, name));
/** Whether a path from the root lies under one of the rooms' code paths. */
const deployed = (path: string) => roomsCode.some((code) => path === code || path.startsWith(`${code}/`));

test('every file the rooms read lies under the rooms’ code, so a change to it deploys them', () => {
  // What the room's crates build in: each `include_str!` and `include_bytes!` of their sources, not their tests'.
  const sources = builtFrom(['room-wasm', 'bake'])
    .flatMap((crate) => filesUnder(`crates/${crate}/src`))
    .filter((path) => path.endsWith('.rs') && !path.endsWith('_tests.rs') && !path.includes('/tests/'));
  const included = sources.flatMap((path) =>
    [...readFileSync(new URL(path, repo), 'utf8').matchAll(/include_(?:str|bytes)!\(\s*"([^"]+)"/g)].map(([, file]) =>
      normalize(join(dirname(path), file ?? '')),
    ),
  );
  // What the protocol's version hashes: the content numbered on the wire, and the list that names it.
  const numbered = [...numberedContent.paths, 'tools/numbered.json'];
  // What the Workers import from beyond their own folder, but the room's WebAssembly built from the crates.
  const imported = filesUnder('server')
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
    .flatMap((path) =>
      [...readFileSync(new URL(path, repo), 'utf8').matchAll(/from '(\.[^']+)'/g)].map(([, file]) =>
        normalize(join(dirname(path), file ?? '')),
      ),
    )
    .filter((path) => !path.startsWith('server/') && !path.startsWith('target/'));
  for (const [what, paths] of Object.entries({ included, numbered, imported })) {
    assert.ok(paths.length > 0, `some ${what} found`);
    for (const path of paths) assert.ok(existsSync(new URL(path, repo)) && deployed(path), `${what}: ${path}`);
  }
});

/** What the `ready` step decides for a commit that changes `changed` over the one last deployed: with the token, from
 *  a merge (or by hand), while the commit is main's head (or after main moved on), and with that deploy found. */
function decided(changed: string, options: { byHand?: boolean; moved?: boolean; found?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'rooms-deploy-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@test', ...args], { cwd: root })
      .toString()
      .trim();
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  try {
    git('init', '-q');
    for (const path of ['server/worker.ts', 'crates/room/src/lib.rs', 'bible/Home.md', changed]) write(path, 'one');
    git('add', '.');
    git('commit', '-qm', 'deployed');
    const deployed = git('rev-parse', 'HEAD');
    write(changed, 'two');
    git('add', '.');
    git('commit', '-qm', 'merged');
    const head = git('rev-parse', 'HEAD');
    // The GitHub CLI as the step asks it: main's head, the deployments to `rooms`, and each one's last word.
    write(
      'bin/gh',
      [
        '#!/bin/bash',
        `case "$2" in`,
        `  *commits/main) echo ${options.moved ? 'f'.repeat(40) : head} ;;`,
        `  *environment=rooms*) ${options.found === false ? 'true' : `echo "${deployed} 7"`} ;;`,
        `  */deployments/7/statuses) echo success ;;`,
        'esac',
      ].join('\n'),
    );
    chmodSync(join(root, 'bin/gh'), 0o755);
    const script = readyScript
      .replaceAll('${{ github.repository }}', 'owner/overlook')
      .replaceAll('${{ github.sha }}', head);
    write('ready.sh', script);
    write('output', '');
    const env = {
      PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`,
      HAS_TOKEN: 'true',
      BY_HAND: options.byHand ? 'true' : 'false',
      ROOMS_CODE: roomsCode.join(' '),
      GITHUB_OUTPUT: join(root, 'output'),
    };
    execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', 'ready.sh'], { cwd: root, env });
    return readFileSync(join(root, 'output'), 'utf8').trim();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('a merge deploys the rooms when their code changed since the last deploy, and never for notes alone', () => {
  assert.equal(decided('bible/Hand-off.md'), 'deploy=no');
  assert.equal(decided('client/src/main.ts'), 'deploy=no', 'the page alone');
  assert.equal(decided('crates/room/src/lib.rs'), 'deploy=yes');
  assert.equal(decided('crates/protocol/messages.fbs'), 'deploy=yes', 'the schema');
  assert.equal(decided('server/worker.ts'), 'deploy=yes');
  assert.equal(decided('.github/workflows/rooms.yml'), 'deploy=yes', 'the workflow itself');
});

test('by hand the rooms deploy whatever changed; with no deploy found they deploy; past main’s head they do not', () => {
  assert.equal(decided('bible/Hand-off.md', { byHand: true }), 'deploy=yes');
  assert.equal(decided('bible/Hand-off.md', { found: false }), 'deploy=yes');
  assert.equal(decided('server/worker.ts', { moved: true }), 'deploy=no');
});
