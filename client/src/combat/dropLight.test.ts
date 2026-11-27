import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AMMO_PILLAR_M,
  BURST_S,
  PILLAR_M,
  cellAt,
  glowPulse,
  glowReach,
  markBurst,
  markGlow,
  markMotes,
  markPillar,
  moteAt,
  pillarPulse,
} from './dropLight.ts';
import { MARK_FLOATS } from './marks.ts';
import { CELL_M } from './spellPixels.ts';

type Point = readonly [number, number, number];

const EYE: Point = [0, -6, 1.6];
const RED = [1, 0.4, 0.35] as const;

/** Each vertex of `marks` as its place, its colour and its opacity. */
const vertices = (marks: readonly number[]) =>
  Array.from({ length: marks.length / MARK_FLOATS }, (unused, nth) => {
    const start = nth * MARK_FLOATS;
    return {
      place: [marks[start] ?? 0, marks[start + 1] ?? 0, marks[start + 2] ?? 0] as const,
      colour: [marks[start + 3] ?? 0, marks[start + 4] ?? 0, marks[start + 5] ?? 0] as const,
      opacity: marks[start + 6] ?? 0,
    };
  });

test('a pillar stands its whole height in light added, in flat cells, brightest at its root', () => {
  const out: number[] = [];
  markPillar(out, [0, 0, 1], 9, RED, 1, 0, EYE);
  const laid = vertices(out);
  assert.ok(laid.length > 0 && laid.length % 6 === 0);
  assert.ok(
    laid.every((one) => one.opacity === -1),
    'all light added',
  );
  const heights = laid.map((one) => one.place[2]);
  assert.ok(Math.abs(Math.min(...heights) - 1) < 1e-9 && Math.abs(Math.max(...heights) - 10) < 1e-9, 'its 9 m');
  // Each quad is one colour, as a cell is: no colour blended across it.
  for (let quad = 0; quad < laid.length; quad += 6) {
    const first = laid[quad]?.colour.join();
    for (let corner = 1; corner < 6; corner += 1) assert.equal(laid[quad + corner]?.colour.join(), first);
  }
  const lightAt = (low: number, high: number) =>
    Math.max(...laid.filter((one) => one.place[2] >= low && one.place[2] <= high).map((one) => one.colour[0]));
  assert.ok(lightAt(1, 2) > lightAt(8, 10), 'it fades toward its top');
  const across = laid.map((one) => one.place[0]);
  const wide = Math.max(...across) - Math.min(...across);
  assert.ok(Math.abs(wide / cellAt(EYE, [0, 0, 1]) - Math.round(wide / cellAt(EYE, [0, 0, 1]))) < 1e-6, 'in cells');
});

test('a pillar is short, about a third of what it was: the rarer the taller, ammunition the shortest', () => {
  assert.deepEqual(PILLAR_M, [1.4, 2, 3, 4.5, 4.5]);
  assert.equal(AMMO_PILLAR_M, 0.6);
});

test('a pillar has no flat end: its foot fades in, and its top tapers to a point as it fades out', () => {
  const out: number[] = [];
  const [root, height] = [1, 3] as const;
  markPillar(out, [0, 0, root], height, RED, 1, 0, EYE);
  const laid = vertices(out);
  const cell = cellAt(EYE, [0, 0, root]);
  // Each band of the pillar by its share of the way up: its width across and its brightest light.
  const band = (share: number) => {
    const level = root + share * height;
    const near = laid.filter((one) => Math.abs(one.place[2] - level) < height / 48);
    const across = near.map((one) => one.place[0]);
    return { wide: Math.max(...across) - Math.min(...across), light: Math.max(...near.map((one) => one.colour[0])) };
  };
  // Its light steps through a few stops, so neighbouring bands may share one.
  assert.ok(band(0.01).light < band(0.12).light && band(0.12).light <= band(0.3).light, 'its foot fades in');
  assert.ok(band(0.01).light > 0, 'from the glow, not from nothing');
  assert.ok(band(0.5).wide > band(0.8).wide && band(0.8).wide > band(0.99).wide, 'its top narrows cell by cell');
  assert.ok(band(0.99).wide <= 2 * cell + 1e-9, 'to a point a cell or two wide');
  assert.ok(band(0.5).light > band(0.8).light && band(0.8).light >= band(0.99).light, 'and fades out');
});

test("an item's glow is its own up close, and reaches a few pixels past its picture far off", () => {
  const long = 1.4;
  assert.equal(glowReach(long, [0, 0, 1], EYE), 0, 'up close its own glow, no larger than its picture');
  const reaches = [2, 6, 10, 20].map((far) => glowReach(long, [0, far, 1], EYE));
  assert.ok(
    reaches.every((reach, nth) => nth === 0 || reach > (reaches[nth - 1] ?? 0)),
    'growing, never jumping',
  );
  for (const far of [30, 60, 120]) {
    const past = glowReach(long, [0, far, 1], EYE) - long / 2;
    // Far off a cell is about a pixel of the view.
    assert.ok(past >= 2 * cellAt(EYE, [0, far, 1]), `${far} m: ${past} m past`);
  }
});

test('a pillar is seen from far off: its cells grow with the distance, never smaller than an effect’s', () => {
  assert.equal(cellAt(EYE, [0, -4, 1.6]), CELL_M);
  assert.ok(cellAt(EYE, [0, 300, 1.6]) > 5 * CELL_M);
});

test('the rarer pillar is taller, a Legendary’s and an Atheric’s the tallest and pulsing; ammunition’s short', () => {
  for (let rarity = 1; rarity < PILLAR_M.length; rarity += 1)
    assert.ok((PILLAR_M[rarity] ?? 0) >= (PILLAR_M[rarity - 1] ?? 0));
  assert.equal(PILLAR_M[3], Math.max(...PILLAR_M));
  assert.equal(PILLAR_M[4], Math.max(...PILLAR_M));
  assert.ok(PILLAR_M[2] < PILLAR_M[3], 'a Rare’s shorter');
  assert.ok(AMMO_PILLAR_M < PILLAR_M[0]);
  const range = (rarity: number | null) => {
    const each = Array.from({ length: 40 }, (unused, step) => pillarPulse(rarity, step / 40, false));
    return Math.max(...each) - Math.min(...each);
  };
  assert.ok(range(3) > 0.2 && range(4) > 0.2, 'they pulse');
  assert.equal(range(2), 0);
  assert.equal(range(null), 0);
  assert.equal(pillarPulse(3, 0.25, true), 1, 'still with motion reduced');
});

test('a drop lands in a flash and a ring on the ground in its colour; reduced motion keeps the flash alone', () => {
  const ground: Point = [2, 3, 0.5];
  const middle: Point = [2, 3, 1.3];
  const burst = (since: number, still: boolean) => {
    const out: number[] = [];
    markBurst(out, { ground, middle, colour: RED, ring: 1.5, since, still }, EYE);
    return vertices(out);
  };
  const early = burst(0.15, false);
  assert.ok(early.length > 0 && early.every((one) => one.opacity === -1), 'light added');
  const onGround = early.filter((one) => Math.abs(one.place[2] - ground[2]) < 0.05);
  assert.ok(onGround.length > 0, 'a ring on the ground');
  assert.ok(
    onGround.some((one) => one.colour[0] > one.colour[1] * 2),
    'in its colour',
  );
  const radius = (laid: typeof early) =>
    Math.max(...laid.map((one) => Math.hypot(one.place[0] - ground[0], one.place[1] - ground[1])));
  const later = burst(0.4, false).filter((one) => Math.abs(one.place[2] - ground[2]) < 0.05);
  assert.ok(radius(later) > radius(onGround), 'spreading');
  assert.ok(
    early.some((one) => one.place[2] > ground[2] + 0.3),
    'and a flash at the drop',
  );
  assert.equal(burst(BURST_S + 0.01, false).length, 0, 'then gone');
  const still = burst(0.15, true);
  assert.ok(still.length > 0 && still.every((one) => one.place[2] > ground[2] + 0.3), 'no ring, the flash alone');
});

test('a drop glows about its picture in its colour, pulsing slowly, steady with motion reduced', () => {
  const out: number[] = [];
  markGlow(out, [0, 0, 1], 0.6, RED, 1, EYE);
  const laid = vertices(out);
  assert.ok(laid.length > 0 && laid.every((one) => one.opacity === -1));
  const across = laid.map((one) => one.place[0]);
  assert.ok(Math.max(...across) > 0.5 && Math.min(...across) < -0.5, 'about the picture');
  const middle = laid.filter((one) => Math.abs(one.place[0]) < 0.1 && Math.abs(one.place[2] - 1) < 0.1);
  const rim = laid.filter((one) => Math.abs(one.place[0]) > 0.45);
  assert.ok(
    Math.max(...middle.map((one) => one.colour[0])) > Math.max(...rim.map((one) => one.colour[0])),
    'soft: brightest at its heart',
  );
  const pulses = Array.from({ length: 40 }, (unused, step) => glowPulse(step / 10, false));
  assert.ok(Math.max(...pulses) - Math.min(...pulses) > 0.1, 'pulsing');
  assert.ok(Math.max(...pulses) <= 1 + 1e-9);
  assert.equal(new Set(Array.from({ length: 40 }, (unused, step) => glowPulse(step / 10, true))).size, 1, 'steady');
});

test('motes drift up from a drop and fade, each its own way; each a cell of light added', () => {
  const rises = Array.from({ length: 6 }, (unused, nth) => {
    const [, , low] = moteAt(5, nth, 0.31);
    const [, , high] = moteAt(5, nth, 0.31 + 0.2);
    return high - low;
  });
  assert.ok(rises.filter((rise) => rise > 0).length >= 4, `rising: ${rises.join()}`);
  assert.notDeepEqual(moteAt(5, 0, 1), moteAt(5, 1, 1), 'each its own');
  const out: number[] = [];
  markMotes(out, { middle: [0, 0, 1], spread: 0.4, colour: RED, count: 6, seed: 5 }, 1, EYE);
  const laid = vertices(out);
  assert.ok(laid.length > 0 && laid.length <= 6 * 6, 'at most a quad a mote');
  assert.ok(laid.every((one) => one.opacity === -1));
});
