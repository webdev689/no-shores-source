import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARK_WORDS, paintLand } from './landLetters.ts';
import type { LandSheet } from './landSheet.ts';
import type { Painter } from './mapLetters.ts';

/** A 2D context that records what is painted, each word 6 pixels a letter wide. */
function recorder() {
  const calls: { name: string; args: unknown[] }[] = [];
  const state = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textBaseline: '',
    textAlign: '',
    lineJoin: '',
  };
  const painter = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      if (key === 'measureText') return (text: string) => ({ width: text.length * 6 });
      return (...args: unknown[]) => calls.push({ name: String(key), args });
    },
    set(target, key, value) {
      (target as Record<string, unknown>)[key as string] = value;
      return true;
    },
  }) as unknown as Painter;
  const texts = () => calls.filter((call) => call.name === 'fillText').map((call) => call.args[0]);
  return { painter, calls, texts };
}

const SHEET: LandSheet = {
  name: 'Overlook',
  origin: [1000, 2000],
  width: 400,
  height: 250,
  coast: [],
  relief: [],
  floors: [],
  walks: [],
  paths: [],
  standing: [],
  ring: [
    [10, 10],
    [390, 10],
    [390, 240],
  ],
  places: [{ name: 'Watch Court', at: [200, 120] }],
  marks: [
    { kind: 'vendor', at: [100, 100], name: 'The Mage' },
    // A keeper whose name would fall on the court's.
    { kind: 'vendor', at: [180, 125], name: 'Vault' },
    { kind: 'landing', at: [200, 200] },
    { kind: 'event', at: [300, 60] },
  ],
};

const paint = (sheet: LandSheet = SHEET) => {
  const recorded = recorder();
  const painting = { sheet, view: { left: 0, top: 0, scale: 2 }, ink: { width: 800, height: 500 }, scale: 1 };
  paintLand(recorded.painter, { width: 1000, height: 700 }, { x: 20, y: 30 }, 1, { ...painting, player: null });
  return recorded;
};

test('the land is named, its places and its keepers lettered, and its marks keyed', () => {
  const { texts } = paint();
  const words = texts();
  for (const word of ['Overlook', 'Watch Court', 'The Mage', MARK_WORDS.landing, MARK_WORDS.event])
    assert.ok(words.includes(word), `${word} in ${words.join(', ')}`);
  assert.ok(!words.includes(MARK_WORDS.gate), 'a kind of mark the land has none of is not keyed');
});

test("a keeper's name that would fall on a place's name is left off; their mark stays", () => {
  const { texts, calls } = paint();
  assert.ok(!texts().includes('Vault'));
  const coins = calls.filter((call) => call.name === 'arc' && call.args[2] === 3.5);
  assert.equal(coins.length, 2, 'both stalls are marked');
});

test('nothing is painted outside the map: the picture is cleared, then clipped to it', () => {
  const { calls } = paint();
  const names = calls.map((call) => call.name);
  assert.equal(names[1], 'clearRect');
  const clip = names.indexOf('clip');
  assert.ok(clip > 0 && clip < names.indexOf('fillText'));
  assert.deepEqual(calls[names.indexOf('rect')]?.args, [0, 0, 800, 500]);
});

test("the player's arrow stands where they do on the sheet", () => {
  const recorded = recorder();
  const painting = { sheet: SHEET, view: { left: 50, top: 0, scale: 2 }, ink: { width: 800, height: 500 }, scale: 1 };
  paintLand(recorded.painter, { width: 1000, height: 700 }, { x: 0, y: 0 }, 1, {
    ...painting,
    player: { at: [150, 40], heading: 0 },
  });
  const moves = recorded.calls.filter((call) => call.name === 'translate').map((call) => call.args);
  assert.ok(
    moves.some(([x, y]) => x === 200 && y === 80),
    JSON.stringify(moves),
  );
});
