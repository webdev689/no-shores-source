import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Lettering } from './mapLayout.ts';
import { INK } from './mapKey.ts';
import { COVE_HALF, fontOf, ISLE_HALF, LIGHT_INK, paintLettering, type Painter, PARCHMENT } from './mapLetters.ts';
import { levelColour } from './watersWash.ts';

/** A 2D context that records what is painted, each word 6 pixels a letter wide. */
function recorder() {
  const calls: { name: string; args: unknown[]; font: string; fillStyle: unknown; textAlign?: string }[] = [];
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
    { text: 'Overlook', x: 100, y: 50, kind: 'port', chosen: false, side: 'right' },
    { text: 'Ruins of Fenhallow', x: 300, y: 80, kind: 'ruin', chosen: false, side: 'left' },
    { text: 'Hollow Barrow', x: 320, y: 90, kind: 'patrol', chosen: false, side: null },
    { text: 'The Mistwrack, 16-19', x: 200, y: 200, kind: 'water', chosen: false, side: 'centre', colour: '#894314' },
  ],
  ship: { x: 150, y: 150, heading: 0 },
  key: { corner: 'lower-left', box: { x: 14, y: 300, width: 190, height: 92 } },
  scale: 1.5,
};

test('the words, marks and key are painted on the parchment’s picture, each at the lettering’s scale', () => {
  const { painter, calls } = recorder();
  paintLettering(painter, { width: 800, height: 500 }, { x: 20, y: 18 }, 2, LETTERING);
  assert.deepEqual(calls[0]?.args, [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(calls[1], { name: 'clearRect', args: [0, 0, 800, 500], font: '', fillStyle: '' }, 'cleared first');
  assert.deepEqual(calls[2]?.args, [2, 0, 0, 2, 40, 36], 'at the map’s place, device pixels');
  const words = calls.filter((call) => call.name === 'fillText').map((call) => call.args[0]);
  assert.deepEqual(words, [
    'Overlook',
    'Ruins of Fenhallow',
    'The Mistwrack, 16-19',
    'Held by',
    'Home',
    'Grey Tithe',
    'The Lattice',
    'Levels',
    '1',
    '30',
  ]);
  const scales = calls.filter((call) => call.name === 'scale').map((call) => call.args);
  assert.ok(scales.length >= 5 && scales.every(([x, y]) => x === 1.5 && y === 1.5), 'every mark, word and the key');
  assert.ok(
    calls.some((call) => call.name === 'setLineDash'),
    'a ruin’s mark is dashed',
  );
});

test('ports letter strongest, a step larger in the darkest ink; ruins and nodes lighter; every word haloed', () => {
  const { painter, calls } = recorder();
  paintLettering(painter, { width: 800, height: 500 }, { x: 0, y: 0 }, 1, { ...LETTERING, key: null });
  const filled = (text: string) => calls.find((call) => call.name === 'fillText' && call.args[0] === text);
  assert.equal(filled('Overlook')?.font, fontOf('port'));
  assert.match(fontOf('port'), /15px/);
  assert.match(fontOf('ruin'), /13px/);
  assert.equal(filled('Overlook')?.fillStyle, INK);
  assert.equal(filled('Ruins of Fenhallow')?.fillStyle, LIGHT_INK);
  assert.equal(filled('Hollow Barrow'), undefined, 'a dropped name keeps only its mark');
  const halos = calls.filter((call) => call.name === 'strokeText').map((call) => call.args[0]);
  assert.deepEqual(halos, ['Overlook', 'Ruins of Fenhallow', 'The Mistwrack, 16-19']);
});

test('a name stands beside its mark on its side, its middle on the mark’s', () => {
  const { painter, calls } = recorder();
  paintLettering(painter, { width: 800, height: 500 }, { x: 0, y: 0 }, 1, { ...LETTERING, key: null });
  const right = calls.find((call) => call.name === 'fillText' && call.args[0] === 'Overlook');
  const left = calls.find((call) => call.name === 'fillText' && call.args[0] === 'Ruins of Fenhallow');
  assert.ok((right?.args[1] as number) > 0 && right?.args[2] === 0);
  assert.ok((left?.args[1] as number) < 0 && left?.args[2] === 0);
  assert.equal(right?.textAlign, 'left', 'a name on the right starts beside its mark');
  assert.equal(left?.textAlign, 'right', 'a name on the left ends beside its mark, clear of it');
});

test('a water’s name and the ring round it are inked in its difficulty’s colour, the ring filled with parchment', () => {
  const { painter, calls } = recorder();
  const water = LETTERING.letters[3]!;
  paintLettering(painter, { width: 800, height: 500 }, { x: 0, y: 0 }, 1, {
    letters: [water],
    ship: null,
    key: null,
    scale: 1,
  });
  const ring = calls.findIndex((call) => call.name === 'arc');
  const fill = calls.findIndex((call, index) => index > ring && call.name === 'fill');
  const named = calls.findIndex((call) => call.name === 'fillText' && call.args[0] === water.text);
  assert.ok(ring >= 0 && fill > ring && named > fill, 'the ring is drawn and filled under the name');
  assert.equal(calls[named]?.fillStyle, water.colour);
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

test('every word reads at least 4.5 : 1 against the parchment it is haloed and ringed in', () => {
  // A water's ring is the parchment's colour at nine tenths over the darkest of the map's parchment.
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

test('a place the quest names is ringed round its mark', () => {
  const node = { text: 'Saltgrass Downs', x: 100, y: 100, kind: 'patrol', chosen: false, side: 'right' as const };
  const arcs = (quest: boolean) => {
    const { painter, calls } = recorder();
    const letters = [{ ...node, quest }];
    paintLettering(painter, { width: 800, height: 500 }, { x: 0, y: 0 }, 1, {
      letters,
      ship: null,
      key: null,
      scale: 1,
    });
    return calls.filter((call) => call.name === 'arc').map((call) => call.args[2] as number);
  };
  const [mark] = arcs(false);
  assert.equal(arcs(false).length, 1);
  assert.ok(mark !== undefined);
  assert.deepEqual(arcs(true).length, 2, 'its mark and the ring');
  assert.ok((arcs(true)[1] ?? 0) > mark, 'the ring round the mark');
});
