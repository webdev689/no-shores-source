import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Lettering } from './mapLayout.ts';
import { INK } from './mapKey.ts';
import {
  COVE_HALF,
  DOT,
  dotInks,
  fontOf,
  HOSTILE_HALF,
  HOSTILE_INK,
  ISLE_HALF,
  LIGHT_INK,
  paintLettering,
  type Painter,
  PARCHMENT,
  ROUTE,
  SEA_NAME,
} from './mapLetters.ts';
import { levelColour } from './watersWash.ts';

/** A 2D context that records what is painted, each word 6 pixels a letter wide. */
function recorder() {
  const calls: {
    name: string;
    args: unknown[];
    font: string;
    fillStyle: unknown;
    strokeStyle: unknown;
    textAlign?: string;
  }[] = [];
  const state = {
    font: '',
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    lineWidth: 1,
    textBaseline: 'alphabetic',
    textAlign: 'left',
    lineJoin: 'miter',
  };
  const painter = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      if (key === 'measureText') return (text: string) => ({ width: text.length * 6 });
      return (...args: unknown[]) =>
        calls.push({
          name: String(key),
          args,
          font: state.font,
          fillStyle: state.fillStyle,
          strokeStyle: state.strokeStyle,
          ...(String(key) === 'fillText' ? { textAlign: state.textAlign } : {}),
        });
    },
    set(target, key, value) {
      (target as Record<string, unknown>)[key as string] = value;
      return true;
    },
  }) as unknown as Painter;
  return { painter, calls };
}

const LETTERING: Lettering = {
  letters: [
    { text: 'Overlook', x: 100, y: 50, kind: 'port', chosen: false, side: null },
    { text: 'Ruins of Fenhallow', x: 300, y: 80, kind: 'ruin', chosen: false, side: null },
    { text: 'Saltmere', x: 120, y: 120, kind: 'island', chosen: false, side: 'centre', band: '1-4', colour: '#256327' },
    { text: 'The Mistwrack', x: 200, y: 200, kind: 'water', chosen: false, side: 'centre', spread: 9, px: 18 },
    { text: '', x: 400, y: 260, kind: 'lock', chosen: false, side: null },
  ],
  ship: { x: 150, y: 150, heading: 0 },
  key: { corner: 'lower-left', box: { x: 14, y: 300, width: 190, height: 92 } },
  scale: 1.5,
  named: [],
};

/** The letters of a sea's name as painted, one call each, in order. */
const seaLetters = (calls: ReturnType<typeof recorder>['calls']) =>
  calls
    .filter((call) => call.name === 'fillText' && call.fillStyle === SEA_NAME)
    .map((call) => call.args[0])
    .join('');

test('the marks, names and key are painted on the parchment’s picture, each at the lettering’s scale', () => {
  const { painter, calls } = recorder();
  paintLettering(painter, { width: 800, height: 500 }, { x: 20, y: 18 }, 2, LETTERING);
  assert.deepEqual(calls[0]?.args, [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(
    calls[1],
    { name: 'clearRect', args: [0, 0, 800, 500], font: '', fillStyle: '', strokeStyle: '' },
    'cleared first',
  );
  assert.deepEqual(calls[2]?.args, [2, 0, 0, 2, 40, 36], 'at the map’s place, device pixels');
  const words = calls
    .filter((call) => call.name === 'fillText' && call.fillStyle !== SEA_NAME)
    .map((call) => call.args[0]);
  assert.deepEqual(words, ['Saltmere, ', '1-4', 'Held by', 'Home', 'Grey Tithe', 'The Lattice', 'Levels', '1', '30']);
  assert.equal(seaLetters(calls), 'The Mistwrack', 'the sea’s name a letter at a time');
  const scales = calls.filter((call) => call.name === 'scale').map((call) => call.args);
  assert.ok(scales.length >= 5 && scales.every(([x, y]) => x === 1.5 && y === 1.5), 'every mark, word and the key');
});

test('a port is an anchor in the darkest ink and a ruin a faded one, neither named; an island’s band in its colour', () => {
  const { painter, calls } = recorder();
  paintLettering(painter, { width: 800, height: 500 }, { x: 0, y: 0 }, 1, { ...LETTERING, key: null });
  const said = calls.filter((call) => call.name === 'fillText').map((call) => call.args[0]);
  assert.ok(!said.includes('Overlook') && !said.includes('Ruins of Fenhallow'), 'a place’s name only on hover');
  const anchors = calls.filter((call) => call.name === 'arc' && call.args[2] === 1.3);
  assert.equal(anchors.length, 4, 'each anchor’s ring, haloed then inked, for the port and the ruin');
  const island = calls.find((call) => call.name === 'fillText' && call.args[0] === 'Saltmere, ');
  const band = calls.find((call) => call.name === 'fillText' && call.args[0] === '1-4');
  assert.deepEqual([island?.fillStyle, band?.fillStyle, island?.font], [INK, '#256327', fontOf('island')]);
  const halos = calls.filter((call) => call.name === 'strokeText').map((call) => call.args[0]);
  assert.deepEqual(halos, ['Saltmere, ', '1-4'], 'the island haloed, the sea’s name not, so it sinks into the sea');
});

test('a sea’s name is arched: each letter turned along a circle whose middle stands below it, highest at its middle', () => {
  const { painter, calls } = recorder();
  const sea = LETTERING.letters[3]!;
  paintLettering(painter, { width: 800, height: 500 }, { x: 0, y: 0 }, 1, {
    letters: [sea],
    ship: null,
    key: null,
    scale: 1,
    named: [],
  });
  const turns = calls.filter((call) => call.name === 'rotate').map((call) => call.args[0] as number);
  assert.equal(turns.length, 'The Mistwrack'.length);
  assert.ok(turns[0]! < 0 && turns.at(-1)! > 0, 'turned down at either end');
  const moves = calls.filter((call) => call.name === 'translate').slice(1);
  const heights = moves.map((call) => call.args[1] as number);
  const middle = heights[Math.floor(heights.length / 2)]!;
  assert.ok(middle < heights[0]! && middle < heights.at(-1)!, 'its middle highest');
  const across = moves.map((call) => call.args[0] as number);
  assert.ok(across.at(-1)! - across[0]! > 'The Mistwrack'.length * 6, 'stretched wider than the word itself');
});

test('a locked sea’s padlock stands out: a disc of the parchment ringed in the ink, the lock in the ink on it', () => {
  const { painter, calls } = recorder();
  paintLettering(painter, { width: 800, height: 500 }, { x: 0, y: 0 }, 1, {
    letters: [LETTERING.letters[4]!],
    ship: null,
    key: null,
    scale: 1,
    named: [],
  });
  const disc = calls.findIndex((call) => call.name === 'fill' && call.fillStyle === PARCHMENT);
  const body = calls.findIndex((call) => call.name === 'fillRect' && call.fillStyle === INK);
  assert.ok(disc >= 0 && body > disc, 'the lock drawn over its disc');
});

/** WCAG's contrast between two colours, `#rrggbb`. */
function contrast(one: string, other: string): number {
  const luminance = (hex: string) => {
    const [red, green, blue] = [1, 3, 5].map((offset) => {
      const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
  };
  const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

test('every word reads at least 4.5 : 1 against the parchment it is haloed in', () => {
  // An island's band is haloed in the parchment, taken at nine tenths over the darkest of the map's parchment.
  const ringFill = '#e8d5b3';
  for (const ink of [INK, LIGHT_INK]) assert.ok(contrast(ink, PARCHMENT) >= 4.5, ink);
  for (let level = 1; level <= 30; level += 0.5)
    assert.ok(contrast(levelColour(level), ringFill) >= 4.5, `level ${level}: ${levelColour(level)}`);
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

test('a found cove is inked a small ring and an isle a wider ring with a tower, under the words', () => {
  const { painter, calls } = recorder();
  const isles = [
    { x: 40, y: 60, isle: false },
    { x: 70, y: 90, isle: true },
  ];
  paintLettering(painter, { width: 800, height: 500 }, { x: 0, y: 0 }, 1, { ...LETTERING, key: null }, isles);
  const moved = calls.filter((call) => call.name === 'translate').map((call) => call.args);
  assert.deepEqual(moved.slice(0, 2), [
    [40, 60],
    [70, 90],
  ]);
  const rings = calls.filter((call) => call.name === 'arc').slice(0, 2);
  assert.deepEqual(
    rings.map((call) => [call.args[2], call.fillStyle]),
    [
      [COVE_HALF, LIGHT_INK],
      [ISLE_HALF, LIGHT_INK],
    ],
  );
  assert.ok(COVE_HALF < ISLE_HALF);
  const firstWord = calls.findIndex((call) => call.name === 'fillText');
  const towers = calls.filter((call, index) => call.name === 'fillRect' && index < firstWord);
  assert.equal(towers.length, 4, 'one tower, its body and three merlons, for the one isle');
});

test('a place the quest names is ringed round its mark, and a node the quest names is its ring alone', () => {
  const arcs = (kind: string, quest: boolean) => {
    const { painter, calls } = recorder();
    const letters = [{ text: 'Saltgrass Downs', x: 100, y: 100, kind, chosen: false, side: null, quest }];
    paintLettering(painter, { width: 800, height: 500 }, { x: 0, y: 0 }, 1, {
      letters,
      ship: null,
      key: null,
      scale: 1,
      named: [],
    });
    return calls.filter((call) => call.name === 'arc').map((call) => call.args[2] as number);
  };
  assert.deepEqual(arcs('patrol', false), [], 'no node is marked at sea');
  assert.equal(arcs('patrol', true).length, 1, 'but for the ring the quest gives it');
  const anchor = arcs('port', false);
  assert.equal(arcs('port', true).length, anchor.length + 1, 'its anchor and the ring');
  assert.ok((arcs('port', true).at(-1) ?? 0) > 4.7, 'the ring round the anchor');
});

test('at sea each other player’s ship on the sheet is a dot in their nameplate’s colour, over the words, under the arrow', () => {
  const ink = { width: 800, height: 500 };
  const ship = (x: number, y: number) => ({ at: [x, y] as const, company: false });
  const marks = [{ ...ship(1000, 2000), company: true }, ship(3001, 499), ship(-50, 0), ship(9000, 0)];
  const others = dotInks(marks, (x, y) => [x / 10, y / 10], ink);
  assert.deepEqual(
    others,
    [
      { x: 100, y: 200, company: true },
      { x: 300, y: 50, company: false },
    ],
    'those off the sheet are not dotted, and each lies to the quarter pixel',
  );
  const { painter, calls } = recorder();
  paintLettering(painter, ink, { x: 0, y: 0 }, 1, { ...LETTERING, key: null }, [], others);
  const dots = calls.flatMap((call, index) => (call.name === 'arc' && call.args[2] === DOT.radius ? [index] : []));
  const filled = dots.map((index) => calls.slice(index).find((call) => call.name === 'fill')?.fillStyle);
  assert.deepEqual(filled, [DOT.company, DOT.player]);
  const lastWord = calls.findLastIndex((call) => call.name === 'fillText');
  const arrow = calls.findLastIndex((call) => call.name === 'fill' && call.fillStyle === ROUTE);
  assert.ok(dots.every((index) => index > lastWord && index < arrow));
});

test('a hostile ship is marked whole or not at all, a hull under a sail in the Tithe’s slate edged in the parchment, over the dots, under the arrow', () => {
  const ink = { width: 800, height: 500 };
  const hostile = (x: number, y: number) => ({ at: [x, y] as const });
  const hostiles = dotInks(
    [hostile(10, 2000), hostile(100, 2000), hostile(7990, 4990)],
    (x, y) => [x / 10, y / 10],
    ink,
    HOSTILE_HALF,
  );
  assert.deepEqual(
    hostiles,
    [{ x: 10, y: 200, company: false }],
    'one that would spill past the map’s edge is left off',
  );
  const { painter, calls } = recorder();
  const others = [{ x: 300, y: 50, company: false }];
  paintLettering(painter, ink, { x: 0, y: 0 }, 1, LETTERING, [], others, hostiles);
  const slate = calls.findIndex((call) => call.name === 'fill' && call.fillStyle === HOSTILE_INK);
  assert.ok(slate >= 0, 'filled in the Tithe’s slate');
  assert.equal(calls.slice(0, slate).findLast((call) => call.name === 'stroke')?.strokeStyle, PARCHMENT);
  const dot = calls.findIndex((call) => call.name === 'arc' && call.args[2] === DOT.radius);
  const arrow = calls.findLastIndex((call) => call.name === 'fill' && call.fillStyle === ROUTE);
  assert.ok(dot < slate && slate < arrow, 'over the dots, under the arrow');
});
