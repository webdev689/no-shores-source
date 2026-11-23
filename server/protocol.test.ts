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

test("the keepers spoken with are numbered only where the protocol's version reaches", () => {
  // The room finds a keeper's counter by the keeper's key; the numbers ask 64 sends stand beside the keys in
  // quest_defs.rs, which the version hashes, not in the room's asks.
  assert.ok(PROTOCOL_PATHS.includes('crates/gear/src/quest_defs.rs'));
  const asks = readFileSync('crates/room/src/asks.rs', 'utf8');
  assert.doesNotMatch(asks, /\b\d+ => CounterKind/, 'no keeper numbered in the room');
});
