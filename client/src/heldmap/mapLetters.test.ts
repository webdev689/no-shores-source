import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { CoastField } from './coastField.ts';
import type { Rect } from './heldMapLaw.ts';
import { HeldMapWaters } from './heldMapWaters.ts';
import {
  type KeyPlace,
  keyPlace,
  landUnder,
  letterBox,
  type Lettering,
  paintLettering,
  type Painter,
} from './mapLetters.ts';
import type { MapWaters } from './watersWash.ts';

/** A 2D context that records what is painted, each word 6 pixels a letter wide. */
function recorder() {
  const calls: { name: string; args: unknown[] }[] = [];
  const painter = new Proxy(
    {
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      textBaseline: 'alphabetic',
      textAlign: 'left',
      lineJoin: 'miter',
    },
    {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        if (key === 'measureText') return (text: string) => ({ width: text.length * 6 });
        return (...args: unknown[]) => calls.push({ name: String(key), args });
      },
      set(target, key, value) {
        (target as Record<string, unknown>)[key as string] = value;
        return true;
      },
    },
  ) as unknown as Painter;
  return { painter, calls };
}

test('the words, marks and key are painted on the parchment’s picture, never laid over the page', () => {
  const { painter, calls } = recorder();
  const lettering: Lettering = {
    letters: [
      { text: 'Overlook', x: 100, y: 50, kind: 'port', chosen: false },
      { text: 'Ruins of Fenhallow', x: 300, y: 80, kind: 'ruin', chosen: false },
      { text: 'The Mistwrack, 16-19', x: 200, y: 200, kind: 'water', chosen: false },
    ],
    ship: { x: 150, y: 150, heading: 0 },
    key: { corner: 'lower-left', box: { x: 14, y: 300, width: 100, height: 80 } },
  };
  paintLettering(painter, { width: 800, height: 500 }, { x: 20, y: 18 }, 2, lettering);
  assert.deepEqual(calls[0], { name: 'setTransform', args: [1, 0, 0, 1, 0, 0] });
  assert.deepEqual(calls[1], { name: 'clearRect', args: [0, 0, 800, 500] }, 'the last frame’s words are cleared');
  assert.deepEqual(calls[2], { name: 'setTransform', args: [2, 0, 0, 2, 40, 36] }, 'at the map’s place, device pixels');
  const words = calls.filter((call) => call.name === 'fillText').map((call) => call.args[0]);
  assert.deepEqual(words, [
    'Overlook',
    'Ruins of Fenhallow',
    'The Mistwrack, 16-19',
    'Home',
    'Grey Tithe',
    'Pirates',
    'Contested',
  ]);
  assert.ok(
    calls.some((call) => call.name === 'setLineDash'),
    'a ruin’s glyph is dashed',
  );
});

test('the held map letters in its ink pass, which is drawn before the gauntlets', async () => {
  const source = await readFile(new URL('./heldMapView.ts', import.meta.url), 'utf8');
  assert.match(source, /var lettering: texture_2d<f32>/, 'the ink shader takes the parchment’s picture');
  const draw = source.slice(source.indexOf('  draw(encoder'));
  const [ink, hands] = [draw.indexOf('pass.draw(6)'), draw.indexOf('this.handsDrawer.draw')];
  assert.ok(ink > 0 && hands > ink, 'the hands are drawn after the ink and its words');
  const map = await readFile(new URL('./heldMap.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(map, /held-mark|held-ship/, 'no word or mark is a page element over the picture');
});

const INK = { width: 400, height: 300 } as const;
const SIZE = { width: 100, height: 80 } as const;
const noLand = () => false;

test('the key keeps its corner while it stays clear, and moves only when a word comes under it', () => {
  const first = keyPlace(INK, SIZE, 380, [], noLand, null);
  assert.equal(first.corner, 'lower-left');
  assert.deepEqual(first.box, { x: 14, y: 206, width: 100, height: 80 });
  const word: Rect = { x: 20, y: 250, width: 60, height: 14 };
  const moved = keyPlace(INK, SIZE, 380, [word], noLand, first);
  assert.equal(moved.corner, 'lower-right');
  // The word gone again, the key stays where it moved: it never moves back and forth.
  assert.equal(keyPlace(INK, SIZE, 380, [], noLand, moved).corner, 'lower-right');
  assert.equal(keyPlace(INK, SIZE, 380, [], noLand, moved).corner, 'lower-right');
});

test('the key never covers land: it takes a clear corner, or the margin under the map when every corner is taken', () => {
  const landLowerLeft = (box: Rect) => box.x < 200 && box.y > 150;
  assert.equal(keyPlace(INK, SIZE, 380, [], landLowerLeft, null).corner, 'lower-right');
  const everywhere = () => true;
  const margin: KeyPlace = keyPlace(INK, SIZE, 380, [], everywhere, null);
  assert.deepEqual(margin, { corner: 'margin', box: { x: 10, y: 300, width: 380, height: 14 } });
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

test('a word’s box holds its glyph and name; a water’s name is held inside the map', () => {
  assert.deepEqual(letterBox({ text: 'Overlook', x: 100, y: 50, kind: 'port', chosen: false }, 48), {
    x: 95,
    y: 42,
    width: 62,
    height: 14,
  });
  const waters: MapWaters = {
    columns: 2,
    rows: 1,
    cellM: 1_000,
    water: Int16Array.from([0, 0]),
    seam: new Uint8Array(2),
    waters: [{ continent: 0, id: 'continent-1', name: 'The Lantern Sea', holder: 'home', levels: [1, 4] }],
    mainPorts: [],
  };
  const map = new HeldMapWaters(waters);
  map.chart(Uint8Array.from([1, 1]));
  const [letter] = map.letters(
    { width: 300, height: 100 },
    (x) => [x / 1_000, 50],
    (text) => text.length * 6,
  );
  assert.equal(letter?.text, 'The Lantern Sea, 1-4');
  assert.equal(letter?.x, 60, 'held in from the left edge by half its width');
});
