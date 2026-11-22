import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DROPPED, type GearDrop } from '../network/gearMessages.ts';
import { AMMO_BOX, AMMO_CRATE } from './dropPictures.ts';
import {
  AMMO_FEEL,
  CRYSTAL_FEEL,
  DropsShown,
  LINE_M,
  PIXEL_M,
  REST_S,
  RISE_S,
  arcsOf,
  lineLight,
  motionAt,
  pictureOf,
} from './drops.ts';
import { MARK_FLOATS } from './marks.ts';
import { CROWN_M, SPIN_FRAMES, crystalStill } from './vestigeCrystal.ts';

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
  flying: 94,
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

test('a drop pops out of the body, bounces until it settles where the room threw it, then hovers, bobbing', () => {
  const thrown = (seconds: number) => motionAt(CRYSTAL_FEEL, FROM, REST, 3, seconds);
  assert.ok(Math.abs(thrown(0).middle[2] - 1.1) < 1e-9 && !thrown(0).settled, 'it leaves the body 1.1 m up');
  const flight = arcsOf(CRYSTAL_FEEL, CRYSTAL_FEEL.pop, 1).length;
  assert.ok(flight >= 3, 'it comes down and bounces at least twice');
  const steps = Array.from({ length: 200 }, (unused, step) => thrown((step / 200) * REST_S));
  assert.ok(Math.max(...steps.map((each) => each.middle[2])) > 1.5, 'it pops up over where it left');
  const settled = steps.findIndex((each) => each.settled);
  assert.ok(settled > 0, 'it settles within the time the room gives it');
  const landed = steps[settled]?.middle ?? [0, 0, 0];
  assert.ok(Math.hypot(landed[0] - REST[0], landed[1] - REST[1]) < 1e-9, "on the room's spot");
  assert.ok(Math.abs(landed[2] - (REST[2] + 0.18)) < 0.01, 'low over the ground');
  let last = -Infinity;
  for (const each of steps) {
    assert.ok(each.middle[1] >= last - 1e-9, 'it never flies back toward the body');
    last = each.middle[1];
  }
  const hovering = Array.from({ length: 100 }, (unused, step) => thrown(REST_S + 1 + step / 20).middle[2] - REST[2]);
  assert.ok(Math.min(...hovering) >= 0.42 - 0.05 - 1e-9 && Math.max(...hovering) <= 0.42 + 0.05 + 1e-9, 'hovering');
  assert.ok(Math.max(...hovering) - Math.min(...hovering) > 0.08, 'and bobbing');
  const turned = (from: number) => thrown(from + 0.1).turn - thrown(from).turn;
  assert.ok(turned(0.1) > turned(REST_S + 1) * 2, 'it turns fast in the air and slowly at rest');
});

test('the room waits for the longest a drop can bounce, and no longer', () => {
  for (const feel of [CRYSTAL_FEEL, AMMO_FEEL]) {
    // Its highest pop, from a body a step over where it lands.
    const longest = arcsOf(feel, feel.pop + feel.popMore, feel.leaves - feel.low + 0.5).reduce((sum, arc) => sum + arc);
    assert.ok(longest <= REST_S, `${longest} s`);
    if (feel === CRYSTAL_FEEL) assert.ok(longest > REST_S - 1 / 60, 'the crystal sets it');
  }
});

test('a Vestige is its crystal, turning through its frames, in its rarity; ammunition is its picture', () => {
  const frames = new Set(
    Array.from(
      { length: SPIN_FRAMES },
      (unused, frame) => pictureOf(drop({ rarity: 1 }), (frame + 0.5) * ((2 * Math.PI) / SPIN_FRAMES)).body,
    ),
  );
  assert.equal(frames.size, SPIN_FRAMES, 'one picture a frame');
  assert.equal(pictureOf(drop({}), 2 * Math.PI).body, pictureOf(drop({}), 0).body, 'round once and back');
  const mostly = (rarity: number) => {
    const still = crystalStill(rarity);
    const counts = still.colours.map(
      (unused, index) => still.rows.join('').split(String.fromCharCode(97 + index)).length,
    );
    const colour = still.colours[counts.indexOf(Math.max(...counts))] ?? '#000000';
    return [1, 3, 5].map((start) => Number.parseInt(colour.slice(start, start + 2), 16));
  };
  const [red = 0, green = 0, blue = 0] = mostly(1);
  assert.ok(green > red && green > blue, 'Magic green');
  const [yellowRed = 0, yellowGreen = 0, yellowBlue = 0] = mostly(2);
  assert.ok(yellowRed > yellowBlue && yellowGreen > yellowBlue, 'Rare yellow');
  const [legendRed = 0, legendGreen = 0] = mostly(3);
  assert.ok(legendRed > legendGreen * 2, 'Legendary red');
  assert.deepEqual(pictureOf(drop({ kind: DROPPED.ammoBox })), { body: AMMO_BOX, halo: null });
  assert.deepEqual(pictureOf(drop({ kind: DROPPED.crate })), { body: AMMO_CRATE, halo: null });
  for (const rows of [AMMO_BOX.rows, AMMO_CRATE.rows]) {
    assert.equal(rows.length, 12);
    for (const row of rows) assert.equal(row.length, 12);
  }
});

test('in flight a drop is its picture alone; at rest its line rises, a rarer one taller, ammo white', () => {
  const boxFlying = new DropsShown().frame([drop({ kind: DROPPED.ammoBox })], 10, EYE).marks;
  assert.ok(
    boxFlying.length < filled(AMMO_BOX.rows) * 6 * MARK_FLOATS,
    'its runs of one colour, fewer quads than pixels',
  );
  const area = covered(boxFlying);
  assert.ok(
    Math.abs(area - filled(AMMO_BOX.rows) * PIXEL_M ** 2) < 1e-6,
    `every pixel, none twice and no line: ${area}`,
  );
  const shown = new DropsShown();
  const flying = shown.frame([drop({ rarity: 4 })], 10, EYE).marks;
  const opacities = new Set(
    Array.from({ length: flying.length / MARK_FLOATS }, (unused, vertex) => flying[vertex * MARK_FLOATS + 6]),
  );
  assert.deepEqual([...opacities].sort(), [-1, 1], 'the gem solid, its halo light added');
  const rested = shown.frame([drop({ rarity: 4 })], 10 + REST_S + RISE_S, EYE).marks;
  const line = rested.slice(rested.length - 12 * 2 * 6 * MARK_FLOATS);
  const heights = Array.from(
    { length: line.length / MARK_FLOATS },
    (unused, vertex) => line[vertex * MARK_FLOATS + 2] ?? 0,
  );
  const [root, top] = [Math.min(...heights), Math.max(...heights)];
  assert.ok(Math.abs(top - root - LINE_M[4]) < 1e-9, "an Atheric's 2.5 m");
  const crown = REST[2] + 0.42 + CROWN_M + 0.01;
  assert.ok(Math.abs(root - crown) <= 0.05 + 1e-9, "rising from the hovering crystal's crown");
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
  assert.deepEqual(shown.frame([drop({ rarity: 2 })], REST_S, EYE).rested, [2]);
  assert.deepEqual(shown.frame([drop({ rarity: 2 })], REST_S + 1, EYE).rested, []);
  const late = new DropsShown();
  assert.deepEqual(late.frame([drop({ id: 9, rarity: 4, flying: 0 })], 0, EYE).rested, []);
  const ammo = new DropsShown();
  ammo.frame([drop({ kind: DROPPED.ammoBox })], 0, EYE);
  const box = ammo.frame([drop({ kind: DROPPED.ammoBox })], REST_S, EYE);
  assert.deepEqual(box.rested, [], 'ammo never chimes');
  assert.deepEqual(box.landed, [drop({ kind: DROPPED.ammoBox }).at], 'but every drop is told of where it lands');
  assert.deepEqual(ammo.frame([drop({ kind: DROPPED.ammoBox })], REST_S + 1, EYE).landed, [], 'once');
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
  const steps = Array.from({ length: 100 }, () => full(onBox));
  const told = walk(new DropsShown(), steps, [drop({ kind: DROPPED.ammoBox })]).indexOf(true);
  assert.ok(told > 20 && told <= 94, `only once it settles, by the time the room lets it be taken: ${told}`);
  for (const kind of [DROPPED.vestige, DROPPED.crate])
    assert.deepEqual(walk(new DropsShown(), [full(onBox)], [drop({ kind, flying: 0 })]), [false], 'an Ammo box alone');
});

test('a line is brightest where it leaves the picture and none at its tip, a glint climbing it', () => {
  assert.ok(lineLight(0, 0) > lineLight(0.5, 0.25) && lineLight(1, 0) < 1e-5);
  const glint = (seconds: number) => lineLight(0.5, seconds);
  assert.ok(glint(0) > glint(0.5), 'the glint passes half way up once a second');
});
