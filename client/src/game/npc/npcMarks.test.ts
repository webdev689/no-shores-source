import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keeperMap, keeperMarkSvg, shapesSvg } from './npcMarks.ts';

test('every keeper but the factions’ has a sign of its own in a diamond', () => {
  const kinds = ['mage', 'vault', 'armorsmith', 'weaponsmith', 'tailor', 'tack', 'mail', 'shape'];
  const maps = kinds.map((kind) => keeperMap(kind)?.join('/'));
  assert.ok(maps.every(Boolean));
  assert.equal(new Set(maps).size, kinds.length, 'no two drawn the same');
  const diamond = keeperMap('mage') ?? [];
  assert.equal(diamond.length, 21);
  assert.ok(diamond.every((row) => row.length === 21));
  assert.equal(diamond[0]?.charAt(10), 'a', 'its outline reaches the top point');
  assert.equal(keeperMap('stormcallers'), null);
  assert.ok(keeperMarkSvg('tack').startsWith('<svg'));
  assert.ok(shapesSvg().includes('<rect'));
});
