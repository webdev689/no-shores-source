import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rgbaOf } from '../art/sheet.ts';
import { type Scene, sceneSheet } from './islandArt.ts';

const KINDS: readonly Scene['kind'][] = [
  'port',
  'playlist',
  'patrol',
  'dungeon',
  'mission',
  'boss',
  'outpost',
  'island',
];
const CHART = {
  outline: [
    [-500, -400],
    [400, -500],
    [600, 300],
    [-300, 500],
  ] as const,
  harbour: [400, 200] as const,
  ship: [700, 300] as const,
};

test('every kind of tile paints its whole sheet, the same each time, and two places of a kind apart', () => {
  for (const kind of KINDS) {
    const scene: Scene = { kind, id: 'saltgrass-downs', ...(kind === 'island' && { chart: CHART }) };
    const sheet = sceneSheet(scene, 147, 93);
    assert.equal(sheet.cells.length, 147 * 93, kind);
    assert.ok(
      sheet.cells.every((ink) => /^#[0-9a-f]{6}$/.test(ink)),
      `${kind}: every texel inked, none left clear`,
    );
    assert.deepEqual(sceneSheet(scene, 147, 93).cells, sheet.cells, `${kind}: the same each time`);
    assert.equal(rgbaOf(sheet).length, 147 * 93 * 4);
    if (kind === 'island' || kind === 'playlist') continue;
    const other = sceneSheet({ kind, id: 'gullwing-vale' }, 147, 93);
    assert.notDeepEqual(other.cells, sheet.cells, `${kind}: another place is painted otherwise`);
  }
});
