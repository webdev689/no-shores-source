import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rgbaOf } from '../art/sheet.ts';
import type { Point2 } from '../overworld/ground.ts';
import { offCoast, type Scene, sceneSheet } from './islandArt.ts';

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
    const other = sceneSheet({ kind, id: 'highwater-fells' }, 147, 93);
    assert.notDeepEqual(other.cells, sheet.cells, `${kind}: another place is painted otherwise`);
  }
});

test('the coast’s distances, measured by buckets, are those of measuring every leg, to the last bit', () => {
  // A ragged coast of 60 legs, long and short, over a sheet 90 by 50, some of it off the sheet's edge.
  const coast = Array.from({ length: 60 }, (_none, leg): Point2 => {
    const turn = (leg / 60) * 2 * Math.PI;
    const reach = 18 + 9 * Math.sin(leg * 2.7) + (leg % 7 === 0 ? 14 : 0);
    return [45 + reach * 1.6 * Math.cos(turn), 25 + reach * Math.sin(turn)];
  });
  const field = offCoast(coast, 90, 50);
  for (let y = 0; y < 50; y++)
    for (let x = 0; x < 90; x++) {
      let nearest = Number.POSITIVE_INFINITY;
      coast.forEach((from, leg) => {
        const to = coast[(leg + 1) % coast.length] ?? from;
        const [alongX, alongY] = [to[0] - from[0], to[1] - from[1]];
        const length = alongX * alongX + alongY * alongY;
        const share =
          length > 0 ? Math.max(0, Math.min(1, ((x - from[0]) * alongX + (y - from[1]) * alongY) / length)) : 0;
        const [apartX, apartY] = [x - from[0] - share * alongX, y - from[1] - share * alongY];
        nearest = Math.min(nearest, apartX * apartX + apartY * apartY);
      });
      assert.equal(field[y * 90 + x], Math.sqrt(nearest), `${x}, ${y}`);
    }
});
