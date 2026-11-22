import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOTIFS } from '../emblemMotifs.ts';
import { COVER, coverRows, coverSvg } from './loreArt.ts';

test('a cover is its pixels every row, round at its corners, its motif raised only inside the medallion', () => {
  const plain = coverRows(null);
  const tooled = coverRows(MOTIFS.bolt ?? null);
  assert.equal(plain.length, COVER[1]);
  assert.ok(plain.every((row) => row.length === COVER[0]));
  assert.deepEqual([plain[0]?.[0], plain[0]?.[1], plain.at(-1)?.at(-1)], ['.', 'o', '.']);
  const changed: [number, number][] = [];
  tooled.forEach((row, y) => [...row].forEach((cell, x) => cell !== plain[y]?.[x] && changed.push([x, y])));
  assert.ok(changed.length > 20, 'the bolt shows');
  assert.ok(
    changed.every(([x, y]) => x >= 20 && x <= 36 && y >= 23 && y <= 39),
    'inside the medallion, with its shadow',
  );
  assert.ok(
    changed.every(([x, y]) => plain[y]?.[x] === 's'),
    'on the medallion’s sunk field only',
  );
});

test('a book not found is stone, with no brass and no motif', () => {
  const found = coverSvg('#447cc0', 'bolt', true);
  const stone = coverSvg('#447cc0', 'bolt', false);
  assert.ok(found.includes('#c08a3e') && found.toLowerCase().includes('#447cc0'));
  assert.ok(!stone.includes('#c08a3e') && !stone.toLowerCase().includes('#447cc0'));
  assert.equal(stone, coverSvg('#7a3410', 'lantern', false), 'every unfound book alike');
});
