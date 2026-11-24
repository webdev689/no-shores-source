import assert from 'node:assert/strict';
import { test } from 'node:test';
import words from '../../../content/gear/words.json' with { type: 'json' };
import type { GearItem } from '../network/gearMessages.ts';
import { KINDS, itemName, itemWords, slotOf } from './gear.ts';
import { SOURCES } from './sourceLooks.ts';

const LINES: Readonly<Record<string, Readonly<Record<string, string>>>> = words.sets;

/** Every rolled armour piece and weapon a player can hold, by every content, rarity, level and look roll. */
function everyRolled(): GearItem[] {
  const kinds = KINDS.flatMap((key, kind) => (key && key !== 'cloak' ? [kind] : []));
  const found: GearItem[] = [];
  for (const kind of kinds)
    for (let source = 0; source < SOURCES.length; source++)
      for (let rarity = 0; rarity <= 4; rarity++)
        for (let level = 1; level <= 20; level++)
          for (let name = 0; name < 36; name++)
            for (const story of slotOf(kind) > 1 ? [false, true] : [false])
              found.push({ kind, source, rarity, level, name, story, named: null, id: 1 } as GearItem);
  return found;
}

test('every rolled armour piece and weapon has its set and kind words, and every line is reached', () => {
  const reached = new Set<string>();
  for (const item of everyRolled()) {
    const name = itemName(item);
    assert.notEqual(itemWords(item), '', `${name} has words`);
    reached.add(name);
  }
  const written = Object.entries(LINES).flatMap(([set, kinds]) => Object.keys(kinds).map((word) => `${set} ${word}`));
  assert.deepEqual(
    written.filter((each) => !reached.has(each)),
    [],
    'no line is written for a piece never made',
  );
});

test('no two pieces share a line', () => {
  const lines = Object.values(LINES).flatMap((kinds) => Object.values(kinds));
  assert.equal(new Set(lines).size, lines.length);
});

test("a named piece keeps its own words, not its set's", () => {
  const named = { kind: 2, source: 3, rarity: 3, level: 20, name: 0, named: 'harbourwarden', id: 1 } as GearItem;
  assert.match(itemWords(named), /harbour wall/);
});
