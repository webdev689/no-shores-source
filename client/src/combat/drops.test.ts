import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DROPPED, type GearDrop } from '../network/gearMessages.ts';
import { RARITIES } from '../player/gear.ts';
import { AMMO_BOX, AMMO_CRATE, VESTIGE_ROWS } from './dropPictures.ts';
import { DropsShown, FLIGHT_S, LINE_M, PIXEL_M, RISE_S, flightAt, lineLight, pictureOf } from './drops.ts';
import { MARK_FLOATS } from './marks.ts';

const FROM = [0, -10, 0] as const;
const REST = [0, -8, 0.5] as const;
const EYE = [0, 0, 1.6] as const;

const drop = (fields: Partial<GearDrop>): GearDrop => ({
  id: 1,
  rarity: 0,
  slot: 0,
  at: REST,
  kind: DROPPED.vestige,
  from: FROM,
  flying: 36,
  ...fields,
});

/** How many pixels a picture fills. */
const filled = (rows: readonly string[]) => rows.join('').replaceAll('.', '').length;

/** The area mark triangles cover, square metres. */
function covered(marks: readonly number[]): number {
  let area = 0;
  for (let start = 0; start + 3 * MARK_FLOATS <= marks.length; start += 3 * MARK_FLOATS) {
    const value = (vertex: number, axis: number) => marks[start + vertex * MARK_FLOATS + axis] ?? 0;
    const [first, second] = [1, 2].map((vertex) => [0, 1, 2].map((axis) => value(vertex, axis) - value(0, axis)));
    const [east = 0, south = 0, up = 0] = first ?? [];
    const [east2 = 0, south2 = 0, up2 = 0] = second ?? [];
    area += Math.hypot(south * up2 - up * south2, up * east2 - east * up2, east * south2 - south * east2) / 2;
  }
  return area;
}

test('a drop leaves the body high, arcs up, bounces twice and rests where the room threw it in about 0.6 s', () => {
  const start = flightAt(FROM, REST, 0);
  assert.ok(Math.abs(start.at[2] - 0.8) < 1e-9 && !start.resting, 'it leaves from the body, 0.8 m up');
  const level = [0, -8, 0] as const;
  const heights = Array.from({ length: 120 }, (unused, step) => flightAt(FROM, level, (step / 120) * FLIGHT_S).at[2]);
  assert.ok(Math.max(...heights) > 1.2, 'its first arc rises over where it left');
  const touches = heights.filter(
    (height, step) => step > 0 && height < (heights[step - 1] ?? 0) && height <= (heights[step + 1] ?? Infinity),
  );
  assert.equal(touches.length, 3, 'it comes down, bounces twice and lands');
  const rest = flightAt(FROM, REST, FLIGHT_S);
  assert.deepEqual([rest.at, rest.resting], [REST, true]);
  const late = flightAt(FROM, REST, FLIGHT_S - 0.01);
  assert.ok(!late.resting && Math.hypot(late.at[0] - REST[0], late.at[1] - REST[1]) < 0.05, 'it settles onto it');
  let last = -Infinity;
  for (let step = 0; step <= 30; step += 1) {
    const along = flightAt(FROM, REST, (step / 30) * FLIGHT_S).at[1];
    assert.ok(along >= last - 1e-9, 'it never flies back toward the body');
    last = along;
  }
});

test('each drop stands as its own picture: a Vestige in its rarity, an Ammo box and an Ammo crate', () => {
  assert.equal(pictureOf(drop({ rarity: 3 })).colours[2], RARITIES[3].colour);
  assert.equal(pictureOf(drop({ kind: DROPPED.ammoBox })), AMMO_BOX);
  assert.equal(pictureOf(drop({ kind: DROPPED.crate })), AMMO_CRATE);
  for (const rows of [VESTIGE_ROWS, AMMO_BOX.rows, AMMO_CRATE.rows]) {
    assert.equal(rows.length, 12);
    for (const row of rows) assert.equal(row.length, 12);
  }
});

test('in flight a drop is its picture alone; at rest its line rises, a rarer one taller, ammo white', () => {
  const shown = new DropsShown();
  const flying = shown.frame([drop({ rarity: 4 })], 10, EYE);
  const pixels = flying.marks.length;
  assert.ok(pixels < filled(VESTIGE_ROWS) * 6 * MARK_FLOATS, 'its runs of one colour, fewer quads than pixels');
  const area = covered(flying.marks);
  assert.ok(
    Math.abs(area - filled(VESTIGE_ROWS) * PIXEL_M ** 2) < 1e-6,
    `every pixel, none twice and no line: ${area}`,
  );
  const rested = shown.frame([drop({ rarity: 4 })], 10 + FLIGHT_S + RISE_S, EYE);
  assert.equal(rested.marks.length - pixels, 12 * 2 * 6 * MARK_FLOATS, 'the line in twelve steps, either side');
  const line = rested.marks.slice(pixels);
  const tops = Array.from({ length: line.length / MARK_FLOATS }, (unused, vertex) => line[vertex * MARK_FLOATS + 2]);
  const crown = REST[2] + 12 * PIXEL_M + 0.01;
  assert.ok(Math.abs(Math.max(...(tops as number[])) - (crown + LINE_M[4])) < 1e-9, "an Atheric's 2.5 m");
  assert.equal(line[6], -1, 'its light is added to what stands behind');
  const ammo = new DropsShown().frame([drop({ kind: DROPPED.ammoBox, flying: 0 })], 0, EYE).marks;
  const box = new DropsShown().frame([drop({ kind: DROPPED.ammoBox })], 0, EYE).marks.length;
  const light = ammo.slice(box);
  const lit = Array.from({ length: light.length / MARK_FLOATS }, (unused, vertex) =>
    light.slice(vertex * MARK_FLOATS + 3, vertex * MARK_FLOATS + 6),
  ).filter(([red = 0]) => red > 0);
  assert.ok(lit.length > 0 && lit.every(([red, green, blue]) => red === green && green === blue), 'white');
});

test('a Vestige chimes by its rarity as it comes to rest, once; one told of at rest flies and chimes no more', () => {
  const shown = new DropsShown();
  assert.deepEqual(shown.frame([drop({ rarity: 2 })], 0, EYE).rested, []);
  assert.deepEqual(shown.frame([drop({ rarity: 2 })], FLIGHT_S, EYE).rested, [2]);
  assert.deepEqual(shown.frame([drop({ rarity: 2 })], FLIGHT_S + 1, EYE).rested, []);
  const late = new DropsShown();
  assert.deepEqual(late.frame([drop({ id: 9, rarity: 4, flying: 0 })], 0, EYE).rested, []);
  const ammo = new DropsShown();
  ammo.frame([drop({ kind: DROPPED.ammoBox })], 0, EYE);
  assert.deepEqual(ammo.frame([drop({ kind: DROPPED.ammoBox })], FLIGHT_S, EYE).rested, [], 'ammo never chimes');
});

test('a line is brightest where it leaves the picture and none at its tip, a glint climbing it', () => {
  assert.ok(lineLight(0, 0) > lineLight(0.5, 0.25) && lineLight(1, 0) < 1e-5);
  const glint = (seconds: number) => lineLight(0.5, seconds);
  assert.ok(glint(0) > glint(0.5), 'the glint passes half way up once a second');
});
