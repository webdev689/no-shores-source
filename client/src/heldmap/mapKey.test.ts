import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CoastField } from './coastField.ts';
import type { Rect } from './heldMapLaw.ts';
import { keyPlace, keySize, landUnder, paintKey } from './mapKey.ts';
import { HOLDER_COLOURS, MAP_PARCHMENT, WASH_STRENGTH, type WaterHolder } from './watersWash.ts';

const INK = { width: 400, height: 300 } as const;
const SIZE = { width: 100, height: 80 } as const;
const noLand = () => false;

test('the key keeps its corner while it stays clear, and moves only when a word comes under it', () => {
  const first = keyPlace(INK, SIZE, 1, [], noLand, null);
  assert.equal(first?.corner, 'lower-left');
  assert.deepEqual(first?.box, { x: 10, y: 210, width: 100, height: 80 });
  const word: Rect = { x: 20, y: 250, width: 60, height: 14 };
  const moved = keyPlace(INK, SIZE, 1, [word], noLand, first);
  assert.equal(moved?.corner, 'lower-right');
  // The word gone again, the key stays where it moved: it never moves back and forth.
  assert.equal(keyPlace(INK, SIZE, 1, [], noLand, moved)?.corner, 'lower-right');
});

test('the key never covers land while a corner is clear of it, and none is clear of everything: null', () => {
  const landLowerLeft = (box: Rect) => box.x < 200 && box.y > 150;
  assert.equal(keyPlace(INK, SIZE, 1, [], landLowerLeft, null)?.corner, 'lower-right');
  assert.equal(
    keyPlace(INK, SIZE, 1, [], () => true, null),
    null,
  );
});

test('the key is one panel: four lines, the holders in two columns under their title, then the levels', () => {
  const measured = keySize({ font: '', measureText: (text: string) => ({ width: text.length * 7 }) });
  // Four lines of 16 with three gaps of 2 and a padding of 7 above and below.
  assert.equal(measured.height, 84);
  // Two columns of a swatch, a gap and the widest word: "Pirates" under "Home", "Grey Tithe" over "Contested".
  assert.equal(measured.width, 7 * 2 + (20 + 5 + 7 * 7) + 12 + (20 + 5 + 10 * 7));
});

test('land under a box is a discovered island’s, asked across the whole box', () => {
  // Four cells of 1 km: the lower right one land of island 0, the rest sea.
  const field: CoastField = {
    columns: 2,
    rows: 2,
    cellM: 1_000,
    distance: Float32Array.from([500, 500, 500, -200]),
    island: Uint8Array.from([0, 0, 0, 0]),
  };
  const view = { left: 0, top: 0, scale: 0.1 };
  assert.equal(landUnder(field, 1, view, { x: 0, y: 0, width: 90, height: 90 }), false);
  assert.equal(landUnder(field, 1, view, { x: 0, y: 0, width: 110, height: 110 }), true, 'its corner reaches the land');
  assert.equal(landUnder(field, 0, view, { x: 0, y: 0, width: 200, height: 200 }), false, 'an undiscovered island');
});

test('each holder’s swatch is painted as the map shows her: her wash over its parchment, the contested and Tithe hatched', () => {
  const calls: { name: string; args: unknown[]; fillStyle: unknown }[] = [];
  const state = { font: '', fillStyle: '' as unknown, strokeStyle: '' as unknown, lineWidth: 1, textAlign: 'left' };
  const painter = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      if (key === 'measureText') return (text: string) => ({ width: text.length * 7 });
      return (...args: unknown[]) => calls.push({ name: String(key), args, fillStyle: state.fillStyle });
    },
    set(target, key, value) {
      (target as Record<string, unknown>)[key as string] = value;
      return true;
    },
  }) as unknown as Parameters<typeof paintKey>[0];
  paintKey(painter, { corner: 'lower-left', box: { x: 0, y: 0, width: 190, height: 84 } }, 1);
  // The map's blend, worked out here as its shader lays it: the parchment, the charted sea's faint ink at 0.08, then
  // the holder's colour at the wash's strength.
  const blend = (holder: WaterHolder) => {
    const own = [1, 3, 5].map((offset) => Number.parseInt(HOLDER_COLOURS[holder].slice(offset, offset + 2), 16));
    const channels = MAP_PARCHMENT.map((channel, index) => {
      const charted = channel * 0.92 + [58, 40, 22][index]! * 0.08;
      return Math.round(charted * (1 - WASH_STRENGTH) + own[index]! * WASH_STRENGTH);
    });
    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  };
  const swatches = calls
    .filter((call) => call.name === 'fillRect' && call.args[2] === 20)
    .map((call) => call.fillStyle);
  assert.deepEqual(swatches, (['home', 'grey-tithe', 'pirates', 'contested'] as const).map(blend));
  assert.equal(calls.filter((call) => call.name === 'clip').length, 2, 'the Tithe’s and the contested’s hatching');
});
