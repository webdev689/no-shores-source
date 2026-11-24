import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PROTOCOL_PATHS, protocolOf } from './protocolVersion.ts';

/** The file as it stands, or with `changed` appended to the one at `path`. */
const reading =
  (path?: string, changed = '') =>
  (each: string) =>
    readFileSync(each, 'utf8') + (each === path ? changed : '');

test("the protocol's version moves when what the wire numbers by place changes, and a page left open is told", () => {
  // A smith's stock is asked by its place, the opening's tasks are counted by theirs, a speaker's look by its place
  // in the cast, and an item's kind and slot (a horse's among them) cross the wire as numbers.
  const placed = ['crates/gear/src/vendor.rs', 'content/quests/quests.json', 'crates/gear/src/quest_defs.rs'];
  for (const path of [...placed, 'content/story/cast.json', 'crates/gear/src/kinds.rs']) {
    assert.ok(PROTOCOL_PATHS.includes(path), `${path} is hashed`);
    assert.notEqual(protocolOf(reading(path, '\n')), protocolOf(reading()), `${path} moves it`);
  }
  assert.equal(protocolOf(reading()), protocolOf(reading()), 'the same files, the same version');
});

/** The file a Rust path's module is in: `crate::status` from crates/combat/src/floats.rs, or `movement::floats`. */
function moduleFile(from: string, path: string): string {
  const [crate = '', module = ''] = path.split('::');
  const name = crate === 'crate' ? (/^crates\/([^/]+)\//.exec(from)?.[1] ?? '') : crate.replaceAll('_', '-');
  return `crates/${name}/src/${module}.rs`;
}

test("the protocol's version hashes every file that lays out the fights' numbers crossing as plain lists", () => {
  // The foes' list and how others' numbers are packed are laid out by the protocol itself.
  for (const path of ['crates/protocol/src/land.rs', 'crates/protocol/src/pack.rs'])
    assert.ok(PROTOCOL_PATHS.includes(path), `${path} is hashed`);
  // A hashed layout's lengths built from another file's (a fighter's body, its statuses and its trim) hash that file.
  for (const path of PROTOCOL_PATHS.filter((each) => each.endsWith('.rs')))
    for (const [, module, names] of readFileSync(path, 'utf8').matchAll(/^use ([a-z_]+::[a-z_]+)::\{?([^;}]*)\}?;/gm))
      if (/\b[A-Z_]+_(?:FLOATS|NUMBERS)\b/.test(names ?? ''))
        assert.ok(PROTOCOL_PATHS.includes(moduleFile(path, module ?? '')), `${path} lays out from ${module}`);
});
