import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DROPPED, type GearDrop } from '../network/gearMessages.ts';
import { RARITIES } from '../player/gear.ts';
import { AMMO_BOX, AMMO_CRATE, type PixelPicture, VESTIGE_ROWS, resourcePicture } from './dropPictures.ts';
import { DropsShown, FLIGHT_S, LINE_M, PIXEL_M, RISE_S, flightAt, lineLight, markPicture, pictureOf } from './drops.ts';
import { MARK_FLOATS } from './marks.ts';

type Point = readonly [number, number, number];

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
  assert.ok(
    flying.marks.every((value, index) => index % MARK_FLOATS !== 6 || value === 1),
    'solid, and no line',
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
  const box = ammo.frame([drop({ kind: DROPPED.ammoBox })], FLIGHT_S, EYE);
  assert.deepEqual(box.rested, [], 'ammo never chimes');
  assert.deepEqual(box.landed, [drop({ kind: DROPPED.ammoBox }).at], 'but every drop is told of where it lands');
  assert.deepEqual(ammo.frame([drop({ kind: DROPPED.ammoBox })], FLIGHT_S + 1, EYE).landed, [], 'once');
});

test('an Ammo box at rest stepped onto at full ammunition is told once each time, never while standing on it', () => {
  const box = drop({ kind: DROPPED.ammoBox, flying: 0 });
  const [far, onBox, nearEdge, high] = [
    [0, -11, 0.5],
    [0.4, -8.2, 0.5],
    [1.4, -8, 0.5],
    [0, -8, 3],
  ] as const;
  const walk = (shown: DropsShown, steps: readonly (readonly [Point, boolean])[], drops = [box]) =>
    steps.map(([feet, full], step) => {
      shown.frame(drops, step / 60, EYE);
      return shown.ammoFull(drops, feet, full);
    });
  const full = (feet: Point) => [feet, true] as const;
  assert.deepEqual(
    walk(new DropsShown(), [far, onBox, onBox, nearEdge, far, onBox].map(full)),
    [false, true, false, false, false, true],
    'on stepping onto it, not while there, and again once stepped off and back',
  );
  assert.deepEqual(walk(new DropsShown(), [full(high)]), [false], 'not from a ledge over it');
  assert.deepEqual(walk(new DropsShown(), [[onBox, false]]), [false], 'not while it can be taken');
  assert.deepEqual(walk(new DropsShown(), [[onBox, false], full(onBox)]), [false, true], 'nor until it is full there');
  const flying = drop({ kind: DROPPED.ammoBox, flying: 36 });
  const steps = Array.from({ length: 40 }, () => full(onBox));
  assert.equal(walk(new DropsShown(), steps, [flying]).indexOf(true), 36, 'only once it rests');
  for (const kind of [DROPPED.vestige, DROPPED.crate])
    assert.deepEqual(walk(new DropsShown(), [full(onBox)], [drop({ kind, flying: 0 })]), [false], 'an Ammo box alone');
});

test('a line is brightest where it leaves the picture and none at its tip, a glint climbing it', () => {
  assert.ok(lineLight(0, 0) > lineLight(0.5, 0.25) && lineLight(1, 0) < 1e-5);
  const glint = (seconds: number) => lineLight(0.5, seconds);
  assert.ok(glint(0) > glint(0.5), 'the glint passes half way up once a second');
});

/** The colour seen over each cell of `picture` laid at the origin and seen from the south at its own foot: the
 *  nearest quad over the cell's middle, as its red, green and blue out of 255, or '.' for none. */
function seen(marks: readonly number[], picture: PixelPicture): string[][] {
  const quads = Array.from({ length: marks.length / (6 * MARK_FLOATS) }, (unused, quad) => {
    const along = (axis: number) =>
      Array.from({ length: 6 }, (unseen, nth) => marks[(quad * 6 + nth) * MARK_FLOATS + axis] ?? 0);
    const colour = [3, 4, 5].map((axis) => Math.round((along(axis)[0] ?? 0) * 255)).join();
    return { across: along(0), near: Math.min(...along(1)), up: along(2), colour };
  });
  const width = picture.rows[0]?.length ?? 0;
  return picture.rows.map((row, line) =>
    [...row].map((unused, column) => {
      // The eye looks north, so its right is the west.
      const east = -(column + 0.5 - width / 2) * PIXEL_M;
      const high = (picture.rows.length - line - 0.5) * PIXEL_M + 0.01;
      const inside = (values: readonly number[], value: number) =>
        Math.min(...values) < value && value < Math.max(...values);
      const over = quads.filter((quad) => inside(quad.across, east) && inside(quad.up, high));
      return over.sort((one, other) => one.near - other.near)[0]?.colour ?? '.';
    }),
  );
}

/** What `picture` shows at each cell, as `seen` reads it. */
const drawn = (picture: PixelPicture): string[][] =>
  picture.rows.map((row) =>
    [...row].map((letter) => {
      const hex = picture.colours['abcdef'.indexOf(letter)];
      if (!hex) return '.';
      const value = Number.parseInt(hex.slice(1), 16);
      return [value >> 16, (value >> 8) & 255, value & 255].join();
    }),
  );

test('a picture is laid in layers, each colour over those laid before it, in fewer quads, and reads as drawn', () => {
  const pictures = [pictureOf(drop({ rarity: 4 })), AMMO_BOX, AMMO_CRATE, resourcePicture(4)];
  for (const picture of pictures) {
    assert.ok(picture);
    const layered: number[] = [];
    markPicture(layered, picture, [0, 0, 0], [0, -5, 0]);
    assert.deepEqual(seen(layered, picture), drawn(picture));
    const flat: number[] = [];
    markPicture(flat, picture, [0, 0, 0], [0, -5, 0], 1, 0.5);
    assert.ok(layered.length < flat.length, `fewer quads than laid flat: ${layered.length} against ${flat.length}`);
  }
});

test('seen through, a picture is laid flat, every pixel once, so no colour shows through another', () => {
  const picture = pictureOf(drop({ rarity: 4 }));
  const flat: number[] = [];
  markPicture(flat, picture, [0, 0, 0], [0, -5, 0], 1, 0.5);
  const area = covered(flat);
  assert.ok(Math.abs(area - filled(VESTIGE_ROWS) * PIXEL_M ** 2) < 1e-6, `every pixel, none twice: ${area}`);
  assert.deepEqual(seen(flat, picture), drawn(picture));
});
